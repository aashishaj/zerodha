import json
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path

from zerodha_app.api_server import (
    APIOptions,
    ZerodhaFrontendAPI,
    _expand_minute_rows,
    _normalize_candle,
    _normalize_instrument_payload,
    _quote_key_for_instrument,
    _resample_rows_by_minutes,
    _resample_rows_by_week,
)
from zerodha_app.config import Settings


class FakeKiteAPI:
    def __init__(self) -> None:
        self.quote_calls = []

    def profile(self):
        return {"user_id": "AB1234", "user_name": "Aashish"}

    def margins(self, segment=None):
        return {
            "equity": {
                "net": 12345.67,
                "available": {"live_balance": 9876.54, "cash": 11000.0},
            }
        }

    def instruments(self, exchange):
        if exchange == "NSE":
            return [
                {
                    "instrument_token": 256265,
                    "exchange_token": 100,
                    "tradingsymbol": "NIFTY 50",
                    "name": "NIFTY",
                    "last_price": 23074.37,
                    "expiry": None,
                    "strike": 0,
                    "tick_size": 0.05,
                    "lot_size": 1,
                    "instrument_type": "INDEX",
                    "segment": "NSE-INDEX",
                    "exchange": "NSE",
                }
            ]
        if exchange == "NFO":
            return [
                {
                    "instrument_token": 101,
                    "exchange_token": 201,
                    "tradingsymbol": "NIFTY052224000CE",
                    "name": "NIFTY",
                    "last_price": 0,
                    "expiry": datetime(2026, 5, 22).date(),
                    "strike": 24000,
                    "tick_size": 0.05,
                    "lot_size": 75,
                    "instrument_type": "CE",
                    "segment": "NFO-OPT",
                    "exchange": "NFO",
                },
                {
                    "instrument_token": 102,
                    "exchange_token": 202,
                    "tradingsymbol": "NIFTY052224000PE",
                    "name": "NIFTY",
                    "last_price": 0,
                    "expiry": datetime(2026, 5, 22).date(),
                    "strike": 24000,
                    "tick_size": 0.05,
                    "lot_size": 75,
                    "instrument_type": "PE",
                    "segment": "NFO-OPT",
                    "exchange": "NFO",
                },
            ]
        return []

    def quote(self, keys):
        self.quote_calls.append(keys)
        return {
            "NFO:NIFTY052224000CE": {
                "last_price": 235.2,
                "ohlc": {"open": 240, "high": 245, "low": 230, "close": 240},
                "volume": 12000,
                "oi": 40000,
            },
            "NFO:NIFTY052224000PE": {
                "last_price": 237.6,
                "ohlc": {"open": 238, "high": 242, "low": 232, "close": 240},
                "volume": 12500,
                "oi": 41000,
            },
            "NSE:NIFTY 50": {
                "last_price": 23074.37,
                "ohlc": {"open": 24035.8, "high": 24110, "low": 22990, "close": 24035.8},
                "volume": 0,
                "oi": 0,
            },
        }


