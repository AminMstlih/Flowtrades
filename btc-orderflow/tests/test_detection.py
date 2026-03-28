"""
Unit tests for the Detection Engine.

Tests with synthetic known data — we know the expected outcomes
before running. If these fail, the detection logic is wrong
and the educational annotations are misleading.
"""

import pytest
from aggregation.engine import FootprintCandle, FootprintChart, PriceBucket
from detection.engine import DetectionEngine, DetectionFlag, DetectionType


# ── Test Helpers ──────────────────────────────────────────────────

def make_candle_with_buckets(buckets_data: list[dict]) -> FootprintCandle:
    """
    Create a FootprintCandle with predefined buckets.
    
    buckets_data: list of dicts with keys:
        price, buy_vol, sell_vol
    """
    candle = FootprintCandle(
        start_time_ms=1000000,
        end_time_ms=1060000,
    )
    
    for bd in buckets_data:
        price = bd["price"]
        bucket = PriceBucket(price=price)
        if "buy_vol" in bd and bd["buy_vol"] > 0:
            bucket.add_buy(bd["buy_vol"])
        if "sell_vol" in bd and bd["sell_vol"] > 0:
            bucket.add_sell(bd["sell_vol"])
        candle.buckets[price] = bucket
    
    # Set OHLC from bucket prices
    prices = [bd["price"] for bd in buckets_data]
    candle.open = prices[0]
    candle.high = max(prices)
    candle.low = min(prices)
    candle.close = prices[-1]
    
    return candle


# ── Imbalance Detection Tests ─────────────────────────────────────

class TestImbalanceDetection:
    """Tests for imbalance detection — Section 4.1 of architecture doc."""

    def test_high_buy_imbalance_flagged(self):
        """78% buy imbalance with sufficient volume → flagged.
        Math: delta=78, total=100, imbalance=78% (above 70% threshold)."""
        candle = make_candle_with_buckets([
            {"price": 67250.0, "buy_vol": 89.0, "sell_vol": 11.0},
        ])
        
        engine = DetectionEngine(imbalance_threshold_pct=70.0, min_volume_per_bucket_btc=0.5)
        flags = engine.detect(candle)
        
        assert len(flags[67250.0]) == 1
        flag = flags[67250.0][0]
        assert flag.type == DetectionType.IMBALANCE
        assert flag.direction == "buy"
        assert flag.severity >= 1.0

    def test_high_sell_imbalance_flagged(self):
        """77% sell imbalance with sufficient volume → flagged.
        Math: delta=-77, total=100, imbalance=-77% (above 70% threshold)."""
        candle = make_candle_with_buckets([
            {"price": 67250.0, "buy_vol": 11.5, "sell_vol": 88.5},
        ])
        
        engine = DetectionEngine(imbalance_threshold_pct=70.0, min_volume_per_bucket_btc=0.5)
        flags = engine.detect(candle)
        
        assert len(flags[67250.0]) == 1
        flag = flags[67250.0][0]
        assert flag.type == DetectionType.IMBALANCE
        assert flag.direction == "sell"

    def test_below_threshold_not_flagged(self):
        """50/50 split → no imbalance flag."""
        candle = make_candle_with_buckets([
            {"price": 67250.0, "buy_vol": 25.0, "sell_vol": 25.0},
        ])
        
        engine = DetectionEngine(imbalance_threshold_pct=70.0, min_volume_per_bucket_btc=0.5)
        flags = engine.detect(candle)
        
        assert len(flags[67250.0]) == 0

    def test_below_threshold_65_pct_not_flagged(self):
        """65% imbalance → below 70% threshold, not flagged."""
        candle = make_candle_with_buckets([
            {"price": 67250.0, "buy_vol": 32.5, "sell_vol": 17.5},
        ])
        
        engine = DetectionEngine(imbalance_threshold_pct=70.0, min_volume_per_bucket_btc=0.5)
        flags = engine.detect(candle)
        
        assert len(flags[67250.0]) == 0

    def test_low_volume_filtered(self):
        """High imbalance but below min volume → not flagged."""
        candle = make_candle_with_buckets([
            {"price": 67250.0, "buy_vol": 0.3, "sell_vol": 0.1},
        ])
        
        engine = DetectionEngine(imbalance_threshold_pct=70.0, min_volume_per_bucket_btc=0.5)
        flags = engine.detect(candle)
        
        assert len(flags[67250.0]) == 0

    def test_severity_scales_correctly(self):
        """100% imbalance should have higher severity than 75%.
        Math: candle_100: delta=10/total=10 = 100%. candle_75: delta=30/total=40 = 75%."""
        candle_100 = make_candle_with_buckets([
            {"price": 67250.0, "buy_vol": 10.0, "sell_vol": 0.0},
        ])
        candle_75 = make_candle_with_buckets([
            {"price": 67250.0, "buy_vol": 35.0, "sell_vol": 5.0},
        ])
        
        engine = DetectionEngine(imbalance_threshold_pct=70.0, min_volume_per_bucket_btc=0.5)
        flags_100 = engine.detect(candle_100)
        flags_75 = engine.detect(candle_75)
        
        assert flags_100[67250.0][0].severity > flags_75[67250.0][0].severity


