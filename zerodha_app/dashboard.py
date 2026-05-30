from __future__ import annotations

import json
import logging
import math
import threading
import time
import webbrowser
from dataclasses import dataclass
from datetime import date, datetime, time as datetime_time, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

from zerodha_app.auth import AuthManager
from zerodha_app.config import Settings, load_watchlist
from zerodha_app.instruments import InstrumentCatalog
from zerodha_app.streamer import CandleSeries, LiveTicker

try:
    from kiteconnect import KiteConnect
except ModuleNotFoundError:
    KiteConnect = None


LOGGER = logging.getLogger(__name__)
SUPPORTED_INTERVALS = {1, 2, 3, 4, 5, 10, 15, 30, 60}
KITE_HISTORICAL_INTERVALS = {
    1: "minute",
    3: "3minute",
    5: "5minute",
    10: "10minute",
    15: "15minute",
    30: "30minute",
    60: "60minute",
}


@dataclass(slots=True)
class DashboardOptions:
    settings: Settings | None
    interval_minutes: int
    host: str
    port: int
    mode: str = "quote"
    demo: bool = False
    login_if_needed: bool = False
    enable_trading: bool = False
    stock: str | None = None
    exchange: str = "NSE"
    demo_symbol: str = "RELIANCE"
    demo_token: int = 738561


