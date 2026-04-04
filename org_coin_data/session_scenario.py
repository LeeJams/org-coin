from __future__ import annotations

from bisect import bisect_right
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from .eligibility import DEFAULT_ENTRY_PROFILE, EntryMetrics, evaluate_entry_metrics, get_entry_profile
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
EXIT_REASON_STOP_LOSS = "EXIT_STOP_LOSS"
EXIT_REASON_TAKE_PROFIT = "EXIT_TAKE_PROFIT"
EXIT_REASON_TIME_STOP = "EXIT_TIME_STOP_15M"
EXIT_REASON_RET_1M_NEG = "EXIT_RET_1M_NEG"
EXIT_REASON_BOOK_FAIL = "EXIT_BOOK_IMBALANCE_FAIL"
SUPPRESS_DATA_STALE = "SUPPRESS_DATA_STALE"
SUPPRESS_WEAK_CONFLUENCE = "SUPPRESS_WEAK_CONFLUENCE"

MAX_SIGNAL_AGE_MS = 15_000
HIGH_CONFIDENCE = 0.82
MEDIUM_CONFIDENCE = 0.68
EXIT_CONFIDENCE = 0.9
AGGRESSIVE_NOTIONAL_FRACTION = 0.95
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


def _load_enriched_points(base_dir: Path, run_id: str) -> list[EnrichedPoint]:
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

    points: list[EnrichedPoint] = []
    for market, features in sorted(feature_records.items()):
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

        for feature in features:
            anchor_timestamp_ms = int(feature["event_timestamp_ms"])
            feature_key = (str(feature.get("capture_id")), anchor_timestamp_ms)
            orderbook = orderbooks.get(feature_key)
            levels = level_map.get(feature_key)
            latest_trade = _latest_trade(trades, trade_timestamps, anchor_timestamp_ms)
            if orderbook is None or not levels or latest_trade is None:
                continue

            reference_price_1m = _reference_price(
                minute_timestamps,
                minute_close_prices,
                anchor_timestamp_ms,
                60_000,
            )
            latest_trade_price = float(latest_trade["price"])
            ret_1m_bps = None
            if reference_price_1m and reference_price_1m > 0:
                ret_1m_bps = round(((latest_trade_price / reference_price_1m) - 1) * 10_000, 6)

            snapshot = {
                "market": market,
                "asOf": iso_from_timestamp_ms(anchor_timestamp_ms),
                "lastTradePrice": latest_trade_price,
                "bestBidPrice": float(orderbook["best_bid_price"]),
                "bestAskPrice": float(orderbook["best_ask_price"]),
                "bestBidSize": float(levels[0]["bid_size"]),
                "bestAskSize": float(levels[0]["ask_size"]),
                "spreadBps": float(feature["spread_bps"]),
                "depthRatio": float(feature["depth_ratio_l5"]),
                "rolling24hNotional": float(feature["turnover_24h_krw"]),
            }
            if (
                snapshot["bestBidPrice"] <= 0
                or snapshot["bestAskPrice"] <= 0
                or snapshot["bestBidSize"] <= 0
                or snapshot["bestAskSize"] <= 0
                or snapshot["lastTradePrice"] <= 0
            ):
                continue
            points.append(
                EnrichedPoint(
                    market=market,
                    event_timestamp_ms=anchor_timestamp_ms,
                    snapshot=snapshot,
                    ret_5m_bps=float(feature["ret_5m_bps"]),
                    ret_1m_bps=ret_1m_bps,
                    buy_notional_share_60s=float(feature["buy_notional_share_60s"]),
                    depth_ratio_l5=float(feature["depth_ratio_l5"]),
                    spread_bps=float(feature["spread_bps"]),
                    turnover_24h_krw=float(feature["turnover_24h_krw"]),
                    window_coverage_sec=float(feature["window_coverage_sec"]),
                )
            )
    return sorted(points, key=lambda point: (point.event_timestamp_ms, point.market))


def _entry_tier(point: EnrichedPoint, *, profile: str) -> tuple[str | None, str | None]:
    decision = evaluate_entry_metrics(
        EntryMetrics(
            ret_5m_bps=point.ret_5m_bps,
            buy_notional_share_60s=point.buy_notional_share_60s,
            depth_ratio_l5=point.depth_ratio_l5,
            spread_bps=point.spread_bps,
            turnover_24h_krw=point.turnover_24h_krw,
            window_coverage_sec=point.window_coverage_sec,
        ),
        profile=profile,
    )
    return decision.tier, decision.suppression_reason


def _entry_score(point: EnrichedPoint, tier: str) -> tuple[int, float, float, float, float]:
    return (
        2 if tier == "high" else 1,
        point.ret_5m_bps,
        point.buy_notional_share_60s,
        point.depth_ratio_l5,
        -point.spread_bps,
    )


