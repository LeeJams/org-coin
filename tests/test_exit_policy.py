from __future__ import annotations

import unittest

from org_coin_data.exit_policy import (
    EXIT_REASON_BOOK_FAIL,
    EXIT_REASON_STOP_LOSS,
    EXIT_REASON_TAKE_PROFIT,
    EXIT_REASON_TIME_STOP,
    ExitSignalContext,
    evaluate_exit,
    get_exit_profile,
)


def _book_context(
    consecutive_book_failures: int,
    *,
    current_bid_price: float = 100_250_000.0,
    peak_bid_price: float = 100_300_000.0,
    ret_1m_bps: float | None = -1.0,
    ret_5m_bps: float | None = -2.0,
) -> ExitSignalContext:
    return ExitSignalContext(
        entry_price=100_000_000.0,
        current_bid_price=current_bid_price,
        holding_ms=180_000,
        ret_1m_bps=ret_1m_bps,
        depth_ratio_l5=0.85,
        consecutive_negative_ret_1m=0,
        consecutive_book_failures=consecutive_book_failures,
        peak_bid_price=peak_bid_price,
        ret_5m_bps=ret_5m_bps,
    )


def _time_stop_context(
    *,
    current_bid_price: float = 100_100_000.0,
    ret_5m_bps: float | None = 5.0,
    holding_ms: int = 901_000,
) -> ExitSignalContext:
    return ExitSignalContext(
        entry_price=100_000_000.0,
        current_bid_price=current_bid_price,
        holding_ms=holding_ms,
        ret_1m_bps=1.0,
        depth_ratio_l5=1.10,
        consecutive_negative_ret_1m=0,
        consecutive_book_failures=0,
        peak_bid_price=current_bid_price,
        ret_5m_bps=ret_5m_bps,
    )


