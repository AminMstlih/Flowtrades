# Changelog

## 💎 Post-Phase 9 Hotfix Part 3 — Footprint Badge Zoom Optimization (May 2026)

### Frontend — Dynamic Space-Aware Badge Rendering
* **Zoom-Adaptive Badge Rendering**: Linked badge types to `showNumbers` visibility state. When footprint numbers/texts are hidden (`!showNumbers`), the canvas renders high-visibility solid structural fallback dots in the center. When footprint numbers/texts are visible (`showNumbers`), the canvas renders text-based badges (`ABS` / `EXH`).
* **Dynamic Space-Aware Abbreviation**: Introduced space-aware automatic abbreviation. If a badge's text block would overlap with the center numbers, the badge automatically falls back to single-letter abbreviation (`"ABS"` $\rightarrow$ `"A"`, `"EXH"` $\rightarrow$ `"E"`). If even the abbreviated badge cannot fit within the candle body boundary without colliding with the buy numbers, it is gracefully hidden.
* **Precise Margin Calculation**: Replaced the rigid `centerX + 25` overlap guard with a dynamic calculation. Measures the exact pixel width of the active buy volume number (`buyTextWidth`) using `ctx.measureText` under the current footprint font, establishing an exact `centerX + 3 + buyTextWidth + 2` horizontal boundary for safe rendering.

---

## 💎 Post-Phase 9 Hotfix Part 2 — Spacing Calibration, Overlap Fix, & Premium HUD Upgrades (May 2026)

### Frontend — Footprint Spacing & Density Calibration
* **Dynamic Tick Height Projection**: Refactored `measureRowHeight` in `FootprintLwcChart.jsx` to map the exact price difference of a single unit of `tickSize` (difference between `p0` and `p0 - tickSize`). This mathematically resolves the sparse buckets issue where gaps in trade activity led to artificially inflated row heights, fixing vertical overlaps for low-priced, dense assets like `BEAT-USDT`.
* **Proportional Gap Optimization**: Raised `barHeight` coverage multiplier from `85%` to `96%` of dynamic `rowH`, shrinking the visual vertical gap between adjacent footprint cells down to a hair-thin `4%` space, establishing a seamless block column design.
* **Vertical Text Guard**: Implemented an adaptive row height text guard (`rowH < 12`), auto-hiding footprint numbers when the screen height is too compressed, while continuing to draw the distinct volume bars and highlight blocks.

### Frontend — Premium HUD Timers & Badge Optimizations
* **Header Live Candle Countdown**: Added a client-side clock loop (`1000ms` tick) in `Header.jsx` synchronized to UTC epoch timeframe boundaries. Automatically parses seconds remaining into `MM:SS` (or `HH:MM:SS` for intervals $\geq$ 1h) using tabular-nums monospace overrides.
* **Header Alert State Pulse**: Integrates a dynamic alert system. If a candle's lifespan reaches $\leq 10$ seconds remaining, the countdown text dynamically switches to glowing neon cyber-orange (`#ff9800`) with an organic breathing animation (`@keyframes timer-pulse`).
* **Interactive Price Scale Countdown**: Disabled LWC's built-in price line (`priceLineVisible: false`) to construct a fully managed, custom countdown line. Renders a real-time countdown string (e.g. `⏱️ 04:32`) on the canvas right next to LWC's right price scale, colored based on candle direction (neon green `#26A69A` for up, bright red `#EF5350` for down).
* **IMB Badge Redundancy Clean-up**: Completely eliminated redundant `IMB` text pill badges. Imbalances are now represented purely by cell background highlights, saving horizontal screen space and reducing noise.
* **High-Severity Numeric Color-Coding**: For imbalances with a severity rating of $> 7$, the monospace bid/ask numbers themselves are dynamically colored—gold (`#ffd700`) for aggressive buy imbalances on the ask, and red (`#EF5350`) for aggressive sell imbalances on the bid.
* **Zoomed-Out Badge Fallback**: Decoupled the badge loop from `showFootprint` constraints. If a user zooms out horizontally (columns become narrow), the text pill badges are replaced with high-visibility solid structural dots colored in amber (`ABS`) and blue (`EXH`).

