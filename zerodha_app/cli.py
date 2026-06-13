from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime

from zerodha_app.config import load_settings, load_watchlist
from zerodha_app.streamer import LiveTicker, simulate_candles


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Zerodha login and live ticker utility")
    parser.add_argument("--token-cache", help="Override the access token cache path")
    parser.add_argument("--watchlist-file", help="Override the watchlist JSON path")
    parser.add_argument("--log-level", help="Override the log level")

    subparsers = parser.add_subparsers(dest="command", required=True)
    login_parser = subparsers.add_parser("login", help="Generate and cache a fresh access token")
    login_parser.add_argument(
        "--request-token",
        help="Exchange this request token directly instead of prompting interactively",
    )

    stream_parser = subparsers.add_parser("stream", help="Start the websocket streamer")
    stream_parser.add_argument(
        "--duration",
        type=_non_negative_int,
        default=30,
        help="Number of seconds to stream before closing",
    )
    stream_parser.add_argument(
        "--mode",
        choices=["ltp", "quote", "full"],
        default="ltp",
        help="Ticker subscription mode",
    )
    stream_parser.add_argument(
        "--print-every-tick",
        action="store_true",
        help="Log every incoming tick",
    )
    stream_parser.add_argument(
        "--show-latency",
        action="store_true",
        help="Include exchange-to-local latency stats in the final output",
    )
    stream_parser.add_argument(
        "--login-if-needed",
        action="store_true",
        help="Trigger the interactive login flow when no cached token exists",
    )

    candles_parser = subparsers.add_parser(
        "candles",
        help="Build interval candles locally from live ticks",
    )
    candles_parser.add_argument(
        "--duration",
        type=_non_negative_int,
        default=300,
        help="Number of seconds to stream before printing candle output",
    )
    candles_parser.add_argument(
        "--interval",
        type=_positive_int,
        default=1,
        help="Candle size in minutes",
    )
    candles_parser.add_argument(
        "--mode",
        choices=["ltp", "quote", "full"],
        default="ltp",
        help="Ticker subscription mode",
    )
    candles_parser.add_argument(
        "--print-every-tick",
        action="store_true",
        help="Log every incoming tick",
    )
    candles_parser.add_argument(
        "--show-latency",
        action="store_true",
        help="Include exchange-to-local latency stats in the final output",
    )
    candles_parser.add_argument(
        "--login-if-needed",
        action="store_true",
        help="Trigger the interactive login flow when no cached token exists",
    )

    demo_parser = subparsers.add_parser(
        "candles-demo",
        help="Build sample candles locally without Zerodha network access",
    )
    demo_parser.add_argument("--symbol", default="RELIANCE", help="Demo symbol name")
    demo_parser.add_argument(
        "--token",
        type=_positive_int,
        default=738561,
        help="Demo instrument token",
    )
    demo_parser.add_argument(
        "--interval",
        type=_positive_int,
        default=1,
        help="Candle size in minutes",
    )

    dashboard_parser = subparsers.add_parser(
        "dashboard",
        help="Open today's candles in a local browser dashboard",
    )
    dashboard_parser.add_argument(
        "--interval",
        type=_positive_int,
        default=1,
        help="Candle size in minutes",
    )
    dashboard_parser.add_argument("--host", default="127.0.0.1", help="Dashboard host")
    dashboard_parser.add_argument("--port", type=_positive_int, default=8080, help="Dashboard port")
    dashboard_parser.add_argument(
        "--mode",
        choices=["ltp", "quote", "full"],
        default="quote",
        help="Ticker subscription mode",
    )
    dashboard_parser.add_argument(
        "--login-if-needed",
        action="store_true",
        help="Trigger the interactive login flow when no cached token exists",
    )
    dashboard_parser.add_argument(
        "--enable-trading",
        action="store_true",
        help="Allow the dashboard to place live Kite buy orders",
    )
    dashboard_parser.add_argument(
        "--stock",
        help="Resolve and load this stock symbol from Kite, for example RELIANCE",
    )
    dashboard_parser.add_argument(
        "--exchange",
        choices=["NSE", "BSE"],
        default="NSE",
        help="Exchange to use with --stock",
    )
    dashboard_parser.add_argument(
        "--demo",
        action="store_true",
        help="Run with local sample data instead of Zerodha live data",
    )
    dashboard_parser.add_argument("--symbol", default="RELIANCE", help="Demo symbol name")
    dashboard_parser.add_argument("--token", type=_positive_int, default=738561, help="Demo token")

    api_parser = subparsers.add_parser(
        "api",
        help="Run a local JSON API for the React frontend using Zerodha data",
    )
    api_parser.add_argument("--host", default="127.0.0.1", help="API host")
    api_parser.add_argument("--port", type=_positive_int, default=8080, help="API port")
    api_parser.add_argument(
        "--login-if-needed",
        action="store_true",
        help="Trigger the interactive login flow when no cached token exists",
    )

    auth_server_parser = subparsers.add_parser(
        "auth-server",
        help="Run the persistent OAuth callback bridge on the Zerodha redirect URL",
    )
    auth_server_parser.add_argument(
        "--frontend-url",
        default="http://127.0.0.1:5173",
        help="Frontend URL to redirect the browser to after login",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    auto_login_commands = {"api", "dashboard", "stream", "candles"}
    if getattr(args, "command", None) in auto_login_commands and hasattr(args, "login_if_needed"):
        args.login_if_needed = True

    try:
        if args.command == "candles-demo":
            payload = simulate_candles(
                symbol=args.symbol,
                instrument_token=args.token,
                interval_minutes=args.interval,
                start=datetime(2026, 5, 8, 9, 15),
            )
            print(json.dumps(payload, indent=2, sort_keys=True))
            return 0

        if args.command == "dashboard" and args.demo:
            from zerodha_app.dashboard import DashboardOptions, run_dashboard

            run_dashboard(
                DashboardOptions(
                    settings=None,
                    interval_minutes=args.interval,
                    host=args.host,
                    port=args.port,
                    demo=True,
                    demo_symbol=args.symbol,
                    demo_token=args.token,
                )
            )
            return 0

        settings = load_settings(
            token_cache_path=args.token_cache,
            watchlist_path=args.watchlist_file,
            log_level=args.log_level,
        )
        _configure_logging(settings.log_level)
        from zerodha_app.auth import AuthManager

        auth = AuthManager(settings)

        if args.command == "login":
            if args.request_token:
                auth.create_session(args.request_token)
            else:
                auth.interactive_login()
            logging.info("Access token cached for today at %s", settings.token_cache_path)
            return 0

        if args.command == "stream":
            watchlist = load_watchlist(settings)
            access_token = auth.get_access_token(auto_login=args.login_if_needed)
            ticker = LiveTicker(
                api_key=settings.api_key,
                access_token=access_token,
                watchlist=watchlist,
                mode=args.mode,
                print_every_tick=args.print_every_tick,
            )
            latest = ticker.run(duration=args.duration)
            if args.show_latency:
                print(
                    json.dumps(
                        {
                            "latest": latest,
                            "latency": {
                                "overall": ticker.latency_summary(),
                                "symbols": ticker.latency_snapshot(),
                            },
                        },
                        indent=2,
                        sort_keys=True,
                    )
                )
            else:
                print(json.dumps(latest, indent=2, sort_keys=True))
            return 0

        if args.command == "candles":
            watchlist = load_watchlist(settings)
            access_token = auth.get_access_token(auto_login=args.login_if_needed)
            ticker = LiveTicker(
                api_key=settings.api_key,
                access_token=access_token,
                watchlist=watchlist,
                mode=args.mode,
                candle_interval_minutes=args.interval,
                print_every_tick=args.print_every_tick,
            )
            ticker.run(duration=args.duration)
            payload = {
                "interval_minutes": args.interval,
                "latest": ticker.store.latest,
                "candles": ticker.candle_snapshot(),
            }
            if args.show_latency:
                payload["latency"] = {
                    "overall": ticker.latency_summary(),
                    "symbols": ticker.latency_snapshot(),
                }
            print(json.dumps(payload, indent=2, sort_keys=True))
            return 0

        if args.command == "dashboard":
            from zerodha_app.dashboard import DashboardOptions, run_dashboard

            run_dashboard(
                DashboardOptions(
                    settings=settings,
                    interval_minutes=args.interval,
                    host=args.host,
                    port=args.port,
                    mode=args.mode,
                    login_if_needed=args.login_if_needed,
                    enable_trading=args.enable_trading,
                    stock=args.stock,
                    exchange=args.exchange,
                )
            )
            return 0

        if args.command == "auth-server":
            from zerodha_app.callback_server import run_callback_bridge

            run_callback_bridge(settings, frontend_url=args.frontend_url)
            return 0

        if args.command == "api":
            from zerodha_app.api_server import APIOptions, run_api_server

            run_api_server(
                APIOptions(
                    settings=settings,
                    host=args.host,
                    port=args.port,
                    login_if_needed=args.login_if_needed,
                )
            )
            return 0
    except (OSError, RuntimeError, TimeoutError, ValueError) as exc:
        logging.error("%s", exc)
        return 2

    parser.error(f"Unsupported command: {args.command}")
    return 2


def _configure_logging(log_level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )


def _non_negative_int(value: str) -> int:
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("duration must be 0 or greater")
    return parsed


def _positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("value must be greater than 0")
    return parsed
