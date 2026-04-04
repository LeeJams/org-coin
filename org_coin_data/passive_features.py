from __future__ import annotations

import math
from bisect import bisect_left, bisect_right
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

from . import SCHEMA_VERSION
from .contracts import validate_record
from .storage import (
    append_jsonl,
    canonical_path,
    list_canonical_files,
    read_jsonl,
    replay_passive_feature_report_path,
    write_json,
    write_text,
)
from .utils import iso_from_timestamp_ms, parse_iso8601, utcnow_iso


PASSIVE_FEATURE_DATASET = "passive_feature_snapshot"
PASSIVE_FEATURE_REPORT_REQUIRED_KST_DAYS = 7
PASSIVE_FEATURE_REPORT_METRICS = (
    "ret_5m_bps",
    "buy_notional_share_60s",
    "depth_ratio_l5",
    "spread_bps",
    "turnover_24h_krw",
    "window_coverage_sec",
    "trade_count_60s",
    "notional_60s",
)
ORDERBOOK_MATCH_MAX_SKEW_MS = 15_000
KST = timezone(timedelta(hours=9))


def _sorted_records(records: Iterable[dict], field: str) -> list[dict]:
    return sorted(records, key=lambda record: int(record[field]))


def _load_run_records(
    base_dir: Path,
    dataset: str,
    run_id: str,
    *,
    source: str | None = None,
    timestamp_field: str,
) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for path in sorted(list_canonical_files(base_dir, [dataset], source_run_id=run_id).get(dataset, [])):
        for record in read_jsonl(path):
            if source is not None and record.get("source") != source:
                continue
            market = record.get("market")
            if not isinstance(market, str):
                continue
            grouped[market].append(record)
    return {
        market: _sorted_records(records, timestamp_field)
        for market, records in grouped.items()
    }


def _clear_existing_snapshots(base_dir: Path, run_id: str) -> None:
    for path in list_canonical_files(
        base_dir, [PASSIVE_FEATURE_DATASET], source_run_id=run_id
    ).get(PASSIVE_FEATURE_DATASET, []):
        path.unlink(missing_ok=True)


def _build_minute_bars(trades: list[dict]) -> tuple[list[int], list[float]]:
    minute_timestamps: list[int] = []
    minute_close_prices: list[float] = []
    for trade in trades:
        minute_ts = (int(trade["trade_timestamp_ms"]) // 60_000) * 60_000
        price = float(trade["price"])
        if minute_timestamps and minute_timestamps[-1] == minute_ts:
            minute_close_prices[-1] = price
            continue
        minute_timestamps.append(minute_ts)
        minute_close_prices.append(price)
    return minute_timestamps, minute_close_prices


def _group_orderbook_levels(levels: list[dict]) -> dict[tuple[str, int], list[dict]]:
    grouped: dict[tuple[str, int], list[dict]] = defaultdict(list)
    for level in levels:
        capture_id = level.get("capture_id")
        event_timestamp_ms = level.get("event_timestamp_ms")
        if not isinstance(capture_id, str) or not isinstance(event_timestamp_ms, int):
            continue
        grouped[(capture_id, event_timestamp_ms)].append(level)
    return {
        key: sorted(value, key=lambda item: int(item["level_index"]))
        for key, value in grouped.items()
    }


def _record_match_timestamp_ms(record: dict) -> int:
    ingested_at = record.get("ingested_at")
    if isinstance(ingested_at, str):
        return int(parse_iso8601(ingested_at).timestamp() * 1000)
    return int(record["event_timestamp_ms"])


def _nearest_record(
    records: list[dict], match_timestamps: list[int], anchor_timestamp_ms: int
) -> dict | None:
    if not records:
        return None
    insert_at = bisect_left(match_timestamps, anchor_timestamp_ms)
    candidates: list[dict] = []
    if insert_at < len(records):
        candidates.append(records[insert_at])
    if insert_at > 0:
        candidates.append(records[insert_at - 1])
    if not candidates:
        return None
    match = min(
        candidates,
        key=lambda record: abs(_record_match_timestamp_ms(record) - anchor_timestamp_ms),
    )
    if abs(_record_match_timestamp_ms(match) - anchor_timestamp_ms) > ORDERBOOK_MATCH_MAX_SKEW_MS:
        return None
    return match


def _window_coverage_seconds(
    anchor_timestamp_ms: int, window_trades: list[dict]
) -> float:
    if not window_trades:
        return 0.0
    observed_start = max(anchor_timestamp_ms - 60_000, int(window_trades[0]["trade_timestamp_ms"]))
    observed_end = min(anchor_timestamp_ms, int(window_trades[-1]["trade_timestamp_ms"]))
    if observed_end <= observed_start:
        return 0.0
    return round((observed_end - observed_start) / 1000, 3)


def _spread_bps(best_bid_price: float, best_ask_price: float) -> float:
    mid_price = (best_bid_price + best_ask_price) / 2
    if mid_price <= 0:
        return 0.0
    return round(((best_ask_price - best_bid_price) / mid_price) * 10_000, 6)


def _depth_ratio_l5(levels: list[dict]) -> float:
    top_levels = levels[:5]
    ask_size_total = sum(float(level["ask_size"]) for level in top_levels)
    bid_size_total = sum(float(level["bid_size"]) for level in top_levels)
    if ask_size_total <= 0:
        return 0.0
    return round(bid_size_total / ask_size_total, 6)


def _buy_notional_share(window_trades: list[dict]) -> tuple[float, float]:
    total_notional = 0.0
    buy_notional = 0.0
    for trade in window_trades:
        notional = float(trade["price"]) * float(trade["volume"])
        total_notional += notional
        if str(trade.get("side", "")).upper() == "BID":
            buy_notional += notional
    share = round(buy_notional / total_notional, 6) if total_notional > 0 else 0.0
    return round(total_notional, 6), share


def _date_kst(timestamp_ms: int) -> str:
    return (
        datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc)
        .astimezone(KST)
        .date()
        .isoformat()
    )


