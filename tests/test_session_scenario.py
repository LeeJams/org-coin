import json
import tempfile
import unittest
from pathlib import Path

from org_coin_data.session_scenario import build_session_scenario
from org_coin_data.storage import append_jsonl, canonical_path


def _write(path: Path, records: list[dict]) -> None:
    append_jsonl(path, records)


class SessionScenarioTest(unittest.TestCase):
    def test_build_session_scenario_materializes_entry_and_exit_signals(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            run_id = "run123"
            market = "KRW-BTC"

            entry_ts = 1_775_133_900_000
            exit_ts = 1_775_133_960_000

            _write(
                canonical_path(base_dir, "trade_tick", "2026-04-02T12:04:00Z", run_id, market=market),
                [
                    {"market": market, "trade_timestamp_ms": entry_ts - 60_000, "price": 100_000_000},
                    {"market": market, "trade_timestamp_ms": entry_ts, "price": 101_500_000},
                    {"market": market, "trade_timestamp_ms": exit_ts, "price": 101_000_000},
                ],
            )
            _write(
                canonical_path(
                    base_dir,
                    "orderbook_snapshot",
                    "2026-04-02T12:05:00Z",
                    run_id,
                    market=market,
                ),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": entry_ts,
                        "capture_id": "capture-entry",
                        "best_bid_price": 101_490_000,
                        "best_ask_price": 101_500_000,
                        "source": "bithumb_rest",
                    },
                    {
                        "market": market,
                        "event_timestamp_ms": exit_ts,
                        "capture_id": "capture-exit",
                        "best_bid_price": 101_000_000,
                        "best_ask_price": 101_010_000,
                        "source": "bithumb_rest",
                    },
                ],
            )
            _write(
                canonical_path(
                    base_dir,
                    "orderbook_level",
                    "2026-04-02T12:05:00Z",
                    run_id,
                    market=market,
                ),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": entry_ts,
                        "capture_id": "capture-entry",
                        "level_index": 0,
                        "bid_size": 1.5,
                        "ask_size": 1.0,
                        "source": "bithumb_rest",
                    },
                    {
                        "market": market,
                        "event_timestamp_ms": exit_ts,
                        "capture_id": "capture-exit",
                        "level_index": 0,
                        "bid_size": 0.8,
                        "ask_size": 1.0,
                        "source": "bithumb_rest",
                    },
                ],
            )
            _write(
                canonical_path(
                    base_dir,
                    "passive_feature_snapshot",
                    "2026-04-02T12:05:00Z",
                    run_id,
                    market=market,
                ),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": entry_ts,
                        "capture_id": "capture-entry",
                        "ret_5m_bps": 25.0,
                        "buy_notional_share_60s": 0.61,
                        "depth_ratio_l5": 1.4,
                        "spread_bps": 2.0,
                        "turnover_24h_krw": 40_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    },
                    {
                        "market": market,
                        "event_timestamp_ms": exit_ts,
                        "capture_id": "capture-exit",
                        "ret_5m_bps": 5.0,
                        "buy_notional_share_60s": 0.52,
                        "depth_ratio_l5": 0.85,
                        "spread_bps": 2.0,
                        "turnover_24h_krw": 40_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    },
                ],
            )

            scenario_path, summary = build_session_scenario(base_dir, run_id, initial_cash_krw=1_000_000)
            scenario = json.loads(scenario_path.read_text(encoding="utf-8"))
            signal_events = [event for event in scenario["events"] if event["type"] == "signal"]

            self.assertEqual(summary["entrySignalCount"], 1)
            self.assertEqual(summary["exitSignalCount"], 1)
            self.assertEqual(scenario["initialPortfolio"]["cashAvailable"], 1_000_000.0)
            self.assertEqual(len(signal_events), 2)
            self.assertEqual(signal_events[0]["signal"]["side"], "buy")
            self.assertEqual(signal_events[0]["signal"]["metadata"]["confidenceTier"], "high")
            self.assertEqual(signal_events[1]["signal"]["side"], "sell")
            self.assertEqual(signal_events[1]["signal"]["reasonCodes"], ["EXIT_RET_1M_NEG"])

    def test_build_session_scenario_supports_exploratory_profile(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            run_id = "run-exploratory"
            market = "KRW-XRP"

            entry_ts = 1_775_134_500_000
            exit_ts = 1_775_134_560_000

            _write(
                canonical_path(base_dir, "trade_tick", "2026-04-02T12:14:00Z", run_id, market=market),
                [
                    {"market": market, "trade_timestamp_ms": entry_ts - 60_000, "price": 2_000},
                    {"market": market, "trade_timestamp_ms": entry_ts, "price": 2_030},
                    {"market": market, "trade_timestamp_ms": exit_ts, "price": 2_005},
                ],
            )
            _write(
                canonical_path(
                    base_dir,
                    "orderbook_snapshot",
                    "2026-04-02T12:15:00Z",
                    run_id,
                    market=market,
                ),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": entry_ts,
                        "capture_id": "capture-entry",
                        "best_bid_price": 2_029,
                        "best_ask_price": 2_030,
                        "source": "bithumb_rest",
                    },
                    {
                        "market": market,
                        "event_timestamp_ms": exit_ts,
                        "capture_id": "capture-exit",
                        "best_bid_price": 2_005,
                        "best_ask_price": 2_006,
                        "source": "bithumb_rest",
                    },
                ],
            )
            _write(
                canonical_path(
                    base_dir,
                    "orderbook_level",
                    "2026-04-02T12:15:00Z",
                    run_id,
                    market=market,
                ),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": entry_ts,
                        "capture_id": "capture-entry",
                        "level_index": 0,
                        "bid_size": 5_000,
                        "ask_size": 4_000,
                        "source": "bithumb_rest",
                    },
                    {
                        "market": market,
                        "event_timestamp_ms": exit_ts,
                        "capture_id": "capture-exit",
                        "level_index": 0,
                        "bid_size": 3_000,
                        "ask_size": 4_000,
                        "source": "bithumb_rest",
                    },
                ],
            )
            _write(
                canonical_path(
                    base_dir,
                    "passive_feature_snapshot",
                    "2026-04-02T12:15:00Z",
                    run_id,
                    market=market,
                ),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": entry_ts,
                        "capture_id": "capture-entry",
                        "ret_5m_bps": 12.0,
                        "buy_notional_share_60s": 0.58,
                        "depth_ratio_l5": 1.28,
                        "spread_bps": 6.0,
                        "turnover_24h_krw": 25_000_000_000.0,
                        "window_coverage_sec": 40.0,
                    },
                    {
                        "market": market,
                        "event_timestamp_ms": exit_ts,
                        "capture_id": "capture-exit",
                        "ret_5m_bps": 4.0,
                        "buy_notional_share_60s": 0.45,
                        "depth_ratio_l5": 0.85,
                        "spread_bps": 6.0,
                        "turnover_24h_krw": 25_000_000_000.0,
                        "window_coverage_sec": 40.0,
                    },
                ],
            )

            scenario_path, summary = build_session_scenario(
                base_dir,
                run_id,
                initial_cash_krw=1_000_000,
                profile="exploratory_smoke",
            )
            scenario = json.loads(scenario_path.read_text(encoding="utf-8"))
            signal_events = [event for event in scenario["events"] if event["type"] == "signal"]

            self.assertEqual(summary["entrySignalCount"], 1)
            self.assertEqual(summary["exitSignalCount"], 1)
            self.assertEqual(scenario["metadata"]["strategyId"], "bithumb_v1_exploratory_smoke")
            self.assertIn("evaluation_scope=exploratory_smoke", scenario["metadata"]["eligibilityNote"])
            self.assertEqual(signal_events[0]["signal"]["strategyId"], "bithumb_v1_exploratory_smoke")
            self.assertEqual(signal_events[0]["signal"]["metadata"]["confidenceTier"], "medium")
