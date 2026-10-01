import json
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path

from zerodha_app.api_server import (
    APIOptions,
    TickBroadcaster,
    ZerodhaFrontendAPI,
    _expand_minute_rows,
    _ist_now,
    _json_default,
    _parse_datetime_param,
    _normalize_candle,
    _normalize_instrument_payload,
    _quote_key_for_instrument,
    _resample_rows_by_minutes,
    _resample_rows_by_week,
    _is_token_error,
    gtt_oco_legs,
    role_allows_gtt_exit,
    role_allows_side,
    role_can_cancel,
    split_by_freeze_limit,
)
from zerodha_app.config import Settings


class FakeKiteAPI:
    VARIETY_REGULAR = "regular"
    ORDER_TYPE_LIMIT = "LIMIT"
    GTT_TYPE_OCO = "two-leg"

    def __init__(self) -> None:
        self.quote_calls = []
        self.cancel_calls: list[tuple[str, str]] = []
        self.gtt_calls: list[dict] = []
        self.deleted_gtts: list[int] = []
        self.fail_gtt_call: int | None = None
        self.history_calls: list[tuple] = []

    def place_gtt(self, **kwargs):
        if self.fail_gtt_call == len(self.gtt_calls):
            raise RuntimeError("freeze quantity exceeded")
        self.gtt_calls.append(kwargs)
        return {"trigger_id": 900 + len(self.gtt_calls)}

    def historical_data(self, token, from_time, to_time, interval):
        self.history_calls.append((from_time, to_time, interval))
        # One bar, like an incremental poll just after a minute boundary.
        return [{"date": datetime(2026, 10, 1, 10, 35), "open": 1, "high": 1, "low": 1, "close": 1, "volume": 0}]

    def get_gtts(self):
        return [{"id": 901, "type": "two-leg", "status": "active"}]

    def delete_gtt(self, trigger_id):
        self.deleted_gtts.append(trigger_id)
        return {"trigger_id": trigger_id}

    def cancel_order(self, variety, order_id):
        self.cancel_calls.append((variety, order_id))
        return {"order_id": order_id}

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

    def orders(self):
        # Kite embeds datetime objects in order rows.
        return [
            {
                "order_id": "250725000000001",
                "tradingsymbol": "NIFTY052224000CE",
                "transaction_type": "BUY",
                "quantity": 75,
                "status": "COMPLETE",
                "order_timestamp": datetime(2026, 7, 25, 9, 18, 24),
                "exchange_timestamp": datetime(2026, 7, 25, 9, 18, 24),
            }
        ]

    def positions(self):
        return {
            "net": [
                {
                    "tradingsymbol": "NIFTY052224000CE",
                    "exchange": "NFO",
                    "product": "NRML",
                    "quantity": 0,
                    "average_price": 0.0,
                    "last_price": 175.45,
                    "close_price": 170.0,
                    "pnl": 12145.0,
                }
            ],
            "day": [],
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
        api._kite_by_account[None] = (FakeKiteAPI(), "test-token", "key")
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
            self.assertEqual(api._kite_by_account[None][1], "token-one")
            # Unchanged token: the memoized client is reused.
            self.assertIs(api._get_kite(), first)

            # The separate callback bridge process writes a fresh token for today.
            cache_path.write_text(json.dumps({today: "token-two"}))
            second = api._get_kite()
            self.assertIsNot(second, first)
            self.assertEqual(api._kite_by_account[None][1], "token-two")

    def test_get_kite_rebuilds_when_api_key_changes(self):
        # A stale client bound to an outdated api_key must not be reused even
        # when the token is unchanged — this was the "invalid token" trap.
        with tempfile.TemporaryDirectory() as temp_dir:
            cache_path = Path(temp_dir) / "tokens.json"
            today = date.today().isoformat()
            # Token stored per-account so _account_api_key can vary independently.
            cache_path.write_text(json.dumps({"by_account": {"MKQ150": {today: "tok"}}, "legacy": {}}))
            settings = Settings(
                api_key="env-key",
                api_secret="secret",
                token_cache_path=cache_path,
                watchlist_path=Path(temp_dir) / "watchlist.json",
                app_db_path=Path(temp_dir) / "app.db",
            )
            api = ZerodhaFrontendAPI(APIOptions(settings=settings))
            api.set_request_account("MKQ150")

            # No stored key yet -> env-key fallback builds the first client.
            first = api._get_kite()
            self.assertEqual(api._kite_by_account["MKQ150"][2], "env-key")

            # Admin sets the account's own key; the next call must rebuild.
            acc = api.account_store().upsert_account("MKQ150", label="A", api_key="own-key", api_secret="s")
            self.assertIsNotNone(acc)
            second = api._get_kite()
            self.assertIsNot(second, first)
            self.assertEqual(api._kite_by_account["MKQ150"][2], "own-key")

    def test_funds_returns_live_balance_as_available_cash(self):
        api = self._build_api()
        self.assertEqual(api.funds(), {"availableCash": 9876.54})

    def test_funds_falls_back_to_net_when_available_missing(self):
        api = self._build_api()

        class NoAvailableKite(FakeKiteAPI):
            def margins(self, segment=None):
                return {"equity": {"net": 500.0}}

        api._kite_by_account[None] = (NoAvailableKite(), "test-token", "key")
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

    def test_orders_with_datetime_fields_are_json_serializable(self):
        # The real crash: Kite orders carry datetime objects; the raw payload
        # must survive json.dumps via the _send_json default.
        api = self._build_api()
        payload = api.get_orders()
        encoded = json.dumps(payload, default=_json_default)
        self.assertIn("2026-07-25T09:18:24", encoded)
        # Plain json.dumps (no default) would still raise — proving the fix matters.
        with self.assertRaises(TypeError):
            json.dumps(payload)

    def test_get_positions_returns_net_book(self):
        api = self._build_api()
        result = api.get_positions()
        self.assertTrue(result["ok"])
        self.assertEqual(len(result["positions"]), 1)
        self.assertEqual(result["positions"][0]["tradingsymbol"], "NIFTY052224000CE")
        self.assertEqual(result["positions"][0]["pnl"], 12145.0)

    def test_get_positions_handles_missing_net_key(self):
        api = self._build_api()

        class NoNetKite(FakeKiteAPI):
            def positions(self):
                return {}

        api._kite_by_account[None] = (NoNetKite(), "test-token", "key")
        self.assertEqual(api.get_positions(), {"ok": True, "positions": []})

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


class CancelOrderTests(unittest.TestCase):
    def _build_api(self) -> ZerodhaFrontendAPI:
        settings = Settings(
            api_key="key",
            api_secret="secret",
            token_cache_path=Path("tokens.json"),
            watchlist_path=Path("watchlist.json"),
        )
        api = ZerodhaFrontendAPI(APIOptions(settings=settings))
        api._kite_by_account[None] = (FakeKiteAPI(), "test-token", "key")
        return api

    def test_cancel_passes_through_the_orders_own_variety(self):
        # Kite rejects a cancel whose variety differs from the placed order's.
        api = self._build_api()
        result = api.cancel_order({"order_id": "2507250001", "variety": "co"})
        self.assertTrue(result["ok"])
        self.assertEqual(result["order_id"], "2507250001")
        self.assertEqual(api._kite_by_account[None][0].cancel_calls, [("co", "2507250001")])

    def test_cancel_defaults_to_regular_variety(self):
        api = self._build_api()
        api.cancel_order({"order_id": "2507250001"})
        self.assertEqual(api._kite_by_account[None][0].cancel_calls, [("regular", "2507250001")])

    def test_cancel_requires_an_order_id(self):
        api = self._build_api()
        for payload in ({}, {"order_id": ""}, {"order_id": "   "}):
            with self.assertRaises(ValueError):
                api.cancel_order(payload)
        self.assertEqual(api._kite_by_account[None][0].cancel_calls, [])


class GttTests(unittest.TestCase):
    def _build_api(self) -> ZerodhaFrontendAPI:
        settings = Settings(
            api_key="key",
            api_secret="secret",
            token_cache_path=Path("tokens.json"),
            watchlist_path=Path("watchlist.json"),
        )
        api = ZerodhaFrontendAPI(APIOptions(settings=settings))
        api._kite_by_account[None] = (FakeKiteAPI(), "test-token", "key")
        return api

    def _kite(self, api: ZerodhaFrontendAPI) -> FakeKiteAPI:
        return api._kite_by_account[None][0]

    # The CE's fake last price is 235.2. Option buying bought at 235:
    # stop 225 / 224.5, target 245 / 244.5 (limit on the fill side).
    _LONG_EXIT = {
        "instrument_token": 101,
        "exit_side": "SELL",
        "product": "NRML",
        "stop": {"trigger": 225, "price": 224.5},
        "target": {"trigger": 245, "price": 244.5},
    }

    def test_quantity_over_the_freeze_limit_places_two_ocos(self):
        api = self._build_api()
        result = api.place_gtt({**self._LONG_EXIT, "quantity": 3000})
        calls = self._kite(api).gtt_calls
        self.assertEqual([c["orders"][0]["quantity"] for c in calls], [1755, 1245])
        self.assertEqual(result["trigger_ids"], [901, 902])
        for call in calls:
            self.assertEqual(call["trigger_type"], "two-leg")
            self.assertEqual(call["tradingsymbol"], "NIFTY052224000CE")
            self.assertEqual(call["exchange"], "NFO")
            self.assertEqual(call["last_price"], 235.2)
            self.assertEqual(call["trigger_values"], [225, 245])
            self.assertEqual([o["price"] for o in call["orders"]], [224.5, 244.5])
            self.assertTrue(all(o["transaction_type"] == "SELL" for o in call["orders"]))
            self.assertTrue(all(o["order_type"] == "LIMIT" for o in call["orders"]))

    def test_quantity_within_the_freeze_limit_places_one_oco(self):
        api = self._build_api()
        api.place_gtt({**self._LONG_EXIT, "quantity": 1755})
        self.assertEqual(len(self._kite(api).gtt_calls), 1)

    def test_short_exit_puts_target_first(self):
        # Option selling sold at 235: stop 255 / 255.5, target 205 / 205.5.
        api = self._build_api()
        api.place_gtt({
            "instrument_token": 101,
            "exit_side": "BUY",
            "quantity": 65,
            "stop": {"trigger": 255, "price": 255.5},
            "target": {"trigger": 205, "price": 205.5},
        })
        call = self._kite(api).gtt_calls[0]
        self.assertEqual(call["trigger_values"], [205, 255])
        self.assertEqual([o["price"] for o in call["orders"]], [205.5, 255.5])
        self.assertTrue(all(o["transaction_type"] == "BUY" for o in call["orders"]))

    def test_dry_run_returns_the_plan_without_placing(self):
        api = self._build_api()
        result = api.place_gtt({**self._LONG_EXIT, "quantity": 3000}, dry_run=True)
        self.assertTrue(result["dry_run"])
        self.assertEqual(result["quantities"], [1755, 1245])
        self.assertEqual(result["freeze_limit"], 1755)
        self.assertEqual(self._kite(api).gtt_calls, [])

    def test_failure_after_a_placed_chunk_names_it(self):
        api = self._build_api()
        self._kite(api).fail_gtt_call = 1
        with self.assertRaises(RuntimeError) as ctx:
            api.place_gtt({**self._LONG_EXIT, "quantity": 3000})
        self.assertIn("901", str(ctx.exception))

    def test_rejects_bad_input(self):
        api = self._build_api()
        bad = [
            {**self._LONG_EXIT, "quantity": 0},
            {**self._LONG_EXIT, "quantity": 65, "exit_side": "HOLD"},
            {**self._LONG_EXIT, "quantity": 65, "instrument_token": 999},
            {**self._LONG_EXIT, "quantity": 65, "stop": None},
        ]
        for payload in bad:
            with self.assertRaises(ValueError):
                api.place_gtt(payload)
        self.assertEqual(self._kite(api).gtt_calls, [])

    def test_list_and_delete(self):
        api = self._build_api()
        self.assertEqual(api.get_gtts()["gtts"][0]["id"], 901)
        api.delete_gtt({"trigger_id": "901"})
        self.assertEqual(self._kite(api).deleted_gtts, [901])
        with self.assertRaises(ValueError):
            api.delete_gtt({"trigger_id": ""})


class HistoricalFallbackTests(unittest.TestCase):
    def _build_api(self) -> ZerodhaFrontendAPI:
        settings = Settings(
            api_key="key",
            api_secret="secret",
            token_cache_path=Path("tokens.json"),
            watchlist_path=Path("watchlist.json"),
        )
        api = ZerodhaFrontendAPI(APIOptions(settings=settings))
        api._kite_by_account[None] = (FakeKiteAPI(), "test-token", "key")
        return api

    def test_incremental_poll_does_not_fall_back_to_a_month(self):
        # A poll from the last candle returns few rows by design; widening it
        # to 30 days reshaped the chart every 10s and snapped the zoom back.
        api = self._build_api()
        rows = api.historical(101, "minute", "2026-10-01T10:34:00+05:30")
        calls = api._kite_by_account[None][0].history_calls
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0], datetime(2026, 10, 1, 10, 34))
        self.assertEqual(len(rows), 1)

    def test_initial_load_still_falls_back_when_sparse(self):
        api = self._build_api()
        api.historical(101, "minute")
        calls = api._kite_by_account[None][0].history_calls
        self.assertEqual(len(calls), 2)
        self.assertLess(calls[1][0], calls[0][0])


