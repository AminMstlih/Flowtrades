"""
OKX BTC-USDT-SWAP WebSocket trades client.

Connects to: wss://ws.okx.com:8443/ws/v5/public
Subscribes to: trades channel for BTC-USDT-SWAP

OKX provides `side` directly as "buy"/"sell" — no inversion needed.
OKX aggregates trades: `count` field shows number of fills per message.
OKX requires explicit subscription after connection + periodic ping.
"""

from __future__ import annotations

import structlog

from .base import BaseExchangeClient

logger = structlog.get_logger(__name__)


class OKXClient(BaseExchangeClient):
    """
    OKX Perpetual Swap trades stream client.

    Push data example:
    {
        "arg": {"channel": "trades", "instId": "BTC-USDT-SWAP"},
        "data": [{
            "instId": "BTC-USDT-SWAP",
            "tradeId": "130639474",
            "px": "42219.9",       // price (str)
            "sz": "0.12060306",    // size in BTC (str)
            "side": "buy",         // aggressor side — direct, no inversion
            "ts": "1630048897897", // timestamp ms (str)
            "count": "3"           // aggregated fill count
        }]
    }
    """

    WS_URL = "wss://ws.okx.com:8443/ws/v5/public"

    def __init__(self, log_first_n: int = 100) -> None:
        super().__init__(exchange_name="okx")
        self._log_first_n = log_first_n
        self._logged_count = 0

    @property
    def ws_url(self) -> str:
        return self.WS_URL

    def subscribe_message(self) -> dict | None:
        return {
            "op": "subscribe",
            "args": [{"channel": "trades", "instId": "BTC-USDT-SWAP"}],
        }

    def parse_message(self, raw: dict | list) -> list[dict]:
        """
        Parse OKX trades push message.

        OKX can push multiple trades in one message via the `data` array.
        Non-trade messages (subscription confirmations, pong) are filtered.
        """
        if not isinstance(raw, dict):
            return []

        # Subscription confirmation or event message
        if "event" in raw:
            event = raw.get("event")
            if event == "subscribe":
                logger.info("okx_subscribed", channel=raw.get("arg"))
            elif event == "error":
                logger.error(
                    "okx_subscription_error",
                    code=raw.get("code"),
                    msg=raw.get("msg"),
                )
            return []

        # Trade data push
        data = raw.get("data")
        if not data or not isinstance(data, list):
            return []

        arg = raw.get("arg", {})
        channel = arg.get("channel")
        if channel != "trades":
            return []

        trades = []
        for item in data:
            if self._logged_count < self._log_first_n:
                logger.debug(
                    "okx_raw_payload",
                    payload=item,
                    count=self._logged_count + 1,
                )
                self._logged_count += 1

            trade_raw = {
                "exchange": "okx",
                "symbol": "BTC-PERP-USDT",
                "price": item["px"],        # str → normalizer converts
                "volume": item["sz"],        # str → normalizer converts
                "side": item["side"],        # already "buy" or "sell"
                "timestamp": item["ts"],     # str ms → normalizer converts
                "trade_id": item["tradeId"],
                "raw": item,
            }
            trades.append(trade_raw)

        return trades
