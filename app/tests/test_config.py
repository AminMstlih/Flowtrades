"""
Unit tests for configuration loading and validation.
"""

import pytest
from pathlib import Path
from config import load_config, AppConfig


class TestConfigDefaults:
    def test_default_config_loads(self):
        """Default config should be valid with sensible defaults."""
        config = AppConfig()
        assert config.symbols["BTC-USDT"].bucket_size == 1.0
        assert config.aggregation.default_window == 5
        assert config.aggregation.time_windows_minutes == [1, 5, 15]
        assert config.detection.imbalance_threshold_pct == 85
        assert config.symbols["BTC-USDT"].min_volume == 0.1
        assert config.display.rows == 20
        assert config.display.refresh_rate_ms == 500
        assert config.exchanges.enabled == ["binance"]
        assert config.logging.level == "INFO"

    def test_config_is_frozen(self):
        """Config should not be mutable after creation."""
        config = AppConfig()
        with pytest.raises(Exception):
            config.aggregation = None


class TestConfigValidation:
    def test_invalid_bucket_size(self):
        with pytest.raises(Exception):
            AppConfig(symbols={"BTC-USDT": {"bucket_size": 0}})

    def test_negative_bucket_size(self):
        with pytest.raises(Exception):
            AppConfig(symbols={"BTC-USDT": {"bucket_size": -1.0}})

    def test_empty_time_windows(self):
        with pytest.raises(Exception):
            AppConfig(aggregation={"time_windows_minutes": []})

    def test_negative_time_window(self):
        with pytest.raises(Exception):
            AppConfig(aggregation={"time_windows_minutes": [-1]})

    def test_default_window_not_in_list(self):
        with pytest.raises(Exception):
            AppConfig(aggregation={
                "time_windows_minutes": [1, 5, 15],
                "default_window": 10,
            })

    def test_invalid_exchange(self):
        with pytest.raises(Exception):
            AppConfig(exchanges={"enabled": ["kraken"]})

    def test_empty_exchanges(self):
        with pytest.raises(Exception):
            AppConfig(exchanges={"enabled": []})

    def test_invalid_log_level(self):
        with pytest.raises(Exception):
            AppConfig(logging={"level": "VERBOSE"})

    def test_refresh_rate_too_low(self):
        with pytest.raises(Exception):
            AppConfig(display={"refresh_rate_ms": 50})

    def test_refresh_rate_too_high(self):
        with pytest.raises(Exception):
            AppConfig(display={"refresh_rate_ms": 10000})

    def test_imbalance_over_100(self):
        with pytest.raises(Exception):
            AppConfig(detection={"imbalance_threshold_pct": 150})


class TestConfigLoad:
    def test_load_from_real_config(self):
        """Load the actual config.toml file."""
        config_path = Path(__file__).parent.parent / "config.toml"
        if config_path.exists():
            config = load_config(config_path)
            assert isinstance(config, AppConfig)
            assert config.symbols["BTC-USDT"].bucket_size > 0

    def test_load_missing_file_uses_defaults(self):
        config = load_config(Path("/nonexistent/config.toml"))
        assert isinstance(config, AppConfig)
        assert config.symbols["BTC-USDT"].bucket_size == 1.0
