from __future__ import annotations

from dataclasses import dataclass


SUPPRESS_DATA_STALE = "SUPPRESS_DATA_STALE"
SUPPRESS_WEAK_CONFLUENCE = "SUPPRESS_WEAK_CONFLUENCE"
DEFAULT_ENTRY_PROFILE = "v1"
EXPLORATORY_ENTRY_PROFILE = "exploratory_smoke"
BTC_TREND_ENTRY_PROFILE = "btc_trend_v1"
BTC_TREND_LOW_BUFFER_ENTRY_PROFILE = "btc_trend_low_buffer_v1"
BTC_TREND_FLOW_CONFIRM_ENTRY_PROFILE = "btc_trend_flow_confirm_v1"
BTC_TREND_RET1_CONFIRM_ENTRY_PROFILE = "btc_trend_ret1_confirm_v1"
BTC_TREND_RET1_TURNOVER_CAP_ENTRY_PROFILE = "btc_trend_ret1_turnover_cap_v1"
BTC_TREND_TURNOVER_CAP_REPLAY_ENTRY_PROFILE = "btc_trend_turnover_cap_replay_v1"
BTC_TREND_TURNOVER_CAP_PATH_REPLAY_ENTRY_PROFILE = (
    "btc_trend_turnover_cap_path_replay_v1"
)
BTC_TREND_STRONG_DEPTH_REPLAY_ENTRY_PROFILE = (
    "btc_trend_strong_depth_replay_v1"
)
HIGH_BUY_FLOW_REPLAY_ENTRY_PROFILE = "high_buy_flow_replay_v1"
ENTRY_WINDOW_COVERAGE_SEC = 55
EXPLORATORY_WINDOW_COVERAGE_SEC = 30
WINDOW_COVERAGE_JITTER_TOLERANCE_SEC = 0.5
ONE_WAY_FEE_BPS = 4.0
ENTRY_COST_BUFFER_BPS = 6.0
ENTRY_GATES = {
    "ret_5m_bps": 0.0,
    "buy_notional_share_60s": 0.55,
    "depth_ratio_l5": 1.20,
    "spread_bps": 8.0,
    "turnover_24h_krw": 30_000_000_000.0,
}
EXPLORATORY_ENTRY_GATES = {
    **ENTRY_GATES,
    "turnover_24h_krw": 20_000_000_000.0,
}
BTC_TREND_ENTRY_GATES = {
    "ret_5m_bps": 0.0,
    "buy_notional_share_60s": 0.0,
    "depth_ratio_l5": 0.9,
    "spread_bps": 8.0,
    "turnover_24h_krw": 30_000_000_000.0,
}
BTC_TREND_FLOW_CONFIRM_ENTRY_GATES = {
    **BTC_TREND_ENTRY_GATES,
    "buy_notional_share_60s": 0.63,
}
BTC_TREND_STRONG_DEPTH_REPLAY_ENTRY_GATES = {
    **BTC_TREND_ENTRY_GATES,
    "depth_ratio_l5": 22.307692,
}
HIGH_BUY_FLOW_REPLAY_ENTRY_GATES = {
    **ENTRY_GATES,
    "buy_notional_share_60s": 0.944165,
}
MEDIUM_TIER = {
    "ret_5m_bps": 10.0,
    "buy_notional_share_60s": 0.57,
    "depth_ratio_l5": 1.25,
    "spread_bps": 7.0,
}
HIGH_TIER = {
    "ret_5m_bps": 25.0,
    "buy_notional_share_60s": 0.60,
    "depth_ratio_l5": 1.35,
    "spread_bps": 5.0,
}
BTC_TREND_MEDIUM_TIER = {
    "ret_5m_bps": 0.0,
    "buy_notional_share_60s": 0.0,
    "depth_ratio_l5": 0.9,
    "spread_bps": 8.0,
}
BTC_TREND_HIGH_TIER = {
    "ret_5m_bps": 35.0,
    "buy_notional_share_60s": 0.0,
    "depth_ratio_l5": 1.0,
    "spread_bps": 5.0,
}


@dataclass(frozen=True)
class EntryMetrics:
    ret_5m_bps: float
    buy_notional_share_60s: float
    depth_ratio_l5: float
    spread_bps: float
    turnover_24h_krw: float
    window_coverage_sec: float
    market: str | None = None
    ret_1m_bps: float | None = None


