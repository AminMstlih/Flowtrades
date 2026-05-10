"""
Trade Bus — in-memory async queue routing normalized trades to consumers.

Thin wrapper around asyncio.Queue with backpressure monitoring.
Max queue size: 10,000 trades (~10-20s buffer at peak).
"""

from __future__ import annotations

import asyncio
from typing import AsyncIterator

import structlog

from normalization.models import Trade

logger = structlog.get_logger(__name__)

QUEUE_MAX_SIZE = 10_000
BACKPRESSURE_WARN_PCT = 0.80


class TradeBus:
    """
    Async trade message bus.

    Publishers call publish(). Consumers iterate via subscribe().
    Logs warnings when queue fills beyond 80%.
    """

    def __init__(self, maxsize: int = QUEUE_MAX_SIZE) -> None:
        self._queue: asyncio.Queue[Trade] = asyncio.Queue(maxsize=maxsize)
        self._maxsize = maxsize
        self._published = 0
        self._warn_threshold = int(maxsize * BACKPRESSURE_WARN_PCT)

    async def publish(self, trade: Trade) -> None:
        """Put a normalized trade on the bus."""
        qsize = self._queue.qsize()

        if qsize >= self._warn_threshold and qsize % 1000 == 0:
            logger.warning(
                "trade_bus_backpressure",
                queue_size=qsize,
                max_size=self._maxsize,
                pct_full=round(qsize / self._maxsize * 100, 1),
            )

        await self._queue.put(trade)
        self._published += 1

    async def subscribe(self) -> AsyncIterator[Trade]:
        """Yield trades from the bus. Blocks when empty."""
        while True:
            trade = await self._queue.get()
            yield trade
            self._queue.task_done()

    @property
    def stats(self) -> dict:
        return {
            "published": self._published,
            "current_size": self._queue.qsize(),
            "max_size": self._maxsize,
        }
