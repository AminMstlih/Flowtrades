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
        min_volume_btc: float = 0.5,
        imbalance_threshold_pct: float = 70.0,
        absorption_vol_percentile: float = 80.0,
        absorption_price_pct: float = 0.05,
    ) -> None:
        # window_seconds becomes the candle interval
        self.chart = FootprintChart(
            bucket_size=bucket_size, 
            interval_seconds=window_seconds,
            max_candles=50
        )
        self.min_volume_btc = min_volume_btc
        
        # Detection engine for pattern recognition
        self.detector = DetectionEngine(
            imbalance_threshold_pct=imbalance_threshold_pct,
            min_volume_per_bucket_btc=min_volume_btc,
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

        # Add trade to footprint chart (handles candle rollover automatically)
        self.chart.add_trade(
            ts_ms=now_ms,
            price=trade.price,
            volume=trade.volume,
            side=trade.side
        )

        # Bookkeeping
        self._trade_count += 1
        self._last_trade_time = now_ms
        self._last_price = trade.price

    def get_display_state(self) -> list[FootprintCandle]:
        """
        Get the array of structural candles for the frontend.
        """
        return self.chart.get_snapshot()

    def set_window(self, window_minutes: int) -> None:
        """
        Change the candle timeframe interval.
        Note: True historical reconstruction requires a database replay.
        For this MVP, we just wipe the chart and start fresh on the new interval.
        """
        window_seconds = window_minutes * 60
        old_size = self.chart.bucket_size
        self.chart = FootprintChart(
            bucket_size=old_size,
            interval_seconds=window_seconds,
            max_candles=50
        )
        self._trade_count = 0
        logger.info(
            "timeframe_changed_chart_reset",
            new_interval_minutes=window_minutes,
        )

    @property
    def stats(self) -> dict:
        candles = self.chart.get_snapshot()
        active_buckets_total = sum(len(c.buckets) for c in candles)
        
        return {
            "total_trades_processed": self._trade_count,
            "active_buckets": active_buckets_total,
            "total_candles": len(candles),
            "window_seconds": self.chart.interval_ms // 1000,
            "last_price": self._last_price,
            "last_trade_time": self._last_trade_time,
        }