@dataclass(frozen=True)
class EntryProfile:
    key: str
    strategy_id: str
    evaluation_scope: str
    window_coverage_sec: int
    entry_gates: dict[str, float]
    medium_tier: dict[str, float] | None = None
    high_tier: dict[str, float] | None = None
    allowed_markets: tuple[str, ...] | None = None
    entry_cost_buffer_bps: float = ENTRY_COST_BUFFER_BPS
    min_ret_1m_bps: float | None = None
    max_turnover_24h_krw: float | None = None


@dataclass(frozen=True)
class GateFailure:
    field: str
    comparator: str
    actual: float
    threshold: float


@dataclass(frozen=True)
class EligibilityDecision:
    tier: str | None
    suppression_reason: str | None
    base_gate_failures: tuple[GateFailure, ...]

    @property
    def is_eligible(self) -> bool:
        return self.tier is not None and self.suppression_reason is None

    @property
    def outcome(self) -> str:
        if self.tier == "high":
            return "eligible_high"
        if self.tier == "medium":
            return "eligible_medium"
        if self.suppression_reason:
            return self.suppression_reason
        return "suppressed"


@dataclass(frozen=True)
class MarketEntryOverlay:
    min_ret_1m_bps: float | None = None
    min_buy_notional_share_60s: float | None = None
    min_window_coverage_sec: float | None = None
    max_spread_bps: float | None = None


