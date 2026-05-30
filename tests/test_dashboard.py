import time
import unittest
from datetime import datetime
from pathlib import Path

from zerodha_app.dashboard import (
    CandleDashboard,
    DashboardOptions,
    _history_window,
    _load_history_with_fallback,
    _resolve_instrument_token,
)
from zerodha_app.config import Settings
from zerodha_app.instruments import InstrumentCatalog, InstrumentRow


class FakeKite:
    VARIETY_REGULAR = "regular"
    EXCHANGE_NSE = "NSE"
    TRANSACTION_TYPE_BUY = "BUY"
    PRODUCT_CNC = "CNC"
    PRODUCT_MIS = "MIS"
    PRODUCT_NRML = "NRML"
    ORDER_TYPE_MARKET = "MARKET"
    ORDER_TYPE_LIMIT = "LIMIT"
    ORDER_TYPE_SL = "SL"
    ORDER_TYPE_SLM = "SL-M"

    def __init__(self) -> None:
        self.last_order = None
        self.loaded_exchange = None

    def place_order(self, **kwargs):
        self.last_order = kwargs
        return "order-123"

    def instruments(self, exchange):
        self.loaded_exchange = exchange
        return [
            {"tradingsymbol": "RELIANCE", "instrument_token": 456, "instrument_type": "EQ"}
        ]