def materialize_passive_feature_snapshots(base_dir: Path, run_id: str) -> dict:
    base_dir = Path(base_dir)
    derived_at = utcnow_iso()
    trade_records = _load_run_records(
        base_dir, "trade_tick", run_id, timestamp_field="trade_timestamp_ms"
    )
    ticker_records = _load_run_records(
        base_dir,
        "ticker_event",
        run_id,
        source="bithumb_rest",
        timestamp_field="event_timestamp_ms",
    )
    orderbook_records = _load_run_records(
        base_dir,
        "orderbook_snapshot",
        run_id,
        source="bithumb_rest",
        timestamp_field="event_timestamp_ms",
    )
    orderbook_levels = _load_run_records(
        base_dir,
        "orderbook_level",
        run_id,
        source="bithumb_rest",
        timestamp_field="event_timestamp_ms",
    )

    _clear_existing_snapshots(base_dir, run_id)
    grouped_output: dict[Path, list[dict]] = defaultdict(list)
    records_written = 0

    for market, orderbooks in sorted(orderbook_records.items()):
        trades = trade_records.get(market, [])
        tickers = sorted(ticker_records.get(market, []), key=_record_match_timestamp_ms)
        orderbooks = _sorted_records(orderbooks, "event_timestamp_ms")
        if not trades or not orderbooks or not tickers:
            continue
        trade_timestamps = [int(record["trade_timestamp_ms"]) for record in trades]
        ticker_match_timestamps = [_record_match_timestamp_ms(record) for record in tickers]
        minute_timestamps, minute_close_prices = _build_minute_bars(trades)
        if not minute_timestamps:
            continue
        level_map = _group_orderbook_levels(orderbook_levels.get(market, []))

        for orderbook in orderbooks:
            anchor_timestamp_ms = int(orderbook["event_timestamp_ms"])
            ticker = _nearest_record(
                tickers, ticker_match_timestamps, _record_match_timestamp_ms(orderbook)
            )
            if ticker is None:
                continue
            levels = level_map.get((str(orderbook["capture_id"]), int(orderbook["event_timestamp_ms"])), [])
            if not levels:
                continue

            trade_end = bisect_right(trade_timestamps, anchor_timestamp_ms)
            if trade_end == 0:
                continue
            latest_trade = trades[trade_end - 1]
            window_start_ms = anchor_timestamp_ms - 60_000
            trade_start = bisect_left(trade_timestamps, window_start_ms)
            window_trades = trades[trade_start:trade_end]

            reference_cutoff_ms = anchor_timestamp_ms - 300_000
            reference_index = bisect_right(minute_timestamps, reference_cutoff_ms) - 1
            if reference_index < 0:
                continue
            reference_bar_ts = minute_timestamps[reference_index]
            reference_price = float(minute_close_prices[reference_index])
            if reference_price <= 0:
                continue

            latest_trade_price = float(latest_trade["price"])
            notional_60s, buy_notional_share_60s = _buy_notional_share(window_trades)
            record = {
                "dataset": PASSIVE_FEATURE_DATASET,
                "schema_version": SCHEMA_VERSION,
                "market": market,
                "event_timestamp_ms": anchor_timestamp_ms,
                "date_kst": _date_kst(anchor_timestamp_ms),
                "reference_bar_ts": reference_bar_ts,
                "reference_price": reference_price,
                "latest_trade_ts": int(latest_trade["trade_timestamp_ms"]),
                "window_coverage_sec": _window_coverage_seconds(anchor_timestamp_ms, window_trades),
                "trade_count_60s": len(window_trades),
                "notional_60s": notional_60s,
                "ret_5m_bps": round(((latest_trade_price / reference_price) - 1) * 10_000, 6),
                "buy_notional_share_60s": buy_notional_share_60s,
                "depth_ratio_l5": _depth_ratio_l5(levels),
                "spread_bps": _spread_bps(
                    float(orderbook["best_bid_price"]),
                    float(orderbook["best_ask_price"]),
                ),
                "turnover_24h_krw": float(ticker["acc_trade_price_24h"]),
                "orderbook_event_timestamp_ms": int(orderbook["event_timestamp_ms"]),
                "source_run_id": run_id,
                "source": "org_coin_data_derived",
                "capture_id": str(orderbook["capture_id"]),
                "ingested_at": derived_at,
            }
            errors = validate_record(PASSIVE_FEATURE_DATASET, record)
            if errors:
                continue
            path = canonical_path(
                base_dir,
                PASSIVE_FEATURE_DATASET,
                iso_from_timestamp_ms(anchor_timestamp_ms),
                run_id,
                market=market,
            )
            grouped_output[path].append(record)
            records_written += 1

    for path, records in grouped_output.items():
        path.unlink(missing_ok=True)
        append_jsonl(path, records)

    return {
        "dataset": PASSIVE_FEATURE_DATASET,
        "source_run_id": run_id,
        "records_written": records_written,
        "created_at": derived_at,
    }


