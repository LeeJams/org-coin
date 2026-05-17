from __future__ import annotations

from bisect import bisect_left, bisect_right
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from .eligibility import DEFAULT_ENTRY_PROFILE, EntryMetrics, evaluate_entry_metrics, get_entry_profile
from .exit_policy import (
    DEFAULT_EXIT_PROFILE,
    DEFAULT_SYNTHETIC_EXIT_POLICY,
    EXIT_REASON_TIME_STOP,
    ExitSignalContext,
    evaluate_exit,
    get_exit_profile,
    validate_synthetic_exit_policy,
)
from .passive_features import PASSIVE_FEATURE_DATASET
from .storage import list_canonical_files, read_jsonl, replay_session_scenario_path, write_json
from .utils import iso_from_timestamp_ms, utcnow_iso


ENTRY_REASON_CODES = [
    "ENTRY_RET_5M_POS",
    "ENTRY_FLOW_BUY_60S",
    "ENTRY_BOOK_IMBALANCE_L5",
    "ENTRY_SPREAD_OK",
    "ENTRY_TURNOVER_OK",
]
HIGH_TIER_REASON = "ENTRY_CONF_HIGH"
MEDIUM_TIER_REASON = "ENTRY_CONF_MEDIUM"
SUPPRESS_DATA_STALE = "SUPPRESS_DATA_STALE"
SUPPRESS_WEAK_CONFLUENCE = "SUPPRESS_WEAK_CONFLUENCE"

MAX_SIGNAL_AGE_MS = 15_000
HIGH_CONFIDENCE = 0.82
MEDIUM_CONFIDENCE = 0.68
EXIT_CONFIDENCE = 0.9
AGGRESSIVE_NOTIONAL_FRACTION = 0.50
LIVE_SINGLE_MARKET_NOTIONAL_FRACTION = 0.20
TOP_OF_BOOK_NOTIONAL_FRACTION = 1.50
DECISION_CADENCE_MS = 15_000
MIN_ENTRY_NOTIONAL_KRW = 50_000


@dataclass
class EnrichedPoint:
    market: str
    event_timestamp_ms: int
    snapshot: dict
    ret_5m_bps: float
    ret_1m_bps: float | None
    buy_notional_share_60s: float
    depth_ratio_l5: float
    spread_bps: float
    turnover_24h_krw: float
    window_coverage_sec: float


@dataclass
class PositionState:
    market: str
    entered_at_ms: int
    entry_price: float
    quantity: float
    quote_notional: float
    consecutive_negative_ret_1m: int = 0
    consecutive_book_failures: int = 0
    peak_bid_price: float = 0.0


def _build_synthetic_snapshot(
    latest_snapshot: dict,
    synthetic_timestamp_ms: int,
    *,
    synthetic_exit_policy: str,
) -> dict:
    synthetic_snapshot = {
        **latest_snapshot,
        "asOf": iso_from_timestamp_ms(synthetic_timestamp_ms),
    }
    if synthetic_exit_policy == "mark_mid":
        mark_price = (
            float(latest_snapshot["bestBidPrice"]) + float(latest_snapshot["bestAskPrice"])
        ) / 2
        synthetic_snapshot["bestBidPrice"] = mark_price
        synthetic_snapshot["bestAskPrice"] = mark_price
        synthetic_snapshot["lastTradePrice"] = mark_price
    return synthetic_snapshot


def _sorted_records(records: list[dict], field: str) -> list[dict]:
    return sorted(records, key=lambda record: int(record[field]))


def _load_run_records(
    base_dir: Path,
    dataset: str,
    run_id: str,
    *,
    timestamp_field: str,
    source: str | None = None,
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
        key: sorted(records, key=lambda record: int(record["level_index"]))
        for key, records in grouped.items()
    }


def _reference_price(
    minute_timestamps: list[int],
    minute_close_prices: list[float],
    anchor_timestamp_ms: int,
    offset_ms: int,
) -> float | None:
    reference_cutoff_ms = anchor_timestamp_ms - offset_ms
    reference_index = bisect_right(minute_timestamps, reference_cutoff_ms) - 1
    if reference_index < 0:
        return None
    return float(minute_close_prices[reference_index])


def _latest_trade(
    trades: list[dict], trade_timestamps: list[int], anchor_timestamp_ms: int
) -> dict | None:
    trade_index = bisect_right(trade_timestamps, anchor_timestamp_ms) - 1
    if trade_index < 0:
        return None
    return trades[trade_index]


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


def _window_coverage_seconds(anchor_timestamp_ms: int, window_trades: list[dict]) -> float:
    if not window_trades:
        return 0.0
    observed_start = max(anchor_timestamp_ms - 60_000, int(window_trades[0]["trade_timestamp_ms"]))
    observed_end = min(anchor_timestamp_ms, int(window_trades[-1]["trade_timestamp_ms"]))
    if observed_end <= observed_start:
        return 0.0
    return round((observed_end - observed_start) / 1000, 3)


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


