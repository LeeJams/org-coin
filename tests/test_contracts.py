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


if __name__ == "__main__":
    unittest.main()

