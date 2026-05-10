"""
Unit tests for the Aggregation Engine (FootprintChart + FootprintCandle).

Tests with synthetic known data — we know the expected outcomes
before running. If these fail, the aggregation math is wrong
and nothing built on top of it is trustworthy.

Tests the CURRENT candle-based API: FootprintChart, FootprintCandle, PriceBucket.
"""

import math
import pytest
from aggregation.engine import FootprintChart, FootprintCandle, PriceBucket


# ── PriceBucket Math Tests ────────────────────────────────────────

class TestPriceBucket:
    def test_initial_state(self):
        b = PriceBucket(price=67250.0)
        assert b.buy_vol == 0.0
        assert b.sell_vol == 0.0
        assert b.delta == 0.0
        assert b.total_vol == 0.0
        assert b.imbalance_pct is None
        assert b.trade_count == 0

    def test_buy_only(self):
        b = PriceBucket(price=67250.0)
        b.add_buy(10.0)
        assert b.buy_vol == 10.0
        assert b.sell_vol == 0.0
        assert b.delta == 10.0
        assert b.total_vol == 10.0
        assert b.imbalance_pct == 100.0
        assert b.trade_count == 1

    def test_sell_only(self):
        b = PriceBucket(price=67250.0)
        b.add_sell(5.0)
        assert b.buy_vol == 0.0
        assert b.sell_vol == 5.0
        assert b.delta == -5.0
        assert b.total_vol == 5.0
        assert b.imbalance_pct == -100.0
        assert b.trade_count == 1

    def test_mixed(self):
        b = PriceBucket(price=67250.0)
        b.add_buy(42.80)
        b.add_sell(12.10)
        assert abs(b.delta - 30.70) < 0.01
        assert abs(b.total_vol - 54.90) < 0.01
        expected_imb = (30.70 / 54.90) * 100
        assert abs(b.imbalance_pct - expected_imb) < 0.1
        assert b.trade_count == 2

    def test_balanced(self):
        b = PriceBucket(price=67250.0)
        b.add_buy(50.0)
        b.add_sell(50.0)
        assert b.delta == 0.0
        assert b.imbalance_pct == 0.0

    def test_multiple_buys(self):
        b = PriceBucket(price=67250.0)
        b.add_buy(1.0)
        b.add_buy(2.0)
        b.add_buy(3.0)
        assert abs(b.buy_vol - 6.0) < 0.001
        assert b.trade_count == 3


# ── Bucket Price Binning Tests ────────────────────────────────────
# Test that math.floor(price / bucket_size) * bucket_size works correctly

class TestBucketBinning:
    def _bucket_price(self, price: float, bucket_size: float) -> float:
        return math.floor(price / bucket_size) * bucket_size

    def test_exact_boundary(self):
        assert self._bucket_price(67250.0, 1.0) == 67250.0

    def test_within_bucket(self):
        assert self._bucket_price(67250.5, 1.0) == 67250.0

    def test_just_below_next_bucket(self):
        assert self._bucket_price(67250.999, 1.0) == 67250.0

    def test_next_bucket(self):
        assert self._bucket_price(67251.0, 1.0) == 67251.0

    def test_bucket_size_5(self):
        assert self._bucket_price(67250.0, 5.0) == 67250.0
        assert self._bucket_price(67253.8, 5.0) == 67250.0
        assert self._bucket_price(67255.0, 5.0) == 67255.0

    def test_bucket_size_10(self):
        assert self._bucket_price(67250.0, 10.0) == 67250.0
        assert self._bucket_price(67259.9, 10.0) == 67250.0
        assert self._bucket_price(67260.0, 10.0) == 67260.0

    def test_small_bucket_size(self):
        assert self._bucket_price(67250.35, 0.5) == 67250.0
        assert self._bucket_price(67250.50, 0.5) == 67250.5
        assert self._bucket_price(67250.75, 0.5) == 67250.5