class SplitByFreezeLimitTests(unittest.TestCase):
    def test_splits_at_the_limit(self):
        self.assertEqual(split_by_freeze_limit(3000, 1755), [1755, 1245])
        self.assertEqual(split_by_freeze_limit(4000, 1755), [1755, 1755, 490])
        self.assertEqual(split_by_freeze_limit(3510, 1755), [1755, 1755])

    def test_at_or_under_the_limit_is_one_chunk(self):
        self.assertEqual(split_by_freeze_limit(1755, 1755), [1755])
        self.assertEqual(split_by_freeze_limit(65, 1755), [65])

    def test_no_limit_is_one_chunk(self):
        self.assertEqual(split_by_freeze_limit(3000, None), [3000])

    def test_non_positive_quantity_is_rejected(self):
        with self.assertRaises(ValueError):
            split_by_freeze_limit(0, 1755)


class GttOcoLegsTests(unittest.TestCase):
    def test_long_exit_orders_stop_then_target(self):
        self.assertEqual(
            gtt_oco_legs("SELL", (90, 89.5), (110, 109.5), 100),
            ([90, 110], [89.5, 109.5]),
        )

    def test_short_exit_orders_target_then_stop(self):
        self.assertEqual(
            gtt_oco_legs("BUY", (120, 120.5), (70, 70.5), 100),
            ([70, 120], [70.5, 120.5]),
        )

    def test_legs_must_straddle_the_last_price(self):
        with self.assertRaises(ValueError):
            gtt_oco_legs("SELL", (90, 89.5), (110, 109.5), 112)
        with self.assertRaises(ValueError):
            gtt_oco_legs("BUY", (120, 120.5), (70, 70.5), 65)

    def test_limits_must_sit_on_the_fill_side(self):
        # A SELL limit above its trigger, or a BUY limit below it, may never fill.
        with self.assertRaises(ValueError):
            gtt_oco_legs("SELL", (90, 90.5), (110, 109.5), 100)
        with self.assertRaises(ValueError):
            gtt_oco_legs("SELL", (90, 89.5), (110, 110.5), 100)
        with self.assertRaises(ValueError):
            gtt_oco_legs("BUY", (120, 119.5), (70, 70.5), 100)
        with self.assertRaises(ValueError):
            gtt_oco_legs("BUY", (120, 120.5), (70, 69.5), 100)


