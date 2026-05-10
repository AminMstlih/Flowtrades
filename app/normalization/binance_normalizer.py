"""
Binance trade normalizer.

Maps raw Binance aggTrade dict → canonical Trade model.

CRITICAL: The `is_buyer_maker` field inversion.
  is_buyer_maker=True  → aggressor is SELLER → side="sell"
  is_buyer_maker=False → aggressor is BUYER  → side="buy"

This is tested explicitly. If this is wrong, every delta
and imbalance calculation in the entire system is inverted.
"""

from __future__ import annotations

import structlog

from normalization.models import Trade

logger = structlog.get_logger(__name__)


def normalize_binance_trade(raw: dict) -> Trade:
    """
    Convert raw Binance aggTrade dict to canonical Trade.

    Args:
        raw: Dict from BinanceClient.parse_message() containing:
            exchange, symbol, price (str), volume (str),
            is_buyer_maker (bool), timestamp (int),
            trade_id (str), raw (dict)

    Returns:
        Normalized Trade instance.

    Raises:
        ValueError: If required fields are missing or invalid.
        KeyError: If raw dict structure is unexpected.
    """
    # Side classification — THE critical mapping
    # is_buyer_maker=True means the buyer placed the limit order (maker),
    # so the SELLER was the aggressor (taker, market order)
    is_buyer_maker = raw.get("is_buyer_maker")
    
    # Validate: if None or not a bool, the trade side is unknown
    # Silent classification would invert all downstream delta/imbalance
    if not isinstance(is_buyer_maker, bool):
        logger.error(
            "binance_invalid_side_field",
            trade_id=raw.get("trade_id", "unknown"),
            is_buyer_maker=is_buyer_maker,
            raw_type=type(is_buyer_maker).__name__,
        )
        raise ValueError(
            f"Invalid is_buyer_maker for trade {raw.get('trade_id', 'unknown')}: "
            f"expected bool, got {type(is_buyer_maker).__name__}({is_buyer_maker!r})"
        )
    
    side = "sell" if is_buyer_maker else "buy"

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