# ── FootprintCandle Tests ─────────────────────────────────────────

class TestFootprintCandle:
    def test_single_buy_trade(self):
        c = FootprintCandle(start_time_ms=0, end_time_ms=60000)
        c.add_trade(67250.5, 1.0, "buy", bucket_size=1.0)

        assert c.open == 67250.5
        assert c.high == 67250.5
        assert c.low == 67250.5
        assert c.close == 67250.5
        assert c.buy_vol == 1.0
        assert c.sell_vol == 0.0
        assert c.delta == 1.0
        assert c.trade_count == 1

        # Should create bucket at 67250.0
        assert 67250.0 in c.buckets
        b = c.buckets[67250.0]
        assert b.buy_vol == 1.0
        assert b.sell_vol == 0.0

    def test_multiple_trades_same_bucket(self):
        """3 buy trades at prices within bucket 67250 → single bucket."""
        c = FootprintCandle(start_time_ms=0, end_time_ms=60000)
        c.add_trade(67250.5, 1.0, "buy", bucket_size=1.0)
        c.add_trade(67250.3, 0.5, "buy", bucket_size=1.0)
        c.add_trade(67250.8, 2.0, "buy", bucket_size=1.0)

        assert len(c.buckets) == 1
        b = c.buckets[67250.0]
        assert abs(b.buy_vol - 3.5) < 0.001
        assert b.sell_vol == 0.0
        assert abs(b.delta - 3.5) < 0.001
        assert b.imbalance_pct == 100.0

    def test_mixed_trades_same_bucket(self):
        c = FootprintCandle(start_time_ms=0, end_time_ms=60000)
        c.add_trade(67250.1, 42.80, "buy", bucket_size=1.0)
        c.add_trade(67250.9, 12.10, "sell", bucket_size=1.0)

        assert len(c.buckets) == 1
        b = c.buckets[67250.0]
        assert abs(b.buy_vol - 42.80) < 0.01
        assert abs(b.sell_vol - 12.10) < 0.01
        assert abs(b.delta - 30.70) < 0.01

    def test_multiple_buckets(self):
        c = FootprintCandle(start_time_ms=0, end_time_ms=60000)
        c.add_trade(67250.5, 10.0, "buy", bucket_size=1.0)
        c.add_trade(67251.5, 5.0, "sell", bucket_size=1.0)
        c.add_trade(67249.5, 3.0, "buy", bucket_size=1.0)

        assert len(c.buckets) == 3
        assert 67250.0 in c.buckets
        assert 67251.0 in c.buckets
        assert 67249.0 in c.buckets

    def test_ohlc_tracking(self):
        c = FootprintCandle(start_time_ms=0, end_time_ms=60000)
        c.add_trade(67250.0, 1.0, "buy", bucket_size=1.0)
        c.add_trade(67252.0, 1.0, "buy", bucket_size=1.0)
        c.add_trade(67248.0, 1.0, "sell", bucket_size=1.0)
        c.add_trade(67251.0, 1.0, "sell", bucket_size=1.0)

        assert c.open == 67250.0
        assert c.high == 67252.0
        assert c.low == 67248.0
        assert c.close == 67251.0

    def test_total_vol(self):
        c = FootprintCandle(start_time_ms=0, end_time_ms=60000)
        c.add_trade(67250.0, 10.0, "buy", bucket_size=1.0)
        c.add_trade(67250.0, 5.0, "sell", bucket_size=1.0)
        assert c.total_vol == 15.0

    def test_bucket_size_5(self):
        c = FootprintCandle(start_time_ms=0, end_time_ms=60000)
        c.add_trade(67250.0, 1.0, "buy", bucket_size=5.0)
        c.add_trade(67252.0, 2.0, "buy", bucket_size=5.0)
        c.add_trade(67254.9, 3.0, "sell", bucket_size=5.0)

        # All three should land in bucket 67250.0
        assert len(c.buckets) == 1
        b = c.buckets[67250.0]
        assert abs(b.buy_vol - 3.0) < 0.001
        assert abs(b.sell_vol - 3.0) < 0.001