ENTRY_PROFILES = {
    DEFAULT_ENTRY_PROFILE: EntryProfile(
        key=DEFAULT_ENTRY_PROFILE,
        strategy_id="bithumb_v1_micro_momo",
        evaluation_scope="paper_v1",
        window_coverage_sec=ENTRY_WINDOW_COVERAGE_SEC,
        entry_gates=ENTRY_GATES,
    ),
    EXPLORATORY_ENTRY_PROFILE: EntryProfile(
        key=EXPLORATORY_ENTRY_PROFILE,
        strategy_id="bithumb_v1_exploratory_smoke",
        evaluation_scope=EXPLORATORY_ENTRY_PROFILE,
        window_coverage_sec=EXPLORATORY_WINDOW_COVERAGE_SEC,
        entry_gates=EXPLORATORY_ENTRY_GATES,
    ),
    BTC_TREND_ENTRY_PROFILE: EntryProfile(
        key=BTC_TREND_ENTRY_PROFILE,
        strategy_id="bithumb_btc_trend_v1",
        evaluation_scope=BTC_TREND_ENTRY_PROFILE,
        window_coverage_sec=ENTRY_WINDOW_COVERAGE_SEC,
        entry_gates=BTC_TREND_ENTRY_GATES,
        medium_tier=BTC_TREND_MEDIUM_TIER,
        high_tier=BTC_TREND_HIGH_TIER,
        allowed_markets=("KRW-BTC",),
    ),
    BTC_TREND_LOW_BUFFER_ENTRY_PROFILE: EntryProfile(
        key=BTC_TREND_LOW_BUFFER_ENTRY_PROFILE,
        strategy_id="bithumb_btc_trend_low_buffer_v1",
        evaluation_scope=BTC_TREND_LOW_BUFFER_ENTRY_PROFILE,
        window_coverage_sec=ENTRY_WINDOW_COVERAGE_SEC,
        entry_gates=BTC_TREND_ENTRY_GATES,
        medium_tier=BTC_TREND_MEDIUM_TIER,
        high_tier=BTC_TREND_HIGH_TIER,
        allowed_markets=("KRW-BTC",),
        entry_cost_buffer_bps=2.0,
    ),
    BTC_TREND_FLOW_CONFIRM_ENTRY_PROFILE: EntryProfile(
        key=BTC_TREND_FLOW_CONFIRM_ENTRY_PROFILE,
        strategy_id="bithumb_btc_trend_flow_confirm_v1",
        evaluation_scope=BTC_TREND_FLOW_CONFIRM_ENTRY_PROFILE,
        window_coverage_sec=ENTRY_WINDOW_COVERAGE_SEC,
        entry_gates=BTC_TREND_FLOW_CONFIRM_ENTRY_GATES,
        medium_tier=BTC_TREND_MEDIUM_TIER,
        high_tier=BTC_TREND_HIGH_TIER,
        allowed_markets=("KRW-BTC",),
    ),
    BTC_TREND_RET1_CONFIRM_ENTRY_PROFILE: EntryProfile(
        key=BTC_TREND_RET1_CONFIRM_ENTRY_PROFILE,
        strategy_id="bithumb_btc_trend_ret1_confirm_v1",
        evaluation_scope=BTC_TREND_RET1_CONFIRM_ENTRY_PROFILE,
        window_coverage_sec=ENTRY_WINDOW_COVERAGE_SEC,
        entry_gates=BTC_TREND_ENTRY_GATES,
        medium_tier=BTC_TREND_MEDIUM_TIER,
        high_tier=BTC_TREND_HIGH_TIER,
        allowed_markets=("KRW-BTC",),
        min_ret_1m_bps=4.6,
    ),
    BTC_TREND_RET1_TURNOVER_CAP_ENTRY_PROFILE: EntryProfile(
        key=BTC_TREND_RET1_TURNOVER_CAP_ENTRY_PROFILE,
        strategy_id="bithumb_btc_trend_ret1_turnover_cap_v1",
        evaluation_scope=BTC_TREND_RET1_TURNOVER_CAP_ENTRY_PROFILE,
        window_coverage_sec=ENTRY_WINDOW_COVERAGE_SEC,
        entry_gates=BTC_TREND_ENTRY_GATES,
        medium_tier=BTC_TREND_MEDIUM_TIER,
        high_tier=BTC_TREND_HIGH_TIER,
        allowed_markets=("KRW-BTC",),
        min_ret_1m_bps=4.6,
        max_turnover_24h_krw=90_000_000_000.0,
    ),
    BTC_TREND_TURNOVER_CAP_REPLAY_ENTRY_PROFILE: EntryProfile(
        key=BTC_TREND_TURNOVER_CAP_REPLAY_ENTRY_PROFILE,
        strategy_id="bithumb_btc_trend_turnover_cap_replay_v1",
        evaluation_scope=BTC_TREND_TURNOVER_CAP_REPLAY_ENTRY_PROFILE,
        window_coverage_sec=ENTRY_WINDOW_COVERAGE_SEC,
        entry_gates=BTC_TREND_ENTRY_GATES,
        medium_tier=BTC_TREND_MEDIUM_TIER,
        high_tier=BTC_TREND_HIGH_TIER,
        allowed_markets=("KRW-BTC",),
        max_turnover_24h_krw=90_199_374_711.13681,
    ),
    BTC_TREND_TURNOVER_CAP_PATH_REPLAY_ENTRY_PROFILE: EntryProfile(
        key=BTC_TREND_TURNOVER_CAP_PATH_REPLAY_ENTRY_PROFILE,
        strategy_id="bithumb_btc_trend_turnover_cap_path_replay_v1",
        evaluation_scope=BTC_TREND_TURNOVER_CAP_PATH_REPLAY_ENTRY_PROFILE,
        window_coverage_sec=ENTRY_WINDOW_COVERAGE_SEC,
        entry_gates=BTC_TREND_ENTRY_GATES,
        medium_tier=BTC_TREND_MEDIUM_TIER,
        high_tier=BTC_TREND_HIGH_TIER,
        allowed_markets=("KRW-BTC",),
        max_turnover_24h_krw=63_092_167_042.41634,
    ),
    BTC_TREND_STRONG_DEPTH_REPLAY_ENTRY_PROFILE: EntryProfile(
        key=BTC_TREND_STRONG_DEPTH_REPLAY_ENTRY_PROFILE,
        strategy_id="bithumb_btc_trend_strong_depth_replay_v1",
        evaluation_scope=BTC_TREND_STRONG_DEPTH_REPLAY_ENTRY_PROFILE,
        window_coverage_sec=ENTRY_WINDOW_COVERAGE_SEC,
        entry_gates=BTC_TREND_STRONG_DEPTH_REPLAY_ENTRY_GATES,
        medium_tier=BTC_TREND_MEDIUM_TIER,
        high_tier=BTC_TREND_HIGH_TIER,
        allowed_markets=("KRW-BTC",),
    ),
    HIGH_BUY_FLOW_REPLAY_ENTRY_PROFILE: EntryProfile(
        key=HIGH_BUY_FLOW_REPLAY_ENTRY_PROFILE,
        strategy_id="bithumb_high_buy_flow_replay_v1",
        evaluation_scope=HIGH_BUY_FLOW_REPLAY_ENTRY_PROFILE,
        window_coverage_sec=ENTRY_WINDOW_COVERAGE_SEC,
        entry_gates=HIGH_BUY_FLOW_REPLAY_ENTRY_GATES,
    ),
}

