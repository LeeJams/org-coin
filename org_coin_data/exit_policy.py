from __future__ import annotations

from dataclasses import dataclass


DEFAULT_EXIT_PROFILE = "balanced_v1"
DEFAULT_SYNTHETIC_EXIT_POLICY = "carry_open"
EXIT_PROFILE_CHOICES = [
    "core_safe",
    "balanced_v1",
    "balanced_v1_book_confirm2",
    "balanced_v1_book_confirm3",
    "balanced_v1_book_confirm3_trend_hold",
    "balanced_v1_book_confirm3_trend_hold_guarded",
    "experimental_decay",
]
SYNTHETIC_EXIT_POLICY_CHOICES = [
    "force_bid",
    "mark_mid",
    "carry_open",
]

EXIT_REASON_STOP_LOSS = "EXIT_STOP_LOSS"
EXIT_REASON_TAKE_PROFIT = "EXIT_TAKE_PROFIT"
EXIT_REASON_TIME_STOP = "EXIT_TIME_STOP_15M"
EXIT_REASON_RET_1M_NEG = "EXIT_RET_1M_NEG"
EXIT_REASON_BOOK_FAIL = "EXIT_BOOK_IMBALANCE_FAIL"
MIN_RET_1M_EXIT_HOLD_MS = 60_000
MIN_BOOK_FAIL_EXIT_HOLD_MS = 120_000
MIN_PROFIT_PROTECT_PCT = 0.18
MAX_BOOK_FAIL_TREND_RET_5M_BPS = 0.0


@dataclass(frozen=True)
class ExitProfile:
    key: str
    stop_loss_pct: float
    take_profit_pct: float | None
    max_hold_ms: int
    ret_1m_neg_bps: float | None
    ret_1m_confirm_count: int
    book_fail_depth_ratio: float | None
    book_fail_confirm_count: int
    time_stop_requires_nonpositive_ret_5m: bool = False
    max_positive_trend_hold_ms: int | None = None


@dataclass(frozen=True)
class ExitDecision:
    reason_code: str


@dataclass(frozen=True)
class ExitSignalContext:
    entry_price: float
    current_bid_price: float
    holding_ms: int
    ret_1m_bps: float | None
    depth_ratio_l5: float
    consecutive_negative_ret_1m: int
    consecutive_book_failures: int
    peak_bid_price: float
    ret_5m_bps: float | None = None


EXIT_PROFILES = {
    "core_safe": ExitProfile(
        key="core_safe",
        stop_loss_pct=0.35,
        take_profit_pct=0.55,
        max_hold_ms=120_000,
        ret_1m_neg_bps=None,
        ret_1m_confirm_count=0,
        book_fail_depth_ratio=None,
        book_fail_confirm_count=0,
    ),
    "balanced_v1": ExitProfile(
        key="balanced_v1",
        stop_loss_pct=0.80,
        take_profit_pct=1.20,
        max_hold_ms=900_000,
        ret_1m_neg_bps=0.0,
        ret_1m_confirm_count=2,
        book_fail_depth_ratio=0.90,
        book_fail_confirm_count=1,
    ),
    "balanced_v1_book_confirm2": ExitProfile(
        key="balanced_v1_book_confirm2",
        stop_loss_pct=0.80,
        take_profit_pct=1.20,
        max_hold_ms=900_000,
        ret_1m_neg_bps=0.0,
        ret_1m_confirm_count=2,
        book_fail_depth_ratio=0.90,
        book_fail_confirm_count=2,
    ),
    "balanced_v1_book_confirm3": ExitProfile(
        key="balanced_v1_book_confirm3",
        stop_loss_pct=0.80,
        take_profit_pct=1.20,
        max_hold_ms=900_000,
        ret_1m_neg_bps=0.0,
        ret_1m_confirm_count=2,
        book_fail_depth_ratio=0.90,
        book_fail_confirm_count=3,
    ),
    "balanced_v1_book_confirm3_trend_hold": ExitProfile(
        key="balanced_v1_book_confirm3_trend_hold",
        stop_loss_pct=0.80,
        take_profit_pct=1.20,
        max_hold_ms=900_000,
        ret_1m_neg_bps=0.0,
        ret_1m_confirm_count=2,
        book_fail_depth_ratio=0.90,
        book_fail_confirm_count=3,
        time_stop_requires_nonpositive_ret_5m=True,
    ),
    "balanced_v1_book_confirm3_trend_hold_guarded": ExitProfile(
        key="balanced_v1_book_confirm3_trend_hold_guarded",
        stop_loss_pct=0.80,
        take_profit_pct=1.20,
        max_hold_ms=900_000,
        ret_1m_neg_bps=0.0,
        ret_1m_confirm_count=2,
        book_fail_depth_ratio=0.90,
        book_fail_confirm_count=3,
        time_stop_requires_nonpositive_ret_5m=True,
        max_positive_trend_hold_ms=1_800_000,
    ),
    "experimental_decay": ExitProfile(
        key="experimental_decay",
        stop_loss_pct=0.60,
        take_profit_pct=0.90,
        max_hold_ms=120_000,
        ret_1m_neg_bps=-2.0,
        ret_1m_confirm_count=1,
        book_fail_depth_ratio=0.95,
        book_fail_confirm_count=1,
    ),
}