class RoleAllowsGttExitTests(unittest.TestCase):
    def test_single_side_roles_exit_on_the_opposite_side_only(self):
        self.assertTrue(role_allows_gtt_exit("buyer", "SELL"))
        self.assertFalse(role_allows_gtt_exit("buyer", "BUY"))
        self.assertTrue(role_allows_gtt_exit("seller", "BUY"))
        self.assertFalse(role_allows_gtt_exit("seller", "SELL"))

    def test_trader_and_super_admin_exit_either_way(self):
        for role in ("trader", "super_admin"):
            self.assertTrue(role_allows_gtt_exit(role, "BUY"))
            self.assertTrue(role_allows_gtt_exit(role, "SELL"))
            self.assertFalse(role_allows_gtt_exit(role, ""))

    def test_unknown_roles_get_nothing(self):
        for role in ("viewer", ""):
            self.assertFalse(role_allows_gtt_exit(role, "BUY"))
            self.assertFalse(role_allows_gtt_exit(role, "SELL"))


class RoleCanCancelTests(unittest.TestCase):
    def test_every_trading_role_may_cancel(self):
        # Cancelling has no side, so a seller may cancel their own BUY stop.
        for role in ("buyer", "seller", "trader", "super_admin"):
            self.assertTrue(role_can_cancel(role))

    def test_non_trading_roles_may_not_cancel(self):
        for role in ("viewer", "", "admin", "SUPER_ADMIN"):
            self.assertFalse(role_can_cancel(role))


