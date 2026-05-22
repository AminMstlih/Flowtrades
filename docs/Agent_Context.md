# Flowtrades — Agent Context

**Read this before doing anything. This is the source of truth for all AI agents working on Flowtrades.**
If a suggestion you are about to make conflicts with anything in this document, do not make it.
Check `Decisions.md` for the reasoning behind each choice.

---

## What Flowtrades Is

A real-time BTC order flow visualization tool.
Pulls trade data from Binance, OKX, and Bybit simultaneously.
OKX is the price reference — OHLC is derived from OKX only.
Binance and Bybit contribute volume to the footprint aggregation only.
The primary output is a footprint chart: each candle shows bid/ask volume per price level.

The project is live and has organic GitHub traction.
The frontend is React + Vite. The backend is Python with WebSocket connections to all three exchanges.

---

## Current Stack — Do Not Change Without Explicit Instruction

| Layer | Choice | Notes |
|---|---|---|
| Chart engine | Lightweight Charts (LWC) | Primary substrate |
| Footprint rendering | LWC custom series plugin | Inside LWC, not a separate canvas |
| State management | Zustand | useFootprintStore, useUiStore |
| Frontend framework | React + Vite | |
| Backend | Python, async WebSocket | engine.py, models.py |
| Price reference | OKX only | Binance + Bybit = volume only |

---

## Current File Status

| File | Status | Notes |
|---|---|---|
| FootprintLwcChart.jsx | Active — primary chart | Crosshair normal mode, tooltip, binary search culling |
| FootprintCanvas.jsx | **DELETED** | Was dead code. Removed. Do not recreate. |
| InteractiveViewport.jsx | **DELETED** | Was dead code. Competing zoom system removed. Do not recreate. |
| App.jsx | Active | Orchestration only — do not add rendering logic here |
| engine.py | Active | Bucketing fix + open-price fix + midpoint snapshot applied |
| aggregateCandles.js | Active | Buckets pre-sorted descending by price |
| useFootprintViewModel.js | Active | Padding fix applied |
| DeltaPane.jsx | Active | Zoom-out degradation fixed — no rotation |
| detection/engine.py | Active | Exhaustion rebuilt (Option C), filters fixed |
| priceBinning.js | Active | Tick normalization needed for non-BTC pairs (future scope) |

---

## Resolved Bugs — Do Not Re-Diagnose

### ✅ Bug 1 — Cross-exchange price bucketing (fixed)
Non-OKX trade prices are now snapped to the nearest OKX bucket boundary before `math.floor`.
Location: `engine.py`, `add_trade` method.
Fix: `price = round(price / bucket_size) * bucket_size` for non-primary exchanges before binning.

### ✅ Bug 2 — Hardcoded padding in price ladder (fixed)
`paddingBins` is now proportional to the visible data range, not a hardcoded 200.
Formula: `Math.min(30, Math.ceil(dataRangeBins * 0.15))`.
Location: `useFootprintViewModel.js`.

### ✅ Bug 3 — Footprint column spacing too large (self-corrected)
Was caused by sparse buckets from Bug 1. Resolved when Bug 1 was fixed.

### ✅ Bug 4 — Competing zoom systems (fixed)
`InteractiveViewport.jsx` deleted. LWC is the sole zoom and pan system.
Delta pane sync confirmed intact — it was already driven by LWC's `onViewportChange`, not InteractiveViewport.

### ✅ Bug 5 — Rendering performance (fixed)
`aggBuckets` are now pre-sorted descending by price once in `aggregateCandles.js`.
The LWC custom series renderer uses binary search (`findVisibleBucketRange`) to skip buckets
outside the viewport's visible price range on every draw call.
Viewport bounds are derived from `priceToCoordinate` on all visible bar high/low values —
not from per-candle OHLC — so long wicks and cross-exchange buckets outside OHLC are handled correctly.
Measured improvement: ~24x fewer iterations per frame at 50 candles with dense footprint.
Location: `FootprintLwcChart.jsx`, `aggregateCandles.js`.

### ✅ Bug 6 — Candle gap between consecutive candles (fixed)
`open` was being set from the first trade to arrive regardless of exchange.
Binance trades often arrive before OKX, setting open to a Binance price.
Fix: removed `or self.open is None` fallback — open is now strictly OKX-only.
Location: `engine.py`, `FootprintCandle.add_trade`.

### ✅ Bug 7 — Crosshair magnet too strong (fixed)
LWC default `CrosshairMode.Magnet` replaced with `CrosshairMode.Normal` (mode: 0).
Location: `FootprintLwcChart.jsx`, `createChart` options.

### ✅ Bug 8 — No hover tooltip (fixed)
`subscribeCrosshairMove` added. Tooltip shows timestamp, O/H/L/C, Δ with buy/sell color.
Location: `FootprintLwcChart.jsx`, `index.css`.

