"""
FastAPI WebSocket server — broadcasts footprint state to web clients.

Endpoints:
  GET  /           — health check
  WS   /ws/footprint — real-time footprint state broadcast

Broadcasts serialized state every refresh_rate_ms to all connected clients.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import structlog
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from output.serializer import serialize_state
from state.state import FootprintState

logger = structlog.get_logger(__name__)


def create_app(
    state: FootprintState,
    num_rows: int = 20,
    refresh_rate_ms: int = 500,
    cors_origins: list[str] | None = None,
    enabled_exchanges: list[str] | None = None,
    serve_frontend: bool = True,
) -> FastAPI:
    """Create the FastAPI application with WebSocket broadcast."""

    app = FastAPI(title="BTC Order Flow Lite", version="2.0")

    # CORS for frontend dev server
    if cors_origins is None:
        cors_origins = ["http://localhost:5173", "http://localhost:3000"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Track connected clients
    connected_clients: list[WebSocket] = []

    @app.get("/health")
    async def health():
        stats = state.stats
        return {
            "status": "ok",
            "product": "BTC Order Flow Lite",
            "version": "2.0",
            "total_trades": stats["total_trades_processed"],
            "active_buckets": stats["active_buckets"],
            "connected_clients": len(connected_clients),
        }

    @app.websocket("/ws/footprint")
    async def footprint_ws(ws: WebSocket, window: int = 5):
        await ws.accept()
        connected_clients.append(ws)
        client_id = id(ws)
        logger.info("ws_client_connected", client_id=client_id, total=len(connected_clients))

        # Backpressure: if a single send takes longer than this, client is too slow
        SEND_TIMEOUT_SEC = 2.0
        consecutive_timeouts = 0
        MAX_CONSECUTIVE_TIMEOUTS = 5

        try:
            while True:
                # Serialize current state
                payload = serialize_state(state, num_rows, enabled_exchanges, window)
                payload_json = json.dumps(payload)

                # Send with timeout — drop slow clients to prevent OOM
                try:
                    await asyncio.wait_for(
                        ws.send_text(payload_json),
                        timeout=SEND_TIMEOUT_SEC,
                    )
                    consecutive_timeouts = 0
                except asyncio.TimeoutError:
                    consecutive_timeouts += 1
                    logger.warning(
                        "ws_client_slow",
                        client_id=client_id,
                        consecutive_timeouts=consecutive_timeouts,
                        payload_bytes=len(payload_json),
                    )
                    if consecutive_timeouts >= MAX_CONSECUTIVE_TIMEOUTS:
                        logger.error(
                            "ws_client_dropped",
                            client_id=client_id,
                            reason="persistent_slow_client",
                        )
                        break

                # Wait for next refresh cycle
                await asyncio.sleep(refresh_rate_ms / 1000.0)

        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.warning(
                "ws_client_error",
                client_id=client_id,
                error=str(e),
            )
        finally:
            if ws in connected_clients:
                connected_clients.remove(ws)
            logger.info(
                "ws_client_disconnected",
                client_id=client_id,
                remaining=len(connected_clients),
            )

    # Mount static files LAST (after all routes are defined)
    # This prevents StaticFiles from intercepting WebSocket connections
    if serve_frontend:
        frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
        if frontend_dist.exists():
            app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
            logger.info("frontend_served_from", path=str(frontend_dist))
        else:
            logger.warning("frontend_dist_not_found", path=str(frontend_dist))

    return app
