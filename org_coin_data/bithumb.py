from __future__ import annotations

import asyncio
import json
from typing import Awaitable, Callable
from urllib.parse import urlencode
from urllib.request import urlopen

import websockets

from .config import REST_BASE_URL, WS_PUBLIC_URL


def _request_json(path: str, params: dict | None = None) -> list[dict]:
    url = f"{REST_BASE_URL}{path}"
    if params:
        url = f"{url}?{urlencode(params, doseq=True)}"
    with urlopen(url, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_market_catalog() -> list[dict]:
    return _request_json("/market/all", {"isDetails": "true"})


def fetch_candle_1m(market: str, count: int, to: str | None = None) -> list[dict]:
    params = {"market": market, "count": count}
    if to:
        params["to"] = to
    return _request_json("/candles/minutes/1", params)


def fetch_trade_ticks(market: str, count: int, to: str | None = None) -> list[dict]:
    params = {"market": market, "count": count}
    if to:
        params["to"] = to
    return _request_json("/trades/ticks", params)


def fetch_ticker(markets: list[str]) -> list[dict]:
    return _request_json("/ticker", {"markets": ",".join(markets)})


def fetch_orderbook(markets: list[str]) -> list[dict]:
    return _request_json("/orderbook", {"markets": ",".join(markets)})


async def capture_public_ws(
    *,
    markets: list[str],
    channels: list[str],
    duration_seconds: int,
    on_message: Callable[[dict], Awaitable[None]],
    on_idle: Callable[[], Awaitable[None]] | None = None,
) -> None:
    request = [{"ticket": "org-coin-paper"}]
    for channel in channels:
        request.append(
            {
                "type": channel,
                "codes": markets,
                "isOnlyRealtime": True,
            }
        )
    request.append({"format": "DEFAULT"})

    async with websockets.connect(
        WS_PUBLIC_URL,
        ping_interval=20,
        ping_timeout=20,
        close_timeout=5,
        max_size=None,
    ) as websocket:
        await websocket.send(json.dumps(request))
        deadline = asyncio.get_running_loop().time() + duration_seconds
        while True:
            remaining = deadline - asyncio.get_running_loop().time()
            if remaining <= 0:
                break
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=min(1.0, remaining))
            except asyncio.TimeoutError:
                if on_idle is not None:
                    await on_idle()
                continue
            if isinstance(message, bytes):
                message = message.decode("utf-8")
            await on_message(json.loads(message))

