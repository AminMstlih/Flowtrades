# Flowtrades UI Architecture Spec

Date: 2026-05-03

This document is the working UI contract for Flowtrades. It describes the intended frontend architecture, interaction rules, rendering model, and responsive behavior for the charting surface.

It is written to support implementation, iteration, and design consistency.

## 1. UI Goal

The UI should present BTC trade flow as a clean, readable, real-time charting experience:

- naked candles as the primary visual anchor
- footprint data attached to each candle
- smooth zoom and pan behavior
- TradingView-like feel for interaction and scaling
- graceful reduction in detail as the user zooms out

The footprint must feel like part of the candle system, not like a separate table pasted beside the chart.

## 2. Core Design Choice

### Selected direction: Option A

Option A is the preferred architecture.

Definition:

- footprint rows are visually embedded in the candle structure
- left/right trade flow is rendered directly inside the candle footprint area
- the candle and footprint read as one unit
- the chart remains visually tight, clean, and immediate

Why Option A wins:

- it is cleaner at a glance
- it feels more modern and compact
- it scales better visually for a charting product
- it preserves the “naked and beautiful” look
- it is easier to make the UI feel smooth rather than bulky

Option B, with side-anchored panels per candle, is explicitly not the default direction.

## 3. Rendering Strategy

### 3.1 Primary rendering stack

Use `Lightweight Charts` as the chart substrate for:

- candle geometry
- time scale behavior
- zoom and pan feel
- price axis behavior
- crosshair and chart motion

Use a custom footprint overlay for:

- left/right trade flow inside each candle
- imbalance highlighting
- absorption or exhaustion annotations
- dense order-flow visuals that cannot be represented as plain OHLC candles

### 3.2 One chart, one visual system

The UI should not feel like:

- a table that happens to sit next to a chart
- a canvas prototype
- a separate indicator pane

It should feel like one continuous charting experience.

## 4. Footprint Geometry

### 4.1 Placement rule

Footprint rendering must be anchored in both directions:

- horizontally to candle position
- vertically to price levels

That is the base rule.

### 4.2 Candle as the container

Each candle is the structural container for its footprint data.

The footprint should visually sit inside the candle’s space rather than floating independently.

### 4.3 Price-level alignment

Each footprint row corresponds to a price bucket.

That price bucket must remain visually consistent with the chart’s vertical geometry.

This is important because the product is about executed trade flow, not just candle shapes.

## 5. Zoom and Detail Rules

### 5.1 Horizontal zoom

Horizontal zoom controls:

- candle spacing
- candle width
- footprint width available inside each candle
- rendering detail level

As the user zooms in:

- candles get wider
- footprint area becomes richer
- numbers and bars become easier to read

As the user zooms out:

- candles get narrower
- footprint density decreases
- footprint detail is progressively removed
- eventually only candles remain

### 5.2 Low-zoom behavior

Selected behavior:

- when zoomed out enough, the footprint disappears completely
- no faint footprint hint is preserved at low zoom

Reason:

- preserving a hint at low zoom tends to create visual noise
- clean disappearance is more elegant and easier to read

### 5.3 Footprint degradation ladder

The footprint should degrade in stages:

1. full footprint with left/right values and highlighting
2. compact bars without full numeric density
3. candle-only mode

This gives the UI a graceful visual collapse instead of a hard cutoff.

## 6. Vertical Scale Rules

### 6.1 Price-axis drag

Dragging the price column should behave like TradingView-style vertical rescaling.

This means:

- the visible price range changes
- candles stretch or compress vertically
- more or fewer price levels fit in the viewport

### 6.2 What drag should not do

Price-axis drag should not directly control:

- time range
- candle count
- footprint bucket grouping

### 6.3 Separation of concepts

The following must remain separate:

- **vertical scale**: how much price space fits on screen
- **footprint tick size**: how trade buckets are grouped in the footprint

These can feel related in practice, but they are not the same control.

### 6.4 Selected implementation rule

Price-axis drag changes vertical scale only.

It does not directly mutate footprint tick size.

This keeps the interaction intuitive and avoids a slippery, unpredictable feel.

## 7. Tick Size Rules

### 7.1 Default mode

Tick size should be auto-managed by default.

Why:

- users should not have to understand footprint bucket tuning immediately
- first-load behavior should feel correct without manual setup
- the chart should choose a readable density automatically

### 7.2 Manual override

If the user explicitly drags or adjusts the price scale controls, that should count as an override gesture.

Manual control is available, but not required.

### 7.3 Auto-fit behavior

On double click:

- fit the chart to visible content
- choose an appropriate vertical scale
- choose an appropriate tick size for the current viewport density
- keep the visible candles and footprint balanced within the available space

This is the “make it feel right instantly” behavior.

## 8. Data Density Rules

The system should choose how much footprint detail to show based on visible density.

### 8.1 Few candles visible

Example: 7 visible candles

Behavior:

- use finer vertical density
- preserve more footprint detail
- allow the footprint to occupy available visual space

### 8.2 More candles visible

Example: 15 visible candles

Behavior:

- reduce vertical density
- compress footprint detail
- keep the chart readable without crowding

### 8.3 Many candles visible

Behavior:

- progressively reduce footprint detail
- preserve candle shapes and trend readability
- avoid turning the screen into an unreadable wall of numbers

## 9. Visual Style Rules

### 9.1 Selected style

Start clean and minimal.

This is the default direction.

### 9.2 Why minimal first

Minimal first is preferred because:

- it reads faster
- it feels more premium
- it avoids visual fatigue
- it is easier to extend later than to subtract from a dense interface

### 9.3 Density only when needed

Additional density should be introduced only when zoom level and viewport space justify it.

## 10. Layout Strategy

### 10.1 Desktop

Desktop layout should prioritize:

- main candle chart
- price axis
- footprint overlay
- control header
- delta or supporting pane if needed

### 10.2 Mobile

Mobile layout should preserve:

- chart visibility
- readable scaling
- touch-friendly interaction targets

Mobile should not be treated as a compressed desktop view.

### 10.3 Responsiveness principle

The UI should respond to viewport changes by adjusting density and readability, not merely by shrinking elements.

## 11. Interaction Model

### 11.1 Primary interactions

- pan horizontally through history
- zoom in and out
- drag price column to rescale vertically
- double click to auto-fit
- hover or crosshair inspect levels where supported

### 11.2 Expected feel

Interactions should feel:

- smooth
- stable
- predictable
- close to TradingView behavior

### 11.3 Interaction boundaries

Do not overload one gesture with multiple unrelated effects.

The system must feel consistent.

## 12. Human and Machine Readability

### 12.1 Human readability

The visual target is a chart that reads naturally:

- clean candle shape
- obvious aggression at key levels
- clear footprint hierarchy
- restrained styling

### 12.2 Machine readability

The backend should continue to provide structured footprint data so downstream consumers can read the state without reverse-engineering pixels.

The UI is for perception.
The serialized state is for computation.

## 13. Component Boundary Intent

The frontend should move toward these responsibilities:

- chart substrate and render engine
- viewport and gesture controller
- footprint renderer
- price scale controller
- data hook / websocket contract

Right now, some of these concerns overlap too much inside `App.jsx`.

## 14. Recommended File-Level Direction

### Keep

- `LightweightChart.jsx` as the chart substrate reference
- `FootprintCanvas.jsx` as the most likely final footprint renderer
- `InteractiveViewport.jsx` as the gesture and transform controller
- `PriceScale.jsx` as the vertical-scale control surface

### Rework

- `App.jsx` should become orchestration only
- `FootprintTable.jsx` should be treated as fallback or debug mode, not the long-term primary view
- `DeltaPane.jsx` should remain supporting, not dominant

## 15. Open Questions

These are intentionally not forced by this spec:

1. Should the footprint overlay be physically inside the candle body or tightly adjacent to it within the candle lane?
2. Should the delta pane remain always visible or become optional?
3. Should the chart default to canvas-first rendering or should Lightweight Charts remain the primary chart with the footprint overlay as the main custom layer?

Those are implementation choices to settle during build, not blockers for this spec.

## 16. Implementation Summary

The working UI direction is:

- Option A footprint design
- footprint anchored to candle position and price levels
- candle-only at low zoom
- no low-zoom footprint hint
- auto tick size by default
- manual override only when explicitly invoked
- price-axis drag changes vertical scale only
- start clean and minimal

This is the reference behavior for development going forward.
