from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from zerodha_app.auth import AuthManager
from zerodha_app.config import Settings, load_watchlist
from zerodha_app.dashboard import _history_window, _load_history_with_fallback
from zerodha_app.instruments import InstrumentCatalog

try:
    from kiteconnect import KiteConnect
except ModuleNotFoundError:
    KiteConnect = None


LOGGER = logging.getLogger(__name__)
SUPPORTED_HISTORICAL_INTERVALS = {
    "5second",
    "10second",
    "15second",
    "30second",
    "minute",
    "2minute",
    "3minute",
    "4minute",
    "5minute",
    "10minute",
    "15minute",
    "30minute",
    "60minute",
    "day",
    "week",
}


@dataclass(slots=True)
class APIOptions:
    settings: Settings
    host: str = "127.0.0.1"
    port: int = 8080
    login_if_needed: bool = False


class ZerodhaFrontendAPI:
    def __init__(self, options: APIOptions) -> None:
        self.options = options
        self._kite: Any | None = None
        self._instrument_catalog: InstrumentCatalog | None = None
        self._raw_instruments: list[dict[str, Any]] | None = None
        self._instrument_by_token: dict[int, dict[str, Any]] = {}
        self._instrument_by_symbol: dict[str, dict[str, Any]] = {}

    def profile(self) -> dict[str, Any]:
        kite = self._get_kite()
        # Zerodha integration point:
        # The backend keeps the access token server-side and exposes only safe profile fields.
        payload = kite.profile()
        return {
            "userId": str(payload.get("user_id") or payload.get("user_name") or "USER"),
            "name": str(payload.get("user_name") or payload.get("user_shortname") or "Zerodha User"),
            "email": payload.get("email"),
            "broker": payload.get("broker"),
        }

    def instruments(self) -> list[dict[str, Any]]:
        self._ensure_instruments_loaded()
        assert self._raw_instruments is not None
        return self._raw_instruments

    def quote_map(self, symbols: list[str]) -> dict[str, dict[str, Any]]:
        self._ensure_instruments_loaded()
        kite = self._get_kite()

        quote_keys: list[str] = []
        frontend_keys: list[str] = []
        for symbol in symbols:
            cleaned = symbol.strip().upper()
            if not cleaned:
                continue
            instrument = self._instrument_by_symbol.get(cleaned)
            if instrument is None:
                continue
            frontend_keys.append(cleaned)
            quote_keys.append(_quote_key_for_instrument(instrument))

        if not quote_keys:
            return {}

        # Zerodha integration point:
        # The backend resolves instrument exchange prefixes for Kite quote requests.
        raw_quotes = kite.quote(quote_keys)
        output: dict[str, dict[str, Any]] = {}

        for frontend_key, quote_key in zip(frontend_keys, quote_keys):
            quote = raw_quotes.get(quote_key) or {}
            instrument = self._instrument_by_symbol[frontend_key]
            last_price = float(quote.get("last_price") or instrument.get("last_price") or 0)
            ohlc = quote.get("ohlc") or {}
            previous_close = float(ohlc.get("close") or 0)
            change = round(last_price - previous_close, 2) if previous_close else 0.0
            change_percent = round((change / previous_close) * 100, 2) if previous_close else 0.0
            output[frontend_key] = {
                "instrument_token": int(instrument["instrument_token"]),
                "tradingsymbol": frontend_key,
                "last_price": last_price,
                "change": change,
                "changePercent": change_percent,
                "open": _as_float(ohlc.get("open")),
                "high": _as_float(ohlc.get("high")),
                "low": _as_float(ohlc.get("low")),
                "close": _as_float(ohlc.get("close")),
                "volume": _as_int(quote.get("volume")),
                "oi": _as_int(quote.get("oi")),
            }

        return output

    def historical(self, instrument_token: int, interval: str, from_value: str | None = None, to_value: str | None = None) -> list[dict[str, Any]]:
        if interval not in SUPPORTED_HISTORICAL_INTERVALS:
            raise ValueError(f"Unsupported interval `{interval}`.")

        kite = self._get_kite()
        to_time = _parse_datetime_param(to_value) or datetime.now()
        from_time = _parse_datetime_param(from_value) or (to_time - _interval_window(interval))
        source_interval = _source_interval(interval)
        rows = _load_history_with_fallback(
            kite=kite,
            token=instrument_token,
            from_time=from_time,
            to_time=to_time,
            kite_interval=source_interval,
        )
        rows = _transform_rows_for_interval(rows, interval)
        return [_normalize_candle(row) for row in rows]

    def option_chain(self, underlying: str, expiry: str) -> list[dict[str, Any]]:
        self._ensure_instruments_loaded()
        underlying_key = underlying.strip().upper()
        expiry_key = expiry.strip()
        rows = [
            instrument
            for instrument in self._raw_instruments or []
            if instrument["name"] == underlying_key
            and instrument["segment"] == "NFO-OPT"
            and instrument["expiry"] == expiry_key
        ]

        if not rows:
            return []

        quotes = self.quote_map([row["tradingsymbol"] for row in rows])
        buckets: dict[float, dict[str, Any]] = {}
        for instrument in rows:
            strike = float(instrument["strike"] or 0)
            entry = buckets.setdefault(
                strike,
                {
                    "strike": strike,
                    "ceInstrument": None,
                    "peInstrument": None,
                    "ceLtp": None,
                    "peLtp": None,
                    "ceOi": None,
                    "peOi": None,
                    "ceVolume": None,
                    "peVolume": None,
                    "ceChange": None,
                    "peChange": None,
                },
            )
            quote = quotes.get(instrument["tradingsymbol"], {})
            side = str(instrument["instrument_type"]).upper()
            if side == "CE":
                entry["ceInstrument"] = instrument
                entry["ceLtp"] = quote.get("last_price")
                entry["ceOi"] = quote.get("oi")
                entry["ceVolume"] = quote.get("volume")
                entry["ceChange"] = quote.get("change")
            elif side == "PE":
                entry["peInstrument"] = instrument
                entry["peLtp"] = quote.get("last_price")
                entry["peOi"] = quote.get("oi")
                entry["peVolume"] = quote.get("volume")
                entry["peChange"] = quote.get("change")

        return [buckets[key] for key in sorted(buckets)]

    def depth(self, instrument_token: int) -> dict[str, Any]:
        self._ensure_instruments_loaded()
        instrument = self._instrument_by_token.get(instrument_token)
        if instrument is None:
            raise ValueError(f"Instrument token {instrument_token} was not found.")

        kite = self._get_kite()
        quote_key = _quote_key_for_instrument(instrument)
        quote = kite.quote([quote_key]).get(quote_key) or {}
        depth = quote.get("depth") or {}
        return {
            "instrument_token": instrument_token,
            "tradingsymbol": instrument["tradingsymbol"],
            "last_price": _as_float(quote.get("last_price")) or 0.0,
            "bids": [_normalize_depth_level(item) for item in depth.get("buy", [])[:5]],
            "asks": [_normalize_depth_level(item) for item in depth.get("sell", [])[:5]],
        }

    def place_order(self, payload: dict[str, Any]) -> dict[str, Any]:
        kite = self._get_kite()

        side = str(payload.get("side") or "BUY").strip().upper()
        exchange = str(payload.get("exchange") or "").strip().upper()
        tradingsymbol = str(payload.get("tradingsymbol") or "").strip().upper()
        product = str(payload.get("product") or "MIS").strip().upper()
        order_type = str(payload.get("order_type") or "MARKET").strip().upper()
        validity = str(payload.get("validity") or "DAY").strip().upper()
        quantity = int(payload.get("quantity") or 0)
        if not tradingsymbol:
            raise ValueError("tradingsymbol is required.")
        if quantity <= 0:
            raise ValueError("quantity must be greater than 0.")

        order_args: dict[str, Any] = {
            "variety": kite.VARIETY_REGULAR,
            "exchange": exchange,
            "tradingsymbol": tradingsymbol,
            "transaction_type": getattr(kite, f"TRANSACTION_TYPE_{side}"),
            "quantity": quantity,
            "product": getattr(kite, f"PRODUCT_{product}"),
            "order_type": getattr(kite, f"ORDER_TYPE_{order_type.replace('-', '')}"),
            "validity": validity,
        }

        price = payload.get("price")
        trigger_price = payload.get("trigger_price")
        if price not in {None, ""}:
            order_args["price"] = float(price)
        if trigger_price not in {None, ""}:
            order_args["trigger_price"] = float(trigger_price)

        order_id = kite.place_order(**order_args)
        return {
            "ok": True,
            "message": f"{side} order submitted for {tradingsymbol}. Order id: {order_id}",
            "order_id": order_id,
        }

    def save_watchlist(self, payload: Any) -> dict[str, Any]:
        target = self.options.settings.watchlist_path
        target.write_text(json.dumps(payload, indent=2))
        return {"ok": True, "message": f"Watchlist saved to {target}"}

    def load_watchlist(self) -> Any:
        target = self.options.settings.watchlist_path
        if not target.exists():
            return []
        return json.loads(target.read_text())

    def _get_kite(self) -> Any:
        if self._kite is not None:
            return self._kite
        if KiteConnect is None:
            raise RuntimeError("kiteconnect is not installed. Run `pip install -r requirements.txt`.")

        auth = AuthManager(self.options.settings)
        access_token = auth.get_access_token(auto_login=self.options.login_if_needed)
        kite = KiteConnect(api_key=self.options.settings.api_key)
        kite.set_access_token(access_token)
        self._kite = kite
        return kite

    def _ensure_instruments_loaded(self) -> None:
        if self._raw_instruments is not None:
            return

        kite = self._get_kite()
        catalog = InstrumentCatalog.from_kite(kite)
        self._instrument_catalog = catalog

        raw_rows: list[dict[str, Any]] = []
        symbol_index: dict[str, dict[str, Any]] = {}
        token_index: dict[int, dict[str, Any]] = {}
        for exchange in ("NSE", "BSE", "NFO", "MCX", "CDS"):
            try:
                payload = kite.instruments(exchange)
            except Exception:
                continue
            for row in payload:
                normalized = _normalize_instrument_payload(row)
                if not normalized:
                    continue
                raw_rows.append(normalized)
                symbol_index[normalized["tradingsymbol"]] = normalized
                token_index[normalized["instrument_token"]] = normalized

        # Include any catalog rows that came from the legacy file but are not in the live dump.
        for row in catalog.rows:
            if row.instrument_token in token_index:
                continue
            normalized = {
                "instrument_token": row.instrument_token,
                "exchange_token": 0,
                "tradingsymbol": row.tradingsymbol,
                "name": row.name,
                "last_price": 0.0,
                "expiry": row.expiry.isoformat() if row.expiry else None,
                "strike": row.strike,
                "tick_size": 0.05,
                "lot_size": row.lot_size or 1,
                "instrument_type": row.instrument_type,
                "segment": row.segment,
                "exchange": row.exchange,
            }
            raw_rows.append(normalized)
            symbol_index[normalized["tradingsymbol"]] = normalized
            token_index[normalized["instrument_token"]] = normalized

        self._raw_instruments = raw_rows
        self._instrument_by_symbol = symbol_index
        self._instrument_by_token = token_index


