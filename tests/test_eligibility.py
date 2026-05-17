import unittest

from org_coin_data.eligibility import EntryMetrics, evaluate_entry_metrics


class EligibilityOverlayTest(unittest.TestCase):
    def test_btc_allows_small_window_coverage_jitter(self) -> None:
        decision = evaluate_entry_metrics(
            EntryMetrics(
                market="KRW-BTC",
                ret_5m_bps=18.0,
                ret_1m_bps=3.0,
                buy_notional_share_60s=0.80,
                depth_ratio_l5=1.40,
                spread_bps=2.0,
                turnover_24h_krw=40_000_000_000.0,
                window_coverage_sec=54.7,
            )
        )

        self.assertTrue(decision.is_eligible)
        self.assertEqual(decision.outcome, "eligible_medium")

    def test_btc_still_marks_materially_short_window_as_stale(self) -> None:
        decision = evaluate_entry_metrics(
            EntryMetrics(
                market="KRW-BTC",
                ret_5m_bps=18.0,
                ret_1m_bps=3.0,
                buy_notional_share_60s=0.80,
                depth_ratio_l5=1.40,
                spread_bps=2.0,
                turnover_24h_krw=40_000_000_000.0,
                window_coverage_sec=54.4,
            )
        )

        self.assertEqual(decision.outcome, "SUPPRESS_DATA_STALE")
        self.assertEqual(decision.base_gate_failures[0].field, "window_coverage_sec")

    def test_alt_overlay_requires_stronger_short_term_confirmation(self) -> None:
        decision = evaluate_entry_metrics(
            EntryMetrics(
                market="KRW-ETH",
                ret_5m_bps=18.0,
                ret_1m_bps=2.0,
                buy_notional_share_60s=0.80,
                depth_ratio_l5=1.40,
                spread_bps=3.0,
                turnover_24h_krw=40_000_000_000.0,
                window_coverage_sec=60.0,
            )
        )

        self.assertEqual(decision.outcome, "SUPPRESS_WEAK_CONFLUENCE")
        self.assertEqual(decision.base_gate_failures[0].field, "ret_1m_bps")

    def test_alt_overlay_allows_strong_eth_setup(self) -> None:
        decision = evaluate_entry_metrics(
            EntryMetrics(
                market="KRW-ETH",
                ret_5m_bps=20.0,
                ret_1m_bps=8.0,
                buy_notional_share_60s=0.82,
                depth_ratio_l5=1.40,
                spread_bps=5.0,
                turnover_24h_krw=40_000_000_000.0,
                window_coverage_sec=60.0,
            )
        )

        self.assertTrue(decision.is_eligible)
        self.assertEqual(decision.outcome, "eligible_medium")

    def test_btc_keeps_existing_behavior(self) -> None:
        decision = evaluate_entry_metrics(
            EntryMetrics(
                market="KRW-BTC",
                ret_5m_bps=18.0,
                ret_1m_bps=-2.0,
                buy_notional_share_60s=0.80,
                depth_ratio_l5=1.40,
                spread_bps=2.0,
                turnover_24h_krw=40_000_000_000.0,
                window_coverage_sec=60.0,
            )
        )

        self.assertTrue(decision.is_eligible)
        self.assertEqual(decision.outcome, "eligible_medium")

    def test_btc_trend_profile_ignores_microstructure_confluence_after_cost_hurdle(self) -> None:
        decision = evaluate_entry_metrics(
            EntryMetrics(
                market="KRW-BTC",
                ret_5m_bps=22.0,
                ret_1m_bps=-2.0,
                buy_notional_share_60s=0.42,
                depth_ratio_l5=0.90,
                spread_bps=2.0,
                turnover_24h_krw=40_000_000_000.0,
                window_coverage_sec=60.0,
            ),
            profile="btc_trend_v1",
        )

        self.assertTrue(decision.is_eligible)
        self.assertEqual(decision.outcome, "eligible_medium")

    def test_btc_trend_profile_aligns_depth_gate_with_runtime_liquidity_guard(self) -> None:
        decision = evaluate_entry_metrics(
            EntryMetrics(
                market="KRW-BTC",
                ret_5m_bps=22.0,
                ret_1m_bps=-2.0,
                buy_notional_share_60s=0.42,
                depth_ratio_l5=0.89,
                spread_bps=2.0,
                turnover_24h_krw=40_000_000_000.0,
                window_coverage_sec=60.0,
            ),
            profile="btc_trend_v1",
        )

        self.assertEqual(decision.outcome, "SUPPRESS_WEAK_CONFLUENCE")
        self.assertEqual(decision.base_gate_failures[0].field, "depth_ratio_l5")

    def test_btc_trend_profile_still_requires_cost_hurdle_and_btc_market(self) -> None:
        below_hurdle = evaluate_entry_metrics(
            EntryMetrics(
                market="KRW-BTC",
                ret_5m_bps=12.0,
                ret_1m_bps=4.0,
                buy_notional_share_60s=0.80,
                depth_ratio_l5=1.40,
                spread_bps=2.0,
                turnover_24h_krw=40_000_000_000.0,
                window_coverage_sec=60.0,
            ),
            profile="btc_trend_v1",
        )
        wrong_market = evaluate_entry_metrics(
            EntryMetrics(
                market="KRW-ETH",
                ret_5m_bps=22.0,
                ret_1m_bps=8.0,
                buy_notional_share_60s=0.80,
                depth_ratio_l5=1.40,
                spread_bps=2.0,
                turnover_24h_krw=40_000_000_000.0,
                window_coverage_sec=60.0,
            ),
            profile="btc_trend_v1",
        )

        self.assertEqual(below_hurdle.outcome, "SUPPRESS_WEAK_CONFLUENCE")
        self.assertEqual(below_hurdle.base_gate_failures[0].field, "ret_5m_bps")
        self.assertEqual(wrong_market.outcome, "SUPPRESS_WEAK_CONFLUENCE")
        self.assertEqual(wrong_market.base_gate_failures[0].field, "market_allowed")

    def test_btc_trend_low_buffer_profile_is_explicit_ret_hurdle_sensitivity(self) -> None:
        metrics = EntryMetrics(
            market="KRW-BTC",
            ret_5m_bps=13.0,
            ret_1m_bps=-2.0,
            buy_notional_share_60s=0.42,
            depth_ratio_l5=0.90,
            spread_bps=2.0,
            turnover_24h_krw=40_000_000_000.0,
            window_coverage_sec=60.0,
        )

        baseline = evaluate_entry_metrics(metrics, profile="btc_trend_v1")
        low_buffer = evaluate_entry_metrics(
            metrics,
            profile="btc_trend_low_buffer_v1",
        )

        self.assertEqual(baseline.outcome, "SUPPRESS_WEAK_CONFLUENCE")
        self.assertEqual(baseline.base_gate_failures[0].field, "ret_5m_bps")
        self.assertTrue(low_buffer.is_eligible)
        self.assertEqual(low_buffer.outcome, "eligible_medium")

    def test_btc_trend_flow_confirm_profile_reintroduces_buy_flow_gate(self) -> None:
        weak_flow = EntryMetrics(
            market="KRW-BTC",
            ret_5m_bps=22.0,
            ret_1m_bps=2.0,
            buy_notional_share_60s=0.62,
            depth_ratio_l5=1.10,
            spread_bps=2.0,
            turnover_24h_krw=40_000_000_000.0,
            window_coverage_sec=60.0,
        )
        strong_flow = EntryMetrics(
            **{
                **weak_flow.__dict__,
                "buy_notional_share_60s": 0.63,
            }
        )

        baseline = evaluate_entry_metrics(weak_flow, profile="btc_trend_v1")
        flow_confirm = evaluate_entry_metrics(
            weak_flow,
            profile="btc_trend_flow_confirm_v1",
        )
        strong_flow_confirm = evaluate_entry_metrics(
            strong_flow,
            profile="btc_trend_flow_confirm_v1",
        )

        self.assertTrue(baseline.is_eligible)
        self.assertEqual(flow_confirm.outcome, "SUPPRESS_WEAK_CONFLUENCE")
        self.assertEqual(flow_confirm.base_gate_failures[0].field, "buy_notional_share_60s")
        self.assertTrue(strong_flow_confirm.is_eligible)

    def test_btc_trend_ret1_confirm_profile_requires_short_term_follow_through(self) -> None:
        weak_ret1 = EntryMetrics(
            market="KRW-BTC",
            ret_5m_bps=22.0,
            ret_1m_bps=4.5,
            buy_notional_share_60s=0.80,
            depth_ratio_l5=1.10,
            spread_bps=2.0,
            turnover_24h_krw=40_000_000_000.0,
            window_coverage_sec=60.0,
        )
        strong_ret1 = EntryMetrics(
            **{
                **weak_ret1.__dict__,
                "ret_1m_bps": 4.6,
            }
        )

        baseline = evaluate_entry_metrics(weak_ret1, profile="btc_trend_v1")
        ret1_confirm = evaluate_entry_metrics(
            weak_ret1,
            profile="btc_trend_ret1_confirm_v1",
        )
        strong_ret1_confirm = evaluate_entry_metrics(
            strong_ret1,
            profile="btc_trend_ret1_confirm_v1",
        )

        self.assertTrue(baseline.is_eligible)
        self.assertEqual(ret1_confirm.outcome, "SUPPRESS_WEAK_CONFLUENCE")
        self.assertEqual(ret1_confirm.base_gate_failures[0].field, "ret_1m_bps")
        self.assertTrue(strong_ret1_confirm.is_eligible)

    def test_btc_trend_ret1_turnover_cap_profile_requires_ret1_and_turnover_cap(self) -> None:
        eligible = EntryMetrics(
            market="KRW-BTC",
            ret_5m_bps=22.0,
            ret_1m_bps=4.6,
            buy_notional_share_60s=0.80,
            depth_ratio_l5=1.10,
            spread_bps=2.0,
            turnover_24h_krw=90_000_000_000.0,
            window_coverage_sec=60.0,
        )
        high_turnover = EntryMetrics(
            **{
                **eligible.__dict__,
                "turnover_24h_krw": 90_000_000_001.0,
            }
        )
        weak_ret1 = EntryMetrics(
            **{
                **eligible.__dict__,
                "ret_1m_bps": 4.5,
            }
        )

        self.assertTrue(
            evaluate_entry_metrics(
                eligible,
                profile="btc_trend_ret1_turnover_cap_v1",
            ).is_eligible
        )

        turnover_cap = evaluate_entry_metrics(
            high_turnover,
            profile="btc_trend_ret1_turnover_cap_v1",
        )
        self.assertEqual(turnover_cap.outcome, "SUPPRESS_WEAK_CONFLUENCE")
        self.assertEqual(turnover_cap.base_gate_failures[0].field, "turnover_24h_krw")
        self.assertEqual(turnover_cap.base_gate_failures[0].comparator, "<=")

        ret1_confirm = evaluate_entry_metrics(
            weak_ret1,
            profile="btc_trend_ret1_turnover_cap_v1",
        )
        self.assertEqual(ret1_confirm.outcome, "SUPPRESS_WEAK_CONFLUENCE")
        self.assertEqual(ret1_confirm.base_gate_failures[0].field, "ret_1m_bps")

    def test_btc_trend_turnover_cap_replay_profile_changes_only_turnover_ceiling(self) -> None:
        weak_ret1 = EntryMetrics(
            market="KRW-BTC",
            ret_5m_bps=22.0,
            ret_1m_bps=0.0,
            buy_notional_share_60s=0.80,
            depth_ratio_l5=1.10,
            spread_bps=2.0,
            turnover_24h_krw=90_199_374_711.13681,
            window_coverage_sec=60.0,
        )
        high_turnover = EntryMetrics(
            **{
                **weak_ret1.__dict__,
                "turnover_24h_krw": 90_199_374_711.13683,
            }
        )

        self.assertTrue(
            evaluate_entry_metrics(
                weak_ret1,
                profile="btc_trend_turnover_cap_replay_v1",
            ).is_eligible
        )

        turnover_cap = evaluate_entry_metrics(
            high_turnover,
            profile="btc_trend_turnover_cap_replay_v1",
        )
        self.assertEqual(turnover_cap.outcome, "SUPPRESS_WEAK_CONFLUENCE")
        self.assertEqual(turnover_cap.base_gate_failures[0].field, "turnover_24h_krw")
        self.assertEqual(turnover_cap.base_gate_failures[0].comparator, "<=")

    def test_btc_trend_turnover_cap_path_replay_profile_uses_path_diagnostic_ceiling(self) -> None:
        at_cap = EntryMetrics(
            market="KRW-BTC",
            ret_5m_bps=22.0,
            ret_1m_bps=0.0,
            buy_notional_share_60s=0.80,
            depth_ratio_l5=1.10,
            spread_bps=2.0,
            turnover_24h_krw=63_092_167_042.41634,
            window_coverage_sec=60.0,
        )
        above_cap = EntryMetrics(
            **{
                **at_cap.__dict__,
                "turnover_24h_krw": 63_092_167_042.41635,
            }
        )

        self.assertTrue(
            evaluate_entry_metrics(
                at_cap,
                profile="btc_trend_turnover_cap_path_replay_v1",
            ).is_eligible
        )

        turnover_cap = evaluate_entry_metrics(
            above_cap,
            profile="btc_trend_turnover_cap_path_replay_v1",
        )
        self.assertEqual(turnover_cap.outcome, "SUPPRESS_WEAK_CONFLUENCE")
        self.assertEqual(turnover_cap.base_gate_failures[0].field, "turnover_24h_krw")
        self.assertEqual(turnover_cap.base_gate_failures[0].comparator, "<=")

    def test_btc_trend_strong_depth_replay_profile_requires_depth_threshold(self) -> None:
        weak_depth = EntryMetrics(
            market="KRW-BTC",
            ret_5m_bps=22.0,
            ret_1m_bps=0.0,
            buy_notional_share_60s=0.80,
            depth_ratio_l5=22.307691,
            spread_bps=2.0,
            turnover_24h_krw=40_000_000_000.0,
            window_coverage_sec=60.0,
        )
        strong_depth = EntryMetrics(
            **{
                **weak_depth.__dict__,
                "depth_ratio_l5": 22.307692,
            }
        )

        replay_profile = evaluate_entry_metrics(
            weak_depth,
            profile="btc_trend_strong_depth_replay_v1",
        )
        self.assertEqual(replay_profile.outcome, "SUPPRESS_WEAK_CONFLUENCE")
        self.assertEqual(replay_profile.base_gate_failures[0].field, "depth_ratio_l5")

        self.assertTrue(
            evaluate_entry_metrics(
                strong_depth,
                profile="btc_trend_strong_depth_replay_v1",
            ).is_eligible
        )

    def test_high_buy_flow_replay_profile_requires_legacy_flow_threshold(self) -> None:
        weak_flow = EntryMetrics(
            market="KRW-ETH",
            ret_5m_bps=25.0,
            ret_1m_bps=8.0,
            buy_notional_share_60s=0.944164,
            depth_ratio_l5=1.40,
            spread_bps=2.0,
            turnover_24h_krw=40_000_000_000.0,
            window_coverage_sec=60.0,
        )
        strong_flow = EntryMetrics(
            **{
                **weak_flow.__dict__,
                "buy_notional_share_60s": 0.944165,
            }
        )

        replay_profile = evaluate_entry_metrics(
            weak_flow,
            profile="high_buy_flow_replay_v1",
        )
        self.assertEqual(replay_profile.outcome, "SUPPRESS_WEAK_CONFLUENCE")
        self.assertEqual(replay_profile.base_gate_failures[0].field, "buy_notional_share_60s")

        self.assertTrue(
            evaluate_entry_metrics(
                strong_flow,
                profile="high_buy_flow_replay_v1",
            ).is_eligible
        )


if __name__ == "__main__":
    unittest.main()