---

## 🛠️ Post-Phase 9 Hotfix - Decimal Precision, Axis Formatting, & Crash Resolution (May 2026)

### Frontend & Charting Core
* **LWC Crash Guard & Decimal Decoupling**: Decoupled the Lightweight Charts custom series `priceFormat` (precision and `minMove`) entirely from the aggregated footprints `tickSize`. Bound the chart's price scaling configuration to the asset's static natural decimals spec (`1` for BTC, `4` for BEAT, and `2` for HYPE).
* **Base-10 minMove Enforcement**: Ensured `minMove` passed to LWC is strictly a base-10 subdivision (`0.1`, `0.0001`, `0.01`), mathematically eliminating the internal LWC `unexpected base` coordinate projection assertion crash when trading tokens like `BEAT-USDT-SWAP` or `HYPE-USDT` with non-base-10 ticks (e.g. `0.00015`, `0.0003`, or `0.0008`).
* **Stale Closure Mitigation**: Introduced `symbolRef` in `FootprintLwcChart.jsx` to ensure the chart's mount-level crosshair subscription always references the fresh active symbol state, preventing stale formatting properties.
* **Localized Price Formatting & Thousands Grouping**: Integrated the unified `formatPrice` utility across LWC's right-side price scale formatter, hover crosshair marker, and stats tooltip. Large figures (like BTC price and cumulative volume delta) now display with proper US comma grouping (e.g. `74,032.4` and `+162,650.00`) instead of unformatted raw decimals.

---

## ✅ Phase 9 Complete - Cohesive HUD Design & Glassmorphic UI Upgrade

### Frontend — Premium Glassmorphic HUD & Controls
* **Custom Dropdown Selects**: Replaced native HTML `<select>` elements for `Tick Size` and `Timeframe` with React-driven options panels featuring glassmorphic blur (`blur(12px)`), glow transitions, and a click-outside dismissal handler.
* **Premium Indicators**: Upgraded `AUTO-FIT` and `BADGES` toggles into high-tech HUD buttons (`.hud-toggle-btn`) with neon left-edge status strips (orange for AUTO-FIT, green for BADGES).
* **Unified Stats Grid**: Refined the stats row (`Interval`, `Candles`, `Tot`) using high-contrast monospace text (`Inter` tabular-nums).

### Frontend — Delta Pane & Telemetry Loader
* **Dynamic Neon Delta Bars**: Corrected the horizontal-width growth layout bug in `DeltaPane.jsx`. Delta bars now grow vertically (`height: ${deltaPct}%`, `width: '80%'`), filled with glowing neon gradients (`#00e676` for buy, `#ff1744` for sell), and styled with responsive height transition animations.
* **Institutional Terminal Telemetry Loader**: Replaced the basic "Waiting for Market Data" splash in `App.jsx` with an institutional terminal overlay displaying real-time telemetry: active Symbol, websocket connection health, exchange feeds count, and standby task state. Powered by linear scan lines and glowing pulsing scanner keyframes.

### Frontend — Chart & POC Highlight Integration
* **Precision POC Highlight Integration**: Refactored the Point of Control (POC) rendering in `FootprintLwcChart.jsx`. Swapped the outdated, solid yellow-gold box with a sleek cyber-cyan (`#00e5ff`) layout. The POC box matches the exact width of the hollow candle body (`bodyWidth`) and the exact height of the inner volume bars (`barHeight`), floating seamlessly as a precise neon cradle.
* **LWC Transparent Backplate**: Set LWC chart canvas background to `'transparent'`, allowing the main container's deep space radial gradients to shine through.

---

✅ Phase 4 Complete - Footprint Canvas Rendering

What We Implemented:
✅ FootprintCanvas Component (Guide Section 6)
Raw HTML Canvas rendering
HiDPI/Retina scaling via setupHiDPICanvas()
Proper color scheme from Guide Section 10
Volume opacity based on relative size
Imbalance highlighting
Detection flag badges (ABS, EXH)
Current price row highlighting

