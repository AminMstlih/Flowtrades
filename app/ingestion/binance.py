"""
Binance BTCUSDT Perpetual aggTrade WebSocket client.

Connects to: wss://fstream.binance.com/ws/btcusdt@aggTrade
The aggTrade stream aggregates multiple fills into single trade events.

CRITICAL DATA NOTE:
  Binance's `m` field is the "is buyer maker" flag.
  m=True  → buyer was the MAKER → aggressor is SELLER → side = "sell"
  m=False → seller was the maker → aggressor is BUYER → side = "buy"
  Getting this wrong inverts every delta downstream.
"""

from __future__ import annotations

from typing import Any

import structlog

from .base import BaseExchangeClient

logger = structlog.get_logger(__name__)


class BinanceClient(BaseExchangeClient):
    """
    Binance Futures aggTrade stream client.

    aggTrade payload example:
    {
        "e": "aggTrade",
        "E": 1672515782136,   // Event time
        "a": 164753889,       // Aggregate trade ID
        "s": "BTCUSDT",       // Symbol
        "p": "67250.10",      // Price
        "q": "0.500",         // Quantity (BTC)
        "f": 318471023,       // First trade ID
        "l": 318471025,       // Last trade ID
        "T": 1672515782120,   // Trade time
        "m": true             // Is buyer maker?
    }
    """

    WS_URL = "wss://fstream.binance.com/ws/btcusdt@aggTrade"

    def __init__(self, log_first_n: int = 100) -> None:
        super().__init__(exchange_name="binance")
        self._log_first_n = log_first_n
        self._logged_count = 0

    @property
    def ws_url(self) -> str:
        return self.WS_URL

    def subscribe_message(self) -> dict | None:
        # Binance: subscription is implicit in the URL path
        return None

    def parse_message(self, raw: dict | list) -> list[dict]:
        """
        Parse Binance aggTrade message.

        Returns a list with a single raw trade dict, or empty list
        if the message is not an aggTrade event.
        """
        if not isinstance(raw, dict):
            return []

        event_type = raw.get("e")
        if event_type != "aggTrade":
            # Could be a subscription confirmation or other event
            logger.debug(
                "binance_non_trade_event",
                event_type=event_type,
            )
            return []

        # Log first N raw payloads for manual verification
        if self._logged_count < self._log_first_n:
            logger.debug(
                "binance_raw_payload",
                payload=raw,
                count=self._logged_count + 1,
            )
            self._logged_count += 1

        trade_raw = {
            "exchange": "binance",
            "symbol": "BTC-PERP-USDT",
            "price": raw["p"],       # str → converted in normalizer
            "volume": raw["q"],      # str → converted in normalizer
            "is_buyer_maker": raw["m"],  # bool — normalizer handles inversion
            "timestamp": raw["T"],   # Trade time (ms)
            "trade_id": str(raw["a"]),  # Aggregate trade ID
            "raw": raw,             # Preserve original for debugging
        }

        return [trade_raw]
