from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def utcnow_iso() -> str:
    return utcnow().replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso8601(value: str) -> datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)


def iso_from_timestamp_ms(timestamp_ms: int) -> str:
    return (
        datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def date_and_time_from_timestamp_ms(timestamp_ms: int) -> tuple[str, str]:
    dt = datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc)
    return dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M:%S")


def normalize_timestamp_ms(value: int | str | float) -> int:
    raw = int(value)
    digits = len(str(abs(raw)))
    if digits >= 19:
        return raw // 1_000_000
    if digits >= 16:
        return raw // 1_000
    return raw


def split_market(market: str) -> tuple[str, str]:
    quote_currency, base_currency = market.split("-", 1)
    return quote_currency, base_currency


def new_capture_id() -> str:
    return uuid4().hex


def partition_date(value: str) -> str:
    return parse_iso8601(value).date().isoformat()

