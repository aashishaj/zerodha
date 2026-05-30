import sys
import types
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

fake_kiteconnect = types.ModuleType("kiteconnect")


class PlaceholderKiteTicker:
    MODE_LTP = "MODE_LTP"
    MODE_QUOTE = "MODE_QUOTE"
    MODE_FULL = "MODE_FULL"


fake_kiteconnect.KiteTicker = PlaceholderKiteTicker
sys.modules.setdefault("kiteconnect", fake_kiteconnect)

from zerodha_app.streamer import LiveTicker, _resolve_mode, _serialize_timestamp
from zerodha_app.streamer import CandleSeries, simulate_candles


class DummyKiteTicker:
    MODE_LTP = "MODE_LTP"
    MODE_QUOTE = "MODE_QUOTE"
    MODE_FULL = "MODE_FULL"

    def __init__(self, api_key: str, access_token: str) -> None:
        self.api_key = api_key
        self.access_token = access_token
        self.on_connect = None
        self.on_ticks = None
        self.on_close = None
        self.on_error = None

    def connect(self, threaded: bool = False) -> None:
        del threaded

    def close(self, code: int, reason: str) -> None:
        del code, reason


class StreamerTests(unittest.TestCase):
    def test_candle_series_groups_ticks_by_interval(self) -> None:
        series = CandleSeries(interval_minutes=1)
        series.update("RELIANCE", 100.0, datetime(2026, 5, 8, 9, 15, 2), 10)
        series.update("RELIANCE", 102.0, datetime(2026, 5, 8, 9, 15, 40), 5)
        series.update("RELIANCE", 99.0, datetime(2026, 5, 8, 9, 16, 1), 7)

        candles = series.snapshot()["RELIANCE"]

        self.assertEqual(len(candles), 2)
        self.assertEqual(candles[0]["open"], 100.0)
        self.assertEqual(candles[0]["high"], 102.0)
        self.assertEqual(candles[0]["low"], 100.0)
        self.assertEqual(candles[0]["close"], 102.0)
        self.assertTrue(candles[0]["is_closed"])
        self.assertEqual(candles[1]["open"], 99.0)
        self.assertFalse(candles[1]["is_closed"])

    def test_candle_series_can_seed_existing_candles(self) -> None:
        series = CandleSeries(interval_minutes=1)
        series.seed(
            "RELIANCE",
            [
                {
                    "date": datetime(2026, 5, 8, 9, 15),
                    "open": 100,
                    "high": 102,
                    "low": 99,
                    "close": 101,
                    "volume": 1000,
                },
                {
                    "date": datetime(2026, 5, 8, 9, 16),
                    "open": 101,
                    "high": 103,
                    "low": 100,
                    "close": 102,
                    "volume": 1200,
                },
            ],
        )

        candles = series.snapshot()["RELIANCE"]

        self.assertEqual(len(candles), 2)
        self.assertTrue(candles[0]["is_closed"])
        self.assertFalse(candles[1]["is_closed"])

    def test_simulate_candles_returns_one_symbol_payload(self) -> None:
        payload = simulate_candles(
            symbol="RELIANCE",
            instrument_token=738561,
            interval_minutes=1,
            start=datetime(2026, 5, 8, 9, 15),
        )

        self.assertEqual(payload["source"], "simulated")
        self.assertEqual(payload["latest"]["RELIANCE"]["instrument_token"], 738561)
        self.assertGreaterEqual(len(payload["candles"]["RELIANCE"]), 2)

    def test_resolve_mode_rejects_unknown_mode(self) -> None:
        ws = DummyKiteTicker("key", "token")
        with self.assertRaisesRegex(ValueError, "Unsupported mode"):
            _resolve_mode(ws, "depth")

    def test_serialize_timestamp_handles_datetime(self) -> None:
        timestamp = datetime(2026, 5, 8, 9, 30, 0)
        self.assertEqual(_serialize_timestamp(timestamp), "2026-05-08T09:30:00")

    def test_rejects_empty_watchlist(self) -> None:
        with patch("zerodha_app.streamer.KiteTicker", DummyKiteTicker):
            with self.assertRaisesRegex(ValueError, "Watchlist is empty"):
                LiveTicker(api_key="key", access_token="token", watchlist={})

    def test_surfaces_websocket_error_before_timeout(self) -> None:
        with patch("zerodha_app.streamer.KiteTicker", DummyKiteTicker):
            ticker = LiveTicker(
                api_key="key",
                access_token="token",
                watchlist={738561: "RELIANCE"},
            )

        ticker._connect_error = (403, "Forbidden")
        with self.assertRaisesRegex(RuntimeError, "code=403 reason=Forbidden"):
            ticker._wait_for_connection(timeout_seconds=1)

    def test_live_ticker_updates_candles_from_ticks(self) -> None:
        with patch("zerodha_app.streamer.KiteTicker", DummyKiteTicker):
            ticker = LiveTicker(
                api_key="key",
                access_token="token",
                watchlist={738561: "RELIANCE"},
                candle_interval_minutes=1,
            )

        tick = {
            "instrument_token": 738561,
            "last_price": 100.5,
            "exchange_timestamp": datetime(2026, 5, 8, 9, 15, 30),
            "last_traded_quantity": 12,
        }
        ticker._on_ticks(None, [tick])
        candles = ticker.candle_snapshot()["RELIANCE"]

        self.assertEqual(len(candles), 1)
        self.assertEqual(candles[0]["open"], 100.5)
        self.assertEqual(candles[0]["close"], 100.5)
        self.assertEqual(candles[0]["volume"], 12)

    def test_latency_snapshot_uses_exchange_timestamp(self) -> None:
        with patch("zerodha_app.streamer.KiteTicker", DummyKiteTicker):
            ticker = LiveTicker(
                api_key="key",
                access_token="token",
                watchlist={738561: "RELIANCE"},
            )

        tick = {
            "instrument_token": 738561,
            "last_price": 100.5,
            "exchange_timestamp": datetime.now() - timedelta(milliseconds=150),
        }
        ticker._on_ticks(None, [tick])

        summary = ticker.latency_summary()
        snapshot = ticker.latency_snapshot()["RELIANCE"]

        self.assertEqual(summary["samples"], 1)
        self.assertGreaterEqual(snapshot["latest_ms"], 0.0)
        self.assertGreaterEqual(snapshot["average_ms"], 0.0)
        self.assertGreaterEqual(snapshot["min_ms"], 0.0)
        self.assertGreaterEqual(snapshot["max_ms"], snapshot["min_ms"])


if __name__ == "__main__":
    unittest.main()