def _percentile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    if len(values) == 1:
        return float(values[0])
    rank = (len(values) - 1) * percentile
    lower = math.floor(rank)
    upper = math.ceil(rank)
    if lower == upper:
        return float(values[lower])
    lower_value = values[lower]
    upper_value = values[upper]
    return float(lower_value + (upper_value - lower_value) * (rank - lower))


def _metric_summary(name: str, records: list[dict]) -> dict:
    values = sorted(float(record[name]) for record in records)
    return {
        "metric": name,
        "count": len(values),
        "min": float(values[0]),
        "p05": _percentile(values, 0.05),
        "p50": _percentile(values, 0.50),
        "p95": _percentile(values, 0.95),
        "max": float(values[-1]),
        "mean": round(sum(values) / len(values), 6),
    }


def _format_metric_value(value: float | int | None) -> str:
    if value is None:
        return "-"
    if isinstance(value, int):
        return str(value)
    if abs(value - round(value)) < 1e-9:
        return str(int(round(value)))
    return f"{value:.6f}".rstrip("0").rstrip(".")


def _render_passive_feature_markdown(report: dict) -> str:
    lines = [
        "# Passive Feature Summary",
        "",
        f"- Source run: `{report['source_run_id']}`",
        f"- Created at: `{report['created_at']}`",
        f"- Markets summarized: {report['market_count']}",
        f"- Snapshot count: {report['snapshot_count']}",
        f"- Required KST days for threshold tuning: {report['required_kst_days']}",
        f"- Threshold tuning ready: `{str(report['threshold_tuning_ready']).lower()}`",
        f"- Operational note: {report['operational_note']}",
        "",
        "| Market | Snapshots | KST days | Threshold tuning ready | Date range KST |",
        "| --- | ---: | ---: | --- | --- |",
    ]
    for market in report["markets"]:
        date_range = "-"
        if market["date_kst_start"] and market["date_kst_end"]:
            date_range = f"{market['date_kst_start']}..{market['date_kst_end']}"
        lines.append(
            "| "
            + " | ".join(
                [
                    market["market"],
                    str(market["snapshot_count"]),
                    str(market["date_kst_count"]),
                    str(market["threshold_tuning_ready"]).lower(),
                    date_range,
                ]
            )
            + " |"
        )

    lines.extend(
        [
            "",
            "| Market | Metric | Count | P05 | P50 | P95 | Min | Max | Mean |",
            "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
        ]
    )
    for market in report["markets"]:
        for metric in market["metrics"]:
            lines.append(
                "| "
                + " | ".join(
                    [
                        market["market"],
                        metric["metric"],
                        str(metric["count"]),
                        _format_metric_value(metric["p05"]),
                        _format_metric_value(metric["p50"]),
                        _format_metric_value(metric["p95"]),
                        _format_metric_value(metric["min"]),
                        _format_metric_value(metric["max"]),
                        _format_metric_value(metric["mean"]),
                    ]
                )
                + " |"
            )
    lines.append("")
    return "\n".join(lines)