def _signal_metadata(point: EnrichedPoint, run_id: str) -> dict:
    return {
        "sourceRunId": run_id,
        "market": point.market,
        "asOf": point.snapshot["asOf"],
        "featureSnapshot": {
            "ret_5m_bps": point.ret_5m_bps,
            "ret_1m_bps": point.ret_1m_bps,
            "buy_notional_share_60s": point.buy_notional_share_60s,
            "depth_ratio_l5": point.depth_ratio_l5,
            "spread_bps": point.spread_bps,
            "turnover_24h_krw": point.turnover_24h_krw,
            "window_coverage_sec": point.window_coverage_sec,
        },
    }


def build_session_scenario(
    base_dir: Path,
    run_id: str,
    *,
    initial_cash_krw: float = 1_000_000,
    profile: str = DEFAULT_ENTRY_PROFILE,
) -> tuple[Path, dict]:
    base_dir = Path(base_dir)
    entry_profile = get_entry_profile(profile)
    points = _load_enriched_points(base_dir, run_id)
    if not points:
        raise ValueError(f"no enriched market points found for run {run_id}")

    events: list[dict] = []
    points_by_timestamp: dict[int, list[EnrichedPoint]] = defaultdict(list)
    for point in points:
        points_by_timestamp[point.event_timestamp_ms].append(point)

    position: PositionState | None = None
    cash_available = float(initial_cash_krw)
    latest_snapshot_by_market: dict[str, dict] = {}
    entry_signal_count = 0
    exit_signal_count = 0
    suppressions: dict[str, int] = defaultdict(int)
    markets_traded: set[str] = set()

    for event_timestamp_ms in sorted(points_by_timestamp):
        bucket = sorted(points_by_timestamp[event_timestamp_ms], key=lambda point: point.market)
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
                pnl_pct = ((current_bid / position.entry_price) - 1) * 100
                holding_ms = event_timestamp_ms - position.entered_at_ms
                exit_reason = None
                if pnl_pct <= -0.80:
                    exit_reason = EXIT_REASON_STOP_LOSS
                elif pnl_pct >= 1.20:
                    exit_reason = EXIT_REASON_TAKE_PROFIT
                elif holding_ms >= 900_000:
                    exit_reason = EXIT_REASON_TIME_STOP
                elif current_point.ret_1m_bps is not None and current_point.ret_1m_bps < 0:
                    exit_reason = EXIT_REASON_RET_1M_NEG
                elif current_point.depth_ratio_l5 < 0.90:
                    exit_reason = EXIT_REASON_BOOK_FAIL

                if exit_reason is not None:
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
                                "reasonCodes": [exit_reason],
                                "reduceOnly": True,
                                "metadata": {
                                    "sourceRunId": run_id,
                                    "synthetic": False,
                                    **_signal_metadata(current_point, run_id),
                                },
                            },
                        }
                    )
                    cash_available += position.quantity * current_bid
                    position = None
                    exit_signal_count += 1

        if position is None:
            best_candidate: tuple[tuple[int, float, float, float, float], str, EnrichedPoint] | None = None
            for point in bucket:
                tier, suppression = _entry_tier(point, profile=profile)
                if tier is None:
                    if suppression is not None:
                        suppressions[suppression] += 1
                    continue
                candidate = (_entry_score(point, tier), tier, point)
                if best_candidate is None or candidate[0] > best_candidate[0]:
                    best_candidate = candidate

            if best_candidate is not None:
                _, tier, point = best_candidate
                requested_quote_notional = round(cash_available * AGGRESSIVE_NOTIONAL_FRACTION, 3)
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
                    )
                    cash_available -= requested_quote_notional
                    entry_signal_count += 1
                    markets_traded.add(point.market)

    if position is not None:
        latest_snapshot = latest_snapshot_by_market[position.market]
        synthetic_timestamp_ms = max(
            points[-1].event_timestamp_ms + 1_000,
            position.entered_at_ms + 901_000,
        )
        synthetic_snapshot = {
            **latest_snapshot,
            "asOf": iso_from_timestamp_ms(synthetic_timestamp_ms),
        }
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
                    },
                },
            }
        )
        exit_signal_count += 1

    reconcile_at = events[-1]["signal"]["generatedAt"] if events[-1]["type"] == "signal" else events[-1]["snapshot"]["asOf"]
    scenario = {
        "schemaVersion": "1.0.0",
        "clockAt": points[0].snapshot["asOf"],
        "reconcileAt": reconcile_at,
        "initialPortfolio": {
            "cashAvailable": float(initial_cash_krw),
            "dailyRealizedPnl": 0,
            "positions": {},
        },
        "metadata": {
            "generatedAt": utcnow_iso(),
            "sourceRunId": run_id,
            "strategyId": entry_profile.strategy_id,
            "modeIntent": "dry_run",
            "initialCashKrw": float(initial_cash_krw),
            "aggressiveNotionalFraction": AGGRESSIVE_NOTIONAL_FRACTION,
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
                "syntheticCloseCount": 1 if position is not None else 0,
                "marketsTraded": sorted(markets_traded),
                "suppressedByReason": dict(sorted(suppressions.items())),
            },
        },
        "events": events,
    }
    output_path = replay_session_scenario_path(base_dir, run_id, profile=profile)
    write_json(output_path, scenario)
    return output_path, scenario["metadata"]["summary"]