✅ Render Mode Toggle
Press 'R' key to switch between DOM and Canvas
Starts in 'dom' mode (existing FootprintTable)
Console logs when switching
Allows A/B testing and gradual migration

✅ Canvas Drawing Features:
Price labels (right-aligned, bold for current price)
Buy/Sell volume split rendering
Delta-based background coloring
POC (Point of Control) identification ready
OHLC wick/body indicators for empty cells
Imbalance detection highlighting
Detection flag badges (gold color)

✅ Phase 5 Complete - UI Stability & Multi-Exchange Connectivity

What We Implemented:
✅ **Detection Badge Toggle System**
- Implemented state management for `showBadges` (ABS/EXH visibility).
- Added 'B' key keyboard shortcut to toggle badges instantly.
- Added a dedicated "BADGES" button in the Header UI.
- Integrated visibility logic into both `FootprintTable` and `FootprintCanvas`.

✅ **Viewport & Scroll Performance**
- Implemented **Infinite Price Ladder** with 200-bin padding (scrolling into empty space).
- Synchronized Canvas overlay with DOM Table using consistent `CELL_HEIGHT` and `HEADER_HEIGHT`.
- Fixed sub-pixel jitter in Canvas rendering.
- Added "Smart Re-centering" logic to stay aligned with current market price.

✅ **Robust Backend Integration (OKX Focus)**
- Enabled **OKX** as the default primary exchange to bypass Binance IP restrictions (HTTP 403).
- Patched `ingestion/base.py` with SSL bypass to handle strict handshake policies (useful for Bybit fallback).
- Implemented "Defensive Aggregation" to prevent frontend crashes when switching timeframes.
- Added a "Waiting for Market Data" splash screen during initial WebSocket handshake.

✅ **Performance & Bug Fixes**
- Fixed major `ReferenceError` regarding price ladder scope.
- Fixed duplicate variable declarations in `App.jsx`.
- Hardened `FootprintTable` against `undefined` bucket lookups.
- Optimized `useFootprint` loop to handle high-frequency OKX tape data without UI lag.

✅ Phase 6 Complete - Footprint LWC Renderer Polish & Smart Detection

What We Implemented:
✅ **Pixel-Perfect LWC Footprint Rendering**
- Switched typography to `Inter` (tabular-nums) with reduced stroke weight for pristine readability.
- Replaced rigid grid-based layout with a precise mapping strategy that accurately draws footprints bound to vertical price-scale coordinates, ensuring perfect alignment when zooming/panning.
- Removed aggressive DOM clipping bounds that were truncating volume numbers, keeping annotations visible exactly inside boundaries without bleeding.

✅ **Smart Badge Engine (Detection Engine)**
- Eliminated "noisy" false-positive badges by transitioning from absolute threshold logic to **Relative Volume Thresholds**.
- Added minimum trade-counts and a strict bucket weight threshold (>=10% of candle volume) so small noise orders don't clutter the screen.
- Implemented a "confidence-based" severity system. Only high-confidence patterns (severity >= 4.0) are sent to the frontend.
- Badges now visualize confidence natively via dynamically calculated opacity levels.
- Fixed a Zustand state mutation bug where the "BADGES" toggle stored a function instead of a boolean value, ensuring instant 0-latency UI toggles without waiting for the next data tick.

✅ **Auto-Fit & Tick-Size Synchronization**
- Bound Tick Size and Auto-Fit directly to `maxVolumeGlobal` data refetches.
- Changes to Tick Size now instantly trigger a complete `setData()` historical repaint of all footprints rather than just replacing live candles.

✅ **Final Visual & Data Polish**
- **Date/Time Fix**: Corrected the Unix timestamp conversion logic in the frontend to handle millisecond precision, ensuring the chart displays the correct current date (May 2026) instead of September 2024.
- **Anti-Overlap Logic**: Implemented adaptive font scaling and per-lane clipping regions. Text now hides gracefully when zooming out and is strictly confined to its candle boundary, preventing visual "bleeding" between adjacent footprints.
- **Default State**: Set `showBadges` to `false` by default for a cleaner initial dashboard experience.