### ✅ Bug 9 — Detection engine broken (fixed)
- `min_trades_per_bucket` lowered 3→1. Single large trades are not noise.
- `severity < 4.0` cutoff lowered to `2.0` — was silently dropping legitimate signals.
- Test helpers were not setting `candle.buy_vol`/`sell_vol`, causing `detect()` to short-circuit.
- Exhaustion detector rebuilt from scratch using midpoint snapshot (Option C).
- 19/19 detection tests passing. 88/88 total tests passing.
Location: `detection/engine.py`, `engine.py` (CandleSnapshot), `tests/test_detection.py`.

### ✅ Bug 10 — Delta text rotates on zoom out (fixed)
Removed `transform: rotate(-90deg)`. Three graceful degradation tiers instead.
Location: `DeltaPane.jsx`.

---

## Known Issues — Next Priority

### 1. Tick size normalization for non-BTC pairs
`priceBinning.js` and `tickSteps.js` currently work correctly for BTC.
If the product expands to SOL, ETH, or other pairs, tick size must be derived as a percentage
of current price (~0.02–0.05%), not as an absolute USDT value.
This is future scope — do not tackle until explicitly instructed.

### 2. Absorption range check — partial fix
The `bucket_price_range` calculation in `_detect_absorption` is still technically a near-no-op
for BTC prices (ratio always ~0.00001). The severity cutoff fix means absorption signals now
surface correctly, but the range check logic should be revisited when time allows.
It should compare `price_range_pct` directly against `absorption_price_pct`, not divide by price.

Detection system — FIXED (partially):
- min_trades_per_bucket lowered to 1
- severity cutoff lowered to 2.0  
- test helper bug fixed (candle.buy_vol/sell_vol not being set)
- exhaustion completely rewritten — now uses midpoint_snapshot 
  for time-series awareness, only fires on sealed candles
- 19/19 tests passing

Exhaustion known limitation: only detects at candle-seal time, 
not real-time. This is intentional — see Decisions.md.

---

## Architectural Boundaries — Hard Rules

**Do not split the rendering system.**
The footprint must be rendered inside LWC via the custom series plugin.
Do not introduce a second canvas or DOM overlay that runs parallel to LWC and requires manual sync.

**Do not recreate FootprintCanvas or InteractiveViewport.**
Both were deleted intentionally. They are not the direction.
If a viewport controller is needed in future, build from scratch with the correct architecture.

**Do not add layout complexity before the chart is stable.**
Resizable panels, sidebar, watchlist — valid for later. Not now.

**Do not make tick size a hardcoded absolute value.**
Tick size must be derived relative to instrument price, not hardcoded in USDT.
This is required for the chart to support non-BTC pairs in future.

**Price axis drag = vertical scale only.**
Dragging the price column changes how much price space fits in the viewport.
It does not change candle count, time range, or footprint bucket grouping.
Keep these three controls strictly separate.

---

## Footprint Behavior Rules

Footprint degrades in stages as the user zooms out:
1. Full footprint — left/right values, imbalance highlights, coloring
2. Compact bars — no numeric labels, bars only
3. Candle only — footprint disappears completely

No faint footprint hint at low zoom. Clean disappearance.

Tick size is auto-managed by default.
Manual override is available when the user explicitly adjusts the price scale.
On double click: auto-fit visible content, auto-select tick size and vertical scale.

---

## Multi-Exchange Aggregation Rules

OKX = price reference. OHLC derived from OKX trades only.
Binance and Bybit = volume contributors only.
All non-OKX trade prices are snapped to the nearest OKX bucket boundary before binning.
This ensures all exchanges land in the same footprint rows.

---

## Rendering Pipeline — Current Architecture

```
WebSocket (backend) → Zustand footprintStore → App.jsx → useFootprintViewModel
  → aggregateCandles.js (bins + sorts buckets descending) → FootprintLwcChart.jsx
  → LWC custom series plugin (binary search culling per draw frame) → canvas
```

Key invariants:
- `aggBuckets` on every candle is always sorted descending by price
- Binary search in renderer assumes this sort order — do not change it without updating both
- Viewport culling uses `priceToCoordinate` null-check as the definitive off-screen signal
- `DeltaPane` sync is driven by LWC's `subscribeVisibleTimeRangeChange` → `onViewportChange` prop

---

## Future Scope — Not Current Work

- Support for non-BTC pairs (tick size normalization is the prerequisite)
- Resizable panel layout
- Watchlist / multi-symbol view
- WebWorker for heavy delta/imbalance calculations
- Historical replay mode
- Machine-readable structured footprint export via API

Do not build any of this until the core chart rendering is stable and bug-free.

---

## What a Good Suggestion Looks Like

- Fixes a known issue in the priority order listed above
- Does not introduce a second rendering system
- Does not add layout features before chart stability is achieved
- Keeps tick size relative, not hardcoded
- Keeps zoom, vertical scale, and bucket size as separate independent controls
- Reads this file and `Decisions.md` before proposing anything
