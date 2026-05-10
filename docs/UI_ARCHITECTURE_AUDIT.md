# Flowtrades UI Architecture Audit

Date: 2026-05-03

This document audits the current frontend architecture as it exists in the repository. It focuses on rendering, layout, interaction, responsiveness, performance, and component boundaries.

## 1. UI Architecture Thesis

The frontend is trying to be a real-time market visualization shell for:

- a footprint table
- a price axis
- a live price marker
- a delta pane
- a chart-like interaction layer
- connection and control chrome

That is a valid direction. The problem is not the idea. The problem is that the current implementation mixes several UI paradigms at once.

## 2. Current Frontend Shape

The UI currently consists of:

- a top header with controls and status
- a main viewport wrapper
- a chart area
- a price axis sidebar
- a fixed bottom delta pane
- a switchable footprint renderer:
  - DOM table mode
  - canvas mode
- a gesture-based viewport wrapper
- a websocket hook that feeds live data into the app

The frontend is not a single coherent rendering system yet. It is a hybrid system.

## 3. Rendering Architecture

### 3.1 There are three rendering philosophies in the codebase

1. DOM table rendering
2. raw canvas rendering
3. Lightweight Charts integration

The codebase contains all three, but they are not cleanly separated.

### 3.2 DOM table path

`FootprintTable.jsx` renders a dense candle-by-price grid in a table layout.

This path has strengths:

- easy to inspect
- easy to style
- easy to debug
- straightforward for compact data grids

This path has weaknesses:

- large DOM cost when the grid grows
- hard to scale cleanly for mobile
- difficult to keep perfectly synchronized with the axis and viewport
- less suitable for very dense live updates

### 3.3 Canvas path

`FootprintCanvas.jsx` draws the footprint directly to a canvas.

This is closer to the UI guide’s desired direction.

Strengths:

- better for dense rendering
- lower DOM overhead
- better fit for highly dynamic visual data

Weaknesses:

- the component redraws on React state changes rather than being driven by a more explicit frame/render controller
- it currently coexists with the DOM table path rather than replacing it cleanly
- it translates content rather than fully managing a chart-style coordinate system

### 3.4 Lightweight Charts path

`LightweightChart.jsx` exists and is architecturally aligned with the UI guide.

However, it appears to be a parallel implementation rather than the main active rendering path.

That means the repo currently has:

- an advanced charting intent in the guide
- a canvas footprint component
- a DOM footprint component
- and a Lightweight Charts integration component

This is too many overlapping answers for one UI problem.

## 4. Main UI Cohesion Problem

The biggest frontend architectural issue is not any one component.

It is that the UI has not committed to a single source of truth for:

- the chart substrate
- the viewport transform
- the footprint rendering method
- the coordinate mapping model

Right now:

- the viewport controls a transform
- the footprint table uses that transform
- the canvas component also uses that transform
- the price scale also uses that transform
- Lightweight Charts exists as a separate architectural branch

That creates coordination risk and long-term maintenance overhead.

## 5. State Flow

### 5.1 Websocket hook

`useFootprint.js` uses `useRef` for live data and only uses React state for connection status.

That is the right principle.

### 5.2 App render loop

`App.jsx` uses a requestAnimationFrame loop to consume `latestDataRef` and push the data into React state.

This is a partial fit with the guide, but not a pure fit.

The guide’s ideal model is:

- websocket writes to a ref buffer
- rAF consumes the ref buffer
- canvas or chart series updates directly
- React state remains only for UI controls

The current app still does this:

- websocket writes to a ref
- rAF reads from the ref
- rAF writes into React state again

That reintroduces state churn and makes the live data pipeline less clean than it should be.

### 5.3 UI control state

The app keeps separate React state for:

- tick size
- auto-fit
- render mode
- timeframe window
- badges
- viewport transform
- viewport size
- user pan state

This is acceptable, but it is a lot of coordinated state for a surface that is supposed to feel simple.

The risk is that control logic and data visualization logic become tightly coupled in `App.jsx`.

## 6. Layout Architecture

