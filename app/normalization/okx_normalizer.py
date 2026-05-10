"""
OKX trade normalizer.

Maps raw OKX trade dict → canonical Trade model.

OKX provides side directly — no inversion logic needed.
All string fields (px, sz, ts) must be converted to float/int.
"""

from __future__ import annotations

import structlog

from normalization.models import Trade

logger = structlog.get_logger(__name__)


def normalize_okx_trade(raw: dict) -> Trade:
    """
    Convert raw OKX trade dict to canonical Trade.

    Args:
        raw: Dict from OKXClient.parse_message() containing:
            exchange, symbol, price (str), volume (str),
            side (str "buy"|"sell"), timestamp (str ms),
            trade_id (str), raw (dict)

    Raises:
        ValueError: If side is not "buy" or "sell".
        KeyError: If raw dict structure is unexpected.
    """
    side = raw.get("side")
    
    # Validate side — OKX provides it directly but must be exactly "buy" or "sell"
    if side not in ("buy", "sell"):
        logger.error(
            "okx_invalid_side_field",
            trade_id=raw.get("trade_id", "unknown"),
            side=side,
            raw_type=type(side).__name__,
        )
        raise ValueError(
            f"Invalid side for trade {raw.get('trade_id', 'unknown')}: "
            f"expected 'buy' or 'sell', got {side!r}"
        )
    
    return Trade(
        exchange=raw["exchange"],
        symbol=raw["symbol"],
        price=float(raw["price"]),
        volume=float(raw["volume"]),
        side=side,  # Already "buy" or "sell" — no inversion
        timestamp=int(raw["timestamp"]),
        trade_id=raw["trade_id"],
        raw=raw.get("raw", {}),
    )