class RoleAllowsSideTests(unittest.TestCase):
    def test_buyer_only_buys(self):
        self.assertTrue(role_allows_side("buyer", "BUY"))
        self.assertFalse(role_allows_side("buyer", "SELL"))

    def test_seller_only_sells(self):
        self.assertTrue(role_allows_side("seller", "SELL"))
        self.assertFalse(role_allows_side("seller", "BUY"))

    def test_trader_and_super_admin_get_both(self):
        for role in ("trader", "super_admin"):
            self.assertTrue(role_allows_side(role, "BUY"))
            self.assertTrue(role_allows_side(role, "SELL"))

    def test_unknown_role_gets_nothing(self):
        self.assertFalse(role_allows_side("", "BUY"))
        self.assertFalse(role_allows_side("viewer", "SELL"))

    def test_stop_orders_may_take_the_counter_side(self):
        # A seller's stop loss is a BUY SL; a buyer's is a SELL SL.
        for order_type in ("SL", "SL-M", "sl", "SLM", " sl-m "):
            self.assertTrue(role_allows_side("seller", "BUY", order_type))
            self.assertTrue(role_allows_side("buyer", "SELL", order_type))

    def test_stop_orders_still_allow_the_roles_own_side(self):
        self.assertTrue(role_allows_side("seller", "SELL", "SL"))
        self.assertTrue(role_allows_side("buyer", "BUY", "SL"))

    def test_non_stop_orders_stay_gated(self):
        for order_type in ("MARKET", "LIMIT", ""):
            self.assertFalse(role_allows_side("seller", "BUY", order_type))
            self.assertFalse(role_allows_side("buyer", "SELL", order_type))

    def test_stop_exemption_does_not_reach_unknown_roles(self):
        self.assertFalse(role_allows_side("viewer", "BUY", "SL"))
        self.assertFalse(role_allows_side("", "SELL", "SL-M"))


