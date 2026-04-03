from __future__ import annotations

import asyncio
import time
from collections import defaultdict
from datetime import timedelta, timezone
from pathlib import Path

from . import SCHEMA_VERSION
from .bithumb import (
    capture_public_ws,
    fetch_candle_1m,
    fetch_market_catalog,
    fetch_orderbook,
    fetch_ticker,
    fetch_trade_ticks,
)
from .contracts import validate_record
from .observability import Observability
from .storage import (
    append_jsonl,
    canonical_path,
    list_canonical_files,
    raw_rest_path,
    raw_ws_path,
    replay_manifest_path,
    summarize_jsonl,
    write_json,
)
from .utils import (
    date_and_time_from_timestamp_ms,
    iso_from_timestamp_ms,
    new_capture_id,
    normalize_timestamp_ms,
    parse_iso8601,
    split_market,
    utcnow_iso,
)


TIMESTAMP_FIELDS = {
    "candle_1m": "candle_timestamp_ms",
    "trade_tick": "event_timestamp_ms",
    "ticker_event": "event_timestamp_ms",
    "orderbook_snapshot": "event_timestamp_ms",
    "orderbook_level": "event_timestamp_ms",
}


def _raw_rest_envelope(dataset: str, path: str, request: dict, payload: list[dict]) -> tuple[str, str, dict]:
    capture_id = new_capture_id()
    captured_at = utcnow_iso()
    envelope = {
        "capture_id": capture_id,
        "captured_at": captured_at,
        "source": "bithumb_rest",
        "dataset": dataset,
        "path": path,
        "request": request,
        "payload": payload,
    }
    return capture_id, captured_at, envelope


def _write_validated_records(
    base_dir: Path, dataset: str, records: list[dict], obs: Observability
) -> list[dict]:
    accepted: list[dict] = []
    grouped: dict[Path, list[dict]] = defaultdict(list)
    for record in records:
        errors = validate_record(dataset, record)
        obs.record_validation(dataset, errors)
        if errors:
            continue
        accepted.append(record)
        market = None if dataset == "market_catalog" else record.get("market")
        time_value = record.get("captured_at") or iso_from_timestamp_ms(
            record[TIMESTAMP_FIELDS[dataset]]
        )
        grouped[canonical_path(base_dir, dataset, time_value, obs.run_id, market)].append(record)
    for path, chunk in grouped.items():
        append_jsonl(path, chunk)
    return accepted


def normalize_market_catalog(
    payload: list[dict], capture_id: str, ingested_at: str, selected_markets: list[str]
) -> list[dict]:
    records = []
    for item in payload:
        quote_currency, base_currency = split_market(item["market"])
        records.append(
            {
                "dataset": "market_catalog",
                "schema_version": SCHEMA_VERSION,
                "market": item["market"],
                "quote_currency": quote_currency,
                "base_currency": base_currency,
                "korean_name": item["korean_name"],
                "english_name": item["english_name"],
                "market_warning": item["market_warning"],
                "paper_universe": item["market"] in selected_markets,
                "captured_at": ingested_at,
                "source": "bithumb_rest",
                "capture_id": capture_id,
                "ingested_at": ingested_at,
            }
        )
    return records


def normalize_candle(payload: dict, capture_id: str, ingested_at: str) -> dict:
    return {
        "dataset": "candle_1m",
        "schema_version": SCHEMA_VERSION,
        "market": payload["market"],
        "unit_minutes": int(payload["unit"]),
        "candle_timestamp_ms": normalize_timestamp_ms(payload["timestamp"]),
        "exchange_timestamp_raw": str(payload["timestamp"]),
        "open_price": payload["opening_price"],
        "high_price": payload["high_price"],
        "low_price": payload["low_price"],
        "close_price": payload["trade_price"],
        "candle_acc_trade_price": payload["candle_acc_trade_price"],
        "candle_acc_trade_volume": payload["candle_acc_trade_volume"],
        "source": "bithumb_rest",
        "capture_id": capture_id,
        "ingested_at": ingested_at,
    }


def normalize_trade_tick(payload: dict, capture_id: str, ingested_at: str, source: str) -> dict:
    market = payload.get("market") or payload.get("code")
    event_timestamp_ms = normalize_timestamp_ms(payload["timestamp"])
    trade_timestamp_ms = normalize_timestamp_ms(payload.get("trade_timestamp", payload["timestamp"]))
    trade_date_utc, trade_time_utc = date_and_time_from_timestamp_ms(trade_timestamp_ms)
    change_price = payload["change_price"]
    if "change" in payload:
        change = payload["change"]
    elif change_price > 0:
        change = "RISE"
    elif change_price < 0:
        change = "FALL"
    else:
        change = "EVEN"
    return {
        "dataset": "trade_tick",
        "schema_version": SCHEMA_VERSION,
        "market": market,
        "event_timestamp_ms": event_timestamp_ms,
        "exchange_timestamp_raw": str(payload["timestamp"]),
        "trade_timestamp_ms": trade_timestamp_ms,
        "trade_date_utc": trade_date_utc,
        "trade_time_utc": trade_time_utc,
        "price": payload["trade_price"],
        "volume": payload["trade_volume"],
        "side": payload["ask_bid"],
        "prev_closing_price": payload["prev_closing_price"],
        "change": change,
        "change_price": change_price,
        "sequential_id": str(payload["sequential_id"]),
        "stream_type": payload.get("stream_type", "REST_BACKFILL"),
        "source": source,
        "capture_id": capture_id,
        "ingested_at": ingested_at,
    }


