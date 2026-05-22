"""
Footprint State Manager — owns the FootprintChart engine.

Single point of contact for the pipeline: receives trades,
manages candle generation, and provides display-ready snapshots.

Architecture doc Section 3.1, Layer L6.
"""

from __future__ import annotations

import structlog

from aggregation.engine import FootprintChart, FootprintCandle
from detection.engine import DetectionEngine, DetectionFlag
from normalization.models import Trade

logger = structlog.get_logger(__name__)


class FootprintState:
    """
    Manages the live footprint state.

    Routes incoming trades to the FootprintChart engine, which
    dynamically builds structural candles (OHLCV profiles).
    Also runs detection engine on candles to flag patterns.
    """

    def __init__(
        self,
        bucket_size: float = 1.0,
        window_seconds: int = 300,
        min_volume_btc: float = 0.1,
        imbalance_threshold_pct: float = 85.0,
        min_bucket_weight_pct: float = 5.0,
        min_trades_per_bucket: int = 3,
        absorption_vol_percentile: float = 90.0,
        absorption_price_pct: float = 0.05,
    ) -> None:
        self.charts = {
            1: FootprintChart(bucket_size=bucket_size, interval_seconds=60, max_candles=200),
            5: FootprintChart(bucket_size=bucket_size, interval_seconds=300, max_candles=200),
            15: FootprintChart(bucket_size=bucket_size, interval_seconds=900, max_candles=200),
            60: FootprintChart(bucket_size=bucket_size, interval_seconds=3600, max_candles=200),
            240: FootprintChart(bucket_size=bucket_size, interval_seconds=14400, max_candles=200),
            1440: FootprintChart(bucket_size=bucket_size, interval_seconds=86400, max_candles=200),
        }
        self.default_window = 5
        self.min_volume_btc = min_volume_btc
        
        # Detection engine for pattern recognition
        self.detector = DetectionEngine(
            imbalance_threshold_pct=imbalance_threshold_pct,
            min_volume_per_bucket_btc=min_volume_btc,
            min_bucket_weight_pct=min_bucket_weight_pct,
            min_trades_per_bucket=min_trades_per_bucket,
            absorption_vol_percentile=absorption_vol_percentile,
            absorption_price_pct=absorption_price_pct,
        )

        self._trade_count = 0
        self._last_trade_time: int | None = None
        self._last_price: float | None = None

    def process_trade(self, trade: Trade) -> None:
        """
        Process a single normalized trade:
        Add to the chart engine which manages active candle sealing.
        """
        now_ms = trade.timestamp

        # Add trade to all footprint charts (handles candle rollover automatically)
        for chart in self.charts.values():
            chart.add_trade(
                ts_ms=now_ms,
                price=trade.price,
                volume=trade.volume,
                side=trade.side,
                exchange=trade.exchange
            )

        # Bookkeeping
        self._trade_count += 1
        self._last_trade_time = now_ms
        self._last_price = trade.price

    def get_display_state(self, window_minutes: int = 5) -> list[FootprintCandle]:
        """
        Get the array of structural candles for the frontend.
        """
        chart = self.charts.get(window_minutes, self.charts[self.default_window])
        return chart.get_snapshot()

    def set_window(self, window_minutes: int) -> None:
        """
        Change the candle timeframe interval.
        Deprecated: Used implicitly by client requests now.
        """
        pass

    def get_stats(self, window_minutes: int = 5) -> dict:
        chart = self.charts.get(window_minutes, self.charts[self.default_window])
        candles = chart.get_snapshot()
        active_buckets_total = sum(len(c.buckets) for c in candles)
        
        return {
            "total_trades_processed": self._trade_count,
            "active_buckets": active_buckets_total,
            "total_candles": len(candles),
            "window_seconds": chart.interval_ms // 1000,
            "last_price": self._last_price,
            "last_trade_time": self._last_trade_time,
        }
    
    @property
    def stats(self) -> dict:
        return self.get_stats()
