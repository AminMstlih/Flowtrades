"""
Abstract base class for all exchange WebSocket clients.

Every exchange client inherits from this and implements:
- ws_url: the WebSocket endpoint
- subscribe_message(): the subscription payload
- parse_message(raw): exchange-specific raw → dict parsing
"""

from __future__ import annotations

import abc
import asyncio
import json
import time
from typing import Any

import structlog
import websockets
from websockets.asyncio.client import connect as ws_connect

logger = structlog.get_logger(__name__)


class BaseExchangeClient(abc.ABC):
    """
    Async WebSocket client with exponential backoff reconnect.

    Subclasses implement ws_url, subscribe_message(), and parse_message().
    The base class handles connection lifecycle, reconnection, and heartbeats.
    """

    BACKOFF_BASE: float = 2.0  # Start at 2s (was 1s) for slower reconnection
    BACKOFF_MAX: float = 120.0  # Cap at 2 minutes (was 60s) to reduce spam
    MAX_RECONNECT_ATTEMPTS: int = 50  # Stop after ~50 attempts (~1 hour total)

    def __init__(self, exchange_name: str) -> None:
        self.exchange_name = exchange_name
        self._ws: Any = None
        self._running = False
        self._reconnect_count = 0
        self._total_messages = 0

    @property
    @abc.abstractmethod
    def ws_url(self) -> str:
        """WebSocket endpoint URL."""

    @abc.abstractmethod
    def subscribe_message(self) -> dict | None:
        """
        Return the subscription message to send after connect.
        Return None if subscription is implicit in the URL (e.g. Binance).
        """

    @abc.abstractmethod
    def parse_message(self, raw: dict | list) -> list[dict]:
        """
        Parse raw exchange message into a list of raw trade dicts.
        Returns empty list if message is not a trade (e.g. heartbeat, info).
        """

    async def start(self, callback) -> None:
        """
        Main loop: connect → subscribe → listen → on disconnect, reconnect.

        callback: async callable that receives each raw trade dict.
        """
        self._running = True
        while self._running:
            try:
                await self._connect_and_listen(callback)
            except (
                websockets.ConnectionClosed,
                websockets.InvalidStatusCode,
                ConnectionError,
                OSError,
                asyncio.TimeoutError,
            ) as e:
                if not self._running:
                    break
                self._reconnect_count += 1
                if self._reconnect_count > self.MAX_RECONNECT_ATTEMPTS:
                    logger.error(
                        "ws_max_reconnects_exceeded",
                        exchange=self.exchange_name,
                        attempts=self._reconnect_count,
                        max_attempts=self.MAX_RECONNECT_ATTEMPTS,
                    )
                    self._running = False
                    break
                delay = self._backoff_delay()
                logger.warning(
                    "ws_disconnected",
                    exchange=self.exchange_name,
                    error=str(e),
                    reconnect_in=delay,
                    reconnect_count=self._reconnect_count,
                )
                await asyncio.sleep(delay)
            except Exception as e:
                if not self._running:
                    break
                self._reconnect_count += 1
                if self._reconnect_count > self.MAX_RECONNECT_ATTEMPTS:
                    logger.error(
                        "ws_max_reconnects_exceeded",
                        exchange=self.exchange_name,
                        attempts=self._reconnect_count,
                        max_attempts=self.MAX_RECONNECT_ATTEMPTS,
                    )
                    self._running = False
                    break
                logger.error(
                    "ws_unexpected_error",
                    exchange=self.exchange_name,
                    error=str(e),
                    error_type=type(e).__name__,
                )
                delay = self._backoff_delay()
                await asyncio.sleep(delay)

    async def _connect_and_listen(self, callback) -> None:
        """Establish connection, subscribe, and enter listen loop."""
        logger.info("ws_connecting", exchange=self.exchange_name, url=self.ws_url)

        async with ws_connect(
            self.ws_url,
            ping_interval=30,    # Increased from 20 to 30 seconds (less aggressive)
            ping_timeout=15,     # Increased from 10 to 15 seconds (more tolerant)
            close_timeout=5,
        ) as ws:
            self._ws = ws
            self._reconnect_count = 0

            logger.info("ws_connected", exchange=self.exchange_name)

            # Send subscription message if needed
            sub_msg = self.subscribe_message()
            if sub_msg is not None:
                await ws.send(json.dumps(sub_msg))
                logger.info(
                    "ws_subscribed",
                    exchange=self.exchange_name,
                    channel=sub_msg,
                )

            # Listen loop
            async for message in ws:
                if not self._running:
                    break

                try:
                    data = json.loads(message)
                except (json.JSONDecodeError, TypeError):
                    logger.warning(
                        "ws_invalid_json",
                        exchange=self.exchange_name,
                        raw=str(message)[:200],
                    )
                    continue

                trades = self.parse_message(data)
                self._total_messages += 1

                for trade_raw in trades:
                    await callback(trade_raw)

    def _backoff_delay(self) -> float:
        """Exponential backoff: 1s, 2s, 4s, ... capped at 60s."""
        delay = min(
            self.BACKOFF_BASE * (2 ** self._reconnect_count),
            self.BACKOFF_MAX,
        )
        return delay

    async def stop(self) -> None:
        """Graceful shutdown."""
        self._running = False
        if self._ws is not None:
            await self._ws.close()
            logger.info("ws_stopped", exchange=self.exchange_name)

    @property
    def stats(self) -> dict:
        return {
            "exchange": self.exchange_name,
            "total_messages": self._total_messages,
            "reconnect_count": self._reconnect_count,
            "running": self._running,
        }