def run_api_server(options: APIOptions) -> None:
    api = ZerodhaFrontendAPI(options)
    handler = _build_handler(api)
    server = ThreadingHTTPServer((options.host, options.port), handler)
    LOGGER.info("Starting frontend API server at http://%s:%s", options.host, options.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        LOGGER.info("Stopping frontend API server")
    finally:
        server.server_close()


def _build_handler(api: ZerodhaFrontendAPI) -> type[BaseHTTPRequestHandler]:
    class APIHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            try:
                if parsed.path == "/api/health":
                    self._send_json({"ok": True, "status": "healthy"})
                    return
                if parsed.path == "/api/profile":
                    self._send_json(api.profile())
                    return
                if parsed.path == "/api/instruments":
                    self._send_json(api.instruments())
                    return
                if parsed.path == "/api/quote":
                    params = parse_qs(parsed.query)
                    raw_symbols = params.get("symbols", [""])[0]
                    symbols = [item.strip().upper() for item in raw_symbols.split(",") if item.strip()]
                    self._send_json(api.quote_map(symbols))
                    return
                if parsed.path.startswith("/api/historical/"):
                    params = parse_qs(parsed.query)
                    token_text = parsed.path.rsplit("/", 1)[-1]
                    interval = params.get("interval", ["minute"])[0]
                    from_value = params.get("from", [None])[0]
                    to_value = params.get("to", [None])[0]
                    self._send_json(api.historical(int(token_text), interval, from_value, to_value))
                    return
                if parsed.path == "/api/option-chain":
                    params = parse_qs(parsed.query)
                    underlying = params.get("underlying", [""])[0]
                    expiry = params.get("expiry", [""])[0]
                    self._send_json(api.option_chain(underlying, expiry))
                    return
                if parsed.path == "/api/depth":
                    params = parse_qs(parsed.query)
                    instrument_token = int(params.get("instrumentToken", ["0"])[0])
                    self._send_json(api.depth(instrument_token))
                    return
                if parsed.path == "/api/watchlist":
                    self._send_json(api.load_watchlist())
                    return
            except Exception as exc:
                if _is_client_disconnect(exc):
                    LOGGER.debug("Client disconnected during GET %s", parsed.path)
                    return
                LOGGER.exception("API GET failed")
                self._send_json({"ok": False, "error": str(exc)}, status=500)
                return
            self.send_error(404, "Not found")

        def do_POST(self) -> None:
            parsed = urlparse(self.path)
            try:
                if parsed.path == "/api/watchlist":
                    self._send_json(api.save_watchlist(self._read_json()))
                    return
                if parsed.path == "/api/orders":
                    self._send_json(api.place_order(self._read_json()))
                    return
            except Exception as exc:
                if _is_client_disconnect(exc):
                    LOGGER.debug("Client disconnected during POST %s", parsed.path)
                    return
                LOGGER.exception("API POST failed")
                self._send_json({"ok": False, "error": str(exc)}, status=500)
                return
            self.send_error(404, "Not found")

        def log_message(self, format: str, *args: Any) -> None:
            LOGGER.debug(format, *args)

        def _read_json(self) -> Any:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0:
                return {}
            return json.loads(self.rfile.read(length).decode("utf-8"))

        def _send_json(self, payload: Any, *, status: int = 200) -> None:
            encoded = json.dumps(payload).encode("utf-8")
            try:
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)
            except Exception as exc:
                if _is_client_disconnect(exc):
                    LOGGER.debug("Client disconnected before response completed")
                    return
                raise

    return APIHandler


