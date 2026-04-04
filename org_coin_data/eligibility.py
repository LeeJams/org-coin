from __future__ import annotations

from dataclasses import dataclass


SUPPRESS_DATA_STALE = "SUPPRESS_DATA_STALE"
SUPPRESS_WEAK_CONFLUENCE = "SUPPRESS_WEAK_CONFLUENCE"
DEFAULT_ENTRY_PROFILE = "v1"
EXPLORATORY_ENTRY_PROFILE = "exploratory_smoke"
ENTRY_WINDOW_COVERAGE_SEC = 55
EXPLORATORY_WINDOW_COVERAGE_SEC = 30
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


@dataclass(frozen=True)
class EntryMetrics:
    ret_5m_bps: float
    buy_notional_share_60s: float
    depth_ratio_l5: float
    spread_bps: float
    turnover_24h_krw: float
    window_coverage_sec: float


@dataclass(frozen=True)
class EntryProfile:
    key: str
    strategy_id: str
    evaluation_scope: str
    window_coverage_sec: int
    entry_gates: dict[str, float]


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
}


def get_entry_profile(profile: str = DEFAULT_ENTRY_PROFILE) -> EntryProfile:
    try:
        return ENTRY_PROFILES[profile]
    except KeyError as error:
        raise ValueError(f"unknown entry profile: {profile}") from error


def evaluate_entry_metrics(
    metrics: EntryMetrics,
    *,
    profile: str = DEFAULT_ENTRY_PROFILE,
) -> EligibilityDecision:
    entry_profile = get_entry_profile(profile)
    entry_gates = entry_profile.entry_gates
    failures: list[GateFailure] = []
    if metrics.window_coverage_sec < entry_profile.window_coverage_sec:
        failures.append(
            GateFailure(
                field="window_coverage_sec",
                comparator=">=",
                actual=metrics.window_coverage_sec,
                threshold=float(entry_profile.window_coverage_sec),
            )
        )
    if metrics.ret_5m_bps <= entry_gates["ret_5m_bps"]:
        failures.append(
            GateFailure(
                field="ret_5m_bps",
                comparator=">",
                actual=metrics.ret_5m_bps,
                threshold=entry_gates["ret_5m_bps"],
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
    if (
        metrics.ret_5m_bps >= HIGH_TIER["ret_5m_bps"]
        and metrics.buy_notional_share_60s >= HIGH_TIER["buy_notional_share_60s"]
        and metrics.depth_ratio_l5 >= HIGH_TIER["depth_ratio_l5"]
        and metrics.spread_bps <= HIGH_TIER["spread_bps"]
    ):
        return EligibilityDecision(
            tier="high",
            suppression_reason=None,
            base_gate_failures=(),
        )
    if (
        metrics.ret_5m_bps >= MEDIUM_TIER["ret_5m_bps"]
        and metrics.buy_notional_share_60s >= MEDIUM_TIER["buy_notional_share_60s"]
        and metrics.depth_ratio_l5 >= MEDIUM_TIER["depth_ratio_l5"]
        and metrics.spread_bps <= MEDIUM_TIER["spread_bps"]
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
