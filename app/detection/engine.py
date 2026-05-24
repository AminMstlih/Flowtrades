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
        min_trades_per_bucket: int = 1,
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
        # Calculate bucket size from minimum price delta
        prices = sorted(candle.buckets.keys())
        if len(prices) < 3:
            return
        
        diffs = [prices[i+1] - prices[i] for i in range(len(prices)-1)]
        min_diff = min(diffs) if diffs else 1.0
        
        # Temporary storage for imbalances
        imb_candidates = []
        
        for price in prices:
            bucket = candle.buckets[price]
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
            
            raw_severity = (abs_imbalance - self.imbalance_threshold_pct) / (100.0 - self.imbalance_threshold_pct) * 8.0 + 2.0
            severity = min(10.0, max(1.0, raw_severity * confidence))

            if severity >= 2.0:
                imb_candidates.append({
                    "price": price,
                    "direction": direction,
                    "severity": severity,
                    "bucket": bucket,
                    "imbalance": imbalance,
                    "confidence": confidence
                })

        # Find Stacked Imbalances (>= 3 consecutive levels)
        if not imb_candidates:
            return

        stacks = []
        current_stack = [imb_candidates[0]]
        
        for i in range(1, len(imb_candidates)):
            prev = current_stack[-1]
            curr = imb_candidates[i]
            
            is_consecutive = (curr["price"] - prev["price"]) <= min_diff * 1.05
            is_same_direction = curr["direction"] == prev["direction"]
            
            if is_consecutive and is_same_direction:
                current_stack.append(curr)
            else:
                if len(current_stack) >= 3:
                    stacks.extend(current_stack)
                current_stack = [curr]
                
        if len(current_stack) >= 3:
            stacks.extend(current_stack)
            
        for item in stacks:
            flags[item["price"]].append(DetectionFlag(
                type=DetectionType.IMBALANCE,
                direction=item["direction"],
                severity=round(item["severity"], 1),
                label=f"Stacked {item['direction']} imbalance (>=3 levels) — aggressive market orders sweeping the book",
                metadata={
                    "imbalance_pct": round(item["imbalance"], 1),
                    "buy_vol": round(item["bucket"].buy_vol, 4),
                    "sell_vol": round(item["bucket"].sell_vol, 4),
                    "total_vol": round(item["bucket"].total_vol, 4),
                    "weight_pct": round((item["bucket"].total_vol / candle_total_vol) * 100, 1),
                    "trade_count": item["bucket"].trade_count,
                    "confidence": round(item["confidence"], 2),
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

        rng = candle.high - candle.low
        top_zone = candle.high - rng * 0.25
        bot_zone = candle.low + rng * 0.25

        for price, bucket in candle.buckets.items():
            if not self._bucket_qualifies(bucket, candle_total_vol):
                continue
            if bucket.total_vol < vol_threshold:
                continue

            # Extremity Filter & Direction Mapping
            if price >= top_zone:
                direction = "sell"
                label = "Sell Absorption (Top 25%) — buyers trapped at the highs against limit sellers"
            elif price <= bot_zone:
                direction = "buy"
                label = "Buy Absorption (Bottom 25%) — sellers trapped at the lows against limit buyers"
            else:
                # Noise in the middle of the candle
                continue

            # Absorption: high volume + low overall price movement
            if price_range_pct > self.absorption_price_pct * 10:
                bucket_price_range = rng / price
                if bucket_price_range > self.absorption_price_pct / 100.0:
                    continue

            confidence = self._confidence_factor(bucket, candle_total_vol)
            vol_ratio = bucket.total_vol / vol_threshold
            severity = min(10.0, max(1.0, vol_ratio * 3.0 * confidence))

            if severity < 2.0:
                continue

            flags[price].append(DetectionFlag(
                type=DetectionType.ABSORPTION,
                direction=direction,
                severity=round(severity, 1),
                label=label,
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
        Exhaustion Detection — Option C implementation.

        Compares early-window delta vs late-window delta per bucket using the
        midpoint snapshot captured during trade ingestion.

        Early delta  = buy_at_midpoint - sell_at_midpoint
        Late delta   = (buy_final - buy_at_midpoint) - (sell_final - sell_at_midpoint)

        Exhaustion fires when:
        - The bucket had a strong directional push in the early window
        - The late window shows meaningful counter-pressure (direction flipped or
          significantly weakened)
        - The bucket qualifies by volume weight

        Only runs on sealed candles (midpoint_snapshot must exist).
        If midpoint_snapshot is None, returns silently — no crash, no false positives.
        """
        if candle.midpoint_snapshot is None:
            # Candle had no trades after the midpoint — cannot detect exhaustion.
            return

        if not candle.buckets:
            return

        snap = candle.midpoint_snapshot

        for price, bucket in candle.buckets.items():
            if not self._bucket_qualifies(bucket, candle_total_vol):
                continue

            # Get early-window cumulative volumes from snapshot
            snap_buy, snap_sell = snap.bucket_volumes.get(price, (0.0, 0.0))
            early_delta = snap_buy - snap_sell

            # Late-window = final minus snapshot
            late_buy = bucket.buy_vol - snap_buy
            late_sell = bucket.sell_vol - snap_sell
            late_delta = late_buy - late_sell

            # Need meaningful volume in both halves
            early_vol = snap_buy + snap_sell
            late_vol = late_buy + late_sell
            if early_vol <= 0 or late_vol <= 0:
                continue

            # Early push must be directionally significant (>60% one-sided)
            early_imb = abs(early_delta) / early_vol
            if early_imb < 0.60:
                continue

            # Late window must show counter-pressure: delta flipped direction
            # AND the counter-pressure is at least 40% of the early push magnitude
            if (early_delta > 0 and late_delta >= 0) or (early_delta < 0 and late_delta <= 0):
                # No flip — same direction in both halves, not exhaustion
                continue

            counter_ratio = abs(late_delta) / max(abs(early_delta), 0.001)
            if counter_ratio < 0.40:
                continue

            # Direction of the exhausted push (the early dominant side)
            exhausted_side = "buy" if early_delta > 0 else "sell"
            
            # Extremity Filter for Exhaustion
            if candle.high is not None and candle.low is not None:
                rng = candle.high - candle.low
                top_zone = candle.high - rng * 0.25
                bot_zone = candle.low + rng * 0.25
                
                # Buy exhaustion must happen at the high
                if exhausted_side == "buy" and price < top_zone:
                    continue
                # Sell exhaustion must happen at the low
                if exhausted_side == "sell" and price > bot_zone:
                    continue
            
            confidence = self._confidence_factor(bucket, candle_total_vol)
            severity = min(10.0, max(1.0, (early_imb * 5.0 + counter_ratio * 3.0) * confidence))

            if severity < 2.0:
                continue

            label = (
                "Buy Exhaustion (Top 25%) — buyers pushed but got stuffed, momentum reversed" 
                if exhausted_side == "buy" else 
                "Sell Exhaustion (Bottom 25%) — sellers pushed but got stuffed, momentum reversed"
            )

            flags[price].append(DetectionFlag(
                type=DetectionType.EXHAUSTION,
                direction=exhausted_side,
                severity=round(severity, 1),
                label=label,
                metadata={
                    "early_delta": round(early_delta, 4),
                    "late_delta": round(late_delta, 4),
                    "early_imb_pct": round(early_imb * 100, 1),
                    "counter_ratio": round(counter_ratio, 2),
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