def build_passive_feature_report(base_dir: Path, run_id: str) -> tuple[Path, Path]:
    base_dir = Path(base_dir)
    materialization = materialize_passive_feature_snapshots(base_dir, run_id)
    records_by_market = _load_run_records(
        base_dir,
        PASSIVE_FEATURE_DATASET,
        run_id,
        timestamp_field="event_timestamp_ms",
    )
    created_at = utcnow_iso()
    markets = []
    threshold_tuning_ready = bool(records_by_market)

    for market, records in sorted(records_by_market.items()):
        date_kst_values = sorted({str(record["date_kst"]) for record in records})
        market_ready = len(date_kst_values) >= PASSIVE_FEATURE_REPORT_REQUIRED_KST_DAYS
        threshold_tuning_ready = threshold_tuning_ready and market_ready
        markets.append(
            {
                "market": market,
                "snapshot_count": len(records),
                "date_kst_count": len(date_kst_values),
                "date_kst_start": date_kst_values[0] if date_kst_values else None,
                "date_kst_end": date_kst_values[-1] if date_kst_values else None,
                "threshold_tuning_ready": market_ready,
                "metrics": [
                    _metric_summary(metric_name, records)
                    for metric_name in PASSIVE_FEATURE_REPORT_METRICS
                ],
            }
        )

    json_path = replay_passive_feature_report_path(base_dir, run_id, "json")
    markdown_path = replay_passive_feature_report_path(base_dir, run_id, "md")
    report = {
        "report_id": run_id,
        "created_at": created_at,
        "schema_version": SCHEMA_VERSION,
        "source_run_id": run_id,
        "market_count": len(markets),
        "snapshot_count": sum(market["snapshot_count"] for market in markets),
        "required_kst_days": PASSIVE_FEATURE_REPORT_REQUIRED_KST_DAYS,
        "threshold_tuning_ready": threshold_tuning_ready,
        "operational_note": (
            "Smoke-test or partial-window output is for pipeline validation only. "
            "Do not tune strategy thresholds until each market covers at least 7 distinct KST dates."
        ),
        "materialization": materialization,
        "artifacts": {
            "json_path": str(json_path),
            "markdown_path": str(markdown_path),
        },
        "markets": markets,
    }
    write_json(json_path, report)
    write_text(markdown_path, _render_passive_feature_markdown(report))
    return json_path, markdown_path