### 6.1 Layout is flex-based, not the guide’s grid-first system

The UI guide strongly prefers a grid-root layout.

The actual implementation uses:

- flex column shell
- flex main wrapper
- fixed bottom panels
- a fixed-width price sidebar
- media query overrides for mobile/tablet/desktop

This works, but it is not the same as the prescribed architecture.

### 6.2 What the layout does well

- it keeps the core chart area visible
- it preserves a persistent price axis
- it reserves space for a delta panel
- it adapts somewhat to smaller widths

### 6.3 What the layout does poorly

- the bottom panels are fixed in a way that can become awkward on small screens
- the price axis is partially fixed and partially responsive
- the mobile layout relies heavily on overrides rather than a dedicated mobile-first structure
- the layout is more “desktop chart adapted to mobile” than “mobile-first chart architecture”

### 6.4 Viewport management

The app uses `100dvh`, which is good.

However:

- `body` is set to `position: fixed` and `overflow: hidden`
- the layout depends on large custom CSS overrides
- horizontal/vertical coordination is maintained manually

That is fragile, especially on phones and tablets.

## 7. Interaction Architecture

### 7.1 Gesture system

`GestureHandler` is a real interaction layer with:

- touch pan
- pinch zoom
- long press
- double tap
- wheel zoom with modifier keys
- mouse drag panning

This is a strong part of the UI architecture.

### 7.2 What is good

- touch events are explicitly non-passive where needed
- pinch uses midpoint anchoring
- pan and zoom are not left entirely to the browser
- there is an attempt to classify gesture direction
- there is inertia/momentum support in the viewport wrapper

### 7.3 What is risky

- gesture logic, transform logic, and render logic are split across multiple files
- some interaction behaviors are only partially implemented or only logged
- the code has a lot of “future-ready” comments that are not fully matched by active behavior

### 7.4 Interaction coherence problem

The app has:

- a viewport wrapper that handles gestures
- a price scale that also handles dragging and double-click
- a header that also changes chart behavior
- a canvas layer that ignores some transform scaling

This makes interaction behavior harder to reason about as a single system.

## 8. Component-Level Audit

### 8.1 `App.jsx`

The app component is doing too much.

It currently coordinates:

- websocket consumption
- animation-frame batching
- chart data derivation
- tick snapping
- auto-fit logic
- viewport state
- current price line calculation
- render mode toggling
- multiple child component contracts

This is a classic “god component” risk.

Recommended direction:

- keep orchestration here only
- push render math into dedicated hooks or view-model helpers
- reduce the number of responsibilities in the root component

### 8.2 `Header.jsx`

The header mixes:

- branding
- connection state
- tick-size control
- timeframe selection
- badge toggles
- status reporting

It is functional, but it is too dense.

For a trading surface, header controls should be compact, predictable, and extremely stable.

### 8.3 `FootprintTable.jsx`

This component is the clearest part of the current UI.

It presents:

- per-price rows
- per-candle columns
- imbalance highlighting
- detection badges
- current price highlighting

Concern:

- it is visually and computationally expensive as candle count or row count grows
- it depends on computed arrays and nested searches per render

### 8.4 `FootprintCanvas.jsx`

This is the most promising long-term rendering path in the codebase.

But it currently has architectural tension:

- it is a canvas overlay
- it is translated by the parent transform
- it is not yet the only rendering authority
- it still relies on React-driven redraws

That makes it more of a parallel proof-of-concept than the final rendering contract.

### 8.5 `InteractiveViewport.jsx`

This is the strongest interaction abstraction.

It has a proper responsibility:

- own gestures
- own inertia
- own viewport transforms

But it still acts on a shared parent transform, so it should be treated as a controller layer, not a complete solution.

### 8.6 `PriceScale.jsx`

The price scale is functional, but it is also tightly coupled to global layout assumptions.

Concerns:

- it uses its own DOM event handling
- it computes label placement using assumptions about row heights and header heights
- it depends on the same transform state as the main viewport

This is acceptable in a prototype, but it should be formalized if the UI grows.

