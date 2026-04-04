import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from org_coin_data.observability import Observability
from org_coin_data.pipeline import (
    build_quality_report,
    build_replay_manifest,
    build_run_replay_manifest,
    normalize_orderbook,
    normalize_ticker_event,
    normalize_trade_tick,
    run_bootstrap_session,
)
from org_coin_data.storage import append_jsonl, canonical_path


class PipelineTest(unittest.TestCase):
    def test_normalize_trade_tick_preserves_large_identifier_as_string(self) -> None:
        payload = {
            "type": "trade",
            "code": "KRW-BTC",
            "trade_price": 100853000,
            "trade_volume": 0.00009915,
            "ask_bid": "BID",
            "prev_closing_price": 103528000,
            "change": "FALL",
            "change_price": 2675000,
            "trade_timestamp": 1775133904943,
            "sequential_id": 576649856999777590,
            "timestamp": 1775133905256,
            "stream_type": "REALTIME",
        }
        record = normalize_trade_tick(payload, "capture1", "2026-04-02T12:45:05Z", "bithumb_ws")
        self.assertEqual(record["sequential_id"], "576649856999777590")

    def test_normalize_trade_tick_derives_change_when_rest_payload_omits_it(self) -> None:
        payload = {
            "market": "KRW-BTC",
            "trade_price": 100817000,
            "trade_volume": 0.00069919,
            "prev_closing_price": 103528000,
            "change_price": -2711000,
            "ask_bid": "ASK",
            "timestamp": 1775133648354,
            "sequential_id": 17751336483540000,
        }
        record = normalize_trade_tick(payload, "capture2", "2026-04-02T12:40:48Z", "bithumb_rest")
        self.assertEqual(record["change"], "FALL")

    def test_normalize_orderbook_converts_microsecond_timestamp(self) -> None:
        payload = {
            "type": "orderbook",
            "code": "KRW-BTC",
            "total_ask_size": 0.844,
            "total_bid_size": 10.4343,
            "orderbook_units": [
                {
                    "ask_price": 100821000,
                    "bid_price": 100818000,
                    "ask_size": 0.0006,
                    "bid_size": 0.0254,
                }
            ],
            "level": 1,
            "timestamp": 1775133765564105,
            "stream_type": "REALTIME",
        }
        snapshot, levels = normalize_orderbook(
            payload, "capture2", "2026-04-02T12:42:45Z", "bithumb_ws"
        )
        self.assertEqual(snapshot["event_timestamp_ms"], 1775133765564)
        self.assertEqual(levels[0]["event_timestamp_ms"], 1775133765564)

    def test_normalize_ticker_event_defaults_missing_rest_only_fields(self) -> None:
        payload = {
            "market": "KRW-BTC",
            "trade_timestamp": 1775166283833,
            "opening_price": 103543000,
            "high_price": 104153000,
            "low_price": 100596000,
            "trade_price": 100861000,
            "prev_closing_price": 103528000,
            "change": "FALL",
            "change_price": 2666000,
            "signed_change_price": -2666000,
            "change_rate": 0.0258,
            "signed_change_rate": -0.0258,
            "trade_volume": 0.00246881,
            "acc_trade_price": 59425082702.04681,
            "acc_trade_price_24h": 68542352803.87309,
            "acc_trade_volume": 581.44817469,
            "acc_trade_volume_24h": 669.71106417,
            "highest_52_week_price": 179734000,
            "highest_52_week_date": "2025-10-10",
            "lowest_52_week_price": 81110000,
            "lowest_52_week_date": "2026-02-07",
            "timestamp": 1775166283833,
        }
        record = normalize_ticker_event(payload, "capture3", "2026-04-02T12:44:43Z", "bithumb_rest")
        self.assertEqual(record["ask_bid"], "UNKNOWN")
        self.assertEqual(record["market_state"], "UNKNOWN")

    def test_manifest_summarizes_written_canonical_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            obs = Observability(base_dir, "run123", 10_000)
            path = canonical_path(
                base_dir,
                "trade_tick",
                "2026-04-02T12:45:05Z",
                obs.run_id,
                market="KRW-BTC",
            )
            append_jsonl(
                path,
                [
                    {
                        "dataset": "trade_tick",
                        "schema_version": "v1",
                        "market": "KRW-BTC",
                        "event_timestamp_ms": 1775133905256,
                        "exchange_timestamp_raw": "1775133905256",
                        "trade_timestamp_ms": 1775133904943,
                        "trade_date_utc": "2026-04-02",
                        "trade_time_utc": "12:45:04",
                        "price": 100853000,
                        "volume": 0.00009915,
                        "side": "BID",
                        "prev_closing_price": 103528000,
                        "change": "FALL",
                        "change_price": 2675000,
                        "sequential_id": "576649856999777590",
                        "stream_type": "REALTIME",
                        "source": "bithumb_ws",
                        "capture_id": "capture1",
                        "ingested_at": "2026-04-02T12:45:05Z",
                    }
                ],
            )
            manifest_path = build_replay_manifest(base_dir, "run123")
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertIn("trade_tick", manifest["datasets"])
            self.assertEqual(manifest["datasets"]["trade_tick"][0]["record_count"], 1)

    def test_run_manifest_filters_to_requested_run(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            first_path = canonical_path(
                base_dir,
                "trade_tick",
                "2026-04-02T12:45:05Z",
                "run123",
                market="KRW-BTC",
            )
            second_path = canonical_path(
                base_dir,
                "trade_tick",
                "2026-04-02T12:46:05Z",
                "run999",
                market="KRW-ETH",
            )
            append_jsonl(first_path, [{"dataset": "trade_tick", "event_timestamp_ms": 1775133905256}])
            append_jsonl(second_path, [{"dataset": "trade_tick", "event_timestamp_ms": 1775133965256}])

            manifest_path = build_run_replay_manifest(base_dir, "run123")
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

            self.assertEqual(manifest["scope"], "run")
            self.assertEqual(manifest["source_run_id"], "run123")
            self.assertEqual(manifest["total_record_count"], 1)
            self.assertEqual(len(manifest["datasets"]["trade_tick"]), 1)
            self.assertEqual(manifest["datasets"]["trade_tick"][0]["market"], "KRW-BTC")
            self.assertEqual(manifest["datasets"]["trade_tick"][0]["source_run_id"], "run123")

    def test_quality_report_summarizes_market_counts_and_freshness(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            path = canonical_path(
                base_dir,
                "trade_tick",
                "2026-04-02T12:45:05Z",
                "run123",
                market="KRW-BTC",
            )
            append_jsonl(
                path,
                [
                    {
                        "dataset": "trade_tick",
                        "event_timestamp_ms": 1775133905256,
                        "ingested_at": "2026-04-02T12:45:05Z",
                    },
                    {
                        "dataset": "trade_tick",
                        "event_timestamp_ms": 1775133906256,
                        "ingested_at": "2026-04-02T12:45:06Z",
                    },
                ],
            )
            append_jsonl(
                base_dir / "observability" / "freshness_alert.ndjson",
                [
                    {
                        "run_id": "run123",
                        "dataset": "trade_tick",
                        "market": "KRW-BTC",
                        "gap_ms": 12_500,
                        "freshness_sla_ms": 10_000,
                        "last_seen_event_timestamp_ms": 1775133906256,
                        "alerted_at": "2026-04-02T12:45:20Z",
                    }
                ],
            )
            append_jsonl(
                base_dir / "observability" / "schema_validation_counter.ndjson",
                [
                    {
                        "run_id": "run123",
                        "dataset": "trade_tick",
                        "validated": 2,
                        "accepted": 2,
                        "rejected": 0,
                        "emitted_at": "2026-04-02T12:45:20Z",
                    }
                ],
            )

            json_path, markdown_path = build_quality_report(base_dir, "run123", 10_000)
            report = json.loads(json_path.read_text(encoding="utf-8"))

            self.assertTrue(markdown_path.exists())
            self.assertEqual(report["source_run_id"], "run123")
            self.assertEqual(report["total_record_count"], 2)
            self.assertEqual(report["market_count"], 1)
            market = report["markets"][0]
            self.assertEqual(market["market"], "KRW-BTC")
            self.assertEqual(market["record_count"], 2)
            dataset = market["datasets"][0]
            self.assertEqual(dataset["dataset"], "trade_tick")
            self.assertEqual(dataset["record_count"], 2)
            self.assertEqual(dataset["freshness_alert_count"], 1)
            self.assertEqual(dataset["max_gap_ms"], 12_500)
            self.assertIsNotNone(dataset["latest_event_age_ms"])
            self.assertEqual(report["validation"][0]["accepted"], 2)

    @patch("org_coin_data.pipeline.build_quality_report")
    @patch("org_coin_data.pipeline.build_run_replay_manifest")
    @patch("org_coin_data.pipeline.capture_live_public_data", new_callable=AsyncMock)
    @patch("org_coin_data.pipeline.capture_rest_snapshots")
    @patch("org_coin_data.pipeline.backfill_trade_ticks")
    @patch("org_coin_data.pipeline.backfill_candle_1m")
    @patch("org_coin_data.pipeline.ingest_market_catalog")
    @patch("org_coin_data.pipeline.new_capture_id", return_value="run123")
    def test_run_bootstrap_session_reuses_one_run_id_for_repeated_capture(
        self,
        _new_capture_id,
        ingest_market_catalog_mock,
        backfill_candle_mock,
        backfill_trade_mock,
        capture_rest_mock,
        capture_live_mock,
        build_manifest_mock,
        build_quality_mock,
    ) -> None:
        build_manifest_mock.return_value = Path("/tmp/manifest-run123.json")
        build_quality_mock.return_value = (
            Path("/tmp/quality-run123.json"),
            Path("/tmp/quality-run123.md"),
        )

        result = run_bootstrap_session(
            Path("/tmp"),
            ["KRW-BTC"],
            candle_count=10,
            trade_count=20,
            ws_seconds=0,
            channels=["ticker"],
            iterations=3,
            interval_seconds=0,
            freshness_sla_ms=10_000,
        )

        ingest_market_catalog_mock.assert_called_once()
        backfill_candle_mock.assert_called_once()
        backfill_trade_mock.assert_called_once()
        self.assertEqual(capture_rest_mock.call_count, 3)
        self.assertEqual(capture_live_mock.call_count, 3)
        build_manifest_mock.assert_called_once_with(Path("/tmp"), "run123")
        build_quality_mock.assert_called_once_with(Path("/tmp"), "run123", 10_000)
        self.assertEqual(result["run_id"], "run123")
        self.assertEqual(result["iterations"], 3)


if __name__ == "__main__":
    unittest.main()
