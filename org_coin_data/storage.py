from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from pathlib import Path
from typing import Iterable, Iterator

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


def write_text(path: Path, body: str) -> None:
    ensure_parent(path)
    path.write_text(body, encoding="utf-8")


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


def replay_quality_report_path(base_dir: Path, run_id: str, suffix: str) -> Path:
    return base_dir / "replay" / "reports" / f"quality-{run_id}.{suffix}"


def canonical_file_run_id(path: Path) -> str | None:
    if not path.name.startswith("part-") or path.suffix != ".ndjson":
        return None
    return path.stem.removeprefix("part-")


def partition_value_from_path(path: Path, key: str) -> str | None:
    prefix = f"{key}="
    for part in path.parts:
        if part.startswith(prefix):
            return part.removeprefix(prefix)
    return None


def read_jsonl(path: Path) -> Iterator[dict]:
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            yield json.loads(line)


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


def list_canonical_files(
    base_dir: Path,
    datasets: list[str] | None = None,
    source_run_id: str | None = None,
) -> dict[str, list[Path]]:
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
            if source_run_id and canonical_file_run_id(path) != source_run_id:
                continue
            grouped[dataset].append(path)
    return grouped
