from __future__ import annotations

import json

from zerodha_app.auth import AuthManager
from zerodha_app.config import load_settings
from zerodha_app.streamer import LiveTicker


def run_websocket_smoke_test(duration: int = 10) -> dict[str, dict]:
    settings = load_settings()
    access_token = AuthManager(settings).get_access_token()
    watchlist = {738561: "RELIANCE"}
    ticker = LiveTicker(
        api_key=settings.api_key,
        access_token=access_token,
        watchlist=watchlist,
        mode="ltp",
        print_every_tick=True,
    )
    return ticker.run(duration=duration)


if __name__ == "__main__":
    print(json.dumps(run_websocket_smoke_test(), indent=2, sort_keys=True))
