from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from pathlib import Path
from typing import Iterable

from .utils import partition_date


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def append_jsonl(path: Path, records: Iterable[dict]) -> None:
    ensure_parent(path)
    with path.open("a", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=True, separators=(",", ":")))
            handle.write("\n")


def write_json(path: Path, payload: dict) -> None:
    ensure_parent(path)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=True, indent=2, sort_keys=True)
        handle.write("\n")


def raw_rest_path(base_dir: Path, dataset: str, captured_at: str, run_id: str) -> Path:
    date_value = partition_date(captured_at)
    return base_dir / "raw" / "rest" / dataset / f"date={date_value}" / f"run={run_id}.ndjson"


def raw_ws_path(
    base_dir: Path, channel: str, captured_at: str, market: str, run_id: str
) -> Path:
    date_value = partition_date(captured_at)
    return (
        base_dir
        / "raw"
        / "ws"
        / channel
        / f"date={date_value}"
        / f"market={market}"
        / f"run={run_id}.ndjson"
    )


def canonical_path(
    base_dir: Path,
    dataset: str,
    record_time: str,
    run_id: str,
    market: str | None = None,
) -> Path:
    date_value = partition_date(record_time)
    root = base_dir / "canonical" / dataset / f"date={date_value}"
    if market:
        root = root / f"market={market}"
    return root / f"part-{run_id}.ndjson"


def replay_manifest_path(base_dir: Path, run_id: str) -> Path:
    return base_dir / "replay" / "manifests" / f"manifest-{run_id}.json"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8192), b""):
            digest.update(chunk)
    return digest.hexdigest()


def summarize_jsonl(path: Path, timestamp_field: str | None) -> dict:
    record_count = 0
    min_timestamp = None
    max_timestamp = None
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            record = json.loads(line)
            record_count += 1
            timestamp = record.get(timestamp_field) if timestamp_field else None
            if isinstance(timestamp, int):
                min_timestamp = timestamp if min_timestamp is None else min(min_timestamp, timestamp)
                max_timestamp = timestamp if max_timestamp is None else max(max_timestamp, timestamp)
    return {
        "record_count": record_count,
        "min_timestamp": min_timestamp,
        "max_timestamp": max_timestamp,
        "sha256": sha256_file(path),
    }


def list_canonical_files(base_dir: Path, datasets: list[str] | None = None) -> dict[str, list[Path]]:
    grouped: dict[str, list[Path]] = defaultdict(list)
    canonical_root = base_dir / "canonical"
    if not canonical_root.exists():
        return grouped
    for dataset_dir in canonical_root.iterdir():
        if not dataset_dir.is_dir():
            continue
        dataset = dataset_dir.name
        if datasets and dataset not in datasets:
            continue
        for path in dataset_dir.rglob("*.ndjson"):
            grouped[dataset].append(path)
    return grouped
