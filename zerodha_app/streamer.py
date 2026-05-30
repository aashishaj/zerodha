from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

try:
    from kiteconnect import KiteTicker
except ModuleNotFoundError:
    KiteTicker = None


LOGGER = logging.getLogger(__name__)


@dataclass(slots=True)
class TickStore:
    latest: dict[str, dict[str, Any]] = field(default_factory=dict)

    def update(self, symbol: str, tick: dict[str, Any]) -> None:
        self.latest[symbol] = {
            "instrument_token": tick["instrument_token"],
            "last_price": tick.get("last_price"),
            "timestamp": _serialize_timestamp(tick.get("exchange_timestamp")),
            "ohlc": tick.get("ohlc"),
        }

    def to_json(self) -> str:
        return json.dumps(self.latest, indent=2, sort_keys=True)


@dataclass(slots=True)
class LatencyStats:
    samples: int = 0
    min_ms: float | None = None
    max_ms: float | None = None
    total_ms: float = 0.0
    latest_ms: float | None = None

    def update(self, latency_ms: float) -> None:
        self.samples += 1
        self.total_ms += latency_ms
        self.latest_ms = latency_ms
        self.min_ms = latency_ms if self.min_ms is None else min(self.min_ms, latency_ms)
        self.max_ms = latency_ms if self.max_ms is None else max(self.max_ms, latency_ms)

    @property
    def average_ms(self) -> float | None:
        if self.samples == 0:
            return None
        return self.total_ms / self.samples

    def to_dict(self) -> dict[str, Any]:
        return {
            "samples": self.samples,
            "latest_ms": _round_or_none(self.latest_ms),
            "average_ms": _round_or_none(self.average_ms),
            "min_ms": _round_or_none(self.min_ms),
            "max_ms": _round_or_none(self.max_ms),
        }


@dataclass(slots=True)
class LatencyTracker:
    per_symbol: dict[str, LatencyStats] = field(default_factory=dict)

    def update(self, symbol: str, exchange_timestamp: datetime | None, received_at: datetime) -> None:
        if exchange_timestamp is None:
            return

        latency_ms = max(0.0, (received_at - exchange_timestamp).total_seconds() * 1000)
        self.per_symbol.setdefault(symbol, LatencyStats()).update(latency_ms)

    def snapshot(self) -> dict[str, dict[str, Any]]:
        return {
            symbol: stats.to_dict()
            for symbol, stats in sorted(self.per_symbol.items())
        }

    def overall(self) -> dict[str, Any]:
        merged = LatencyStats()
        for stats in self.per_symbol.values():
            if stats.samples == 0:
                continue
            merged.samples += stats.samples
            merged.total_ms += stats.total_ms
            if stats.min_ms is not None:
                merged.min_ms = stats.min_ms if merged.min_ms is None else min(merged.min_ms, stats.min_ms)
            if stats.max_ms is not None:
                merged.max_ms = stats.max_ms if merged.max_ms is None else max(merged.max_ms, stats.max_ms)
            if stats.latest_ms is not None:
                merged.latest_ms = stats.latest_ms
        return merged.to_dict()


@dataclass(slots=True)
class Candle:
    open: float
    high: float
    low: float
    close: float
    start: datetime
    end: datetime
    volume: int = 0
    is_closed: bool = False

    def update(self, price: float, volume: int = 0) -> None:
        self.high = max(self.high, price)
        self.low = min(self.low, price)
        self.close = price
        self.volume += volume

    def to_dict(self) -> dict[str, Any]:
        return {
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "volume": self.volume,
            "is_closed": self.is_closed,
        }