def _build_enriched_point(
    market: str,
    anchor_timestamp_ms: int,
    *,
    trades: list[dict],
    trade_timestamps: list[int],
    minute_timestamps: list[int],
    minute_close_prices: list[float],
    orderbook: dict,
    levels: list[dict],
    feature: dict | None = None,
) -> EnrichedPoint | None:
    latest_trade = _latest_trade(trades, trade_timestamps, anchor_timestamp_ms)
    if orderbook is None or not levels or latest_trade is None:
        return None

    reference_price_1m = _reference_price(
        minute_timestamps,
        minute_close_prices,
        anchor_timestamp_ms,
        60_000,
    )
    reference_price_5m = _reference_price(
        minute_timestamps,
        minute_close_prices,
        anchor_timestamp_ms,
        300_000,
    )
    latest_trade_price = float(latest_trade["price"])
    ret_1m_bps = None
    if reference_price_1m and reference_price_1m > 0:
        ret_1m_bps = round(((latest_trade_price / reference_price_1m) - 1) * 10_000, 6)

    window_start_ms = anchor_timestamp_ms - 60_000
    trade_start = bisect_left(trade_timestamps, window_start_ms)
    trade_end = bisect_right(trade_timestamps, anchor_timestamp_ms)
    window_trades = trades[trade_start:trade_end]

    best_bid_price = float(orderbook["best_bid_price"])
    best_ask_price = float(orderbook["best_ask_price"])
    best_bid_size = float(levels[0]["bid_size"])
    best_ask_size = float(levels[0]["ask_size"])

    ret_5m_bps = 0.0
    if feature is not None:
        ret_5m_bps = float(feature["ret_5m_bps"])
    elif reference_price_5m and reference_price_5m > 0:
        ret_5m_bps = round(((latest_trade_price / reference_price_5m) - 1) * 10_000, 6)

    depth_ratio_l5 = (
        float(feature["depth_ratio_l5"])
        if feature is not None
        else _depth_ratio_l5(levels)
    )
    spread_bps = (
        float(feature["spread_bps"])
        if feature is not None
        else _spread_bps(best_bid_price, best_ask_price)
    )
    turnover_24h_krw = float(feature["turnover_24h_krw"]) if feature is not None else 0.0
    window_coverage_sec = (
        float(feature["window_coverage_sec"])
        if feature is not None
        else _window_coverage_seconds(anchor_timestamp_ms, window_trades)
    )

    snapshot = {
        "market": market,
        "asOf": iso_from_timestamp_ms(anchor_timestamp_ms),
        "lastTradePrice": latest_trade_price,
        "bestBidPrice": best_bid_price,
        "bestAskPrice": best_ask_price,
        "bestBidSize": best_bid_size,
        "bestAskSize": best_ask_size,
        "spreadBps": spread_bps,
        "depthRatio": depth_ratio_l5,
        "rolling24hNotional": turnover_24h_krw,
    }
    if (
        snapshot["bestBidPrice"] <= 0
        or snapshot["bestAskPrice"] <= 0
        or snapshot["bestBidSize"] <= 0
        or snapshot["bestAskSize"] <= 0
        or snapshot["lastTradePrice"] <= 0
        or snapshot["depthRatio"] <= 0
    ):
        return None

    return EnrichedPoint(
        market=market,
        event_timestamp_ms=anchor_timestamp_ms,
        snapshot=snapshot,
        ret_5m_bps=ret_5m_bps,
        ret_1m_bps=ret_1m_bps,
        buy_notional_share_60s=(
            _buy_notional_share(window_trades)[1]
            if feature is None
            else float(feature["buy_notional_share_60s"])
        ),
        depth_ratio_l5=depth_ratio_l5,
        spread_bps=spread_bps,
        turnover_24h_krw=turnover_24h_krw,
        window_coverage_sec=window_coverage_sec,
    )