class APIServerTests(unittest.TestCase):
    def _build_api(self) -> ZerodhaFrontendAPI:
        settings = Settings(
            api_key="key",
            api_secret="secret",
            token_cache_path=Path("tokens.json"),
            watchlist_path=Path("watchlist.json"),
        )
        api = ZerodhaFrontendAPI(APIOptions(settings=settings))
        api._kite = FakeKiteAPI()
        return api

    def test_get_kite_rebuilds_when_cached_token_changes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            cache_path = Path(temp_dir) / "tokens.json"
            today = date.today().isoformat()
            cache_path.write_text(json.dumps({today: "token-one"}))
            settings = Settings(
                api_key="key",
                api_secret="secret",
                token_cache_path=cache_path,
                watchlist_path=Path(temp_dir) / "watchlist.json",
            )
            api = ZerodhaFrontendAPI(APIOptions(settings=settings))

            first = api._get_kite()
            self.assertEqual(api._kite_access_token, "token-one")
            # Unchanged token: the memoized client is reused.
            self.assertIs(api._get_kite(), first)

            # The separate callback bridge process writes a fresh token for today.
            cache_path.write_text(json.dumps({today: "token-two"}))
            second = api._get_kite()
            self.assertIsNot(second, first)
            self.assertEqual(api._kite_access_token, "token-two")

    def test_funds_returns_live_balance_as_available_cash(self):
        api = self._build_api()
        self.assertEqual(api.funds(), {"availableCash": 9876.54})

    def test_funds_falls_back_to_net_when_available_missing(self):
        api = self._build_api()

        class NoAvailableKite(FakeKiteAPI):
            def margins(self, segment=None):
                return {"equity": {"net": 500.0}}

        api._kite = NoAvailableKite()
        self.assertEqual(api.funds(), {"availableCash": 500.0})

    def test_normalize_instrument_payload(self):
        payload = _normalize_instrument_payload(
            {
                "instrument_token": 101,
                "exchange_token": 201,
                "tradingsymbol": "NIFTY052224000CE",
                "name": "NIFTY",
                "last_price": 0,
                "expiry": datetime(2026, 5, 22).date(),
                "strike": 24000,
                "tick_size": 0.05,
                "lot_size": 75,
                "instrument_type": "CE",
                "segment": "NFO-OPT",
                "exchange": "NFO",
            }
        )
        self.assertEqual(payload["expiry"], "2026-05-22")
        self.assertEqual(payload["instrument_token"], 101)

    def test_quote_key(self):
        self.assertEqual(
            _quote_key_for_instrument({"exchange": "NFO", "tradingsymbol": "NIFTY052224000CE"}),
            "NFO:NIFTY052224000CE",
        )

    def test_normalize_candle(self):
        candle = _normalize_candle(
            {"date": datetime(2026, 5, 20, 9, 15), "open": 1, "high": 2, "low": 0.5, "close": 1.5, "volume": 10}
        )
        self.assertEqual(candle["time"], "2026-05-20T09:15:00")
        self.assertEqual(candle["close"], 1.5)

    def test_instruments_and_quotes(self):
        api = self._build_api()
        instruments = api.instruments()
        self.assertTrue(any(item["tradingsymbol"] == "NIFTY052224000CE" for item in instruments))

        quotes = api.quote_map(["NIFTY052224000CE", "NIFTY052224000PE"])
        self.assertEqual(quotes["NIFTY052224000CE"]["last_price"], 235.2)
        self.assertEqual(quotes["NIFTY052224000PE"]["oi"], 41000)

    def test_option_chain(self):
        api = self._build_api()
        rows = api.option_chain("NIFTY", "2026-05-22")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["strike"], 24000)
        self.assertEqual(rows[0]["ceInstrument"]["tradingsymbol"], "NIFTY052224000CE")
        self.assertEqual(rows[0]["peInstrument"]["tradingsymbol"], "NIFTY052224000PE")

    def test_resamples_rows_by_minutes(self):
        rows = [
            {"date": datetime(2026, 5, 20, 9, 15), "open": 100, "high": 102, "low": 99, "close": 101, "volume": 10},
            {"date": datetime(2026, 5, 20, 9, 16), "open": 101, "high": 103, "low": 100, "close": 102, "volume": 12},
        ]

        result = _resample_rows_by_minutes(rows, 2)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["open"], 100)
        self.assertEqual(result[0]["close"], 102)
        self.assertEqual(result[0]["high"], 103)
        self.assertEqual(result[0]["low"], 99)
        self.assertEqual(result[0]["volume"], 22)

    def test_resamples_rows_by_week(self):
        rows = [
            {"date": datetime(2026, 5, 18, 0, 0), "open": 100, "high": 104, "low": 98, "close": 103, "volume": 10},
            {"date": datetime(2026, 5, 19, 0, 0), "open": 103, "high": 106, "low": 102, "close": 105, "volume": 12},
        ]

        result = _resample_rows_by_week(rows)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["open"], 100)
        self.assertEqual(result[0]["close"], 105)
        self.assertEqual(result[0]["high"], 106)
        self.assertEqual(result[0]["low"], 98)

    def test_expands_minute_rows_for_subminute_views(self):
        rows = [
            {"date": datetime(2026, 5, 20, 9, 15), "open": 100, "high": 105, "low": 98, "close": 102, "volume": 60},
        ]

        result = _expand_minute_rows(rows, 15)
        self.assertEqual(len(result), 4)
        self.assertEqual(result[0]["date"].isoformat(), "2026-05-20T09:15:00")
        self.assertEqual(sum(item["volume"] for item in result), 60)