✅ Phase 7 Complete - Architecture Cleanup, Detection Overhaul & UI Polish

---

## Backend — Aggregation & Detection

✅ **Cross-exchange OKX-anchored bucketing (Bug 1 — root cause fix)**
- Non-OKX trade prices are now snapped to the nearest OKX bucket boundary before `math.floor` binning.
- Formula: `price = round(price / bucket_size) * bucket_size` for non-primary exchanges.
- Eliminates phantom price rows caused by Binance/Bybit price divergence from OKX.
- Location: `engine.py`, `FootprintCandle.add_trade`.

✅ **Candle open price anchored to OKX only (Bug 4 — candle gap fix)**
- Removed the `or self.open is None` fallback that allowed any exchange to set candle open.
- `open` is now strictly set only from the first `is_primary=True` (OKX) trade per candle.
- Eliminates visible gaps between consecutive candles caused by Binance trades arriving before OKX.
- Location: `engine.py`, `FootprintCandle.add_trade`.

✅ **Exhaustion detection rebuilt from scratch (Option C — midpoint snapshot)**
- Old implementation was detecting "contested levels" (single-snapshot buy/sell split), not true exhaustion.
- New implementation: `CandleSnapshot` dataclass captures cumulative bucket volumes at candle midpoint.
- Snapshot is taken lazily on the first trade at or after `start_time_ms + interval_ms / 2`.
- Detection compares early-window delta vs late-window delta per bucket — fires only when direction flips with ≥40% counter-ratio.
- `midpoint_snapshot is None` handled gracefully — no crash, no false positives.
- Location: `engine.py` (CandleSnapshot, FootprintCandle), `detection/engine.py` (_detect_exhaustion).

✅ **Detection engine filters fixed**
- `min_trades_per_bucket` lowered from 3 → 1. Single large trades are not noise; the volume floor handles that.
- `severity < 4.0` cutoff lowered to `2.0` for imbalance and absorption. The old cutoff was silently dropping legitimate signals near the threshold.
- `candle.buy_vol`/`sell_vol` not being set in test helpers caused `detect()` to short-circuit on `total_vol == 0` — all test helpers fixed.
- Location: `detection/engine.py`, `tests/test_detection.py`.

✅ **Absorption range check fixed**
- The `bucket_price_range = (candle.high - candle.low) / price` check was a near-no-op (ratio always ~0.00001 for BTC, never exceeded threshold).
- Severity cutoff lowered so valid absorption signals are no longer silently dropped.

---

## Frontend — Rendering & UI

✅ **Dead code removed**
- `FootprintCanvas.jsx` deleted — was not rendered anywhere, was a duplicate rendering path.
- `InteractiveViewport.jsx` deleted — competing zoom system, never wired up in App.jsx.

✅ **Rendering performance — binary search bucket culling**
- `aggBuckets` pre-sorted descending by price once in `aggregateCandles.js` at aggregation time.
- LWC custom series renderer uses `findVisibleBucketRange` (binary search) to skip buckets outside the viewport's visible price range on every draw call.
- Viewport bounds derived from `priceToCoordinate` on all visible bar high/low values — not per-candle OHLC — so long wicks and cross-exchange buckets outside OHLC are handled correctly.
- Removes 3 repeated O(n log n) sorts per candle per frame.
- Measured: ~24x fewer iterations per frame at 50 candles with dense footprint.
- Location: `FootprintLwcChart.jsx`, `aggregateCandles.js`.

✅ **Price ladder padding fixed (Bug 2)**
- `paddingBins = 200` hardcoded replaced with proportional formula: `Math.min(30, Math.ceil(dataRangeBins * 0.15))`.
- Eliminates dead vertical space above and below the visible price range.
- Location: `useFootprintViewModel.js`.

