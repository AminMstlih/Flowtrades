"""
Bybit BTCUSDT Linear Perpetual publicTrade WebSocket client.

Connects to: wss://stream.bybit.com/v5/public/linear
Subscribes to: publicTrade.BTCUSDT

Bybit provides `S` as "Buy"/"Sell" (capitalized) — needs .lower().
Bybit can push up to 1024 trades in a single message.
"""

from __future__ import annotations

import structlog

from .base import BaseExchangeClient

logger = structlog.get_logger(__name__)


class BybitClient(BaseExchangeClient):
    """
    Bybit Linear Perpetual publicTrade stream client.

    Push data example:
    {
        "topic": "publicTrade.BTCUSDT",
        "type": "snapshot",
        "ts": 1672304486868,
        "data": [{
            "T": 1672304486865,     // trade time ms (int)
            "s": "BTCUSDT",         // symbol
            "S": "Buy",             // side — CAPITALIZED
            "v": "0.001",           // volume in BTC (str)
            "p": "16578.50",        // price (str)
            "L": "PlusTick",        // tick direction
            "i": "20f43950-...",    // trade ID (str)
            "BT": false             // block trade flag
        }]
    }
    """

    WS_URL = "wss://stream.bybit.com/v5/public/linear"

    def __init__(self, log_first_n: int = 100) -> None:
        super().__init__(exchange_name="bybit")
        self._log_first_n = log_first_n
        self._logged_count = 0

    @property
    def ws_url(self) -> str:
        return self.WS_URL

    def subscribe_message(self) -> dict | None:
        return {
            "op": "subscribe",
            "args": ["publicTrade.BTCUSDT"],
        }

    def parse_message(self, raw: dict | list) -> list[dict]:
        """
        Parse Bybit publicTrade push message.

        Bybit can push up to 1024 trades per message.
        Non-trade messages (subscription confirmations, pong) are filtered.
        """
        if not isinstance(raw, dict):
            return []

        # Subscription confirmation or pong via "op" key
        if "op" in raw:
            op = raw.get("op")
            success = raw.get("success", False)
            if op == "subscribe":
                if success:
                    logger.info("bybit_subscribed", conn_id=raw.get("conn_id"))
                else:
                    logger.error(
                        "bybit_subscription_error",
                        msg=raw.get("ret_msg"),
                    )
            # op == "pong" also handled here — all "op" messages are non-trade
            return []

        # Pong response without "op" key (legacy format)
        if raw.get("ret_msg") == "pong":
            return []

        # Trade data push
        topic = raw.get("topic", "")
        if not topic.startswith("publicTrade."):
            return []

        data = raw.get("data")
        if not data or not isinstance(data, list):
            return []

        trades = []
        for item in data:
            if self._logged_count < self._log_first_n:
                logger.debug(
                    "bybit_raw_payload",
                    payload=item,
                    count=self._logged_count + 1,
                )
                self._logged_count += 1

            trade_raw = {
                "exchange": "bybit",
                "symbol": "BTC-PERP-USDT",
                "price": item["p"],          # str
                "volume": item["v"],         # str
                "side": item["S"],           # "Buy" or "Sell" — capitalized
                "timestamp": item["T"],      # int ms
                "trade_id": item["i"],
                "raw": item,
            }
            trades.append(trade_raw)

        return trades