class CandleDashboard:
    def __init__(self, options: DashboardOptions) -> None:
        if options.interval_minutes not in SUPPORTED_INTERVALS:
            raise ValueError("Interval must be one of: 1,2,3,4,5,10,15,30,60")

        self.options = options
        self._lock = threading.Lock()
        self._latest: dict[str, dict[str, Any]] = {}
        self._candles: dict[str, list[dict[str, Any]]] = {}
        self._latency: dict[str, Any] = {}
        self._status = "starting"
        self._error: str | None = None
        self._order_message: str | None = None
        self._source = "demo" if options.demo else "zerodha"
        self._stop_event = threading.Event()
        self._ticker: LiveTicker | None = None
        self._kite: Any | None = None
        self._symbol_exchanges: dict[str, str] = {}
        self._worker: threading.Thread | None = None
        self._instrument_catalog: InstrumentCatalog | None = None
        self._selected_contract: dict[str, Any] | None = None

    def start(self) -> None:
        target = self._run_demo if self.options.demo else self._run_live
        self._worker = threading.Thread(target=target, daemon=True)
        self._worker.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._ticker is not None:
            self._ticker.close()

    def load_stock(self, stock: str, exchange: str) -> dict[str, Any]:
        if self.options.demo:
            return {"ok": False, "message": "Demo mode cannot load live stocks."}
        if self._kite is None:
            return {"ok": False, "message": "Kite session is not ready yet."}

        try:
            token, symbol = _resolve_instrument_token(self._kite, stock, exchange)
            self._start_symbol_stream(token=token, symbol=symbol, exchange=exchange.strip().upper())
        except Exception as exc:
            message = f"Could not load stock: {exc}"
            self._set_payload(status="error", error=message)
            return {"ok": False, "message": message}

        return {"ok": True, "message": f"Loaded {exchange.strip().upper()}:{symbol}", "symbol": symbol}

    def search_instruments(self, query: str, kind: str = "options") -> dict[str, Any]:
        catalog = self._get_instrument_catalog()
        matches = catalog.search(query, kind=kind)
        total = sum(len(items) for items in matches.values())
        return {
            "ok": True,
            "query": query.strip().upper(),
            "kind": kind,
            "total": total,
            "matches": matches,
        }

    def load_instrument(self, instrument_token: int) -> dict[str, Any]:
        if self.options.demo:
            return {"ok": False, "message": "Demo mode cannot load live contracts."}

        row = self._get_instrument_catalog().get_by_token(instrument_token)
        if row is None:
            return {"ok": False, "message": f"Could not find instrument token {instrument_token}."}

        self._start_symbol_stream(
            token=row.instrument_token,
            symbol=row.tradingsymbol,
            exchange=row.exchange,
        )
        self._selected_contract = row.to_dict()
        return {
            "ok": True,
            "message": f"Loaded {row.display_name}",
            "symbol": row.tradingsymbol,
            "exchange": row.exchange,
            "instrument_token": row.instrument_token,
        }

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "source": self._source,
                "status": self._status,
                "error": self._error,
                "order_message": self._order_message,
                "trading_enabled": self.options.enable_trading and not self.options.demo,
                "interval_minutes": self.options.interval_minutes,
                "updated_at": datetime.now().isoformat(timespec="seconds"),
                "latest": self._latest,
                "candles": self._candles,
                "latency": self._latency,
                "exchanges": self._symbol_exchanges,
                "selected_contract": self._selected_contract,
            }

    def _set_payload(
        self,
        *,
        status: str,
        latest: dict[str, dict[str, Any]] | None = None,
        candles: dict[str, list[dict[str, Any]]] | None = None,
        latency: dict[str, Any] | None = None,
        error: str | None = None,
        order_message: str | None = None,
    ) -> None:
        with self._lock:
            self._status = status
            self._error = error
            if order_message is not None:
                self._order_message = order_message
            if latest is not None:
                self._latest = latest
            if candles is not None:
                self._candles = candles
            if latency is not None:
                self._latency = latency

    def place_buy_order(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self.options.demo:
            return {"ok": False, "message": "Demo mode cannot place live orders."}
        if not self.options.enable_trading:
            return {"ok": False, "message": "Restart dashboard with --enable-trading to place orders."}
        if self._kite is None:
            return {"ok": False, "message": "Kite session is not ready yet."}

        selected_contract = self._selected_contract or {}
        symbol = str(
            payload.get("symbol")
            or selected_contract.get("tradingsymbol")
            or ""
        ).strip().upper()
        contract_kind = str(selected_contract.get("kind") or "cash").lower()
        exchange = str(
            payload.get("exchange")
            or selected_contract.get("exchange")
            or self._symbol_exchanges.get(symbol, "NSE")
        ).strip().upper()
        lot_size = int(selected_contract.get("lot_size") or 1)
        lots_value = payload.get("lots")
        try:
            lots = int(lots_value) if lots_value not in {None, ""} else 0
        except (TypeError, ValueError):
            return {"ok": False, "message": "Lots must be a whole number."}
        quantity_value = payload.get("quantity")
        try:
            quantity = int(quantity_value or 0)
        except (TypeError, ValueError):
            return {"ok": False, "message": "Quantity must be a whole number."}
        if contract_kind in {"futures", "options"}:
            if lots <= 0:
                return {"ok": False, "message": "Lots must be greater than 0 for derivatives."}
            quantity = lots * max(1, lot_size)
        product = str(
            payload.get("product")
            or ("NRML" if contract_kind in {"futures", "options"} else "CNC")
        ).strip().upper()
        order_type = str(payload.get("order_type") or "MARKET").strip().upper()
        price = payload.get("price")
        trigger_price = payload.get("trigger_price")

        if not symbol:
            return {"ok": False, "message": "Symbol is required."}
        if quantity <= 0:
            return {"ok": False, "message": "Quantity must be greater than 0."}
        valid_products = {"CNC", "MIS"} if contract_kind == "cash" else {"NRML", "MIS"}
        if product not in valid_products:
            allowed = " or ".join(sorted(valid_products))
            return {"ok": False, "message": f"Product must be {allowed}."}
        if order_type not in {"MARKET", "LIMIT", "SL", "SL-M"}:
            return {"ok": False, "message": "Order type must be MARKET, LIMIT, SL, or SL-M."}
        if order_type in {"LIMIT", "SL"} and price in {None, ""}:
            return {"ok": False, "message": "Price is required for LIMIT and SL orders."}
        if order_type in {"SL", "SL-M"} and trigger_price in {None, ""}:
            return {"ok": False, "message": "Trigger price is required for SL and SL-M orders."}

        valid_exchanges = {"NSE", "BSE", "NFO", "MCX", "CDS"}
        if exchange not in valid_exchanges:
            return {"ok": False, "message": "Unsupported exchange for order placement."}

        order_args: dict[str, Any] = {
            "variety": self._kite.VARIETY_REGULAR,
            "exchange": exchange,
            "tradingsymbol": symbol,
            "transaction_type": self._kite.TRANSACTION_TYPE_BUY,
            "quantity": quantity,
            "product": getattr(self._kite, f"PRODUCT_{product}"),
            "order_type": getattr(self._kite, f"ORDER_TYPE_{order_type.replace('-', '')}"),
        }
        if order_type in {"LIMIT", "SL"}:
            order_args["price"] = float(price)
        if order_type in {"SL", "SL-M"}:
            order_args["trigger_price"] = float(trigger_price)

        try:
            order_id = self._kite.place_order(**order_args)
        except Exception as exc:
            message = f"Buy order failed: {exc}"
            self._set_payload(status=self._status, order_message=message)
            return {"ok": False, "message": message}

        quantity_text = (
            f"{lots} lot(s), quantity {quantity}"
            if contract_kind in {"futures", "options"}
            else f"quantity {quantity}"
        )
        message = f"Buy order placed for {symbol} ({quantity_text}). Order id: {order_id}"
        self._set_payload(status=self._status, order_message=message)
        return {"ok": True, "message": message, "order_id": order_id}

    def _run_demo(self) -> None:
        symbol = self.options.demo_symbol
        token = self.options.demo_token
        interval = self.options.interval_minutes
        series = CandleSeries(interval_minutes=interval)
        seed_rows = _build_demo_rows(interval)
        series.seed(symbol, seed_rows, active_last=True)
        latest_price = float(seed_rows[-1]["close"])

        while not self._stop_event.is_set():
            now = datetime.now().replace(microsecond=0)
            latest_price = round(latest_price + math.sin(time.time()) * 0.35, 2)
            series.update(symbol, latest_price, now, 1)
            latest = {
                symbol: {
                    "instrument_token": token,
                    "last_price": latest_price,
                    "timestamp": now.isoformat(),
                    "ohlc": None,
                }
            }
            self._set_payload(
                status="demo-running",
                latest=latest,
                candles=series.snapshot(),
                latency={"overall": {}, "symbols": {}},
            )
            time.sleep(1)

    def _run_live(self) -> None:
        if self.options.settings is None:
            self._set_payload(status="error", error="Missing live settings.")
            return
        if KiteConnect is None:
            self._set_payload(
                status="error",
                error="kiteconnect is not installed. Run `pip install -r requirements.txt`.",
            )
            return

        try:
            settings = self.options.settings
            auth = AuthManager(settings)
            access_token = auth.get_access_token(auto_login=self.options.login_if_needed)
            self._kite = KiteConnect(api_key=settings.api_key)
            self._kite.set_access_token(access_token)
            self._instrument_catalog = InstrumentCatalog.from_kite(self._kite)
            watchlist = self._resolve_live_watchlist(settings, self._kite)
            self._start_watchlist_stream(watchlist)

            while not self._stop_event.is_set():
                ticker = self._ticker
                if ticker is not None:
                    self._set_payload(
                        status="live",
                        latest=ticker.store.latest,
                        candles=ticker.candle_snapshot(),
                        latency={
                            "overall": ticker.latency_summary(),
                            "symbols": ticker.latency_snapshot(),
                        },
                    )
                time.sleep(1)
        except Exception as exc:
            LOGGER.exception("Dashboard live feed failed")
            self._set_payload(status="error", error=str(exc))
        finally:
            if self._ticker is not None:
                self._ticker.close()

    def _resolve_live_watchlist(self, settings: Settings, kite: Any) -> dict[int, str]:
        if self.options.stock:
            exchange = self.options.exchange.strip().upper()
            token, symbol = _resolve_instrument_token(kite, self.options.stock, exchange)
            self._symbol_exchanges = {symbol: exchange}
            return {token: symbol}

        try:
            watchlist = load_watchlist(settings)
        except ValueError as exc:
            LOGGER.info("Dashboard started without an initial watchlist: %s", exc)
            self._symbol_exchanges = {}
            return {}

        self._symbol_exchanges = {symbol: "NSE" for symbol in watchlist.values()}
        return watchlist

    def _start_symbol_stream(self, *, token: int, symbol: str, exchange: str) -> None:
        self._symbol_exchanges = {symbol: exchange}
        self._start_watchlist_stream({token: symbol})

    def _start_watchlist_stream(self, watchlist: dict[int, str]) -> None:
        if self.options.settings is None:
            raise ValueError("Missing live settings.")
        if not watchlist:
            self._set_payload(
                status="ready",
                latest={},
                candles={},
                latency={"overall": {}, "symbols": {}},
                error=None,
                order_message="Search an underlying and load an option contract.",
            )
            return
        if self._ticker is not None:
            self._ticker.close()

        access_token = AuthManager(self.options.settings).get_access_token(
            auto_login=self.options.login_if_needed
        )
        ticker = LiveTicker(
            api_key=self.options.settings.api_key,
            access_token=access_token,
            watchlist=watchlist,
            mode=self.options.mode,
            candle_interval_minutes=self.options.interval_minutes,
        )
        self._ticker = ticker
        first_token, first_symbol = next(iter(watchlist.items()))
        self._selected_contract = _selected_contract_payload(
            self._get_instrument_catalog().get_by_token(first_token),
            fallback_symbol=first_symbol,
            fallback_exchange=self._symbol_exchanges.get(first_symbol, "NSE"),
            fallback_token=first_token,
        )
        _seed_recent_history_from_kite(
            ticker=ticker,
            api_key=self.options.settings.api_key,
            access_token=access_token,
            watchlist=watchlist,
            interval_minutes=self.options.interval_minutes,
        )
        self._set_payload(
            status="connecting",
            latest=ticker.store.latest,
            candles=ticker.candle_snapshot(),
            latency={
                "overall": ticker.latency_summary(),
                "symbols": ticker.latency_snapshot(),
            },
            error=None,
        )
        ticker._ticker.connect(threaded=True)
        ticker._wait_for_connection()

    def _get_instrument_catalog(self) -> InstrumentCatalog:
        if self._instrument_catalog is not None:
            return self._instrument_catalog
        self._instrument_catalog = InstrumentCatalog.from_legacy_file()
        return self._instrument_catalog


def run_dashboard(options: DashboardOptions) -> None:
    dashboard = CandleDashboard(options)
    handler = _build_handler(dashboard)
    server = ThreadingHTTPServer((options.host, options.port), handler)
    dashboard.start()
    url = f"http://{options.host}:{options.port}"
    LOGGER.info("Opening candle dashboard at %s", url)
    webbrowser.open(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        LOGGER.info("Stopping candle dashboard")
    finally:
        dashboard.stop()
        server.server_close()


def _seed_recent_history_from_kite(
    *,
    ticker: LiveTicker,
    api_key: str,
    access_token: str,
    watchlist: dict[int, str],
    interval_minutes: int,
) -> None:
    if ticker.candles is None:
        return

    kite = KiteConnect(api_key=api_key)
    kite.set_access_token(access_token)
    to_time = datetime.now()
    from_time = to_time - _history_window(interval_minutes)
    kite_interval = KITE_HISTORICAL_INTERVALS.get(interval_minutes, "minute")

    for token, symbol in watchlist.items():
        rows = _load_history_with_fallback(
            kite=kite,
            token=token,
            from_time=from_time,
            to_time=to_time,
            kite_interval=kite_interval,
        )
        if not rows:
            continue
        if interval_minutes in KITE_HISTORICAL_INTERVALS:
            ticker.candles.seed(symbol, rows, active_last=True)
        else:
            ticker.candles.seed(symbol, _resample_rows(rows, interval_minutes), active_last=True)


def _history_window(interval_minutes: int) -> timedelta:
    if interval_minutes <= 5:
        return timedelta(days=7)
    if interval_minutes <= 15:
        return timedelta(days=21)
    return timedelta(days=60)


def _load_history_with_fallback(
    *,
    kite: Any,
    token: int,
    from_time: datetime,
    to_time: datetime,
    kite_interval: str,
) -> list[dict[str, Any]]:
    rows = kite.historical_data(token, from_time, to_time, kite_interval)
    if len(rows) >= 3:
        return rows

    if kite_interval != "day":
        fallback_days = 30 if kite_interval == "minute" else 90
        fallback_from = to_time - timedelta(days=fallback_days)
        try:
            expanded_rows = kite.historical_data(token, fallback_from, to_time, kite_interval)
        except Exception:
            return rows
        return expanded_rows if len(expanded_rows) > len(rows) else rows

    fallback_from = to_time - timedelta(days=180)
    try:
        fallback_rows = kite.historical_data(token, fallback_from, to_time, "day")
    except Exception:
        return rows

    return fallback_rows if len(fallback_rows) > len(rows) else rows


def _resolve_instrument_token(kite: Any, stock: str, exchange: str) -> tuple[int, str]:
    normalized_exchange = exchange.strip().upper()
    normalized_stock = stock.strip().upper()
    if normalized_exchange not in {"NSE", "BSE"}:
        raise ValueError("Exchange must be NSE or BSE.")
    if not normalized_stock:
        raise ValueError("Stock symbol is required.")

    matches = [
        instrument
        for instrument in kite.instruments(normalized_exchange)
        if str(instrument.get("tradingsymbol", "")).upper() == normalized_stock
        and str(instrument.get("instrument_type", "")).upper() == "EQ"
    ]
    if not matches:
        raise ValueError(f"Could not find {normalized_exchange}:{normalized_stock} equity instrument.")

    instrument = matches[0]
    return int(instrument["instrument_token"]), str(instrument["tradingsymbol"]).upper()


def _selected_contract_payload(
    row: Any,
    *,
    fallback_symbol: str,
    fallback_exchange: str,
    fallback_token: int,
) -> dict[str, Any]:
    if row is not None:
        return row.to_dict()
    return {
        "instrument_token": fallback_token,
        "tradingsymbol": fallback_symbol,
        "display_name": f"{fallback_exchange}:{fallback_symbol}",
        "exchange": fallback_exchange,
        "segment": fallback_exchange,
        "instrument_type": "",
        "name": fallback_symbol,
        "expiry": None,
        "strike": None,
        "lot_size": None,
        "kind": "other",
    }


def _build_demo_rows(interval_minutes: int) -> list[dict[str, Any]]:
    market_open = datetime.combine(date.today(), datetime_time(hour=9, minute=15))
    now = datetime.now().replace(second=0, microsecond=0)
    candles = max(8, min(80, int((now - market_open).total_seconds() // 60 // interval_minutes) + 1))
    start = max(market_open, now - timedelta(minutes=(candles - 1) * interval_minutes))
    price = 100.0
    rows: list[dict[str, Any]] = []

    for index in range(candles):
        candle_time = start + timedelta(minutes=index * interval_minutes)
        open_price = price
        close_price = round(open_price + math.sin(index / 2) * 1.2, 2)
        high_price = round(max(open_price, close_price) + 0.65, 2)
        low_price = round(min(open_price, close_price) - 0.55, 2)
        rows.append(
            {
                "date": candle_time,
                "open": round(open_price, 2),
                "high": high_price,
                "low": low_price,
                "close": close_price,
                "volume": 1000 + index * 35,
            }
        )
        price = close_price

    return rows


def _resample_rows(rows: list[dict[str, Any]], interval_minutes: int) -> list[dict[str, Any]]:
    buckets: dict[datetime, list[dict[str, Any]]] = {}
    for row in rows:
        row_time = row["date"]
        bucket_time = row_time.replace(
            minute=(row_time.minute // interval_minutes) * interval_minutes,
            second=0,
            microsecond=0,
        )
        buckets.setdefault(bucket_time, []).append(row)

    output: list[dict[str, Any]] = []
    for bucket_time in sorted(buckets):
        bucket = buckets[bucket_time]
        output.append(
            {
                "date": bucket_time,
                "open": bucket[0]["open"],
                "high": max(row["high"] for row in bucket),
                "low": min(row["low"] for row in bucket),
                "close": bucket[-1]["close"],
                "volume": sum(int(row.get("volume") or 0) for row in bucket),
            }
        )
    return output


def _build_handler(dashboard: CandleDashboard) -> type[BaseHTTPRequestHandler]:
    class DashboardHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            if parsed.path == "/":
                self._send_html(_HTML)
                return
            if parsed.path == "/api/state":
                self._send_json(dashboard.snapshot())
                return
            if parsed.path == "/api/instruments/search":
                params = parse_qs(parsed.query)
                query = params.get("query", [""])[0]
                kind = params.get("kind", ["all"])[0]
                self._send_json(dashboard.search_instruments(query, kind))
                return
            self.send_error(404, "Not found")

        def do_POST(self) -> None:
            parsed = urlparse(self.path)
            if parsed.path == "/api/orders/buy":
                payload = self._read_json()
                self._send_json(dashboard.place_buy_order(payload))
                return
            if parsed.path == "/api/stocks/load":
                payload = self._read_json()
                self._send_json(
                    dashboard.load_stock(
                        str(payload.get("stock") or ""),
                        str(payload.get("exchange") or "NSE"),
                    )
                )
                return
            if parsed.path == "/api/instruments/load":
                payload = self._read_json()
                self._send_json(dashboard.load_instrument(int(payload.get("instrument_token") or 0)))
                return
            self.send_error(404, "Not found")

        def log_message(self, format: str, *args: Any) -> None:
            LOGGER.debug(format, *args)

        def _send_html(self, body: str) -> None:
            encoded = body.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def _send_json(self, payload: dict[str, Any]) -> None:
            encoded = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def _read_json(self) -> dict[str, Any]:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0:
                return {}
            return json.loads(self.rfile.read(length).decode("utf-8"))

    return DashboardHandler


_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Derivatives Options Workspace</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #17202a;
      --muted: #607080;
      --line: #d8e0e7;
      --panel: #f6f8fa;
      --up: #11804b;
      --down: #c53b31;
      --accent: #145a7a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Avenir Next", "SF Pro Display", "Segoe UI", sans-serif;
      color: var(--ink);
      background: #f2f5f8;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 22px;
      border-bottom: 1px solid var(--line);
    }
    h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0;
    }
    .status {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--muted);
      font-size: 13px;
      white-space: nowrap;
    }
    .dot {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: var(--accent);
    }
    main {
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr) 310px;
      min-height: calc(100vh - 59px);
    }
    aside {
      padding: 14px;
      border-right: 1px solid var(--line);
      background:
        linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
      overflow: auto;
    }
    button {
      width: 100%;
      appearance: none;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--ink);
      padding: 10px 12px;
      border-radius: 8px;
      text-align: left;
      font-size: 14px;
      cursor: pointer;
      margin-bottom: 8px;
    }
    button.active {
      border-color: var(--accent);
      box-shadow: inset 3px 0 0 var(--accent);
      font-weight: 700;
    }
    .tool-button {
      margin-top: 12px;
      text-align: center;
    }
    label {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin: 12px 0 5px;
    }
    input, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 9px 10px;
      font-size: 14px;
      background: #fff;
      color: var(--ink);
    }
    .stock-panel, .buy-panel {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--line);
    }
    .stock-panel {
      margin-top: 0;
      padding-top: 0;
      border-top: 0;
    }
    .sidebar-tabs {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 16px;
    }
    .sidebar-tab {
      margin: 0;
      text-align: center;
      font-weight: 700;
      border-radius: 12px;
      background: #fff;
      color: var(--muted);
    }
    .sidebar-tab.active {
      border-color: var(--accent);
      background: rgba(20, 90, 122, 0.1);
      color: var(--accent);
      box-shadow: none;
    }
    .sidebar-panel {
      display: none;
    }
    .sidebar-panel.active {
      display: block;
    }
    .finder-card {
      border: 1px solid var(--line);
      border-radius: 14px;
      background:
        radial-gradient(circle at top right, rgba(20, 90, 122, 0.12), transparent 36%),
        linear-gradient(180deg, #ffffff 0%, #f8fbfd 100%);
      padding: 12px;
      box-shadow: 0 10px 24px rgba(23, 32, 42, 0.05);
      margin-bottom: 10px;
    }
    .finder-kicker {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--accent);
      font-weight: 700;
      margin-bottom: 6px;
    }
    .finder-heading {
      font-size: 16px;
      font-weight: 700;
      color: var(--ink);
      margin-bottom: 6px;
    }
    .finder-copy {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
      margin-bottom: 0;
    }
    .finder-meta {
      margin-top: 8px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.5;
    }
    .field-row {
      display: grid;
      grid-template-columns: 1fr 86px;
      gap: 8px;
      align-items: end;
    }
    .field-row-wide {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      align-items: end;
    }
    .market-switch {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }
    .market-switch.compact {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .market-chip {
      width: 100%;
      margin: 0;
      border-radius: 999px;
      text-align: center;
      padding: 9px 8px;
      font-size: 12px;
      font-weight: 700;
      color: var(--muted);
      background: #fff;
    }
    .market-chip.active {
      border-color: var(--accent);
      background: rgba(20, 90, 122, 0.08);
      color: var(--accent);
      box-shadow: none;
    }
    .results-panel {
      display: grid;
      gap: 8px;
      max-height: min(46vh, 520px);
      overflow: auto;
      padding-right: 2px;
    }
    .result-group {
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #fff;
      overflow: hidden;
    }
    .result-group-title {
      padding: 8px 10px;
      background: var(--panel);
      border-bottom: 1px solid var(--line);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
    }
    .result-item {
      width: 100%;
      margin: 0;
      border: 0;
      border-bottom: 1px solid var(--line);
      border-radius: 0;
      padding: 10px;
      background: #fff;
    }
    .result-item:last-child {
      border-bottom: 0;
    }
    .result-main {
      display: block;
      font-size: 13px;
      font-weight: 700;
      color: var(--ink);
      margin-bottom: 4px;
    }
    .result-sub {
      display: block;
      font-size: 12px;
      color: var(--muted);
      line-height: 1.45;
      white-space: normal;
    }
    .finder-help {
      margin-top: 8px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }
    .finder-filter-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 12px;
      margin-bottom: 12px;
    }
    .finder-filter-grid .full {
      grid-column: span 2;
    }
    .result-item.active {
      background: rgba(20, 90, 122, 0.08);
      box-shadow: inset 3px 0 0 var(--accent);
    }
    .chain-group {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: #fff;
      overflow: hidden;
      box-shadow: 0 10px 22px rgba(15, 23, 42, 0.04);
    }
    .chain-head {
      display: grid;
      grid-template-columns: 1fr 72px 1fr;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(180deg, #fbfdff 0%, #f4f8fb 100%);
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .chain-head .center {
      text-align: center;
    }
    .chain-row {
      display: grid;
      grid-template-columns: 1fr 72px 1fr;
      gap: 8px;
      padding: 8px 10px;
      border-bottom: 1px solid #edf2f7;
      align-items: stretch;
    }
    .chain-row:last-child {
      border-bottom: 0;
    }
    .chain-strike {
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      background: #f6f8fb;
      border: 1px solid #e8edf3;
      color: #314154;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.02em;
      padding: 0 6px;
    }
    .chain-leg {
      width: 100%;
      border-radius: 12px;
      border: 1px solid #e7edf3;
      background: #fff;
      padding: 10px 12px;
      min-height: 72px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 6px;
      box-shadow: none;
    }
    .chain-leg.empty {
      background: #f8fafc;
      border-style: dashed;
      color: #9aa8b7;
      cursor: default;
    }
    .chain-leg.call.active {
      border-color: rgba(17, 128, 75, 0.28);
      background: rgba(17, 128, 75, 0.08);
      box-shadow: inset 3px 0 0 #11804b;
    }
    .chain-leg.put.active {
      border-color: rgba(197, 59, 49, 0.28);
      background: rgba(197, 59, 49, 0.08);
      box-shadow: inset 3px 0 0 #c53b31;
    }
    .chain-topline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .chain-symbol {
      font-size: 12px;
      font-weight: 800;
      color: var(--ink);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chain-type {
      flex: 0 0 auto;
      border-radius: 999px;
      padding: 3px 7px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .chain-leg.call .chain-type {
      background: rgba(17, 128, 75, 0.1);
      color: #11804b;
    }
    .chain-leg.put .chain-type {
      background: rgba(197, 59, 49, 0.1);
      color: #c53b31;
    }
    .chain-meta {
      color: var(--muted);
      font-size: 11px;
      line-height: 1.45;
    }
    .chain-price {
      font-size: 16px;
      font-weight: 800;
      color: #1d2b3a;
    }
    .chain-actions {
      display: flex;
      gap: 6px;
      margin-top: 2px;
    }
    .mini-action {
      width: auto;
      margin: 0;
      border-radius: 10px;
      padding: 7px 10px;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      text-align: center;
      border: 1px solid #d6dee6;
      background: #fff;
      color: #355066;
      box-shadow: none;
    }
    .mini-action.primary {
      border-color: var(--accent);
      background: rgba(20, 90, 122, 0.1);
      color: var(--accent);
    }
    .watchlist-card {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: #fff;
      padding: 12px;
      box-shadow: 0 10px 22px rgba(15, 23, 42, 0.04);
    }
    .watchlist-list {
      display: grid;
      gap: 10px;
    }
    .watchlist-item {
      border: 1px solid #e5ebf1;
      border-radius: 12px;
      background: #fbfdff;
      padding: 10px;
    }
    .watchlist-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }
    .watchlist-name {
      font-size: 13px;
      font-weight: 800;
      color: var(--ink);
      line-height: 1.4;
      overflow-wrap: anywhere;
    }
    .watchlist-meta {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }
    .watchlist-actions {
      display: flex;
      gap: 6px;
      margin-top: 10px;
    }
    .result-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }
    .result-tag {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--muted);
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 700;
    }
    .workspace-snapshot {
      margin-top: 16px;
    }
    .workspace-snapshot .detail-value {
      font-size: 26px;
    }
    .detail-card.mini .detail-value {
      font-size: 18px;
    }
    .buy-button {
      margin-top: 12px;
      text-align: center;
      border-color: var(--up);
      background: var(--up);
      color: #fff;
      font-weight: 700;
    }
    .buy-button:disabled {
      border-color: var(--line);
      background: #eef2f5;
      color: var(--muted);
      cursor: not-allowed;
    }
    .message {
      margin-top: 10px;
      color: var(--accent);
      font-size: 13px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 12px;
      background: #fff;
      padding: 12px;
    }
    .card-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      margin-bottom: 10px;
      font-weight: 700;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .metric-item {
      border-radius: 10px;
      background: var(--panel);
      padding: 10px;
    }
    .metric-label {
      display: block;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      margin-bottom: 4px;
    }
    .metric-value {
      font-size: 16px;
      font-weight: 700;
      color: var(--ink);
    }
    .metric-subtext {
      margin-top: 8px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }
    .latency-chip-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .latency-chip {
      border-radius: 10px;
      padding: 10px;
      background: var(--panel);
      border: 1px solid transparent;
    }
    .latency-chip.good {
      border-color: rgba(17, 128, 75, 0.18);
      background: rgba(17, 128, 75, 0.08);
    }
    .latency-chip.warn {
      border-color: rgba(197, 142, 49, 0.22);
      background: rgba(197, 142, 49, 0.1);
    }
    .latency-chip.bad {
      border-color: rgba(197, 59, 49, 0.22);
      background: rgba(197, 59, 49, 0.08);
    }
    .chart-wrap {
      padding: 14px;
      min-width: 0;
      position: relative;
      background: linear-gradient(180deg, #f7fafc 0%, #ffffff 18%);
    }
    .chart-shell {
      border: 1px solid var(--line);
      border-radius: 16px;
      background: #fff;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
      overflow: hidden;
    }
    .chart-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 14px;
      border-bottom: 1px solid #e8edf3;
      background: linear-gradient(180deg, #ffffff 0%, #f9fbfd 100%);
    }
    .chart-tabs {
      display: flex;
      align-items: center;
      gap: 18px;
      font-size: 13px;
      font-weight: 700;
      color: var(--muted);
    }
    .chart-tab.active {
      color: #d16537;
    }
    .chart-symbol {
      font-size: 13px;
      font-weight: 800;
      color: var(--ink);
      white-space: nowrap;
    }
    .workspace {
      display: none;
    }
    .stocks-workspace.active {
      display: block;
    }
    .derivatives-workspace.active {
      display: block;
    }
    .chart-toolbar {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
      margin: 0;
      padding: 10px 14px 0;
    }
    .chart-toolbar button {
      width: auto;
      min-width: 38px;
      margin-bottom: 0;
      text-align: center;
      padding: 8px 11px;
      font-weight: 700;
    }
    .level-toggle {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      width: auto;
      margin: 0 auto 0 0;
      color: var(--muted);
      font-size: 13px;
      white-space: nowrap;
    }
    .level-toggle input {
      width: auto;
      margin: 0;
    }
    canvas {
      width: 100%;
      height: calc(100vh - 250px);
      min-height: 360px;
      display: block;
    }
    .tooltip {
      position: absolute;
      display: none;
      pointer-events: none;
      min-width: 180px;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.98);
      box-shadow: 0 10px 28px rgba(23, 32, 42, 0.12);
      color: var(--ink);
      font-size: 12px;
      line-height: 1.55;
      z-index: 3;
    }
    .tooltip strong {
      display: block;
      font-size: 13px;
      margin-bottom: 3px;
    }
    .error {
      color: var(--down);
      font-weight: 700;
      margin-top: 10px;
      overflow-wrap: anywhere;
    }
    .finder-toolbar {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
      align-items: end;
    }
    .finder-actions {
      display: flex;
      gap: 10px;
      align-items: center;
      justify-content: flex-end;
    }
    .finder-search-button {
      width: auto;
      min-width: 170px;
      margin: 0;
      text-align: center;
      border-color: var(--accent);
      background: var(--accent);
      color: #fff;
      font-weight: 700;
    }
    .finder-statbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }
    .finder-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      background: #fff;
      border: 1px solid var(--line);
      padding: 8px 12px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }
    .finder-section-title {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      font-weight: 700;
      margin-bottom: 8px;
    }
    .derivatives-workspace {
      padding: 18px;
      min-width: 0;
    }
    .derivatives-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.9fr);
      gap: 18px;
      align-items: start;
    }
    .derivatives-column {
      display: grid;
      gap: 16px;
      min-width: 0;
    }
    .workspace-hero {
      border: 1px solid var(--line);
      border-radius: 14px;
      background:
        radial-gradient(circle at top right, rgba(20, 90, 122, 0.14), transparent 34%),
        linear-gradient(180deg, #ffffff 0%, #f7fbfd 100%);
      padding: 14px;
      margin-bottom: 10px;
    }
    .workspace-kicker {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--accent);
      font-weight: 700;
      margin-bottom: 8px;
    }
    .workspace-title {
      font-size: 22px;
      font-weight: 700;
      color: var(--ink);
      margin-bottom: 6px;
    }
    .workspace-copy {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
      max-width: 760px;
    }
    .details-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .detail-card {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: #fff;
      padding: 14px;
    }
    .detail-card.wide {
      grid-column: span 2;
    }
    .detail-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      font-weight: 700;
      margin-bottom: 8px;
    }
    .detail-value {
      font-size: 20px;
      font-weight: 700;
      color: var(--ink);
      line-height: 1.3;
    }
    .detail-copy {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.55;
      margin-top: 6px;
    }
    .contract-name {
      font-size: 28px;
      font-weight: 800;
      line-height: 1.2;
      color: var(--ink);
      margin-bottom: 8px;
      overflow-wrap: anywhere;
    }
    .contract-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    .hero-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
      align-items: stretch;
    }
    .hero-main {
      min-width: 0;
    }
    .hero-stat-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .hero-stat {
      border: 1px solid rgba(216, 224, 231, 0.9);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.8);
      padding: 12px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 0;
    }
    .hero-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      font-weight: 800;
      margin-bottom: 6px;
    }
    .hero-value {
      font-size: 22px;
      font-weight: 800;
      color: var(--ink);
      line-height: 1.1;
    }
    .hero-value.up {
      color: var(--up);
    }
    .hero-value.down {
      color: var(--down);
    }
    .hero-subvalue {
      margin-top: 6px;
      font-size: 12px;
      color: var(--muted);
    }
    .contract-badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      background: var(--panel);
      border: 1px solid var(--line);
      padding: 6px 10px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
    }
    .inspector {
      padding: 14px;
      background: #f6f9fc;
      border-left: 1px solid var(--line);
      overflow: auto;
      display: grid;
      align-content: start;
      gap: 10px;
    }
    .stack {
      display: grid;
      gap: 10px;
    }
    .order-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .order-grid .full {
      grid-column: span 2;
    }
    .order-submit {
      width: 100%;
      margin: 0;
      text-align: center;
      border-color: var(--accent);
      background: var(--accent);
      color: #fff;
      font-weight: 700;
    }
    .order-submit:disabled {
      border-color: var(--line);
      background: #eef2f5;
      color: var(--muted);
      cursor: not-allowed;
    }
    @media (max-width: 760px) {
      main { grid-template-columns: 1fr; }
      aside { border-right: 0; border-bottom: 1px solid var(--line); }
      .inspector { border-left: 0; border-top: 1px solid var(--line); }
      canvas { height: 58vh; min-height: 320px; }
      .finder-actions { justify-content: stretch; }
      .finder-search-button { width: 100%; }
      .finder-filter-grid { grid-template-columns: 1fr; }
      .finder-filter-grid .full { grid-column: span 1; }
      .hero-grid { grid-template-columns: 1fr; }
      .hero-stat-grid { grid-template-columns: 1fr; }
      .details-grid { grid-template-columns: 1fr; }
      .detail-card.wide { grid-column: span 1; }
      .order-grid { grid-template-columns: 1fr; }
      .order-grid .full { grid-column: span 1; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Derivatives Options Workspace</h1>
    <div class="status"><span class="dot" id="dot"></span><span id="status">Starting</span></div>
  </header>
  <main>
    <aside>
      <div class="finder-card">
        <div class="finder-kicker">Derivatives Explorer</div>
        <div class="finder-heading">Options with live chart and recent history</div>
        <div class="finder-copy">Search an underlying, trim the chain by expiry, strike, and side, then load the exact option contract into the chart. Recent history stays visible even when the market is closed.</div>
        <div class="finder-meta" id="finderMeta">Start with an underlying like NIFTY, BANKNIFTY, FINNIFTY, SENSEX, RELIANCE, GOLD, or USDINR.</div>
      </div>
      <div class="finder-toolbar">
        <div class="field-row-wide">
          <label for="finderInput">Underlying</label>
          <input id="finderInput" type="text" value="NIFTY" autocomplete="off">
        </div>
        <div class="finder-actions">
          <button class="finder-search-button" id="searchContracts" type="button">Load option chain</button>
        </div>
      </div>
      <div class="finder-filter-grid">
        <div class="full">
          <label for="expiryFilter">Expiry</label>
          <select id="expiryFilter">
            <option value="all">All expiries</option>
          </select>
        </div>
        <div>
          <label for="strikeFilter">Strike filter</label>
          <input id="strikeFilter" type="text" placeholder="Example: 24000">
        </div>
        <div>
          <label>Option side</label>
          <div class="market-switch compact" id="optionTypeSwitch">
            <button class="market-chip active" type="button" data-option-type="all">All</button>
            <button class="market-chip" type="button" data-option-type="CE">Calls</button>
            <button class="market-chip" type="button" data-option-type="PE">Puts</button>
          </div>
        </div>
      </div>
      <div class="finder-statbar" id="finderStats">
        <span class="finder-pill">Type an underlying to begin</span>
      </div>
      <div class="finder-help">Search is now focused on options only. Use the strike filter for exact levels like 24000 or 25000 without pulling in unrelated underlyings.</div>
      <div>
        <div class="finder-section-title">Option contracts</div>
        <div class="results-panel" id="contractResults"></div>
      </div>
      <div class="watchlist-card">
        <div class="detail-title">Watchlist</div>
        <div class="detail-copy">Save contracts here and open their charts any time without searching again.</div>
        <div class="watchlist-list" id="watchlistList"></div>
      </div>
    </aside>
    <section class="chart-wrap options-workspace active" id="optionsWorkspace">
      <div class="workspace-hero" id="workspaceHero"></div>
      <div class="chart-shell">
        <div class="chart-topbar">
          <div class="chart-tabs">
            <span class="chart-tab active">Chart</span>
            <span class="chart-tab">Contract</span>
          </div>
          <div class="chart-symbol" id="chartSymbol">No option selected</div>
        </div>
        <div class="chart-toolbar">
          <label class="level-toggle"><input id="showLevels" type="checkbox" checked> Levels</label>
          <button id="zoomOut" type="button" title="Zoom out">-</button>
          <button id="zoomReset" type="button" title="Reset zoom">Reset</button>
          <button id="zoomIn" type="button" title="Zoom in">+</button>
        </div>
        <canvas id="chart"></canvas>
      </div>
      <div class="tooltip" id="tooltip"></div>
    </section>
    <section class="inspector">
      <div class="stack">
        <div class="card" id="metrics"></div>
        <div class="card" id="latencyPanel"></div>
        <div class="details-grid workspace-snapshot" id="selectedSnapshot"></div>
        <div class="detail-card">
          <div class="detail-title">Order Ticket</div>
          <div class="order-grid">
            <div>
              <label for="derivativeLots">Lots</label>
              <input id="derivativeLots" min="1" step="1" type="number" value="1">
            </div>
            <div>
              <label for="derivativeQuantity">Total quantity</label>
              <input id="derivativeQuantity" type="text" value="-" readonly>
            </div>
            <div>
              <label for="derivativeProduct">Product</label>
              <select id="derivativeProduct">
                <option value="NRML">NRML</option>
                <option value="MIS">MIS</option>
              </select>
            </div>
            <div>
              <label for="derivativeOrderType">Order type</label>
              <select id="derivativeOrderType">
                <option value="MARKET">MARKET</option>
                <option value="LIMIT">LIMIT</option>
                <option value="SL">SL</option>
                <option value="SL-M">SL-M</option>
              </select>
            </div>
            <div>
              <label for="derivativePrice">Limit price</label>
              <input id="derivativePrice" min="0" step="0.05" type="number" placeholder="Required for LIMIT and SL">
            </div>
            <div>
              <label for="derivativeTrigger">Trigger price</label>
              <input id="derivativeTrigger" min="0" step="0.05" type="number" placeholder="Required for SL and SL-M">
            </div>
            <div class="full">
              <button class="order-submit" id="placeDerivativeOrder" type="button" disabled>Place option buy order</button>
            </div>
            <div class="full">
              <div class="detail-copy" id="derivativeOrderHelp">Select an option contract to enable the order ticket.</div>
              <div class="message" id="orderMessage"></div>
            </div>
          </div>
        </div>
        <div class="error" id="error"></div>
      </div>
    </section>
  </main>
  <script>
    const canvas = document.getElementById("chart");
    const ctx = canvas.getContext("2d");
    const tooltipEl = document.getElementById("tooltip");
    const zoomInEl = document.getElementById("zoomIn");
    const zoomOutEl = document.getElementById("zoomOut");
    const zoomResetEl = document.getElementById("zoomReset");
    const showLevelsEl = document.getElementById("showLevels");
    const chartSymbolEl = document.getElementById("chartSymbol");
    const metricsEl = document.getElementById("metrics");
    const latencyPanelEl = document.getElementById("latencyPanel");
    const statusEl = document.getElementById("status");
    const errorEl = document.getElementById("error");
    const dotEl = document.getElementById("dot");
    const finderMetaEl = document.getElementById("finderMeta");
    const finderStatsEl = document.getElementById("finderStats");
    const finderInputEl = document.getElementById("finderInput");
    const searchContractsEl = document.getElementById("searchContracts");
    const contractResultsEl = document.getElementById("contractResults");
    const watchlistListEl = document.getElementById("watchlistList");
    const expiryFilterEl = document.getElementById("expiryFilter");
    const strikeFilterEl = document.getElementById("strikeFilter");
    const optionTypeButtons = Array.from(document.querySelectorAll("[data-option-type]"));
    const workspaceHeroEl = document.getElementById("workspaceHero");
    const selectedSnapshotEl = document.getElementById("selectedSnapshot");
    const derivativeLotsEl = document.getElementById("derivativeLots");
    const derivativeQuantityEl = document.getElementById("derivativeQuantity");
    const derivativeProductEl = document.getElementById("derivativeProduct");
    const derivativeOrderTypeEl = document.getElementById("derivativeOrderType");
    const derivativePriceEl = document.getElementById("derivativePrice");
    const derivativeTriggerEl = document.getElementById("derivativeTrigger");
    const placeDerivativeOrderEl = document.getElementById("placeDerivativeOrder");
    const derivativeOrderHelpEl = document.getElementById("derivativeOrderHelp");
    const orderMessageEl = document.getElementById("orderMessage");

    let selected = "";
    let state = null;
    let candleHitBoxes = [];
    let lastPointer = null;
    let tooltipHideTimer = null;
    let zoomCandles = 120;
    const minZoomCandles = 20;
    const maxZoomCandles = 320;
    let contractSearch = null;
    let optionType = "all";
    let searchContext = { rawQuery: "NIFTY", underlying: "NIFTY", strikeShortcut: "" };
    let optionWatchlist = loadWatchlist();

    function optionContract() {
      const selectedContract = (state && state.selected_contract) || {};
      return (selectedContract.kind || "").toLowerCase() === "options" ? selectedContract : null;
    }

    function fitCanvas() {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * ratio);
      canvas.height = Math.floor(rect.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function money(value) {
      return Number(value || 0).toFixed(2);
    }

    function loadWatchlist() {
      try {
        const raw = window.localStorage.getItem("optionWatchlist");
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    function saveWatchlist() {
      try {
        window.localStorage.setItem("optionWatchlist", JSON.stringify(optionWatchlist));
      } catch {
        // Ignore storage failures in locked-down browsers.
      }
    }

    function integerText(value) {
      if (!Number.isFinite(Number(value))) return "-";
      const parsed = Number(value);
      return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(2);
    }

    function latencyClass(value) {
      if (!Number.isFinite(value)) return "";
      if (value <= 250) return "good";
      if (value <= 750) return "warn";
      return "bad";
    }

    function latencyText(value) {
      return Number.isFinite(value) ? `${value.toFixed(2)} ms` : "n/a";
    }

    function visibleCandles(candles) {
      return candles.slice(-zoomCandles);
    }

    function pivotLevels(candles) {
      if (!candles.length) return [];
      const high = Math.max(...candles.map(candle => Number(candle.high)));
      const low = Math.min(...candles.map(candle => Number(candle.low)));
      const close = Number(candles[candles.length - 1].close);
      const pivot = (high + low + close) / 3;
      const range = high - low;
      return [
        { label: "Day H", value: high, color: "#145a7a" },
        { label: "R2", value: pivot + range, color: "#c53b31" },
        { label: "R1", value: 2 * pivot - low, color: "#c53b31" },
        { label: "P", value: pivot, color: "#5b6f82" },
        { label: "S1", value: 2 * pivot - high, color: "#11804b" },
        { label: "S2", value: pivot - range, color: "#11804b" },
        { label: "Day L", value: low, color: "#145a7a" },
      ];
    }

    function drawLevels({ levels, min, max, pad, width, y }) {
      if (!showLevelsEl.checked) return;
      const span = max - min;
      const lowerBound = min - span * 0.05;
      const upperBound = max + span * 0.05;

      levels.forEach(level => {
        if (level.value < lowerBound || level.value > upperBound) return;
        const levelY = y(level.value);
        ctx.save();
        ctx.strokeStyle = level.color;
        ctx.globalAlpha = 0.55;
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.left, levelY);
        ctx.lineTo(width - pad.right, levelY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.fillStyle = level.color;
        ctx.font = "12px sans-serif";
        ctx.fillText(`${level.label} ${money(level.value)}`, width - pad.right - 92, levelY - 5);
        ctx.restore();
      });
    }

    function drawCandles(candles) {
      fitCanvas();
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      candleHitBoxes = [];
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);

      const visible = visibleCandles(candles);
      if (!visible.length) {
        ctx.fillStyle = "#607080";
        ctx.font = "14px sans-serif";
        ctx.fillText("Waiting for candle data", 24, 34);
        return;
      }

      const pad = { left: 58, right: 18, top: 24, bottom: 42 };
      const values = visible.flatMap(c => [Number(c.high), Number(c.low)]);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = Math.max(max - min, 1);
      const plotW = width - pad.left - pad.right;
      const plotH = height - pad.top - pad.bottom;
      const step = plotW / Math.max(visible.length, 1);
      const bodyW = Math.max(5, Math.min(18, step * 0.58));
      const y = value => pad.top + ((max - value) / span) * plotH;
      const levels = pivotLevels(candles);

      ctx.strokeStyle = "#e8eef3";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const gy = pad.top + (plotH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(pad.left, gy);
        ctx.lineTo(width - pad.right, gy);
        ctx.stroke();
        const label = max - (span / 4) * i;
        ctx.fillStyle = "#607080";
        ctx.font = "12px sans-serif";
        ctx.fillText(money(label), 8, gy + 4);
      }
      drawLevels({ levels, min, max, pad, width, y });

      const offset = candles.length - visible.length;
      visible.forEach((candle, visibleIndex) => {
        const index = offset + visibleIndex;
        const x = pad.left + step * visibleIndex + step / 2;
        const openY = y(Number(candle.open));
        const closeY = y(Number(candle.close));
        const highY = y(Number(candle.high));
        const lowY = y(Number(candle.low));
        const up = Number(candle.close) >= Number(candle.open);
        const color = up ? "#11804b" : "#c53b31";

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, lowY);
        ctx.stroke();

        const top = Math.min(openY, closeY);
        const bodyH = Math.max(2, Math.abs(openY - closeY));
        ctx.fillRect(x - bodyW / 2, top, bodyW, bodyH);
        candleHitBoxes.push({
          index,
          x,
          bodyLeft: x - bodyW / 2,
          bodyRight: x + bodyW / 2,
          bodyTop: top,
          bodyBottom: top + bodyH,
          highY,
          lowY,
          candle,
        });

        if (!candle.is_closed) {
          ctx.strokeStyle = "#145a7a";
          ctx.strokeRect(x - bodyW / 2 - 2, top - 2, bodyW + 4, bodyH + 4);
        }
      });

      if (lastPointer && candleFromEvent(lastPointer)) showTooltip(lastPointer);
    }

    function candleFromEvent(event) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      let closest = null;
      let closestDistance = Infinity;

      for (const box of candleHitBoxes) {
        const wickTop = Math.min(box.highY, box.lowY);
        const wickBottom = Math.max(box.highY, box.lowY);
        const nearBody =
          x >= box.bodyLeft - 5 &&
          x <= box.bodyRight + 5 &&
          y >= box.bodyTop - 5 &&
          y <= box.bodyBottom + 5;
        const nearWick =
          Math.abs(x - box.x) <= 6 &&
          y >= wickTop - 5 &&
          y <= wickBottom + 5;
        if (nearBody || nearWick) return box;

        const clampedY = Math.min(Math.max(y, wickTop), wickBottom);
        const distance = Math.hypot(x - box.x, y - clampedY);
        if (distance < closestDistance) {
          closest = box;
          closestDistance = distance;
        }
      }

      return closestDistance <= 8 ? closest : null;
    }

    function scheduleTooltipHide() {
      window.clearTimeout(tooltipHideTimer);
      tooltipHideTimer = window.setTimeout(() => {
        tooltipEl.style.display = "none";
      }, 350);
    }

    function showTooltip(event) {
      lastPointer = event;
      const hit = candleFromEvent(event);
      if (!hit) {
        window.clearTimeout(tooltipHideTimer);
        tooltipEl.style.display = "none";
        return;
      }

      window.clearTimeout(tooltipHideTimer);
      const candle = hit.candle;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left + 18;
      const y = event.clientY - rect.top + 18;
      tooltipEl.innerHTML =
        `<strong>${candle.start || ""}</strong>` +
        `Open: ${money(candle.open)}<br>` +
        `High: ${money(candle.high)}<br>` +
        `Low: ${money(candle.low)}<br>` +
        `Close: ${money(candle.close)}<br>` +
        `Volume: ${candle.volume || 0}`;
      tooltipEl.style.left = `${Math.min(x, rect.width - 210)}px`;
      tooltipEl.style.top = `${Math.min(y, rect.height - 150)}px`;
      tooltipEl.style.display = "block";
    }

    function allOptionResults() {
      return ((contractSearch && contractSearch.matches && contractSearch.matches.options) || []).slice();
    }

    function findOptionByToken(token) {
      const numericToken = Number(token);
      return allOptionResults().find(item => Number(item.instrument_token) === numericToken)
        || optionWatchlist.find(item => Number(item.instrument_token) === numericToken)
        || null;
    }

    function filteredOptionResults() {
      const expiry = expiryFilterEl.value || "all";
      const strikeText = strikeFilterEl.value.trim();
      return allOptionResults().filter(item => {
        if (optionType !== "all" && item.instrument_type !== optionType) return false;
        if (expiry !== "all" && item.expiry !== expiry) return false;
        if (strikeText) {
          const strikeValue = item.strike == null ? "" : integerText(item.strike);
          if (!strikeValue.includes(strikeText)) return false;
        }
        return true;
      });
    }

    function refreshExpiryFilter() {
      const options = allOptionResults();
      const expiries = Array.from(new Set(options.map(item => item.expiry).filter(Boolean))).sort();
      const current = expiryFilterEl.value || "all";
      expiryFilterEl.innerHTML =
        `<option value="all">All expiries</option>` +
        expiries.map(expiry => `<option value="${expiry}">${expiry}</option>`).join("");
      expiryFilterEl.value = expiries.includes(current) ? current : "all";
    }

    function groupOptionsByStrike(items) {
      const grouped = new Map();
      items.forEach(item => {
        const strikeKey = integerText(item.strike);
        if (!grouped.has(strikeKey)) {
          grouped.set(strikeKey, { strike: strikeKey, CE: null, PE: null });
        }
        grouped.get(strikeKey)[item.instrument_type] = item;
      });
      return Array.from(grouped.values()).sort((left, right) => Number(left.strike) - Number(right.strike));
    }

    function chainLegMarkup(item, side, selectedToken) {
      if (!item) {
        return `<div class="chain-leg empty ${side === "CE" ? "call" : "put"}"><span class="chain-meta">No ${side} contract</span></div>`;
      }
      const isActive = String(item.instrument_token) === selectedToken;
      return `
        <div class="chain-leg ${side === "CE" ? "call" : "put"} ${isActive ? "active" : ""}">
          <span class="chain-topline">
            <span class="chain-symbol">${item.tradingsymbol}</span>
            <span class="chain-type">${side}</span>
          </span>
          <span class="chain-price">${item.last_price != null ? money(item.last_price) : "Load"}</span>
          <span class="chain-meta">Lot ${item.lot_size || "-"} · ${item.exchange}</span>
          <div class="chain-actions">
            <button class="mini-action primary" type="button" data-action="chart" data-token="${item.instrument_token}">Chart</button>
            <button class="mini-action" type="button" data-action="watch" data-token="${item.instrument_token}">Watch</button>
          </div>
        </div>
      `;
    }

    function renderWatchlist() {
      if (!optionWatchlist.length) {
        watchlistListEl.innerHTML = `<div class="finder-help">No contracts saved yet. Use the Watch button from the option chain to keep contracts here.</div>`;
        return;
      }

      const selectedToken = String(((state && state.selected_contract) || {}).instrument_token || "");
      watchlistListEl.innerHTML = optionWatchlist.map(item => `
        <div class="watchlist-item">
          <div class="watchlist-top">
            <div class="watchlist-name">${item.tradingsymbol}</div>
            <span class="result-tag">${item.instrument_type}</span>
          </div>
          <div class="watchlist-meta">
            Strike ${integerText(item.strike)} · Expiry ${item.expiry || "-"} · Lot ${item.lot_size || "-"}${String(item.instrument_token) === selectedToken ? " · Active chart" : ""}
          </div>
          <div class="watchlist-actions">
            <button class="mini-action primary" type="button" data-watch-action="chart" data-token="${item.instrument_token}">Open chart</button>
            <button class="mini-action" type="button" data-watch-action="remove" data-token="${item.instrument_token}">Remove</button>
          </div>
        </div>
      `).join("");

      watchlistListEl.querySelectorAll("[data-watch-action='chart']").forEach(button => {
        button.addEventListener("click", () => loadInstrument(Number(button.dataset.token)));
      });
      watchlistListEl.querySelectorAll("[data-watch-action='remove']").forEach(button => {
        button.addEventListener("click", () => removeFromWatchlist(Number(button.dataset.token)));
      });
    }

    function addToWatchlist(token) {
      const item = findOptionByToken(token);
      if (!item) return;
      if (optionWatchlist.some(existing => Number(existing.instrument_token) === Number(item.instrument_token))) {
        orderMessageEl.textContent = `${item.tradingsymbol} is already in the watchlist.`;
        return;
      }
      optionWatchlist = [item, ...optionWatchlist].slice(0, 24);
      saveWatchlist();
      renderWatchlist();
      orderMessageEl.textContent = `${item.tradingsymbol} added to watchlist.`;
    }

    function removeFromWatchlist(token) {
      optionWatchlist = optionWatchlist.filter(item => Number(item.instrument_token) !== Number(token));
      saveWatchlist();
      renderWatchlist();
    }

    function renderContractResults() {
      if (!contractSearch || !contractSearch.matches) {
        contractResultsEl.innerHTML = "";
        finderStatsEl.innerHTML = `<span class="finder-pill">Type an underlying to begin</span>`;
        return;
      }

      const allOptions = allOptionResults();
      const filtered = filteredOptionResults();
      const selectedToken = String(((state && state.selected_contract) || {}).instrument_token || "");
      const expiries = Array.from(new Set(allOptions.map(item => item.expiry).filter(Boolean))).length;

      finderStatsEl.innerHTML = `
        <span class="finder-pill">Underlying: ${searchContext.underlying || contractSearch.query || "-"}</span>
        ${searchContext.strikeShortcut ? `<span class="finder-pill">Strike shortcut: ${searchContext.strikeShortcut}</span>` : ""}
        <span class="finder-pill">${allOptions.length} option contract${allOptions.length === 1 ? "" : "s"}</span>
        <span class="finder-pill">${expiries} expir${expiries === 1 ? "y" : "ies"}</span>
        <span class="finder-pill">${filtered.length} shown</span>
      `;

      if (!filtered.length) {
        contractResultsEl.innerHTML = `<div class="finder-help">No option contracts match the current filters. Try another expiry, clear the strike filter, or search a different underlying.</div>`;
        return;
      }

      const groups = new Map();
      filtered.forEach(item => {
        const key = item.expiry || "No expiry";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      });

      contractResultsEl.innerHTML = Array.from(groups.entries()).map(([expiry, items]) => `
        <div class="chain-group">
          <div class="result-group-title">${expiry}</div>
          <div class="chain-head">
            <span>Calls</span>
            <span class="center">Strike</span>
            <span style="text-align:right;">Puts</span>
          </div>
          ${groupOptionsByStrike(items).map(row => `
            <div class="chain-row">
              ${optionType === "PE" ? `<div class="chain-leg empty call"><span class="chain-meta">Calls hidden</span></div>` : chainLegMarkup(row.CE, "CE", selectedToken)}
              <div class="chain-strike">${row.strike}</div>
              ${optionType === "CE" ? `<div class="chain-leg empty put"><span class="chain-meta">Puts hidden</span></div>` : chainLegMarkup(row.PE, "PE", selectedToken)}
            </div>
          `).join("")}
        </div>
      `).join("");

      contractResultsEl.querySelectorAll("[data-action='chart']").forEach(button => {
        button.addEventListener("click", () => loadInstrument(Number(button.dataset.token)));
      });
      contractResultsEl.querySelectorAll("[data-action='watch']").forEach(button => {
        button.addEventListener("click", () => addToWatchlist(Number(button.dataset.token)));
      });
    }

    function renderWorkspace(latest, candles) {
      const contract = optionContract();
      if (!contract) {
        workspaceHeroEl.innerHTML = `
          <div class="workspace-kicker">Derivatives Workspace</div>
          <div class="workspace-title">Load an option contract to start charting</div>
          <div class="workspace-copy">Use the left rail like an option chain: search the underlying, narrow to the right expiry, then pick the strike and side. The chart keeps recent history visible even when today is a weekend or market holiday.</div>
        `;
        chartSymbolEl.textContent = "No option selected";
        selectedSnapshotEl.innerHTML = `
          <div class="detail-card wide">
            <div class="detail-title">Waiting for selection</div>
            <div class="detail-value">No option contract loaded yet</div>
            <div class="detail-copy">Start with NIFTY or BANKNIFTY, then refine by expiry, strike, and call or put side.</div>
          </div>
        `;
        return;
      }

      const lastCandle = candles[candles.length - 1] || {};
      const latestPrice = latest.last_price || lastCandle.close || 0;
      const openPrice = lastCandle.open != null ? Number(lastCandle.open) : latestPrice;
      const change = latestPrice - openPrice;
      const changePct = openPrice ? (change / openPrice) * 100 : 0;
      const tone = change >= 0 ? "up" : "down";
      chartSymbolEl.textContent = contract.tradingsymbol;
      workspaceHeroEl.innerHTML = `
        <div class="hero-grid">
          <div class="hero-main">
            <div class="workspace-kicker">Selected Option</div>
            <div class="workspace-title">${contract.tradingsymbol}</div>
            <div class="workspace-copy">${contract.display_name || contract.tradingsymbol}</div>
            <div class="contract-badges">
              <span class="contract-badge">Side: ${contract.instrument_type || "-"}</span>
              <span class="contract-badge">Strike: ${integerText(contract.strike)}</span>
              <span class="contract-badge">Expiry: ${contract.expiry || "-"}</span>
              <span class="contract-badge">Lot size: ${contract.lot_size || "-"}</span>
            </div>
          </div>
          <div class="hero-stat-grid">
            <div class="hero-stat">
              <div class="hero-label">Last price</div>
              <div class="hero-value ${tone}">${money(latestPrice)}</div>
              <div class="hero-subvalue">${contract.exchange}</div>
            </div>
            <div class="hero-stat">
              <div class="hero-label">Day change</div>
              <div class="hero-value ${tone}">${change >= 0 ? "+" : ""}${money(change)}</div>
              <div class="hero-subvalue">${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%</div>
            </div>
            <div class="hero-stat">
              <div class="hero-label">History window</div>
              <div class="hero-value">${candles.length}</div>
              <div class="hero-subvalue">candles loaded</div>
            </div>
          </div>
        </div>
      `;

      selectedSnapshotEl.innerHTML = `
        <div class="detail-card mini">
          <div class="detail-title">Open</div>
          <div class="detail-value">${lastCandle.open != null ? money(lastCandle.open) : "-"}</div>
        </div>
        <div class="detail-card mini">
          <div class="detail-title">High</div>
          <div class="detail-value">${lastCandle.high != null ? money(lastCandle.high) : "-"}</div>
        </div>
        <div class="detail-card mini">
          <div class="detail-title">Low</div>
          <div class="detail-value">${lastCandle.low != null ? money(lastCandle.low) : "-"}</div>
        </div>
        <div class="detail-card mini">
          <div class="detail-title">Close</div>
          <div class="detail-value">${lastCandle.close != null ? money(lastCandle.close) : "-"}</div>
        </div>
        <div class="detail-card mini">
          <div class="detail-title">Candles loaded</div>
          <div class="detail-value">${candles.length}</div>
        </div>
        <div class="detail-card mini">
          <div class="detail-title">Last update</div>
          <div class="detail-value">${latest.timestamp || "-"}</div>
        </div>
      `;
    }

    function syncDerivativeOrderTicket() {
      const contract = optionContract();
      if (!contract) {
        derivativeQuantityEl.value = "-";
        derivativeProductEl.value = "NRML";
        derivativePriceEl.disabled = true;
        derivativeTriggerEl.disabled = true;
        placeDerivativeOrderEl.disabled = true;
        derivativeOrderHelpEl.textContent = "Select an option contract to enable the order ticket.";
        return;
      }

      const lots = Math.max(1, Number(derivativeLotsEl.value || 1));
      const lotSize = Number(contract.lot_size || 1);
      derivativeQuantityEl.value = String(lots * lotSize);
      const orderType = derivativeOrderTypeEl.value;
      derivativePriceEl.disabled = !["LIMIT", "SL"].includes(orderType);
      derivativeTriggerEl.disabled = !["SL", "SL-M"].includes(orderType);
      placeDerivativeOrderEl.disabled = !(state && state.trading_enabled);
      derivativeOrderHelpEl.textContent = `Ready: ${contract.tradingsymbol} | ${contract.exchange} | ${contract.expiry || "-"} | lot size ${lotSize}`;
    }

    function renderMetrics(latest, candles) {
      if (!selected) {
        metricsEl.innerHTML = `
          <div class="card-title">Session Overview</div>
          <div class="metric-subtext">Search an underlying and load an option contract to start the live view.</div>
        `;
        finderMetaEl.textContent = "Start with an underlying like NIFTY, BANKNIFTY, FINNIFTY, SENSEX, RELIANCE, GOLD, or USDINR.";
        chartSymbolEl.textContent = "No option selected";
        return;
      }

      const contract = optionContract();
      finderMetaEl.textContent = contract
        ? `Active option: ${contract.display_name}`
        : `Live symbol: ${selected}`;

      metricsEl.innerHTML = `
        <div class="card-title">Session Overview</div>
        <div class="metric-grid">
          <div class="metric-item">
            <span class="metric-label">Last Price</span>
            <span class="metric-value">${money(latest.last_price)}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Candles</span>
            <span class="metric-value">${candles.length}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Mode</span>
            <span class="metric-value">${state.source.toUpperCase()}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Interval</span>
            <span class="metric-value">${state.interval_minutes}m</span>
          </div>
        </div>
        <div class="metric-subtext">Updated: ${latest.timestamp || "-"}<br>Status: ${state.status}<br>Search mode: options only</div>
      `;
    }

    function renderLatency() {
      const latencyState = state.latency || {};
      const overall = latencyState.overall || {};
      const symbolLatency = selected ? ((latencyState.symbols || {})[selected] || {}) : {};
      const latestClass = latencyClass(symbolLatency.latest_ms);
      const averageClass = latencyClass(symbolLatency.average_ms);

      latencyPanelEl.innerHTML = `
        <div class="card-title">Latency Monitor</div>
        <div class="latency-chip-row">
          <div class="latency-chip ${latestClass}">
            <span class="metric-label">Latest</span>
            <span class="metric-value">${latencyText(symbolLatency.latest_ms)}</span>
          </div>
          <div class="latency-chip ${averageClass}">
            <span class="metric-label">Average</span>
            <span class="metric-value">${latencyText(symbolLatency.average_ms)}</span>
          </div>
          <div class="latency-chip">
            <span class="metric-label">Min / Max</span>
            <span class="metric-value">${latencyText(symbolLatency.min_ms)} / ${latencyText(symbolLatency.max_ms)}</span>
          </div>
          <div class="latency-chip">
            <span class="metric-label">Samples</span>
            <span class="metric-value">${overall.samples || 0}</span>
          </div>
        </div>
        <div class="metric-subtext">Lag is measured from exchange timestamp to local receipt time. Lower is better.</div>
      `;
    }

    function render() {
      if (!state) return;
      const symbols = Object.keys(state.candles || {});
      const selectedContract = optionContract();
      if (selectedContract && selectedContract.tradingsymbol) {
        selected = selectedContract.tradingsymbol;
      } else if (!selected || !symbols.includes(selected)) {
        selected = symbols[0] || "";
      }

      statusEl.textContent = `${state.status} | ${state.source} | ${state.interval_minutes}m | ${state.updated_at}`;
      const selectedLatency = selected ? (((state.latency || {}).symbols || {})[selected] || {}) : {};
      dotEl.style.background = state.status === "error"
        ? "#c53b31"
        : (latencyClass(selectedLatency.latest_ms) === "bad" ? "#c53b31" : latencyClass(selectedLatency.latest_ms) === "warn" ? "#c58e31" : "#145a7a");
      errorEl.textContent = state.error || "";
      orderMessageEl.textContent = state.order_message || "";

      const latest = state.latest[selected] || {};
      const candles = (state.candles && state.candles[selected]) || [];
      renderMetrics(latest, candles);
      renderLatency();
      renderWorkspace(latest, candles);
      renderContractResults();
      renderWatchlist();
      syncDerivativeOrderTicket();
      drawCandles(candles);
    }

    async function searchContracts() {
      const rawQuery = finderInputEl.value.trim().toUpperCase();
      if (!rawQuery) {
        errorEl.textContent = "Enter an underlying like NIFTY, BANKNIFTY, RELIANCE, GOLD, or USDINR.";
        return;
      }

      const strikeShortcut = /^\\d+$/.test(rawQuery) ? rawQuery : "";
      const underlyingQuery = strikeShortcut ? "NIFTY" : rawQuery;
      searchContext = {
        rawQuery,
        underlying: underlyingQuery,
        strikeShortcut,
      };
      if (strikeShortcut) {
        strikeFilterEl.value = strikeShortcut;
        optionType = "all";
        optionTypeButtons.forEach(item => {
          item.classList.toggle("active", item.dataset.optionType === "all");
        });
      } else {
        strikeFilterEl.value = "";
      }

      searchContractsEl.disabled = true;
      errorEl.textContent = "";
      contractResultsEl.innerHTML = `<div class="finder-help">Searching option contracts for ${strikeShortcut ? `NIFTY strike ${strikeShortcut}` : underlyingQuery}...</div>`;
      try {
        const response = await fetch(`/api/instruments/search?query=${encodeURIComponent(underlyingQuery)}&kind=options`, { cache: "no-store" });
        contractSearch = await response.json();
        refreshExpiryFilter();
        renderContractResults();
      } catch (error) {
        errorEl.textContent = String(error);
      } finally {
        searchContractsEl.disabled = false;
      }
    }

    async function loadInstrument(instrumentToken) {
      orderMessageEl.textContent = "Loading option contract...";
      try {
        const response = await fetch("/api/instruments/load", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instrument_token: instrumentToken }),
        });
        const result = await response.json();
        orderMessageEl.textContent = result.message || "Contract load response received.";
        if (result.ok && result.symbol) {
          selected = result.symbol;
          await poll();
        }
      } catch (error) {
        errorEl.textContent = String(error);
      }
    }

    async function placeDerivativeOrder() {
      const contract = optionContract();
      if (!contract) return;

      const lots = Math.max(1, Number(derivativeLotsEl.value || 1));
      const lotSize = Number(contract.lot_size || 1);
      const quantity = lots * lotSize;
      const orderType = derivativeOrderTypeEl.value;
      const payload = {
        symbol: contract.tradingsymbol,
        exchange: contract.exchange,
        lots,
        quantity,
        product: derivativeProductEl.value,
        order_type: orderType,
        price: derivativePriceEl.value,
        trigger_price: derivativeTriggerEl.value,
      };
      const description = `Place BUY for ${contract.tradingsymbol} | ${lots} lot(s) | quantity ${quantity} | ${orderType}?`;
      if (!window.confirm(description)) return;

      placeDerivativeOrderEl.disabled = true;
      derivativeOrderHelpEl.textContent = "Placing option order...";
      try {
        const response = await fetch("/api/orders/buy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        orderMessageEl.textContent = result.message || "Order response received.";
        derivativeOrderHelpEl.textContent = result.message || "Order response received.";
        await poll();
      } catch (error) {
        errorEl.textContent = String(error);
      } finally {
        syncDerivativeOrderTicket();
      }
    }

    async function poll() {
      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        state = await response.json();
        render();
      } catch (error) {
        errorEl.textContent = String(error);
      }
    }

    window.addEventListener("resize", render);
    canvas.addEventListener("mousemove", showTooltip);
    canvas.addEventListener("mouseleave", () => {
      lastPointer = null;
      scheduleTooltipHide();
    });
    derivativeLotsEl.addEventListener("input", syncDerivativeOrderTicket);
    derivativeOrderTypeEl.addEventListener("change", syncDerivativeOrderTicket);
    derivativeProductEl.addEventListener("change", syncDerivativeOrderTicket);
    placeDerivativeOrderEl.addEventListener("click", placeDerivativeOrder);
    searchContractsEl.addEventListener("click", searchContracts);
    expiryFilterEl.addEventListener("change", renderContractResults);
    strikeFilterEl.addEventListener("input", renderContractResults);
    optionTypeButtons.forEach(button => {
      button.addEventListener("click", () => {
        optionType = button.dataset.optionType;
        optionTypeButtons.forEach(item => {
          item.classList.toggle("active", item.dataset.optionType === optionType);
        });
        renderContractResults();
      });
    });
    zoomInEl.addEventListener("click", () => {
      zoomCandles = Math.max(minZoomCandles, Math.floor(zoomCandles * 0.72));
      render();
    });
    zoomOutEl.addEventListener("click", () => {
      zoomCandles = Math.min(maxZoomCandles, Math.ceil(zoomCandles * 1.38));
      render();
    });
    zoomResetEl.addEventListener("click", () => {
      zoomCandles = 120;
      render();
    });
    showLevelsEl.addEventListener("change", render);
    finderInputEl.addEventListener("keydown", event => {
      if (event.key === "Enter") searchContracts();
    });
    poll();
    searchContracts();
    setInterval(poll, 1000);
  </script>
</body>
</html>
"""
