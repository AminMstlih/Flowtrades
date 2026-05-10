"""
Unit tests for Binance normalizer.

Tests the CRITICAL side field inversion:
  m=True  (buyer is maker) → aggressor is SELLER → side="sell"
  m=False (seller is maker) → aggressor is BUYER  → side="buy"

Uses real aggTrade payload structure from Binance Futures API.
"""

import pytest
from normalization.binance_normalizer import normalize_binance_trade
from normalization.models import Trade


# ── Real Payload Fixtures ────────────────────────────────────────
# These mimic the exact structure output by BinanceClient.parse_message()

def _make_raw(
    price: str = "67250.10",
    volume: str = "0.500",
    is_buyer_maker: bool = True,
    timestamp: int = 1672515782120,
    trade_id: str = "164753889",
) -> dict:
    """Helper to create raw trade dict as emitted by BinanceClient."""
    return {
        "exchange": "binance",
        "symbol": "BTC-PERP-USDT",
        "price": price,
        "volume": volume,
        "is_buyer_maker": is_buyer_maker,
        "timestamp": timestamp,
        "trade_id": trade_id,
        "raw": {
            "e": "aggTrade",
            "E": 1672515782136,
            "a": int(trade_id),
            "s": "BTCUSDT",
            "p": price,
            "q": volume,
            "f": 318471023,
            "l": 318471025,
            "T": timestamp,
            "m": is_buyer_maker,
        },
    }


# ── Side Classification Tests (THE critical tests) ──────────────

class TestSideClassification:
    """These must NEVER fail. If they do, every delta is inverted."""

    def test_buyer_is_maker_means_sell(self):
        """m=True → buyer was maker → SELLER is aggressor."""
        raw = _make_raw(is_buyer_maker=True)
        trade = normalize_binance_trade(raw)
        assert trade.side == "sell", (
            "CRITICAL: m=True should map to 'sell' (buyer was the maker, "
            "so seller was the aggressor/taker)"
        )

    def test_seller_is_maker_means_buy(self):
        """m=False → seller was maker → BUYER is aggressor."""
        raw = _make_raw(is_buyer_maker=False)
        trade = normalize_binance_trade(raw)
        assert trade.side == "buy", (
            "CRITICAL: m=False should map to 'buy' (seller was the maker, "
            "so buyer was the aggressor/taker)"
        )

    def test_side_inversion_consistency(self):
        """Verify both sides produce opposite results with same data."""
        raw_sell = _make_raw(is_buyer_maker=True)
        raw_buy = _make_raw(is_buyer_maker=False)

        sell_trade = normalize_binance_trade(raw_sell)
        buy_trade = normalize_binance_trade(raw_buy)

        assert sell_trade.side != buy_trade.side
        assert sell_trade.side == "sell"
        assert buy_trade.side == "buy"


# ── Field Mapping Tests ──────────────────────────────────────────

class TestFieldMapping:
    def test_price_conversion(self):
        raw = _make_raw(price="67250.10")
        trade = normalize_binance_trade(raw)
        assert trade.price == 67250.10
        assert isinstance(trade.price, float)

    def test_volume_conversion(self):
        raw = _make_raw(volume="1.234")
        trade = normalize_binance_trade(raw)
        assert trade.volume == 1.234
        assert isinstance(trade.volume, float)

    def test_timestamp(self):
        raw = _make_raw(timestamp=1672515782120)
        trade = normalize_binance_trade(raw)
        assert trade.timestamp == 1672515782120

    def test_trade_id(self):
        raw = _make_raw(trade_id="164753889")
        trade = normalize_binance_trade(raw)
        assert trade.trade_id == "164753889"

    def test_exchange_field(self):
        raw = _make_raw()
        trade = normalize_binance_trade(raw)
        assert trade.exchange == "binance"

    def test_symbol_normalized(self):
        raw = _make_raw()
        trade = normalize_binance_trade(raw)
        assert trade.symbol == "BTC-PERP-USDT"

    def test_raw_preserved(self):
        raw = _make_raw()
        trade = normalize_binance_trade(raw)
        assert "e" in trade.raw
        assert trade.raw["e"] == "aggTrade"

    def test_returns_trade_instance(self):
        raw = _make_raw()
        trade = normalize_binance_trade(raw)
        assert isinstance(trade, Trade)


# ── Edge Cases ────────────────────────────────────────────────────

class TestEdgeCases:
    def test_very_small_volume(self):
        raw = _make_raw(volume="0.001")
        trade = normalize_binance_trade(raw)
        assert trade.volume == 0.001

    def test_large_volume(self):
        raw = _make_raw(volume="150.000")
        trade = normalize_binance_trade(raw)
        assert trade.volume == 150.0

    def test_price_many_decimals(self):
        raw = _make_raw(price="67250.12345678")
        trade = normalize_binance_trade(raw)
        assert abs(trade.price - 67250.12345678) < 1e-6

    def test_round_price(self):
        raw = _make_raw(price="67000.00")
        trade = normalize_binance_trade(raw)
        assert trade.price == 67000.0


# ── Batch Validation (10 realistic trades) ────────────────────────

class TestBatchValidation:
    """Simulate 10 consecutive aggTrade events with realistic data."""

    FIXTURES = [
        ("67250.10", "0.500", True,  1672515782120, "164753889"),
        ("67250.20", "1.200", False, 1672515782150, "164753890"),
        ("67249.90", "0.100", True,  1672515782180, "164753891"),
        ("67250.50", "3.000", False, 1672515782200, "164753892"),
        ("67251.00", "0.050", True,  1672515782230, "164753893"),
        ("67249.00", "2.500", True,  1672515782260, "164753894"),
        ("67250.00", "0.800", False, 1672515782290, "164753895"),
        ("67248.50", "5.000", True,  1672515782320, "164753896"),
        ("67252.00", "0.300", False, 1672515782350, "164753897"),
        ("67250.10", "1.100", True,  1672515782380, "164753898"),
    ]

    def test_all_fixtures_normalize(self):
        for price, vol, m, ts, tid in self.FIXTURES:
            raw = _make_raw(price, vol, m, ts, tid)
            trade = normalize_binance_trade(raw)
            assert trade.price == float(price)
            assert trade.volume == float(vol)
            assert trade.side == ("sell" if m else "buy")
            assert trade.timestamp == ts
            assert trade.trade_id == tid