def _load_enriched_points(
    base_dir: Path,
    run_id: str,
    *,
    required_markets: set[str] | None = None,
) -> list[EnrichedPoint]:
    feature_records = _load_run_records(
        base_dir,
        PASSIVE_FEATURE_DATASET,
        run_id,
        timestamp_field="event_timestamp_ms",
    )
    trade_records = _load_run_records(
        base_dir,
        "trade_tick",
        run_id,
        timestamp_field="trade_timestamp_ms",
    )
    orderbook_records = _load_run_records(
        base_dir,
        "orderbook_snapshot",
        run_id,
        timestamp_field="event_timestamp_ms",
    )
    orderbook_levels = _load_run_records(
        base_dir,
        "orderbook_level",
        run_id,
        timestamp_field="event_timestamp_ms",
    )

    points: list[EnrichedPoint] = []
    for market in sorted(set(feature_records) | set(required_markets or set())):
        features = feature_records.get(market, [])
        trades = trade_records.get(market, [])
        orderbooks = {
            (str(record.get("capture_id")), int(record["event_timestamp_ms"])): record
            for record in orderbook_records.get(market, [])
        }
        level_map = _group_orderbook_levels(orderbook_levels.get(market, []))
        if not trades or not orderbooks or not level_map:
            continue

        trade_timestamps = [int(record["trade_timestamp_ms"]) for record in trades]
        minute_timestamps, minute_close_prices = _build_minute_bars(trades)
        if not minute_timestamps:
            continue

        if features:
            for feature in features:
                anchor_timestamp_ms = int(feature["event_timestamp_ms"])
                feature_key = (str(feature.get("capture_id")), anchor_timestamp_ms)
                point = _build_enriched_point(
                    market,
                    anchor_timestamp_ms,
                    trades=trades,
                    trade_timestamps=trade_timestamps,
                    minute_timestamps=minute_timestamps,
                    minute_close_prices=minute_close_prices,
                    orderbook=orderbooks.get(feature_key),
                    levels=level_map.get(feature_key, []),
                    feature=feature,
                )
                if point is not None:
                    points.append(point)
            continue

        if market not in set(required_markets or set()):
            continue

        for feature_key, orderbook in sorted(orderbooks.items(), key=lambda item: item[0][1]):
            anchor_timestamp_ms = feature_key[1]
            point = _build_enriched_point(
                market,
                anchor_timestamp_ms,
                trades=trades,
                trade_timestamps=trade_timestamps,
                minute_timestamps=minute_timestamps,
                minute_close_prices=minute_close_prices,
                orderbook=orderbook,
                levels=level_map.get(feature_key, []),
                feature=None,
            )
            if point is not None:
                points.append(point)
    return sorted(points, key=lambda point: (point.event_timestamp_ms, point.market))


def _entry_decision(point: EnrichedPoint, *, profile: str):
    return evaluate_entry_metrics(
        EntryMetrics(
            ret_5m_bps=point.ret_5m_bps,
            buy_notional_share_60s=point.buy_notional_share_60s,
            depth_ratio_l5=point.depth_ratio_l5,
            spread_bps=point.spread_bps,
            turnover_24h_krw=point.turnover_24h_krw,
            window_coverage_sec=point.window_coverage_sec,
            market=point.market,
            ret_1m_bps=point.ret_1m_bps,
        ),
        profile=profile,
    )


def _entry_tier(point: EnrichedPoint, *, profile: str) -> tuple[str | None, str | None]:
    decision = _entry_decision(point, profile=profile)
    return decision.tier, decision.suppression_reason


def _gate_failure_deficit(failure) -> float:
    actual = float(failure.actual)
    threshold = float(failure.threshold)
    if failure.comparator in (">", ">="):
        return max(threshold - actual, 0.0)
    if failure.comparator == "<=":
        return max(actual - threshold, 0.0)
    if failure.comparator == "in":
        return max(threshold - actual, 0.0)
    return 0.0


def _gate_failure_near_miss(failure, deficit: float) -> bool:
    field = str(failure.field)
    threshold = abs(float(failure.threshold))
    if field == "window_coverage_sec":
        return deficit <= 5.0
    if field in ("ret_5m_bps", "spread_bps"):
        return deficit <= 5.0
    if field in ("depth_ratio_l5", "buy_notional_share_60s"):
        return deficit <= 0.10
    if threshold > 0:
        return deficit / threshold <= 0.10
    return deficit <= 1e-9


def _record_gate_failure_stat(stats: dict, failure) -> None:
    field_stats = stats[failure.field]
    field_stats["count"] += 1
    field_stats["actual_sum"] += float(failure.actual)
    field_stats["threshold_sum"] += float(failure.threshold)
    deficit = _gate_failure_deficit(failure)
    field_stats["deficit_sum"] += deficit
    field_stats["max_deficit"] = max(field_stats["max_deficit"], deficit)
    if _gate_failure_near_miss(failure, deficit):
        field_stats["near_miss_count"] = field_stats.get("near_miss_count", 0.0) + 1


def _summarize_gate_failure_stats(stats: dict) -> dict:
    summary = {}
    for field, field_stats in sorted(stats.items()):
        count = int(field_stats["count"])
        if count <= 0:
            continue
        summary[field] = {
            "count": count,
            "avgActual": round(field_stats["actual_sum"] / count, 6),
            "avgThreshold": round(field_stats["threshold_sum"] / count, 6),
            "avgDeficit": round(field_stats["deficit_sum"] / count, 6),
            "maxDeficit": round(field_stats["max_deficit"], 6),
            "nearMissCount": int(field_stats.get("near_miss_count", 0.0)),
            "nearMissRate": round(field_stats.get("near_miss_count", 0.0) / count, 6),
        }
    return summary