def normalize_ticker_event(payload: dict, capture_id: str, ingested_at: str, source: str) -> dict:
    market = payload.get("market") or payload.get("code")
    event_timestamp_ms = normalize_timestamp_ms(payload["timestamp"])
    trade_timestamp_ms = normalize_timestamp_ms(payload["trade_timestamp"])
    return {
        "dataset": "ticker_event",
        "schema_version": SCHEMA_VERSION,
        "market": market,
        "event_timestamp_ms": event_timestamp_ms,
        "exchange_timestamp_raw": str(payload["timestamp"]),
        "trade_timestamp_ms": trade_timestamp_ms,
        "opening_price": payload["opening_price"],
        "high_price": payload["high_price"],
        "low_price": payload["low_price"],
        "trade_price": payload["trade_price"],
        "prev_closing_price": payload["prev_closing_price"],
        "change": payload["change"],
        "change_price": payload["change_price"],
        "signed_change_price": payload["signed_change_price"],
        "change_rate": payload["change_rate"],
        "signed_change_rate": payload["signed_change_rate"],
        "trade_volume": payload["trade_volume"],
        "acc_trade_price": payload["acc_trade_price"],
        "acc_trade_price_24h": payload["acc_trade_price_24h"],
        "acc_trade_volume": payload["acc_trade_volume"],
        "acc_trade_volume_24h": payload["acc_trade_volume_24h"],
        "ask_bid": payload.get("ask_bid", "UNKNOWN"),
        "market_state": payload.get("market_state", "UNKNOWN"),
        "is_trading_suspended": bool(payload.get("is_trading_suspended", False)),
        "delisting_date": str(payload.get("delisting_date") or ""),
        "market_warning": payload.get("market_warning", "UNKNOWN"),
        "stream_type": payload.get("stream_type", "REST_SNAPSHOT"),
        "source": source,
        "capture_id": capture_id,
        "ingested_at": ingested_at,
    }


def normalize_orderbook(
    payload: dict, capture_id: str, ingested_at: str, source: str
) -> tuple[dict, list[dict]]:
    market = payload.get("market") or payload.get("code")
    event_timestamp_ms = normalize_timestamp_ms(payload["timestamp"])
    aggregation_level = payload.get("level", 1)
    levels = payload["orderbook_units"]
    snapshot = {
        "dataset": "orderbook_snapshot",
        "schema_version": SCHEMA_VERSION,
        "market": market,
        "event_timestamp_ms": event_timestamp_ms,
        "exchange_timestamp_raw": str(payload["timestamp"]),
        "aggregation_level": aggregation_level,
        "total_ask_size": payload["total_ask_size"],
        "total_bid_size": payload["total_bid_size"],
        "best_ask_price": levels[0]["ask_price"] if levels else 0,
        "best_bid_price": levels[0]["bid_price"] if levels else 0,
        "level_count": len(levels),
        "stream_type": payload.get("stream_type", "REST_SNAPSHOT"),
        "source": source,
        "capture_id": capture_id,
        "ingested_at": ingested_at,
    }
    level_records = []
    for index, level in enumerate(levels):
        level_records.append(
            {
                "dataset": "orderbook_level",
                "schema_version": SCHEMA_VERSION,
                "market": market,
                "event_timestamp_ms": event_timestamp_ms,
                "exchange_timestamp_raw": str(payload["timestamp"]),
                "aggregation_level": aggregation_level,
                "level_index": index,
                "ask_price": level["ask_price"],
                "bid_price": level["bid_price"],
                "ask_size": level["ask_size"],
                "bid_size": level["bid_size"],
                "stream_type": payload.get("stream_type", "REST_SNAPSHOT"),
                "source": source,
                "capture_id": capture_id,
                "ingested_at": ingested_at,
            }
        )
    return snapshot, level_records


