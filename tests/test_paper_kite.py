import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path

from zerodha_app import api_server
from zerodha_app.api_server import STOP_ORDER_TAG, APIOptions, ZerodhaFrontendAPI
from zerodha_app.config import Settings
from zerodha_app.paper_kite import PaperKite, PaperTickBroadcaster, default_paper_instruments

TODAY = date(2026, 10, 8)  # a Thursday; next Tuesday expiry is 2026-10-13
SYMBOL = "NIFTY26O1322600PE"


def _instruments() -> dict:
    dump = default_paper_instruments(TODAY)
    dump["NFO"].append({
        "instrument_token": 12345,
        "tradingsymbol": SYMBOL,
        "name": "NIFTY",
        "expiry": "2026-10-13",
        "strike": 22600.0,
        "tick_size": 0.05,
        "lot_size": 65,
        "instrument_type": "PE",
        "segment": "NFO-OPT",
        "exchange": "NFO",
    })
    return dump


def _paper(price: float = 170.0) -> PaperKite:
    paper = PaperKite(_instruments, clock=lambda: datetime(2026, 10, 8, 10, 0))
    paper.set_price(12345, price)
    return paper


def _sl_entry(paper: PaperKite, side: str = "SELL", **overrides) -> str:
    args = {
        "variety": "regular", "exchange": "NFO", "tradingsymbol": SYMBOL,
        "transaction_type": side, "quantity": 65, "product": "MIS", "order_type": "SL",
        "price": 165.5, "trigger_price": 166.0, "tag": STOP_ORDER_TAG,
    }
    args.update(overrides)
    return paper.place_order(**args)


class PaperOrderTests(unittest.TestCase):
    def test_sl_entry_waits_then_fills_as_limit_like_kite(self):
        paper = _paper(170.0)
        order_id = _sl_entry(paper)
        [order] = paper.orders()
        self.assertEqual(order["status"], "TRIGGER PENDING")
        self.assertEqual(order["order_type"], "SL")

        paper.set_price(12345, 167.0)  # not yet through the trigger
        self.assertEqual(paper.orders()[0]["status"], "TRIGGER PENDING")

        paper.set_price(12345, 165.9)
        [order] = paper.orders()
        self.assertEqual(order["order_id"], order_id)
        self.assertEqual(order["status"], "COMPLETE")
        # The rewrite that once hid filled entries from the chart.
        self.assertEqual(order["order_type"], "LIMIT")
        self.assertEqual(order["trigger_price"], 0.0)
        self.assertEqual(order["tag"], STOP_ORDER_TAG)
        self.assertEqual(order["average_price"], 165.9)

    def test_triggered_limit_waits_when_price_gaps_past_it(self):
        paper = _paper(170.0)
        _sl_entry(paper)
        paper.set_price(12345, 160.0)  # triggers, but below the 165.5 sell limit
        [order] = paper.orders()
        self.assertEqual((order["status"], order["order_type"]), ("OPEN", "LIMIT"))
        paper.set_price(12345, 166.0)
        self.assertEqual(paper.orders()[0]["status"], "COMPLETE")

    def test_slm_becomes_market_and_fills_at_last_price(self):
        paper = _paper(170.0)
        _sl_entry(paper, side="BUY", order_type="SL-M", price=None, trigger_price=180.0)
        paper.set_price(12345, 181.0)
        [order] = paper.orders()
        self.assertEqual((order["status"], order["order_type"], order["average_price"]), ("COMPLETE", "MARKET", 181.0))

    def test_rejects_what_kite_rejects(self):
        paper = _paper(170.0)
        cases = {
            "sell trigger above ltp": {"trigger_price": 171.0, "price": 170.5},
            "buy trigger below ltp": {"transaction_type": "BUY", "trigger_price": 160.0, "price": 160.5},
            "sell limit above trigger": {"price": 166.5},
            "buy limit below trigger": {"transaction_type": "BUY", "trigger_price": 180.0, "price": 179.5},
            "bad tag": {"tag": "stop-order"},
            "long tag": {"tag": "x" * 21},
            "not a lot multiple": {"quantity": 50},
            "off tick": {"price": 165.52},
        }
        for name, overrides in cases.items():
            with self.subTest(name), self.assertRaises(Exception):
                _sl_entry(paper, **overrides)
        self.assertEqual(paper.orders(), [])

    def test_cancel_needs_the_orders_variety_and_a_live_order(self):
        paper = _paper(170.0)
        order_id = _sl_entry(paper)
        with self.assertRaises(Exception):
            paper.cancel_order("co", order_id)
        paper.cancel_order("regular", order_id)
        self.assertEqual(paper.orders()[0]["status"], "CANCELLED")
        with self.assertRaises(Exception):
            paper.cancel_order("regular", order_id)

    def test_positions_net_the_filled_orders(self):
        paper = _paper(170.0)
        _sl_entry(paper)
        paper.set_price(12345, 165.5)
        paper.set_price(12345, 150.0)
        [position] = paper.positions()["net"]
        self.assertEqual(position["quantity"], -65)
        self.assertEqual(position["average_price"], 165.5)
        self.assertAlmostEqual(position["pnl"], (165.5 - 150.0) * 65)