# ── Absorption Detection Tests ────────────────────────────────────

class TestAbsorptionDetection:
    """Tests for absorption detection — Section 4.2 of architecture doc."""

    def test_high_volume_low_range_flagged(self):
        """High volume bucket in a tight range candle → absorption."""
        # Create candle with small price range
        candle = FootprintCandle(
            start_time_ms=1000000,
            end_time_ms=1060000,
            open=67250.0,
            high=67250.5,
            low=67249.5,
            close=67250.2,
        )
        
        # Add buckets with varying volumes
        for i, vol in enumerate([5.0, 10.0, 50.0, 5.0, 3.0]):
            price = 67248.0 + i
            bucket = PriceBucket(price=price)
            bucket.add_buy(vol / 2)
            bucket.add_sell(vol / 2)
            candle.buckets[price] = bucket
        
        engine = DetectionEngine(
            absorption_vol_percentile=75.0,
            absorption_price_pct=0.05,
            min_volume_per_bucket_btc=0.5,
        )
        flags = engine.detect(candle)
        
        # The 50.0 volume bucket should be flagged
        assert len(flags[67250.0]) > 0
        absorption_flags = [f for f in flags[67250.0] if f.type == DetectionType.ABSORPTION]
        assert len(absorption_flags) == 1
        assert absorption_flags[0].direction is None

    def test_low_volume_not_flagged(self):
        """Low volume bucket → not absorption even in tight range."""
        candle = FootprintCandle(
            start_time_ms=1000000,
            end_time_ms=1060000,
            open=67250.0,
            high=67250.1,
            low=67249.9,
            close=67250.0,
        )
        
        bucket = PriceBucket(price=67250.0)
        bucket.add_buy(0.1)
        bucket.add_sell(0.1)
        candle.buckets[67250.0] = bucket
        
        engine = DetectionEngine(
            absorption_vol_percentile=80.0,
            absorption_price_pct=0.05,
            min_volume_per_bucket_btc=0.5,
        )
        flags = engine.detect(candle)
        
        assert len(flags[67250.0]) == 0


# ── Exhaustion Detection Tests ────────────────────────────────────

