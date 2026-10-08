"""Paper-trading stand-in for ``KiteConnect``, for testing order flows locally.

``python run.py api --paper`` swaps every account's Kite client for one shared
``PaperKite``: orders, GTTs, positions and prices live in memory and nothing
reaches Zerodha. Prices stay still until moved with ``set_price`` (the
``/api/paper/price`` endpoint), so a test can step an entry from pending to
filled deliberately.

The emulation follows Kite's documented behaviour where the app depends on it:

- SL / SL-M orders wait at TRIGGER PENDING and must have their trigger on the
  far side of the last price (above it for a BUY, below for a SELL).
- Once triggered, Kite rewrites the order type: SL becomes LIMIT, SL-M becomes
  MARKET. That rewrite is what once hid filled entries from the chart. Real
  Kite may still report the trigger price afterwards; this zeroes it, the worst
  case, so the app has to recognise a filled entry by its tag.
- Order tags must be alphanumeric and at most 20 characters.
- An OCO GTT needs two trigger values that straddle the last price, one order
  per trigger, lower trigger first.

It cannot reproduce rules Kite does not document (for example whether a GTT on
an MIS position is accepted), so a small live trade remains the final check.
"""
from __future__ import annotations

import hashlib
import itertools
import logging
import math
import queue
import re
import threading
import uuid
from collections.abc import Callable
from datetime import date, datetime, timedelta
from typing import Any

try:
    from kiteconnect.exceptions import InputException, OrderException
except ModuleNotFoundError:  # pragma: no cover - kiteconnect is a hard dependency
    InputException = OrderException = ValueError  # type: ignore[misc,assignment]

LOGGER = logging.getLogger(__name__)

PAPER_USER_ID = "PAPER"
_TAG_PATTERN = re.compile(r"^[A-Za-z0-9]{1,20}$")
_TERMINAL = {"COMPLETE", "CANCELLED", "REJECTED"}
_INTERVAL_MINUTES = {
    "minute": 1, "3minute": 3, "5minute": 5, "10minute": 10,
    "15minute": 15, "30minute": 30, "60minute": 60, "day": 1440,
}
# Enough history for any chart window without generating months of 1m bars.
_MAX_CANDLES = 1500