def _is_client_disconnect(exc: Exception) -> bool:
    return isinstance(exc, (BrokenPipeError, ConnectionResetError))


def _normalize_instrument_payload(row: dict[str, Any]) -> dict[str, Any] | None:
    tradingsymbol = str(row.get("tradingsymbol") or "").strip().upper()
    exchange = str(row.get("exchange") or "").strip().upper()
    if not tradingsymbol or not exchange:
        return None

    expiry = row.get("expiry")
    if hasattr(expiry, "isoformat"):
        expiry_value = expiry.isoformat()
    else:
        expiry_value = str(expiry).strip() if expiry else None

    return {
        "instrument_token": int(row.get("instrument_token") or 0),
        "exchange_token": int(row.get("exchange_token") or 0),
        "tradingsymbol": tradingsymbol,
        "name": str(row.get("name") or tradingsymbol).strip().upper(),
        "last_price": _as_float(row.get("last_price")) or 0.0,
        "expiry": expiry_value,
        "strike": _as_float(row.get("strike")),
        "tick_size": _as_float(row.get("tick_size")) or 0.05,
        "lot_size": _as_int(row.get("lot_size")) or 1,
        "instrument_type": str(row.get("instrument_type") or "").strip().upper(),
        "segment": str(row.get("segment") or "").strip().upper(),
        "exchange": exchange,
    }


