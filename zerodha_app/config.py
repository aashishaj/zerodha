from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_TOKEN_CACHE = ROOT_DIR / ".zerodha" / "access_tokens.json"
DEFAULT_WATCHLIST = ROOT_DIR / "watchlist.json"


@dataclass(slots=True)
class Settings:
    api_key: str
    api_secret: str
    token_cache_path: Path
    watchlist_path: Path
    login_callback_url: str | None = None
    log_level: str = "INFO"


def load_settings(
    *,
    token_cache_path: str | None = None,
    watchlist_path: str | None = None,
    log_level: str | None = None,
) -> Settings:
    api_key = os.getenv("ZERODHA_API_KEY")
    api_secret = os.getenv("ZERODHA_API_SECRET")

    if not api_key or not api_secret:
        raise ValueError(
            "Missing Zerodha credentials. Set ZERODHA_API_KEY and "
            "ZERODHA_API_SECRET."
        )

    resolved_cache = Path(
        token_cache_path or os.getenv("ZERODHA_TOKEN_CACHE", str(DEFAULT_TOKEN_CACHE))
    )
    resolved_watchlist = Path(
        watchlist_path or os.getenv("ZERODHA_WATCHLIST_FILE", str(DEFAULT_WATCHLIST))
    )
    resolved_login_callback_url = os.getenv("ZERODHA_LOGIN_CALLBACK_URL", "").strip() or None
    resolved_log_level = (log_level or os.getenv("ZERODHA_LOG_LEVEL", "INFO")).upper()

    return Settings(
        api_key=api_key,
        api_secret=api_secret,
        token_cache_path=resolved_cache,
        watchlist_path=resolved_watchlist,
        login_callback_url=resolved_login_callback_url,
        log_level=resolved_log_level,
    )


def load_watchlist(settings: Settings) -> dict[int, str]:
    env_value = os.getenv("ZERODHA_WATCHLIST", "").strip()
    if env_value:
        return _parse_watchlist_pairs(env_value)

    if not settings.watchlist_path.exists():
        raise ValueError(
            f"Watchlist file not found at {settings.watchlist_path}. "
            "Create watchlist.json from watchlist.example.json or set "
            "ZERODHA_WATCHLIST."
        )

    payload = _read_json_file(settings.watchlist_path, "watchlist")
    return _normalize_watchlist(payload, source=str(settings.watchlist_path))


def ensure_runtime_dirs(settings: Settings) -> None:
    settings.token_cache_path.parent.mkdir(parents=True, exist_ok=True)


def _parse_watchlist_pairs(raw_value: str) -> dict[int, str]:
    watchlist: dict[int, str] = {}
    for pair in raw_value.split(","):
        normalized_pair = pair.strip()
        if not normalized_pair:
            continue

        if ":" not in normalized_pair:
            raise ValueError(
                "ZERODHA_WATCHLIST must use token:symbol pairs separated by commas."
            )

        token_text, symbol = normalized_pair.split(":", 1)
        token = int(token_text.strip())
        normalized_symbol = symbol.strip()
        if not normalized_symbol:
            raise ValueError("ZERODHA_WATCHLIST contains an empty symbol value.")
        watchlist[token] = normalized_symbol

    if not watchlist:
        raise ValueError("ZERODHA_WATCHLIST did not contain any valid token:symbol pairs.")

    return watchlist


def _read_json_file(path: Path, description: str) -> object:
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in {description} file at {path}: {exc.msg}") from exc


def _normalize_watchlist(payload: object, *, source: str) -> dict[int, str]:
    if isinstance(payload, dict):
        return {int(token): _normalize_symbol(symbol, source=source) for token, symbol in payload.items()}

    if isinstance(payload, list):
        watchlist: dict[int, str] = {}
        for item in payload:
            if not isinstance(item, dict):
                raise ValueError(
                    f"Watchlist entries in {source} must be JSON objects with token and symbol."
                )

            if "token" not in item or "symbol" not in item:
                raise ValueError(
                    f"Watchlist entries in {source} must include both token and symbol."
                )

            watchlist[int(item["token"])] = _normalize_symbol(item["symbol"], source=source)
        return watchlist

    raise ValueError("Watchlist must be a JSON object or a list of token/symbol items.")


def _normalize_symbol(value: object, *, source: str) -> str:
    symbol = str(value).strip()
    if not symbol:
        raise ValueError(f"Watchlist in {source} contains an empty symbol.")
    return symbol