class PaperGttTests(unittest.TestCase):
    def _oco(self, paper: PaperKite, triggers=(146.0, 186.0), last_price=165.5, quantity=65) -> int:
        legs = [
            {"transaction_type": "BUY", "quantity": quantity, "order_type": "LIMIT", "product": "MIS", "price": price}
            for price in (146.5, 186.5)
        ]
        return paper.place_gtt(
            trigger_type="two-leg", tradingsymbol=SYMBOL, exchange="NFO",
            trigger_values=list(triggers), last_price=last_price, orders=legs,
        )["trigger_id"]

    def test_oco_rejects_triggers_that_do_not_straddle_the_price(self):
        paper = _paper(170.0)
        for triggers in ((166.0, 186.0), (146.0, 160.0), (186.0, 146.0)):
            with self.subTest(triggers), self.assertRaises(Exception):
                self._oco(paper, triggers)
        with self.assertRaises(Exception):
            self._oco(paper, quantity=100)

    def test_oco_fires_the_crossed_leg_only(self):
        paper = _paper(165.5)
        gtt_id = self._oco(paper)
        paper.set_price(12345, 186.0)
        [gtt] = paper.get_gtts()
        self.assertEqual((gtt["id"], gtt["status"]), (gtt_id, "triggered"))
        [order] = paper.orders()
        self.assertEqual((order["transaction_type"], order["price"]), ("BUY", 186.5))
        self.assertEqual(order["status"], "COMPLETE")
        paper.set_price(12345, 140.0)  # the other leg must not fire afterwards
        self.assertEqual(len(paper.orders()), 1)

    def test_delete_only_active_gtts(self):
        paper = _paper(165.5)
        gtt_id = self._oco(paper)
        paper.delete_gtt(gtt_id)
        self.assertEqual(paper.get_gtts()[0]["status"], "deleted")
        with self.assertRaises(Exception):
            paper.delete_gtt(gtt_id)


