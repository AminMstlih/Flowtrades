"""
Configuration loader for BTC Order Flow Lite.

Loads config.toml, validates all parameters, returns a frozen AppConfig.
Fails loudly on invalid config — constraint #9.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:
    import tomli as tomllib

from pydantic import BaseModel, Field, field_validator


class AggregationConfig(BaseModel):
    bucket_size_usd: float = Field(default=1.0, gt=0)
    time_windows_minutes: list[int] = Field(default=[1, 5, 15])
    default_window: int = Field(default=5)

    @field_validator("time_windows_minutes")
    @classmethod
    def windows_not_empty(cls, v: list[int]) -> list[int]:
        if not v:
            raise ValueError("time_windows_minutes must not be empty")
        if any(w <= 0 for w in v):
            raise ValueError("All time windows must be positive integers")
        return sorted(v)

    @field_validator("default_window")
    @classmethod
    def default_in_windows(cls, v: int, info) -> int:
        windows = info.data.get("time_windows_minutes", [1, 5, 15])
        if v not in windows:
            raise ValueError(
                f"default_window ({v}) must be one of time_windows_minutes ({windows})"
            )
        return v


class DetectionConfig(BaseModel):
    imbalance_threshold_pct: float = Field(default=70, ge=0, le=100)
    min_volume_per_bucket_btc: float = Field(default=0.5, ge=0)
    absorption_vol_percentile: float = Field(default=80, ge=0, le=100)
    absorption_price_pct: float = Field(default=0.05, ge=0)


class ExchangesConfig(BaseModel):
    enabled: list[str] = Field(default=["binance"])

    @field_validator("enabled")
    @classmethod
    def valid_exchanges(cls, v: list[str]) -> list[str]:
        allowed = {"binance", "okx", "bybit"}
        invalid = set(v) - allowed
        if invalid:
            raise ValueError(f"Unknown exchanges: {invalid}. Allowed: {allowed}")
        if not v:
            raise ValueError("At least one exchange must be enabled")
        return v


class DisplayConfig(BaseModel):
    rows: int = Field(default=20, ge=1, le=100)
    refresh_rate_ms: int = Field(default=500, ge=100, le=5000)


class LoggingConfig(BaseModel):
    level: str = Field(default="INFO")
    log_first_n_raw: int = Field(default=100, ge=0)

    @field_validator("level")
    @classmethod
    def valid_level(cls, v: str) -> str:
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        if v.upper() not in allowed:
            raise ValueError(f"Invalid log level: {v}. Allowed: {allowed}")
        return v.upper()


class ServerConfig(BaseModel):
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000, ge=1, le=65535)
    cors_origins: list[str] = Field(
        default=["http://localhost:5173", "http://localhost:3000"]
    )


class AppConfig(BaseModel):
    """Top-level application config. Frozen after creation."""

    model_config = {"frozen": True}

    aggregation: AggregationConfig = Field(default_factory=AggregationConfig)
    detection: DetectionConfig = Field(default_factory=DetectionConfig)
    exchanges: ExchangesConfig = Field(default_factory=ExchangesConfig)
    display: DisplayConfig = Field(default_factory=DisplayConfig)
    server: ServerConfig = Field(default_factory=ServerConfig)
    logging: LoggingConfig = Field(default_factory=LoggingConfig)


def load_config(config_path: Path | None = None) -> AppConfig:
    """
    Load and validate configuration from config.toml.

    Falls back to defaults if no config file found.
    Fails loudly on invalid parameters.
    """
    if config_path is None:
        config_path = Path(__file__).parent / "config.toml"

    if not config_path.exists():
        print(
            f"[WARNING] Config file not found at {config_path}. Using defaults.",
            file=sys.stderr,
        )
        return AppConfig()

    with open(config_path, "rb") as f:
        raw = tomllib.load(f)

    try:
        config = AppConfig(**raw)
    except Exception as e:
        print(f"[FATAL] Config validation failed: {e}", file=sys.stderr)
        sys.exit(1)

    return config