def _entry_score(point: EnrichedPoint, tier: str) -> tuple[int, float, float, float, float]:
    return (
        2 if tier == "high" else 1,
        point.ret_5m_bps,
        point.buy_notional_share_60s,
        point.depth_ratio_l5,
        -point.spread_bps,
    )


def _suppressed_entry_score(point: EnrichedPoint) -> tuple[float, float, float, float, float]:
    return (
        point.ret_5m_bps,
        point.buy_notional_share_60s,
        point.depth_ratio_l5,
        -point.spread_bps,
        point.turnover_24h_krw,
    )


def _feature_snapshot(point: EnrichedPoint) -> dict:
    return {
        "ret_5m_bps": point.ret_5m_bps,
        "ret_1m_bps": point.ret_1m_bps,
        "buy_notional_share_60s": point.buy_notional_share_60s,
        "depth_ratio_l5": point.depth_ratio_l5,
        "spread_bps": point.spread_bps,
        "turnover_24h_krw": point.turnover_24h_krw,
        "window_coverage_sec": point.window_coverage_sec,
    }


def _signal_metadata(point: EnrichedPoint, run_id: str) -> dict:
    return {
        "sourceRunId": run_id,
        "market": point.market,
        "asOf": point.snapshot["asOf"],
        "featureSnapshot": _feature_snapshot(point),
    }


def _gate_failure_payload(failure) -> dict:
    return {
        "field": failure.field,
        "comparator": failure.comparator,
        "actual": float(failure.actual),
        "threshold": float(failure.threshold),
    }


def _suppressed_entry_sample(
    *,
    point: EnrichedPoint,
    suppression_reason: str,
    base_gate_failures: tuple,
    requested_quote_notional: float,
) -> dict:
    return {
        "market": point.market,
        "asOf": point.snapshot["asOf"],
        "eventTimestampMs": point.event_timestamp_ms,
        "suppressionReason": suppression_reason,
        "requestedQuoteNotionalKrw": round(float(requested_quote_notional), 6),
        "bestAskPrice": float(point.snapshot["bestAskPrice"]),
        "bestBidPrice": float(point.snapshot["bestBidPrice"]),
        "lastTradePrice": float(point.snapshot.get("lastTradePrice", point.snapshot["bestBidPrice"])),
        "featureSnapshot": _feature_snapshot(point),
        "failingGates": [
            _gate_failure_payload(failure) for failure in base_gate_failures
        ],
    }


def _downsample_points(points: list[EnrichedPoint]) -> list[EnrichedPoint]:
    latest_by_market_bucket: dict[tuple[str, int], EnrichedPoint] = {}
    for point in points:
        bucket = point.event_timestamp_ms // DECISION_CADENCE_MS
        latest_by_market_bucket[(point.market, bucket)] = point
    return sorted(
        latest_by_market_bucket.values(),
        key=lambda point: (point.event_timestamp_ms, point.market),
    )


def _aggressive_notional_fraction(mode_intent: str) -> float:
    return (
        LIVE_SINGLE_MARKET_NOTIONAL_FRACTION
        if mode_intent == "live"
        else AGGRESSIVE_NOTIONAL_FRACTION
    )


def _requested_quote_notional(
    cash_available: float,
    point: EnrichedPoint,
    *,
    aggressive_notional_fraction: float,
) -> float:
    cash_limited = cash_available * aggressive_notional_fraction
    book_limited = (
        float(point.snapshot["bestAskPrice"])
        * float(point.snapshot["bestAskSize"])
        * TOP_OF_BOOK_NOTIONAL_FRACTION
    )
    return round(min(cash_limited, book_limited), 3)


