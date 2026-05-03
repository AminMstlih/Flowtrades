# Flowtrades Architecture Audit

Date: 2026-05-03

This document is a technical reference for the current state of the repository. It is intentionally focused on architecture, correctness and maintainability.

## 1. Role and Purpose of the Codebase

Flowtrades is a real-time Trades flow visualization system. Its purpose is to help users inspect executed market activity across supported exchanges and understand:

- where aggressive buying and selling is occurring
- how volume clusters by price
- whether a level shows imbalance, absorption, or exhaustion
- how these patterns evolve over a short rolling time window

The project is best understood as a market readability tool, not a prediction system.

## 2. Current State Summary

The repository is beyond concept stage. It already contains:

- exchange websocket ingestion for Binance, OKX, and Bybit
- normalization into a canonical `Trade` model
- an async trade bus
- footprint aggregation into candle-like structures and price buckets
- detection logic for imbalance, absorption, and exhaustion
- a FastAPI websocket server for frontend delivery
- a React frontend with footprint rendering, viewport interaction, and connection handling
- tests for aggregation, detection, config, and time-window behavior

This is a meaningful implementation, but the system is not yet fully internally consistent. The documentation is more advanced and more absolute than parts of the codebase.

## 3. What Is Solid Today

### 3.1 Canonical trade flow exists

The pipeline has a clear shape:

`exchange websocket -> raw payload -> normalizer -> Trade model -> trade bus -> footprint state -> serializer -> websocket -> frontend`

That separation is good architecture. It keeps exchange-specific logic away from downstream data handling.

### 3.2 The data model is disciplined

`normalization/models.py` defines a frozen `Trade` schema with the right core fields:

- exchange
- symbol
- price
- volume
- side
- timestamp
- trade_id
- raw payload

That is the right abstraction for a multi-exchange market feed.

### 3.3 Aggregation is testable and deterministic

`aggregation/engine.py` and its tests establish the main math:

- price bucketing
- buy and sell volume totals
- delta
- imbalance percentage
- candle sealing by time interval

This is the right layer to get correct before adding more UI or downstream analysis.

### 3.4 Config validation exists

`config.py` uses Pydantic to validate the runtime configuration. That is important because the system depends on correct thresholds, time windows, and exchange enablement.

### 3.5 Detection is isolated from ingestion

The detection engine is separated from transport and normalization. That makes the code easier to test and easier to revise later without affecting exchange clients.

### 3.6 Frontend performance intent is clear

The frontend code and guide both show awareness of:

- websocket-driven rendering
- requestAnimationFrame loops
- canvas-based rendering considerations
- responsiveness
- stale data handling

Even when the implementation is not fully aligned with the guide, the performance intent is good.

## 4. Where the Architecture Is Weak

### 4.1 TLS verification is disabled for websocket connections

`ingestion/base.py` disables hostname checking and certificate verification in the websocket TLS context.

This is the most serious technical risk in the repository. Even for a data tool, turning off TLS verification by default means the system is trusting unverified network endpoints. That is not acceptable for a production path.

### 4.2 The timeframe model is partially real and partially implied

`state/state.py` exposes `set_window()`, but it is a no-op. At the same time, the websocket API accepts a `window` query parameter and the frontend uses it.

The system does support multiple windows by precomputing separate charts, but the API surface suggests a live mutable window controller that does not really exist.

This is a clarity problem and a maintainability problem.

### 4.3 The backend window model is simple, not fully dynamic

Instead of one rolling state machine that can dynamically switch windows, the state manager keeps separate charts per interval.

That is not wrong, but it is a different architecture than a generic rolling window system. The docs should say that explicitly.

### 4.4 Detection logic is heuristic, not deeply time-aware

Imbalance is the strongest and most defensible detector.

Absorption and exhaustion are currently heuristic and approximate. They are useful annotations, but they are not mathematically deep market structure detectors yet.

This matters because the docs sometimes describe them as if they were more robust than they currently are.

### 4.5 The frontend still sits between two architectural styles

The UI guide strongly prefers a Lightweight Charts-first canvas strategy, but the app still mixes:

- React state for live data
- requestAnimationFrame batching
- DOM rendering paths
- canvas rendering paths