✅ **Crosshair magnet removed**
- LWC default `CrosshairMode.Magnet` replaced with `CrosshairMode.Normal` (mode: 0).
- Crosshair now follows mouse freely across the full price range instead of snapping to close price.
- Location: `FootprintLwcChart.jsx`.

✅ **OHLC + delta tooltip on hover**
- `subscribeCrosshairMove` wired up inside chart init.
- Tooltip shows: date/time, O/H/L/C, Δ (sum of all bucket deltas for the hovered candle).
- Delta colored buy/sell. Tooltip auto-flips horizontally near right edge, clamps vertically.
- Minimal dark glass styling matching terminal aesthetic.
- Location: `FootprintLwcChart.jsx`, `index.css`.

✅ **Delta pane zoom-out degradation fixed**
- Removed `transform: 'rotate(-90deg)'` — text never rotates.
- Three degradation tiers based on cell width:
  - `>= 60px`: bar + value + timestamp (full)
  - `30–59px`: value only, smaller font (compact)
  - `< 30px`: value only, smallest font, clipped with ellipsis (minimal)
- Location: `DeltaPane.jsx`.

---

## Tests

✅ **19/19 detection tests passing** (was 6/18 failing before this phase)
✅ **88/88 total tests passing**
✅ New exhaustion tests use real trade ingestion through `FootprintChart` so `midpoint_snapshot` is populated correctly
✅ `test_no_midpoint_snapshot_no_crash_no_false_positive` added — covers candle with no trades after midpoint
✅ Stale config test assertions updated to match actual config values

✅ Phase 8 Complete - Dynamic Tick Scaling & Chart Continuity

---

## Frontend — Auto-Fit & Dynamic Tick Scaling

✅ **Dynamic `tickSize` scaling linked to Visible Price Range**
- Replaced static viewport assumptions with a dynamic system. `tickSize` now actively scales based on the exact Y-axis visible price range (`coordinateToPrice`).
- Added a `ResizeObserver` to `App.jsx` to pass the true DOM `viewportSize` into the ViewModel, breaking the hardcoded 800px viewport trap.
- Fixed footprint bucket height stretching in `AUTO-FIT` mode by switching `snapTick` to `'nearest'` instead of `'fit'`.
- Location: `useFootprintViewModel.js`, `App.jsx`, `tickSteps.js`.

✅ **Kinetic Scroll & Panning Volatility Tracking**
- Integrated LWC's `subscribeVisibleTimeRangeChange` to continuously track kinetic scrolling and panning events.
✅ Phase 4 Complete - Footprint Canvas Rendering

What We Implemented:
✅ FootprintCanvas Component (Guide Section 6)
Raw HTML Canvas rendering
HiDPI/Retina scaling via setupHiDPICanvas()
Proper color scheme from Guide Section 10
Volume opacity based on relative size
Imbalance highlighting
Detection flag badges (ABS, EXH)
Current price row highlighting

✅ Render Mode Toggle
Press 'R' key to switch between DOM and Canvas
Starts in 'dom' mode (existing FootprintTable)
Console logs when switching
Allows A/B testing and gradual migration

✅ Canvas Drawing Features:
Price labels (right-aligned, bold for current price)
Buy/Sell volume split rendering
Delta-based background coloring
POC (Point of Control) identification ready
OHLC wick/body indicators for empty cells
Imbalance detection highlighting
Detection flag badges (gold color)

✅ Phase 5 Complete - UI Stability & Multi-Exchange Connectivity

What We Implemented:
✅ **Detection Badge Toggle System**
- Implemented state management for `showBadges` (ABS/EXH visibility).
- Added 'B' key keyboard shortcut to toggle badges instantly.
- Added a dedicated "BADGES" button in the Header UI.
- Integrated visibility logic into both `FootprintTable` and `FootprintCanvas`.

✅ **Viewport & Scroll Performance**
- Implemented **Infinite Price Ladder** with 200-bin padding (scrolling into empty space).
- Synchronized Canvas overlay with DOM Table using consistent `CELL_HEIGHT` and `HEADER_HEIGHT`.
- Fixed sub-pixel jitter in Canvas rendering.
- Added "Smart Re-centering" logic to stay aligned with current market price.