MARKET_ENTRY_OVERLAYS = {
    "KRW-ETH": MarketEntryOverlay(
        min_ret_1m_bps=5.0,
        min_buy_notional_share_60s=0.75,
        min_window_coverage_sec=56.0,
        max_spread_bps=5.5,
    ),
    "KRW-XRP": MarketEntryOverlay(
        min_ret_1m_bps=5.0,
        min_buy_notional_share_60s=0.75,
        min_window_coverage_sec=56.0,
        max_spread_bps=5.5,
    ),
}


def get_entry_profile(profile: str = DEFAULT_ENTRY_PROFILE) -> EntryProfile:
    try:
        return ENTRY_PROFILES[profile]
    except KeyError as error:
        raise ValueError(f"unknown entry profile: {profile}") from error


def required_ret_5m_bps(metrics: EntryMetrics, *, profile: str = DEFAULT_ENTRY_PROFILE) -> float:
    entry_profile = get_entry_profile(profile)
    explicit_floor = float(entry_profile.entry_gates["ret_5m_bps"])
    round_trip_hurdle_bps = (
        (2 * ONE_WAY_FEE_BPS)
        + metrics.spread_bps
        + entry_profile.entry_cost_buffer_bps
    )
    return max(explicit_floor, round_trip_hurdle_bps)


def _fails_window_coverage(actual: float, required: float) -> bool:
    return actual + WINDOW_COVERAGE_JITTER_TOLERANCE_SEC < required


