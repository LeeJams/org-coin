from __future__ import annotations

import argparse
from pathlib import Path

from .config import (
    DEFAULT_CANDLE_COUNT,
    DEFAULT_DATA_DIR,
    DEFAULT_FRESHNESS_SLA_MS,
    DEFAULT_TRADE_COUNT,
    DEFAULT_WS_SECONDS,
    parse_markets,
)
from .observability import Observability
from .pipeline import (
    build_quality_report,
    build_replay_manifest,
    build_run_replay_manifest,
    repair_gap,
    run_bootstrap_session,
)
from .utils import new_capture_id


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="org-coin paper data plane")
    subparsers = parser.add_subparsers(dest="command", required=True)

    def add_common(parser_: argparse.ArgumentParser) -> None:
        parser_.add_argument("--base-dir", type=Path, default=DEFAULT_DATA_DIR)
        parser_.add_argument("--markets", default=",".join(parse_markets(None)))
        parser_.add_argument("--freshness-sla-ms", type=int, default=DEFAULT_FRESHNESS_SLA_MS)

    bootstrap = subparsers.add_parser("bootstrap", help="run the full v1 paper-data bootstrap")
    add_common(bootstrap)
    bootstrap.add_argument("--candle-count", type=int, default=DEFAULT_CANDLE_COUNT)
    bootstrap.add_argument("--trade-count", type=int, default=DEFAULT_TRADE_COUNT)
    bootstrap.add_argument("--ws-seconds", type=int, default=DEFAULT_WS_SECONDS)
    bootstrap.add_argument("--iterations", type=int, default=1)
    bootstrap.add_argument("--interval-seconds", type=int, default=0)
    bootstrap.add_argument(
        "--ws-channels", default="ticker,trade,orderbook", help="comma-separated websocket channels"
    )

    manifest = subparsers.add_parser("build-manifest", help="build a replay manifest")
    manifest.add_argument("--base-dir", type=Path, default=DEFAULT_DATA_DIR)
    manifest.add_argument("--run-id")

    quality = subparsers.add_parser("build-quality-report", help="build a run quality report")
    quality.add_argument("--base-dir", type=Path, default=DEFAULT_DATA_DIR)
    quality.add_argument("--run-id", required=True)
    quality.add_argument("--freshness-sla-ms", type=int, default=DEFAULT_FRESHNESS_SLA_MS)

    repair = subparsers.add_parser("repair-gap", help="record a gap-repair attempt")
    add_common(repair)
    repair.add_argument("--dataset", required=True)
    repair.add_argument("--market", required=True)
    repair.add_argument("--start", required=True)
    repair.add_argument("--end", required=True)
    repair.add_argument("--count", type=int, default=DEFAULT_TRADE_COUNT)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "build-manifest":
        manifest_id = new_capture_id()
        if args.run_id:
            path = build_run_replay_manifest(args.base_dir, args.run_id)
        else:
            path = build_replay_manifest(args.base_dir, manifest_id)
        print(path)
        return 0

    if args.command == "build-quality-report":
        _, markdown_path = build_quality_report(args.base_dir, args.run_id, args.freshness_sla_ms)
        print(markdown_path)
        return 0

    if args.command == "bootstrap":
        channels = [item.strip() for item in args.ws_channels.split(",") if item.strip()]
        result = run_bootstrap_session(
            args.base_dir,
            parse_markets(args.markets),
            args.candle_count,
            args.trade_count,
            args.ws_seconds,
            channels,
            args.iterations,
            args.interval_seconds,
            args.freshness_sla_ms,
        )
        print(result["manifest_path"])
        print(result["quality_markdown_path"])
        return 0

    run_id = new_capture_id()
    markets = parse_markets(args.markets)
    obs = Observability(args.base_dir, run_id, args.freshness_sla_ms)

    if args.command == "repair-gap":
        result = repair_gap(
            args.base_dir,
            args.dataset,
            args.market,
            args.start,
            args.end,
            args.count,
            obs,
        )
        obs.flush_validation_counts()
        print(result["status"])
        return 0
    return 0
