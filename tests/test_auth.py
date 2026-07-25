import sys
import tempfile
import types
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

fake_kiteconnect = types.ModuleType("kiteconnect")


class DummyKiteConnect:
    def __init__(self, api_key: str) -> None:
        self.api_key = api_key


fake_kiteconnect.KiteConnect = DummyKiteConnect
fake_kiteconnect.KiteTicker = type("DummyKiteTicker", (), {})
sys.modules.setdefault("kiteconnect", fake_kiteconnect)

from zerodha_app.auth import AuthManager
from zerodha_app.config import Settings


class AuthManagerTests(unittest.TestCase):
    def test_reads_string_token_cache_as_today_token(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            cache_path = Path(temp_dir) / "tokens.json"
            cache_path.write_text('"abc123"')
            settings = Settings(
                api_key="key",
                api_secret="secret",
                token_cache_path=cache_path,
                watchlist_path=Path(temp_dir) / "watchlist.json",
            )

            with patch("zerodha_app.auth.KiteConnect"):
                manager = AuthManager(settings)

            self.assertEqual(
                manager.get_cached_access_token(target_date=date(2026, 5, 8)), "abc123"
            )

    def test_rejects_invalid_token_cache_json(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            cache_path = Path(temp_dir) / "tokens.json"
            cache_path.write_text("{bad json")
            settings = Settings(
                api_key="key",
                api_secret="secret",
                token_cache_path=cache_path,
                watchlist_path=Path(temp_dir) / "watchlist.json",
            )

            with patch("zerodha_app.auth.KiteConnect"):
                manager = AuthManager(settings)

            with self.assertRaisesRegex(ValueError, "Invalid token cache JSON"):
                manager.get_cached_access_token()

    def test_extracts_request_token_from_full_redirect_url(self) -> None:
        self.assertEqual(
            AuthManager._extract_request_token(
                "http://127.0.0.1:8765/callback?request_token=req123&action=login&status=success"
            ),
            "req123",
        )

    def test_extract_request_token_returns_raw_token_when_not_url(self) -> None:
        self.assertEqual(AuthManager._extract_request_token("plain-token"), "plain-token")

    def test_get_access_token_can_offer_interactive_login(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            settings = Settings(
                api_key="key",
                api_secret="secret",
                token_cache_path=Path(temp_dir) / "tokens.json",
                watchlist_path=Path(temp_dir) / "watchlist.json",
            )

            with patch("zerodha_app.auth.KiteConnect"):
                manager = AuthManager(settings)

            with (
                patch("zerodha_app.auth.AuthManager._should_offer_interactive_login", return_value=True),
                patch("builtins.input", return_value="y"),
                patch.object(manager, "interactive_login", return_value="fresh-token") as interactive_login,
            ):
                token = manager.get_access_token()

            self.assertEqual(token, "fresh-token")
            interactive_login.assert_called_once()

    def test_get_access_token_raises_when_prompt_declined(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            settings = Settings(
                api_key="key",
                api_secret="secret",
                token_cache_path=Path(temp_dir) / "tokens.json",
                watchlist_path=Path(temp_dir) / "watchlist.json",
            )

            with patch("zerodha_app.auth.KiteConnect"):
                manager = AuthManager(settings)

            with (
                patch("zerodha_app.auth.AuthManager._should_offer_interactive_login", return_value=True),
                patch("builtins.input", return_value="n"),
            ):
                with self.assertRaisesRegex(ValueError, "Run `python run.py login` first"):
                    manager.get_access_token()

    def test_create_session_rejects_mismatched_user(self) -> None:
        """A reconnect that lands on a different Zerodha user writes nothing."""
        with tempfile.TemporaryDirectory() as temp_dir:
            cache_path = Path(temp_dir) / "tokens.json"
            settings = Settings(
                api_key="key",
                api_secret="secret",
                token_cache_path=cache_path,
                watchlist_path=Path(temp_dir) / "watchlist.json",
            )
            with patch("zerodha_app.auth.KiteConnect"):
                manager = AuthManager(settings)
            # The Kite login came back as a DIFFERENT account than expected.
            manager.kite.generate_session = lambda **_: {
                "access_token": "tok",
                "user_id": "MKQ150",
                "user_name": "Someone Else",
            }

            with self.assertRaisesRegex(ValueError, "but this account is UU2297"):
                manager.create_session_detailed("req", expected_user_id="UU2297")

            # Nothing was persisted for the wrong user.
            self.assertFalse(cache_path.exists())

    def test_create_session_accepts_matching_user(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            cache_path = Path(temp_dir) / "tokens.json"
            settings = Settings(
                api_key="key",
                api_secret="secret",
                token_cache_path=cache_path,
                watchlist_path=Path(temp_dir) / "watchlist.json",
            )
            with patch("zerodha_app.auth.KiteConnect"):
                manager = AuthManager(settings)
            manager.kite.generate_session = lambda **_: {
                "access_token": "tok",
                "user_id": "UU2297",
                "user_name": "ASN Crest",
            }
            manager.kite.set_access_token = lambda _t: None

            access_token, user_id, _ = manager.create_session_detailed(
                "req", expected_user_id="UU2297"
            )
            self.assertEqual(access_token, "tok")
            self.assertEqual(user_id, "UU2297")
            self.assertEqual(manager.get_cached_access_token("UU2297"), "tok")


if __name__ == "__main__":
    unittest.main()
