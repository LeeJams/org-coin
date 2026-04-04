from __future__ import annotations

from collections import defaultdict
from pathlib import Path

from . import SCHEMA_VERSION
from .eligibility import DEFAULT_ENTRY_PROFILE, EntryMetrics, evaluate_entry_metrics, get_entry_profile
from .passive_features import PASSIVE_FEATURE_DATASET
from .storage import (
    list_canonical_files,
    read_jsonl,
    replay_preflight_report_path,
    write_json,
    write_text,
)
from .utils import iso_from_timestamp_ms, utcnow_iso


def _load_feature_records(base_dir: Path, run_id: str) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for path in sorted(
        list_canonical_files(base_dir, [PASSIVE_FEATURE_DATASET], source_run_id=run_id).get(
            PASSIVE_FEATURE_DATASET, []
        )
    ):
        for record in read_jsonl(path):
            market = record.get("market")
            if isinstance(market, str):
                grouped[market].append(record)
    return {
        market: sorted(records, key=lambda record: int(record["event_timestamp_ms"]))
        for market, records in grouped.items()
    }


def _metrics_from_record(record: dict) -> EntryMetrics:
    return EntryMetrics(
        ret_5m_bps=float(record["ret_5m_bps"]),
        buy_notional_share_60s=float(record["buy_notional_share_60s"]),
        depth_ratio_l5=float(record["depth_ratio_l5"]),
        spread_bps=float(record["spread_bps"]),
        turnover_24h_krw=float(record["turnover_24h_krw"]),
        window_coverage_sec=float(record["window_coverage_sec"]),
    )


def _format_metric(value: float) -> str:
    if abs(value - round(value)) < 1e-9:
        return str(int(round(value)))
    return f"{value:.3f}".rstrip("0").rstrip(".")


def _format_failure(failure: dict) -> str:
    return (
        f"{failure['field']} {failure['comparator']} { _format_metric(float(failure['threshold'])) } "
        f"(actual={ _format_metric(float(failure['actual'])) })"
    )


def _render_preflight_markdown(report: dict) -> str:
    lines = [
        "# Preflight Gate Summary",
        "",
        f"- Source run: `{report['source_run_id']}`",
        f"- Created at: `{report['created_at']}`",
        f"- Profile: `{report['profile']}`",
        f"- Markets summarized: {report['market_count']}",
        f"- Snapshot count: {report['snapshot_count']}",
        f"- Eligible snapshots: {report['eligible_snapshot_count']}",
        f"- Latest eligible markets: {report['latest_eligible_market_count']}/{report['market_count']}",
        f"- Required coverage gate: `window_coverage_sec >= {report['required_window_coverage_sec']}`",
        f"- Required turnover gate: `turnover_24h_krw >= {report['required_turnover_24h_krw']:.0f}`",
        "",
        "| Market | Latest as of | Latest outcome | Tier | Coverage sec | Turnover 24h KRW | Eligible snapshots | Latest failing gates |",
        "| --- | --- | --- | --- | ---: | ---: | ---: | --- |",
    ]
    for market in report["markets"]:
        latest = market["latest_snapshot"]
        failures = latest["failing_gates"]
        lines.append(
            "| "
            + " | ".join(
                [
                    market["market"],
                    latest["as_of"],
                    latest["outcome"],
                    latest["tier"] or "-",
                    _format_metric(float(latest["metrics"]["window_coverage_sec"])),
                    _format_metric(float(latest["metrics"]["turnover_24h_krw"])),
                    str(market["eligible_snapshot_count"]),
                    "<br>".join(_format_failure(failure) for failure in failures) if failures else "-",
                ]
            )
            + " |"
        )

    if report["gate_failure_counts"]:
        lines.extend(
            [
                "",
                "| Gate | Snapshot failures |",
                "| --- | ---: |",
            ]
        )
        for failure in report["gate_failure_counts"]:
            lines.append(f"| {failure['field']} | {failure['count']} |")

    if report["outcome_counts"]:
        lines.extend(
            [
                "",
                "| Outcome | Snapshot count |",
                "| --- | ---: |",
            ]
        )
        for outcome in report["outcome_counts"]:
            lines.append(f"| {outcome['outcome']} | {outcome['count']} |")
    lines.append("")
    return "\n".join(lines)