# ── FootprintChart Tests ──────────────────────────────────────────

class TestFootprintChart:
    def test_invalid_bucket_size_raises(self):
        with pytest.raises(ValueError, match="positive"):
            FootprintChart(bucket_size=0)

    def test_negative_bucket_size_raises(self):
        with pytest.raises(ValueError, match="positive"):
            FootprintChart(bucket_size=-1.0)

    def test_single_trade_creates_candle(self):
        chart = FootprintChart(bucket_size=1.0, interval_seconds=60)
        chart.add_trade(ts_ms=0, price=67250.0, volume=1.0, side="buy")

        snap = chart.get_snapshot()
        assert len(snap) == 1
        assert snap[0].buy_vol == 1.0

    def test_candle_rollover(self):
        """Trades in different intervals create separate candles."""
        chart = FootprintChart(bucket_size=1.0, interval_seconds=60)

        # Candle 1: timestamp 0ms (interval [0, 60000))
        chart.add_trade(ts_ms=0, price=67250.0, volume=1.0, side="buy")
        chart.add_trade(ts_ms=30000, price=67250.0, volume=2.0, side="sell")

        # Candle 2: timestamp 60000ms (interval [60000, 120000))
        chart.add_trade(ts_ms=60000, price=67251.0, volume=3.0, side="buy")

        snap = chart.get_snapshot()
        assert len(snap) == 2

        # First candle should be sealed in history
        assert snap[0].buy_vol == 1.0
        assert snap[0].sell_vol == 2.0

        # Second candle is active
        assert snap[1].buy_vol == 3.0

    def test_snapshot_ordering(self):
        """Snapshot returns historical candles first, then active."""
        chart = FootprintChart(bucket_size=1.0, interval_seconds=60)

        chart.add_trade(ts_ms=0, price=67250.0, volume=1.0, side="buy")
        chart.add_trade(ts_ms=60000, price=67251.0, volume=2.0, side="buy")
        chart.add_trade(ts_ms=120000, price=67252.0, volume=3.0, side="buy")

        snap = chart.get_snapshot()
        assert len(snap) == 3
        assert snap[0].start_time_ms == 0
        assert snap[1].start_time_ms == 60000
        assert snap[2].start_time_ms == 120000

    def test_max_candles_cap(self):
        """Historical candles capped at max_candles."""
        chart = FootprintChart(bucket_size=1.0, interval_seconds=60, max_candles=3)

        for i in range(6):
            chart.add_trade(ts_ms=i * 60000, price=67250.0, volume=1.0, side="buy")

        snap = chart.get_snapshot()
        # max_candles=3 for history + 1 active
        assert len(snap) <= 4

    def test_clear(self):
        chart = FootprintChart(bucket_size=1.0, interval_seconds=60)
        chart.add_trade(ts_ms=0, price=67250.0, volume=1.0, side="buy")
        chart.clear()

        snap = chart.get_snapshot()
        assert len(snap) == 0
        assert chart.active_candle is None

    def test_trades_within_same_candle(self):
        """Multiple trades within the same interval stay in one candle."""
        chart = FootprintChart(bucket_size=1.0, interval_seconds=300)  # 5 min

        chart.add_trade(ts_ms=0, price=67250.0, volume=1.0, side="buy")
        chart.add_trade(ts_ms=10000, price=67251.0, volume=2.0, side="sell")
        chart.add_trade(ts_ms=200000, price=67249.0, volume=3.0, side="buy")

        snap = chart.get_snapshot()
        assert len(snap) == 1
        assert snap[0].trade_count == 3
        assert snap[0].buy_vol == 4.0
        assert snap[0].sell_vol == 2.0