✅ **Robust Backend Integration (OKX Focus)**
- Enabled **OKX** as the default primary exchange to bypass Binance IP restrictions (HTTP 403).
- Patched `ingestion/base.py` with SSL bypass to handle strict handshake policies (useful for Bybit fallback).
- Implemented "Defensive Aggregation" to prevent frontend crashes when switching timeframes.
- Added a "Waiting for Market Data" splash screen during initial WebSocket handshake.

✅ **Performance & Bug Fixes**
- Fixed major `ReferenceError` regarding price ladder scope.
- Fixed duplicate variable declarations in `App.jsx`.
- Hardened `FootprintTable` against `undefined` bucket lookups.
- Optimized `useFootprint` loop to handle high-frequency OKX tape data without UI lag.

✅ Phase 6 Complete - Footprint LWC Renderer Polish & Smart Detection

What We Implemented:
✅ **Pixel-Perfect LWC Footprint Rendering**
- Switched typography to `Inter` (tabular-nums) with reduced stroke weight for pristine readability.
- Replaced rigid grid-based layout with a precise mapping strategy that accurately draws footprints bound to vertical price-scale coordinates, ensuring perfect alignment when zooming/panning.
- Removed aggressive DOM clipping bounds that were truncating volume numbers, keeping annotations visible exactly inside boundaries without bleeding.

✅ **Smart Badge Engine (Detection Engine)**
- Eliminated "noisy" false-positive badges by transitioning from absolute threshold logic to **Relative Volume Thresholds**.
- Added minimum trade-counts and a strict bucket weight threshold (>=10% of candle volume) so small noise orders don't clutter the screen.
- Implemented a "confidence-based" severity system. Only high-confidence patterns (severity >= 4.0) are sent to the frontend.
- Badges now visualize confidence natively via dynamically calculated opacity levels.
- Fixed a Zustand state mutation bug where the "BADGES" toggle stored a function instead of a boolean value, ensuring instant 0-latency UI toggles without waiting for the next data tick.

✅ **Auto-Fit & Tick-Size Synchronization**
- Bound Tick Size and Auto-Fit directly to `maxVolumeGlobal` data refetches.
- Changes to Tick Size now instantly trigger a complete `setData()` historical repaint of all footprints rather than just replacing live candles.

✅ **Final Visual & Data Polish**
- **Date/Time Fix**: Corrected the Unix timestamp conversion logic in the frontend to handle millisecond precision, ensuring the chart displays the correct current date (May 2026) instead of September 2024.
- **Anti-Overlap Logic**: Implemented adaptive font scaling and per-lane clipping regions. Text now hides gracefully when zooming out and is strictly confined to its candle boundary, preventing visual "bleeding" between adjacent footprints.
- **Default State**: Set `showBadges` to `false` by default for a cleaner initial dashboard experience.


✅ Phase 7 Complete - Architecture Cleanup, Detection Overhaul & UI Polish

---

## Backend — Aggregation & Detection

✅ **Cross-exchange OKX-anchored bucketing (Bug 1 — root cause fix)**
- Non-OKX trade prices are now snapped to the nearest OKX bucket boundary before `math.floor` binning.
- Formula: `price = round(price / bucket_size) * bucket_size` for non-primary exchanges.
- Eliminates phantom price rows caused by Binance/Bybit price divergence from OKX.
- Location: `engine.py`, `FootprintCandle.add_trade`.

✅ **Candle open price anchored to OKX only (Bug 4 — candle gap fix)**
- Removed the `or self.open is None` fallback that allowed any exchange to set candle open.
- `open` is now strictly set only from the first `is_primary=True` (OKX) trade per candle.
- Eliminates visible gaps between consecutive candles caused by Binance trades arriving before OKX.
- Location: `engine.py`, `FootprintCandle.add_trade`.