### 8.7 `DeltaPane.jsx`

The delta pane is coherent but also a separate visualization plane with its own horizontal transform logic.

That is fine for now, but it makes the UI feel like multiple linked widgets rather than one unified charting system.

### 8.8 `LightweightChart.jsx`

This component is architecturally important because it matches the guide most closely.

The fact that it exists but is not clearly the primary rendering path is itself a signal:

- the team knows the intended direction
- the repo has not fully committed to it

That should be resolved explicitly.

## 9. Responsiveness Audit

### 9.1 The code does support breakpoints

The CSS contains responsive rules for:

- mobile
- phablet
- tablet
- desktop
- wide
- 4K

### 9.2 The design is still desktop-led

Even with responsive rules, the layout reads like a desktop chart first.

Mobile is handled mostly by shrinking widths, hiding pieces, and reflowing panels.

That is not the same as designing a genuinely mobile-first trading surface.

### 9.3 Touch target issues

The CSS attempts to set 44x44 minimums on interactive elements.

That is good in principle, but the actual density of controls and badges suggests some areas may still feel cramped on smaller screens.

### 9.4 Mobile realism gap

The guide is very ambitious about mobile behavior.

The current code has partial support, but it is not yet a fully validated mobile trading experience.

## 10. Performance Audit

### 10.1 Good performance ideas are present

- requestAnimationFrame
- useRef for websocket data
- canvas rendering path
- ResizeObserver
- transform-based viewport movement
- HiDPI canvas setup

### 10.2 Performance risks remain

- React state is still used for live data in the main app path
- the table renderer is expensive
- the canvas renderer and DOM renderer coexist
- there are nested computations on render
- several components recalculate derived values each render

### 10.3 Most important performance conclusion

The frontend knows what performance should look like.

It is not yet fully organized to enforce that consistently.

## 11. Frontend Documentation Alignment

The UI guide is more disciplined than the active app.

The current app matches the guide in spirit on:

- color tokens
- HiDPI awareness
- touch-event awareness
- no-SVG intent
- requestAnimationFrame awareness

The current app diverges from the guide in practice on:

- architecture purity
- one-source-of-truth rendering
- fully Canvas-first execution
- clean separation of data flow and view model
- mobile-first layout discipline

## 12. UI Architecture Verdict

The frontend is not broken, but it is not settled.

It is best described as:

- a functional live visualization shell
- with a strong interaction prototype
- built around a mixed rendering architecture
- that has not yet fully chosen its final UI substrate

That is normal for an evolving project, but it should be acknowledged honestly.

## 13. Recommended UI Direction

If the goal is to make the UI architecture stronger, the best next move is:

1. Choose one primary rendering path.
   - either canvas-first footprint rendering
   - or a lightweight charts-centered architecture with a separate overlay

2. Reduce the role of React state in live rendering.
   - use refs and explicit render/update paths
   - keep React for controls and shell state

3. Promote the viewport, price scale, and footprint rendering into a clearer subsystem boundary.
   - controller
   - coordinate mapping
   - renderer

4. Rework the layout into a cleaner mobile-first structure.
   - avoid desktop-first compromises where possible

5. Make the UI guide match the actual code or revise the code to match the guide.

## 14. What to Keep

Keep these traits:

- the dark market-terminal visual language
- the directness of the table-like footprint view
- the gesture system
- the HiDPI support
- the price-scale synchronization idea
- the connection-status awareness

These are good foundations.

## 15. What to Remove or Simplify

- duplicated rendering paths that do the same job
- unclear ownership between `App.jsx`, `InteractiveViewport.jsx`, `FootprintCanvas.jsx`, and `FootprintTable.jsx`
- future-facing comments that overstate what is already implemented
- accidental coupling between control UI and live render mechanics

## 16. Final UI Assessment

The frontend is promising, thoughtful, and technically ambitious.

But it is still architecturally split across multiple competing answers to the same question:

“What is the primary rendering system?”

Until that is answered cleanly, the UI will remain more complex than it needs to be.
