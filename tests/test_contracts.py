import unittest

from org_coin_data.contracts import validate_record


class ContractsTest(unittest.TestCase):
    def test_trade_tick_contract_accepts_valid_record(self) -> None:
        record = {
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
            "capture_id": "abc123",
            "ingested_at": "2026-04-02T12:45:05Z",
        }
        self.assertEqual(validate_record("trade_tick", record), [])

    def test_trade_tick_contract_rejects_missing_required_field(self) -> None:
        record = {
            "dataset": "trade_tick",
            "schema_version": "v1",
            "market": "KRW-BTC",
        }
        errors = validate_record("trade_tick", record)
        self.assertTrue(any("missing required field: event_timestamp_ms" in error for error in errors))

    def test_passive_feature_snapshot_contract_accepts_valid_record(self) -> None:
        record = {
            "dataset": "passive_feature_snapshot",
            "schema_version": "v1",
            "market": "KRW-BTC",
            "event_timestamp_ms": 1775318400000,
            "date_kst": "2026-04-04",
            "reference_bar_ts": 1775318100000,
            "reference_price": 100000000,
            "latest_trade_ts": 1775318399000,
            "window_coverage_sec": 55.5,
            "trade_count_60s": 12,
            "notional_60s": 2500000,
            "ret_5m_bps": 12.5,
            "buy_notional_share_60s": 0.62,
            "depth_ratio_l5": 1.08,
            "spread_bps": 1.1,
            "turnover_24h_krw": 95000000000,
            "orderbook_event_timestamp_ms": 1775318400000,
            "source_run_id": "run123",
            "source": "org_coin_data_derived",
            "capture_id": "capture123",
            "ingested_at": "2026-04-04T00:00:00Z",
        }
        self.assertEqual(validate_record("passive_feature_snapshot", record), [])


if __name__ == "__main__":
    unittest.main()
