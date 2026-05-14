# Flowtrades — Architectural Decisions Log

This document records every significant architectural decision made for Flowtrades.
Each entry includes what was decided, what was explicitly rejected, and why.

If you are an AI agent and you are about to suggest something listed under "rejected", stop.
That option was considered and ruled out. Do not re-litigate it.
 
---

## Decision 1 — Footprint visual style: Option A

**Decision:** Footprint rows are embedded inside the candle body area.
Left side = bid volume. Right side = ask volume.
The candle and footprint read as one unified visual unit.

**Rejected:** Option B — side-anchored microgrid panel per candle.
A separate footprint panel attached to the right of each candle.

**Why rejected:**
Option B starts to feel like a spreadsheet docked next to a chart.
It is harder to collapse gracefully at low zoom.
It is visually heavier.
Option A preserves the "naked and beautiful" chart feel that is the product goal.

---

## Decision 2 — Rendering system: LWC custom series plugin

**Decision:** Use Lightweight Charts as the primary chart substrate.
Render the footprint inside LWC using the Custom Series Plugin API (ICustomSeriesPaneRenderer).
One rendering system. One canvas. One zoom and pan model.

**Rejected:** Split rendering — LWC for candles, separate canvas or DOM overlay for footprint.

**Why rejected:**
Split rendering requires manual sync for crosshair, zoom, pan, price axis, and visible range.
Every sync point is a maintenance liability and a source of drift bugs.
The current codebase already has this problem (InteractiveViewport vs LWC zoom).
It feels wrong exactly when the chart is under load.

**Rejected:** Full DOM-based rendering.

**Why rejected:**
DOM reflow on every tick update across hundreds of elements produces jank.
The product goal is smooth real-time rendering.
DOM cannot deliver that at order flow update frequency.

**Rejected:** Pure canvas from scratch without LWC.

**Why rejected:**
Pan, zoom, price axis, crosshair, and time axis would all need to be built manually.
Estimated 3–4 weeks of work just to reach feature parity with what LWC provides out of the box.

---

## Decision 3 — Price reference: OKX only

**Decision:** OKX is the sole price reference for OHLC candle construction.
Binance and Bybit contribute volume to footprint aggregation only.
Non-OKX trade prices are snapped to the nearest OKX bucket boundary before binning.

**Rejected:** Independent bucketing per exchange, merged at display time.

**Why rejected:**
More accurate in theory but significantly more complex to render.
The OKX-anchored approach is the natural extension of the existing `is_primary` flag in engine.py.
Volume from all exchanges should read as "what happened at OKX price levels" — that is the product intent.

---

## Decision 4 — Zoom behavior: two separate axes

**Decision:**
Horizontal zoom controls candle count and footprint width.
Vertical scale (price axis drag) controls how much price space fits in the viewport.
These are two independent controls with no cross-coupling.

**Rejected:** Price axis drag controlling both vertical scale and tick size simultaneously.

**Why rejected:**
Coupling two controls into one gesture produces a slippery, unpredictable feel.
The user loses independent control over each dimension.
TradingView keeps these separate — that is the interaction reference for this product.

---

## Decision 5 — Tick size: auto by default, relative not absolute

**Decision:**
Tick size (footprint bucket grouping) is auto-managed based on viewport density by default.
Manual override is available when the user explicitly adjusts the price scale.
Tick size must be derived relative to instrument price, not hardcoded as an absolute USDT value.

**Rejected:** Hardcoded absolute tick size (e.g. 10 USDT per row always).

**Why rejected:**
A fixed USDT value works for BTC but breaks immediately for SOL, ETH, or low-cap alts.
The architecture must support non-BTC pairs without requiring reconfiguration.
Approximately 0.02–0.05% of current price, rounded to a clean decimal, is the target formula.

---

## Decision 6 — Low zoom footprint behavior: clean disappearance

**Decision:**
When zoomed out past the minimum footprint threshold, the footprint disappears completely.
No faint hint, no ghost bars, no transparency fade that preserves partial detail.

**Rejected:** Keeping a subtle footprint hint at low zoom.

**Why rejected:**
In practice, any preserved detail at low zoom reads as visual noise.
The chart looks dirtier, not more informative.
Clean disappearance is more elegant and easier to read.

---

## Decision 7 — State management: Zustand

**Decision:** Use Zustand for global state.
Three stores: useFootprintStore, useUiStore, useDetectionStore.

**Rejected:** Redux, Context API as primary state layer.

**Why rejected:**
Redux is over-engineered for this scope.
Context API re-renders too broadly for high-frequency trading data updates.
Zustand is lightweight, has no boilerplate, and keeps components dumb and fast.

---

## Decision 8 — FootprintCanvas: to be removed

**Decision:** FootprintCanvas.jsx is likely dead code and should be removed.
The LWC custom series is the one and only footprint renderer.

**Rejected:** Keeping FootprintCanvas as a fallback or debug renderer.

**Why rejected:**
Having two rendering paths is the source of the current maintenance confusion.
A fallback path creates pressure to keep both working, which doubles the maintenance surface.
If debugging is needed, use the LWC renderer with a debug flag.

---

## Decision 9 — Layout complexity: deferred

**Decision:** Complex layout features are explicitly deferred until core chart rendering is stable.

**Deferred items:**
- Resizable panels
- Sidebar
- Watchlist / multi-symbol view
- Settings panel
- Mobile layout

**Why deferred:**
Building layout shell before chart stability means the shell is built around a broken chart.
The chart is the product. Everything else is furniture.

---

## Decision 10 — Visual style: minimal first

**Decision:** Start clean and minimal. Introduce visual density only when zoom level and viewport space justify it.

**Rejected:** Starting with a dense, data-rich default style.

**Why rejected:**
Dense defaults are harder to read, harder to undo, and create visual fatigue.
A minimal style reads faster, feels more premium, and is easier to extend.
You can always add density. Subtracting from a dense interface is much harder.