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
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.kite = KiteConnect(api_key=settings.api_key)

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

    def get_cached_access_token(self, target_date: date | None = None) -> str | None:
        current_date = target_date or date.today()
        return self._resolve_store_token(
            self._read_token_store(self.settings.token_cache_path),
            current_date,
        )

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
        session = self.kite.generate_session(
            request_token=request_token,
            api_secret=self.settings.api_secret,
        )
        access_token = session["access_token"]
        self.kite.set_access_token(access_token)
        self._write_token_store(access_token)
        return access_token

    def _read_token_store(self, path) -> dict[str, str]:
        if not path.exists():
            return {}

        try:
            data = json.loads(path.read_text())
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid token cache JSON in {path}: {exc.msg}") from exc

        if isinstance(data, dict):
            return {str(key): str(value) for key, value in data.items()}

        if isinstance(data, str):
            return {date.today().isoformat(): data}

        raise ValueError(f"Unsupported token cache format in {path}")

    def _write_token_store(self, access_token: str) -> None:
        ensure_runtime_dirs(self.settings)
        store = self._read_token_store(self.settings.token_cache_path)
        store[date.today().isoformat()] = access_token
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
    def _resolve_store_token(store: dict[str, str], target_date: date) -> str | None:
        date_key = target_date.isoformat()
        legacy_key = f"apikey_{target_date}"
        token = store.get(date_key) or store.get(legacy_key)
        if token:
            return token
        if len(store) == 1:
            return next(iter(store.values()))
        return None