def _normalize_initial_portfolio(
    initial_portfolio: dict | None,
    initial_cash_krw: float,
) -> dict:
    if initial_portfolio is None:
        return {
            "cashAvailable": float(initial_cash_krw),
            "dailyRealizedPnl": 0.0,
            "positions": {},
        }

    portfolio = initial_portfolio.get("portfolio", initial_portfolio)
    if not isinstance(portfolio, dict):
        raise ValueError("initial portfolio must be an object")

    cash_available = float(portfolio.get("cashAvailable", initial_cash_krw))
    daily_realized_pnl = float(portfolio.get("dailyRealizedPnl", 0.0))
    raw_positions = portfolio.get("positions", {})
    if not isinstance(raw_positions, dict):
        raise ValueError("initial portfolio positions must be an object keyed by market")

    normalized_positions: dict[str, dict] = {}
    for market_key, raw_position in raw_positions.items():
        if not isinstance(raw_position, dict):
            raise ValueError(f"initial portfolio position for {market_key} must be an object")
        market = raw_position.get("market", market_key)
        if not isinstance(market, str):
            raise ValueError("initial portfolio position market must be a string")
        normalized_positions[market_key] = {
            "market": market,
            "baseQuantity": float(raw_position.get("baseQuantity", 0.0)),
            "avgEntryPrice": float(raw_position.get("avgEntryPrice", 0.0)),
            "realizedPnl": float(raw_position.get("realizedPnl", 0.0)),
            "enteredAtMs": int(raw_position.get("enteredAtMs", 0) or 0),
            "quoteNotional": float(raw_position.get("quoteNotional", 0.0)),
            "consecutiveNegativeRet1m": int(
                raw_position.get("consecutiveNegativeRet1m", 0) or 0,
            ),
            "consecutiveBookFailures": int(
                raw_position.get("consecutiveBookFailures", 0) or 0,
            ),
            "peakBidPrice": float(raw_position.get("peakBidPrice", 0.0)),
        }

    return {
        "cashAvailable": cash_available,
        "dailyRealizedPnl": daily_realized_pnl,
        "positions": normalized_positions,
    }


def _load_initial_position(initial_state: dict | None, initial_portfolio: dict) -> PositionState | None:
    open_position_state = None
    if isinstance(initial_state, dict):
        open_position_state = initial_state.get("openPositionState")

    open_positions = [
        position
        for position in initial_portfolio["positions"].values()
        if abs(float(position["baseQuantity"])) > 1e-12
    ]
    if not open_positions:
        return None
    if len(open_positions) > 1:
        raise ValueError("carry-forward portfolio currently supports at most one open position")

    position = open_positions[0]
    quantity = float(position["baseQuantity"])
    entry_price = float(position["avgEntryPrice"])
    if isinstance(open_position_state, dict):
        return PositionState(
            market=str(open_position_state.get("market", position["market"])),
            entered_at_ms=int(open_position_state.get("enteredAtMs", 0) or 0),
            entry_price=float(open_position_state.get("entryPrice", entry_price)),
            quantity=float(open_position_state.get("quantity", quantity)),
            quote_notional=float(
                open_position_state.get("quoteNotional", quantity * entry_price),
            ),
            consecutive_negative_ret_1m=int(
                open_position_state.get("consecutiveNegativeRet1m", 0) or 0,
            ),
            consecutive_book_failures=int(
                open_position_state.get("consecutiveBookFailures", 0) or 0,
            ),
            peak_bid_price=float(open_position_state.get("peakBidPrice", entry_price)),
        )

    return PositionState(
        market=str(position["market"]),
        entered_at_ms=int(position.get("enteredAtMs", 0) or 0),
        entry_price=entry_price,
        quantity=quantity,
        quote_notional=float(position.get("quoteNotional", quantity * entry_price)),
        consecutive_negative_ret_1m=int(
            position.get("consecutiveNegativeRet1m", 0) or 0,
        ),
        consecutive_book_failures=int(position.get("consecutiveBookFailures", 0) or 0),
        peak_bid_price=float(position.get("peakBidPrice", entry_price)),
    )


