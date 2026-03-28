"""
Canonical Trade model — the single source of truth for all trade data.

Every exchange normalizes to this schema before entering the pipeline.
Section 2.3 of architecture doc.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class Trade(BaseModel):
    """
    Normalized trade record.

    All exchanges produce this exact schema.
    No processing should ever touch raw exchange payloads
    after normalization — only this model.
    """

    model_config = {"frozen": True}

    exchange: str = Field(description="Source exchange: binance | okx | bybit")
    symbol: str = Field(description='Normalized symbol: "BTC-PERP-USDT"')
    price: float = Field(description="Execution price, no rounding", gt=0)
    volume: float = Field(description="Volume in BTC (base asset), not USD", gt=0)
    side: Literal["buy", "sell"] = Field(
        description="Aggressor side: buy = taker bought, sell = taker sold"
    )
    timestamp: int = Field(
        description="Unix milliseconds — exchange trade time preferred"
    )
    trade_id: str = Field(description="Unique trade ID for deduplication")
    raw: dict[str, Any] = Field(
        default_factory=dict,
        description="Original payload preserved for debugging",
    )
