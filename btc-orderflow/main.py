"""
BTC Order Flow Lite — Main Entry Point (v2)

Multi-exchange async orchestrator with FastAPI WebSocket server.

Pipeline:
  Exchange Supervisor (Binance + OKX + Bybit)
    → Normalize → Trade Bus
    → Aggregation Task → FootprintState
    → FastAPI WS Server → React Frontend

Run: python main.py
"""

from __future__ import annotations

import asyncio
import os
import signal
import sys
from pathlib import Path

import structlog
import uvicorn

from config import load_config
from ingestion.supervisor import ExchangeSupervisor
from output.ws_server import create_app
from state.state import FootprintState
from trade_bus import TradeBus

# ── Structured Logging Setup ────────────────────────────────────

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(20),  # INFO
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger("main")


async def aggregation_task(
    bus: TradeBus,
    state: FootprintState,
) -> None:
    """
    Consume trades from bus → update footprint state.
    State.process_trade() handles eviction + aggregation internally.
    """
    async for trade in bus.subscribe():
        state.process_trade(trade)


async def main() -> None:
    """
    Main async orchestrator.

    Starts:
      1. Exchange Supervisor (manages all WS clients)
      2. Aggregation task (bus → state)
      3. FastAPI + uvicorn server (state → web clients)
    
    Environment Variables:
      FLOWTRADES_DEV_MODE=1 - Skip serving built frontend (use Vite dev server instead)
    """
    # Check if running in dev mode
    dev_mode = os.getenv("FLOWTRADES_DEV_MODE", "0") == "1"
    serve_frontend = not dev_mode
    # ── Load Config ──────────────────────────────────────────
    config_path = Path(__file__).parent / "config.toml"
    config = load_config(config_path)

    logger.info(
        "starting",
        bucket_size=config.aggregation.bucket_size_usd,
        window=config.aggregation.default_window,
        exchanges=config.exchanges.enabled,
        display_rows=config.display.rows,
        refresh_ms=config.display.refresh_rate_ms,
    )

    # ── Initialize Components ────────────────────────────────
    bus = TradeBus()

    window_seconds = config.aggregation.default_window * 60
    state = FootprintState(
        bucket_size=config.aggregation.bucket_size_usd,
        window_seconds=window_seconds,
        min_volume_btc=config.detection.min_volume_per_bucket_btc,
        imbalance_threshold_pct=config.detection.imbalance_threshold_pct,
        absorption_vol_percentile=config.detection.absorption_vol_percentile,
        absorption_price_pct=config.detection.absorption_price_pct,
    )

    supervisor = ExchangeSupervisor(config=config, bus=bus)

    # Create FastAPI app
    app = create_app(
        state=state,
        num_rows=config.display.rows,
        refresh_rate_ms=config.display.refresh_rate_ms,
        enabled_exchanges=config.exchanges.enabled,
        serve_frontend=serve_frontend,
    )

    # ── Start Tasks ──────────────────────────────────────────
    # Start supervisor (launches all exchange clients)
    await supervisor.start()

    # Aggregation task
    agg_task = asyncio.create_task(
        aggregation_task(bus, state), name="aggregation"
    )

    # Uvicorn server
    uvicorn_config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="warning",
        access_log=False,
    )
    server = uvicorn.Server(uvicorn_config)

    server_task = asyncio.create_task(
        server.serve(), name="server"
    )

    logger.info("server_started", url="http://localhost:8000")
    if dev_mode:
        logger.info("dev_mode_active", frontend_url="http://localhost:5173")
    else:
        logger.info("production_mode", frontend_served="http://localhost:8000")
    logger.info(
        "ws_endpoint",
        url="ws://localhost:8000/ws/footprint",
    )

    # ── Shutdown Handler ─────────────────────────────────────
    shutdown_event = asyncio.Event()

    def _signal_handler(sig, frame):
        logger.info("shutdown_requested", signal=sig)
        shutdown_event.set()

    signal.signal(signal.SIGINT, _signal_handler)
    if sys.platform != "win32":
        signal.signal(signal.SIGTERM, _signal_handler)

    shutdown_task = asyncio.create_task(
        shutdown_event.wait(), name="shutdown_wait"
    )

    try:
        # Wait for shutdown signal or task failure
        tasks = [agg_task, server_task]
        done, pending = await asyncio.wait(
            tasks + [shutdown_task],
            return_when=asyncio.FIRST_COMPLETED,
        )

        for task in done:
            if task is shutdown_task:
                continue
            exc = task.exception() if not task.cancelled() else None
            if exc is not None:
                logger.error(
                    "task_failed",
                    task=task.get_name(),
                    error=str(exc),
                )

    except asyncio.CancelledError:
        pass
    finally:
        logger.info("shutting_down")
        await supervisor.stop()
        server.should_exit = True

        agg_task.cancel()
        server_task.cancel()
        shutdown_task.cancel()
        await asyncio.gather(agg_task, server_task, shutdown_task, return_exceptions=True)

        logger.info(
            "shutdown_complete",
            supervisor_stats=supervisor.stats,
        )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
