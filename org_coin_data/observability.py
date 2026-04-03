from __future__ import annotations

from collections import defaultdict
from pathlib import Path

from .storage import append_jsonl
from .utils import utcnow_iso


class Observability:
    def __init__(self, base_dir: Path, run_id: str, freshness_sla_ms: int) -> None:
        self.base_dir = Path(base_dir)
        self.run_id = run_id
        self.freshness_sla_ms = freshness_sla_ms
        self.validation_counts: dict[str, dict[str, int]] = defaultdict(
            lambda: {"validated": 0, "accepted": 0, "rejected": 0}
        )
        self.last_seen_ms: dict[tuple[str, str], int] = {}
        self.stale_open: set[tuple[str, str]] = set()

    @property
    def freshness_path(self) -> Path:
        return self.base_dir / "observability" / "freshness_alert.ndjson"

    @property
    def gap_repair_path(self) -> Path:
        return self.base_dir / "observability" / "gap_repair.ndjson"

    @property
    def validation_path(self) -> Path:
        return self.base_dir / "observability" / "schema_validation_counter.ndjson"

    def record_validation(self, dataset: str, errors: list[str]) -> None:
        counts = self.validation_counts[dataset]
        counts["validated"] += 1
        if errors:
            counts["rejected"] += 1
        else:
            counts["accepted"] += 1

    def touch_freshness(self, dataset: str, market: str, event_timestamp_ms: int) -> None:
        key = (dataset, market)
        self.last_seen_ms[key] = event_timestamp_ms
        self.stale_open.discard(key)

    def check_freshness(self, now_ms: int) -> None:
        alerts = []
        for (dataset, market), last_seen_ms in self.last_seen_ms.items():
            gap_ms = now_ms - last_seen_ms
            key = (dataset, market)
            if gap_ms > self.freshness_sla_ms and key not in self.stale_open:
                alerts.append(
                    {
                        "run_id": self.run_id,
                        "dataset": dataset,
                        "market": market,
                        "gap_ms": gap_ms,
                        "freshness_sla_ms": self.freshness_sla_ms,
                        "last_seen_event_timestamp_ms": last_seen_ms,
                        "alerted_at": utcnow_iso(),
                    }
                )
                self.stale_open.add(key)
        if alerts:
            append_jsonl(self.freshness_path, alerts)

    def record_gap_repair(self, payload: dict) -> None:
        append_jsonl(self.gap_repair_path, [payload])

    def flush_validation_counts(self) -> None:
        rows = []
        emitted_at = utcnow_iso()
        for dataset, counts in sorted(self.validation_counts.items()):
            rows.append(
                {
                    "run_id": self.run_id,
                    "dataset": dataset,
                    "validated": counts["validated"],
                    "accepted": counts["accepted"],
                    "rejected": counts["rejected"],
                    "emitted_at": emitted_at,
                }
            )
        if rows:
            append_jsonl(self.validation_path, rows)

