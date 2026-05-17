import json
import tempfile
import unittest
from pathlib import Path

from org_coin_data.preflight import build_preflight_report
from org_coin_data.storage import append_jsonl, canonical_path


class PreflightReportTest(unittest.TestCase):
    def test_build_preflight_report_summarizes_gate_failures_and_latest_market_state(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            run_id = "run123"

            append_jsonl(
                canonical_path(
                    base_dir,
                    "passive_feature_snapshot",
                    "2026-04-04T06:30:57Z",
                    run_id,
                    market="KRW-BTC",
                ),
                [
                    {
                        "market": "KRW-BTC",
                        "event_timestamp_ms": 1775284257000,
                        "ret_5m_bps": 30.0,
                        "buy_notional_share_60s": 0.62,
                        "depth_ratio_l5": 1.4,
                        "spread_bps": 3.0,
                        "turnover_24h_krw": 40_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    },
                    {
                        "market": "KRW-BTC",
                        "event_timestamp_ms": 1775284317000,
                        "ret_5m_bps": 18.0,
                        "buy_notional_share_60s": 0.58,
                        "depth_ratio_l5": 1.3,
                        "spread_bps": 4.0,
                        "turnover_24h_krw": 41_000_000_000.0,
                        "window_coverage_sec": 40.0,
                    },
                ],
            )
            append_jsonl(
                canonical_path(
                    base_dir,
                    "passive_feature_snapshot",
                    "2026-04-04T06:31:57Z",
                    run_id,
                    market="KRW-ETH",
                ),
                [
                    {
                        "market": "KRW-ETH",
                        "event_timestamp_ms": 1775284377000,
                        "ret_5m_bps": 20.0,
                        "ret_1m_bps": 6.0,
                        "buy_notional_share_60s": 0.80,
                        "depth_ratio_l5": 1.28,
                        "spread_bps": 5.0,
                        "turnover_24h_krw": 39_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    }
                ],
            )
            append_jsonl(
                canonical_path(
                    base_dir,
                    "passive_feature_snapshot",
                    "2026-04-04T06:32:57Z",
                    run_id,
                    market="KRW-XRP",
                ),
                [
                    {
                        "market": "KRW-XRP",
                        "event_timestamp_ms": 1775284437000,
                        "ret_5m_bps": 5.0,
                        "buy_notional_share_60s": 0.70,
                        "depth_ratio_l5": 1.5,
                        "spread_bps": 4.5,
                        "turnover_24h_krw": 25_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    }
                ],
            )

            json_path, markdown_path = build_preflight_report(base_dir, run_id)
            report = json.loads(json_path.read_text(encoding="utf-8"))

            self.assertTrue(markdown_path.exists())
            self.assertEqual(report["market_count"], 3)
            self.assertEqual(report["snapshot_count"], 4)
            self.assertEqual(report["eligible_snapshot_count"], 2)
            self.assertEqual(report["latest_eligible_market_count"], 1)

            latest_by_market = {
                market["market"]: market["latest_snapshot"] for market in report["markets"]
            }
            self.assertEqual(latest_by_market["KRW-BTC"]["outcome"], "SUPPRESS_DATA_STALE")
            self.assertEqual(
                latest_by_market["KRW-BTC"]["failing_gates"][0]["field"],
                "window_coverage_sec",
            )
            self.assertEqual(latest_by_market["KRW-ETH"]["outcome"], "eligible_medium")
            self.assertEqual(latest_by_market["KRW-XRP"]["outcome"], "SUPPRESS_WEAK_CONFLUENCE")
            self.assertIn(
                "turnover_24h_krw",
                {failure["field"] for failure in latest_by_market["KRW-XRP"]["failing_gates"]},
            )

            gate_counts = {
                row["field"]: row["count"] for row in report["gate_failure_counts"]
            }
            self.assertEqual(gate_counts["window_coverage_sec"], 1)
            self.assertEqual(gate_counts["turnover_24h_krw"], 1)
            self.assertEqual(gate_counts["ret_5m_bps"], 2)

    def test_build_preflight_report_supports_exploratory_profile(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            run_id = "run-exploratory"

            append_jsonl(
                canonical_path(
                    base_dir,
                    "passive_feature_snapshot",
                    "2026-04-04T06:30:57Z",
                    run_id,
                    market="KRW-XRP",
                ),
                [
                    {
                        "market": "KRW-XRP",
                        "event_timestamp_ms": 1775284257000,
                        "ret_5m_bps": 20.0,
                        "ret_1m_bps": 8.0,
                        "buy_notional_share_60s": 0.80,
                        "depth_ratio_l5": 1.28,
                        "spread_bps": 5.0,
                        "turnover_24h_krw": 25_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    }
                ],
            )

            json_path, _ = build_preflight_report(
                base_dir,
                run_id,
                profile="exploratory_smoke",
            )
            report = json.loads(json_path.read_text(encoding="utf-8"))

            self.assertEqual(report["profile"], "exploratory_smoke")
            self.assertEqual(report["required_window_coverage_sec"], 30)
            self.assertEqual(report["required_turnover_24h_krw"], 20_000_000_000.0)
            latest = report["markets"][0]["latest_snapshot"]
            self.assertEqual(latest["outcome"], "eligible_medium")


if __name__ == "__main__":
    unittest.main()
