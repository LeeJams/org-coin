import json
import tempfile
import unittest
from pathlib import Path

from org_coin_data.passive_features import build_passive_feature_report
from org_coin_data.storage import append_jsonl, canonical_path


class PassiveFeatureReportTest(unittest.TestCase):
    def test_build_passive_feature_report_materializes_snapshot_dataset(self) -> None:
        run_id = "run123"
        market = "KRW-BTC"
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            self._write_trade_ticks(base_dir, run_id, market)
            self._write_ticker_event(base_dir, run_id, market)
            self._write_orderbook(base_dir, run_id, market)
            self._write_orderbook_levels(base_dir, run_id, market)

            json_path, markdown_path = build_passive_feature_report(base_dir, run_id)

            report = json.loads(json_path.read_text(encoding="utf-8"))
            self.assertTrue(markdown_path.exists())
            self.assertEqual(report["market_count"], 1)
            self.assertEqual(report["snapshot_count"], 1)
            self.assertFalse(report["threshold_tuning_ready"])

            market_report = report["markets"][0]
            self.assertEqual(market_report["market"], market)
            self.assertEqual(market_report["snapshot_count"], 1)
            self.assertEqual(market_report["date_kst_count"], 1)

            metrics = {metric["metric"]: metric for metric in market_report["metrics"]}
            self.assertAlmostEqual(metrics["ret_5m_bps"]["p50"], 700.0)
            self.assertAlmostEqual(metrics["buy_notional_share_60s"]["p50"], 317 / 422, places=6)
            self.assertAlmostEqual(metrics["depth_ratio_l5"]["p50"], 2.0)
            self.assertAlmostEqual(metrics["window_coverage_sec"]["p50"], 55.0)
            self.assertAlmostEqual(metrics["trade_count_60s"]["p50"], 4.0)
            self.assertAlmostEqual(metrics["notional_60s"]["p50"], 422.0)

            snapshot_path = canonical_path(
                base_dir,
                "passive_feature_snapshot",
                "2026-04-04T00:05:09Z",
                run_id,
                market=market,
            )
            records = [
                json.loads(line)
                for line in snapshot_path.read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
            self.assertEqual(len(records), 1)
            record = records[0]
            self.assertEqual(record["reference_bar_ts"], 1775260800000)
            self.assertEqual(record["latest_trade_ts"], 1775261105000)
            self.assertEqual(record["date_kst"], "2026-04-04")

    def _write_trade_ticks(self, base_dir: Path, run_id: str, market: str) -> None:
        path = canonical_path(
            base_dir,
            "trade_tick",
            "2026-04-04T00:05:10Z",
            run_id,
            market=market,
        )
        append_jsonl(
            path,
            [
                self._trade_tick(market, 1775260800000, 100, "BID"),
                self._trade_tick(market, 1775260860000, 101, "ASK"),
                self._trade_tick(market, 1775260920000, 102, "ASK"),
                self._trade_tick(market, 1775260980000, 103, "ASK"),
                self._trade_tick(market, 1775261050000, 104, "BID"),
                self._trade_tick(market, 1775261070000, 105, "ASK"),
                self._trade_tick(market, 1775261090000, 106, "BID"),
                self._trade_tick(market, 1775261105000, 107, "BID"),
            ],
        )

    def _write_ticker_event(self, base_dir: Path, run_id: str, market: str) -> None:
        path = canonical_path(
            base_dir,
            "ticker_event",
            "2026-04-04T00:05:10Z",
            run_id,
            market=market,
        )
        append_jsonl(
            path,
            [
                {
                    "dataset": "ticker_event",
                    "schema_version": "v1",
                    "market": market,
                    "event_timestamp_ms": 1775261110000,
                    "exchange_timestamp_raw": "1775261110000",
                    "trade_timestamp_ms": 1775261110000,
                    "opening_price": 100,
                    "high_price": 107,
                    "low_price": 99,
                    "trade_price": 107,
                    "prev_closing_price": 98,
                    "change": "RISE",
                    "change_price": 9,
                    "signed_change_price": 9,
                    "change_rate": 0.09,
                    "signed_change_rate": 0.09,
                    "trade_volume": 1,
                    "acc_trade_price": 500000,
                    "acc_trade_price_24h": 123456789,
                    "acc_trade_volume": 4000,
                    "acc_trade_volume_24h": 5000,
                    "ask_bid": "UNKNOWN",
                    "market_state": "ACTIVE",
                    "is_trading_suspended": False,
                    "delisting_date": "",
                    "market_warning": "NONE",
                    "stream_type": "REST_SNAPSHOT",
                    "source": "bithumb_rest",
                    "capture_id": "ticker-capture-1",
                    "ingested_at": "2026-04-04T00:05:10Z",
                }
            ],
        )

    def _write_orderbook(self, base_dir: Path, run_id: str, market: str) -> None:
        path = canonical_path(
            base_dir,
            "orderbook_snapshot",
            "2026-04-04T00:05:09Z",
            run_id,
            market=market,
        )
        append_jsonl(
            path,
            [
                {
                    "dataset": "orderbook_snapshot",
                    "schema_version": "v1",
                    "market": market,
                    "event_timestamp_ms": 1775261109000,
                    "exchange_timestamp_raw": "1775261109000",
                    "aggregation_level": 1,
                    "total_ask_size": 5,
                    "total_bid_size": 10,
                    "best_ask_price": 107.1,
                    "best_bid_price": 106.9,
                    "level_count": 5,
                    "stream_type": "REST_SNAPSHOT",
                    "source": "bithumb_rest",
                    "capture_id": "orderbook-capture-1",
                    "ingested_at": "2026-04-04T00:05:09Z",
                }
            ],
        )

    def _write_orderbook_levels(self, base_dir: Path, run_id: str, market: str) -> None:
        path = canonical_path(
            base_dir,
            "orderbook_level",
            "2026-04-04T00:05:09Z",
            run_id,
            market=market,
        )
        append_jsonl(
            path,
            [
                self._orderbook_level(market, 1775261109000, "orderbook-capture-1", 0, 1, 2),
                self._orderbook_level(market, 1775261109000, "orderbook-capture-1", 1, 1, 2),
                self._orderbook_level(market, 1775261109000, "orderbook-capture-1", 2, 1, 2),
                self._orderbook_level(market, 1775261109000, "orderbook-capture-1", 3, 1, 2),
                self._orderbook_level(market, 1775261109000, "orderbook-capture-1", 4, 1, 2),
            ],
        )

    def _trade_tick(self, market: str, timestamp_ms: int, price: float, side: str) -> dict:
        return {
            "dataset": "trade_tick",
            "schema_version": "v1",
            "market": market,
            "event_timestamp_ms": timestamp_ms,
            "exchange_timestamp_raw": str(timestamp_ms),
            "trade_timestamp_ms": timestamp_ms,
            "trade_date_utc": "2026-04-04",
            "trade_time_utc": "00:00:00",
            "price": price,
            "volume": 1.0,
            "side": side,
            "prev_closing_price": 98,
            "change": "RISE",
            "change_price": 1,
            "sequential_id": str(timestamp_ms),
            "stream_type": "REALTIME",
            "source": "bithumb_ws",
            "capture_id": f"trade-{timestamp_ms}",
            "ingested_at": "2026-04-04T00:00:00Z",
        }

    def _orderbook_level(
        self,
        market: str,
        timestamp_ms: int,
        capture_id: str,
        level_index: int,
        ask_size: float,
        bid_size: float,
    ) -> dict:
        return {
            "dataset": "orderbook_level",
            "schema_version": "v1",
            "market": market,
            "event_timestamp_ms": timestamp_ms,
            "exchange_timestamp_raw": str(timestamp_ms),
            "aggregation_level": 1,
            "level_index": level_index,
            "ask_price": 107.1 + level_index,
            "bid_price": 106.9 - level_index,
            "ask_size": ask_size,
            "bid_size": bid_size,
            "stream_type": "REST_SNAPSHOT",
            "source": "bithumb_rest",
            "capture_id": capture_id,
            "ingested_at": "2026-04-04T00:05:09Z",
        }


if __name__ == "__main__":
    unittest.main()
