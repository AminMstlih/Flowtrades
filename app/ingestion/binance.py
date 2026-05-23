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
from constants.symbols import SYMBOL_MAP

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

    def __init__(self, internal_symbols: list[str], log_first_n: int = 100) -> None:
        super().__init__(exchange_name="binance")
        self.internal_symbols = internal_symbols
        self._log_first_n = log_first_n
        self._logged_count = 0

        streams = []
        for sym in self.internal_symbols:
            binance_sym = SYMBOL_MAP.get(sym, {}).get("binance")
            if binance_sym:
                streams.append(f"{binance_sym.lower()}@aggTrade")
        
        self._ws_url = f"wss://fstream.binance.com/stream?streams={'/'.join(streams)}"

    @property
    def ws_url(self) -> str:
        return self._ws_url

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

        # Handle combined stream payload wrapping
        data = raw.get("data", raw)

        event_type = data.get("e")
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

        binance_symbol = data.get("s", "")
        # Reverse lookup to find internal symbol
        internal_symbol = next(
            (k for k, v in SYMBOL_MAP.items() if v.get("binance") == binance_symbol), 
            binance_symbol
        )

        trade_raw = {
            "exchange": "binance",
            "symbol": internal_symbol,
            "price": data["p"],       # str → converted in normalizer
            "volume": data["q"],      # str → converted in normalizer
            "is_buyer_maker": data["m"],  # bool — normalizer handles inversion
            "timestamp": data["T"],   # Trade time (ms)
            "trade_id": str(data["a"]),  # Aggregate trade ID
            "raw": data,             # Preserve original for debugging
        }

        return [trade_raw]