class TokenErrorDetectionTests(unittest.TestCase):
    def test_invalid_token_message_is_a_token_error(self):
        # Kite's historical endpoint returns expiry as InputException("invalid token").
        self.assertTrue(_is_token_error(Exception("invalid token")))
        self.assertTrue(_is_token_error(Exception("Token is invalid or has expired")))
        self.assertTrue(_is_token_error(Exception("Access token is invalid")))

    def test_typed_token_exception_is_detected(self):
        try:
            from kiteconnect.exceptions import TokenException
        except Exception:
            self.skipTest("kiteconnect not installed")
        self.assertTrue(_is_token_error(TokenException("session expired")))

    def test_unrelated_errors_are_not_token_errors(self):
        self.assertFalse(_is_token_error(Exception("invalid instrument_token")))
        self.assertFalse(_is_token_error(Exception("quantity must be greater than 0")))
        self.assertFalse(_is_token_error(Exception("")))


class InstrumentCacheTests(unittest.TestCase):
    """Disk cache + single-download behavior of _load_instrument_dump."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        settings = Settings(
            api_key="key",
            api_secret="secret",
            token_cache_path=root / ".zerodha" / "tokens.json",
            watchlist_path=root / "watchlist.json",
            app_db_path=root / "app.db",
        )
        self.api = ZerodhaFrontendAPI(APIOptions(settings=settings))
        self.cache_path = root / ".zerodha" / "instruments_cache.json"

    def tearDown(self):
        self._tmp.cleanup()

    def _install_counting_kite(self):
        calls = []

        class CountingKite:
            def instruments(self, exchange):
                calls.append(exchange)
                return [
                    {
                        "instrument_token": 1,
                        "exchange_token": 1,
                        "tradingsymbol": f"SYM{exchange}",
                        "name": f"SYM{exchange}",
                        "exchange": exchange,
                        "segment": exchange,
                        "instrument_type": "EQ",
                        "last_price": 1.0,
                        "tick_size": 0.05,
                        "lot_size": 1,
                        "strike": 0,
                        "expiry": None,
                    }
                ]

        self.api._kite_by_account[None] = (CountingKite(), "tok", "key")
        return calls

    def test_download_writes_dated_cache(self):
        calls = self._install_counting_kite()
        dump = self.api._load_instrument_dump()
        self.assertEqual(len(calls), 5)
        self.assertTrue(self.cache_path.exists())
        payload = json.loads(self.cache_path.read_text())
        self.assertEqual(payload["date"], date.today().isoformat())
        self.assertEqual(sorted(dump.keys()), ["BSE", "CDS", "MCX", "NFO", "NSE"])

    def test_todays_cache_skips_download(self):
        calls = self._install_counting_kite()
        self.api._load_instrument_dump()
        calls.clear()
        dump = self.api._load_instrument_dump()
        self.assertEqual(calls, [])
        self.assertEqual(dump["NSE"][0]["tradingsymbol"], "SYMNSE")

    def test_stale_cache_redownloads(self):
        calls = self._install_counting_kite()
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(json.dumps({"date": "2000-01-01", "by_exchange": {"NSE": [{"x": 1}]}}))
        self.api._load_instrument_dump()
        self.assertEqual(len(calls), 5)

    def test_partial_download_is_not_cached(self):
        class PartialKite:
            def instruments(self, exchange):
                if exchange == "MCX":
                    raise RuntimeError("down")
                return [{"instrument_token": 1, "tradingsymbol": "A", "name": "A", "exchange": exchange, "segment": exchange, "instrument_type": "EQ"}]

        self.api._kite_by_account[None] = (PartialKite(), "tok", "key")
        dump = self.api._load_instrument_dump()
        self.assertEqual(dump["MCX"], [])
        self.assertFalse(self.cache_path.exists())

    def test_ensure_instruments_loaded_is_memoized(self):
        calls = self._install_counting_kite()
        self.api._ensure_instruments_loaded()
        first = len(calls)
        self.api._ensure_instruments_loaded()
        self.assertEqual(len(calls), first)
        self.assertTrue(any(r["tradingsymbol"] == "SYMNSE" for r in self.api._raw_instruments))


class FakeTicker:
    MODE_FULL = "full"

    def __init__(self, connected: bool = False) -> None:
        self.connected = connected
        self.subscribed: list[int] = []
        self.modes: list[tuple] = []

    def is_connected(self) -> bool:
        return self.connected

    def subscribe(self, tokens):
        # Mirrors KiteTicker: subscribing before the socket is up raises.
        if not self.connected:
            raise AttributeError("'NoneType' object has no attribute 'sendMessage'")
        self.subscribed.extend(tokens)

    def set_mode(self, mode, tokens):
        self.modes.append((mode, tuple(tokens)))


class TickBroadcasterTests(unittest.TestCase):
    def test_defers_subscribe_until_socket_connects(self):
        b = TickBroadcaster(api_key="k", access_token="t")
        fake = FakeTicker(connected=False)
        b._ticker = fake  # skip real KiteTicker creation in _ensure_started

        # Not connected yet: must NOT call subscribe (would crash), but records intent.
        b.connect_client([111, 222])
        self.assertEqual(fake.subscribed, [])
        self.assertEqual(b._subscribed, {111, 222})

        # Socket comes up -> _on_connect subscribes the recorded tokens.
        fake.connected = True
        b._on_connect(fake, None)
        self.assertEqual(sorted(fake.subscribed), [111, 222])

    def test_subscribes_immediately_when_already_connected(self):
        b = TickBroadcaster(api_key="k", access_token="t")
        fake = FakeTicker(connected=True)
        b._ticker = fake
        b.connect_client([333])
        self.assertEqual(fake.subscribed, [333])
        self.assertEqual(b._subscribed, {333})


class DatetimeParamTests(unittest.TestCase):
    def test_ist_offset_is_stripped_to_naive_ist(self):
        # The frontend sends candle times with +05:30; they must become naive IST
        # so they compare cleanly with _ist_now() (also naive IST) — otherwise a
        # tz-aware from vs a UTC to made from > to and forced the 7-day fallback.
        parsed = _parse_datetime_param("2026-08-28T12:52:00+05:30")
        self.assertIsNone(parsed.tzinfo)
        self.assertEqual(parsed.hour, 12)
        self.assertEqual(parsed.minute, 52)

    def test_utc_offset_is_converted_to_ist(self):
        # 07:22 UTC == 12:52 IST
        parsed = _parse_datetime_param("2026-08-28T07:22:00+00:00")
        self.assertIsNone(parsed.tzinfo)
        self.assertEqual((parsed.hour, parsed.minute), (12, 52))

    def test_naive_passthrough_and_none(self):
        self.assertEqual(_parse_datetime_param("2026-08-28T12:52:00").hour, 12)
        self.assertIsNone(_parse_datetime_param(None))

    def test_ist_now_is_naive(self):
        self.assertIsNone(_ist_now().tzinfo)
