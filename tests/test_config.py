import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from zerodha_app.config import Settings, load_settings, load_watchlist


class LoadWatchlistTests(unittest.TestCase):
    def test_load_settings_requires_environment_credentials(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, "ZERODHA_API_KEY"):
                load_settings()

    def test_reads_watchlist_from_json_object(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            watchlist_path = Path(temp_dir) / "watchlist.json"
            watchlist_path.write_text('{"738561": "RELIANCE", "5633": "ACC"}')
            settings = Settings(
                api_key="key",
                api_secret="secret",
                token_cache_path=Path(temp_dir) / "tokens.json",
                watchlist_path=watchlist_path,
            )

            result = load_watchlist(settings)

        self.assertEqual(result, {738561: "RELIANCE", 5633: "ACC"})

    def test_reads_watchlist_from_env_pairs(self) -> None:
        settings = Settings(
            api_key="key",
            api_secret="secret",
            token_cache_path=Path("tokens.json"),
            watchlist_path=Path("watchlist.json"),
        )

        with patch.dict(os.environ, {"ZERODHA_WATCHLIST": "738561:RELIANCE,5633:ACC"}):
            result = load_watchlist(settings)

        self.assertEqual(result, {738561: "RELIANCE", 5633: "ACC"})

    def test_rejects_invalid_env_pairs(self) -> None:
        settings = Settings(
            api_key="key",
            api_secret="secret",
            token_cache_path=Path("tokens.json"),
            watchlist_path=Path("watchlist.json"),
        )

        with patch.dict(os.environ, {"ZERODHA_WATCHLIST": "738561-RELIANCE"}):
            with self.assertRaisesRegex(ValueError, "token:symbol"):
                load_watchlist(settings)

    def test_rejects_invalid_watchlist_json(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            watchlist_path = Path(temp_dir) / "watchlist.json"
            watchlist_path.write_text("{bad json")
            settings = Settings(
                api_key="key",
                api_secret="secret",
                token_cache_path=Path(temp_dir) / "tokens.json",
                watchlist_path=watchlist_path,
            )

            with self.assertRaisesRegex(ValueError, "Invalid JSON"):
                load_watchlist(settings)


if __name__ == "__main__":
    unittest.main()