@dataclass(slots=True)
class CandleSeries:
    interval_minutes: int
    max_candles: int = 200
    completed: dict[str, list[Candle]] = field(default_factory=dict)
    active: dict[str, Candle] = field(default_factory=dict)

    def update(self, symbol: str, price: float, timestamp: datetime, volume: int = 0) -> None:
        candle_start = _floor_to_interval(timestamp, self.interval_minutes)
        candle_end = candle_start + timedelta(minutes=self.interval_minutes)
        current = self.active.get(symbol)

        if current and current.start == candle_start:
            current.update(price, volume)
            return

        if current:
            current.is_closed = True
            history = self.completed.setdefault(symbol, [])
            history.append(current)
            if len(history) > self.max_candles:
                del history[0 : len(history) - self.max_candles]

        self.active[symbol] = Candle(
            open=price,
            high=price,
            low=price,
            close=price,
            start=candle_start,
            end=candle_end,
            volume=volume,
        )

    def seed(self, symbol: str, rows: list[dict[str, Any]], *, active_last: bool = True) -> None:
        self.completed[symbol] = []
        self.active.pop(symbol, None)

        for index, row in enumerate(rows[-self.max_candles :]):
            start = _parse_datetime(row["date"])
            candle = Candle(
                open=float(row["open"]),
                high=float(row["high"]),
                low=float(row["low"]),
                close=float(row["close"]),
                start=start,
                end=start + timedelta(minutes=self.interval_minutes),
                volume=int(row.get("volume") or 0),
                is_closed=True,
            )

            if active_last and index == len(rows[-self.max_candles :]) - 1:
                candle.is_closed = False
                self.active[symbol] = candle
            else:
                self.completed.setdefault(symbol, []).append(candle)

    def snapshot(self) -> dict[str, list[dict[str, Any]]]:
        data: dict[str, list[dict[str, Any]]] = {}
        for symbol in sorted(set(self.completed) | set(self.active)):
            candles = [candle.to_dict() for candle in self.completed.get(symbol, [])]
            active_candle = self.active.get(symbol)
            if active_candle:
                candles.append(active_candle.to_dict())
            data[symbol] = candles
        return data


class LiveTicker:
    def __init__(
        self,
        *,
        api_key: str,
        access_token: str,
        watchlist: dict[int, str],
        mode: str = "ltp",
        candle_interval_minutes: int | None = None,
        print_every_tick: bool = False,
    ) -> None:
        if not watchlist:
            raise ValueError("Watchlist is empty. Add at least one instrument token.")
        if candle_interval_minutes is not None and candle_interval_minutes <= 0:
            raise ValueError("Candle interval must be greater than 0 minutes.")
        if KiteTicker is None:
            raise RuntimeError(
                "kiteconnect is not installed. Install dependencies with `pip install -r requirements.txt`."
            )

        self.watchlist = watchlist
        self.mode = mode.lower()
        self.print_every_tick = print_every_tick
        self.store = TickStore()
        self.latency = LatencyTracker()
        self._last_cumulative_volume: dict[str, int] = {}
        self.candles = (
            CandleSeries(interval_minutes=candle_interval_minutes)
            if candle_interval_minutes is not None
            else None
        )
        self._connected = False
        self._closed = False
        self._connect_error: tuple[int | None, str] | None = None
        self._close_details: tuple[int | None, str] | None = None
        self._ticker = KiteTicker(api_key=api_key, access_token=access_token)

        self._ticker.on_connect = self._on_connect
        self._ticker.on_ticks = self._on_ticks
        self._ticker.on_close = self._on_close
        self._ticker.on_error = self._on_error

    def run(self, duration: int | None = None) -> dict[str, dict[str, Any]]:
        LOGGER.info("Starting ticker for %s instruments", len(self.watchlist))
        self._ticker.connect(threaded=True)

        try:
            self._wait_for_connection()
            self._wait_until_finished(duration)
        finally:
            self.close()

        return self.store.latest

    def candle_snapshot(self) -> dict[str, list[dict[str, Any]]]:
        if self.candles is None:
            return {}
        return self.candles.snapshot()

    def latency_snapshot(self) -> dict[str, dict[str, Any]]:
        return self.latency.snapshot()

    def latency_summary(self) -> dict[str, Any]:
        return self.latency.overall()

    def close(self) -> None:
        if self._closed:
            return

        LOGGER.info("Closing websocket connection")
        self._closed = True
        self._ticker.close(1000, "Manual close")

    def _wait_for_connection(self, timeout_seconds: int = 15) -> None:
        started_at = time.time()
        while not self._connected and time.time() - started_at < timeout_seconds:
            if self._connect_error:
                code, reason = self._connect_error
                raise RuntimeError(
                    f"Websocket connection failed with code={code} reason={reason}"
                )

            if self._close_details:
                code, reason = self._close_details
                raise RuntimeError(
                    f"Websocket connection closed before subscription with code={code} reason={reason}"
                )

            time.sleep(0.1)

        if not self._connected:
            raise TimeoutError("Timed out while waiting for the websocket connection.")

    def _wait_until_finished(self, duration: int | None) -> None:
        if duration is None:
            LOGGER.info("Streaming until interrupted. Press Ctrl+C to stop.")
            while True:
                time.sleep(1)

        LOGGER.info("Streaming for %s seconds", duration)
        started_at = time.time()
        while time.time() - started_at < duration:
            time.sleep(1)

    def _on_connect(self, ws: KiteTicker, response: dict[str, Any]) -> None:
        del response
        self._connected = True
        tokens = list(self.watchlist.keys())
        LOGGER.info("Connected. Subscribing to %s", tokens)
        ws.subscribe(tokens)
        ws.set_mode(_resolve_mode(ws, self.mode), tokens)

    def _on_ticks(self, ws: KiteTicker, ticks: list[dict[str, Any]]) -> None:
        del ws
        for tick in ticks:
            symbol = self.watchlist.get(tick["instrument_token"], str(tick["instrument_token"]))
            received_at = datetime.now()
            tick_timestamp = _resolve_tick_timestamp(tick)
            self.store.update(symbol, tick)
            self.latency.update(symbol, tick_timestamp, received_at)
            if self.candles is not None:
                if tick_timestamp is not None and tick.get("last_price") is not None:
                    volume = self._extract_incremental_volume(symbol, tick)
                    self.candles.update(symbol, float(tick["last_price"]), tick_timestamp, volume)
            if self.print_every_tick:
                latest_latency = self.latency_snapshot().get(symbol, {}).get("latest_ms")
                LOGGER.info("%s -> %s | latency_ms=%s", symbol, self.store.latest[symbol], latest_latency)

    def _extract_incremental_volume(self, symbol: str, tick: dict[str, Any]) -> int:
        cumulative_volume = _extract_cumulative_volume(tick)
        if cumulative_volume is None:
            return _extract_last_traded_quantity(tick)

        previous_volume = self._last_cumulative_volume.get(symbol)
        self._last_cumulative_volume[symbol] = cumulative_volume
        if previous_volume is None:
            return 0
        return max(0, cumulative_volume - previous_volume)

    def _on_close(self, ws: KiteTicker, code: int, reason: str) -> None:
        del ws
        self._close_details = (code, reason)
        LOGGER.info("Connection closed with code=%s reason=%s", code, reason)

    def _on_error(self, ws: KiteTicker, code: int, reason: str) -> None:
        del ws
        self._connect_error = (code, reason)
        LOGGER.error("Websocket error code=%s reason=%s", code, reason)