class PaperMarketDataTests(unittest.TestCase):
    def test_quote_reports_the_paper_price(self):
        paper = _paper(170.0)
        quote = paper.quote([f"NFO:{SYMBOL}", "NFO:UNKNOWN"])
        self.assertEqual(list(quote), [f"NFO:{SYMBOL}"])
        self.assertEqual(quote[f"NFO:{SYMBOL}"]["last_price"], 170.0)

    def test_history_ends_on_the_paper_price_at_interval_boundaries(self):
        paper = _paper(170.0)
        to_time = datetime(2026, 10, 8, 10, 0)
        rows = paper.historical_data(12345, to_time - timedelta(hours=1), to_time, "5minute")
        self.assertEqual(len(rows), 13)
        self.assertEqual(rows[-1]["date"], to_time)
        self.assertEqual(rows[-1]["close"], 170.0)
        self.assertTrue(all(r["date"].minute % 5 == 0 for r in rows))

    def test_ticks_reach_subscribed_clients_only(self):
        paper = _paper(170.0)
        broadcaster = PaperTickBroadcaster(paper)
        _, subscribed = broadcaster.connect_client([12345])
        _, other = broadcaster.connect_client([256265])
        self.assertEqual(subscribed.get_nowait()["last_price"], 170.0)  # initial snapshot
        other.get_nowait()
        paper.set_price(12345, 171.0)
        self.assertEqual(subscribed.get_nowait()["last_price"], 171.0)
        self.assertTrue(other.empty())

    def test_default_instruments_use_next_tuesday_weekly_symbols(self):
        nfo = default_paper_instruments(TODAY)["NFO"]
        self.assertIn("NIFTY26O1325000PE", {row["tradingsymbol"] for row in nfo})
        self.assertTrue(all(row["expiry"] == "2026-10-13" for row in nfo))


class PaperModeServerTests(unittest.TestCase):
    def _build_api(self, db_dir: str) -> ZerodhaFrontendAPI:
        settings = Settings(
            api_key="key",
            api_secret="secret",
            token_cache_path=Path(db_dir) / "tokens.json",
            watchlist_path=Path(db_dir) / "watchlist.json",
            app_db_path=Path(db_dir) / "app.db",
        )
        api = ZerodhaFrontendAPI(APIOptions(settings=settings, paper_trading=True))
        api._paper._instrument_source = _instruments  # no real cache in tests
        return api

    def test_paper_mode_routes_orders_to_paper_kite_with_the_stop_tag(self):
        with tempfile.TemporaryDirectory() as tmp:
            api = self._build_api(tmp)
            api.set_paper_price({"instrument_token": 12345, "price": 170})
            api.place_order({
                "side": "SELL", "exchange": "NFO", "tradingsymbol": SYMBOL, "quantity": 65,
                "order_type": "SL", "price": 165.5, "trigger_price": 166, "product": "MIS",
            })
            api.set_paper_price({"instrument_token": 12345, "price": 165.5})
            [order] = api.get_orders()["orders"]
            self.assertEqual((order["status"], order["order_type"], order["tag"]), ("COMPLETE", "LIMIT", STOP_ORDER_TAG))
            self.assertTrue(api.get_auth_status()["authenticated"])

    def test_paper_mode_gtt_runs_through_the_real_planner(self):
        with tempfile.TemporaryDirectory() as tmp:
            api = self._build_api(tmp)
            api.set_paper_price({"instrument_token": 12345, "price": 165.5})
            payload = {
                "instrument_token": 12345, "exit_side": "BUY", "quantity": 65, "product": "MIS",
                "stop": {"trigger": 186, "price": 186.5}, "target": {"trigger": 135.5, "price": 136},
            }
            result = api.place_gtt(payload)
            self.assertEqual(len(result["trigger_ids"]), 1)
            self.assertEqual(api.get_gtts()["gtts"][0]["status"], "active")

    def test_paper_mode_refuses_a_public_https_origin(self):
        original = api_server.FRONTEND_URL
        api_server.FRONTEND_URL = "https://itmcrest.in"
        self.addCleanup(setattr, api_server, "FRONTEND_URL", original)
        with tempfile.TemporaryDirectory() as tmp, self.assertRaises(RuntimeError):
            self._build_api(tmp)

    def test_paper_price_endpoint_logic_requires_paper_mode(self):
        settings = Settings(api_key="key", api_secret="secret",
                            token_cache_path=Path("tokens.json"), watchlist_path=Path("watchlist.json"))
        api = ZerodhaFrontendAPI(APIOptions(settings=settings))
        self.assertFalse(api.paper_trading)
        with self.assertRaises(RuntimeError):
            api.set_paper_price({"instrument_token": 12345, "price": 170})


if __name__ == "__main__":
    unittest.main()
