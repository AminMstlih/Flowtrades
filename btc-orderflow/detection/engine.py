"""
Detection Engine — pattern recognition for order flow footprint data.

Implements three detection types per architecture doc Section 4:
1. Imbalance: directional dominance at a price level
2. Absorption: high volume with minimal price movement
3. Exhaustion: volume spike followed by counter-pressure reversal

These are contextual annotations, NOT trading signals.
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
    
    Stateless — takes a candle, returns a dict mapping bucket prices
    to their detection flags.
    """

    def __init__(
        self,
        imbalance_threshold_pct: float = 70.0,
        min_volume_per_bucket_btc: float = 0.5,
        absorption_vol_percentile: float = 80.0,
        absorption_price_pct: float = 0.05,
        exhaustion_spike_percentile: float = 90.0,
        exhaustion_counter_pct: float = 40.0,
    ) -> None:
        """
        Initialize detection engine with thresholds from config.
        
        Args:
            imbalance_threshold_pct: Min imbalance % to flag (default 70).
            min_volume_per_bucket_btc: Min BTC volume to qualify for detection.
            absorption_vol_percentile: Volume percentile threshold for absorption.
            absorption_price_pct: Max price movement % for absorption (default 0.05%).
            exhaustion_spike_percentile: Volume percentile for exhaustion spike.
            exhaustion_counter_pct: Min counter-pressure % for exhaustion reversal.
        """
        self.imbalance_threshold_pct = imbalance_threshold_pct
        self.min_volume_btc = min_volume_per_bucket_btc
        self.absorption_vol_percentile = absorption_vol_percentile
        self.absorption_price_pct = absorption_price_pct
        self.exhaustion_spike_percentile = exhaustion_spike_percentile
        self.exhaustion_counter_pct = exhaustion_counter_pct

    def detect(self, candle: FootprintCandle) -> dict[float, list[DetectionFlag]]:
        """
        Run all detection algorithms on a single candle.
        
        Args:
            candle: A FootprintCandle with populated buckets.
            
        Returns:
            Dict mapping bucket price -> list of DetectionFlags.
            Empty list if no detections for that bucket.
        """
        flags: dict[float, list[DetectionFlag]] = {price: [] for price in candle.buckets}

        if not candle.buckets:
            return flags

        # Run detections in priority order
        self._detect_imbalance(candle, flags)
        self._detect_absorption(candle, flags)
        self._detect_exhaustion(candle, flags)

        return flags

    def _detect_imbalance(
        self,
        candle: FootprintCandle,
        flags: dict[float, list[DetectionFlag]],
    ) -> None:
        """
        Imbalance Detection — Section 4.1.
        
        Flags buckets where one side dominates by imbalance_threshold_pct.
        Requires minimum volume to filter noise on thin levels.
        """
        for price, bucket in candle.buckets.items():
            if bucket.total_vol < self.min_volume_btc:
                continue

            imbalance = bucket.imbalance_pct
            if imbalance is None:
                continue

            abs_imbalance = abs(imbalance)
            if abs_imbalance < self.imbalance_threshold_pct:
                continue

            direction = "buy" if imbalance > 0 else "sell"
            
            # Severity scales from threshold to 100%
            # 70% = severity 1, 100% = severity 10
            severity = min(10.0, max(1.0, (abs_imbalance - self.imbalance_threshold_pct) / 3.0 + 1.0))

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
                },
            ))

    def _detect_absorption(
        self,
        candle: FootprintCandle,
        flags: dict[float, list[DetectionFlag]],
    ) -> None:
        """
        Absorption Detection — Section 4.2.
        
        Flags buckets with high volume but minimal price movement.
        Indicates large passive orders absorbing aggression.
        """
        if not candle.buckets:
            return

        # Calculate volume threshold from percentile
        volumes = [b.total_vol for b in candle.buckets.values()]
        if len(volumes) < 2:
            return

        vol_threshold = self._percentile(volumes, self.absorption_vol_percentile)

        # Price range check: if candle range is small relative to price,
        # high-volume buckets are absorption
        if candle.high <= candle.low or candle.high is None or candle.low is None:
            return

        price_range_pct = ((candle.high - candle.low) / candle.high) * 100.0

        for price, bucket in candle.buckets.items():
            if bucket.total_vol < self.min_volume_btc:
                continue
            if bucket.total_vol < vol_threshold:
                continue

            # Absorption: high volume + low overall price movement
            if price_range_pct > self.absorption_price_pct * 10:  # Allow 10x threshold for candle-level
                # Also check bucket-level: if this single bucket has high volume
                # but price hasn't moved much, it's still absorption
                bucket_price_range = (candle.high - candle.low) / price
                if bucket_price_range > self.absorption_price_pct / 100.0:
                    continue

            # Severity based on volume relative to threshold
            vol_ratio = bucket.total_vol / vol_threshold
            severity = min(10.0, max(1.0, vol_ratio * 3.0))

            flags[price].append(DetectionFlag(
                type=DetectionType.ABSORPTION,
                direction=None,  # Absorption is neutral — both sides present
                severity=round(severity, 1),
                label="High volume, low movement — large player may be defending this level",
                metadata={
                    "total_vol": round(bucket.total_vol, 4),
                    "vol_threshold": round(vol_threshold, 4),
                    "price_range_pct": round(price_range_pct, 4),
                    "vol_ratio": round(vol_ratio, 2),
                },
            ))

    def _detect_exhaustion(
        self,
        candle: FootprintCandle,
        flags: dict[float, list[DetectionFlag]],
    ) -> None:
        """
        Exhaustion Detection — Section 4.3.
        
        Flags volume spikes in one direction followed by significant
        counter-pressure. Indicates momentum weakening.
        
        This detection requires time-series awareness within a candle,
        which we approximate by checking if a bucket has significant
        volume from both sides (indicating the fight happened).
        """
        if not candle.buckets:
            return

        # Calculate spike threshold
        volumes = [b.total_vol for b in candle.buckets.values()]
        if len(volumes) < 3:
            return

        spike_threshold = self._percentile(volumes, self.exhaustion_spike_percentile)

        for price, bucket in candle.buckets.items():
            if bucket.total_vol < self.min_volume_btc:
                continue
            if bucket.total_vol < spike_threshold:
                continue

            # Exhaustion: significant volume from BOTH sides
            # This indicates a fight — one side spiked, then the other countered
            buy_pct = (bucket.buy_vol / bucket.total_vol) * 100.0
            sell_pct = (bucket.sell_vol / bucket.total_vol) * 100.0

            # Both sides must have meaningful presence (neither dominates completely)
            # AND the counter-pressure must be above exhaustion_counter_pct
            if buy_pct > 90 or sell_pct > 90:
                # One side completely dominated — not exhaustion, it's imbalance
                continue

            # The weaker side must be strong enough to indicate counter-pressure
            weaker_pct = min(buy_pct, sell_pct)
            if weaker_pct < self.exhaustion_counter_pct:
                continue

            # Determine which side spiked first (approximation: use the dominant side)
            dominant_side = "buy" if buy_pct > sell_pct else "sell"
            
            # Severity based on how close the fight is and total volume
            closeness = 50.0 - abs(buy_pct - 50.0)  # 0 = complete domination, 50 = perfect split
            vol_factor = min(1.0, bucket.total_vol / (spike_threshold * 2))
            severity = min(10.0, max(1.0, (closeness / 10.0) + (vol_factor * 3.0)))

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