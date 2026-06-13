import sys
import tempfile
import types
import unittest
from pathlib import Path

fake_kiteconnect = types.ModuleType("kiteconnect")


class DummyKiteConnect:
    def __init__(self, api_key: str) -> None:
        self.api_key = api_key


fake_kiteconnect.KiteConnect = DummyKiteConnect
fake_kiteconnect.KiteTicker = type("DummyKiteTicker", (), {})
sys.modules.setdefault("kiteconnect", fake_kiteconnect)

from zerodha_app.callback_server import CallbackBridge
from zerodha_app.config import Settings


def _make_settings(temp_dir: str, callback_url: str | None = "http://127.0.0.1:8765/callback") -> Settings:
    return Settings(
        api_key="key",
        api_secret="secret",
        token_cache_path=Path(temp_dir) / "tokens.json",
        watchlist_path=Path(temp_dir) / "watchlist.json",
        login_callback_url=callback_url,
    )


class CallbackBridgeTests(unittest.TestCase):
    def test_success_exchanges_token_and_redirects_to_dashboard(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            exchanged: list[str] = []

            def creator(request_token: str) -> str:
                exchanged.append(request_token)
                return "access-123"

            bridge = CallbackBridge(
                _make_settings(temp_dir),
                "http://127.0.0.1:5173",
                session_creator=creator,
            )

            location = bridge.resolve_redirect("req-token-abc")

            self.assertEqual(exchanged, ["req-token-abc"])
            self.assertEqual(location, "http://127.0.0.1:5173/?auth=success")

    def test_missing_request_token_redirects_to_error_without_exchange(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            calls: list[str] = []
            bridge = CallbackBridge(
                _make_settings(temp_dir),
                "http://127.0.0.1:5173",
                session_creator=lambda rt: calls.append(rt) or "tok",
            )

            location = bridge.resolve_redirect("")

            self.assertEqual(calls, [])
            self.assertEqual(location, "http://127.0.0.1:5173/?auth=error")

    def test_exchange_failure_redirects_to_error_with_reason(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            def creator(request_token: str) -> str:
                raise ValueError("bad token")

            bridge = CallbackBridge(
                _make_settings(temp_dir),
                "http://127.0.0.1:5173",
                session_creator=creator,
            )

            location = bridge.resolve_redirect("req-token-abc")

            self.assertTrue(location.startswith("http://127.0.0.1:5173/?auth=error&reason="))
            self.assertIn("bad token", location)

    def test_trailing_slash_in_frontend_url_is_normalized(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            bridge = CallbackBridge(
                _make_settings(temp_dir),
                "http://127.0.0.1:5173/",
                session_creator=lambda rt: "tok",
            )

            self.assertEqual(
                bridge.resolve_redirect("abc"),
                "http://127.0.0.1:5173/?auth=success",
            )

    def test_host_port_parsed_from_callback_url(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            bridge = CallbackBridge(_make_settings(temp_dir), session_creator=lambda rt: "tok")
            self.assertEqual(bridge._callback_host_port(), ("127.0.0.1", 8765))

    def test_missing_callback_url_raises(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            bridge = CallbackBridge(
                _make_settings(temp_dir, callback_url=None),
                session_creator=lambda rt: "tok",
            )
            with self.assertRaisesRegex(ValueError, "ZERODHA_LOGIN_CALLBACK_URL"):
                bridge._callback_host_port()


if __name__ == "__main__":
    unittest.main()