def get_exit_profile(profile: str = DEFAULT_EXIT_PROFILE) -> ExitProfile:
    try:
        return EXIT_PROFILES[profile]
    except KeyError as error:
        raise ValueError(f"unknown exit profile: {profile}") from error


def validate_synthetic_exit_policy(policy: str = DEFAULT_SYNTHETIC_EXIT_POLICY) -> str:
    if policy not in SYNTHETIC_EXIT_POLICY_CHOICES:
        raise ValueError(f"unknown synthetic exit policy: {policy}")
    return policy


def evaluate_exit(context: ExitSignalContext, *, profile: ExitProfile) -> ExitDecision | None:
    pnl_pct = ((context.current_bid_price / context.entry_price) - 1) * 100
    peak_pnl_pct = ((context.peak_bid_price / context.entry_price) - 1) * 100
    if pnl_pct <= -profile.stop_loss_pct:
        return ExitDecision(reason_code=EXIT_REASON_STOP_LOSS)

    if profile.take_profit_pct is not None and pnl_pct >= profile.take_profit_pct:
        return ExitDecision(reason_code=EXIT_REASON_TAKE_PROFIT)

    if (
        profile.ret_1m_neg_bps is not None
        and context.holding_ms >= MIN_RET_1M_EXIT_HOLD_MS
        and peak_pnl_pct >= MIN_PROFIT_PROTECT_PCT
        and context.ret_1m_bps is not None
        and context.ret_1m_bps <= profile.ret_1m_neg_bps
        and context.consecutive_negative_ret_1m >= profile.ret_1m_confirm_count
    ):
        return ExitDecision(reason_code=EXIT_REASON_RET_1M_NEG)

    if (
        profile.book_fail_depth_ratio is not None
        and context.holding_ms >= MIN_BOOK_FAIL_EXIT_HOLD_MS
        and peak_pnl_pct >= MIN_PROFIT_PROTECT_PCT
        and pnl_pct > 0
        and (
            context.ret_5m_bps is None
            or context.ret_5m_bps <= MAX_BOOK_FAIL_TREND_RET_5M_BPS
        )
        and context.depth_ratio_l5 <= profile.book_fail_depth_ratio
        and context.consecutive_book_failures >= profile.book_fail_confirm_count
    ):
        return ExitDecision(reason_code=EXIT_REASON_BOOK_FAIL)

    if (
        context.holding_ms >= profile.max_hold_ms
        and (
            not profile.time_stop_requires_nonpositive_ret_5m
            or context.ret_5m_bps is None
            or context.ret_5m_bps <= 0
            or (
                profile.max_positive_trend_hold_ms is not None
                and context.holding_ms >= profile.max_positive_trend_hold_ms
            )
        )
    ):
        return ExitDecision(reason_code=EXIT_REASON_TIME_STOP)

    return None
