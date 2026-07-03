from __future__ import annotations

import json
import logging
import mimetypes
import os
import queue
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from zerodha_app.accounts import AccountStore
from zerodha_app.appauth import UserStore, public_user
from zerodha_app.auth import AuthManager
from zerodha_app.config import Settings, load_watchlist
from zerodha_app.dashboard import _history_window, _load_history_with_fallback
from zerodha_app.instruments import InstrumentCatalog

try:
    from kiteconnect import KiteConnect
except ModuleNotFoundError:
    KiteConnect = None

try:
    from kiteconnect.exceptions import TokenException as _TOKEN_EXCEPTION
except Exception:
    _TOKEN_EXCEPTION = None


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


FRONTEND_URL = os.getenv("APP_URL", "http://127.0.0.1:5173").rstrip("/")

# Root of the built React app. When present the Python server serves it directly
# so no separate Vite dev server or nginx is needed in production.
_DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"
_SESSION_COOKIE_MAX_AGE = 12 * 60 * 60


@dataclass(slots=True)
class APIOptions:
    settings: Settings
    host: str = "127.0.0.1"
    port: int = 8080
    login_if_needed: bool = False


class TickBroadcaster:
    """Runs KiteTicker in a background thread; fans ticks out to SSE clients."""

    def __init__(self, api_key: str, access_token: str) -> None:
        self._api_key = api_key
        self._access_token = access_token
        self._clients: dict[str, queue.Queue[dict[str, Any]]] = {}
        self._subscribed: set[int] = set()
        self._lock = threading.Lock()
        self._ticker: Any | None = None

    def connect_client(self, tokens: list[int]) -> tuple[str, queue.Queue[dict[str, Any]]]:
        """Register a new SSE client; subscribes tokens and returns (client_id, queue)."""
        client_id = str(uuid.uuid4())
        q: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=200)
        with self._lock:
            self._clients[client_id] = q
            self._ensure_started()
            new_tokens = [t for t in tokens if t not in self._subscribed]
            if new_tokens and self._ticker is not None:
                try:
                    self._ticker.subscribe(new_tokens)
                    self._ticker.set_mode(self._ticker.MODE_FULL, new_tokens)
                    self._subscribed.update(new_tokens)
                except Exception:
                    LOGGER.exception("TickBroadcaster: failed to subscribe tokens %s", new_tokens)
        return client_id, q

    def disconnect_client(self, client_id: str) -> None:
        with self._lock:
            self._clients.pop(client_id, None)

    def _ensure_started(self) -> None:
        if self._ticker is not None:
            return
        try:
            from kiteconnect import KiteTicker as _KT
        except ModuleNotFoundError:
            LOGGER.warning("TickBroadcaster: kiteconnect not installed — live ticks unavailable")
            return
        ticker = _KT(api_key=self._api_key, access_token=self._access_token)
        ticker.on_connect = self._on_connect
        ticker.on_ticks = self._on_ticks
        ticker.on_close = self._on_close
        ticker.on_error = self._on_error
        ticker.connect(threaded=True)
        self._ticker = ticker
        LOGGER.info("TickBroadcaster: KiteTicker started")

    def _on_connect(self, ws: Any, _response: Any) -> None:
        with self._lock:
            tokens = list(self._subscribed)
        if tokens:
            ws.subscribe(tokens)
            ws.set_mode(ws.MODE_FULL, tokens)
        LOGGER.info("TickBroadcaster: connected, subscribed %d tokens", len(tokens))

    def _on_ticks(self, _ws: Any, ticks: list[dict[str, Any]]) -> None:
        with self._lock:
            clients = list(self._clients.values())
        if not clients:
            return
        for tick in ticks:
            ts = tick.get("exchange_timestamp") or tick.get("last_trade_time")
            payload: dict[str, Any] = {
                "instrument_token": tick.get("instrument_token"),
                "last_price": tick.get("last_price"),
                "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else datetime.now().isoformat(),
                "ohlc": tick.get("ohlc"),
                "volume": tick.get("volume_traded") or tick.get("volume"),
            }
            for q in clients:
                try:
                    q.put_nowait(payload)
                except queue.Full:
                    pass  # slow client — drop tick rather than block

    def _on_close(self, _ws: Any, code: int, reason: str) -> None:
        LOGGER.info("TickBroadcaster: closed code=%s reason=%s", code, reason)
        with self._lock:
            self._ticker = None  # allow restart on next connect_client call

    def _on_error(self, _ws: Any, code: int, reason: str) -> None:
        LOGGER.error("TickBroadcaster: error code=%s reason=%s", code, reason)


