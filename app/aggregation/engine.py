"""
Footprint Chart Engine — the mathematical core for discrete candles.

Groups trades into fixed time-interval footprint candles (OHLCV).
Within each candle, trades are binned into price buckets to build 
isolated volume profiles (the "footprint").
"""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field

import structlog

logger = structlog.get_logger(__name__)


@dataclass
class PriceBucket:
    """Aggregated metrics for a single price level within a single candle."""

    price: float
    buy_vol: float = 0.0
    sell_vol: float = 0.0
    trade_count: int = 0

    @property
    def total_vol(self) -> float:
        return self.buy_vol + self.sell_vol

    @property
    def delta(self) -> float:
        """Buy volume minus sell volume. Positive = buy pressure."""
        return self.buy_vol - self.sell_vol

    @property
    def imbalance_pct(self) -> float | None:
        """
        Directional imbalance percentage.
        +75 = buy dominant, -78 = sell dominant.
        Returns None if total volume is zero.
        """
        total = self.total_vol
        if total == 0:
            return None
        return (self.delta / total) * 100.0

    def add_buy(self, volume: float) -> None:
        self.buy_vol += volume
        self.trade_count += 1

    def add_sell(self, volume: float) -> None:
        self.sell_vol += volume
        self.trade_count += 1


@dataclass
class FootprintCandle:
    """A discrete time-based candle with an internal volume profile."""
    start_time_ms: int
    end_time_ms: int
    
    open: float | None = None
    high: float = float("-inf")
    low: float = float("inf")
    close: float | None = None
    
    buy_vol: float = 0.0
    sell_vol: float = 0.0
    trade_count: int = 0
    
    buckets: dict[float, PriceBucket] = field(default_factory=dict)
    
    def add_trade(self, price: float, volume: float, side: str, bucket_size: float) -> None:
        if self.open is None:
            self.open = price
        self.high = max(self.high, price)
        self.low = min(self.low, price)
        self.close = price
        self.trade_count += 1
        
        if side == "buy":
            self.buy_vol += volume
        elif side == "sell":
            self.sell_vol += volume
            
        bp = math.floor(price / bucket_size) * bucket_size
        if bp not in self.buckets:
            self.buckets[bp] = PriceBucket(price=bp)
            
        bucket = self.buckets[bp]
        if side == "buy":
            bucket.add_buy(volume)
        elif side == "sell":
            bucket.add_sell(volume)
            
    @property
    def total_vol(self) -> float:
        return self.buy_vol + self.sell_vol
        
    @property
    def delta(self) -> float:
        return self.buy_vol - self.sell_vol


class FootprintChart:
    """
    Manages the ongoing active candle and a history of sealed candles.
    """

    def __init__(self, bucket_size: float = 1.0, interval_seconds: int = 300, max_candles: int = 50) -> None:
        if bucket_size <= 0:
            raise ValueError(f"bucket_size must be positive, got {bucket_size}")
        self.bucket_size = bucket_size
        self.interval_ms = interval_seconds * 1000
        self.max_candles = max_candles
        
        self.active_candle: FootprintCandle | None = None
        self.historical_candles: deque[FootprintCandle] = deque(maxlen=max_candles)

    def add_trade(self, ts_ms: int, price: float, volume: float, side: str) -> None:
        """
        Route a trade to the correct candle, sealing the old one if time crossed the boundary.
        """
        candle_start = (ts_ms // self.interval_ms) * self.interval_ms
        
        active = self.active_candle
        if active is None:
            active = FootprintCandle(
                start_time_ms=candle_start,
                end_time_ms=candle_start + self.interval_ms
            )
        elif candle_start > active.start_time_ms:
            self.historical_candles.append(active)
            active = FootprintCandle(
                start_time_ms=candle_start,
                end_time_ms=candle_start + self.interval_ms
            )
            
        if candle_start < active.start_time_ms:
            # Out-of-order trade: timestamp older than current candle.
            # Constraint #9: NO silent failures.
            logger.warning(
                "late_trade_dropped",
                trade_ts_ms=ts_ms,
                candle_start_ms=active.start_time_ms,
                skew_ms=active.start_time_ms - candle_start,
            )
            return
            
        active.add_trade(price, volume, side, self.bucket_size)
        self.active_candle = active

    def get_snapshot(self) -> list[FootprintCandle]:
        """Return the historical candles plus the active one."""
        res = list(self.historical_candles)
        if self.active_candle is not None:
            res.append(self.active_candle)
        return res

    def clear(self) -> None:
        self.historical_candles.clear()
        self.active_candle = None
