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
from .passive_features import build_passive_feature_report
from .storage import (
    append_jsonl,
    canonical_file_run_id,
    canonical_path,
    list_canonical_files,
    partition_value_from_path,
    raw_rest_path,
    raw_ws_path,
    read_jsonl,
    replay_manifest_path,
    replay_quality_report_path,
    summarize_jsonl,
    write_json,
    write_text,
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
FRESHNESS_TRACKED_DATASETS = {"trade_tick", "ticker_event", "orderbook_snapshot"}


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
    return _build_replay_manifest(base_dir, run_id, datasets=datasets, source_run_id=None)


def _build_replay_manifest(
    base_dir: Path,
    run_id: str,
    datasets: list[str] | None = None,
    source_run_id: str | None = None,
) -> Path:
    grouped = list_canonical_files(base_dir, datasets, source_run_id=source_run_id)
    manifest = {
        "manifest_id": run_id,
        "created_at": utcnow_iso(),
        "schema_version": SCHEMA_VERSION,
        "scope": "run" if source_run_id else "all_runs",
        "source_run_id": source_run_id,
        "dataset_totals": {},
        "datasets": {},
    }
    total_record_count = 0
    for dataset, files in sorted(grouped.items()):
        timestamp_field = TIMESTAMP_FIELDS.get(dataset)
        entries = []
        dataset_record_count = 0
        for path in sorted(files):
            summary = summarize_jsonl(path, timestamp_field)
            dataset_record_count += summary.get("record_count") or 0
            total_record_count += summary.get("record_count") or 0
            entries.append(
                {
                    "path": str(path),
                    "date": partition_value_from_path(path, "date"),
                    "market": partition_value_from_path(path, "market"),
                    "source_run_id": canonical_file_run_id(path),
                    "record_count": summary.get("record_count"),
                    "min_timestamp": summary.get("min_timestamp"),
                    "max_timestamp": summary.get("max_timestamp"),
                    "sha256": summary.get("sha256"),
                }
            )
        manifest["datasets"][dataset] = entries
        manifest["dataset_totals"][dataset] = {
            "file_count": len(entries),
            "record_count": dataset_record_count,
        }
    manifest["total_record_count"] = total_record_count
    path = replay_manifest_path(base_dir, run_id)
    write_json(path, manifest)
    return path


def build_run_replay_manifest(
    base_dir: Path,
    run_id: str,
    datasets: list[str] | None = None,
) -> Path:
    return _build_replay_manifest(base_dir, run_id, datasets=datasets, source_run_id=run_id)


def _quality_market_summary(market: str) -> dict:
    return {
        "market": market,
        "record_count": 0,
        "freshness_alert_count": 0,
        "max_gap_ms": None,
        "datasets": {},
    }


def _quality_dataset_summary(dataset: str) -> dict:
    return {
        "dataset": dataset,
        "file_count": 0,
        "record_count": 0,
        "min_timestamp": None,
        "max_timestamp": None,
        "freshness_alert_count": 0,
        "max_gap_ms": None,
        "freshness_sla_ms": None,
        "latest_event_age_ms": None,
    }


def _quality_paths(base_dir: Path, run_id: str) -> tuple[Path, Path]:
    return (
        replay_quality_report_path(base_dir, run_id, "json"),
        replay_quality_report_path(base_dir, run_id, "md"),
    )


def _render_quality_report_markdown(report: dict) -> str:
    lines = [
        "# Quality Summary",
        "",
        f"- Source run: `{report['source_run_id']}`",
        f"- Created at: `{report['created_at']}`",
        f"- Total records: {report['total_record_count']}",
        f"- Markets summarized: {report['market_count']}",
        f"- Freshness SLA: {report['freshness_sla_ms']} ms",
        "",
        "| Market | Dataset | Records | Alerts | Max gap ms | Latest event age ms | Timestamp range |",
        "| --- | --- | ---: | ---: | ---: | ---: | --- |",
    ]
    for market_summary in report["markets"]:
        for dataset_summary in market_summary["datasets"]:
            max_gap_ms = dataset_summary["max_gap_ms"]
            latest_event_age_ms = dataset_summary["latest_event_age_ms"]
            time_range = "-"
            if (
                dataset_summary["min_timestamp"] is not None
                and dataset_summary["max_timestamp"] is not None
            ):
                time_range = (
                    f"{dataset_summary['min_timestamp']}..{dataset_summary['max_timestamp']}"
                )
            lines.append(
                "| "
                + " | ".join(
                    [
                        market_summary["market"],
                        dataset_summary["dataset"],
                        str(dataset_summary["record_count"]),
                        str(dataset_summary["freshness_alert_count"]),
                        "-" if max_gap_ms is None else str(max_gap_ms),
                        "-" if latest_event_age_ms is None else str(latest_event_age_ms),
                        time_range,
                    ]
                )
                + " |"
            )
    if report["validation"]:
        lines.extend(
            [
                "",
                "## Validation",
                "",
                "| Dataset | Validated | Accepted | Rejected |",
                "| --- | ---: | ---: | ---: |",
            ]
        )
        for row in report["validation"]:
            lines.append(
                f"| {row['dataset']} | {row['validated']} | {row['accepted']} | {row['rejected']} |"
            )
    lines.append("")
    return "\n".join(lines)


def build_quality_report(base_dir: Path, run_id: str, freshness_sla_ms: int) -> tuple[Path, Path]:
    grouped = list_canonical_files(base_dir, source_run_id=run_id)
    report_created_at = utcnow_iso()
    report_created_at_ms = int(parse_iso8601(report_created_at).timestamp() * 1000)
    market_map: dict[str, dict] = {}
    total_record_count = 0

    def ensure_market_dataset(market: str, dataset: str) -> tuple[dict, dict]:
        market_summary = market_map.setdefault(market, _quality_market_summary(market))
        dataset_summary = market_summary["datasets"].setdefault(
            dataset, _quality_dataset_summary(dataset)
        )
        return market_summary, dataset_summary

    for dataset, files in sorted(grouped.items()):
        timestamp_field = TIMESTAMP_FIELDS.get(dataset)
        for path in sorted(files):
            market = partition_value_from_path(path, "market") or "ALL"
            market_summary, dataset_summary = ensure_market_dataset(market, dataset)
            dataset_summary["file_count"] += 1
            for record in read_jsonl(path):
                dataset_summary["record_count"] += 1
                market_summary["record_count"] += 1
                total_record_count += 1
                if not timestamp_field:
                    continue
                timestamp = record.get(timestamp_field)
                if not isinstance(timestamp, int):
                    continue
                if dataset_summary["min_timestamp"] is None or timestamp < dataset_summary["min_timestamp"]:
                    dataset_summary["min_timestamp"] = timestamp
                if dataset_summary["max_timestamp"] is None or timestamp > dataset_summary["max_timestamp"]:
                    dataset_summary["max_timestamp"] = timestamp

    freshness_path = base_dir / "observability" / "freshness_alert.ndjson"
    if freshness_path.exists():
        for record in read_jsonl(freshness_path):
            if record.get("run_id") != run_id:
                continue
            market = record["market"]
            dataset = record["dataset"]
            market_summary, dataset_summary = ensure_market_dataset(market, dataset)
            dataset_summary["freshness_alert_count"] += 1
            dataset_summary["freshness_sla_ms"] = record.get("freshness_sla_ms")
            gap_ms = record.get("gap_ms")
            if isinstance(gap_ms, int):
                current_gap = dataset_summary["max_gap_ms"]
                dataset_summary["max_gap_ms"] = gap_ms if current_gap is None else max(current_gap, gap_ms)
                market_gap = market_summary["max_gap_ms"]
                market_summary["max_gap_ms"] = gap_ms if market_gap is None else max(market_gap, gap_ms)
            market_summary["freshness_alert_count"] += 1

    validation = []
    validation_path = base_dir / "observability" / "schema_validation_counter.ndjson"
    if validation_path.exists():
        for row in read_jsonl(validation_path):
            if row.get("run_id") != run_id:
                continue
            validation.append(
                {
                    "dataset": row["dataset"],
                    "validated": row["validated"],
                    "accepted": row["accepted"],
                    "rejected": row["rejected"],
                }
            )
    validation.sort(key=lambda row: row["dataset"])

    markets = []
    for market in sorted(market_map):
        market_summary = market_map[market]
        dataset_rows = []
        for dataset in sorted(market_summary["datasets"]):
            dataset_summary = market_summary["datasets"][dataset]
            if dataset in FRESHNESS_TRACKED_DATASETS and dataset_summary["max_timestamp"] is not None:
                dataset_summary["latest_event_age_ms"] = max(
                    0, report_created_at_ms - dataset_summary["max_timestamp"]
                )
            dataset_rows.append(dataset_summary)
        market_summary["datasets"] = dataset_rows
        markets.append(market_summary)

    json_path, markdown_path = _quality_paths(base_dir, run_id)
    report = {
        "report_id": run_id,
        "created_at": report_created_at,
        "schema_version": SCHEMA_VERSION,
        "source_run_id": run_id,
        "freshness_sla_ms": freshness_sla_ms,
        "market_count": len(markets),
        "total_record_count": total_record_count,
        "artifacts": {
            "json_path": str(json_path),
            "markdown_path": str(markdown_path),
        },
        "markets": markets,
        "validation": validation,
    }
    write_json(json_path, report)
    write_text(markdown_path, _render_quality_report_markdown(report))
    return json_path, markdown_path


def run_bootstrap_session(
    base_dir: Path,
    markets: list[str],
    candle_count: int,
    trade_count: int,
    ws_seconds: int,
    channels: list[str],
    iterations: int,
    interval_seconds: int,
    freshness_sla_ms: int,
) -> dict:
    run_id = new_capture_id()
    obs = Observability(base_dir, run_id, freshness_sla_ms)
    ingest_market_catalog(base_dir, markets, obs)
    backfill_candle_1m(base_dir, markets, candle_count, obs)
    backfill_trade_ticks(base_dir, markets, trade_count, obs)
    for iteration in range(iterations):
        capture_rest_snapshots(base_dir, markets, obs)
        asyncio.run(capture_live_public_data(base_dir, markets, channels, ws_seconds, obs))
        if interval_seconds > 0 and iteration + 1 < iterations:
            time.sleep(interval_seconds)
    obs.flush_validation_counts()
    passive_feature_json_path, passive_feature_markdown_path = build_passive_feature_report(
        base_dir, run_id
    )
    manifest_path = build_run_replay_manifest(base_dir, run_id)
    quality_json_path, quality_markdown_path = build_quality_report(
        base_dir, run_id, freshness_sla_ms
    )
    return {
        "run_id": run_id,
        "iterations": iterations,
        "interval_seconds": interval_seconds,
        "manifest_path": manifest_path,
        "quality_json_path": quality_json_path,
        "quality_markdown_path": quality_markdown_path,
        "passive_feature_json_path": passive_feature_json_path,
        "passive_feature_markdown_path": passive_feature_markdown_path,
    }


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