def _quote_key_for_instrument(instrument: dict[str, Any]) -> str:
    return f"{instrument['exchange']}:{instrument['tradingsymbol']}"


def _normalize_candle(row: dict[str, Any]) -> dict[str, Any]:
    candle_time = row.get("date")
    if isinstance(candle_time, str):
        iso_time = candle_time
    else:
        iso_time = candle_time.isoformat()
    return {
        "time": iso_time,
        "open": _as_float(row.get("open")) or 0.0,
        "high": _as_float(row.get("high")) or 0.0,
        "low": _as_float(row.get("low")) or 0.0,
        "close": _as_float(row.get("close")) or 0.0,
        "volume": _as_int(row.get("volume")) or 0,
    }


def _parse_datetime_param(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value)


def _interval_window(interval: str) -> timedelta:
    if interval == "5second":
        return timedelta(hours=4)
    if interval == "10second":
        return timedelta(hours=6)
    if interval == "15second":
        return timedelta(hours=8)
    if interval == "30second":
        return timedelta(hours=12)
    if interval == "minute":
        return _history_window(1)
    if interval == "2minute":
        return _history_window(2)
    if interval == "3minute":
        return _history_window(3)
    if interval == "4minute":
        return _history_window(4)
    if interval == "5minute":
        return _history_window(5)
    if interval == "10minute":
        return _history_window(10)
    if interval == "15minute":
        return _history_window(15)
    if interval == "30minute":
        return _history_window(30)
    if interval == "60minute":
        return _history_window(60)
    if interval == "week":
        return timedelta(days=365 * 2)
    return timedelta(days=365)


def _source_interval(interval: str) -> str:
    if interval in {"5second", "10second", "15second", "30second", "2minute", "4minute"}:
        return "minute"
    if interval == "week":
        return "day"
    return interval