def ingest_market_catalog(base_dir: Path, markets: list[str], obs: Observability) -> list[dict]:
    payload = fetch_market_catalog()
    capture_id, captured_at, envelope = _raw_rest_envelope(
        "market_catalog", "/v1/market/all", {"isDetails": True}, payload
    )
    append_jsonl(raw_rest_path(base_dir, "market_catalog", captured_at, obs.run_id), [envelope])
    records = normalize_market_catalog(payload, capture_id, captured_at, markets)
    return _write_validated_records(base_dir, "market_catalog", records, obs)


def backfill_candle_1m(base_dir: Path, markets: list[str], count: int, obs: Observability) -> list[dict]:
    accepted: list[dict] = []
    for market in markets:
        payload = fetch_candle_1m(market, count)
        capture_id, captured_at, envelope = _raw_rest_envelope(
            "candle_1m", "/v1/candles/minutes/1", {"market": market, "count": count}, payload
        )
        append_jsonl(raw_rest_path(base_dir, "candle_1m", captured_at, obs.run_id), [envelope])
        records = [normalize_candle(item, capture_id, captured_at) for item in payload]
        accepted.extend(_write_validated_records(base_dir, "candle_1m", records, obs))
    return accepted


def backfill_trade_ticks(base_dir: Path, markets: list[str], count: int, obs: Observability) -> list[dict]:
    accepted: list[dict] = []
    for market in markets:
        payload = fetch_trade_ticks(market, count)
        capture_id, captured_at, envelope = _raw_rest_envelope(
            "trade_tick", "/v1/trades/ticks", {"market": market, "count": count}, payload
        )
        append_jsonl(raw_rest_path(base_dir, "trade_tick", captured_at, obs.run_id), [envelope])
        records = [
            normalize_trade_tick(item, capture_id, captured_at, "bithumb_rest") for item in payload
        ]
        persisted = _write_validated_records(base_dir, "trade_tick", records, obs)
        accepted.extend(persisted)
    return accepted


def capture_rest_snapshots(base_dir: Path, markets: list[str], obs: Observability) -> dict[str, list[dict]]:
    result: dict[str, list[dict]] = {"ticker_event": [], "orderbook_snapshot": [], "orderbook_level": []}
    ticker_payload = fetch_ticker(markets)
    capture_id, captured_at, envelope = _raw_rest_envelope(
        "ticker_event", "/v1/ticker", {"markets": ",".join(markets)}, ticker_payload
    )
    append_jsonl(raw_rest_path(base_dir, "ticker_event", captured_at, obs.run_id), [envelope])
    ticker_records = [
        normalize_ticker_event(item, capture_id, captured_at, "bithumb_rest") for item in ticker_payload
    ]
    persisted_ticker = _write_validated_records(base_dir, "ticker_event", ticker_records, obs)
    for record in persisted_ticker:
        obs.touch_freshness("ticker_event", record["market"], record["event_timestamp_ms"])
    result["ticker_event"].extend(persisted_ticker)

    orderbook_payload = fetch_orderbook(markets)
    capture_id, captured_at, envelope = _raw_rest_envelope(
        "orderbook_snapshot", "/v1/orderbook", {"markets": ",".join(markets)}, orderbook_payload
    )
    append_jsonl(raw_rest_path(base_dir, "orderbook_snapshot", captured_at, obs.run_id), [envelope])
    snapshots = []
    levels = []
    for item in orderbook_payload:
        snapshot, level_records = normalize_orderbook(item, capture_id, captured_at, "bithumb_rest")
        snapshots.append(snapshot)
        levels.extend(level_records)
    persisted_snapshots = _write_validated_records(base_dir, "orderbook_snapshot", snapshots, obs)
    persisted_levels = _write_validated_records(base_dir, "orderbook_level", levels, obs)
    for record in persisted_snapshots:
        obs.touch_freshness("orderbook_snapshot", record["market"], record["event_timestamp_ms"])
    result["orderbook_snapshot"].extend(persisted_snapshots)
    result["orderbook_level"].extend(persisted_levels)
    return result