That hybrid can work temporarily, but it increases cognitive load and makes future UI work harder.

### 4.6 Some docs are aspirational rather than current

The docs read like an architecture charter for a later-stage system. In several places they describe:

- “active” sections
- strict phase boundaries
- mobile readiness
- multi-pane charting
- fully prescribed gesture behavior

Some of that is already implemented. Some is partially implemented. Some is still just direction.

The documentation should distinguish those states more clearly.

## 5. Doc-to-Code Alignment

### 5.1 Architecture doc

The architecture document is useful as a design north star, but it is not fully synchronized with the repo.

It is strongest where it describes:

- canonical trade normalization
- the importance of aggregation correctness
- the data pipeline ordering
- the separation of detection from ingestion

It is weakest where it implies:

- the project is still in a clean phase-gated build sequence
- frontend work has not started until later phases
- the live implementation is closer to the blueprint than it actually is

### 5.2 UI engineering guide

The UI guide is much stricter than the active frontend implementation.

It is valuable because it defines:

- the preferred rendering model
- viewport rules
- gesture behavior
- canvas scaling rules
- performance constraints

But some of its “law-like” language is now ahead of the codebase. It should be used as a target standard, not as a description of current truth.

### 5.3 README

The README markets the system as if the feature set is already stable and complete. That overstates reality in a few places.

The README should eventually be rewritten to reflect:

- what is truly working now
- what is experimental
- what is planned
- what the system is for in practical technical terms

## 6. Important Implementation Notes

### 6.1 Backend route contract

`output/ws_server.py` defines the main websocket contract. That contract is currently the key interface between backend and frontend.

If this project evolves, the serializer and websocket payload should be treated as a versioned contract.

### 6.2 Current state object design

`FootprintState` holds multiple prebuilt charts for multiple windows. This is straightforward and easy to reason about.

Tradeoff:

- simpler logic
- easier snapshot retrieval
- less flexible than a single dynamic rolling state engine

### 6.3 Tests are doing real work

The tests are not decorative. They are actually encoding the expected math of the system.

That is one of the best signs in the repo.

## 7. Risk Register

### Critical

- TLS verification disabled on exchange websocket connections
- Any accidental reliance on stale or unauthenticated feed data

### High

- Window switching API not matching actual behavior
- Frontend architecture drift between guide and implementation
- Overstated documentation leading to false confidence

### Medium

- Heuristic detectors being treated as more authoritative than they are
- Future contributors misunderstanding the multi-window design
- Hybrid DOM/canvas frontend increasing maintenance cost

## 8. What Should Be Preserved

Keep these properties intact:

- canonical normalized trade model
- exchange-specific ingestion isolation
- config validation
- aggregation correctness first
- test coverage around math and detection
- explicit stale-data awareness
- no silent failures philosophy

These are the bones of the system.

## 9. What Should Be Simplified

The codebase would benefit from simplification in these areas:

- remove or fix any API surface that implies behavior the system does not actually implement
- reduce duplicate architectural narratives across docs
- choose one primary frontend rendering model and retire the other
- separate “current state” documentation from “directional design” documentation

## 10. Recommended Direction

If the goal is to keep making the project more useful, the best near-term direction is:

1. Make the backend transport secure by default.
2. Make the docs honest and current.
3. Decide whether the frontend is Canvas-first or DOM-first, then align the code with that decision.
4. Keep improving the accuracy and clarity of the footprint math before adding more layers.
5. Treat the system as a tool for reading order flow, not as a prediction machine.

## 11. Practical Next Steps

- Patch websocket TLS verification
- Reconcile `set_window()` and the actual timeframe implementation
- Rewrite the docs into three layers:
  - current state
  - technical direction
  - future ideas
- Align the frontend implementation with the UI guide or revise the guide to match the chosen direction
- Add more tests around serializer shape and state/window behavior

## 12. Final Assessment

Flowtrades is real code with a real pipeline, not a blank slate.

The strongest part is the backend architecture and the discipline around the canonical trade model.

The weakest part is coherence:

- the docs are ahead of the implementation
- the frontend is split between competing approaches
- one critical security choice is unsafe by default

If the next phase is about usefulness, the priority should be clarity, correctness, and architectural consistency.
