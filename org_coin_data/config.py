from __future__ import annotations

from pathlib import Path

DEFAULT_MARKETS = ["KRW-BTC", "KRW-ETH", "KRW-XRP"]
DEFAULT_DATA_DIR = Path("var/data")
DEFAULT_FRESHNESS_SLA_MS = 10_000
DEFAULT_CANDLE_COUNT = 180
DEFAULT_TRADE_COUNT = 200
DEFAULT_WS_SECONDS = 15
REST_BASE_URL = "https://api.bithumb.com/v1"
WS_PUBLIC_URL = "wss://ws-api.bithumb.com/websocket/v1"
SUPPORTED_DATASETS = {
    "market_catalog",
    "candle_1m",
    "trade_tick",
    "ticker_event",
    "orderbook_snapshot",
    "orderbook_level",
}


def parse_markets(value: str | None) -> list[str]:
    if not value:
        return list(DEFAULT_MARKETS)
    return [item.strip().upper() for item in value.split(",") if item.strip()]
