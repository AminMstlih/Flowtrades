"""
Bybit trade normalizer.

Maps raw Bybit trade dict → canonical Trade model.

IMPORTANT: Bybit's `S` field is capitalized ("Buy" / "Sell").
Must .lower() before assignment. This IS the aggressor side — no inversion.
"""

from __future__ import annotations

import structlog

from normalization.models import Trade

logger = structlog.get_logger(__name__)


def normalize_bybit_trade(raw: dict) -> Trade:
    """
    Convert raw Bybit trade dict to canonical Trade.

    Args:
        raw: Dict from BybitClient.parse_message() containing:
            exchange, symbol, price (str), volume (str),
            side (str "Buy"|"Sell"), timestamp (int ms),
            trade_id (str), raw (dict)

    Raises:
        ValueError: If side is not "Buy" or "Sell".
        KeyError: If raw dict structure is unexpected.
    """
    raw_side = raw.get("side")
    
    # Validate side — Bybit uses capitalized "Buy" / "Sell"
    if not isinstance(raw_side, str) or raw_side.lower() not in ("buy", "sell"):
        logger.error(
            "bybit_invalid_side_field",
            trade_id=raw.get("trade_id", "unknown"),
            side=raw_side,
            raw_type=type(raw_side).__name__,
        )
        raise ValueError(
            f"Invalid side for trade {raw.get('trade_id', 'unknown')}: "
            f"expected 'Buy' or 'Sell', got {raw_side!r}"
        )
    
    # Bybit uses capitalized side: "Buy" / "Sell" → "buy" / "sell"
    side = raw_side.lower()

    return Trade(
        exchange=raw["exchange"],
        symbol=raw["symbol"],
        price=float(raw["price"]),
        volume=float(raw["volume"]),
        side=side,
        timestamp=int(raw["timestamp"]),
        trade_id=raw["trade_id"],
        raw=raw.get("raw", {}),
    )
