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
            peak_ts = 1_775_133_960_000
            neg_ts_1 = 1_775_134_020_000
            neg_ts_2 = 1_775_134_080_000

            _write(
                canonical_path(base_dir, "trade_tick", "2026-04-02T12:04:00Z", run_id, market=market),
                [
                    {"market": market, "trade_timestamp_ms": entry_ts - 60_000, "price": 100_000_000},
                    {"market": market, "trade_timestamp_ms": entry_ts, "price": 101_500_000},
                    {"market": market, "trade_timestamp_ms": peak_ts, "price": 101_920_000},
                    {"market": market, "trade_timestamp_ms": neg_ts_1, "price": 101_700_000},
                    {"market": market, "trade_timestamp_ms": neg_ts_2, "price": 101_200_000},
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
                        "event_timestamp_ms": peak_ts,
                        "capture_id": "capture-peak",
                        "best_bid_price": 101_900_000,
                        "best_ask_price": 101_910_000,
                        "source": "bithumb_rest",
                    },
                    {
                        "market": market,
                        "event_timestamp_ms": neg_ts_1,
                        "capture_id": "capture-neg-1",
                        "best_bid_price": 101_700_000,
                        "best_ask_price": 101_710_000,
                        "source": "bithumb_rest",
                    },
                    {
                        "market": market,
                        "event_timestamp_ms": neg_ts_2,
                        "capture_id": "capture-neg-2",
                        "best_bid_price": 101_200_000,
                        "best_ask_price": 101_210_000,
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
                        "event_timestamp_ms": peak_ts,
                        "capture_id": "capture-peak",
                        "level_index": 0,
                        "bid_size": 1.6,
                        "ask_size": 1.0,
                        "source": "bithumb_rest",
                    },
                    {
                        "market": market,
                        "event_timestamp_ms": neg_ts_1,
                        "capture_id": "capture-neg-1",
                        "level_index": 0,
                        "bid_size": 1.2,
                        "ask_size": 1.0,
                        "source": "bithumb_rest",
                    },
                    {
                        "market": market,
                        "event_timestamp_ms": neg_ts_2,
                        "capture_id": "capture-neg-2",
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
                        "event_timestamp_ms": peak_ts,
                        "capture_id": "capture-peak",
                        "ret_5m_bps": 20.0,
                        "buy_notional_share_60s": 0.58,
                        "depth_ratio_l5": 1.3,
                        "spread_bps": 2.0,
                        "turnover_24h_krw": 40_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    },
                    {
                        "market": market,
                        "event_timestamp_ms": neg_ts_1,
                        "capture_id": "capture-neg-1",
                        "ret_5m_bps": 12.0,
                        "buy_notional_share_60s": 0.52,
                        "depth_ratio_l5": 1.02,
                        "spread_bps": 2.0,
                        "turnover_24h_krw": 40_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    },
                    {
                        "market": market,
                        "event_timestamp_ms": neg_ts_2,
                        "capture_id": "capture-neg-2",
                        "ret_5m_bps": 8.0,
                        "buy_notional_share_60s": 0.52,
                        "depth_ratio_l5": 1.02,
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

            custom_path = base_dir / "isolated-replays" / "scenario.json"
            custom_scenario_path, _ = build_session_scenario(
                base_dir,
                run_id,
                initial_cash_krw=1_000_000,
                output_path=custom_path,
            )
            self.assertEqual(custom_scenario_path, custom_path)
            self.assertTrue(custom_path.exists())

    def test_build_session_scenario_does_not_reenter_in_same_bucket_after_exit(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            run_id = "run-no-same-bucket-reentry"
            carry_market = "KRW-BTC"
            entry_market = "KRW-ETH"
            bucket_ts = 1_775_140_000_000

            _write(
                canonical_path(base_dir, "trade_tick", "2026-04-02T13:00:00Z", run_id, market=carry_market),
                [
                    {"market": carry_market, "trade_timestamp_ms": bucket_ts - 60_000, "price": 100_000_000, "volume": 0.01, "side": "ASK"},
                    {"market": carry_market, "trade_timestamp_ms": bucket_ts, "price": 99_900_000, "volume": 0.01, "side": "ASK"},
                ],
            )
            _write(
                canonical_path(base_dir, "trade_tick", "2026-04-02T13:00:00Z", run_id, market=entry_market),
                [
                    {"market": entry_market, "trade_timestamp_ms": bucket_ts - 300_000, "price": 3_000_000, "volume": 0.1, "side": "ASK"},
                    {"market": entry_market, "trade_timestamp_ms": bucket_ts - 60_000, "price": 3_030_000, "volume": 0.1, "side": "BID"},
                    {"market": entry_market, "trade_timestamp_ms": bucket_ts, "price": 3_040_000, "volume": 0.1, "side": "BID"},
                ],
            )
            _write(
                canonical_path(base_dir, "orderbook_snapshot", "2026-04-02T13:00:00Z", run_id, market=carry_market),
                [
                    {
                        "market": carry_market,
                        "event_timestamp_ms": bucket_ts,
                        "capture_id": "carry-capture",
                        "best_bid_price": 99_900_000,
                        "best_ask_price": 99_910_000,
                        "source": "bithumb_rest",
                    }
                ],
            )
            _write(
                canonical_path(base_dir, "orderbook_snapshot", "2026-04-02T13:00:00Z", run_id, market=entry_market),
                [
                    {
                        "market": entry_market,
                        "event_timestamp_ms": bucket_ts,
                        "capture_id": "entry-capture",
                        "best_bid_price": 3_039_000,
                        "best_ask_price": 3_040_000,
                        "source": "bithumb_rest",
                    }
                ],
            )
            _write(
                canonical_path(base_dir, "orderbook_level", "2026-04-02T13:00:00Z", run_id, market=carry_market),
                [
                    {
                        "market": carry_market,
                        "event_timestamp_ms": bucket_ts,
                        "capture_id": "carry-capture",
                        "level_index": 0,
                        "bid_size": 0.8,
                        "ask_size": 1.0,
                        "source": "bithumb_rest",
                    }
                ],
            )
            _write(
                canonical_path(base_dir, "orderbook_level", "2026-04-02T13:00:00Z", run_id, market=entry_market),
                [
                    {
                        "market": entry_market,
                        "event_timestamp_ms": bucket_ts,
                        "capture_id": "entry-capture",
                        "level_index": 0,
                        "bid_size": 1.5,
                        "ask_size": 1.0,
                        "source": "bithumb_rest",
                    }
                ],
            )
            _write(
                canonical_path(base_dir, "passive_feature_snapshot", "2026-04-02T13:00:00Z", run_id, market=entry_market),
                [
                    {
                        "market": entry_market,
                        "event_timestamp_ms": bucket_ts,
                        "capture_id": "entry-capture",
                        "ret_5m_bps": 15.0,
                        "buy_notional_share_60s": 0.60,
                        "depth_ratio_l5": 1.30,
                        "spread_bps": 3.0,
                        "turnover_24h_krw": 40_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    }
                ],
            )

            scenario_path, summary = build_session_scenario(
                base_dir,
                run_id,
                initial_cash_krw=500_000,
                exit_profile="balanced_v1",
                synthetic_exit_policy="carry_open",
                initial_portfolio={
                    "portfolio": {
                        "cashAvailable": 500_000,
                        "dailyRealizedPnl": 0,
                        "positions": {
                            carry_market: {
                                "market": carry_market,
                                "baseQuantity": 0.0042,
                                "avgEntryPrice": 100_000_000,
                                "realizedPnl": 0,
                            }
                        },
                    },
                    "openPositionState": {
                        "market": carry_market,
                        "enteredAtMs": bucket_ts - 900_000,
                        "entryPrice": 100_000_000,
                        "quantity": 0.0042,
                        "quoteNotional": 420_000,
                        "consecutiveNegativeRet1m": 1,
                        "consecutiveBookFailures": 0,
                        "peakBidPrice": 100_000_000,
                    },
                },
                initial_equity_krw=920_000,
                mode_intent="paper",
            )
            scenario = json.loads(scenario_path.read_text(encoding="utf-8"))
            signal_events = [event for event in scenario["events"] if event["type"] == "signal"]

            self.assertEqual(summary["exitSignalCount"], 1)
            self.assertEqual(summary["entrySignalCount"], 0)
            self.assertEqual(len(signal_events), 1)
            self.assertEqual(signal_events[0]["signal"]["side"], "sell")

    def test_build_session_scenario_allows_reentry_after_later_exit_bucket(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            run_id = "run-later-bucket-reentry"
            carry_market = "KRW-BTC"
            entry_market = "KRW-ETH"
            exit_ts = 1_775_140_000_000
            next_ts = exit_ts + 60_000

            for market, price in [(carry_market, 100_000_000), (entry_market, 3_000_000)]:
                _write(
                    canonical_path(base_dir, "trade_tick", "2026-04-02T13:01:00Z", run_id, market=market),
                    [
                        {"market": market, "trade_timestamp_ms": exit_ts - 300_000, "price": price, "volume": 0.1, "side": "ASK"},
                        {"market": market, "trade_timestamp_ms": exit_ts - 60_000, "price": price * 1.01, "volume": 0.1, "side": "BID"},
                        {"market": market, "trade_timestamp_ms": next_ts, "price": price * 1.02, "volume": 0.1, "side": "BID"},
                    ],
                )

            _write(
                canonical_path(base_dir, "orderbook_snapshot", "2026-04-02T13:01:00Z", run_id, market=carry_market),
                [
                    {
                        "market": carry_market,
                        "event_timestamp_ms": exit_ts,
                        "capture_id": "carry-exit",
                        "best_bid_price": 99_900_000,
                        "best_ask_price": 99_910_000,
                        "source": "bithumb_rest",
                    }
                ],
            )
            _write(
                canonical_path(base_dir, "orderbook_snapshot", "2026-04-02T13:01:00Z", run_id, market=entry_market),
                [
                    {
                        "market": entry_market,
                        "event_timestamp_ms": next_ts,
                        "capture_id": "entry-next",
                        "best_bid_price": 3_059_000,
                        "best_ask_price": 3_060_000,
                        "source": "bithumb_rest",
                    }
                ],
            )
            _write(
                canonical_path(base_dir, "orderbook_level", "2026-04-02T13:01:00Z", run_id, market=carry_market),
                [
                    {
                        "market": carry_market,
                        "event_timestamp_ms": exit_ts,
                        "capture_id": "carry-exit",
                        "level_index": 0,
                        "bid_size": 0.8,
                        "ask_size": 1.0,
                        "source": "bithumb_rest",
                    }
                ],
            )
            _write(
                canonical_path(base_dir, "orderbook_level", "2026-04-02T13:01:00Z", run_id, market=entry_market),
                [
                    {
                        "market": entry_market,
                        "event_timestamp_ms": next_ts,
                        "capture_id": "entry-next",
                        "level_index": 0,
                        "bid_size": 1.5,
                        "ask_size": 1.0,
                        "source": "bithumb_rest",
                    }
                ],
            )
            _write(
                canonical_path(base_dir, "passive_feature_snapshot", "2026-04-02T13:01:00Z", run_id, market=carry_market),
                [
                    {
                        "market": carry_market,
                        "event_timestamp_ms": exit_ts,
                        "capture_id": "carry-exit",
                        "ret_5m_bps": -5.0,
                        "buy_notional_share_60s": 0.45,
                        "depth_ratio_l5": 0.80,
                        "spread_bps": 2.0,
                        "turnover_24h_krw": 40_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    }
                ],
            )
            _write(
                canonical_path(base_dir, "passive_feature_snapshot", "2026-04-02T13:01:00Z", run_id, market=entry_market),
                [
                    {
                        "market": entry_market,
                        "event_timestamp_ms": next_ts,
                        "capture_id": "entry-next",
                        "ret_5m_bps": 25.0,
                        "buy_notional_share_60s": 0.80,
                        "depth_ratio_l5": 1.50,
                        "spread_bps": 2.0,
                        "turnover_24h_krw": 40_000_000_000.0,
                        "window_coverage_sec": 60.0,
                        "ret_1m_bps": 8.0,
                    }
                ],
            )

            scenario_path, summary = build_session_scenario(
                base_dir,
                run_id,
                initial_cash_krw=500_000,
                exit_profile="balanced_v1",
                synthetic_exit_policy="carry_open",
                initial_portfolio={
                    "portfolio": {
                        "cashAvailable": 500_000,
                        "dailyRealizedPnl": 0,
                        "positions": {
                            carry_market: {
                                "market": carry_market,
                                "baseQuantity": 0.0042,
                                "avgEntryPrice": 100_000_000,
                                "realizedPnl": 0,
                            }
                        },
                    },
                    "openPositionState": {
                        "market": carry_market,
                        "enteredAtMs": exit_ts - 900_000,
                        "entryPrice": 100_000_000,
                        "quantity": 0.0042,
                        "quoteNotional": 420_000,
                        "consecutiveNegativeRet1m": 0,
                        "consecutiveBookFailures": 0,
                        "peakBidPrice": 100_000_000,
                    },
                },
                initial_equity_krw=920_000,
                mode_intent="paper",
            )
            scenario = json.loads(scenario_path.read_text(encoding="utf-8"))
            signal_sides = [
                event["signal"]["side"]
                for event in scenario["events"]
                if event["type"] == "signal"
            ]

            self.assertEqual(signal_sides, ["sell", "buy"])
            self.assertEqual(summary["exitSignalCount"], 1)
            self.assertEqual(summary["entrySignalCount"], 1)
            self.assertEqual(summary["entryBlockedAfterExitBucketCount"], 1)
            self.assertEqual(summary["entryEvaluationBucketCount"], 1)

    def test_build_session_scenario_does_not_exit_on_ret_1m_neg_before_one_minute_hold(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            run_id = "run-no-early-ret-exit"
            market = "KRW-BTC"

            entry_ts = 1_775_133_900_000
            fast_neg_ts_1 = entry_ts + 30_000
            fast_neg_ts_2 = entry_ts + 45_000

            _write(
                canonical_path(base_dir, "trade_tick", "2026-04-02T12:04:00Z", run_id, market=market),
                [
                    {"market": market, "trade_timestamp_ms": entry_ts - 60_000, "price": 100_000_000},
                    {"market": market, "trade_timestamp_ms": entry_ts, "price": 101_500_000},
                    {"market": market, "trade_timestamp_ms": fast_neg_ts_1, "price": 101_200_000},
                    {"market": market, "trade_timestamp_ms": fast_neg_ts_2, "price": 101_100_000},
                ],
            )
            _write(
                canonical_path(base_dir, "orderbook_snapshot", "2026-04-02T12:05:00Z", run_id, market=market),
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
                        "event_timestamp_ms": fast_neg_ts_1,
                        "capture_id": "capture-fast-neg-1",
                        "best_bid_price": 101_200_000,
                        "best_ask_price": 101_210_000,
                        "source": "bithumb_rest",
                    },
                    {
                        "market": market,
                        "event_timestamp_ms": fast_neg_ts_2,
                        "capture_id": "capture-fast-neg-2",
                        "best_bid_price": 101_100_000,
                        "best_ask_price": 101_110_000,
                        "source": "bithumb_rest",
                    },
                ],
            )
            _write(
                canonical_path(base_dir, "orderbook_level", "2026-04-02T12:05:00Z", run_id, market=market),
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
                        "event_timestamp_ms": fast_neg_ts_1,
                        "capture_id": "capture-fast-neg-1",
                        "level_index": 0,
                        "bid_size": 1.1,
                        "ask_size": 1.0,
                        "source": "bithumb_rest",
                    },
                    {
                        "market": market,
                        "event_timestamp_ms": fast_neg_ts_2,
                        "capture_id": "capture-fast-neg-2",
                        "level_index": 0,
                        "bid_size": 1.1,
                        "ask_size": 1.0,
                        "source": "bithumb_rest",
                    },
                ],
            )
            _write(
                canonical_path(base_dir, "passive_feature_snapshot", "2026-04-02T12:05:00Z", run_id, market=market),
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
                        "event_timestamp_ms": fast_neg_ts_1,
                        "capture_id": "capture-fast-neg-1",
                        "ret_5m_bps": 8.0,
                        "buy_notional_share_60s": 0.51,
                        "depth_ratio_l5": 1.1,
                        "spread_bps": 2.0,
                        "turnover_24h_krw": 40_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    },
                    {
                        "market": market,
                        "event_timestamp_ms": fast_neg_ts_2,
                        "capture_id": "capture-fast-neg-2",
                        "ret_5m_bps": 7.0,
                        "buy_notional_share_60s": 0.50,
                        "depth_ratio_l5": 1.1,
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
            self.assertEqual(summary["exitSignalCount"], 0)
            self.assertEqual(len(signal_events), 1)
            self.assertEqual(signal_events[0]["signal"]["side"], "buy")

    def test_book_confirm3_profile_waits_one_more_scenario_bucket_than_confirm2(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            run_id = "run-book-confirm3-path"
            market = "KRW-BTC"
            first_ts = 1_775_140_000_000
            timestamps = [first_ts, first_ts + 60_000, first_ts + 120_000]

            _write(
                canonical_path(base_dir, "trade_tick", "2026-04-02T13:00:00Z", run_id, market=market),
                [
                    {
                        "market": market,
                        "trade_timestamp_ms": first_ts - 60_000,
                        "price": 99_900_000,
                        "volume": 0.01,
                        "side": "ASK",
                    },
                    *[
                        {
                            "market": market,
                            "trade_timestamp_ms": timestamp,
                            "price": 99_950_000 + (index * 10_000),
                            "volume": 0.01,
                            "side": "ASK",
                        }
                        for index, timestamp in enumerate(timestamps)
                    ],
                ],
            )
            _write(
                canonical_path(base_dir, "orderbook_snapshot", "2026-04-02T13:00:00Z", run_id, market=market),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": timestamp,
                        "capture_id": f"book-fail-{index}",
                        "best_bid_price": 99_950_000,
                        "best_ask_price": 99_960_000,
                        "source": "bithumb_rest",
                    }
                    for index, timestamp in enumerate(timestamps, start=1)
                ],
            )
            _write(
                canonical_path(base_dir, "orderbook_level", "2026-04-02T13:00:00Z", run_id, market=market),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": timestamp,
                        "capture_id": f"book-fail-{index}",
                        "level_index": 0,
                        "bid_size": 0.85,
                        "ask_size": 1.0,
                        "source": "bithumb_rest",
                    }
                    for index, timestamp in enumerate(timestamps, start=1)
                ],
            )
            _write(
                canonical_path(base_dir, "passive_feature_snapshot", "2026-04-02T13:00:00Z", run_id, market=market),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": timestamp,
                        "capture_id": f"book-fail-{index}",
                        "ret_5m_bps": -2.0,
                        "buy_notional_share_60s": 0.45,
                        "depth_ratio_l5": 0.85,
                        "spread_bps": 2.0,
                        "turnover_24h_krw": 40_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    }
                    for index, timestamp in enumerate(timestamps, start=1)
                ],
            )
            initial_portfolio = {
                "portfolio": {
                    "cashAvailable": 600_000,
                    "dailyRealizedPnl": 0,
                    "positions": {
                        market: {
                            "market": market,
                            "baseQuantity": 0.004,
                            "avgEntryPrice": 99_600_000,
                            "realizedPnl": 0,
                        }
                    },
                },
                "openPositionState": {
                    "market": market,
                    "enteredAtMs": first_ts - 180_000,
                    "entryPrice": 99_600_000,
                    "quantity": 0.004,
                    "quoteNotional": 398_400,
                    "consecutiveNegativeRet1m": 0,
                    "consecutiveBookFailures": 0,
                    "peakBidPrice": 100_100_000,
                },
            }

            confirm2_path, confirm2_summary = build_session_scenario(
                base_dir,
                run_id,
                initial_cash_krw=1_000_000,
                initial_portfolio=initial_portfolio,
                exit_profile="balanced_v1_book_confirm2",
            )
            confirm3_path, confirm3_summary = build_session_scenario(
                base_dir,
                run_id,
                initial_cash_krw=1_000_000,
                initial_portfolio=initial_portfolio,
                exit_profile="balanced_v1_book_confirm3",
            )

            confirm2_signals = [
                event["signal"]
                for event in json.loads(confirm2_path.read_text(encoding="utf-8"))["events"]
                if event["type"] == "signal"
            ]
            confirm3_signals = [
                event["signal"]
                for event in json.loads(confirm3_path.read_text(encoding="utf-8"))["events"]
                if event["type"] == "signal"
            ]

            self.assertEqual(confirm2_summary["exitSignalCount"], 1)
            self.assertEqual(confirm3_summary["exitSignalCount"], 1)
            self.assertEqual(confirm2_signals[0]["generatedAt"], "2026-04-02T14:27:40Z")
            self.assertEqual(confirm3_signals[0]["generatedAt"], "2026-04-02T14:28:40Z")
            self.assertEqual(confirm2_signals[0]["reasonCodes"], ["EXIT_BOOK_IMBALANCE_FAIL"])
            self.assertEqual(confirm3_signals[0]["reasonCodes"], ["EXIT_BOOK_IMBALANCE_FAIL"])

    def test_book_imbalance_does_not_emit_exit_signal_during_positive_trend(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            run_id = "run-book-positive-trend-hold"
            market = "KRW-BTC"
            timestamp = 1_775_140_000_000

            _write(
                canonical_path(base_dir, "trade_tick", "2026-04-02T13:00:00Z", run_id, market=market),
                [
                    {
                        "market": market,
                        "trade_timestamp_ms": timestamp - 60_000,
                        "price": 99_800_000,
                        "volume": 0.01,
                        "side": "BID",
                    },
                    {
                        "market": market,
                        "trade_timestamp_ms": timestamp,
                        "price": 99_950_000,
                        "volume": 0.01,
                        "side": "BID",
                    },
                ],
            )
            _write(
                canonical_path(base_dir, "orderbook_snapshot", "2026-04-02T13:00:00Z", run_id, market=market),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": timestamp,
                        "capture_id": "book-fail-positive-trend",
                        "best_bid_price": 99_950_000,
                        "best_ask_price": 99_960_000,
                        "source": "bithumb_rest",
                    }
                ],
            )
            _write(
                canonical_path(base_dir, "orderbook_level", "2026-04-02T13:00:00Z", run_id, market=market),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": timestamp,
                        "capture_id": "book-fail-positive-trend",
                        "level_index": 0,
                        "bid_size": 0.85,
                        "ask_size": 1.0,
                        "source": "bithumb_rest",
                    }
                ],
            )
            _write(
                canonical_path(base_dir, "passive_feature_snapshot", "2026-04-02T13:00:00Z", run_id, market=market),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": timestamp,
                        "capture_id": "book-fail-positive-trend",
                        "ret_5m_bps": 8.0,
                        "buy_notional_share_60s": 0.45,
                        "depth_ratio_l5": 0.85,
                        "spread_bps": 2.0,
                        "turnover_24h_krw": 40_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    }
                ],
            )

            scenario_path, summary = build_session_scenario(
                base_dir,
                run_id,
                initial_cash_krw=1_000_000,
                initial_portfolio={
                    "portfolio": {
                        "cashAvailable": 600_000,
                        "dailyRealizedPnl": 0,
                        "positions": {
                            market: {
                                "market": market,
                                "baseQuantity": 0.004,
                                "avgEntryPrice": 99_600_000,
                                "realizedPnl": 0,
                            }
                        },
                    },
                    "openPositionState": {
                        "market": market,
                        "enteredAtMs": timestamp - 180_000,
                        "entryPrice": 99_600_000,
                        "quantity": 0.004,
                        "quoteNotional": 398_400,
                        "consecutiveNegativeRet1m": 0,
                        "consecutiveBookFailures": 0,
                        "peakBidPrice": 100_300_000,
                    },
                },
                exit_profile="balanced_v1",
                synthetic_exit_policy="carry_open",
            )
            scenario = json.loads(scenario_path.read_text(encoding="utf-8"))
            signal_events = [event for event in scenario["events"] if event["type"] == "signal"]

            self.assertEqual(summary["exitSignalCount"], 0)
            self.assertEqual(signal_events, [])
            self.assertIsNotNone(scenario["metadata"]["openPositionState"])

    def test_build_session_scenario_does_not_reenter_later_in_same_scenario_after_exit(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            run_id = "run-no-later-reentry"
            carry_market = "KRW-BTC"
            entry_market = "KRW-ETH"
            exit_ts = 1_775_140_000_000
            later_entry_ts = exit_ts + 60_000

            _write(
                canonical_path(base_dir, "trade_tick", "2026-04-02T13:00:00Z", run_id, market=carry_market),
                [
                    {"market": carry_market, "trade_timestamp_ms": exit_ts - 60_000, "price": 100_000_000, "volume": 0.01, "side": "ASK"},
                    {"market": carry_market, "trade_timestamp_ms": exit_ts, "price": 99_000_000, "volume": 0.01, "side": "ASK"},
                ],
            )
            _write(
                canonical_path(base_dir, "trade_tick", "2026-04-02T13:00:00Z", run_id, market=entry_market),
                [
                    {"market": entry_market, "trade_timestamp_ms": later_entry_ts - 300_000, "price": 3_000_000, "volume": 0.1, "side": "ASK"},
                    {"market": entry_market, "trade_timestamp_ms": later_entry_ts - 60_000, "price": 3_030_000, "volume": 0.1, "side": "BID"},
                    {"market": entry_market, "trade_timestamp_ms": later_entry_ts, "price": 3_050_000, "volume": 0.1, "side": "BID"},
                ],
            )
            _write(
                canonical_path(base_dir, "orderbook_snapshot", "2026-04-02T13:00:00Z", run_id, market=carry_market),
                [
                    {
                        "market": carry_market,
                        "event_timestamp_ms": exit_ts,
                        "capture_id": "carry-exit",
                        "best_bid_price": 99_000_000,
                        "best_ask_price": 99_010_000,
                        "source": "bithumb_rest",
                    }
                ],
            )
            _write(
                canonical_path(base_dir, "orderbook_snapshot", "2026-04-02T13:00:00Z", run_id, market=entry_market),
                [
                    {
                        "market": entry_market,
                        "event_timestamp_ms": later_entry_ts,
                        "capture_id": "entry-capture",
                        "best_bid_price": 3_049_000,
                        "best_ask_price": 3_050_000,
                        "source": "bithumb_rest",
                    }
                ],
            )
            _write(
                canonical_path(base_dir, "orderbook_level", "2026-04-02T13:00:00Z", run_id, market=carry_market),
                [
                    {
                        "market": carry_market,
                        "event_timestamp_ms": exit_ts,
                        "capture_id": "carry-exit",
                        "level_index": 0,
                        "bid_size": 1.0,
                        "ask_size": 1.0,
                        "source": "bithumb_rest",
                    }
                ],
            )
            _write(
                canonical_path(base_dir, "orderbook_level", "2026-04-02T13:00:00Z", run_id, market=entry_market),
                [
                    {
                        "market": entry_market,
                        "event_timestamp_ms": later_entry_ts,
                        "capture_id": "entry-capture",
                        "level_index": 0,
                        "bid_size": 1.5,
                        "ask_size": 1.0,
                        "source": "bithumb_rest",
                    }
                ],
            )
            _write(
                canonical_path(base_dir, "passive_feature_snapshot", "2026-04-02T13:00:00Z", run_id, market=carry_market),
                [
                    {
                        "market": carry_market,
                        "event_timestamp_ms": exit_ts,
                        "capture_id": "carry-exit",
                        "ret_5m_bps": -12.0,
                        "buy_notional_share_60s": 0.45,
                        "depth_ratio_l5": 0.8,
                        "spread_bps": 2.0,
                        "turnover_24h_krw": 40_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    }
                ],
            )
            _write(
                canonical_path(base_dir, "passive_feature_snapshot", "2026-04-02T13:00:00Z", run_id, market=entry_market),
                [
                    {
                        "market": entry_market,
                        "event_timestamp_ms": later_entry_ts,
                        "capture_id": "entry-capture",
                        "ret_5m_bps": 25.0,
                        "buy_notional_share_60s": 0.61,
                        "depth_ratio_l5": 1.4,
                        "spread_bps": 2.0,
                        "turnover_24h_krw": 40_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    }
                ],
            )

            scenario_path, summary = build_session_scenario(
                base_dir,
                run_id,
                initial_cash_krw=1_000_000,
                initial_portfolio={
                    "portfolio": {
                        "cashAvailable": 200_000,
                        "dailyRealizedPnl": 0,
                        "positions": {
                            carry_market: {
                                "market": carry_market,
                                "baseQuantity": 0.004,
                                "avgEntryPrice": 100_000_000,
                                "realizedPnl": 0,
                                "enteredAtMs": exit_ts - 180_000,
                                "quoteNotional": 400_000,
                            }
                        },
                    },
                    "openPositionState": {
                        "market": carry_market,
                        "enteredAtMs": exit_ts - 180_000,
                        "entryPrice": 100_000_000,
                        "quantity": 0.004,
                        "quoteNotional": 400_000,
                        "consecutiveNegativeRet1m": 0,
                        "consecutiveBookFailures": 0,
                        "peakBidPrice": 100_100_000,
                    },
                },
            )
            scenario = json.loads(scenario_path.read_text(encoding="utf-8"))
            signal_events = [event for event in scenario["events"] if event["type"] == "signal"]

            self.assertEqual(summary["entrySignalCount"], 0)
            self.assertEqual(summary["exitSignalCount"], 1)
            self.assertEqual([event["signal"]["side"] for event in signal_events], ["sell"])

    def test_build_session_scenario_downsamples_dense_points_and_limits_entry_size(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            run_id = "run-downsampled"
            market = "KRW-XRP"

            feature_a_ts = 1_775_140_005_000
            feature_b_ts = feature_a_ts + 5_000
            feature_c_ts = feature_a_ts + 20_000

            _write(
                canonical_path(base_dir, "trade_tick", "2026-04-02T13:00:00Z", run_id, market=market),
                [
                    {"market": market, "trade_timestamp_ms": feature_a_ts - 300_000, "price": 1_900, "volume": 10, "side": "ASK"},
                    {"market": market, "trade_timestamp_ms": feature_a_ts - 60_000, "price": 1_950, "volume": 10, "side": "BID"},
                    {"market": market, "trade_timestamp_ms": feature_a_ts, "price": 2_000, "volume": 10, "side": "BID"},
                    {"market": market, "trade_timestamp_ms": feature_b_ts, "price": 2_001, "volume": 10, "side": "BID"},
                    {"market": market, "trade_timestamp_ms": feature_c_ts, "price": 2_010, "volume": 10, "side": "BID"},
                ],
            )
            _write(
                canonical_path(base_dir, "orderbook_snapshot", "2026-04-02T13:00:00Z", run_id, market=market),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": feature_a_ts,
                        "capture_id": "capture-a",
                        "best_bid_price": 1_999,
                        "best_ask_price": 2_000,
                        "best_ask_size": 20,
                        "source": "bithumb_rest",
                    },
                    {
                        "market": market,
                        "event_timestamp_ms": feature_b_ts,
                        "capture_id": "capture-b",
                        "best_bid_price": 2_000,
                        "best_ask_price": 2_001,
                        "best_ask_size": 20,
                        "source": "bithumb_rest",
                    },
                    {
                        "market": market,
                        "event_timestamp_ms": feature_c_ts,
                        "capture_id": "capture-c",
                        "best_bid_price": 2_009,
                        "best_ask_price": 2_010,
                        "best_ask_size": 20,
                        "source": "bithumb_rest",
                    },
                ],
            )
            _write(
                canonical_path(base_dir, "orderbook_level", "2026-04-02T13:00:00Z", run_id, market=market),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": ts,
                        "capture_id": capture_id,
                        "level_index": 0,
                        "bid_size": 25,
                        "ask_size": 20,
                        "source": "bithumb_rest",
                    }
                    for capture_id, ts in [("capture-a", feature_a_ts), ("capture-b", feature_b_ts), ("capture-c", feature_c_ts)]
                ],
            )
            _write(
                canonical_path(base_dir, "passive_feature_snapshot", "2026-04-02T13:00:00Z", run_id, market=market),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": feature_a_ts,
                        "capture_id": "capture-a",
                        "ret_5m_bps": 25.0,
                        "buy_notional_share_60s": 0.80,
                        "depth_ratio_l5": 1.4,
                        "spread_bps": 2.0,
                        "turnover_24h_krw": 40_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    },
                    {
                        "market": market,
                        "event_timestamp_ms": feature_b_ts,
                        "capture_id": "capture-b",
                        "ret_5m_bps": 25.0,
                        "buy_notional_share_60s": 0.80,
                        "depth_ratio_l5": 1.4,
                        "spread_bps": 2.0,
                        "turnover_24h_krw": 40_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    },
                    {
                        "market": market,
                        "event_timestamp_ms": feature_c_ts,
                        "capture_id": "capture-c",
                        "ret_5m_bps": 25.0,
                        "buy_notional_share_60s": 0.80,
                        "depth_ratio_l5": 1.4,
                        "spread_bps": 2.0,
                        "turnover_24h_krw": 40_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    },
                ],
            )

            scenario_path, summary = build_session_scenario(base_dir, run_id, initial_cash_krw=1_000_000)
            scenario = json.loads(scenario_path.read_text(encoding="utf-8"))
            signal_events = [event for event in scenario["events"] if event["type"] == "signal"]
            snapshot_events = [event for event in scenario["events"] if event["type"] == "snapshot"]

            self.assertEqual(summary["entrySignalCount"], 1)
            self.assertEqual(len(snapshot_events), 2)
            self.assertEqual(len(signal_events), 1)
            self.assertEqual(signal_events[0]["signal"]["sizing"]["value"], 60_030.0)

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
                        "ret_5m_bps": 24.0,
                        "buy_notional_share_60s": 0.80,
                        "depth_ratio_l5": 1.28,
                        "spread_bps": 5.0,
                        "turnover_24h_krw": 25_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    },
                    {
                        "market": market,
                        "event_timestamp_ms": exit_ts,
                        "capture_id": "capture-exit",
                        "ret_5m_bps": 4.0,
                        "buy_notional_share_60s": 0.45,
                        "depth_ratio_l5": 0.85,
                        "spread_bps": 5.0,
                        "turnover_24h_krw": 25_000_000_000.0,
                        "window_coverage_sec": 60.0,
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
            self.assertEqual(signal_events[1]["signal"]["reasonCodes"], ["EXIT_STOP_LOSS"])

    def test_build_session_scenario_caps_live_single_market_size(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            run_id = "run-live-sizing"
            market = "KRW-BTC"

            entry_ts = 1_775_133_900_000
            exit_ts = 1_775_134_020_000

            _write(
                canonical_path(base_dir, "trade_tick", "2026-04-02T12:04:00Z", run_id, market=market),
                [
                    {"market": market, "trade_timestamp_ms": entry_ts - 300_000, "price": 100_000_000},
                    {"market": market, "trade_timestamp_ms": entry_ts - 60_000, "price": 100_500_000},
                    {"market": market, "trade_timestamp_ms": entry_ts, "price": 101_500_000},
                    {"market": market, "trade_timestamp_ms": exit_ts, "price": 101_700_000},
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
                        "best_bid_price": 101_700_000,
                        "best_ask_price": 101_710_000,
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
                        "bid_size": 1.2,
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
                        "ret_5m_bps": 20.0,
                        "buy_notional_share_60s": 0.58,
                        "depth_ratio_l5": 1.3,
                        "spread_bps": 2.0,
                        "turnover_24h_krw": 40_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    },
                ],
            )

            scenario_path, _ = build_session_scenario(
                base_dir,
                run_id,
                initial_cash_krw=1_000_000,
                mode_intent="live",
            )
            scenario = json.loads(scenario_path.read_text(encoding="utf-8"))
            signal_events = [event for event in scenario["events"] if event["type"] == "signal"]

            self.assertEqual(signal_events[0]["signal"]["sizing"]["value"], 200_000.0)
            self.assertEqual(scenario["metadata"]["aggressiveNotionalFraction"], 0.20)


    def test_build_session_scenario_can_carry_open_position_without_synthetic_close(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            run_id = "run-carry-open"
            market = "KRW-BTC"
            snapshot_ts = 1_775_140_000_000

            _write(
                canonical_path(base_dir, "trade_tick", "2026-04-02T13:00:00Z", run_id, market=market),
                [
                    {"market": market, "trade_timestamp_ms": snapshot_ts - 60_000, "price": 100_000_000},
                    {"market": market, "trade_timestamp_ms": snapshot_ts, "price": 100_100_000},
                ],
            )
            _write(
                canonical_path(
                    base_dir,
                    "orderbook_snapshot",
                    "2026-04-02T13:00:00Z",
                    run_id,
                    market=market,
                ),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": snapshot_ts,
                        "capture_id": "capture-open",
                        "best_bid_price": 100_050_000,
                        "best_ask_price": 100_100_000,
                        "source": "bithumb_rest",
                    },
                ],
            )
            _write(
                canonical_path(
                    base_dir,
                    "orderbook_level",
                    "2026-04-02T13:00:00Z",
                    run_id,
                    market=market,
                ),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": snapshot_ts,
                        "capture_id": "capture-open",
                        "level_index": 0,
                        "bid_size": 1.5,
                        "ask_size": 1.0,
                        "source": "bithumb_rest",
                    },
                ],
            )
            _write(
                canonical_path(
                    base_dir,
                    "passive_feature_snapshot",
                    "2026-04-02T13:00:00Z",
                    run_id,
                    market=market,
                ),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": snapshot_ts,
                        "capture_id": "capture-open",
                        "ret_5m_bps": 6.0,
                        "buy_notional_share_60s": 0.51,
                        "depth_ratio_l5": 1.1,
                        "spread_bps": 2.0,
                        "turnover_24h_krw": 40_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    },
                ],
            )

            scenario_path, summary = build_session_scenario(
                base_dir,
                run_id,
                initial_cash_krw=580_000,
                exit_profile="balanced_v1",
                synthetic_exit_policy="carry_open",
                initial_portfolio={
                    "portfolio": {
                        "cashAvailable": 580_000,
                        "dailyRealizedPnl": 0,
                        "positions": {
                            market: {
                                "market": market,
                                "baseQuantity": 0.0042,
                                "avgEntryPrice": 100_000_000,
                                "realizedPnl": 0,
                            }
                        },
                    },
                    "openPositionState": {
                        "market": market,
                        "enteredAtMs": snapshot_ts - 300_000,
                        "entryPrice": 100_000_000,
                        "quantity": 0.0042,
                        "quoteNotional": 420_000,
                        "consecutiveNegativeRet1m": 0,
                        "consecutiveBookFailures": 0,
                        "peakBidPrice": 100_000_000,
                    },
                },
                initial_equity_krw=1_000_000,
                mode_intent="paper",
            )
            scenario = json.loads(scenario_path.read_text(encoding="utf-8"))
            signal_events = [event for event in scenario["events"] if event["type"] == "signal"]

            self.assertEqual(summary["entrySignalCount"], 0)
            self.assertEqual(summary["exitSignalCount"], 0)
            self.assertEqual(summary["syntheticCloseCount"], 0)
            self.assertEqual(len(signal_events), 0)
            self.assertTrue(scenario["metadata"]["carryOpenPositions"])
            self.assertEqual(scenario["metadata"]["initialEquityKrw"], 1_000_000.0)
            self.assertEqual(scenario["metadata"]["openPositionState"]["market"], market)

    def test_build_session_scenario_includes_carried_market_without_passive_features(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            run_id = "run-carry-fallback"
            market = "KRW-BTC"
            snapshot_ts = 1_775_140_060_000

            _write(
                canonical_path(base_dir, "trade_tick", "2026-04-02T13:01:00Z", run_id, market=market),
                [
                    {
                        "market": market,
                        "trade_timestamp_ms": snapshot_ts - 60_000,
                        "price": 100_000_000,
                        "volume": 0.01,
                        "side": "ASK",
                    },
                    {
                        "market": market,
                        "trade_timestamp_ms": snapshot_ts,
                        "price": 100_050_000,
                        "volume": 0.01,
                        "side": "BID",
                    },
                ],
            )
            _write(
                canonical_path(
                    base_dir,
                    "orderbook_snapshot",
                    "2026-04-02T13:01:00Z",
                    run_id,
                    market=market,
                ),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": snapshot_ts,
                        "capture_id": "capture-fallback",
                        "best_bid_price": 100_040_000,
                        "best_ask_price": 100_050_000,
                        "source": "bithumb_rest",
                    },
                ],
            )
            _write(
                canonical_path(
                    base_dir,
                    "orderbook_level",
                    "2026-04-02T13:01:00Z",
                    run_id,
                    market=market,
                ),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": snapshot_ts,
                        "capture_id": "capture-fallback",
                        "level_index": 0,
                        "bid_size": 1.5,
                        "ask_size": 1.0,
                        "source": "bithumb_rest",
                    },
                ],
            )

            scenario_path, summary = build_session_scenario(
                base_dir,
                run_id,
                initial_cash_krw=580_000,
                exit_profile="balanced_v1",
                synthetic_exit_policy="carry_open",
                initial_portfolio={
                    "portfolio": {
                        "cashAvailable": 580_000,
                        "dailyRealizedPnl": 0,
                        "positions": {
                            market: {
                                "market": market,
                                "baseQuantity": 0.0042,
                                "avgEntryPrice": 100_000_000,
                                "realizedPnl": 0,
                            }
                        },
                    },
                    "openPositionState": {
                        "market": market,
                        "enteredAtMs": snapshot_ts - 300_000,
                        "entryPrice": 100_000_000,
                        "quantity": 0.0042,
                        "quoteNotional": 420_000,
                        "consecutiveNegativeRet1m": 0,
                        "consecutiveBookFailures": 0,
                        "peakBidPrice": 100_000_000,
                    },
                },
                initial_equity_krw=1_000_000,
                mode_intent="paper",
            )
            scenario = json.loads(scenario_path.read_text(encoding="utf-8"))
            snapshot_markets = [event["snapshot"]["market"] for event in scenario["events"] if event["type"] == "snapshot"]

            self.assertEqual(summary["syntheticCloseCount"], 0)
            self.assertIn(market, snapshot_markets)
            self.assertEqual(scenario["metadata"]["openPositionState"]["market"], market)

    def test_btc_trend_profile_materializes_entry_without_microstructure_confluence(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            run_id = "run-btc-trend-entry"
            market = "KRW-BTC"
            entry_ts = 1_775_134_500_000

            _write(
                canonical_path(base_dir, "trade_tick", "2026-04-02T12:15:00Z", run_id, market=market),
                [
                    {
                        "market": market,
                        "trade_timestamp_ms": entry_ts - 300_000,
                        "price": 100_000_000,
                        "volume": 0.01,
                        "side": "ASK",
                    },
                    {
                        "market": market,
                        "trade_timestamp_ms": entry_ts,
                        "price": 100_250_000,
                        "volume": 0.01,
                        "side": "ASK",
                    },
                ],
            )
            _write(
                canonical_path(base_dir, "orderbook_snapshot", "2026-04-02T12:15:00Z", run_id, market=market),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": entry_ts,
                        "capture_id": "trend-entry",
                        "best_bid_price": 100_240_000,
                        "best_ask_price": 100_250_000,
                        "source": "bithumb_rest",
                    }
                ],
            )
            _write(
                canonical_path(base_dir, "orderbook_level", "2026-04-02T12:15:00Z", run_id, market=market),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": entry_ts,
                        "capture_id": "trend-entry",
                        "level_index": 0,
                        "bid_size": 0.90,
                        "ask_size": 1.0,
                        "source": "bithumb_rest",
                    }
                ],
            )
            _write(
                canonical_path(base_dir, "passive_feature_snapshot", "2026-04-02T12:15:00Z", run_id, market=market),
                [
                    {
                        "market": market,
                        "event_timestamp_ms": entry_ts,
                        "capture_id": "trend-entry",
                        "ret_5m_bps": 22.0,
                        "buy_notional_share_60s": 0.42,
                        "depth_ratio_l5": 0.90,
                        "spread_bps": 2.0,
                        "turnover_24h_krw": 40_000_000_000.0,
                        "window_coverage_sec": 60.0,
                    }
                ],
            )

            default_path, default_summary = build_session_scenario(
                base_dir,
                run_id,
                initial_cash_krw=1_000_000,
                profile="v1",
            )
            trend_path, trend_summary = build_session_scenario(
                base_dir,
                run_id,
                initial_cash_krw=1_000_000,
                profile="btc_trend_v1",
            )
            default_signals = [
                event
                for event in json.loads(default_path.read_text(encoding="utf-8"))["events"]
                if event["type"] == "signal"
            ]
            trend_signals = [
                event["signal"]
                for event in json.loads(trend_path.read_text(encoding="utf-8"))["events"]
                if event["type"] == "signal"
            ]

            self.assertEqual(default_summary["entrySignalCount"], 0)
            self.assertEqual(default_signals, [])
            self.assertEqual(
                default_summary["entrySuppressedByGateFailure"],
                {"buy_notional_share_60s": 1, "depth_ratio_l5": 1},
            )
            self.assertEqual(
                default_summary["entrySuppressedGateFailureCombinations"],
                {"buy_notional_share_60s+depth_ratio_l5": 1},
            )
            self.assertEqual(
                default_summary["entrySuppressedGateFailureStats"]["depth_ratio_l5"],
                {
                    "count": 1,
                    "avgActual": 0.9,
                    "avgThreshold": 1.2,
                    "avgDeficit": 0.3,
                    "maxDeficit": 0.3,
                    "nearMissCount": 0,
                    "nearMissRate": 0.0,
                },
            )
            self.assertEqual(len(default_summary["suppressedEntrySamples"]), 1)
            suppressed_sample = default_summary["suppressedEntrySamples"][0]
            self.assertEqual(suppressed_sample["market"], market)
            self.assertEqual(suppressed_sample["suppressionReason"], "SUPPRESS_WEAK_CONFLUENCE")
            self.assertEqual(
                [gate["field"] for gate in suppressed_sample["failingGates"]],
                ["buy_notional_share_60s", "depth_ratio_l5"],
            )
            self.assertEqual(
                suppressed_sample["featureSnapshot"]["buy_notional_share_60s"],
                0.42,
            )
            self.assertEqual(suppressed_sample["bestAskPrice"], 100_250_000)
            self.assertEqual(trend_summary["entrySignalCount"], 1)
            self.assertEqual(trend_signals[0]["strategyId"], "bithumb_btc_trend_v1")
            self.assertEqual(trend_signals[0]["metadata"]["confidenceTier"], "medium")