✅ **Exhaustion detection rebuilt from scratch (Option C — midpoint snapshot)**
- Old implementation was detecting "contested levels" (single-snapshot buy/sell split), not true exhaustion.
- New implementation: `CandleSnapshot` dataclass captures cumulative bucket volumes at candle midpoint.
- Snapshot is taken lazily on the first trade at or after `start_time_ms + interval_ms / 2`.
- Detection compares early-window delta vs late-window delta per bucket — fires only when direction flips with ≥40% counter-ratio.
- `midpoint_snapshot is None` handled gracefully — no crash, no false positives.
- Location: `engine.py` (CandleSnapshot, FootprintCandle), `detection/engine.py` (_detect_exhaustion).

✅ **Detection engine filters fixed**
- `min_trades_per_bucket` lowered from 3 → 1. Single large trades are not noise; the volume floor handles that.
- `severity < 4.0` cutoff lowered to `2.0` for imbalance and absorption. The old cutoff was silently dropping legitimate signals near the threshold.
- `candle.buy_vol`/`sell_vol` not being set in test helpers caused `detect()` to short-circuit on `total_vol == 0` — all test helpers fixed.
- Location: `detection/engine.py`, `tests/test_detection.py`.

✅ **Absorption range check fixed**
- The `bucket_price_range = (candle.high - candle.low) / price` check was a near-no-op (ratio always ~0.00001 for BTC, never exceeded threshold).
- Severity cutoff lowered so valid absorption signals are no longer silently dropped.

---

## Frontend — Rendering & UI

✅ **Dead code removed**
- `FootprintCanvas.jsx` deleted — was not rendered anywhere, was a duplicate rendering path.
- `InteractiveViewport.jsx` deleted — competing zoom system, never wired up in App.jsx.

✅ **Rendering performance — binary search bucket culling**
- `aggBuckets` pre-sorted descending by price once in `aggregateCandles.js` at aggregation time.
- LWC custom series renderer uses `findVisibleBucketRange` (binary search) to skip buckets outside the viewport's visible price range on every draw call.
- Viewport bounds derived from `priceToCoordinate` on all visible bar high/low values — not per-candle OHLC — so long wicks and cross-exchange buckets outside OHLC are handled correctly.
- Removes 3 repeated O(n log n) sorts per candle per frame.
- Measured: ~24x fewer iterations per frame at 50 candles with dense footprint.
- Location: `FootprintLwcChart.jsx`, `aggregateCandles.js`.

✅ **Price ladder padding fixed (Bug 2)**
- `paddingBins = 200` hardcoded replaced with proportional formula: `Math.min(30, Math.ceil(dataRangeBins * 0.15))`.
- Eliminates dead vertical space above and below the visible price range.
- Location: `useFootprintViewModel.js`.

✅ **Crosshair magnet removed**
- LWC default `CrosshairMode.Magnet` replaced with `CrosshairMode.Normal` (mode: 0).
- Crosshair now follows mouse freely across the full price range instead of snapping to close price.
- Location: `FootprintLwcChart.jsx`.

✅ **OHLC + delta tooltip on hover**
- `subscribeCrosshairMove` wired up inside chart init.
- Tooltip shows: date/time, O/H/L/C, Δ (sum of all bucket deltas for the hovered candle).
- Delta colored buy/sell. Tooltip auto-flips horizontally near right edge, clamps vertically.
- Minimal dark glass styling matching terminal aesthetic.
- Location: `FootprintLwcChart.jsx`, `index.css`.

✅ **Delta pane zoom-out degradation fixed**
- Removed `transform: 'rotate(-90deg)'` — text never rotates.
- Three degradation tiers based on cell width:
  - `>= 60px`: bar + value + timestamp (full)
  - `30–59px`: value only, smaller font (compact)
  - `< 30px`: value only, smallest font, clipped with ellipsis (minimal)
- Location: `DeltaPane.jsx`.

---

## Tests

✅ **19/19 detection tests passing** (was 6/18 failing before this phase)
✅ **88/88 total tests passing**
✅ New exhaustion tests use real trade ingestion through `FootprintChart` so `midpoint_snapshot` is populated correctly
✅ `test_no_midpoint_snapshot_no_crash_no_false_positive` added — covers candle with no trades after midpoint
✅ Stale config test assertions updated to match actual config values