def build_session_scenario(
    base_dir: Path,
    run_id: str,
    *,
    initial_cash_krw: float = 1_000_000,
    profile: str = DEFAULT_ENTRY_PROFILE,
    exit_profile: str = DEFAULT_EXIT_PROFILE,
    synthetic_exit_policy: str = DEFAULT_SYNTHETIC_EXIT_POLICY,
    initial_portfolio: dict | None = None,
    initial_equity_krw: float | None = None,
    mode_intent: str = "dry_run",
    output_path: Path | None = None,
) -> tuple[Path, dict]:
    base_dir = Path(base_dir)
    entry_profile = get_entry_profile(profile)
    exit_profile_spec = get_exit_profile(exit_profile)
    synthetic_exit_policy = validate_synthetic_exit_policy(synthetic_exit_policy)
    normalized_initial_portfolio = _normalize_initial_portfolio(
        initial_portfolio,
        initial_cash_krw,
    )
    position = _load_initial_position(initial_portfolio, normalized_initial_portfolio)
    points = _load_enriched_points(
        base_dir,
        run_id,
        required_markets={position.market} if position is not None else None,
    )
    points = _downsample_points(points)
    if not points:
        raise ValueError(f"no enriched market points found for run {run_id}")

    events: list[dict] = []
    points_by_timestamp: dict[int, list[EnrichedPoint]] = defaultdict(list)
    for point in points:
        points_by_timestamp[point.event_timestamp_ms].append(point)

    cash_available = float(normalized_initial_portfolio["cashAvailable"])
    aggressive_notional_fraction = _aggressive_notional_fraction(mode_intent)
    latest_snapshot_by_market: dict[str, dict] = {}
    entry_signal_count = 0
    exit_signal_count = 0
    entry_evaluation_bucket_count = 0
    entry_blocked_open_position_bucket_count = 0
    entry_blocked_after_exit_bucket_count = 0
    entry_below_min_notional_count = 0
    suppressions: dict[str, int] = defaultdict(int)
    suppressed_entry_samples: list[dict] = []
    suppressed_gate_failures: dict[str, int] = defaultdict(int)
    suppressed_gate_failure_combinations: dict[str, int] = defaultdict(int)
    suppressed_gate_failure_stats: dict[str, dict[str, float]] = defaultdict(
        lambda: {
            "count": 0.0,
            "actual_sum": 0.0,
            "threshold_sum": 0.0,
            "deficit_sum": 0.0,
            "max_deficit": 0.0,
        }
    )
    markets_traded: set[str] = set()

    for event_timestamp_ms in sorted(points_by_timestamp):
        bucket = sorted(points_by_timestamp[event_timestamp_ms], key=lambda point: point.market)
        exited_this_bucket = False
        entry_blocked_after_exit = False
        for point in bucket:
            events.append({"type": "snapshot", "snapshot": point.snapshot})
            latest_snapshot_by_market[point.market] = point.snapshot

        if position is not None:
            current_point = next(
                (point for point in bucket if point.market == position.market),
                None,
            )
            if current_point is not None:
                current_bid = float(current_point.snapshot["bestBidPrice"])
                holding_ms = (
                    0
                    if position.entered_at_ms <= 0
                    else event_timestamp_ms - position.entered_at_ms
                )
                position.peak_bid_price = max(position.peak_bid_price, current_bid)
                if (
                    exit_profile_spec.ret_1m_neg_bps is not None
                    and current_point.ret_1m_bps is not None
                    and current_point.ret_1m_bps <= exit_profile_spec.ret_1m_neg_bps
                ):
                    position.consecutive_negative_ret_1m += 1
                else:
                    position.consecutive_negative_ret_1m = 0
                if (
                    exit_profile_spec.book_fail_depth_ratio is not None
                    and current_point.depth_ratio_l5 <= exit_profile_spec.book_fail_depth_ratio
                ):
                    position.consecutive_book_failures += 1
                else:
                    position.consecutive_book_failures = 0

                exit_decision = evaluate_exit(
                    ExitSignalContext(
                        entry_price=position.entry_price,
                        current_bid_price=current_bid,
                        holding_ms=holding_ms,
                        ret_1m_bps=current_point.ret_1m_bps,
                        depth_ratio_l5=current_point.depth_ratio_l5,
                        consecutive_negative_ret_1m=position.consecutive_negative_ret_1m,
                        consecutive_book_failures=position.consecutive_book_failures,
                        peak_bid_price=position.peak_bid_price,
                        ret_5m_bps=current_point.ret_5m_bps,
                    ),
                    profile=exit_profile_spec,
                )

                if exit_decision is not None:
                    signal_timestamp = iso_from_timestamp_ms(event_timestamp_ms)
                    events.append(
                        {
                            "type": "signal",
                            "signal": {
                                "schemaVersion": "1.0.0",
                                "signalId": f"{run_id}-{position.market}-exit-{event_timestamp_ms}",
                                "strategyId": entry_profile.strategy_id,
                                "market": position.market,
                                "side": "sell",
                                "sizing": {
                                    "basis": "position_fraction",
                                    "value": 1,
                                },
                                "confidence": EXIT_CONFIDENCE,
                                "generatedAt": signal_timestamp,
                                "expiresAt": iso_from_timestamp_ms(event_timestamp_ms + MAX_SIGNAL_AGE_MS),
                                "maxSlippageBps": 8,
                                "reasonCodes": [exit_decision.reason_code],
                                "reduceOnly": True,
                                "metadata": {
                                    "sourceRunId": run_id,
                                    "synthetic": False,
                                    "exitProfile": exit_profile_spec.key,
                                    **_signal_metadata(current_point, run_id),
                                },
                            },
                        }
                    )
                    cash_available += position.quantity * current_bid
                    position = None
                    exit_signal_count += 1
                    exited_this_bucket = True
                    entry_blocked_after_exit = True

        if position is not None:
            entry_blocked_open_position_bucket_count += 1
            continue

        if exited_this_bucket or entry_blocked_after_exit:
            entry_blocked_after_exit_bucket_count += 1
            continue

        entry_evaluation_bucket_count += 1
        if position is None:
            best_candidate: tuple[tuple[int, float, float, float, float], str, EnrichedPoint] | None = None
            best_suppressed_candidate: (
                tuple[tuple[float, float, float, float, float], str, tuple, EnrichedPoint]
                | None
            ) = None
            for point in bucket:
                decision = _entry_decision(point, profile=profile)
                tier = decision.tier
                suppression = decision.suppression_reason
                if tier is None:
                    if suppression is not None:
                        suppressions[suppression] += 1
                        if decision.base_gate_failures:
                            failure_fields = sorted(
                                {failure.field for failure in decision.base_gate_failures}
                            )
                            suppressed_gate_failure_combinations[
                                "+".join(failure_fields)
                            ] += 1
                            for failure in decision.base_gate_failures:
                                suppressed_gate_failures[failure.field] += 1
                                _record_gate_failure_stat(
                                    suppressed_gate_failure_stats,
                                    failure,
                                )
                        else:
                            suppressed_gate_failures["tier_confluence"] += 1
                            suppressed_gate_failure_combinations["tier_confluence"] += 1
                        candidate = (
                            _suppressed_entry_score(point),
                            suppression,
                            decision.base_gate_failures,
                            point,
                        )
                        if (
                            best_suppressed_candidate is None
                            or candidate[0] > best_suppressed_candidate[0]
                        ):
                            best_suppressed_candidate = candidate
                    continue
                candidate = (_entry_score(point, tier), tier, point)
                if best_candidate is None or candidate[0] > best_candidate[0]:
                    best_candidate = candidate

            if best_candidate is not None:
                _, tier, point = best_candidate
                requested_quote_notional = _requested_quote_notional(
                    cash_available,
                    point,
                    aggressive_notional_fraction=aggressive_notional_fraction,
                )
                if requested_quote_notional >= MIN_ENTRY_NOTIONAL_KRW:
                    signal_timestamp = iso_from_timestamp_ms(event_timestamp_ms)
                    confidence = HIGH_CONFIDENCE if tier == "high" else MEDIUM_CONFIDENCE
                    events.append(
                        {
                            "type": "signal",
                            "signal": {
                                "schemaVersion": "1.0.0",
                                "signalId": f"{run_id}-{point.market}-entry-{event_timestamp_ms}",
                                "strategyId": entry_profile.strategy_id,
                                "market": point.market,
                                "side": "buy",
                                "sizing": {
                                    "basis": "quote_notional",
                                    "value": requested_quote_notional,
                                },
                                "confidence": confidence,
                                "generatedAt": signal_timestamp,
                                "expiresAt": iso_from_timestamp_ms(event_timestamp_ms + MAX_SIGNAL_AGE_MS),
                                "maxSlippageBps": 6,
                                "reasonCodes": [
                                    *ENTRY_REASON_CODES,
                                    HIGH_TIER_REASON if tier == "high" else MEDIUM_TIER_REASON,
                                ],
                                "metadata": {
                                    "sourceRunId": run_id,
                                    "confidenceTier": tier,
                                    **_signal_metadata(point, run_id),
                                },
                            },
                        }
                    )
                    entry_price = float(point.snapshot["bestAskPrice"])
                    quantity = requested_quote_notional / entry_price
                    position = PositionState(
                        market=point.market,
                        entered_at_ms=event_timestamp_ms,
                        entry_price=entry_price,
                        quantity=quantity,
                        quote_notional=requested_quote_notional,
                        peak_bid_price=float(point.snapshot["bestBidPrice"]),
                    )
                    cash_available -= requested_quote_notional
                    entry_signal_count += 1
                    markets_traded.add(point.market)
                else:
                    entry_below_min_notional_count += 1
            elif best_suppressed_candidate is not None:
                _, suppression, failures, point = best_suppressed_candidate
                requested_quote_notional = _requested_quote_notional(
                    cash_available,
                    point,
                    aggressive_notional_fraction=aggressive_notional_fraction,
                )
                suppressed_entry_samples.append(
                    _suppressed_entry_sample(
                        point=point,
                        suppression_reason=suppression,
                        base_gate_failures=failures,
                        requested_quote_notional=requested_quote_notional,
                    )
                )

    synthetic_close_count = 0
    if position is not None and synthetic_exit_policy != "carry_open":
        latest_snapshot = latest_snapshot_by_market[position.market]
        synthetic_timestamp_ms = max(
            points[-1].event_timestamp_ms + 1_000,
            position.entered_at_ms + exit_profile_spec.max_hold_ms + 1_000,
        )
        synthetic_snapshot = _build_synthetic_snapshot(
            latest_snapshot,
            synthetic_timestamp_ms,
            synthetic_exit_policy=synthetic_exit_policy,
        )
        events.append({"type": "snapshot", "snapshot": synthetic_snapshot})
        events.append(
            {
                "type": "signal",
                "signal": {
                                "schemaVersion": "1.0.0",
                                "signalId": f"{run_id}-{position.market}-synthetic-exit-{synthetic_timestamp_ms}",
                                "strategyId": entry_profile.strategy_id,
                                "market": position.market,
                                "side": "sell",
                    "sizing": {
                        "basis": "position_fraction",
                        "value": 1,
                    },
                    "confidence": EXIT_CONFIDENCE,
                    "generatedAt": iso_from_timestamp_ms(synthetic_timestamp_ms),
                    "expiresAt": iso_from_timestamp_ms(synthetic_timestamp_ms + MAX_SIGNAL_AGE_MS),
                    "maxSlippageBps": 8,
                    "reasonCodes": [EXIT_REASON_TIME_STOP],
                    "reduceOnly": True,
                    "metadata": {
                        "sourceRunId": run_id,
                        "synthetic": True,
                        "exitProfile": exit_profile_spec.key,
                        "syntheticExitPolicy": synthetic_exit_policy,
                    },
                },
            }
        )
        exit_signal_count += 1
        synthetic_close_count = 1

    open_position_state = None
    if position is not None and synthetic_exit_policy == "carry_open":
        open_position_state = {
            "market": position.market,
            "enteredAtMs": position.entered_at_ms,
            "entryPrice": position.entry_price,
            "quantity": position.quantity,
            "quoteNotional": position.quote_notional,
            "consecutiveNegativeRet1m": position.consecutive_negative_ret_1m,
            "consecutiveBookFailures": position.consecutive_book_failures,
            "peakBidPrice": position.peak_bid_price,
        }

    reconcile_at = events[-1]["signal"]["generatedAt"] if events[-1]["type"] == "signal" else events[-1]["snapshot"]["asOf"]
    scenario = {
        "schemaVersion": "1.0.0",
        "clockAt": points[0].snapshot["asOf"],
        "reconcileAt": reconcile_at,
        "initialPortfolio": normalized_initial_portfolio,
        "metadata": {
            "generatedAt": utcnow_iso(),
            "sourceRunId": run_id,
            "strategyId": entry_profile.strategy_id,
            "modeIntent": mode_intent,
            "initialCashKrw": float(initial_cash_krw),
            "initialEquityKrw": float(initial_equity_krw)
            if initial_equity_krw is not None
            else float(initial_cash_krw),
            "aggressiveNotionalFraction": aggressive_notional_fraction,
            "entryProfile": entry_profile.key,
            "exitProfile": exit_profile_spec.key,
            "syntheticExitPolicy": synthetic_exit_policy,
            "carryOpenPositions": synthetic_exit_policy == "carry_open",
            "openPositionState": open_position_state,
            "eligibilityNote": (
                "evaluation_scope="
                f"{entry_profile.evaluation_scope}; "
                "this replay approximates the eligibility table with the configured universe, "
                "coverage gate, and turnover gate because a daily eligibility artifact "
                "is not yet materialized in the repo."
            ),
            "summary": {
                "snapshotCount": sum(1 for event in events if event["type"] == "snapshot"),
                "signalCount": entry_signal_count + exit_signal_count,
                "entrySignalCount": entry_signal_count,
                "exitSignalCount": exit_signal_count,
                "entryEvaluationBucketCount": entry_evaluation_bucket_count,
                "entrySuppressedCandidateCount": sum(suppressions.values()),
                "entryBlockedOpenPositionBucketCount": entry_blocked_open_position_bucket_count,
                "entryBlockedAfterExitBucketCount": entry_blocked_after_exit_bucket_count,
                "entryBelowMinNotionalCount": entry_below_min_notional_count,
                "syntheticCloseCount": synthetic_close_count,
                "marketsTraded": sorted(markets_traded),
                "suppressedByReason": dict(sorted(suppressions.items())),
                "entrySuppressedByGateFailure": dict(sorted(suppressed_gate_failures.items())),
                "entrySuppressedGateFailureCombinations": dict(
                    sorted(suppressed_gate_failure_combinations.items())
                ),
                "entrySuppressedGateFailureStats": _summarize_gate_failure_stats(
                    suppressed_gate_failure_stats,
                ),
                "suppressedEntrySamples": suppressed_entry_samples,
            },
        },
        "events": events,
    }
    if output_path is None:
        output_path = replay_session_scenario_path(
            base_dir,
            run_id,
            profile=profile,
            exit_profile=exit_profile_spec.key,
            synthetic_exit_policy=synthetic_exit_policy,
        )
    else:
        output_path = Path(output_path)
    write_json(output_path, scenario)
    return output_path, scenario["metadata"]["summary"]