class TestExhaustionDetection:
    """Tests for exhaustion detection — Section 4.3 of architecture doc."""

    def test_balanced_fight_flagged(self):
        """Bucket with 55/45 buy/sell split → exhaustion flagged."""
        candle = make_candle_with_buckets([
            {"price": 67248.0, "buy_vol": 1.0, "sell_vol": 1.0},
            {"price": 67249.0, "buy_vol": 1.0, "sell_vol": 1.0},
            {"price": 67250.0, "buy_vol": 55.0, "sell_vol": 45.0},
            {"price": 67251.0, "buy_vol": 1.0, "sell_vol": 1.0},
            {"price": 67252.0, "buy_vol": 1.0, "sell_vol": 1.0},
        ])
        
        engine = DetectionEngine(
            exhaustion_spike_percentile=80.0,
            exhaustion_counter_pct=40.0,
            min_volume_per_bucket_btc=0.5,
        )
        flags = engine.detect(candle)
        
        exhaustion_flags = [f for f in flags[67250.0] if f.type == DetectionType.EXHAUSTION]
        assert len(exhaustion_flags) == 1
        assert exhaustion_flags[0].direction == "buy"

    def test_one_sided_not_exhaustion(self):
        """95/5 buy/sell split → not exhaustion, it's imbalance."""
        candle = make_candle_with_buckets([
            {"price": 67248.0, "buy_vol": 1.0, "sell_vol": 1.0},
            {"price": 67249.0, "buy_vol": 1.0, "sell_vol": 1.0},
            {"price": 67250.0, "buy_vol": 95.0, "sell_vol": 5.0},
            {"price": 67251.0, "buy_vol": 1.0, "sell_vol": 1.0},
            {"price": 67252.0, "buy_vol": 1.0, "sell_vol": 1.0},
        ])
        
        engine = DetectionEngine(
            exhaustion_spike_percentile=80.0,
            exhaustion_counter_pct=40.0,
            min_volume_per_bucket_btc=0.5,
        )
        flags = engine.detect(candle)
        
        exhaustion_flags = [f for f in flags[67250.0] if f.type == DetectionType.EXHAUSTION]
        assert len(exhaustion_flags) == 0

    def test_low_counter_pressure_not_exhaustion(self):
        """70/30 buy/sell split → counter-pressure below 40% threshold."""
        candle = make_candle_with_buckets([
            {"price": 67248.0, "buy_vol": 1.0, "sell_vol": 1.0},
            {"price": 67249.0, "buy_vol": 1.0, "sell_vol": 1.0},
            {"price": 67250.0, "buy_vol": 70.0, "sell_vol": 30.0},
            {"price": 67251.0, "buy_vol": 1.0, "sell_vol": 1.0},
            {"price": 67252.0, "buy_vol": 1.0, "sell_vol": 1.0},
        ])
        
        engine = DetectionEngine(
            exhaustion_spike_percentile=80.0,
            exhaustion_counter_pct=40.0,
            min_volume_per_bucket_btc=0.5,
        )
        flags = engine.detect(candle)
        
        exhaustion_flags = [f for f in flags[67250.0] if f.type == DetectionType.EXHAUSTION]
        assert len(exhaustion_flags) == 0


# ── Multiple Detections Tests ─────────────────────────────────────

class TestMultipleDetections:
    """Tests for buckets that trigger multiple detection types."""

    def test_imbalance_and_exhaustion_mutual_exclusion(self):
        """
        A bucket can't have both imbalance (one-sided) and exhaustion (two-sided).
        If imbalance is detected, exhaustion should not fire for the same bucket.
        """
        candle = make_candle_with_buckets([
            {"price": 67248.0, "buy_vol": 1.0, "sell_vol": 1.0},
            {"price": 67250.0, "buy_vol": 90.0, "sell_vol": 10.0},
            {"price": 67252.0, "buy_vol": 1.0, "sell_vol": 1.0},
        ])
        
        engine = DetectionEngine(
            imbalance_threshold_pct=70.0,
            exhaustion_spike_percentile=70.0,
            exhaustion_counter_pct=40.0,
            min_volume_per_bucket_btc=0.5,
        )
        flags = engine.detect(candle)
        
        bucket_flags = flags[67250.0]
        flag_types = {f.type for f in bucket_flags}
        
        # Should have imbalance but NOT exhaustion (90% buy > 90% threshold)
        assert DetectionType.IMBALANCE in flag_types
        assert DetectionType.EXHAUSTION not in flag_types

    def test_empty_candle_no_crash(self):
        """Empty candle should not crash and return empty flags."""
        candle = FootprintCandle(
            start_time_ms=1000000,
            end_time_ms=1060000,
        )
        
        engine = DetectionEngine()
        flags = engine.detect(candle)
        
        assert flags == {}


# ── Percentile Calculation Tests ──────────────────────────────────

class TestPercentile:
    """Tests for the percentile calculation helper."""

    def test_median(self):
        assert DetectionEngine._percentile([1, 2, 3, 4, 5], 50) == 3.0

    def test_min(self):
        assert DetectionEngine._percentile([1, 2, 3, 4, 5], 0) == 1.0

    def test_max(self):
        assert DetectionEngine._percentile([1, 2, 3, 4, 5], 100) == 5.0

    def test_empty_list(self):
        assert DetectionEngine._percentile([], 50) == 0.0

    def test_single_element(self):
        assert DetectionEngine._percentile([42.0], 50) == 42.0