from __future__ import annotations

from zerodha_app.auth import AuthManager
from zerodha_app.config import load_settings, load_watchlist
from zerodha_app.streamer import LiveTicker


def run_ticker(duration: int = 30, mode: str = "ltp") -> dict[str, dict]:
    settings = load_settings()
    watchlist = load_watchlist(settings)
    access_token = AuthManager(settings).get_access_token()
    ticker = LiveTicker(
        api_key=settings.api_key,
        access_token=access_token,
        watchlist=watchlist,
        mode=mode,
    )
    return ticker.run(duration=duration)


if __name__ == "__main__":
    print(run_ticker())
