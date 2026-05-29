"""
Exchange Supervisor — manages all exchange clients as independent async tasks.

Starts enabled clients, routes through normalizers, publishes to trade bus.
Each client handles its own reconnections. The supervisor monitors task health.
"""

from __future__ import annotations

import asyncio
from typing import Callable

import structlog

from config import AppConfig
from ingestion.base import BaseExchangeClient
from ingestion.binance import BinanceClient
from ingestion.okx import OKXClient
from ingestion.bybit import BybitClient
from normalization.binance_normalizer import normalize_binance_trade
from normalization.okx_normalizer import normalize_okx_trade
from normalization.bybit_normalizer import normalize_bybit_trade
from normalization.models import Trade
from trade_bus import TradeBus

logger = structlog.get_logger(__name__)


# Registry: exchange name → (client class, normalizer function)
EXCHANGE_REGISTRY: dict[str, tuple[type[BaseExchangeClient], Callable]] = {
    "binance": (BinanceClient, normalize_binance_trade),
    "okx": (OKXClient, normalize_okx_trade),
    "bybit": (BybitClient, normalize_bybit_trade),
}


class ExchangeSupervisor:
    """
    Manages all exchange WebSocket clients.

    Starts one async task per enabled exchange.
    Each task: client.start() → normalize → bus.publish()
    """

    def __init__(self, config: AppConfig, bus: TradeBus) -> None:
        self.config = config
        self.bus = bus
        self._clients: dict[str, BaseExchangeClient] = {}
        self._tasks: dict[str, asyncio.Task] = {}
        self._trade_counts: dict[str, int] = {}

    def _create_ingestion_callback(
        self, exchange_name: str, normalizer: Callable
    ) -> Callable:
        """Create a callback that normalizes and publishes trades."""

        async def on_raw_trade(raw: dict) -> None:
            try:
                trade: Trade = normalizer(raw)
                await self.bus.publish(trade)
                self._trade_counts[exchange_name] = (
                    self._trade_counts.get(exchange_name, 0) + 1
                )
            except Exception as e:
                logger.error(
                    "normalization_error",
                    exchange=exchange_name,
                    error=str(e),
                    raw_price=raw.get("price"),
                    raw_volume=raw.get("volume"),
                )

        return on_raw_trade

    async def start(self) -> None:
        """Start all enabled exchange clients as async tasks."""
        enabled = self.config.exchanges.enabled
        log_first_n = self.config.logging.log_first_n_raw

        logger.info("supervisor_starting", exchanges=enabled)

        for exchange_name in enabled:
            if exchange_name not in EXCHANGE_REGISTRY:
                logger.error(
                    "unknown_exchange",
                    exchange=exchange_name,
                    available=list(EXCHANGE_REGISTRY.keys()),
                )
                continue

            client_cls, normalizer = EXCHANGE_REGISTRY[exchange_name]
            client = client_cls(
                internal_symbols=self.config.exchanges.symbols,
                log_first_n=log_first_n
            )
            self._clients[exchange_name] = client

            callback = self._create_ingestion_callback(exchange_name, normalizer)

            task = asyncio.create_task(
                client.start(callback=callback),
                name=f"ingestion_{exchange_name}",
            )
            self._tasks[exchange_name] = task
            self._trade_counts[exchange_name] = 0

            logger.info("supervisor_started_client", exchange=exchange_name)

    async def stop(self) -> None:
        """Gracefully stop all exchange clients."""
        logger.info("supervisor_stopping")

        for exchange_name, client in self._clients.items():
            await client.stop()

        for exchange_name, task in self._tasks.items():
            task.cancel()

        if self._tasks:
            await asyncio.gather(
                *self._tasks.values(), return_exceptions=True
            )

        logger.info("supervisor_stopped", final_counts=self._trade_counts)

    @property
    def stats(self) -> dict:
        return {
            "exchanges": list(self._clients.keys()),
            "trade_counts": dict(self._trade_counts),
            "client_stats": {
                name: client.stats
                for name, client in self._clients.items()
            },
        }
