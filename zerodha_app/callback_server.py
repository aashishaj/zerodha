from __future__ import annotations

import logging
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from zerodha_app.accounts import AccountStore
from zerodha_app.auth import AuthManager
from zerodha_app.config import Settings

LOGGER = logging.getLogger(__name__)

DEFAULT_FRONTEND_URL = "http://127.0.0.1:5173"

# Errors that can surface while exchanging a request token. KiteConnect raises
# its own KiteException family on a bad/expired token; include it when present
# so the browser is always redirected to the error page instead of a dead
# connection.
_EXCHANGE_ERRORS: tuple[type[BaseException], ...] = (OSError, RuntimeError, ValueError)
try:
    from kiteconnect.exceptions import KiteException

    _EXCHANGE_ERRORS = (KiteException, *_EXCHANGE_ERRORS)
except ModuleNotFoundError:
    pass

# A creator takes a request_token and returns the cached access token.
SessionCreator = Callable[[str], str]


class CallbackBridge:
    """Persistent OAuth callback handler bound to the Zerodha redirect URL.

    Zerodha redirects the browser to the app's registered redirect URL with a
    ``request_token``. This bridge exchanges that token for an access token,
    caches it, and bounces the browser to the frontend's ``?auth=success`` URL
    so the dashboard boots authenticated. A separate process from the API
    server; the API server picks up the freshly cached token on its next call.
    """

    def __init__(
        self,
        settings: Settings,
        frontend_url: str = DEFAULT_FRONTEND_URL,
        *,
        session_creator: SessionCreator | None = None,
    ) -> None:
        self.settings = settings
        self.frontend_url = frontend_url.rstrip("/")
        self._session_creator = session_creator or self._default_session_creator

    def _default_session_creator(self, request_token: str) -> str:
        access_token, user_id, user_name = AuthManager(self.settings).create_session_detailed(
            request_token
        )
        if user_id:
            AccountStore(self.settings.app_db_path).upsert_account(user_id, label=user_name or user_id)
        return access_token

    def resolve_redirect(self, request_token: str) -> str:
        """Exchange the token if present and return the frontend redirect URL."""
        if not request_token:
            return f"{self.frontend_url}/?auth=error"
        try:
            self._session_creator(request_token)
        except _EXCHANGE_ERRORS as exc:
            LOGGER.exception("Callback token exchange failed")
            return f"{self.frontend_url}/?auth=error&reason={exc}"
        return f"{self.frontend_url}/?auth=success"

    def serve(self) -> None:
        host, port = self._callback_host_port()
        bridge = self

        class CallbackHandler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                params = parse_qs(urlparse(self.path).query)
                request_token = params.get("request_token", [""])[0].strip()
                location = bridge.resolve_redirect(request_token)
                self.send_response(302)
                self.send_header("Location", location)
                self.send_header("Content-Length", "0")
                self.end_headers()

            def log_message(self, format: str, *args) -> None:
                return

        server = ThreadingHTTPServer((host, port), CallbackHandler)
        LOGGER.info("Auth callback bridge listening on http://%s:%s", host, port)
        try:
            server.serve_forever()
        finally:
            server.server_close()

    def _callback_host_port(self) -> tuple[str, int]:
        callback_url = self.settings.login_callback_url
        if not callback_url:
            raise ValueError(
                "ZERODHA_LOGIN_CALLBACK_URL is not set; cannot start the auth callback bridge."
            )

        parsed = urlparse(callback_url)
        if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost"} or not parsed.port:
            raise ValueError(
                "ZERODHA_LOGIN_CALLBACK_URL must be an http://127.0.0.1:<port>/... URL "
                f"for the local callback bridge, got {callback_url!r}."
            )
        return parsed.hostname, parsed.port


def run_callback_bridge(
    settings: Settings,
    frontend_url: str = DEFAULT_FRONTEND_URL,
) -> None:
    """Run the persistent OAuth callback bridge until interrupted."""
    CallbackBridge(settings, frontend_url).serve()
