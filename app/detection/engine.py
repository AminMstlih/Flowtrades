"""
Detection Engine — pattern recognition for order flow footprint data.

Implements three detection types per architecture doc Section 4:
1. Imbalance: directional dominance at a price level
2. Absorption: high volume with minimal price movement
3. Exhaustion: volume spike followed by counter-pressure reversal

These are contextual annotations, NOT trading signals.

v2: Uses RELATIVE thresholds (% of candle volume) instead of fixed absolute
    minimums. This scales correctly across timeframes and market conditions.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from enum import Enum
from typing import Any

import structlog

from aggregation.engine import FootprintCandle, PriceBucket

logger = structlog.get_logger(__name__)


class DetectionType(str, Enum):
    """Enumeration of detection pattern types."""
    IMBALANCE = "IMB"
    ABSORPTION = "ABS"
    EXHAUSTION = "EXH"


@dataclass(frozen=True)
class DetectionFlag:
    """
    A detection annotation attached to a price bucket.
    
    Attributes:
        type: The detection pattern type.
        direction: "buy" for buy-dominant, "sell" for sell-dominant, None for neutral.
        severity: 1.0 = minimum, 10.0 = maximum. Used for visual intensity.
        label: Educational explanation for the trader.
        metadata: Additional context for debugging/display.
    """
    type: DetectionType
    direction: str | None  # "buy", "sell", or None
    severity: float  # 1.0 to 10.0
    label: str
    metadata: dict[str, Any] = None

    def __post_init__(self):
        if self.metadata is None:
            object.__setattr__(self, 'metadata', {})


class DetectionEngine:
    """
    Runs pattern detection on footprint candles.
    
    v2: All thresholds are relative to candle volume, not fixed absolutes.
    This means the engine works equally well on 1m and 1h candles.
    """

    def __init__(
        self,
        imbalance_threshold_pct: float = 85.0,
        min_bucket_weight_pct: float = 5.0,
        min_trades_per_bucket: int = 3,
        absorption_vol_percentile: float = 90.0,
        absorption_price_pct: float = 0.05,
        exhaustion_spike_percentile: float = 90.0,
        exhaustion_counter_pct: float = 40.0,
        # Legacy compat — kept but no longer primary filter
        min_volume_per_bucket_btc: float = 0.1,
    ) -> None:
        self.imbalance_threshold_pct = imbalance_threshold_pct
        self.min_bucket_weight_pct = min_bucket_weight_pct
        self.min_trades_per_bucket = min_trades_per_bucket
        self.min_volume_btc = min_volume_per_bucket_btc
        self.absorption_vol_percentile = absorption_vol_percentile
        self.absorption_price_pct = absorption_price_pct
        self.exhaustion_spike_percentile = exhaustion_spike_percentile
        self.exhaustion_counter_pct = exhaustion_counter_pct

    def detect(self, candle: FootprintCandle) -> dict[float, list[DetectionFlag]]:
        """
        Run all detection algorithms on a single candle.
        
        Returns:
            Dict mapping bucket price -> list of DetectionFlags.
        """
        flags: dict[float, list[DetectionFlag]] = {price: [] for price in candle.buckets}

        if not candle.buckets:
            return flags

        candle_total_vol = candle.total_vol
        if candle_total_vol <= 0:
            return flags

        # Run detections in priority order
        self._detect_imbalance(candle, flags, candle_total_vol)
        self._detect_absorption(candle, flags, candle_total_vol)
        self._detect_exhaustion(candle, flags, candle_total_vol)

        return flags

    def _bucket_qualifies(self, bucket: PriceBucket, candle_total_vol: float) -> bool:
        """Check if a bucket has enough weight to be worth analyzing."""
        if bucket.total_vol <= 0:
            return False
        # Must have minimum trade count (not just 1 whale order)
        if bucket.trade_count < self.min_trades_per_bucket:
            return False
        # Must represent a meaningful % of candle volume
        weight_pct = (bucket.total_vol / candle_total_vol) * 100.0
        if weight_pct < self.min_bucket_weight_pct:
            return False
        # Absolute floor as safety net
        if bucket.total_vol < self.min_volume_btc:
            return False
        return True

    def _confidence_factor(self, bucket: PriceBucket, candle_total_vol: float) -> float:
        """
        Calculate confidence 0.0-1.0 based on how much volume supports this signal.
        More volume in the candle = higher confidence in the pattern.
        Used to scale severity so early-candle signals are dimmer.
        """
        weight = bucket.total_vol / max(candle_total_vol, 0.001)
        # Sigmoid-ish: ramps up from ~0.3 at 5% weight to ~1.0 at 30%+ weight
        return min(1.0, max(0.2, weight * 4.0))

    def _detect_imbalance(
        self,
        candle: FootprintCandle,
        flags: dict[float, list[DetectionFlag]],
        candle_total_vol: float,
    ) -> None:
        """
        Imbalance Detection — Section 4.1.
        
        Flags buckets where one side dominates by imbalance_threshold_pct.
        Now requires relative volume weight + minimum trade count.
        """
        for price, bucket in candle.buckets.items():
            if not self._bucket_qualifies(bucket, candle_total_vol):
                continue

            imbalance = bucket.imbalance_pct
            if imbalance is None:
                continue

            abs_imbalance = abs(imbalance)
            if abs_imbalance < self.imbalance_threshold_pct:
                continue

            direction = "buy" if imbalance > 0 else "sell"
            confidence = self._confidence_factor(bucket, candle_total_vol)
            
            # Severity: scales with both imbalance strength and confidence
            raw_severity = (abs_imbalance - self.imbalance_threshold_pct) / (100.0 - self.imbalance_threshold_pct) * 8.0 + 2.0
            severity = min(10.0, max(1.0, raw_severity * confidence))

            if severity < 4.0:
                continue

            flags[price].append(DetectionFlag(
                type=DetectionType.IMBALANCE,
                direction=direction,
                severity=round(severity, 1),
                label=f"Aggressive {'buyers' if direction == 'buy' else 'sellers'} dominating — passive orders being consumed",
                metadata={
                    "imbalance_pct": round(imbalance, 1),
                    "buy_vol": round(bucket.buy_vol, 4),
                    "sell_vol": round(bucket.sell_vol, 4),
                    "total_vol": round(bucket.total_vol, 4),
                    "weight_pct": round((bucket.total_vol / candle_total_vol) * 100, 1),
                    "trade_count": bucket.trade_count,
                    "confidence": round(confidence, 2),
                },
            ))

    def _detect_absorption(
        self,
        candle: FootprintCandle,
        flags: dict[float, list[DetectionFlag]],
        candle_total_vol: float,
    ) -> None:
        """
        Absorption Detection — Section 4.2.
        
        Flags buckets with high volume but minimal price movement.
        Indicates large passive orders absorbing aggression.
        """
        if not candle.buckets:
            return

        volumes = [b.total_vol for b in candle.buckets.values() if b.total_vol > 0]
        if len(volumes) < 2:
            return

        vol_threshold = self._percentile(volumes, self.absorption_vol_percentile)

        if candle.high <= candle.low or candle.high is None or candle.low is None:
            return

        price_range_pct = ((candle.high - candle.low) / candle.high) * 100.0

        for price, bucket in candle.buckets.items():
            if not self._bucket_qualifies(bucket, candle_total_vol):
                continue
            if bucket.total_vol < vol_threshold:
                continue

            # Absorption: high volume + low overall price movement
            if price_range_pct > self.absorption_price_pct * 10:
                bucket_price_range = (candle.high - candle.low) / price
                if bucket_price_range > self.absorption_price_pct / 100.0:
                    continue

            confidence = self._confidence_factor(bucket, candle_total_vol)
            vol_ratio = bucket.total_vol / vol_threshold
            severity = min(10.0, max(1.0, vol_ratio * 3.0 * confidence))

            if severity < 4.0:
                continue

            flags[price].append(DetectionFlag(
                type=DetectionType.ABSORPTION,
                direction=None,
                severity=round(severity, 1),
                label="High volume, low movement — large player may be defending this level",
                metadata={
                    "total_vol": round(bucket.total_vol, 4),
                    "vol_threshold": round(vol_threshold, 4),
                    "price_range_pct": round(price_range_pct, 4),
                    "vol_ratio": round(vol_ratio, 2),
                    "confidence": round(confidence, 2),
                },
            ))

    def _detect_exhaustion(
        self,
        candle: FootprintCandle,
        flags: dict[float, list[DetectionFlag]],
        candle_total_vol: float,
    ) -> None:
        """
        Exhaustion Detection — Section 4.3.
        
        Flags volume spikes with significant counter-pressure.
        Indicates momentum weakening.
        """
        if not candle.buckets:
            return

        volumes = [b.total_vol for b in candle.buckets.values() if b.total_vol > 0]
        if len(volumes) < 3:
            return

        spike_threshold = self._percentile(volumes, self.exhaustion_spike_percentile)

        for price, bucket in candle.buckets.items():
            if not self._bucket_qualifies(bucket, candle_total_vol):
                continue
            if bucket.total_vol < spike_threshold:
                continue

            buy_pct = (bucket.buy_vol / bucket.total_vol) * 100.0
            sell_pct = (bucket.sell_vol / bucket.total_vol) * 100.0

            # Must NOT be one-sided (that's imbalance, not exhaustion)
            if buy_pct > 90 or sell_pct > 90:
                continue

            weaker_pct = min(buy_pct, sell_pct)
            if weaker_pct < self.exhaustion_counter_pct:
                continue

            dominant_side = "buy" if buy_pct > sell_pct else "sell"
            confidence = self._confidence_factor(bucket, candle_total_vol)
            
            closeness = 50.0 - abs(buy_pct - 50.0)
            vol_factor = min(1.0, bucket.total_vol / (spike_threshold * 2))
            severity = min(10.0, max(1.0, ((closeness / 10.0) + (vol_factor * 3.0)) * confidence))

            if severity < 4.0:
                continue

            flags[price].append(DetectionFlag(
                type=DetectionType.EXHAUSTION,
                direction=dominant_side,
                severity=round(severity, 1),
                label=f"Volume spike with counter-pressure — {'buy' if dominant_side == 'sell' else 'sell'} momentum may be weakening",
                metadata={
                    "total_vol": round(bucket.total_vol, 4),
                    "buy_pct": round(buy_pct, 1),
                    "sell_pct": round(sell_pct, 1),
                    "spike_threshold": round(spike_threshold, 4),
                    "confidence": round(confidence, 2),
                },
            ))

    @staticmethod
    def _percentile(values: list[float], pct: float) -> float:
        """Calculate the pct-th percentile of a list of values."""
        if not values:
            return 0.0
        sorted_vals = sorted(values)
        k = (len(sorted_vals) - 1) * (pct / 100.0)
        f = int(k)
        c = f + 1
        if c >= len(sorted_vals):
            return sorted_vals[f]
        return sorted_vals[f] + (k - f) * (sorted_vals[c] - sorted_vals[f])