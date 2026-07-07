from __future__ import annotations

import json
import sys
import threading
import webbrowser
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from kiteconnect import KiteConnect

from zerodha_app.config import Settings, ensure_runtime_dirs


_AUTH_FLOW_LOCK = threading.Lock()


class AuthManager:
    def __init__(
        self,
        settings: Settings,
        *,
        api_key: str | None = None,
        api_secret: str | None = None,
    ) -> None:
        """Manage Kite sessions.

        ``api_key``/``api_secret`` override the global settings pair so token
        exchange can run against a specific account's Kite Connect app.
        """
        self.settings = settings
        self._api_secret = api_secret or settings.api_secret
        self.kite = KiteConnect(api_key=api_key or settings.api_key)

    def get_access_token(self, *, auto_login: bool = False) -> str:
        token = self.get_cached_access_token()
        if token:
            return token

        with _AUTH_FLOW_LOCK:
            token = self.get_cached_access_token()
            if token:
                return token

            if auto_login:
                return self.interactive_login()

            if self._should_offer_interactive_login():
                answer = input(
                    "No cached Zerodha access token was found for today. Start login now? [Y/n]: "
                ).strip().lower()
                if answer in {"", "y", "yes"}:
                    return self.interactive_login()

        raise ValueError(
            "No cached access token found for today. Run `python run.py login` first."
        )

    def get_cached_access_token(
        self,
        account_user_id: str | None = None,
        target_date: date | None = None,
    ) -> str | None:
        """Return today's cached token.

        When ``account_user_id`` is given, look it up in the per-account store;
        otherwise resolve a single global/legacy token (used by the CLI and the
        single-account fallback).
        """
        current_date = target_date or date.today()
        store = self._load_store(self.settings.token_cache_path)
        if account_user_id:
            return store["by_account"].get(account_user_id, {}).get(current_date.isoformat())
        return self._resolve_legacy_token(store["legacy"], current_date)

    def invalidate_token(self, account_user_id: str | None = None, target_date: date | None = None) -> None:
        """Drop today's cached token for an account (e.g. after Kite rejects it)."""
        store = self._load_store(self.settings.token_cache_path)
        day = (target_date or date.today()).isoformat()
        if account_user_id and account_user_id in store["by_account"]:
            store["by_account"][account_user_id].pop(day, None)
        store["legacy"].pop(day, None)
        ensure_runtime_dirs(self.settings)
        self.settings.token_cache_path.write_text(json.dumps(store, indent=2))

    def connected_account_user_ids(self, target_date: date | None = None) -> set[str]:
        """User ids that have a cached token for the given day."""
        current_date = (target_date or date.today()).isoformat()
        store = self._load_store(self.settings.token_cache_path)
        return {
            user_id
            for user_id, by_date in store["by_account"].items()
            if current_date in by_date
        }

    def interactive_login(self) -> str:
        login_url = self.kite.login_url()
        print("Opening Zerodha login in your browser...")
        print(login_url)

        try:
            webbrowser.open(login_url)
        except Exception:
            pass

        callback_capture = self._capture_request_token_from_callback()
        if callback_capture:
            print("Captured request token from the local callback.")
            return self.create_session(callback_capture)

        raw_input = input(
            "Paste the request token or the full redirected URL here: "
        ).strip()
        request_token = self._extract_request_token(raw_input)

        if not request_token:
            raise ValueError("Request token is required to create a session.")

        return self.create_session(request_token)

    def create_session(self, request_token: str) -> str:
        return self.create_session_detailed(request_token)[0]

    def create_session_detailed(self, request_token: str) -> tuple[str, str, str]:
        """Exchange a request token and cache the token per account.

        Returns ``(access_token, user_id, user_name)`` so callers can associate
        the freshly authorised Zerodha account with an app account record.
        """
        session = self.kite.generate_session(
            request_token=request_token,
            api_secret=self._api_secret,
        )
        access_token = str(session["access_token"])
        user_id = str(session.get("user_id") or "")
        user_name = str(session.get("user_name") or "")
        self.kite.set_access_token(access_token)
        self._write_token_store(access_token, user_id=user_id or None)
        return access_token, user_id, user_name

    def _load_store(self, path) -> dict[str, dict]:
        """Load the token cache, normalising legacy formats.

        Canonical shape::

            {"by_account": {"<user_id>": {"<date>": "<token>"}}, "legacy": {"<date>": "<token>"}}

        Older caches are flat ``{date: token}`` dicts or a bare token string;
        both are surfaced under ``legacy`` so existing single-account flows keep
        working.
        """
        empty: dict[str, dict] = {"by_account": {}, "legacy": {}}
        if not path.exists():
            return empty

        try:
            data = json.loads(path.read_text())
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid token cache JSON in {path}: {exc.msg}") from exc

        if isinstance(data, str):
            return {"by_account": {}, "legacy": {date.today().isoformat(): data}}
        if isinstance(data, dict):
            if "by_account" in data or "legacy" in data:
                by_account = {
                    str(uid): {str(d): str(t) for d, t in (by_date or {}).items()}
                    for uid, by_date in (data.get("by_account") or {}).items()
                }
                legacy = {str(d): str(t) for d, t in (data.get("legacy") or {}).items()}
                return {"by_account": by_account, "legacy": legacy}
            # Flat legacy cache: {date: token}
            return {"by_account": {}, "legacy": {str(k): str(v) for k, v in data.items()}}

        raise ValueError(f"Unsupported token cache format in {path}")

    def _write_token_store(self, access_token: str, *, user_id: str | None = None) -> None:
        ensure_runtime_dirs(self.settings)
        store = self._load_store(self.settings.token_cache_path)
        today = date.today().isoformat()
        if user_id:
            store["by_account"].setdefault(user_id, {})[today] = access_token
        # Always update the legacy/global slot so single-account CLI flows and
        # the fallback lookup keep resolving the most recently cached token.
        store["legacy"][today] = access_token
        self.settings.token_cache_path.write_text(json.dumps(store, indent=2))

    def _capture_request_token_from_callback(self, timeout_seconds: int = 180) -> str | None:
        callback_url = self.settings.login_callback_url
        if not callback_url:
            return None

        parsed = urlparse(callback_url)
        if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost"} or not parsed.port:
            return None

        token_box: dict[str, str] = {}
        done = threading.Event()

        class CallbackHandler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                params = parse_qs(urlparse(self.path).query)
                request_token = params.get("request_token", [""])[0].strip()
                status = "success" if request_token else "error"
                if request_token:
                    token_box["request_token"] = request_token
                done.set()
                body = (
                    "<html><body style='font-family:sans-serif;padding:24px'>"
                    + ("<h2>Login captured.</h2><p>You can return to the terminal.</p>" if status == "success"
                       else "<h2>Login callback received, but no request token was found.</h2>")
                    + "</body></html>"
                ).encode("utf-8")
                self.send_response(200 if status == "success" else 400)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, format: str, *args) -> None:
                return

        server = ThreadingHTTPServer((parsed.hostname, parsed.port), CallbackHandler)
        server.timeout = timeout_seconds
        worker = threading.Thread(target=server.handle_request, daemon=True)
        worker.start()
        done.wait(timeout_seconds)
        server.server_close()
        return token_box.get("request_token")

    @staticmethod
    def _extract_request_token(raw_value: str) -> str:
        if not raw_value:
            return ""
        if "request_token=" in raw_value:
            parsed = urlparse(raw_value)
            return parse_qs(parsed.query).get("request_token", [""])[0].strip()
        return raw_value

    @staticmethod
    def _should_offer_interactive_login() -> bool:
        try:
            return sys.stdin.isatty() and sys.stdout.isatty()
        except Exception:
            return False

    @staticmethod
    def _resolve_legacy_token(legacy: dict[str, str], target_date: date) -> str | None:
        date_key = target_date.isoformat()
        legacy_key = f"apikey_{target_date}"
        token = legacy.get(date_key) or legacy.get(legacy_key)
        if token:
            return token
        if len(legacy) == 1:
            return next(iter(legacy.values()))
        return None