class CandleDashboardTests(unittest.TestCase):
    def _sample_catalog(self) -> InstrumentCatalog:
        return InstrumentCatalog(
            [
                InstrumentRow(
                    instrument_token=456,
                    tradingsymbol="RELIANCE",
                    display_name="NSE:RELIANCE",
                    exchange="NSE",
                    segment="NSE",
                    instrument_type="EQ",
                    name="RELIANCE",
                    expiry=None,
                    strike=None,
                    lot_size=1,
                ),
                InstrumentRow(
                    instrument_token=789,
                    tradingsymbol="RELIANCE24JUNFUT",
                    display_name="NFO:RELIANCE24JUNFUT | 2026-06-25 FUT",
                    exchange="NFO",
                    segment="NFO-FUT",
                    instrument_type="FUT",
                    name="RELIANCE",
                    expiry=None,
                    strike=None,
                    lot_size=250,
                ),
                InstrumentRow(
                    instrument_token=790,
                    tradingsymbol="RELIANCE24JUN2500CE",
                    display_name="NFO:RELIANCE24JUN2500CE | 2026-06-25 | 2500 CE",
                    exchange="NFO",
                    segment="NFO-OPT",
                    instrument_type="CE",
                    name="RELIANCE",
                    expiry=None,
                    strike=2500.0,
                    lot_size=250,
                ),
            ]
        )

    def test_demo_dashboard_produces_state(self) -> None:
        dashboard = CandleDashboard(
            DashboardOptions(
                settings=None,
                interval_minutes=1,
                host="127.0.0.1",
                port=8080,
                demo=True,
            )
        )
        dashboard.start()

        try:
            for _ in range(20):
                snapshot = dashboard.snapshot()
                if snapshot["candles"]:
                    break
                time.sleep(0.05)
            else:
                self.fail("Demo dashboard did not produce candles.")

            self.assertEqual(snapshot["source"], "demo")
            self.assertIn("RELIANCE", snapshot["candles"])
            self.assertIn("RELIANCE", snapshot["latest"])
            self.assertIn("latency", snapshot)
        finally:
            dashboard.stop()

    def test_buy_order_requires_trading_enabled(self) -> None:
        dashboard = CandleDashboard(
            DashboardOptions(
                settings=None,
                interval_minutes=1,
                host="127.0.0.1",
                port=8080,
            )
        )

        result = dashboard.place_buy_order(
            {"symbol": "RELIANCE", "quantity": 1, "order_type": "MARKET"}
        )

        self.assertFalse(result["ok"])
        self.assertIn("--enable-trading", result["message"])

    def test_buy_order_places_slm_order(self) -> None:
        dashboard = CandleDashboard(
            DashboardOptions(
                settings=None,
                interval_minutes=1,
                host="127.0.0.1",
                port=8080,
                enable_trading=True,
            )
        )
        kite = FakeKite()
        dashboard._kite = kite

        result = dashboard.place_buy_order(
            {
                "symbol": "RELIANCE",
                "quantity": 2,
                "product": "CNC",
                "order_type": "SL-M",
                "trigger_price": 1429.4,
            }
        )

        self.assertTrue(result["ok"])
        self.assertEqual(kite.last_order["tradingsymbol"], "RELIANCE")
        self.assertEqual(kite.last_order["transaction_type"], "BUY")
        self.assertEqual(kite.last_order["order_type"], "SL-M")
        self.assertEqual(kite.last_order["trigger_price"], 1429.4)

    def test_buy_order_uses_selected_exchange(self) -> None:
        dashboard = CandleDashboard(
            DashboardOptions(
                settings=None,
                interval_minutes=1,
                host="127.0.0.1",
                port=8080,
                enable_trading=True,
            )
        )
        kite = FakeKite()
        dashboard._kite = kite
        dashboard._symbol_exchanges = {"RELIANCE": "BSE"}

        result = dashboard.place_buy_order(
            {
                "symbol": "RELIANCE",
                "quantity": 1,
                "product": "CNC",
                "order_type": "MARKET",
            }
        )

        self.assertTrue(result["ok"])
        self.assertEqual(kite.last_order["exchange"], "BSE")

    def test_derivative_buy_order_uses_lots_and_nrml(self) -> None:
        dashboard = CandleDashboard(
            DashboardOptions(
                settings=None,
                interval_minutes=1,
                host="127.0.0.1",
                port=8080,
                enable_trading=True,
            )
        )
        kite = FakeKite()
        dashboard._kite = kite
        dashboard._selected_contract = self._sample_catalog().get_by_token(790).to_dict()

        result = dashboard.place_buy_order(
            {
                "lots": 2,
                "product": "NRML",
                "order_type": "MARKET",
            }
        )

        self.assertTrue(result["ok"])
        self.assertEqual(kite.last_order["exchange"], "NFO")
        self.assertEqual(kite.last_order["tradingsymbol"], "RELIANCE24JUN2500CE")
        self.assertEqual(kite.last_order["quantity"], 500)
        self.assertEqual(kite.last_order["product"], "NRML")

    def test_resolve_instrument_token_finds_equity_on_exchange(self) -> None:
        class FakeInstrumentKite:
            def instruments(self, exchange):
                self.exchange = exchange
                return [
                    {"tradingsymbol": "RELIANCE", "instrument_token": 123, "instrument_type": "FUT"},
                    {"tradingsymbol": "RELIANCE", "instrument_token": 456, "instrument_type": "EQ"},
                ]

        kite = FakeInstrumentKite()
        token, symbol = _resolve_instrument_token(kite, "reliance", "bse")

        self.assertEqual(kite.exchange, "BSE")
        self.assertEqual(token, 456)
        self.assertEqual(symbol, "RELIANCE")

    def test_load_stock_resolves_symbol_from_ui_request(self) -> None:
        dashboard = CandleDashboard(
            DashboardOptions(
                settings=None,
                interval_minutes=1,
                host="127.0.0.1",
                port=8080,
            )
        )
        calls = []
        kite = FakeKite()
        dashboard._kite = kite

        def fake_start(*, token, symbol, exchange):
            calls.append((token, symbol, exchange))

        dashboard._start_symbol_stream = fake_start

        result = dashboard.load_stock("reliance", "bse")

        self.assertTrue(result["ok"])
        self.assertEqual(calls, [(456, "RELIANCE", "BSE")])
        self.assertEqual(kite.loaded_exchange, "BSE")

    def test_missing_watchlist_starts_dashboard_ready_for_ui_load(self) -> None:
        settings = Settings(
            api_key="key",
            api_secret="secret",
            token_cache_path=Path("tokens.json"),
            watchlist_path=Path("missing-watchlist.json"),
        )
        dashboard = CandleDashboard(
            DashboardOptions(
                settings=settings,
                interval_minutes=1,
                host="127.0.0.1",
                port=8080,
            )
        )

        watchlist = dashboard._resolve_live_watchlist(settings, FakeKite())
        dashboard._start_watchlist_stream(watchlist)
        snapshot = dashboard.snapshot()

        self.assertEqual(watchlist, {})
        self.assertEqual(snapshot["status"], "ready")
        self.assertEqual(snapshot["candles"], {})

    def test_search_instruments_returns_grouped_results(self) -> None:
        dashboard = CandleDashboard(
            DashboardOptions(
                settings=None,
                interval_minutes=1,
                host="127.0.0.1",
                port=8080,
                demo=True,
            )
        )
        dashboard._instrument_catalog = self._sample_catalog()

        result = dashboard.search_instruments("reliance", "all")

        self.assertTrue(result["ok"])
        self.assertEqual(result["total"], 3)
        self.assertEqual(len(result["matches"]["cash"]), 1)
        self.assertEqual(len(result["matches"]["futures"]), 1)
        self.assertEqual(len(result["matches"]["options"]), 1)

    def test_load_instrument_uses_catalog_row(self) -> None:
        dashboard = CandleDashboard(
            DashboardOptions(
                settings=Settings(
                    api_key="key",
                    api_secret="secret",
                    token_cache_path=Path("tokens.json"),
                    watchlist_path=Path("watchlist.json"),
                ),
                interval_minutes=1,
                host="127.0.0.1",
                port=8080,
            )
        )
        dashboard._instrument_catalog = self._sample_catalog()
        calls = []

        def fake_start(*, token, symbol, exchange):
            calls.append((token, symbol, exchange))

        dashboard._start_symbol_stream = fake_start

        result = dashboard.load_instrument(789)

        self.assertTrue(result["ok"])
        self.assertEqual(calls, [(789, "RELIANCE24JUNFUT", "NFO")])
        self.assertEqual(dashboard._selected_contract["exchange"], "NFO")

    def test_history_window_keeps_recent_days_for_short_intervals(self) -> None:
        self.assertEqual(_history_window(1).days, 7)
        self.assertEqual(_history_window(5).days, 7)

    def test_history_window_expands_for_wider_intervals(self) -> None:
        self.assertEqual(_history_window(15).days, 21)
        self.assertEqual(_history_window(60).days, 60)

    def test_history_loader_retries_intraday_before_any_daily_fallback(self) -> None:
        class FakeHistoryKite:
            def historical_data(self, token, from_time, to_time, interval):
                if interval == "minute":
                    if (to_time - from_time).days <= 7:
                        return [
                            {"date": "2026-05-19T09:15:00", "open": 1, "high": 2, "low": 1, "close": 2, "volume": 10}
                        ]
                    return [
                        {"date": "2026-05-15T09:15:00", "open": 4, "high": 5, "low": 3, "close": 4, "volume": 13},
                        {"date": "2026-05-16T09:15:00", "open": 5, "high": 6, "low": 4, "close": 5, "volume": 14},
                        {"date": "2026-05-19T09:15:00", "open": 6, "high": 7, "low": 5, "close": 6, "volume": 15},
                    ]
                return []

        rows = _load_history_with_fallback(
            kite=FakeHistoryKite(),
            token=123,
            from_time=datetime(2026, 5, 12, 9, 15),
            to_time=datetime(2026, 5, 19, 15, 30),
            kite_interval="minute",
        )

        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[-1]["close"], 6)


if __name__ == "__main__":
    unittest.main()
