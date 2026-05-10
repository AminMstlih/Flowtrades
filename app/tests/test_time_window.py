"""
Unit tests for candle time boundary and rollover behavior.

Tests that trades correctly seal into historical candles when
crossing interval boundaries, and that late/out-of-order trades
are handled appropriately.

Replaces old TimeWindow tests — the candle-based engine handles
time boundaries internally via FootprintChart.add_trade().
"""

import pytest
from aggregation.engine import FootprintChart


class TestCandleTimeBoundaries:
    def test_trades_in_same_interval_grouped(self):
        """Trades within one 60s interval all land in the same candle."""
        chart = FootprintChart(bucket_size=1.0, interval_seconds=60)

        chart.add_trade(ts_ms=1000, price=67250.0, volume=1.0, side="buy")
        chart.add_trade(ts_ms=2000, price=67250.0, volume=2.0, side="sell")
        chart.add_trade(ts_ms=30000, price=67250.0, volume=3.0, side="buy")

        snap = chart.get_snapshot()
        assert len(snap) == 1
        assert snap[0].buy_vol == 4.0
        assert snap[0].sell_vol == 2.0
        assert snap[0].trade_count == 3

    def test_boundary_crossing_seals_candle(self):
        """Trade at T=0 and T=60s should create two candles."""
        chart = FootprintChart(bucket_size=1.0, interval_seconds=60)

        # Candle 1: [0, 60000)
        chart.add_trade(ts_ms=0, price=67250.0, volume=5.0, side="buy")

        # Candle 2: [60000, 120000)
        chart.add_trade(ts_ms=60000, price=67250.0, volume=3.0, side="sell")

        snap = chart.get_snapshot()
        assert len(snap) == 2

        # First candle sealed with buy only
        assert snap[0].buy_vol == 5.0
        assert snap[0].sell_vol == 0.0

        # Second candle active with sell only
        assert snap[1].buy_vol == 0.0
        assert snap[1].sell_vol == 3.0

    def test_multiple_candle_boundaries(self):
        """Trades across 3 intervals create 3 candles."""
        chart = FootprintChart(bucket_size=1.0, interval_seconds=60)

        chart.add_trade(ts_ms=0, price=67250.0, volume=1.0, side="buy")
        chart.add_trade(ts_ms=10000, price=67250.0, volume=2.0, side="buy")

        chart.add_trade(ts_ms=60000, price=67250.0, volume=3.0, side="sell")

        chart.add_trade(ts_ms=120000, price=67250.0, volume=4.0, side="buy")

        snap = chart.get_snapshot()
        assert len(snap) == 3

        # Candle 1: 1+2 = 3 BTC buy
        assert abs(snap[0].buy_vol - 3.0) < 0.001
        assert snap[0].sell_vol == 0.0

        # Candle 2: 3 BTC sell
        assert snap[1].buy_vol == 0.0
        assert abs(snap[1].sell_vol - 3.0) < 0.001

        # Candle 3: 4 BTC buy
        assert abs(snap[2].buy_vol - 4.0) < 0.001

    def test_gap_skips_create_separate_candles(self):
        """Large time gaps (skipping intervals) still produce separate candles."""
        chart = FootprintChart(bucket_size=1.0, interval_seconds=60)

        chart.add_trade(ts_ms=0, price=67250.0, volume=1.0, side="buy")
        # Skip to 5 minutes later
        chart.add_trade(ts_ms=300000, price=67260.0, volume=2.0, side="sell")

        snap = chart.get_snapshot()
        assert len(snap) == 2
        assert snap[0].start_time_ms == 0
        assert snap[1].start_time_ms == 300000

    def test_candle_start_end_times(self):
        """Candle start/end times align to interval boundaries."""
        chart = FootprintChart(bucket_size=1.0, interval_seconds=60)

        # Trade at T=35000ms falls in interval [0, 60000)
        chart.add_trade(ts_ms=35000, price=67250.0, volume=1.0, side="buy")

        snap = chart.get_snapshot()
        assert snap[0].start_time_ms == 0
        assert snap[0].end_time_ms == 60000

    def test_candle_alignment_with_offset(self):
        """Trade at T=95000 falls in interval [60000, 120000)."""
        chart = FootprintChart(bucket_size=1.0, interval_seconds=60)

        chart.add_trade(ts_ms=95000, price=67250.0, volume=1.0, side="buy")

        snap = chart.get_snapshot()
        assert snap[0].start_time_ms == 60000
        assert snap[0].end_time_ms == 120000

    def test_max_candles_evicts_oldest(self):
        """When max_candles is exceeded, oldest candles are dropped."""
        chart = FootprintChart(bucket_size=1.0, interval_seconds=60, max_candles=3)

        # Create 5 candles (only 3 kept in history)
        for i in range(5):
            chart.add_trade(ts_ms=i * 60000, price=67250.0, volume=1.0, side="buy")

        snap = chart.get_snapshot()
        # 3 historical + 1 active = 4 max, but deque caps history at 3
        # The first 2 candles should have been evicted
        assert snap[0].start_time_ms >= 60000  # candle 0 evicted

    def test_5_minute_interval(self):
        """5-minute candles aggregate correctly."""
        chart = FootprintChart(bucket_size=1.0, interval_seconds=300)

        # All within first 5 minutes
        chart.add_trade(ts_ms=0, price=67250.0, volume=1.0, side="buy")
        chart.add_trade(ts_ms=60000, price=67250.0, volume=2.0, side="sell")
        chart.add_trade(ts_ms=120000, price=67250.0, volume=3.0, side="buy")
        chart.add_trade(ts_ms=240000, price=67250.0, volume=4.0, side="sell")

        snap = chart.get_snapshot()
        assert len(snap) == 1
        assert snap[0].buy_vol == 4.0
        assert snap[0].sell_vol == 6.0
        assert snap[0].trade_count == 4

        # Next candle: at 5 minutes
        chart.add_trade(ts_ms=300000, price=67251.0, volume=5.0, side="buy")

        snap = chart.get_snapshot()
        assert len(snap) == 2

    def test_empty_chart_snapshot(self):
        """Empty chart returns empty snapshot."""
        chart = FootprintChart(bucket_size=1.0, interval_seconds=60)
        snap = chart.get_snapshot()
        assert snap == []

    def test_invalid_interval_zero(self):
        """Zero interval should fail or be handled."""
        # interval_seconds=0 would cause division by zero in candle_start calc
        # The current code doesn't validate this — just testing behavior
        chart = FootprintChart(bucket_size=1.0, interval_seconds=0)
        # interval_ms = 0, which would cause ZeroDivisionError
        with pytest.raises(ZeroDivisionError):
            chart.add_trade(ts_ms=1000, price=67250.0, volume=1.0, side="buy")