class ExitPolicyTest(unittest.TestCase):
    def test_balanced_v1_exits_on_first_book_failure_only_after_profit_protection(self) -> None:
        decision = evaluate_exit(
            _book_context(consecutive_book_failures=1),
            profile=get_exit_profile("balanced_v1"),
        )

        self.assertIsNotNone(decision)
        self.assertEqual(decision.reason_code, EXIT_REASON_BOOK_FAIL)

    def test_trend_hold_profile_defers_time_stop_during_positive_five_minute_trend(self) -> None:
        decision = evaluate_exit(
            _time_stop_context(ret_5m_bps=5.0),
            profile=get_exit_profile("balanced_v1_book_confirm3_trend_hold"),
        )

        self.assertIsNone(decision)

    def test_trend_hold_profile_allows_time_stop_when_five_minute_trend_is_not_positive(self) -> None:
        profile = get_exit_profile("balanced_v1_book_confirm3_trend_hold")

        negative_trend_decision = evaluate_exit(
            _time_stop_context(ret_5m_bps=-1.0),
            profile=profile,
        )
        missing_trend_decision = evaluate_exit(
            _time_stop_context(ret_5m_bps=None),
            profile=profile,
        )

        self.assertIsNotNone(negative_trend_decision)
        self.assertEqual(negative_trend_decision.reason_code, EXIT_REASON_TIME_STOP)
        self.assertIsNotNone(missing_trend_decision)
        self.assertEqual(missing_trend_decision.reason_code, EXIT_REASON_TIME_STOP)

    def test_trend_hold_profile_keeps_stop_loss_and_take_profit_priority(self) -> None:
        profile = get_exit_profile("balanced_v1_book_confirm3_trend_hold")

        stop_loss_decision = evaluate_exit(
            _time_stop_context(current_bid_price=99_000_000.0, ret_5m_bps=5.0),
            profile=profile,
        )
        take_profit_decision = evaluate_exit(
            _time_stop_context(current_bid_price=101_300_000.0, ret_5m_bps=5.0),
            profile=profile,
        )

        self.assertIsNotNone(stop_loss_decision)
        self.assertEqual(stop_loss_decision.reason_code, EXIT_REASON_STOP_LOSS)
        self.assertIsNotNone(take_profit_decision)
        self.assertEqual(take_profit_decision.reason_code, EXIT_REASON_TAKE_PROFIT)

    def test_guarded_trend_hold_caps_positive_trend_extension(self) -> None:
        profile = get_exit_profile("balanced_v1_book_confirm3_trend_hold_guarded")

        deferred_decision = evaluate_exit(
            _time_stop_context(ret_5m_bps=5.0, holding_ms=1_200_000),
            profile=profile,
        )
        guarded_time_stop_decision = evaluate_exit(
            _time_stop_context(ret_5m_bps=5.0, holding_ms=1_800_000),
            profile=profile,
        )

        self.assertIsNone(deferred_decision)
        self.assertIsNotNone(guarded_time_stop_decision)
        self.assertEqual(guarded_time_stop_decision.reason_code, EXIT_REASON_TIME_STOP)

    def test_book_failure_does_not_exit_losing_position_without_stop_loss(self) -> None:
        decision = evaluate_exit(
            _book_context(
                consecutive_book_failures=1,
                current_bid_price=99_950_000.0,
                peak_bid_price=100_100_000.0,
                ret_5m_bps=-2.0,
            ),
            profile=get_exit_profile("balanced_v1"),
        )

        self.assertIsNone(decision)

    def test_book_failure_does_not_exit_during_positive_five_minute_trend(self) -> None:
        decision = evaluate_exit(
            _book_context(
                consecutive_book_failures=1,
                current_bid_price=100_250_000.0,
                peak_bid_price=100_300_000.0,
                ret_5m_bps=8.0,
            ),
            profile=get_exit_profile("balanced_v1"),
        )

        self.assertIsNone(decision)

    def test_stop_loss_still_takes_priority_over_book_demotion(self) -> None:
        decision = evaluate_exit(
            _book_context(
                consecutive_book_failures=1,
                current_bid_price=99_000_000.0,
                peak_bid_price=100_300_000.0,
                ret_5m_bps=8.0,
            ),
            profile=get_exit_profile("balanced_v1"),
        )

        self.assertIsNotNone(decision)
        self.assertEqual(decision.reason_code, EXIT_REASON_STOP_LOSS)

    def test_take_profit_still_takes_priority_over_book_demotion(self) -> None:
        decision = evaluate_exit(
            _book_context(
                consecutive_book_failures=1,
                current_bid_price=101_300_000.0,
                peak_bid_price=101_300_000.0,
                ret_5m_bps=8.0,
            ),
            profile=get_exit_profile("balanced_v1"),
        )

        self.assertIsNotNone(decision)
        self.assertEqual(decision.reason_code, EXIT_REASON_TAKE_PROFIT)

    def test_book_confirmed_profile_waits_for_second_book_failure(self) -> None:
        profile = get_exit_profile("balanced_v1_book_confirm2")

        self.assertIsNone(
            evaluate_exit(
                _book_context(consecutive_book_failures=1),
                profile=profile,
            )
        )
        decision = evaluate_exit(
            _book_context(consecutive_book_failures=2),
            profile=profile,
        )

        self.assertIsNotNone(decision)
        self.assertEqual(decision.reason_code, EXIT_REASON_BOOK_FAIL)

    def test_confirm3_profile_waits_for_third_book_failure(self) -> None:
        profile = get_exit_profile("balanced_v1_book_confirm3")

        self.assertIsNone(
            evaluate_exit(
                _book_context(consecutive_book_failures=2),
                profile=profile,
            )
        )
        decision = evaluate_exit(
            _book_context(consecutive_book_failures=3),
            profile=profile,
        )

        self.assertIsNotNone(decision)
        self.assertEqual(decision.reason_code, EXIT_REASON_BOOK_FAIL)


if __name__ == "__main__":
    unittest.main()