class PaperKite:
    """In-memory imitation of the ``KiteConnect`` calls ``api_server`` makes."""

    VARIETY_REGULAR = "regular"
    ORDER_TYPE_MARKET = "MARKET"
    ORDER_TYPE_LIMIT = "LIMIT"
    ORDER_TYPE_SL = "SL"
    ORDER_TYPE_SLM = "SL-M"
    TRANSACTION_TYPE_BUY = "BUY"
    TRANSACTION_TYPE_SELL = "SELL"
    PRODUCT_MIS = "MIS"
    PRODUCT_NRML = "NRML"
    PRODUCT_CNC = "CNC"
    GTT_TYPE_OCO = "two-leg"
    GTT_TYPE_SINGLE = "single"

    api_key = "paper"
    access_token = "paper"

    def __init__(
        self,
        instrument_source: Callable[[], dict[str, list[dict[str, Any]]]],
        *,
        clock: Callable[[], datetime] = datetime.now,
    ) -> None:
        self._instrument_source = instrument_source
        self._clock = clock
        self._lock = threading.RLock()
        self._by_exchange: dict[str, list[dict[str, Any]]] | None = None
        self._by_symbol: dict[tuple[str, str], dict[str, Any]] = {}
        self._by_token: dict[int, dict[str, Any]] = {}
        self._prices: dict[int, float] = {}
        self._orders: list[dict[str, Any]] = []
        self._gtts: list[dict[str, Any]] = []
        self._order_ids = itertools.count(1)
        self._gtt_ids = itertools.count(1)
        self._listeners: list[Callable[[int, float], None]] = []

    # ── Instruments & prices ────────────────────────────────────────────────

    def instruments(self, exchange: str | None = None) -> list[dict[str, Any]]:
        dump = self._dump()
        if exchange:
            return list(dump.get(exchange, []))
        return [row for rows in dump.values() for row in rows]

    def instruments_by_exchange(self) -> dict[str, list[dict[str, Any]]]:
        """Every paper instrument, keyed by exchange like the server's dump."""
        return {exchange: list(rows) for exchange, rows in self._dump().items()}

    def _dump(self) -> dict[str, list[dict[str, Any]]]:
        with self._lock:
            if self._by_exchange is None:
                self._by_exchange = self._instrument_source()
                for exchange, rows in self._by_exchange.items():
                    for row in rows:
                        symbol = str(row.get("tradingsymbol") or "").upper()
                        token = int(row.get("instrument_token") or 0)
                        self._by_symbol[(exchange, symbol)] = row
                        if token:
                            self._by_token[token] = row
            return self._by_exchange

    def _instrument(self, exchange: str, tradingsymbol: str) -> dict[str, Any]:
        self._dump()
        row = self._by_symbol.get((exchange.upper(), tradingsymbol.upper()))
        if row is None:
            raise InputException(f"Invalid `tradingsymbol` {exchange}:{tradingsymbol}.")
        return row

    def last_price(self, instrument_token: int) -> float:
        """Current paper price; untouched instruments get a stable default."""
        with self._lock:
            price = self._prices.get(instrument_token)
            if price is None:
                price = self._default_price(instrument_token)
                self._prices[instrument_token] = price
            return price

    def _default_price(self, instrument_token: int) -> float:
        self._dump()
        row = self._by_token.get(instrument_token) or {}
        segment = str(row.get("segment") or "")
        if segment == "INDICES":
            return 25000.0
        if segment.endswith("-FUT"):
            return 25100.0
        # Options and everything else: a believable premium, stable per token.
        digest = int(hashlib.sha256(str(instrument_token).encode()).hexdigest(), 16)
        return 80.0 + digest % 120

    def set_price(self, instrument_token: int, price: float) -> dict[str, Any]:
        """Move an instrument's last price and run every order and GTT it affects."""
        if price <= 0:
            raise ValueError("price must be greater than 0.")
        self._dump()
        if instrument_token not in self._by_token:
            raise ValueError(f"Instrument token {instrument_token} was not found.")
        with self._lock:
            self._prices[instrument_token] = round(price, 2)
            self._match_orders(instrument_token)
            self._match_gtts(instrument_token)
            listeners = list(self._listeners)
        for listener in listeners:
            listener(instrument_token, round(price, 2))
        return {"instrument_token": instrument_token, "last_price": round(price, 2)}

    def add_price_listener(self, listener: Callable[[int, float], None]) -> None:
        with self._lock:
            self._listeners.append(listener)

    def quote(self, keys: list[str] | str) -> dict[str, dict[str, Any]]:
        if isinstance(keys, str):
            keys = [keys]
        result: dict[str, dict[str, Any]] = {}
        for key in keys:
            exchange, _, symbol = key.partition(":")
            try:
                row = self._instrument(exchange, symbol)
            except InputException:
                continue
            token = int(row["instrument_token"])
            ltp = self.last_price(token)
            close = self._default_price(token)
            result[key] = {
                "instrument_token": token,
                "last_price": ltp,
                "volume": 0,
                "oi": 0,
                "ohlc": {"open": close, "high": max(close, ltp), "low": min(close, ltp), "close": close},
                "depth": {
                    "buy": [{"price": round(ltp - 0.05 * (i + 1), 2), "quantity": 75, "orders": 1} for i in range(5)],
                    "sell": [{"price": round(ltp + 0.05 * (i + 1), 2), "quantity": 75, "orders": 1} for i in range(5)],
                },
            }
        return result

    def historical_data(
        self, instrument_token: int, from_date: datetime, to_date: datetime, interval: str, *args: Any, **kwargs: Any
    ) -> list[dict[str, Any]]:
        """Synthetic candles ending at the current paper price."""
        minutes = _INTERVAL_MINUTES.get(interval)
        if minutes is None:
            raise InputException(f"Invalid interval `{interval}`.")
        step = timedelta(minutes=minutes)
        start = _naive(from_date)
        end = min(_naive(to_date), self._clock().replace(tzinfo=None))
        # Align the last bar to its interval boundary, like Kite's bars.
        midnight = datetime.combine(end.date(), datetime.min.time())
        last = midnight + step * int((end - midnight) / step) if minutes < 1440 else midnight
        count = int((last - start) / step) + 1 if last >= start else 0
        count = min(count, _MAX_CANDLES)
        ltp = self.last_price(instrument_token)
        rows: list[dict[str, Any]] = []
        for i in range(count):
            # A gentle wave that lands exactly on the paper price at the end.
            offset = count - 1 - i
            mid = ltp * (1 + 0.01 * math.sin(offset / 7.0)) if offset else ltp
            open_ = rows[-1]["close"] if rows else mid
            close = round(mid, 2)
            rows.append({
                "date": last - step * offset,
                "open": round(open_, 2),
                "high": round(max(open_, close) * 1.002, 2),
                "low": round(min(open_, close) * 0.998, 2),
                "close": close,
                "volume": 1000,
            })
        return rows

    # ── Account ─────────────────────────────────────────────────────────────

    def profile(self) -> dict[str, Any]:
        return {"user_id": PAPER_USER_ID, "user_name": "Paper Trading", "email": None, "broker": "PAPER"}

    def margins(self, segment: str | None = None) -> dict[str, Any]:
        return {"equity": {"net": 1_000_000.0, "available": {"live_balance": 1_000_000.0, "cash": 1_000_000.0}}}

    def holdings(self) -> list[dict[str, Any]]:
        return []

    def positions(self) -> dict[str, list[dict[str, Any]]]:
        with self._lock:
            book: dict[tuple[str, str, str], dict[str, Any]] = {}
            for order in self._orders:
                if order["status"] != "COMPLETE":
                    continue
                key = (order["exchange"], order["tradingsymbol"], order["product"])
                row = book.setdefault(key, {
                    "tradingsymbol": order["tradingsymbol"],
                    "exchange": order["exchange"],
                    "instrument_token": order["instrument_token"],
                    "product": order["product"],
                    "buy_quantity": 0, "sell_quantity": 0,
                    "buy_value": 0.0, "sell_value": 0.0,
                })
                qty, value = order["filled_quantity"], order["filled_quantity"] * order["average_price"]
                if order["transaction_type"] == "BUY":
                    row["buy_quantity"] += qty
                    row["buy_value"] += value
                else:
                    row["sell_quantity"] += qty
                    row["sell_value"] += value
            net = []
            for row in book.values():
                ltp = self.last_price(row["instrument_token"])
                quantity = row["buy_quantity"] - row["sell_quantity"]
                pnl = row["sell_value"] - row["buy_value"] + quantity * ltp
                held_value = row["buy_value"] if quantity > 0 else row["sell_value"]
                held_qty = row["buy_quantity"] if quantity > 0 else row["sell_quantity"]
                net.append({
                    **row,
                    "quantity": quantity,
                    "average_price": round(held_value / held_qty, 2) if held_qty else 0.0,
                    "last_price": ltp,
                    "pnl": round(pnl, 2),
                    "m2m": round(pnl, 2),
                })
            return {"net": net, "day": net}

    # ── Orders ──────────────────────────────────────────────────────────────

    def orders(self) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(order) for order in self._orders]

    def place_order(
        self,
        variety: str,
        exchange: str,
        tradingsymbol: str,
        transaction_type: str,
        quantity: int,
        product: str,
        order_type: str,
        price: float | None = None,
        validity: str | None = None,
        trigger_price: float | None = None,
        tag: str | None = None,
        **_: Any,
    ) -> str:
        """Validate like Kite, record the order and match it against the price."""
        row = self._instrument(exchange, tradingsymbol)
        token = int(row["instrument_token"])
        side = transaction_type.upper()
        kind = order_type.upper()
        if side not in ("BUY", "SELL"):
            raise InputException(f"Invalid `transaction_type` {transaction_type}.")
        if kind not in ("MARKET", "LIMIT", "SL", "SL-M"):
            raise InputException(f"Invalid `order_type` {order_type}.")
        if tag is not None and not _TAG_PATTERN.match(tag):
            raise InputException("Invalid `tag`. Tags must be alphanumeric and at most 20 characters.")
        lot = int(row.get("lot_size") or 1)
        if quantity <= 0 or quantity % lot:
            raise InputException(f"Quantity should be a multiple of the lot size ({lot}).")
        tick = float(row.get("tick_size") or 0.05)
        if kind in ("LIMIT", "SL") and not price:
            raise InputException("Price is required for LIMIT and SL orders.")
        if kind in ("SL", "SL-M") and not trigger_price:
            raise InputException("Trigger price is required for SL and SL-M orders.")
        for label, value in (("Price", price), ("Trigger price", trigger_price)):
            if value and not _on_tick(value, tick):
                raise InputException(f"{label} {value} is not a multiple of the tick size ({tick}).")

        ltp = self.last_price(token)
        if kind == "SL" and price and trigger_price:
            if side == "BUY" and price < trigger_price:
                raise InputException("Trigger price for stoploss buy orders should be lower than the limit price.")
            if side == "SELL" and price > trigger_price:
                raise InputException("Trigger price for stoploss sell orders should be higher than the limit price.")
        if kind in ("SL", "SL-M"):
            if side == "BUY" and trigger_price <= ltp:
                raise OrderException(
                    f"Trigger price for stoploss buy orders should be higher than the last traded price ({ltp})."
                )
            if side == "SELL" and trigger_price >= ltp:
                raise OrderException(
                    f"Trigger price for stoploss sell orders should be lower than the last traded price ({ltp})."
                )

        now = self._clock()
        with self._lock:
            order_id = f"PAPER{next(self._order_ids):06d}"
            order = {
                "order_id": order_id,
                "exchange_order_id": None,
                "parent_order_id": None,
                "status": "OPEN",
                "status_message": None,
                "order_timestamp": now,
                "exchange_timestamp": None,
                "variety": variety,
                "exchange": exchange.upper(),
                "tradingsymbol": tradingsymbol.upper(),
                "instrument_token": token,
                "order_type": kind,
                "transaction_type": side,
                "validity": validity or "DAY",
                "product": product,
                "quantity": quantity,
                "disclosed_quantity": 0,
                "price": float(price or 0),
                "trigger_price": float(trigger_price or 0),
                "average_price": 0.0,
                "filled_quantity": 0,
                "pending_quantity": quantity,
                "cancelled_quantity": 0,
                "tag": tag,
                "tags": [tag] if tag else [],
                "guid": uuid.uuid4().hex,
            }
            if kind in ("SL", "SL-M"):
                order["status"] = "TRIGGER PENDING"
            self._orders.append(order)
            self._match_order(order, ltp)
        LOGGER.info("Paper order %s: %s %s %s x%s", order_id, side, kind, tradingsymbol, quantity)
        return order_id

    def cancel_order(self, variety: str, order_id: str, **_: Any) -> dict[str, Any]:
        with self._lock:
            order = next((o for o in self._orders if o["order_id"] == str(order_id)), None)
            if order is None:
                raise InputException(f"Order {order_id} not found.")
            if order["variety"] != variety:
                raise InputException(f"Order variety mismatch: placed as `{order['variety']}`.")
            if order["status"] in _TERMINAL:
                raise OrderException(f"Order cannot be cancelled as it is being processed or already {order['status'].lower()}.")
            order["status"] = "CANCELLED"
            order["cancelled_quantity"] = order["pending_quantity"]
            order["pending_quantity"] = 0
            return {"order_id": order["order_id"]}

    def _match_orders(self, instrument_token: int) -> None:
        ltp = self._prices[instrument_token]
        for order in self._orders:
            if order["instrument_token"] == instrument_token and order["status"] not in _TERMINAL:
                self._match_order(order, ltp)

    def _match_order(self, order: dict[str, Any], ltp: float) -> None:
        buy = order["transaction_type"] == "BUY"
        if order["status"] == "TRIGGER PENDING":
            trigger = order["trigger_price"]
            if (buy and ltp < trigger) or (not buy and ltp > trigger):
                return
            # Triggered: Kite releases it to the exchange as a plain LIMIT
            # (SL) or MARKET (SL-M) order and reports that type from now on.
            order["order_type"] = "LIMIT" if order["order_type"] == "SL" else "MARKET"
            order["trigger_price"] = 0.0
            order["status"] = "OPEN"
        kind = order["order_type"]
        if kind == "MARKET":
            self._fill(order, ltp)
        elif kind == "LIMIT" and ((buy and ltp <= order["price"]) or (not buy and ltp >= order["price"])):
            # A marketable limit fills at the better of its price and the market.
            self._fill(order, min(ltp, order["price"]) if buy else max(ltp, order["price"]))

    def _fill(self, order: dict[str, Any], price: float) -> None:
        order["status"] = "COMPLETE"
        order["average_price"] = round(price, 2)
        order["filled_quantity"] = order["quantity"]
        order["pending_quantity"] = 0
        order["exchange_order_id"] = f"EX{order['order_id']}"
        order["exchange_timestamp"] = self._clock()

    # ── GTTs ────────────────────────────────────────────────────────────────

    def get_gtts(self) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(gtt) for gtt in self._gtts]

    def place_gtt(
        self,
        trigger_type: str,
        tradingsymbol: str,
        exchange: str,
        trigger_values: list[float],
        last_price: float,
        orders: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Validate an OCO the way Kite does and keep it active until a trigger hits."""
        row = self._instrument(exchange, tradingsymbol)
        if trigger_type != self.GTT_TYPE_OCO:
            raise InputException("Only two-leg (OCO) GTTs are emulated.")
        if len(trigger_values) != 2 or len(orders) != 2:
            raise InputException("A two-leg GTT needs exactly two trigger values and two orders.")
        lower, upper = (float(v) for v in trigger_values)
        if not lower < float(last_price) < upper:
            raise InputException(
                f"Trigger values {trigger_values} must straddle the last price {last_price} (lower first)."
            )
        tick = float(row.get("tick_size") or 0.05)
        lot = int(row.get("lot_size") or 1)
        for leg in orders:
            if leg.get("transaction_type") not in ("BUY", "SELL"):
                raise InputException("GTT order transaction_type must be BUY or SELL.")
            if str(leg.get("order_type")).upper() != "LIMIT":
                raise InputException("GTT orders must be LIMIT orders.")
            quantity = int(leg.get("quantity") or 0)
            if quantity <= 0 or quantity % lot:
                raise InputException(f"GTT quantity should be a multiple of the lot size ({lot}).")
            if not _on_tick(float(leg.get("price") or 0), tick):
                raise InputException(f"GTT price {leg.get('price')} is not a multiple of the tick size ({tick}).")
        now = self._clock()
        with self._lock:
            gtt_id = next(self._gtt_ids)
            self._gtts.append({
                "id": gtt_id,
                "user_id": PAPER_USER_ID,
                "type": trigger_type,
                "status": "active",
                "created_at": now,
                "updated_at": now,
                "expires_at": now + timedelta(days=365),
                "condition": {
                    "exchange": exchange,
                    "tradingsymbol": tradingsymbol,
                    "instrument_token": int(row["instrument_token"]),
                    "trigger_values": [lower, upper],
                    "last_price": float(last_price),
                },
                "orders": [{**leg, "exchange": exchange, "tradingsymbol": tradingsymbol, "result": None} for leg in orders],
            })
        LOGGER.info("Paper GTT %s: %s %s triggers %s", gtt_id, exchange, tradingsymbol, trigger_values)
        return {"trigger_id": gtt_id}

    def delete_gtt(self, trigger_id: int) -> dict[str, Any]:
        with self._lock:
            gtt = next((g for g in self._gtts if g["id"] == int(trigger_id)), None)
            if gtt is None or gtt["status"] != "active":
                raise InputException(f"GTT {trigger_id} not found or not active.")
            gtt["status"] = "deleted"
            gtt["updated_at"] = self._clock()
            return {"trigger_id": gtt["id"]}

    def _match_gtts(self, instrument_token: int) -> None:
        ltp = self._prices[instrument_token]
        for gtt in self._gtts:
            condition = gtt["condition"]
            if gtt["status"] != "active" or condition["instrument_token"] != instrument_token:
                continue
            lower, upper = condition["trigger_values"]
            if ltp <= lower:
                leg_index = 0
            elif ltp >= upper:
                leg_index = 1
            else:
                continue
            leg = gtt["orders"][leg_index]
            gtt["status"] = "triggered"
            gtt["updated_at"] = self._clock()
            order_id = self.place_order(
                variety=self.VARIETY_REGULAR,
                exchange=condition["exchange"],
                tradingsymbol=condition["tradingsymbol"],
                transaction_type=leg["transaction_type"],
                quantity=int(leg["quantity"]),
                product=leg["product"],
                order_type="LIMIT",
                price=float(leg["price"]),
            )
            leg["result"] = {"order_result": {"order_id": order_id, "status": "success"}}


def default_paper_instruments(today: date | None = None) -> dict[str, list[dict[str, Any]]]:
    """A minimal instrument set for when no real instrument download is cached:
    NIFTY 50 plus weekly NIFTY options around 25000 for the next Tuesday expiry."""
    today = today or date.today()
    expiry = today + timedelta(days=(1 - today.weekday()) % 7 or 7)
    month_code = "123456789OND"[expiry.month - 1]
    prefix = f"NIFTY{expiry:%y}{month_code}{expiry:%d}"
    nfo: list[dict[str, Any]] = []
    token = 9_000_001
    for strike in range(24_800, 25_201, 100):
        for option_type in ("CE", "PE"):
            nfo.append({
                "instrument_token": token,
                "exchange_token": token // 256,
                "tradingsymbol": f"{prefix}{strike}{option_type}",
                "name": "NIFTY",
                "last_price": 0.0,
                "expiry": expiry.isoformat(),
                "strike": float(strike),
                "tick_size": 0.05,
                "lot_size": 65,
                "instrument_type": option_type,
                "segment": "NFO-OPT",
                "exchange": "NFO",
            })
            token += 1
    nse = [{
        "instrument_token": 256265,
        "exchange_token": 1001,
        "tradingsymbol": "NIFTY 50",
        "name": "NIFTY 50",
        "last_price": 0.0,
        "expiry": "",
        "strike": 0.0,
        "tick_size": 0.0,
        "lot_size": 0,
        "instrument_type": "EQ",
        "segment": "INDICES",
        "exchange": "NSE",
    }]
    return {"NSE": nse, "BSE": [], "NFO": nfo, "MCX": [], "CDS": []}


class PaperTickBroadcaster:
    """Drop-in for ``TickBroadcaster`` that streams paper price changes."""

    def __init__(self, paper: PaperKite) -> None:
        self._paper = paper
        self._clients: dict[str, tuple[set[int], queue.Queue[dict[str, Any]]]] = {}
        self._lock = threading.Lock()
        paper.add_price_listener(self._on_price)

    def connect_client(self, tokens: list[int]) -> tuple[str, queue.Queue[dict[str, Any]]]:
        """Register an SSE client and send it the current price of each token."""
        client_id = str(uuid.uuid4())
        q: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=200)
        with self._lock:
            self._clients[client_id] = (set(tokens), q)
        for token in tokens:
            try:
                self._put(q, token, self._paper.last_price(token))
            except (KeyError, ValueError):
                continue
        return client_id, q

    def disconnect_client(self, client_id: str) -> None:
        with self._lock:
            self._clients.pop(client_id, None)

    def _on_price(self, instrument_token: int, price: float) -> None:
        with self._lock:
            targets = [q for tokens, q in self._clients.values() if instrument_token in tokens]
        for q in targets:
            self._put(q, instrument_token, price)

    @staticmethod
    def _put(q: queue.Queue[dict[str, Any]], instrument_token: int, price: float) -> None:
        try:
            q.put_nowait({
                "instrument_token": instrument_token,
                "last_price": price,
                "timestamp": datetime.now().isoformat(),
                "ohlc": None,
                "volume": None,
            })
        except queue.Full:
            pass


def _on_tick(value: float, tick: float) -> bool:
    steps = value / tick
    return abs(steps - round(steps)) < 1e-6


def _naive(value: datetime | date) -> datetime:
    if not isinstance(value, datetime):
        value = datetime.combine(value, datetime.min.time())
    return value.replace(tzinfo=None)
