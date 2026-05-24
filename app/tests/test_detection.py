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
    
    total_buy = 0.0
    total_sell = 0.0

    for bd in buckets_data:
        price = bd["price"]
        bucket = PriceBucket(price=price)
        buy = bd.get("buy_vol", 0.0)
        sell = bd.get("sell_vol", 0.0)
        if buy > 0:
            bucket.add_buy(buy)
        if sell > 0:
            bucket.add_sell(sell)
        candle.buckets[price] = bucket
        total_buy += buy
        total_sell += sell

    # Set candle-level OHLCV so candle.total_vol is correct.
    # detect() guards on candle_total_vol <= 0 — without this, all flags are silently dropped.
    candle.buy_vol = total_buy
    candle.sell_vol = total_sell

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
            {"price": 67251.0, "buy_vol": 89.0, "sell_vol": 11.0},
            {"price": 67252.0, "buy_vol": 89.0, "sell_vol": 11.0},
        ])
        
        engine = DetectionEngine(imbalance_threshold_pct=70.0, min_volume_per_bucket_btc=0.5)
        flags = engine.detect(candle)
    
        imb_flags = [f for f in flags.get(67250.0, []) if f.type == DetectionType.IMBALANCE]
        assert len(imb_flags) == 1
        flag = imb_flags[0]
        assert flag.direction == "buy"
        assert flag.severity >= 1.0

    def test_high_sell_imbalance_flagged(self):
        """77% sell imbalance with sufficient volume → flagged.
        Math: delta=-77, total=100, imbalance=-77% (above 70% threshold)."""
        candle = make_candle_with_buckets([
            {"price": 67250.0, "buy_vol": 11.5, "sell_vol": 88.5},
            {"price": 67249.0, "buy_vol": 11.5, "sell_vol": 88.5},
            {"price": 67248.0, "buy_vol": 11.5, "sell_vol": 88.5},
        ])
        
        engine = DetectionEngine(imbalance_threshold_pct=70.0, min_volume_per_bucket_btc=0.5)
        flags = engine.detect(candle)
    
        imb_flags = [f for f in flags.get(67250.0, []) if f.type == DetectionType.IMBALANCE]
        assert len(imb_flags) == 1
        flag = imb_flags[0]
        assert flag.direction == "sell"

    def test_below_threshold_not_flagged(self):
        """50/50 split → no imbalance flag."""
        candle = make_candle_with_buckets([
            {"price": 67250.0, "buy_vol": 25.0, "sell_vol": 25.0},
            {"price": 67251.0, "buy_vol": 25.0, "sell_vol": 25.0},
            {"price": 67252.0, "buy_vol": 25.0, "sell_vol": 25.0},
        ])
        
        engine = DetectionEngine(imbalance_threshold_pct=70.0, min_volume_per_bucket_btc=0.5)
        flags = engine.detect(candle)
        
        imb_flags = [f for f in flags.get(67250.0, []) if f.type == DetectionType.IMBALANCE]
        assert len(imb_flags) == 0

    def test_below_threshold_65_pct_not_flagged(self):
        """65% imbalance → below 70% threshold, not flagged."""
        candle = make_candle_with_buckets([
            {"price": 67250.0, "buy_vol": 32.5, "sell_vol": 17.5},
            {"price": 67251.0, "buy_vol": 32.5, "sell_vol": 17.5},
            {"price": 67252.0, "buy_vol": 32.5, "sell_vol": 17.5},
        ])
        
        engine = DetectionEngine(imbalance_threshold_pct=70.0, min_volume_per_bucket_btc=0.5)
        flags = engine.detect(candle)
        
        imb_flags = [f for f in flags.get(67250.0, []) if f.type == DetectionType.IMBALANCE]
        assert len(imb_flags) == 0

    def test_low_volume_filtered(self):
        """High imbalance but below min volume → not flagged."""
        candle = make_candle_with_buckets([
            {"price": 67250.0, "buy_vol": 0.3, "sell_vol": 0.1},
            {"price": 67251.0, "buy_vol": 0.3, "sell_vol": 0.1},
            {"price": 67252.0, "buy_vol": 0.3, "sell_vol": 0.1},
        ])
        
        engine = DetectionEngine(imbalance_threshold_pct=70.0, min_volume_per_bucket_btc=0.5)
        flags = engine.detect(candle)
        
        assert len(flags[67250.0]) == 0

    def test_severity_scales_correctly(self):
        """100% imbalance should have higher severity than 75%.
        Math: candle_100: delta=10/total=10 = 100%. candle_75: delta=30/total=40 = 75%."""
        candle_100 = make_candle_with_buckets([
            {"price": 67250.0, "buy_vol": 10.0, "sell_vol": 0.0},
            {"price": 67251.0, "buy_vol": 10.0, "sell_vol": 0.0},
            {"price": 67252.0, "buy_vol": 10.0, "sell_vol": 0.0},
        ])
        candle_75 = make_candle_with_buckets([
            {"price": 67250.0, "buy_vol": 35.0, "sell_vol": 5.0},
            {"price": 67251.0, "buy_vol": 35.0, "sell_vol": 5.0},
            {"price": 67252.0, "buy_vol": 35.0, "sell_vol": 5.0},
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
            open=67248.0,
            high=67252.0,
            low=67248.0,
            close=67249.0,
        )
        
        # Add buckets with varying volumes
        total_buy = 0.0
        total_sell = 0.0
        # Place the massive 50.0 volume at the HIGH (67252.0) to trigger sell absorption
        for price, vol in zip([67248.0, 67249.0, 67250.0, 67251.0, 67252.0], [5.0, 10.0, 5.0, 3.0, 50.0]):
            bucket = PriceBucket(price=price)
            bucket.add_buy(vol / 2)
            bucket.add_sell(vol / 2)
            candle.buckets[price] = bucket
            total_buy += vol / 2
            total_sell += vol / 2
        # Set candle-level volumes so detect() doesn't short-circuit on total_vol == 0
        candle.buy_vol = total_buy
        candle.sell_vol = total_sell
        
        engine = DetectionEngine(
            absorption_vol_percentile=75.0,
            absorption_price_pct=0.05,
            min_volume_per_bucket_btc=0.5,
        )
        flags = engine.detect(candle)
        
        # The 50.0 volume bucket at 67252.0 should be flagged
        assert len(flags[67252.0]) > 0
        absorption_flags = [f for f in flags[67252.0] if f.type == DetectionType.ABSORPTION]
        assert len(absorption_flags) == 1
        assert absorption_flags[0].direction == "sell"

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
    """Tests for exhaustion detection — Option C: midpoint snapshot comparison."""

    def _make_candle_with_midpoint(
        self,
        early_trades: list[dict],
        late_trades: list[dict],
        start_ms: int = 1_000_000,
        interval_ms: int = 300_000,
    ) -> FootprintCandle:
        """
        Build a candle by feeding trades through FootprintChart so the midpoint
        snapshot is captured correctly via add_trade's ts_ms path.
        """
        from aggregation.engine import FootprintChart
        chart = FootprintChart(bucket_size=1.0, interval_seconds=interval_ms // 1000)

        midpoint_ms = start_ms + interval_ms // 2

        # Early trades: before midpoint
        for t in early_trades:
            chart.add_trade(
                ts_ms=start_ms + t.get("offset_ms", 0),
                price=t["price"],
                volume=t["volume"],
                side=t["side"],
                exchange="okx",
            )

        # Late trades: after midpoint
        for t in late_trades:
            chart.add_trade(
                ts_ms=midpoint_ms + t.get("offset_ms", 1000),
                price=t["price"],
                volume=t["volume"],
                side=t["side"],
                exchange="okx",
            )

        candles = chart.get_snapshot()
        assert len(candles) == 1, f"Expected 1 candle, got {len(candles)}"
        return candles[0]

    def test_buy_exhaustion_detected(self):
        """
        Strong buy push in early half, strong sell counter-pressure in late half
        at the same price level → exhaustion flagged on buy side.
        """
        candle = self._make_candle_with_midpoint(
            early_trades=[
                {"price": 67251.0, "volume": 40.0, "side": "buy", "offset_ms": 10_000},
                {"price": 67251.0, "volume": 5.0,  "side": "sell", "offset_ms": 20_000},
                # filler buckets so candle_total_vol is meaningful
                {"price": 67249.0, "volume": 2.0, "side": "buy", "offset_ms": 30_000},
                {"price": 67250.0, "volume": 2.0, "side": "sell", "offset_ms": 40_000},
            ],
            late_trades=[
                {"price": 67251.0, "volume": 35.0, "side": "sell", "offset_ms": 10_000},
                {"price": 67249.0, "volume": 1.0, "side": "buy", "offset_ms": 20_000},
            ],
        )

        engine = DetectionEngine()
        flags = engine.detect(candle)

        exh_flags = [f for f in flags.get(67251.0, []) if f.type == DetectionType.EXHAUSTION]
        assert len(exh_flags) == 1
        assert exh_flags[0].direction == "buy"

    def test_sell_exhaustion_detected(self):
        """
        Strong sell push in early half, strong buy counter-pressure in late half → sell exhaustion.
        """
        candle = self._make_candle_with_midpoint(
            early_trades=[
                {"price": 67249.0, "volume": 5.0,  "side": "buy",  "offset_ms": 10_000},
                {"price": 67249.0, "volume": 40.0, "side": "sell", "offset_ms": 20_000},
                {"price": 67250.0, "volume": 2.0, "side": "buy",  "offset_ms": 30_000},
                {"price": 67251.0, "volume": 2.0, "side": "sell", "offset_ms": 40_000},
            ],
            late_trades=[
                {"price": 67249.0, "volume": 35.0, "side": "buy",  "offset_ms": 10_000},
                {"price": 67250.0, "volume": 1.0, "side": "sell", "offset_ms": 20_000},
            ],
        )

        engine = DetectionEngine()
        flags = engine.detect(candle)

        exh_flags = [f for f in flags.get(67249.0, []) if f.type == DetectionType.EXHAUSTION]
        assert len(exh_flags) == 1
        assert exh_flags[0].direction == "sell"

    def test_same_direction_both_halves_not_exhaustion(self):
        """
        Buy dominant in both early and late half → not exhaustion, just sustained buying.
        """
        candle = self._make_candle_with_midpoint(
            early_trades=[
                {"price": 67250.0, "volume": 40.0, "side": "buy",  "offset_ms": 10_000},
                {"price": 67250.0, "volume": 5.0,  "side": "sell", "offset_ms": 20_000},
                {"price": 67249.0, "volume": 2.0, "side": "buy",  "offset_ms": 30_000},
            ],
            late_trades=[
                {"price": 67250.0, "volume": 30.0, "side": "buy",  "offset_ms": 10_000},
                {"price": 67250.0, "volume": 3.0,  "side": "sell", "offset_ms": 20_000},
            ],
        )

        engine = DetectionEngine()
        flags = engine.detect(candle)

        exh_flags = [f for f in flags.get(67250.0, []) if f.type == DetectionType.EXHAUSTION]
        assert len(exh_flags) == 0

    def test_no_midpoint_snapshot_no_crash_no_false_positive(self):
        """
        Candle where all trades arrived before the midpoint — midpoint_snapshot is None.
        Detection must return gracefully with no exhaustion flags and no exception.
        """
        # Build candle manually with all trades before midpoint
        candle = FootprintCandle(
            start_time_ms=1_000_000,
            end_time_ms=1_300_000,  # 5-minute candle
        )
        # Add trades only in the early half (before midpoint at 1_150_000)
        candle.add_trade(67250.0, 40.0, "buy",  bucket_size=1.0, ts_ms=1_010_000)
        candle.add_trade(67250.0, 5.0,  "sell", bucket_size=1.0, ts_ms=1_020_000)
        candle.add_trade(67249.0, 2.0,  "buy",  bucket_size=1.0, ts_ms=1_030_000)

        assert candle.midpoint_snapshot is None, "Snapshot should not exist — all trades before midpoint"

        engine = DetectionEngine()
        # Must not raise, must not produce exhaustion flags
        flags = engine.detect(candle)

        for price_flags in flags.values():
            exh = [f for f in price_flags if f.type == DetectionType.EXHAUSTION]
            assert len(exh) == 0, f"False positive exhaustion at price with no midpoint snapshot"


# ── Multiple Detections Tests ─────────────────────────────────────

class TestMultipleDetections:
    """Tests for buckets that trigger multiple detection types."""

    def test_imbalance_and_exhaustion_mutual_exclusion(self):
        """
        A bucket with strong one-sided imbalance in both halves should get
        imbalance flagged but NOT exhaustion (no direction flip).
        Uses the real trade-based candle builder so midpoint_snapshot is populated.
        """
        from aggregation.engine import FootprintChart
        chart = FootprintChart(bucket_size=1.0, interval_seconds=300)
        start_ms = 1_000_000
        mid_ms = start_ms + 150_000

        # Early half: strong buy at 67250, 67251, 67252
        chart.add_trade(ts_ms=start_ms + 10_000, price=67250.0, volume=45.0, side="buy",  exchange="okx")
        chart.add_trade(ts_ms=start_ms + 11_000, price=67251.0, volume=45.0, side="buy",  exchange="okx")
        chart.add_trade(ts_ms=start_ms + 12_000, price=67252.0, volume=45.0, side="buy",  exchange="okx")
        chart.add_trade(ts_ms=start_ms + 20_000, price=67250.0, volume=5.0,  side="sell", exchange="okx")
        chart.add_trade(ts_ms=start_ms + 21_000, price=67251.0, volume=5.0,  side="sell", exchange="okx")
        chart.add_trade(ts_ms=start_ms + 22_000, price=67252.0, volume=5.0,  side="sell", exchange="okx")
        chart.add_trade(ts_ms=start_ms + 30_000, price=67248.0, volume=2.0,  side="buy",  exchange="okx")
        
        # Late half: still buy dominant (no flip)
        chart.add_trade(ts_ms=mid_ms + 10_000, price=67250.0, volume=35.0, side="buy",  exchange="okx")
        chart.add_trade(ts_ms=mid_ms + 11_000, price=67251.0, volume=35.0, side="buy",  exchange="okx")
        chart.add_trade(ts_ms=mid_ms + 12_000, price=67252.0, volume=35.0, side="buy",  exchange="okx")
        chart.add_trade(ts_ms=mid_ms + 20_000, price=67250.0, volume=4.0,  side="sell", exchange="okx")
        chart.add_trade(ts_ms=mid_ms + 21_000, price=67251.0, volume=4.0,  side="sell", exchange="okx")
        chart.add_trade(ts_ms=mid_ms + 22_000, price=67252.0, volume=4.0,  side="sell", exchange="okx")
        chart.add_trade(ts_ms=mid_ms + 30_000, price=67248.0, volume=1.0,  side="buy",  exchange="okx")
    
        candle = chart.get_snapshot()[0]
    
        engine = DetectionEngine(imbalance_threshold_pct=70.0)
        flags = engine.detect(candle)
    
        flag_types = {f.type for f in flags.get(67250.0, [])}
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