async def capture_live_public_data(
    base_dir: Path,
    markets: list[str],
    channels: list[str],
    seconds: int,
    obs: Observability,
) -> None:
    async def on_message(message: dict) -> None:
        if "type" not in message:
            return
        captured_at = utcnow_iso()
        capture_id = new_capture_id()
        channel = message["type"]
        market = message.get("code", "ALL")
        append_jsonl(
            raw_ws_path(base_dir, channel, captured_at, market, obs.run_id),
            [
                {
                    "capture_id": capture_id,
                    "captured_at": captured_at,
                    "source": "bithumb_ws",
                    "channel": channel,
                    "market": market,
                    "payload": message,
                }
            ],
        )
        if channel == "ticker":
            record = normalize_ticker_event(message, capture_id, captured_at, "bithumb_ws")
            persisted = _write_validated_records(base_dir, "ticker_event", [record], obs)
            for item in persisted:
                obs.touch_freshness("ticker_event", item["market"], item["event_timestamp_ms"])
            return
        if channel == "trade":
            record = normalize_trade_tick(message, capture_id, captured_at, "bithumb_ws")
            persisted = _write_validated_records(base_dir, "trade_tick", [record], obs)
            for item in persisted:
                obs.touch_freshness("trade_tick", item["market"], item["event_timestamp_ms"])
            return
        if channel == "orderbook":
            snapshot, levels = normalize_orderbook(message, capture_id, captured_at, "bithumb_ws")
            persisted_snapshots = _write_validated_records(base_dir, "orderbook_snapshot", [snapshot], obs)
            _write_validated_records(base_dir, "orderbook_level", levels, obs)
            for item in persisted_snapshots:
                obs.touch_freshness("orderbook_snapshot", item["market"], item["event_timestamp_ms"])

    async def on_idle() -> None:
        obs.check_freshness(int(time.time() * 1000))

    await capture_public_ws(
        markets=markets, channels=channels, duration_seconds=seconds, on_message=on_message, on_idle=on_idle
    )


def build_replay_manifest(base_dir: Path, run_id: str, datasets: list[str] | None = None) -> Path:
    grouped = list_canonical_files(base_dir, datasets)
    manifest = {
        "manifest_id": run_id,
        "created_at": utcnow_iso(),
        "schema_version": SCHEMA_VERSION,
        "datasets": {},
    }
    for dataset, files in sorted(grouped.items()):
        timestamp_field = TIMESTAMP_FIELDS.get(dataset)
        entries = []
        for path in sorted(files):
            summary = summarize_jsonl(path, timestamp_field)
            entries.append(
                {
                    "path": str(path),
                    "record_count": summary.get("record_count"),
                    "min_timestamp": summary.get("min_timestamp"),
                    "max_timestamp": summary.get("max_timestamp"),
                    "sha256": summary.get("sha256"),
                }
            )
        manifest["datasets"][dataset] = entries
    path = replay_manifest_path(base_dir, run_id)
    write_json(path, manifest)
    return path


def repair_gap(
    base_dir: Path,
    dataset: str,
    market: str,
    start: str,
    end: str,
    count: int,
    obs: Observability,
) -> dict:
    start_ms = int(parse_iso8601(start).timestamp() * 1000)
    end_ms = int(parse_iso8601(end).timestamp() * 1000)
    end_kst = (
        parse_iso8601(end)
        .astimezone(timezone(timedelta(hours=9)))
        .strftime("%Y-%m-%dT%H:%M:%S")
    )

    def in_window(record: dict, timestamp_field: str) -> bool:
        timestamp_ms = record[timestamp_field]
        return start_ms <= timestamp_ms <= end_ms

    if dataset == "candle_1m":
        payload = fetch_candle_1m(market, count, to=end_kst)
        if not isinstance(payload, list):
            accepted = []
            status = "upstream_error"
            upstream_error = payload
        else:
            capture_id, captured_at, envelope = _raw_rest_envelope(
                "candle_1m", "/v1/candles/minutes/1", {"market": market, "count": count, "to": end_kst}, payload
            )
            append_jsonl(raw_rest_path(base_dir, "candle_1m", captured_at, obs.run_id), [envelope])
            records = [normalize_candle(item, capture_id, captured_at) for item in payload]
            accepted = _write_validated_records(
                base_dir,
                "candle_1m",
                [record for record in records if in_window(record, "candle_timestamp_ms")],
                obs,
            )
            status = "repaired" if accepted else "no_data"
            upstream_error = None
    elif dataset == "trade_tick":
        payload = fetch_trade_ticks(market, count, to=end_kst)
        if not isinstance(payload, list):
            accepted = []
            status = "upstream_error"
            upstream_error = payload
        else:
            capture_id, captured_at, envelope = _raw_rest_envelope(
                "trade_tick", "/v1/trades/ticks", {"market": market, "count": count, "to": end_kst}, payload
            )
            append_jsonl(raw_rest_path(base_dir, "trade_tick", captured_at, obs.run_id), [envelope])
            records = [
                normalize_trade_tick(item, capture_id, captured_at, "bithumb_rest") for item in payload
            ]
            accepted = _write_validated_records(
                base_dir,
                "trade_tick",
                [record for record in records if in_window(record, "event_timestamp_ms")],
                obs,
            )
            status = "repaired" if accepted else "no_data"
            upstream_error = None
    else:
        accepted = []
        status = "unsupported"
        upstream_error = None
    result = {
        "run_id": obs.run_id,
        "dataset": dataset,
        "market": market,
        "requested_start": start,
        "requested_end": end,
        "requested_count": count,
        "status": status,
        "records_written": len(accepted),
        "upstream_error": upstream_error,
        "recorded_at": utcnow_iso(),
    }
    obs.record_gap_repair(result)
    return result
