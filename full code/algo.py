from __future__ import annotations

from zerodha_app.auth import AuthManager
from zerodha_app.config import load_settings, load_watchlist
from zerodha_app.streamer import LiveTicker


def latest_prices(duration: int = 15) -> dict[str, dict]:
    settings = load_settings()
    watchlist = load_watchlist(settings)
    access_token = AuthManager(settings).get_access_token()
    ticker = LiveTicker(
        api_key=settings.api_key,
        access_token=access_token,
        watchlist=watchlist,
        mode="ltp",
    )
    return ticker.run(duration=duration)


if __name__ == "__main__":
    print(latest_prices())