✅ Phase 8 Complete - Dynamic Tick Scaling & Chart Continuity

---

## Frontend — Auto-Fit & Dynamic Tick Scaling

✅ **Dynamic `tickSize` scaling linked to Visible Price Range**
- Replaced static viewport assumptions with a dynamic system. `tickSize` now actively scales based on the exact Y-axis visible price range (`coordinateToPrice`).
- Added a `ResizeObserver` to `App.jsx` to pass the true DOM `viewportSize` into the ViewModel, breaking the hardcoded 800px viewport trap.
- Fixed footprint bucket height stretching in `AUTO-FIT` mode by switching `snapTick` to `'nearest'` instead of `'fit'`.
- Location: `useFootprintViewModel.js`, `App.jsx`, `tickSteps.js`.

✅ **Kinetic Scroll & Panning Volatility Tracking**
- Integrated LWC's `subscribeVisibleTimeRangeChange` to continuously track kinetic scrolling and panning events.
- `tickSize` now smoothly drops or increases dynamically as the chart slides into low or high volatility regions without waiting for the kinetic scroll animation to finish.
- Fixed LWC v4 API error by replacing the removed `getVisiblePriceRange()` method with `coordinateToPrice(0)` and `coordinateToPrice(containerHeight)` to extract the top and bottom screen bounds accurately.
- Location: `FootprintLwcChart.jsx`.

## Backend — Data Integrity & Chart Continuity

✅ **Candle Gap Bridging (Standard Chart Aesthetics)**
- Enforced `Open = Previous Close` in the backend footprint engine when sealing discrete candles.
- This bridges visual gaps between consecutive candles caused by continuous market price drift between OKX trades.
- Aligns our custom footprint aggregation strictly with standard exchange charting logic (like OKX and TradingView UIs), while strictly preserving pure volume profile footprints (no phantom volume rows).
- Location: `engine.py` (`add_trade`).

---

## Altcoin Support & Precision Scaling (Phase 8b)

✅ **High-Precision Altcoin Aggregation**
- Swapped ETH and SOL for HYPE and BEAT to test varying volatility and decimal constraints.
- Expanded the frontend `TICK_STEPS` array to support micro-tick steps (`0.0001` through `0.005`). This prevents low-priced tokens (like BEAT at ~$1.24) from having their footprint buckets collapsed into massive 0.01 intervals.
- Location: `tickSteps.js`, `symbols.py`, `config.toml`.

✅ **Dynamic Chart Decimal Formatting**
- Removed hardcoded 2-decimal and `toFixed(1)` assumptions from the rendering pipeline.
- The chart's Y-axis `priceFormat` and crosshair tooltip now dynamically calculate their decimal precision based directly on the active `tickSize` (e.g., `tickSize = 0.0001` natively formats as 4 decimals).
- `tickSize` added to the LWC React hook dependency array so the chart instantly hot-swaps precision live when the auto-scaler shifts intervals.
- Location: `FootprintLwcChart.jsx`.

---

## ✅ Phase 8c Complete - Test Suite Alignment & Detection Refinement

### Backend — Detection Refinement
* **Absorption price-range check fixed**: Simplified the redundant, mathematically flawed range limit check inside `_detect_absorption` in `app/detection/engine.py`. It now directly filters candles whose total price range exceeds `absorption_price_pct`, ensuring valid absorption zones are captured accurately under high volatility conditions.

### Tests — 100% Passing Test Suite
* **Config test suite aligned with symbols schema**: Refactored `app/tests/test_config.py` to assert correct symbol-level properties (e.g. `config.symbols["BTC-USDT"].bucket_size` and `config.symbols["BTC-USDT"].min_volume`) in accordance with the multi-symbol schema introduced in Phase 8b.
* **New absorption test case**: Added `test_absorption_large_range_not_flagged` to `app/tests/test_detection.py` to guarantee proper range filtration under extreme market movements.
* **Result**: **89/89 unit tests passing successfully** (100% green).
