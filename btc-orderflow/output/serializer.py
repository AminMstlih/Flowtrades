"""
State Serializer — converts FootprintState to JSON for WebSocket broadcast.

Clean JSON schema versioned for frontend compatibility.
Now serialized as an array of structured FootprintCandles.
"""

from __future__ import annotations

import time

from state.state import FootprintState


def serialize_state(
    state: FootprintState,
    num_rows: int = 20,
    enabled_exchanges: list[str] | None = None,
) -> dict:
    """
    Serialize current footprint state to a JSON-serializable dict.

    This is the contract between backend and frontend.
    
    Args:
        state: The footprint state to serialize.
        num_rows: Maximum number of candles to include in output.
                  Prevents unbounded payload growth.
    """
    stats = state.stats
    all_candles = state.get_display_state()
    
    # Truncate to num_rows — always include the most recent candles
    # This is critical: without truncation, high-volume periods
    # produce 10-50x larger payloads, degrading frontend performance
    candles = all_candles[-num_rows:] if len(all_candles) > num_rows else all_candles

    serialized_candles = []
    for c in candles:
        # Run detection engine on this candle
        detection_flags = state.detector.detect(c)
        
        serialized_buckets = []
        for b in c.buckets.values():
            bucket_data = {
                "price": b.price,
                "buy_vol": round(b.buy_vol, 4),
                "sell_vol": round(b.sell_vol, 4),
                "delta": round(b.delta, 4),
                "imbalance": round(b.imbalance_pct, 1) if b.imbalance_pct is not None else None,
                "total_vol": round(b.total_vol, 4),
            }
            
            # Add detection flags for this bucket
            flags = detection_flags.get(b.price, [])
            if flags:
                bucket_data["flags"] = [
                    {
                        "type": f.type.value,
                        "direction": f.direction,
                        "severity": f.severity,
                        "label": f.label,
                    }
                    for f in flags
                ]
            
            serialized_buckets.append(bucket_data)
        
        serialized_candles.append({
            "start_time": c.start_time_ms,
            "end_time": c.end_time_ms,
            "open": c.open,
            "high": c.high,
            "low": c.low,
            "close": c.close,
            "buy_vol": round(c.buy_vol, 4),
            "sell_vol": round(c.sell_vol, 4),
            "total_vol": round(c.total_vol, 4),
            "delta": round(c.delta, 4),
            "buckets": serialized_buckets,
        })

    return {
        "ts": int(time.time() * 1000),
        "exchanges": enabled_exchanges or [],
        "last_price": stats["last_price"],
        "window_sec": stats.get("window_seconds", 300),
        "total_trades": stats["total_trades_processed"],
        "total_candles": stats.get("total_candles", 0),
        "active_buckets": stats["active_buckets"],
        "candles": serialized_candles,
    }
