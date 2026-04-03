from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from .config import SUPPORTED_DATASETS


CONTRACTS_DIR = Path(__file__).resolve().parent.parent / "contracts"


def contract_path(dataset: str) -> Path:
    return CONTRACTS_DIR / f"{dataset}.schema.json"


@lru_cache(maxsize=None)
def load_schema(dataset: str) -> dict[str, Any]:
    if dataset not in SUPPORTED_DATASETS:
        raise KeyError(f"unsupported dataset: {dataset}")
    with contract_path(dataset).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _type_matches(expected: str, value: Any) -> bool:
    if expected == "string":
        return isinstance(value, str)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return (isinstance(value, int) or isinstance(value, float)) and not isinstance(
            value, bool
        )
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    return False


def validate_record(dataset: str, record: dict[str, Any]) -> list[str]:
    schema = load_schema(dataset)
    errors: list[str] = []
    for field in schema.get("required", []):
        if field not in record:
            errors.append(f"missing required field: {field}")
    for field_name, field_spec in schema.get("properties", {}).items():
        if field_name not in record:
            continue
        value = record[field_name]
        if "const" in field_spec and value != field_spec["const"]:
            errors.append(f"{field_name} must equal {field_spec['const']}")
        field_type = field_spec.get("type")
        if field_type and not _type_matches(field_type, value):
            errors.append(f"{field_name} must be {field_type}")
    return errors