def evaluate_entry_metrics(
    metrics: EntryMetrics,
    *,
    profile: str = DEFAULT_ENTRY_PROFILE,
) -> EligibilityDecision:
    entry_profile = get_entry_profile(profile)
    entry_gates = entry_profile.entry_gates
    required_ret_bps = required_ret_5m_bps(metrics, profile=profile)
    failures: list[GateFailure] = []
    if (
        entry_profile.allowed_markets is not None
        and metrics.market not in entry_profile.allowed_markets
    ):
        failures.append(
            GateFailure(
                field="market_allowed",
                comparator="in",
                actual=0.0,
                threshold=1.0,
            )
        )
    if _fails_window_coverage(metrics.window_coverage_sec, float(entry_profile.window_coverage_sec)):
        failures.append(
            GateFailure(
                field="window_coverage_sec",
                comparator=">=",
                actual=metrics.window_coverage_sec,
                threshold=float(entry_profile.window_coverage_sec),
            )
        )
    if metrics.ret_5m_bps <= required_ret_bps:
        failures.append(
            GateFailure(
                field="ret_5m_bps",
                comparator=">",
                actual=metrics.ret_5m_bps,
                threshold=required_ret_bps,
            )
        )
    if metrics.buy_notional_share_60s < entry_gates["buy_notional_share_60s"]:
        failures.append(
            GateFailure(
                field="buy_notional_share_60s",
                comparator=">=",
                actual=metrics.buy_notional_share_60s,
                threshold=entry_gates["buy_notional_share_60s"],
            )
        )
    if metrics.depth_ratio_l5 < entry_gates["depth_ratio_l5"]:
        failures.append(
            GateFailure(
                field="depth_ratio_l5",
                comparator=">=",
                actual=metrics.depth_ratio_l5,
                threshold=entry_gates["depth_ratio_l5"],
            )
        )
    if metrics.spread_bps > entry_gates["spread_bps"]:
        failures.append(
            GateFailure(
                field="spread_bps",
                comparator="<=",
                actual=metrics.spread_bps,
                threshold=entry_gates["spread_bps"],
            )
        )
    if metrics.turnover_24h_krw < entry_gates["turnover_24h_krw"]:
        failures.append(
            GateFailure(
                field="turnover_24h_krw",
                comparator=">=",
                actual=metrics.turnover_24h_krw,
                threshold=entry_gates["turnover_24h_krw"],
            )
        )
    if (
        entry_profile.max_turnover_24h_krw is not None
        and metrics.turnover_24h_krw > entry_profile.max_turnover_24h_krw
    ):
        failures.append(
            GateFailure(
                field="turnover_24h_krw",
                comparator="<=",
                actual=metrics.turnover_24h_krw,
                threshold=entry_profile.max_turnover_24h_krw,
            )
        )
    if entry_profile.min_ret_1m_bps is not None:
        actual_ret_1m_bps = float(metrics.ret_1m_bps or 0.0)
        if metrics.ret_1m_bps is None or actual_ret_1m_bps < entry_profile.min_ret_1m_bps:
            failures.append(
                GateFailure(
                    field="ret_1m_bps",
                    comparator=">=",
                    actual=actual_ret_1m_bps,
                    threshold=entry_profile.min_ret_1m_bps,
                )
            )
    overlay = MARKET_ENTRY_OVERLAYS.get(metrics.market or "")
    if overlay is not None:
        if overlay.min_ret_1m_bps is not None:
            actual_ret_1m_bps = float(metrics.ret_1m_bps or 0.0)
            if metrics.ret_1m_bps is None or actual_ret_1m_bps < overlay.min_ret_1m_bps:
                failures.append(
                    GateFailure(
                        field="ret_1m_bps",
                        comparator=">=",
                        actual=actual_ret_1m_bps,
                        threshold=overlay.min_ret_1m_bps,
                    )
                )
        if (
            overlay.min_buy_notional_share_60s is not None
            and metrics.buy_notional_share_60s < overlay.min_buy_notional_share_60s
        ):
            failures.append(
                GateFailure(
                    field="buy_notional_share_60s",
                    comparator=">=",
                    actual=metrics.buy_notional_share_60s,
                    threshold=overlay.min_buy_notional_share_60s,
                )
            )
        if (
            overlay.min_window_coverage_sec is not None
            and _fails_window_coverage(
                metrics.window_coverage_sec,
                float(overlay.min_window_coverage_sec),
            )
        ):
            failures.append(
                GateFailure(
                    field="window_coverage_sec",
                    comparator=">=",
                    actual=metrics.window_coverage_sec,
                    threshold=overlay.min_window_coverage_sec,
                )
            )
        if (
            overlay.max_spread_bps is not None
            and metrics.spread_bps > overlay.max_spread_bps
        ):
            failures.append(
                GateFailure(
                    field="spread_bps",
                    comparator="<=",
                    actual=metrics.spread_bps,
                    threshold=overlay.max_spread_bps,
                )
            )
    if failures:
        suppression_reason = (
            SUPPRESS_DATA_STALE
            if any(failure.field == "window_coverage_sec" for failure in failures)
            else SUPPRESS_WEAK_CONFLUENCE
        )
        return EligibilityDecision(
            tier=None,
            suppression_reason=suppression_reason,
            base_gate_failures=tuple(failures),
        )
    high_tier = entry_profile.high_tier or HIGH_TIER
    medium_tier = entry_profile.medium_tier or MEDIUM_TIER
    if (
        metrics.ret_5m_bps >= max(high_tier["ret_5m_bps"], required_ret_bps)
        and metrics.buy_notional_share_60s >= high_tier["buy_notional_share_60s"]
        and metrics.depth_ratio_l5 >= high_tier["depth_ratio_l5"]
        and metrics.spread_bps <= high_tier["spread_bps"]
    ):
        return EligibilityDecision(
            tier="high",
            suppression_reason=None,
            base_gate_failures=(),
        )
    if (
        metrics.ret_5m_bps >= max(medium_tier["ret_5m_bps"], required_ret_bps)
        and metrics.buy_notional_share_60s >= medium_tier["buy_notional_share_60s"]
        and metrics.depth_ratio_l5 >= medium_tier["depth_ratio_l5"]
        and metrics.spread_bps <= medium_tier["spread_bps"]
    ):
        return EligibilityDecision(
            tier="medium",
            suppression_reason=None,
            base_gate_failures=(),
        )
    return EligibilityDecision(
        tier=None,
        suppression_reason=SUPPRESS_WEAK_CONFLUENCE,
        base_gate_failures=(),
    )
