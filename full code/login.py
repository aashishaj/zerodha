from __future__ import annotations

from zerodha_app.auth import AuthManager
from zerodha_app.config import load_settings


def user_credentials() -> dict[str, str]:
    settings = load_settings()
    return {"api_key": settings.api_key, "api_secret": settings.api_secret}


def login_zerodha() -> str:
    settings = load_settings()
    return AuthManager(settings).interactive_login()


if __name__ == "__main__":
    login_zerodha()