class ZerodhaFrontendAPI:
    def __init__(self, options: APIOptions) -> None:
        self.options = options
        # Kite clients and tick broadcasters are cached per account (keyed by the
        # Zerodha user_id, or None for the legacy/global single-account token).
        self._kite_by_account: dict[str | None, tuple[Any, str]] = {}
        self._instrument_catalog: InstrumentCatalog | None = None
        self._raw_instruments: list[dict[str, Any]] | None = None
        self._instrument_by_token: dict[int, dict[str, Any]] = {}
        self._instrument_by_symbol: dict[str, dict[str, Any]] = {}
        self._broadcaster_by_account: dict[str | None, TickBroadcaster] = {}
        self._broadcaster_lock = threading.Lock()
        # The active account for the in-flight request (set per worker thread).
        self._request_ctx = threading.local()
        self._user_store: UserStore | None = None
        self._account_store: AccountStore | None = None

    def account_store(self) -> AccountStore:
        if self._account_store is None:
            self._account_store = AccountStore(self.options.settings.app_db_path)
        return self._account_store

    # ── Per-request active account ───────────────────────────────────────────

    def set_request_account(self, account_user_id: str | None) -> None:
        self._request_ctx.account_user_id = account_user_id

    def _active_account_user_id(self) -> str | None:
        return getattr(self._request_ctx, "account_user_id", None)

    # ── App auth (users/sessions) ────────────────────────────────────────────

    def user_store(self) -> UserStore:
        if self._user_store is None:
            self._user_store = UserStore(self.options.settings.app_db_path)
        return self._user_store

    def app_login(self, username: str, password: str) -> tuple[dict[str, Any], str]:
        """Validate credentials and open a session. Returns (public_user, token)."""
        user = self.user_store().authenticate(username, password)
        if user is None:
            raise PermissionError("Invalid username or password.")
        token = self.user_store().create_session(user["id"])
        return public_user(user), token

    def app_user_for_token(self, token: str | None) -> dict[str, Any] | None:
        return self.user_store().get_session_user(token)

    def handle_token_invalid(self) -> None:
        """Evict the active account's rejected token so it flips to 'not connected'."""
        account_user_id = self._active_account_user_id()
        AuthManager(self.options.settings).invalidate_token(account_user_id)
        self._kite_by_account.pop(account_user_id, None)
        self._broadcaster_by_account.pop(account_user_id, None)

    def app_logout(self, token: str | None) -> None:
        self.user_store().delete_session(token)

    def list_app_users(self) -> list[dict[str, Any]]:
        return [
            {"id": u["id"], "username": u["username"], "role": u["role"], "active": u["active"]}
            for u in self.user_store().list_users()
        ]

    def create_app_user(self, username: str, password: str, role: str) -> dict[str, Any]:
        user_id = self.user_store().create_user(username, password, role)
        return public_user(self.user_store().get_user_by_id(user_id))

    # ── Accounts ─────────────────────────────────────────────────────────────

    def accounts_for_user(self, user: dict[str, Any]) -> list[dict[str, Any]]:
        """Accounts visible to a user, each tagged with today's connection state."""
        store = self.account_store()
        accounts = (
            store.list_accounts()
            if user["role"] == "super_admin"
            else store.list_accounts_for_user(user["id"])
        )
        connected = AuthManager(self.options.settings).connected_account_user_ids()
        return [
            {
                "id": account["id"],
                "label": account["label"],
                "zerodha_user_id": account["zerodha_user_id"],
                "connected": account["zerodha_user_id"] in connected,
            }
            for account in accounts
        ]

    def select_account(self, token: str, user: dict[str, Any], account_id: int) -> dict[str, Any]:
        """Set the session's active account after validating access + connection."""
        store = self.account_store()
        account = store.get_account(account_id)
        if account is None:
            raise ValueError("Account not found.")
        if user["role"] != "super_admin" and not store.is_assigned(user["id"], account_id):
            raise PermissionError("Account is not assigned to you.")
        connected = AuthManager(self.options.settings).connected_account_user_ids()
        if account["zerodha_user_id"] not in connected:
            raise ValueError("Account is not connected. Ask an admin to connect it.")
        self.user_store().set_active_account(token, account_id)
        return account

    def account_assignments(self, account_id: int) -> list[dict[str, Any]]:
        """Public user records for everyone assigned to an account."""
        assigned: list[dict[str, Any]] = []
        for user_id in self.account_store().assigned_user_ids(account_id):
            user = self.user_store().get_user_by_id(user_id)
            if user is not None:
                assigned.append(public_user(user))
        return assigned

    def remove_account(self, account_id: int) -> None:
        """Delete an account, evict its token, and drop its assignments (cascade)."""
        account = self.account_store().get_account(account_id)
        if account is None:
            raise ValueError("Account not found.")
        user_id = account["zerodha_user_id"]
        AuthManager(self.options.settings).invalidate_token(user_id)
        self._kite_by_account.pop(user_id, None)
        self._broadcaster_by_account.pop(user_id, None)
        self.account_store().delete_account(account_id)

    def assign_account(self, account_id: int, user_id: int) -> None:
        if self.account_store().get_account(account_id) is None:
            raise ValueError("Account not found.")
        if self.user_store().get_user_by_id(user_id) is None:
            raise ValueError("User not found.")
        self.account_store().assign(user_id, account_id)

    def unassign_account(self, account_id: int, user_id: int) -> None:
        self.account_store().unassign(user_id, account_id)

    # ── Editing existing users (super-admin targets are protected) ───────────

    def _editable_user(self, user_id: int) -> dict[str, Any]:
        user = self.user_store().get_user_by_id(user_id)
        if user is None:
            raise ValueError("User not found.")
        if user["role"] == "super_admin":
            raise PermissionError("Super-admin users cannot be edited here.")
        return user

    def update_user_role(self, user_id: int, role: str) -> None:
        self._editable_user(user_id)
        if role not in ("buyer", "seller", "trader"):
            raise ValueError("Role must be 'buyer', 'seller', or 'trader'.")
        self.user_store().set_role(user_id, role)

    def reset_user_password(self, user_id: int, password: str) -> None:
        self._editable_user(user_id)
        if not password:
            raise ValueError("Password must not be empty.")
        self.user_store().set_password_by_id(user_id, password)

    def set_user_active(self, user_id: int, active: bool) -> None:
        self._editable_user(user_id)
        self.user_store().set_active(user_id, active)

    def delete_user(self, user_id: int) -> None:
        self._editable_user(user_id)
        self.account_store().remove_user(user_id)
        self.user_store().delete_user(user_id)

    def user_accounts(self, user_id: int) -> list[dict[str, Any]]:
        """Accounts assigned to a user, tagged with today's connection state."""
        connected = AuthManager(self.options.settings).connected_account_user_ids()
        return [
            {
                "id": account["id"],
                "label": account["label"],
                "zerodha_user_id": account["zerodha_user_id"],
                "connected": account["zerodha_user_id"] in connected,
            }
            for account in self.account_store().list_accounts_for_user(user_id)
        ]

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

    def funds(self) -> dict[str, Any]:
        kite = self._get_kite()
        # Zerodha integration point:
        # margins() returns per-segment funds; expose the spendable equity cash.
        margins = kite.margins()
        equity = margins.get("equity", {}) if isinstance(margins, dict) else {}
        available = equity.get("available", {}) if isinstance(equity, dict) else {}
        if "live_balance" in available:
            cash = available["live_balance"]
        elif "cash" in available:
            cash = available["cash"]
        else:
            cash = equity.get("net", 0.0)
        return {"availableCash": float(cash or 0.0)}

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

    def get_orders(self) -> dict[str, Any]:
        kite = self._get_kite()
        orders = kite.orders()
        return {
            "ok": True,
            "orders": orders,
        }

    def get_holdings(self) -> dict[str, Any]:
        kite = self._get_kite()
        holdings = kite.holdings()
        return {
            "ok": True,
            "holdings": holdings,
        }

    # ── Auth helpers ─────────────────────────────────────────────────────────

    def get_auth_status(self) -> dict[str, Any]:
        auth = AuthManager(self.options.settings)
        authenticated = auth.get_cached_access_token() is not None
        return {"authenticated": authenticated}

    def get_login_url(self) -> dict[str, Any]:
        if KiteConnect is None:
            raise RuntimeError("kiteconnect is not installed.")
        kite = KiteConnect(api_key=self.options.settings.api_key)
        return {"loginUrl": kite.login_url()}

    def handle_oauth_callback(self, request_token: str) -> None:
        """Exchange request_token, cache the per-account token, and upsert the account."""
        auth = AuthManager(self.options.settings)
        _, user_id, user_name = auth.create_session_detailed(request_token)
        if user_id:
            self.account_store().upsert_account(user_id, label=user_name or user_id)

    # ─────────────────────────────────────────────────────────────────────────

    def save_watchlist(self, payload: Any) -> dict[str, Any]:
        target = self.options.settings.watchlist_path
        target.write_text(json.dumps(payload, indent=2))
        return {"ok": True, "message": f"Watchlist saved to {target}"}

    def load_watchlist(self) -> Any:
        target = self.options.settings.watchlist_path
        if not target.exists():
            return []
        return json.loads(target.read_text())

    def get_broadcaster(self) -> TickBroadcaster:
        account_user_id = self._active_account_user_id()
        with self._broadcaster_lock:
            broadcaster = self._broadcaster_by_account.get(account_user_id)
            if broadcaster is None:
                kite = self._get_kite()
                broadcaster = TickBroadcaster(
                    api_key=self.options.settings.api_key,
                    access_token=kite.access_token,
                )
                self._broadcaster_by_account[account_user_id] = broadcaster
            return broadcaster

    def _get_kite(self) -> Any:
        if KiteConnect is None:
            raise RuntimeError("kiteconnect is not installed. Run `pip install -r requirements.txt`.")

        account_user_id = self._active_account_user_id()
        auth = AuthManager(self.options.settings)
        # Re-read the cached token so a token written by the separate callback
        # bridge process is picked up without restarting the API server. Keep
        # the existing client unless a different token has since been cached.
        cached = auth.get_cached_access_token(account_user_id)
        entry = self._kite_by_account.get(account_user_id)
        if entry is not None and (cached is None or cached == entry[1]):
            return entry[0]

        if cached is None:
            # The API server never logs in interactively (it is headless and
            # account-scoped). A missing token means the account must be
            # (re)connected via the OAuth flow.
            raise RuntimeError("This account is not connected. Ask an admin to reconnect it.")
        access_token = cached
        kite = KiteConnect(api_key=self.options.settings.api_key)
        kite.set_access_token(access_token)
        self._kite_by_account[account_user_id] = (kite, access_token)
        # Drop any broadcaster bound to the old token so it rebinds on next use.
        self._broadcaster_by_account.pop(account_user_id, None)
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

            # ── Static files — serve immediately for any non-API path ──────────
            if not parsed.path.startswith("/api/") and _DIST_DIR.is_dir():
                self._serve_static(parsed.path)
                return

            # ── SSE live-tick stream — long-lived connection, handled separately ──
            if parsed.path == "/api/ticks/stream":
                token = self._get_cookie("sid")
                if api.app_user_for_token(token) is None:
                    self._send_json({"ok": False, "error": "authentication required"}, status=401)
                    return
                if self._apply_active_account(token) is None:
                    self._send_json({"ok": False, "error": "no account selected", "code": "NO_ACCOUNT"}, status=409)
                    return
                params = parse_qs(parsed.query)
                raw = params.get("tokens", [""])[0]
                tokens = [int(t) for t in raw.split(",") if t.strip().isdigit()]
                if not tokens:
                    self._send_json({"error": "tokens parameter required"}, status=400)
                    return
                try:
                    broadcaster = api.get_broadcaster()
                except Exception as exc:
                    self._send_json({"error": str(exc)}, status=500)
                    return
                client_id, tick_queue = broadcaster.connect_client(tokens)
                try:
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Cache-Control", "no-cache")
                    self.send_header("Connection", "keep-alive")
                    self.send_header("Access-Control-Allow-Origin", FRONTEND_URL)
                    self.send_header("X-Accel-Buffering", "no")
                    self.end_headers()
                    while True:
                        try:
                            tick = tick_queue.get(timeout=20)
                            self.wfile.write(f"data: {json.dumps(tick)}\n\n".encode())
                            self.wfile.flush()
                        except queue.Empty:
                            self.wfile.write(b": ping\n\n")
                            self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError, OSError):
                    pass
                finally:
                    broadcaster.disconnect_client(client_id)
                return

            try:
                # ── Open endpoints (no app session required) ──
                if parsed.path == "/api/health":
                    self._send_json({"ok": True, "status": "healthy"})
                    return
                if parsed.path == "/api/auth/callback":
                    params = parse_qs(parsed.query)
                    request_token = params.get("request_token", [""])[0].strip()
                    if not request_token:
                        self._send_redirect(f"{FRONTEND_URL}?auth=error")
                        return
                    try:
                        api.handle_oauth_callback(request_token)
                        self._send_redirect(f"{FRONTEND_URL}?auth=success")
                    except Exception as exc:
                        LOGGER.exception("OAuth callback failed")
                        self._send_redirect(f"{FRONTEND_URL}?auth=error&reason={exc}")
                    return
                if parsed.path == "/api/app/me":
                    me_token = self._get_cookie("sid")
                    current = api.app_user_for_token(me_token)
                    if current is None:
                        self._send_json({"ok": False, "error": "authentication required"}, status=401)
                        return
                    active_id = api.user_store().get_active_account_id(me_token)
                    active = api.account_store().get_account(active_id) if active_id else None
                    # Don't surface an account whose token is gone — it would
                    # boot the dashboard straight into a token error. Force the
                    # user back to the picker to reconnect/reselect.
                    if active is not None:
                        connected = AuthManager(api.options.settings).connected_account_user_ids()
                        if active["zerodha_user_id"] not in connected:
                            active = None
                    self._send_json(
                        {
                            "ok": True,
                            "user": public_user(current),
                            "activeAccount": {"id": active["id"], "label": active["label"]} if active else None,
                        }
                    )
                    return

                # ── All endpoints below require a valid app session ──
                token = self._get_cookie("sid")
                user = api.app_user_for_token(token)
                if user is None:
                    self._send_json({"ok": False, "error": "authentication required"}, status=401)
                    return

                if parsed.path == "/api/accounts":
                    self._send_json({"ok": True, "accounts": api.accounts_for_user(user)})
                    return
                if parsed.path == "/api/app/users":
                    if not self._require_role(user, "super_admin"):
                        return
                    self._send_json({"ok": True, "users": api.list_app_users()})
                    return
                if parsed.path.startswith("/api/accounts/") and parsed.path.endswith("/users"):
                    if not self._require_role(user, "super_admin"):
                        return
                    account_id_text = parsed.path.split("/")[3]
                    if not account_id_text.isdigit():
                        self.send_error(404, "Not found")
                        return
                    self._send_json({"ok": True, "users": api.account_assignments(int(account_id_text))})
                    return
                if parsed.path.startswith("/api/app/users/") and parsed.path.endswith("/accounts"):
                    if not self._require_role(user, "super_admin"):
                        return
                    user_id_text = parsed.path.split("/")[4]
                    if not user_id_text.isdigit():
                        self.send_error(404, "Not found")
                        return
                    self._send_json({"ok": True, "accounts": api.user_accounts(int(user_id_text))})
                    return
                if parsed.path == "/api/auth/status":
                    self._send_json(api.get_auth_status())
                    return
                if parsed.path == "/api/auth/login-url":
                    if not self._require_role(user, "super_admin"):
                        return
                    self._send_json(api.get_login_url())
                    return

                # ── Account-scoped data endpoints (an account must be selected) ──
                if self._apply_active_account(token) is None:
                    self._send_json(
                        {"ok": False, "error": "no account selected", "code": "NO_ACCOUNT"},
                        status=409,
                    )
                    return

                if parsed.path == "/api/profile":
                    self._send_json(api.profile())
                    return
                if parsed.path == "/api/funds":
                    self._send_json(api.funds())
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
                if parsed.path == "/api/orders/list":
                    self._send_json(api.get_orders())
                    return
                if parsed.path == "/api/holdings":
                    self._send_json(api.get_holdings())
                    return
                if parsed.path == "/api/watchlist":
                    self._send_json(api.load_watchlist())
                    return
            except Exception as exc:
                if _is_client_disconnect(exc):
                    LOGGER.debug("Client disconnected during GET %s", parsed.path)
                    return
                if _TOKEN_EXCEPTION is not None and isinstance(exc, _TOKEN_EXCEPTION):
                    api.handle_token_invalid()
                    self._send_json(
                        {"ok": False, "error": "Account session expired. Reconnect required.", "code": "TOKEN_INVALID"},
                        status=409,
                    )
                    return
                LOGGER.exception("API GET failed")
                self._send_json({"ok": False, "error": str(exc)}, status=500)
                return
            self.send_error(404, "Not found")

        def _serve_static(self, url_path: str) -> None:
            """Serve files from frontend/dist/, falling back to index.html for SPA routing."""
            # Strip query string and normalise path
            clean = url_path.split("?")[0].lstrip("/")
            candidate = (_DIST_DIR / clean).resolve()
            # Prevent path traversal outside dist
            try:
                candidate.relative_to(_DIST_DIR.resolve())
            except ValueError:
                self.send_error(403, "Forbidden")
                return
            if not candidate.exists() or candidate.is_dir():
                candidate = _DIST_DIR / "index.html"
            if not candidate.exists():
                self.send_error(404, "Not found")
                return
            data = candidate.read_bytes()
            mime, _ = mimetypes.guess_type(str(candidate))
            self.send_response(200)
            self.send_header("Content-Type", mime or "application/octet-stream")
            self.send_header("Content-Length", str(len(data)))
            if candidate.suffix in {".js", ".css", ".woff2", ".woff", ".ttf", ".png", ".jpg", ".svg", ".ico"}:
                self.send_header("Cache-Control", "public, max-age=31536000, immutable")
            else:
                self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(data)

        def do_POST(self) -> None:
            parsed = urlparse(self.path)
            try:
                if parsed.path == "/api/app/login":
                    body = self._read_json()
                    username = str(body.get("username") or "").strip()
                    password = str(body.get("password") or "")
                    try:
                        user, token = api.app_login(username, password)
                    except PermissionError as exc:
                        self._send_json({"ok": False, "error": str(exc)}, status=401)
                        return
                    self._send_json(
                        {"ok": True, "user": user},
                        set_cookie=("sid", token, _SESSION_COOKIE_MAX_AGE),
                    )
                    return
                if parsed.path == "/api/app/logout":
                    api.app_logout(self._get_cookie("sid"))
                    self._send_json({"ok": True}, set_cookie=("sid", "", 0))
                    return

                # ── All endpoints below require a valid app session ──
                token = self._get_cookie("sid")
                user = api.app_user_for_token(token)
                if user is None:
                    self._send_json({"ok": False, "error": "authentication required"}, status=401)
                    return

                if parsed.path == "/api/session/select-account":
                    body = self._read_json()
                    try:
                        account = api.select_account(token, user, int(body.get("accountId") or 0))
                    except PermissionError as exc:
                        self._send_json({"ok": False, "error": str(exc)}, status=403)
                        return
                    self._send_json({"ok": True, "account": {"id": account["id"], "label": account["label"]}})
                    return
                if parsed.path == "/api/app/users":
                    if not self._require_role(user, "super_admin"):
                        return
                    body = self._read_json()
                    created = api.create_app_user(
                        str(body.get("username") or ""),
                        str(body.get("password") or ""),
                        str(body.get("role") or ""),
                    )
                    self._send_json({"ok": True, "user": created})
                    return
                if parsed.path == "/api/accounts/assign":
                    if not self._require_role(user, "super_admin"):
                        return
                    body = self._read_json()
                    api.assign_account(int(body.get("accountId") or 0), int(body.get("userId") or 0))
                    self._send_json({"ok": True})
                    return
                if parsed.path == "/api/accounts/unassign":
                    if not self._require_role(user, "super_admin"):
                        return
                    body = self._read_json()
                    api.unassign_account(int(body.get("accountId") or 0), int(body.get("userId") or 0))
                    self._send_json({"ok": True})
                    return
                if parsed.path.startswith("/api/accounts/") and parsed.path.endswith("/delete"):
                    if not self._require_role(user, "super_admin"):
                        return
                    account_id_text = parsed.path.split("/")[3]
                    if not account_id_text.isdigit():
                        self.send_error(404, "Not found")
                        return
                    try:
                        api.remove_account(int(account_id_text))
                    except ValueError as exc:
                        self._send_json({"ok": False, "error": str(exc)}, status=400)
                        return
                    self._send_json({"ok": True})
                    return
                if parsed.path.startswith("/api/app/users/"):
                    if not self._require_role(user, "super_admin"):
                        return
                    parts = parsed.path.split("/")
                    if len(parts) != 6 or not parts[4].isdigit():
                        self.send_error(404, "Not found")
                        return
                    target_id = int(parts[4])
                    action = parts[5]
                    body = self._read_json()
                    try:
                        if action == "role":
                            api.update_user_role(target_id, str(body.get("role") or ""))
                        elif action == "password":
                            api.reset_user_password(target_id, str(body.get("password") or ""))
                        elif action == "active":
                            api.set_user_active(target_id, bool(body.get("active")))
                        elif action == "delete":
                            api.delete_user(target_id)
                        else:
                            self.send_error(404, "Not found")
                            return
                    except PermissionError as exc:
                        self._send_json({"ok": False, "error": str(exc)}, status=403)
                        return
                    except ValueError as exc:
                        self._send_json({"ok": False, "error": str(exc)}, status=400)
                        return
                    self._send_json({"ok": True})
                    return

                # ── Account-scoped data endpoints (an account must be selected) ──
                if self._apply_active_account(token) is None:
                    self._send_json(
                        {"ok": False, "error": "no account selected", "code": "NO_ACCOUNT"},
                        status=409,
                    )
                    return

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
                if _TOKEN_EXCEPTION is not None and isinstance(exc, _TOKEN_EXCEPTION):
                    api.handle_token_invalid()
                    self._send_json(
                        {"ok": False, "error": "Account session expired. Reconnect required.", "code": "TOKEN_INVALID"},
                        status=409,
                    )
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

        def _get_cookie(self, name: str) -> str | None:
            raw = self.headers.get("Cookie")
            if not raw:
                return None
            jar: SimpleCookie = SimpleCookie()
            try:
                jar.load(raw)
            except Exception:
                return None
            morsel = jar.get(name)
            return morsel.value if morsel else None

        def _current_user(self) -> dict[str, Any] | None:
            return api.app_user_for_token(self._get_cookie("sid"))

        def _require_role(self, user: dict[str, Any], role: str) -> bool:
            if user.get("role") != role:
                self._send_json({"ok": False, "error": "forbidden"}, status=403)
                return False
            return True

        def _apply_active_account(self, token: str | None) -> dict[str, Any] | None:
            """Resolve the session's active account and bind it to this request."""
            active_id = api.user_store().get_active_account_id(token)
            account = api.account_store().get_account(active_id) if active_id else None
            api.set_request_account(account["zerodha_user_id"] if account else None)
            return account

        def _send_json(
            self,
            payload: Any,
            *,
            status: int = 200,
            set_cookie: tuple[str, str, int] | None = None,
        ) -> None:
            encoded = json.dumps(payload).encode("utf-8")
            try:
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Access-Control-Allow-Origin", FRONTEND_URL)
                if set_cookie is not None:
                    name, value, max_age = set_cookie
                    self.send_header(
                        "Set-Cookie",
                        f"{name}={value}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}",
                    )
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)
            except Exception as exc:
                if _is_client_disconnect(exc):
                    LOGGER.debug("Client disconnected before response completed")
                    return
                raise

        def _send_redirect(self, url: str) -> None:
            try:
                self.send_response(302)
                self.send_header("Location", url)
                self.end_headers()
            except Exception as exc:
                if _is_client_disconnect(exc):
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
