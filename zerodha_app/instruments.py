from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parent.parent
LEGACY_INSTRUMENTS_PATH = ROOT_DIR / "full code" / "instruments.txt"


@dataclass(slots=True)
class InstrumentRow:
    instrument_token: int
    tradingsymbol: str
    display_name: str
    exchange: str
    segment: str
    instrument_type: str
    name: str
    expiry: date | None
    strike: float | None
    lot_size: int | None

    def kind(self) -> str:
        instrument_type = self.instrument_type.upper()
        segment = self.segment.upper()
        if instrument_type == "EQ":
            return "cash"
        if "FUT" in instrument_type or segment.endswith("-FUT"):
            return "futures"
        if instrument_type in {"CE", "PE"} or segment.endswith("-OPT"):
            return "options"
        return "other"

    def to_dict(self) -> dict[str, Any]:
        return {
            "instrument_token": self.instrument_token,
            "tradingsymbol": self.tradingsymbol,
            "display_name": self.display_name,
            "exchange": self.exchange,
            "segment": self.segment,
            "instrument_type": self.instrument_type,
            "name": self.name,
            "expiry": self.expiry.isoformat() if self.expiry else None,
            "strike": self.strike,
            "lot_size": self.lot_size,
            "kind": self.kind(),
        }


class InstrumentCatalog:
    def __init__(self, rows: list[InstrumentRow]) -> None:
        self.rows = rows

    @classmethod
    def from_kite(cls, kite: Any) -> "InstrumentCatalog":
        rows: list[InstrumentRow] = []
        for exchange in ("NSE", "BSE", "NFO", "MCX", "CDS"):
            try:
                payload = kite.instruments(exchange)
            except Exception:
                continue
            rows.extend(_normalize_rows(payload))
        return cls(rows)

    @classmethod
    def from_exchange_dump(cls, rows_by_exchange: dict[str, list[dict[str, Any]]]) -> "InstrumentCatalog":
        """Build a catalog from already-downloaded per-exchange instrument rows."""
        rows: list[InstrumentRow] = []
        for payload in rows_by_exchange.values():
            rows.extend(_normalize_rows(payload))
        return cls(rows)

    @classmethod
    def from_legacy_file(cls, path: Path = LEGACY_INSTRUMENTS_PATH) -> "InstrumentCatalog":
        if not path.exists():
            return cls([])
        with path.open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle, delimiter="\t")
            return cls(_normalize_rows(list(reader)))

    def search(self, query: str, *, kind: str = "all", limit: int = 48) -> dict[str, list[dict[str, Any]]]:
        normalized = query.strip().upper()
        if not normalized:
            return {"cash": [], "futures": [], "options": []}

        matches = [
            row
            for row in self.rows
            if _row_matches(row, normalized) and _kind_matches(row, kind)
        ]
        matches.sort(key=_sort_key)

        buckets: dict[str, list[dict[str, Any]]] = {"cash": [], "futures": [], "options": []}
        for row in matches:
            bucket = row.kind()
            if bucket not in buckets:
                continue
            if sum(len(items) for items in buckets.values()) >= limit:
                break
            if len(buckets[bucket]) >= _bucket_limit(bucket):
                continue
            buckets[bucket].append(row.to_dict())
        return buckets

    def get_by_token(self, token: int) -> InstrumentRow | None:
        for row in self.rows:
            if row.instrument_token == token:
                return row
        return None


def _normalize_rows(rows: list[dict[str, Any]]) -> list[InstrumentRow]:
    normalized: list[InstrumentRow] = []
    for row in rows:
        try:
            instrument_token = int(row.get("instrument_token"))
        except (TypeError, ValueError):
            continue

        tradingsymbol = str(row.get("tradingsymbol") or "").strip().upper()
        exchange = str(row.get("exchange") or "").strip().upper()
        segment = str(row.get("segment") or "").strip().upper()
        instrument_type = str(row.get("instrument_type") or "").strip().upper()
        name = str(row.get("name") or tradingsymbol).strip().upper()
        expiry = _parse_expiry(row.get("expiry"))
        strike = _parse_float(row.get("strike"))
        lot_size = _parse_int(row.get("lot_size"))

        if not tradingsymbol or not exchange:
            continue

        normalized.append(
            InstrumentRow(
                instrument_token=instrument_token,
                tradingsymbol=tradingsymbol,
                display_name=_display_name(
                    tradingsymbol=tradingsymbol,
                    exchange=exchange,
                    instrument_type=instrument_type,
                    expiry=expiry,
                    strike=strike,
                ),
                exchange=exchange,
                segment=segment,
                instrument_type=instrument_type,
                name=name,
                expiry=expiry,
                strike=strike,
                lot_size=lot_size,
            )
        )
    return normalized


def _display_name(
    *,
    tradingsymbol: str,
    exchange: str,
    instrument_type: str,
    expiry: date | None,
    strike: float | None,
) -> str:
    label = tradingsymbol
    if instrument_type == "EQ":
        return f"{exchange}:{label}"
    if instrument_type in {"CE", "PE"}:
        expiry_text = expiry.isoformat() if expiry else "No expiry"
        strike_text = int(strike) if strike and strike.is_integer() else strike
        return f"{exchange}:{label} | {expiry_text} | {strike_text} {instrument_type}"
    if "FUT" in instrument_type:
        expiry_text = expiry.isoformat() if expiry else "No expiry"
        return f"{exchange}:{label} | {expiry_text} FUT"
    return f"{exchange}:{label}"


def _row_matches(row: InstrumentRow, query: str) -> bool:
    normalized = query.strip().upper()
    if not normalized:
        return False

    underlying = str(row.name or "").strip().upper()
    tradingsymbol = row.tradingsymbol.strip().upper()
    display_name = row.display_name.strip().upper()

    if normalized.isdigit():
        if row.strike is None:
            return False
        strike_text = str(int(row.strike)) if float(row.strike).is_integer() else str(row.strike)
        return strike_text == normalized

    if underlying == normalized:
        return True
    if tradingsymbol == normalized:
        return True
    if tradingsymbol.startswith(normalized):
        return True
    return display_name.startswith(normalized)


def _kind_matches(row: InstrumentRow, kind: str) -> bool:
    normalized = kind.strip().lower()
    if normalized in {"", "all"}:
        return row.kind() in {"cash", "futures", "options"}
    return row.kind() == normalized


def _sort_key(row: InstrumentRow) -> tuple[Any, ...]:
    expiry_rank = row.expiry or date.max
    strike_rank = row.strike if row.strike is not None else -1.0
    kind_rank = {"cash": 0, "futures": 1, "options": 2}.get(row.kind(), 9)
    return (row.name, kind_rank, expiry_rank, strike_rank, row.tradingsymbol)


def _bucket_limit(kind: str) -> int:
    return {"cash": 12, "futures": 12, "options": 24}.get(kind, 12)


def _parse_expiry(value: Any) -> date | None:
    if not value:
        return None
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text).date()
    except ValueError:
        return None


def _parse_float(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed != 0 else None


def _parse_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
