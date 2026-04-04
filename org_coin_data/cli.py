from __future__ import annotations

import argparse
from pathlib import Path

from .config import (
    DEFAULT_CANDLE_COUNT,
    DEFAULT_DATA_DIR,
    DEFAULT_FRESHNESS_SLA_MS,
    DEFAULT_TRADE_COUNT,
    DEFAULT_TRADE_WARMUP_SECONDS,
    DEFAULT_WS_SECONDS,
    parse_markets,
)
from .observability import Observability
from .passive_features import build_passive_feature_report
from .pipeline import (
    build_quality_report,
    build_replay_manifest,
    build_run_replay_manifest,
    repair_gap,
    run_bootstrap_session,
)
from .preflight import build_preflight_report
from .session_scenario import build_session_scenario
from .utils import new_capture_id

ENTRY_PROFILE_CHOICES = ["v1", "exploratory_smoke"]


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
    bootstrap.add_argument(
        "--trade-warmup-seconds",
        type=int,
        default=DEFAULT_TRADE_WARMUP_SECONDS,
        help="preload websocket trades before the first REST snapshot",
    )
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

    passive_features = subparsers.add_parser(
        "build-passive-feature-report",
        help="build the derived passive-feature dataset and distribution report",
    )
    passive_features.add_argument("--base-dir", type=Path, default=DEFAULT_DATA_DIR)
    passive_features.add_argument("--run-id", required=True)

    preflight = subparsers.add_parser(
        "build-preflight-report",
        help="build the eligibility and freshness gate summary from passive features",
    )
    preflight.add_argument("--base-dir", type=Path, default=DEFAULT_DATA_DIR)
    preflight.add_argument("--run-id", required=True)
    preflight.add_argument("--profile", choices=ENTRY_PROFILE_CHOICES, default="v1")

    session_scenario = subparsers.add_parser(
        "build-session-scenario",
        help="build a replayable dry_run/paper session scenario from one run",
    )
    session_scenario.add_argument("--base-dir", type=Path, default=DEFAULT_DATA_DIR)
    session_scenario.add_argument("--run-id", required=True)
    session_scenario.add_argument("--initial-cash-krw", type=float, default=1_000_000)
    session_scenario.add_argument("--profile", choices=ENTRY_PROFILE_CHOICES, default="v1")

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

    if args.command == "build-passive-feature-report":
        _, markdown_path = build_passive_feature_report(args.base_dir, args.run_id)
        print(markdown_path)
        return 0

    if args.command == "build-preflight-report":
        _, markdown_path = build_preflight_report(args.base_dir, args.run_id, profile=args.profile)
        print(markdown_path)
        return 0

    if args.command == "build-session-scenario":
        scenario_path, _ = build_session_scenario(
            args.base_dir,
            args.run_id,
            initial_cash_krw=args.initial_cash_krw,
            profile=args.profile,
        )
        print(scenario_path)
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
            args.trade_warmup_seconds,
        )
        print(result["manifest_path"])
        print(result["quality_markdown_path"])
        print(result["passive_feature_markdown_path"])
        print(result["preflight_markdown_path"])
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
