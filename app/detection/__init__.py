"""
Detection Engine — pattern recognition layer for order flow analysis.

Flags price buckets with educational annotations:
- Imbalance: directional dominance (buy/sell pressure)
- Absorption: high volume with minimal price movement
- Exhaustion: volume spike followed by counter-pressure reversal

These are NOT signals. They are contextual annotations that help
traders understand what the footprint data means.

Architecture doc Section 4.
"""

from detection.engine import DetectionEngine, DetectionFlag

__all__ = ["DetectionEngine", "DetectionFlag"]