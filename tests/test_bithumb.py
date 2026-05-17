import asyncio
import json
import unittest
from unittest.mock import AsyncMock, patch

from websockets.exceptions import ConnectionClosedOK

from org_coin_data.bithumb import capture_public_ws


class _FakeWebSocket:
    def __init__(self, responses):
        self._responses = list(responses)
        self.sent_payloads = []

    async def send(self, payload: str) -> None:
        self.sent_payloads.append(json.loads(payload))

    async def recv(self):
        if not self._responses:
            raise asyncio.TimeoutError()
        response = self._responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class _FakeConnectContext:
    def __init__(self, websocket):
        self.websocket = websocket

    async def __aenter__(self):
        return self.websocket

    async def __aexit__(self, exc_type, exc, tb):
        return False


class CapturePublicWsTest(unittest.IsolatedAsyncioTestCase):
    async def test_capture_public_ws_reconnects_after_connection_close(self) -> None:
        first_socket = _FakeWebSocket(
            [
                json.dumps({"type": "ticker", "code": "KRW-BTC"}),
                ConnectionClosedOK(None, None),
            ]
        )
        second_socket = _FakeWebSocket(
            [
                json.dumps({"type": "trade", "code": "KRW-BTC"}),
            ]
        )
        connect_contexts = [
            _FakeConnectContext(first_socket),
            _FakeConnectContext(second_socket),
            _FakeConnectContext(_FakeWebSocket([])),
        ]
        received = []

        async def fast_sleep(_delay: float) -> None:
            return None

        async def on_message(message: dict) -> None:
            received.append(message["type"])

        with patch(
            "org_coin_data.bithumb.websockets.connect",
            side_effect=connect_contexts,
        ) as connect_mock, patch(
            "org_coin_data.bithumb.asyncio.sleep",
            new=AsyncMock(side_effect=fast_sleep),
        ):
            await capture_public_ws(
                markets=["KRW-BTC"],
                channels=["ticker", "trade"],
                duration_seconds=0.05,
                on_message=on_message,
            )

        self.assertGreaterEqual(connect_mock.call_count, 2)
        self.assertEqual(received[:2], ["ticker", "trade"])
        self.assertTrue(first_socket.sent_payloads)
        self.assertTrue(second_socket.sent_payloads)

    async def test_capture_public_ws_calls_on_idle_while_reconnecting(self) -> None:
        idle_calls = 0

        async def on_idle() -> None:
            nonlocal idle_calls
            idle_calls += 1

        with patch(
            "org_coin_data.bithumb.websockets.connect",
            side_effect=ConnectionClosedOK(None, None),
        ), patch(
            "org_coin_data.bithumb.asyncio.sleep",
            new=AsyncMock(return_value=None),
        ):
            await capture_public_ws(
                markets=["KRW-BTC"],
                channels=["ticker"],
                duration_seconds=0.02,
                on_message=AsyncMock(),
                on_idle=on_idle,
            )

        self.assertGreater(idle_calls, 0)


if __name__ == "__main__":
    unittest.main()