def _resolve_mode(ws: KiteTicker, mode: str) -> str:
    modes = {
        "ltp": ws.MODE_LTP,
        "quote": ws.MODE_QUOTE,
        "full": ws.MODE_FULL,
    }
    if mode not in modes:
        raise ValueError(f"Unsupported mode `{mode}`. Use ltp, quote, or full.")
    return modes[mode]


def simulate_candles(
    *,
    symbol: str,
    instrument_token: int,
    interval_minutes: int,
    start: datetime | None = None,
) -> dict[str, Any]:
    if interval_minutes <= 0:
        raise ValueError("Candle interval must be greater than 0 minutes.")

    started_at = start or datetime.now().replace(second=0, microsecond=0)
    prices = [100.0, 101.5, 99.75, 102.25, 103.0, 101.25]
    series = CandleSeries(interval_minutes=interval_minutes)
    latest: dict[str, dict[str, Any]] = {}

    for index, price in enumerate(prices):
        timestamp = started_at + timedelta(seconds=index * 30)
        tick = {
            "instrument_token": instrument_token,
            "last_price": price,
            "exchange_timestamp": timestamp,
            "last_traded_quantity": 1 + index,
        }
        latest[symbol] = {
            "instrument_token": instrument_token,
            "last_price": price,
            "timestamp": timestamp.isoformat(),
            "ohlc": None,
        }
        series.update(symbol, price, timestamp, 1 + index)

    return {
        "interval_minutes": interval_minutes,
        "latest": latest,
        "candles": series.snapshot(),
        "source": "simulated",
    }


def _serialize_timestamp(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _floor_to_interval(value: datetime, interval_minutes: int) -> datetime:
    floored_minute = (value.minute // interval_minutes) * interval_minutes
    return value.replace(minute=floored_minute, second=0, microsecond=0)


def _parse_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return datetime.fromisoformat(value)
    raise ValueError(f"Unsupported datetime value: {value!r}")


def _resolve_tick_timestamp(tick: dict[str, Any]) -> datetime | None:
    for key in ("exchange_timestamp", "last_trade_time", "timestamp"):
        value = tick.get(key)
        if isinstance(value, datetime):
            return value
    return datetime.now()


def _extract_cumulative_volume(tick: dict[str, Any]) -> int | None:
    for key in ("volume_traded", "volume"):
        value = tick.get(key)
        if isinstance(value, (int, float)):
            return int(value)
    return None


def _extract_last_traded_quantity(tick: dict[str, Any]) -> int:
    value = tick.get("last_traded_quantity")
    if isinstance(value, (int, float)):
        return int(value)
    return 0


def _round_or_none(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value, 2)