def build_preflight_report(
    base_dir: Path,
    run_id: str,
    *,
    profile: str = DEFAULT_ENTRY_PROFILE,
) -> tuple[Path, Path]:
    base_dir = Path(base_dir)
    entry_profile = get_entry_profile(profile)
    records_by_market = _load_feature_records(base_dir, run_id)
    created_at = utcnow_iso()
    gate_failure_counts: dict[str, int] = defaultdict(int)
    outcome_counts: dict[str, int] = defaultdict(int)
    markets = []
    eligible_snapshot_count = 0
    latest_eligible_market_count = 0

    for market, records in sorted(records_by_market.items()):
        market_gate_failure_counts: dict[str, int] = defaultdict(int)
        market_outcome_counts: dict[str, int] = defaultdict(int)
        latest_record = records[-1]
        latest_decision = evaluate_entry_metrics(_metrics_from_record(latest_record), profile=profile)
        eligible_count = 0

        for record in records:
            decision = evaluate_entry_metrics(_metrics_from_record(record), profile=profile)
            outcome = decision.outcome
            outcome_counts[outcome] += 1
            market_outcome_counts[outcome] += 1
            if decision.is_eligible:
                eligible_snapshot_count += 1
                eligible_count += 1
            for failure in decision.base_gate_failures:
                gate_failure_counts[failure.field] += 1
                market_gate_failure_counts[failure.field] += 1

        if latest_decision.is_eligible:
            latest_eligible_market_count += 1

        markets.append(
            {
                "market": market,
                "snapshot_count": len(records),
                "eligible_snapshot_count": eligible_count,
                "outcome_counts": [
                    {"outcome": outcome, "count": count}
                    for outcome, count in sorted(market_outcome_counts.items())
                ],
                "gate_failure_counts": [
                    {"field": field, "count": count}
                    for field, count in sorted(market_gate_failure_counts.items())
                ],
                "latest_snapshot": {
                    "as_of": iso_from_timestamp_ms(int(latest_record["event_timestamp_ms"])),
                    "outcome": latest_decision.outcome,
                    "tier": latest_decision.tier,
                    "suppression_reason": latest_decision.suppression_reason,
                    "metrics": {
                        "ret_5m_bps": float(latest_record["ret_5m_bps"]),
                        "buy_notional_share_60s": float(latest_record["buy_notional_share_60s"]),
                        "depth_ratio_l5": float(latest_record["depth_ratio_l5"]),
                        "spread_bps": float(latest_record["spread_bps"]),
                        "turnover_24h_krw": float(latest_record["turnover_24h_krw"]),
                        "window_coverage_sec": float(latest_record["window_coverage_sec"]),
                    },
                    "failing_gates": [
                        {
                            "field": failure.field,
                            "comparator": failure.comparator,
                            "actual": failure.actual,
                            "threshold": failure.threshold,
                        }
                        for failure in latest_decision.base_gate_failures
                    ],
                },
            }
        )

    json_path = replay_preflight_report_path(base_dir, run_id, "json", profile=profile)
    markdown_path = replay_preflight_report_path(base_dir, run_id, "md", profile=profile)
    report = {
        "report_id": run_id,
        "created_at": created_at,
        "schema_version": SCHEMA_VERSION,
        "source_run_id": run_id,
        "profile": profile,
        "required_window_coverage_sec": entry_profile.window_coverage_sec,
        "required_turnover_24h_krw": entry_profile.entry_gates["turnover_24h_krw"],
        "market_count": len(markets),
        "snapshot_count": sum(market["snapshot_count"] for market in markets),
        "eligible_snapshot_count": eligible_snapshot_count,
        "latest_eligible_market_count": latest_eligible_market_count,
        "artifacts": {
            "json_path": str(json_path),
            "markdown_path": str(markdown_path),
        },
        "outcome_counts": [
            {"outcome": outcome, "count": count}
            for outcome, count in sorted(outcome_counts.items())
        ],
        "gate_failure_counts": [
            {"field": field, "count": count}
            for field, count in sorted(gate_failure_counts.items())
        ],
        "markets": markets,
    }
    write_json(json_path, report)
    write_text(markdown_path, _render_preflight_markdown(report))
    return json_path, markdown_path