def _transform_rows_for_interval(rows: list[dict[str, Any]], interval: str) -> list[dict[str, Any]]:
    if interval in {"5second", "10second", "15second", "30second"}:
        return _expand_minute_rows(rows, int(interval.removesuffix("second")))
    if interval in {"2minute", "4minute"}:
        return _resample_rows_by_minutes(rows, int(interval.removesuffix("minute")))
    if interval == "week":
        return _resample_rows_by_week(rows)
    return rows


def _row_time(row: dict[str, Any]) -> datetime:
    value = row.get("date")
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value))


def _resample_rows_by_minutes(rows: list[dict[str, Any]], interval_minutes: int) -> list[dict[str, Any]]:
    if not rows:
        return []

    anchor_time = _row_time(rows[0]).replace(second=0, microsecond=0)
    buckets: dict[datetime, list[dict[str, Any]]] = {}
    for row in rows:
        row_time = _row_time(row)
        elapsed_minutes = int((row_time.replace(second=0, microsecond=0) - anchor_time).total_seconds() // 60)
        bucket_time = anchor_time + timedelta(minutes=(elapsed_minutes // interval_minutes) * interval_minutes)
        buckets.setdefault(bucket_time, []).append(row)

    return [_merge_bucket(bucket_time, buckets[bucket_time]) for bucket_time in sorted(buckets)]


def _resample_rows_by_week(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[datetime, list[dict[str, Any]]] = {}
    for row in rows:
        row_time = _row_time(row)
        bucket_time = (row_time - timedelta(days=row_time.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        buckets.setdefault(bucket_time, []).append(row)

    return [_merge_bucket(bucket_time, buckets[bucket_time]) for bucket_time in sorted(buckets)]


def _merge_bucket(bucket_time: datetime, bucket: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "date": bucket_time,
        "open": _as_float(bucket[0].get("open")) or 0.0,
        "high": max(_as_float(row.get("high")) or 0.0 for row in bucket),
        "low": min(_as_float(row.get("low")) or 0.0 for row in bucket),
        "close": _as_float(bucket[-1].get("close")) or 0.0,
        "volume": sum(_as_int(row.get("volume")) or 0 for row in bucket),
    }


def _expand_minute_rows(rows: list[dict[str, Any]], seconds_per_candle: int) -> list[dict[str, Any]]:
    if not rows:
        return []

    bars_per_minute = max(1, 60 // seconds_per_candle)
    expanded: list[dict[str, Any]] = []

    for row in rows:
        base_time = _row_time(row).replace(second=0, microsecond=0)
        open_price = _as_float(row.get("open")) or 0.0
        high_price = _as_float(row.get("high")) or open_price
        low_price = _as_float(row.get("low")) or open_price
        close_price = _as_float(row.get("close")) or open_price
        volume = _as_int(row.get("volume")) or 0

        high_index = max(1, bars_per_minute // 3)
        low_index = max(high_index + 1, (2 * bars_per_minute) // 3)
        anchor_positions = [0, high_index, low_index, bars_per_minute]
        anchor_values = [open_price, high_price, low_price, close_price]

        def sample(position: int) -> float:
            for index in range(len(anchor_positions) - 1):
                left = anchor_positions[index]
                right = anchor_positions[index + 1]
                if left <= position <= right:
                    start = anchor_values[index]
                    end = anchor_values[index + 1]
                    span = max(1, right - left)
                    ratio = (position - left) / span
                    return start + (end - start) * ratio
            return close_price

        for index in range(bars_per_minute):
            bar_open = sample(index)
            bar_close = sample(index + 1)
            bar_high = max(bar_open, bar_close)
            bar_low = min(bar_open, bar_close)
            if index == high_index - 1 or index == high_index:
                bar_high = max(bar_high, high_price)
            if index == low_index - 1 or index == low_index:
                bar_low = min(bar_low, low_price)

            expanded.append(
                {
                    "date": base_time + timedelta(seconds=index * seconds_per_candle),
                    "open": round(bar_open, 2),
                    "high": round(bar_high, 2),
                    "low": round(bar_low, 2),
                    "close": round(bar_close, 2),
                    "volume": volume // bars_per_minute,
                }
            )

    return expanded


def _as_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _normalize_depth_level(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "price": _as_float(item.get("price")) or 0.0,
        "quantity": _as_int(item.get("quantity")) or 0,
        "orders": _as_int(item.get("orders")) or 0,
    }
