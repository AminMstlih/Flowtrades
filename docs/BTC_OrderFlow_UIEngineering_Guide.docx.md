  
**BTC ORDER FLOW LITE**

**UI/UX Engineering Reference**

*Viewport · Scaling · Rendering · Gestures · Layout · Data Flow · Cross-Device*

| Field | Value |
| :---- | :---- |
| Document Type | Engineering Implementation Guide |
| Role of Document | Mandatory reference for all developers and AI assistants working on the UI layer |
| Applies To | React frontend, Canvas rendering, WebSocket client, responsive layout, gestures |
| Target Devices | Mobile (320px+) · Tablet (768px+) · Desktop (1024px+) · 4K (2560px+) |
| Library Mandate | TradingView Lightweight Charts v5 (primary) \+ custom Canvas overlays |
| Status | ACTIVE — Read before writing a single line of frontend code |

# **0\. Architect's Preface — Read This First**

This document exists because "I'll figure out the UI later" is how charting projects die. Every hour of bad architecture in the rendering layer costs ten hours of refactoring. TradingView took years to build what they have. We are not building TradingView. We are building something specific, leaner, and more honest — but we will build it with the same engineering discipline they used.

The three failure modes that kill charting UIs are: (1) treating the chart as a DOM problem when it is a Canvas problem, (2) letting live data re-render React components on every tick, and (3) designing for desktop and bolting on mobile as an afterthought. This guide prevents all three. Deviation from the principles here requires written justification.

| 🏗️  THIS DOCUMENT IS LAW FOR THE UI LAYER |
| :---- |
| Every developer and AI assistant working on this project MUST read this document before touching frontend code. |
| Decisions made in this document are based on production-grade charting engineering principles, not preferences. |
| If this document conflicts with your intuition, this document wins. Update it if you find an error, but never silently ignore it. |

# **1\. Rendering Engine — The Most Important Decision**

The single most consequential decision in charting UI architecture is the rendering backend. Get this wrong and everything built on top of it is compromised. This section is not negotiable.

## **1.1 Why Not SVG**

SVG is a retained-mode DOM renderer. Every candlestick, every grid line, every axis label becomes a DOM element. A chart with 500 candles and a volume panel has 1,500+ DOM nodes actively tracked by the browser layout engine. This creates cascading costs:

* Layout recalculation on every data update — the browser re-flows the entire SVG tree

* Memory footprint scales linearly with data points — catastrophic on phones with 2–3GB RAM

* Touch event routing through the DOM is 3–8x slower than Canvas hit-testing

* Benchmark reality: SVG drops to 22 FPS at 5,000 data points on mid-range hardware; Canvas holds 60 FPS

| 🚫  SVG IS PROHIBITED FOR CHART RENDERING |
| :---- |
| SVG may only be used for UI chrome elements — buttons, icons, static overlays — NOT for the chart itself. |
| Any SVG-based charting library (Recharts, Victory, Nivo) is disqualified for this project. |

## **1.2 Canvas 2D — The Chosen Path**

HTML5 Canvas 2D renders imperatively to a bitmap. The browser never tracks what was drawn — it just paints pixels. This is why TradingView Lightweight Charts delivers 60 FPS with thousands of bars: it uses Canvas and repaints only what changed. At 40KB gzipped, Lightweight Charts is the production-proven foundation for this project.

| Property | Canvas 2D | SVG | WebGL |
| :---- | :---- | :---- | :---- |
| DOM overhead | **✅ None — immediate mode** | **🚫 One node per element** | **✅ None** |
| Mobile performance | **✅ Excellent up to 10k points** | ⚠️ Degrades \>500 points | **✅ Best for \>50k points** |
| Implementation complexity | **✅ Low (via Lightweight Charts)** | **✅ Low but wrong choice** | ⚠️ High — requires shader knowledge |
| Touch/gesture support | **✅ Native with pointer events** | ⚠️ DOM-bound, slower | **✅ Fast but complex** |
| Retina/HiDPI support | **✅ via devicePixelRatio scaling** | **✅ Vector scales naturally** | **✅ Yes** |
| Real-time 60 FPS at 5k bars | **✅ Yes** | **🚫 No** | **✅ Yes** |
| Custom overlays (footprint) | **✅ Yes — draw directly on canvas** | ⚠️ Complex | **✅ Yes but overkill** |
| Debugging tools | **✅ Chrome DevTools** | **✅ DOM inspector** | ⚠️ WebGL Inspector required |

## **1.3 Mandatory Library: TradingView Lightweight Charts v5**

Lightweight Charts v5 is the mandated charting library. It ships at 35KB gzipped, uses Canvas 2D, delivers 60 FPS with thousands of bars at multiple updates per second, includes multi-pane support (added in v5), and is maintained by the same team that builds TradingView. It handles candlesticks, volume histograms, price scales, time scales, crosshairs, and zoom/pan natively.

| \# Install npm install lightweight-charts \# React wrapper pattern — always use ref, never state for chart instance import { createChart, CandlestickSeries, HistogramSeries } from "lightweight-charts"; import { useEffect, useRef } from "react"; export function ChartContainer({ data, volumeData }) {   const containerRef \= useRef(null);   const chartRef     \= useRef(null);   const candleRef    \= useRef(null);   const volumeRef    \= useRef(null);   useEffect(() \=\> {     // Create chart ONCE — never recreate on data change     chartRef.current \= createChart(containerRef.current, chartOptions);     candleRef.current \= chartRef.current.addSeries(CandlestickSeries, seriesOptions);     volumeRef.current \= chartRef.current.addSeries(HistogramSeries, volumeOptions);     return () \=\> chartRef.current.remove(); // cleanup   }, \[\]); // empty deps — chart never remounts   useEffect(() \=\> {     // Update data via series API — NO chart remount     if (candleRef.current) candleRef.current.update(latestCandle);     if (volumeRef.current) volumeRef.current.update(latestVolume);   }, \[latestCandle\]); // only fires on new tick   return \<div ref={containerRef} style={{ width: "100%", height: "100%" }} /\>; } |
| :---- |

| ⚠️  CRITICAL REACT \+ CANVAS RULE |
| :---- |
| NEVER store the chart instance in React state (useState). State triggers re-renders. Re-renders destroy and rebuild the canvas. |
| ALWAYS use useRef for chart, series, and WebSocket instances. Refs persist across renders without triggering them. |
| ALWAYS initialize the chart in a useEffect with empty dependency array \[\]. This runs once on mount only. |
| Data updates MUST go through the series .update() or .setData() API — never through React state. |

## **1.4 HiDPI / Retina Rendering — Non-Negotiable**

On a Retina or high-DPI screen, a canvas that is not scaled to devicePixelRatio appears blurry — exactly like a pixelated image. Lightweight Charts handles this internally, but any custom Canvas overlay (footprint panel, delta ladder) must implement it manually:

| function setupHiDPICanvas(canvas, width, height) {   const dpr \= window.devicePixelRatio || 1;   // Physical pixel resolution   canvas.width  \= Math.round(width  \* dpr);   canvas.height \= Math.round(height \* dpr);   // CSS size stays at logical pixels   canvas.style.width  \= width  \+ "px";   canvas.style.height \= height \+ "px";   // Scale context so drawing coords use logical pixels   const ctx \= canvas.getContext("2d");   ctx.scale(dpr, dpr);   return ctx; } // Re-run on every resize — devicePixelRatio can change (e.g., drag to external monitor) const resizeObserver \= new ResizeObserver(entries \=\> {   for (const entry of entries) {     const { width, height } \= entry.contentRect;     setupHiDPICanvas(canvas, width, height);     redrawChart(); // always redraw after resize   } }); resizeObserver.observe(containerElement); |
| :---- |

# **2\. Viewport & Layout Architecture**

The layout is the skeleton. Every component lives within it. It must be designed once and never hacked. The layout follows a mobile-first CSS Grid approach with four defined breakpoints and a fixed panel model.

## **2.1 Breakpoint System**

Mobile-first means the base CSS is written for the smallest screen, then progressively enhanced. Never add mobile as an afterthought to a desktop layout — this produces cramped, broken experiences on the exact devices retail traders use most.

| Breakpoint | Min Width | Target Devices | Layout Mode | Panel Config |
| :---- | :---- | :---- | :---- | :---- |
| xs (mobile) | 320px | Budget phones, older iPhones | Single column, stacked | Chart fullscreen, panels collapsed to tabs |
| sm (phablet) | 480px | Modern phones, landscape mode | Single column, larger | Chart 70vh, footprint panel below |
| md (tablet) | 768px | iPad, Android tablets | Two-column option | Chart 60%, footprint ladder 40% side panel |
| lg (desktop) | 1024px | Laptops, small monitors | Full layout | Chart main, footprint sidebar, controls top |
| xl (wide) | 1280px | Standard desktops, 1080p | Full layout \+ spacing | All panels visible, comfortable density |
| 2xl (4K) | 2560px | 4K monitors, trading setups | Dense multi-panel | Multiple timeframes possible side-by-side |

## **2.2 Layout Grid Specification**

The application uses a CSS Grid root layout. All panels are placed on this grid. Resize handles adjust the column/row split. Do not use absolute positioning for panels — it breaks on resize and mobile.

| /\* Root layout — applies to the main app container \*/ .app-layout {   display: grid;   width: 100vw;   height: 100dvh; /\* dvh \= dynamic viewport height — handles mobile browser bars \*/   overflow: hidden;   /\* Mobile: single column, rows stacked \*/   grid-template-columns: 1fr;   grid-template-rows: 48px 1fr auto; /\* toolbar | chart | footer \*/   grid-template-areas:     "toolbar"     "chart"     "footer"; } /\* Tablet and up: add side panel \*/ @media (min-width: 768px) {   .app-layout {     grid-template-columns: 1fr 280px;     grid-template-rows: 48px 1fr;     grid-template-areas:       "toolbar  toolbar"       "chart    footprint";   } } /\* Desktop: full layout with resizable columns \*/ @media (min-width: 1024px) {   .app-layout {     grid-template-columns: 1fr var(--footprint-width, 320px);     grid-template-rows: 48px 1fr 200px;     grid-template-areas:       "toolbar    toolbar"       "chart      footprint"       "volume     footprint";   } } |
| :---- |

## **2.3 Panel Hierarchy**

| Panel | Grid Area | Content | Min Size | Collapsible? |
| :---- | :---- | :---- | :---- | :---- |
| Toolbar | toolbar | Symbol, timeframe selector, exchange toggles, window selector | 48px height | No — always visible |
| Main Chart | chart | Candlestick \+ volume (sub-pane via Lightweight Charts multi-pane) | 60% viewport height | No |
| Volume Sub-Pane | volume | Volume histogram (inside Lightweight Charts multi-pane) | 100px min height | Yes (collapses into chart area) |
| Footprint Ladder | footprint | Buy/sell volume ladder, delta, imbalance, detection flags | 280px min width | Yes — becomes bottom sheet on mobile |
| Status Bar | footer | Connection status, last price, exchange health indicators | 28px height | Yes on mobile |

## **2.4 100dvh: The Mobile Viewport Trap**

Using 100vh on mobile is a documented failure mode. Mobile browsers show/hide their navigation bar while scrolling, changing the visible height. A chart set to height: 100vh will overflow the visible area — the bottom gets cut off under the browser chrome. The fix is 100dvh (dynamic viewport height), supported in all modern browsers.

| /\* WRONG — overflows on iOS/Android when browser chrome is visible \*/ .chart-container { height: 100vh; } /\* CORRECT — adapts to actual visible area \*/ .chart-container { height: 100dvh; } /\* With fallback for older browsers \*/ .chart-container {   height: 100vh;           /\* fallback \*/   height: 100dvh;          /\* modern override \*/ } /\* Also: never use fixed pixel heights for chart containers.    Always use percentage or fr units within the grid. \*/ |
| :---- |

# **3\. Scaling & Coordinate System**

Scaling is the hardest problem in charting UI. The chart must translate between three coordinate spaces simultaneously: data space (price and time values), logical pixel space (CSS pixels), and physical pixel space (device pixels). Every input event, every render call, and every axis label must use the correct space — mixing them up produces misaligned crosshairs, incorrect tooltips, and visual artifacts.

## **3.1 Three Coordinate Spaces Defined**

| Space | Unit | Range (example) | Used For | Conversion |
| :---- | :---- | :---- | :---- | :---- |
| Data Space | Price / Timestamp | 67,000–67,500 BTC / Unix ms | Aggregation, detection logic, axis labels | Via chart.priceToCoordinate() / timeToCoordinate() |
| Logical Pixel Space | CSS px | 0–1200 px width | Layout, CSS, pointer events, ResizeObserver | Divide physical px by devicePixelRatio |
| Physical Pixel Space | Device px | 0–2400 px width (2x DPR) | Canvas .width / .height, ctx.drawImage() | Multiply CSS px by devicePixelRatio |

## **3.2 Price Axis Scaling**

Lightweight Charts manages the price axis automatically, but the footprint ladder must stay synchronized. The key rule: the footprint Y-axis must be pixel-for-pixel aligned with the chart's price axis at all times. Achieve this by reading the chart's visible price range on every render cycle and mapping it to the footprint's canvas coordinates.

| // Synchronize footprint panel Y-axis with chart price axis chart.subscribeCrosshairMove((param) \=\> {   // This fires on every mouse/touch move — keep it fast   updateCrosshairPosition(param); }); chart.timeScale().subscribeVisibleTimeRangeChange(() \=\> {   // Fires when zoom/pan changes the time range   syncFootprintToChart(); }); function syncFootprintToChart() {   const priceScale \= candleSeries.priceScale();   const visibleRange \= candleSeries.barsInLogicalRange(     chart.timeScale().getVisibleLogicalRange()   );   // Map data price → canvas Y coordinate   const topPrice    \= chart.priceScale("right").coordinateToPrice(0);   const bottomPrice \= chart.priceScale("right").coordinateToPrice(chartHeight);   drawFootprintForRange(topPrice, bottomPrice); } |
| :---- |

## **3.3 Time Axis & Candle Scaling**

The time axis must adapt its label density based on zoom level. Do not show every minute label when 100 candles are visible — they overlap and are unreadable. Lightweight Charts handles this automatically, but custom overlays must apply the same logic:

| Visible Candle Count | Time Label Format | Label Density | Candle Width (logical px) |
| :---- | :---- | :---- | :---- |
| 1–10 | HH:mm:ss | Every candle | \> 30px — show full body \+ wicks clearly |
| 10–50 | HH:mm | Every 5 candles | 8–30px — full body, wicks may thin |
| 50–200 | HH:mm | Every 15 candles | 2–8px — bars may merge, show trend |
| 200–500 | HH / DD | Every 30 candles | \< 2px — conflation activates, show as line |
| 500+ | DD/MM | Every 50 candles | Sub-pixel — use data conflation |

| 💡  DATA CONFLATION — Enable in Lightweight Charts v5 |
| :---- |
| enableConflation: true — automatically merges data points when zoomed out past the sub-pixel threshold. |
| This prevents the browser from trying to render thousands of 0.1px candles and dramatically improves performance. |
| Set conflationThresholdFactor: 2.0 for smooth sparkline appearance when deeply zoomed out. |

## **3.4 Zoom Behavior Specification**

Zoom must feel snappy and must never exceed defined limits. Zooming too far in shows too few candles to be useful; zooming too far out makes individual candles invisible. Define hard limits:

| Parameter | Value | Rationale |
| :---- | :---- | :---- |
| Min visible candles | 3 | Fewer than 3 candles provides no context — enforce minimum |
| Max visible candles | 2000 | Beyond 2000, individual candles are invisible — conflation takes over |
| Zoom speed (wheel) | 0.1x per tick | Matches TradingView feel — not too sensitive, not sluggish |
| Zoom speed (pinch) | Linear to finger spread ratio | Match finger movement 1:1 for natural feel |
| Zoom anchor point | Cursor/touch midpoint | Never zoom from edge — always anchor to where the user is looking |
| Min bar spacing (px) | 0.5px | Sub-pixel rendered as conflated line series |
| Max bar spacing (px) | 100px | Beyond this is absurdly zoomed in — cap it |
| Auto-fit on data load | Yes | Always fit visible range to latest N candles on initial load |
| Auto-scroll to latest | Only if user is at right edge | Never force-scroll if user has panned to history |

# **4\. Gesture System — Touch & Mouse**

Retail traders on mobile will interact with this chart primarily through touch. The gesture system must be engineered to feel as natural as a native app. Lightweight Charts handles the core gestures, but the footprint panel and any custom overlay require manual gesture implementation. This section specifies every gesture, its expected behavior, and its implementation contract.

## **4.1 Gesture Inventory**

| Gesture | Input | Action | Panel Scope | Priority |
| :---- | :---- | :---- | :---- | :---- |
| Single tap | Touch (1 finger) | Show crosshair at tap position | Chart | High |
| Long press | Touch (1 finger, \>500ms) | Lock crosshair at position, show OHLV tooltip | Chart | Medium |
| Pan (1 finger) | Touch (1 finger drag) | Scroll time axis left/right | Chart | High |
| Pinch to zoom | Touch (2 fingers apart/together) | Zoom time axis around midpoint | Chart | Critical |
| Double tap | Touch (2 taps) | Auto-fit to latest N candles | Chart | Medium |
| Mouse wheel | Desktop scroll | Zoom time axis at cursor position | Chart | Critical |
| Click \+ drag | Desktop | Pan time axis | Chart | High |
| Ctrl \+ scroll | Desktop | Zoom price axis (vertical) | Chart | Low |
| Swipe up/down | Touch (footprint) | Scroll footprint ladder vertically | Footprint | High |
| Right edge drag | Any | Resize footprint panel width | Layout | Medium |

## **4.2 Pinch-to-Zoom Implementation Contract**

Pinch-to-zoom is the most complex gesture. It requires simultaneous tracking of two touch points, computing their midpoint as the zoom anchor, and translating finger spread ratio into a time range change. Lightweight Charts implements this natively. For any custom canvas panel, follow this algorithm precisely:

| // Pinch-to-zoom algorithm for custom canvas panels let lastPinchDistance \= null; canvas.addEventListener("touchstart", (e) \=\> {   if (e.touches.length \=== 2\) {     lastPinchDistance \= getPinchDistance(e.touches);     e.preventDefault(); // CRITICAL: prevents native browser zoom   } }, { passive: false }); // must be non-passive to preventDefault canvas.addEventListener("touchmove", (e) \=\> {   if (e.touches.length \=== 2\) {     const currentDistance \= getPinchDistance(e.touches);     const pinchRatio      \= currentDistance / lastPinchDistance;     const midpoint        \= getPinchMidpoint(e.touches);     applyZoom(pinchRatio, midpoint); // zoom anchored to finger midpoint     lastPinchDistance \= currentDistance;     e.preventDefault();   } }, { passive: false }); function getPinchDistance(touches) {   const dx \= touches\[0\].clientX \- touches\[1\].clientX;   const dy \= touches\[0\].clientY \- touches\[1\].clientY;   return Math.sqrt(dx \* dx \+ dy \* dy); // Pythagorean distance } function getPinchMidpoint(touches) {   return {     x: (touches\[0\].clientX \+ touches\[1\].clientX) / 2,     y: (touches\[0\].clientY \+ touches\[1\].clientY) / 2,   }; } |
| :---- |

## **4.3 Touch Target Size Requirements**

WCAG 2.1 AA requires minimum 44×44px touch targets. On a trading chart, this applies to every interactive control — timeframe buttons, exchange toggles, panel collapse handles, and the footprint time window selector. Failure here means retail traders on phones miss controls and get frustrated.

| Control | Min Touch Target | Visual Size | Notes |
| :---- | :---- | :---- | :---- |
| Timeframe buttons (1m, 5m, 15m…) | 44×44px | 28×28px visual | Invisible padding around visual element |
| Exchange toggles | 44×44px | 32×32px visual | Use padding, not margin for touch area |
| Footprint window selector | 44×44px | Full width strip | Easy — spans full panel width |
| Panel collapse/resize handle | 44px wide | 8px visual strip | Expand touch area with pseudo-elements |
| Crosshair lock button | 44×44px | 24×24px icon | Appears on long press — must be easily tappable |
| Zoom reset button | 44×44px | 32px icon | Always visible on mobile in corner |

## **4.4 Preventing Gesture Conflicts**

A critical engineering problem: when the chart is inside a scrollable page, the browser's default scroll behavior conflicts with the chart's pan gesture. The user tries to pan the chart but the page scrolls instead. Three rules prevent this:

1. The chart container must be overflow: hidden. The chart should never itself trigger page scroll.

2. All touch event listeners on the chart canvas must use { passive: false } and call e.preventDefault() when the gesture is recognized as a chart interaction.

3. Implement a gesture recognizer that distinguishes horizontal pan (chart) from vertical swipe (footprint scroll). Use a movement angle threshold of ±30° from horizontal to classify.

| // Gesture disambiguation — run on every touchmove function classifyGesture(deltaX, deltaY) {   const angle \= Math.abs(Math.atan2(deltaY, deltaX) \* 180 / Math.PI);   if (angle \< 30 || angle \> 150\) return "horizontal-pan";   // chart zoom/pan   if (angle \> 60 && angle \< 120\) return "vertical-scroll";  // footprint scroll   return "diagonal"; // ambiguous — maintain current mode } |
| :---- |

## **4.5 Viewport Meta — Critical Mobile Config**

The HTML viewport meta tag controls how the browser handles scaling. A wrong configuration breaks pinch-to-zoom or causes the entire page to zoom instead of the chart. Use this exact configuration:

| \<\!-- CORRECT viewport meta for a charting application \--\> \<meta name="viewport" content="width=device-width, initial-scale=1.0"\> \<\!-- NEVER use user-scalable=no or maximum-scale=1 in the meta tag.      These disable accessibility zoom and violate WCAG 1.4.4.      The chart's own touch handlers will intercept pinch gestures      before the browser can act on them — no need to disable browser zoom. \--\> \<\!-- iOS specific: prevent elastic bounce scrolling on the root element \--\> /\* In CSS \*/ html, body {   overflow: hidden;   position: fixed;   width: 100%;   height: 100%;   touch-action: none; /\* Let JS handle all touch on chart container \*/ } .chart-container {   touch-action: none; /\* Prevents all default browser touch behavior within chart \*/ } |
| :---- |

# **5\. Real-Time Data Flow Architecture**

The data layer and the render layer must be completely decoupled. Live trade data from the WebSocket must never directly trigger React re-renders. If a WebSocket message arrives 100 times per second and each one updates React state, the UI chokes — component trees re-evaluate, the chart remounts, and the experience becomes unusable. This section specifies the correct architecture.

## **5.1 Architecture Overview**

The flow is unidirectional: WebSocket → Buffer → Batched Update → Chart API → Canvas. React state is only used for UI controls (timeframe, exchange selection), never for live chart data.

| WebSocket (FastAPI backend)   │   ▼  Raw footprint state JSON @ 500ms intervals useWebSocket hook (custom)   │  Receives JSON, parses, puts into a ref buffer   │  NEVER calls setState on tick data   ▼ requestAnimationFrame loop (independent of React render cycle)   │  Reads from ref buffer on each animation frame   │  Calls chart series .update() or custom canvas drawFrame()   ▼ Lightweight Charts Canvas API   │  .update(candle) — updates the current forming candle   │  .setData(candles) — replaces full dataset (only on timeframe change)   ▼ Canvas pixels — browser compositor — screen React state (only for:)   ├─ selectedTimeframe: "1m" | "5m" | "15m"   ├─ selectedExchanges: \["binance", "okx", "bybit"\]   ├─ connectionStatus: "connected" | "reconnecting" | "offline"   └─ footprintWindowMinutes: 1 | 5 | 15 |
| :---- |

## **5.2 WebSocket Client Hook Specification**

| function useChartWebSocket(url) {   const wsRef           \= useRef(null);      // WebSocket instance   const latestDataRef   \= useRef(null);      // Latest footprint state (ref, not state)   const reconnectTimer  \= useRef(null);   const \[status, setStatus\] \= useState("connecting"); // UI state only   useEffect(() \=\> {     function connect() {       wsRef.current \= new WebSocket(url);       wsRef.current.onopen \= () \=\> {         setStatus("connected");         clearTimeout(reconnectTimer.current);       };       wsRef.current.onmessage \= (event) \=\> {         // CRITICAL: parse and store in ref — do NOT call setState         latestDataRef.current \= JSON.parse(event.data);       };       wsRef.current.onclose \= () \=\> {         setStatus("reconnecting");         // Exponential backoff: 1s, 2s, 4s, 8s, max 30s         const delay \= Math.min(30000, 1000 \* 2 \*\* reconnectAttempts);         reconnectTimer.current \= setTimeout(connect, delay);       };       wsRef.current.onerror \= () \=\> {         wsRef.current.close(); // triggers onclose → reconnect       };     }     connect();     return () \=\> {       clearTimeout(reconnectTimer.current);       wsRef.current?.close();     };   }, \[url\]);   return { latestDataRef, status }; } |
| :---- |

## **5.3 Render Loop — requestAnimationFrame Pattern**

The chart render loop must run on requestAnimationFrame — the browser's native 60 FPS timing. This synchronizes renders with the display refresh rate and prevents tearing. Never use setInterval for chart updates — it fights with the browser's compositor.

| // In the ChartContainer component useEffect(() \=\> {   let animFrameId;   function renderLoop() {     const data \= latestDataRef.current;     if (data) {       // Update candle series — Lightweight Charts only repaints changed pixels       if (data.latestCandle) {         candleRef.current?.update(data.latestCandle);       }       // Redraw custom footprint canvas overlay       if (data.footprint) {         drawFootprintOverlay(footprintCanvasRef.current, data.footprint);       }       latestDataRef.current \= null; // consume — prevent redundant redraws     }     animFrameId \= requestAnimationFrame(renderLoop);   }   animFrameId \= requestAnimationFrame(renderLoop);   return () \=\> cancelAnimationFrame(animFrameId); // cleanup on unmount }, \[\]); // runs once — loop is self-sustaining via requestAnimationFrame |
| :---- |

## **5.4 Data Protocol — WebSocket Message Schema**

The backend sends a single JSON message every 500ms. This message carries the complete current state. The frontend does not accumulate partial updates — it replaces the previous state with each message. This prevents state drift across reconnections.

| // WebSocket message schema (JSON) {   "ts": 1711620000000,           // server timestamp (Unix ms)   "window\_min": 5,               // active time window in minutes   "candle": {                    // current forming candle     "time": 1711619700,          // Unix seconds (Lightweight Charts format)     "open": 67240.5,     "high": 67298.0,     "low":  67198.0,     "close": 67271.0   },   "volume\_bar": {     "time": 1711619700,     "value": 142.3,              // total volume in BTC     "color": "\#26a69a"           // green for buy-dominant, red for sell   },   "footprint": \[                 // array of price levels, descending     {       "price": 67271,       "buy\_vol": 42.8,       "sell\_vol": 12.1,       "delta": 30.7,       "imbalance\_pct": 78,       // signed: positive \= buy dominant       "flags": \["ABS"\],          // \[\] | \["ABS"\] | \["EXH"\] | \["ABS","EXH"\]       "is\_current\_price": true   // highlight the live price level     }   \],   "connection": {     "binance": "ok",             // "ok" | "lag" | "offline"     "okx":    "ok",     "bybit":  "lag"   } } |
| :---- |

# **6\. Footprint Panel Rendering**

The footprint ladder is a custom Canvas 2D component. It cannot use Lightweight Charts — Lightweight Charts renders OHLCV financial series, not tabular order flow grids. The footprint is drawn directly on a raw HTML canvas element overlaid on or adjacent to the main chart.

## **6.1 Footprint Canvas Specification**

| Property | Specification |
| :---- | :---- |
| Rendering surface | Raw HTML \<canvas\> element — no library wrapping |
| Sizing | CSS width: 100%, height: 100% within its grid area — actual dimensions from ResizeObserver |
| HiDPI | MANDATORY — apply devicePixelRatio scaling on every resize (see Section 1.4) |
| Refresh rate | Driven by requestAnimationFrame loop — same loop as main chart |
| Row height | Fixed at 24px logical pixels on desktop, 32px on mobile (easier touch) |
| Column layout | Price | Buy Vol | Sell Vol | Delta | Imbalance | Flags |
| Vertical alignment | Y-coordinate maps to chart price axis — must sync on every chart scroll/zoom |
| Current price highlight | Highlight row where is\_current\_price \=== true with distinct background |
| Color scheme | Buy volume: \#26A69A (teal-green), Sell volume: \#EF5350 (red), Neutral: \#546E7A |

## **6.2 Row Rendering Algorithm**

| function drawFootprint(canvas, footprintData, priceToY) {   const ctx \= canvas.getContext("2d");   const W   \= canvas.clientWidth;   const ROW \= 24; // logical px row height   // Clear entire canvas each frame — Canvas 2D is immediate mode   ctx.clearRect(0, 0, canvas.width, canvas.height);   // Column widths (logical px)   const COL \= { price: 80, buy: 70, sell: 70, delta: 70, imbalance: 70, flags: W \- 360 };   footprintData.forEach(row \=\> {     const y \= priceToY(row.price); // map price → canvas Y via chart sync     if (y \< 0 || y \> canvas.clientHeight) return; // skip off-screen rows     // Row background — alternate shading     ctx.fillStyle \= row.is\_current\_price ? "\#1A2A3A" : (row.price % 2 \=== 0 ? "\#0D1B2A" : "\#111F2E");     ctx.fillRect(0, y \- ROW/2, W, ROW);     // Buy volume — teal     ctx.fillStyle \= "\#26A69A";     ctx.font \= "12px Courier New";     ctx.fillText(row.buy\_vol.toFixed(1), COL.price, y \+ 4);     // Sell volume — red     ctx.fillStyle \= "\#EF5350";     ctx.fillText(row.sell\_vol.toFixed(1), COL.price \+ COL.buy, y \+ 4);     // Delta — green if positive, red if negative     ctx.fillStyle \= row.delta \>= 0 ? "\#26A69A" : "\#EF5350";     ctx.fillText((row.delta \>= 0 ? "+" : "") \+ row.delta.toFixed(1), COL.price \+ COL.buy \+ COL.sell, y \+ 4);     // Imbalance — with background highlight if \>= threshold     if (Math.abs(row.imbalance\_pct) \>= 70\) {       ctx.fillStyle \= row.imbalance\_pct \> 0 ? "\#0D3B2E" : "\#3B0D0D"; // subtle bg       ctx.fillRect(COL.price \+ COL.buy \+ COL.sell \+ COL.delta, y \- ROW/2, COL.imbalance, ROW);     }     ctx.fillStyle \= row.imbalance\_pct \>= 0 ? "\#26A69A" : "\#EF5350";     ctx.fillText((row.imbalance\_pct \>= 0 ? "+" : "") \+ row.imbalance\_pct \+ "%",                  COL.price \+ COL.buy \+ COL.sell \+ COL.delta, y \+ 4);     // Detection flags     if (row.flags.length \> 0\) {       ctx.fillStyle \= "\#F9A825"; // gold for flags       ctx.fillText(row.flags.join(" "), COL.price \+ COL.buy \+ COL.sell \+ COL.delta \+ COL.imbalance, y \+ 4);     }   }); } |
| :---- |

# **7\. Responsive Chart Behaviour Per Breakpoint**

The chart must adapt its information density, control layout, and interaction model based on screen size. This is not cosmetic — it is functional. A mobile user cannot interact with 6-column footprint tables, tiny toolbar buttons, or panels that require hover to activate. This section specifies exactly what changes at each breakpoint.

| Feature / Element | Mobile (\< 480px) | Tablet (480–1024px) | Desktop (\> 1024px) |
| :---- | :---- | :---- | :---- |
| Chart height | 65dvh | 60dvh | Fills grid row (flex/grid) |
| Volume sub-pane | Collapsed by default, toggle | 80px, visible | 120px, always visible |
| Footprint panel | Bottom sheet (swipe up) | Right panel 280px | Right panel 320px, resizable |
| Footprint columns shown | Price \+ Imbalance \+ Flags only | Price \+ Buy \+ Sell \+ Imbalance | All 6 columns |
| Toolbar layout | Horizontal scroll, icon-only | Icons \+ short labels | Icons \+ full labels |
| Timeframe selector | Bottom tab bar | Horizontal button group in toolbar | Horizontal button group in toolbar |
| Exchange toggles | In settings sheet | In toolbar (icon chips) | In toolbar (labeled chips) |
| Crosshair | Appears on long press | Appears on touch | Appears on hover/click |
| OHLV tooltip | Full-screen card on long press | Floating above touch point | Floating near cursor |
| Zoom controls | \+/- buttons always visible | \+/- buttons visible | Mouse wheel primary, buttons secondary |
| Educational labels | Tap flag to expand full label | Hover/tap for tooltip | Hover for tooltip, always visible short label |
| Connection status | Dot indicator in corner | Dot \+ exchange name | Full status bar with exchange dots |

## **7.1 Mobile Footprint as Bottom Sheet**

On mobile, the footprint panel must be implemented as a bottom sheet — a panel that slides up from the bottom of the screen. This is the standard mobile UX pattern for secondary panels. The chart occupies the full screen; the bottom sheet provides access to the footprint without navigating away.

| State | Height | Trigger | Content |
| :---- | :---- | :---- | :---- |
| Collapsed (default) | 48px | Initial load | Handle bar \+ current price imbalance summary only |
| Partial (snap) | 40dvh | Single swipe up | Top 10 price levels, condensed 2-column view |
| Expanded | 85dvh | Second swipe up or button | Full footprint with all visible levels |
| Dismissed | 0px | Swipe down from collapsed | Hidden — accessed via toolbar button |

# **8\. Performance Requirements & Rules**

Performance is not a feature — it is a prerequisite. A charting tool that lags, stutters, or drops frames loses user trust immediately. Budget Android phones with Snapdragon 6-series processors are the minimum target device. Every decision must be tested on mid-range hardware, not flagship phones.

## **8.1 Performance Budget**

| Metric | Target | Hard Maximum | Measurement Method |
| :---- | :---- | :---- | :---- |
| Initial render (chart visible) | \< 1.5s | 3s | Chrome Performance tab, Lighthouse |
| Time to interactive | \< 2s | 4s | Lighthouse TTI metric |
| WebSocket → screen latency | \< 100ms | 250ms | Timestamp from backend to canvas paint |
| Frame rate (idle chart) | 60 FPS | \> 30 FPS minimum | Chrome DevTools Performance → Frames |
| Frame rate (during pan/zoom) | 60 FPS | \> 45 FPS minimum | Chrome DevTools during gesture |
| Memory (steady state) | \< 150MB JS heap | 300MB | Chrome Memory → Heap Snapshot |
| Memory growth over 1 hour | \< 20MB increase | 50MB | Memory timeline in DevTools |
| Bundle size (initial JS) | \< 250KB gzipped | 400KB | Vite build output |
| LCP (Largest Contentful Paint) | \< 2.5s | 4s | Lighthouse Core Web Vitals |

## **8.2 Performance Rules — Mandatory**

* NEVER call setState on WebSocket tick data. Use refs only.

* NEVER recreate the chart instance. Initialize once, update via API.

* ALWAYS use requestAnimationFrame for the render loop. Never setInterval.

* ALWAYS cap the in-memory candle buffer. Keep max 2000 candles in JS memory; older data fetched on demand.

* ALWAYS debounce resize events via ResizeObserver with 16ms debounce (one frame).

* ALWAYS use will-change: transform on the chart container to promote to GPU layer.

* NEVER use CSS animations on chart elements — use Canvas requestAnimationFrame instead.

* ALWAYS use React.memo on UI chrome components (toolbar, status bar) to prevent re-renders when chart data changes.

* USE Web Workers for any heavy computation — footprint delta calculations, detection logic on raw trade data.

* BATCH WebSocket messages in a ref buffer; flush to canvas on animation frame, not on every message.

## **8.3 Memory Management**

A chart that runs for hours will accumulate data if not bounded. Mobile devices have limited memory and will terminate the browser tab if heap usage exceeds thresholds. Implement these hard caps:

| // Circular buffer for candle data — prevents unbounded memory growth const MAX\_CANDLES \= 2000; function addCandle(buffer, newCandle) {   buffer.push(newCandle);   if (buffer.length \> MAX\_CANDLES) {     buffer.shift(); // remove oldest — O(n) but acceptable at this scale     // Alternative: use a proper circular buffer (index pointer) for O(1)   }   return buffer; } // Footprint state: keep only visible price levels \+ 20% buffer above/below // Do not store the entire trade history client-side. // The backend is the source of truth — re-request on reconnect. |
| :---- |

# **9\. Error States & Connection UX**

A trading chart that goes silent — no data, no indication of why — is dangerous. A trader might continue making decisions on stale data without knowing the feed dropped. Every connection state must be communicated clearly, without being intrusive when things are working.

| State | Visual Treatment | User Action Available |
| :---- | :---- | :---- |
| Connected (all exchanges) | Green dot in status bar. No other indication. | None needed |
| One exchange lagging (\>500ms) | Yellow dot for that exchange in status bar. Tooltip on hover/tap. | Tap to see which exchange |
| One exchange offline | Red dot for that exchange. Footer shows: "Bybit offline — data from Binance \+ OKX" | None — auto-recovers |
| WebSocket reconnecting | Yellow banner top of chart: "Reconnecting… (attempt 2/5)". Chart shows stale data indicator. | Manual retry button |
| WebSocket offline \> 10s | Red overlay on chart with: "Live data disconnected. Chart shows last known state." Large reconnect button. | Reconnect button |
| All exchanges offline | Red overlay. "No exchange data available." Last known price shown grayed. | Reconnect button |
| Initial loading | Skeleton chart UI. Loading spinner in chart area. "Connecting to exchanges…" | None |

| ⚠️  STALE DATA MUST BE VISUALLY DISTINGUISHED FROM LIVE DATA |
| :---- |
| When the WebSocket is disconnected, the last rendered chart state remains visible. |
| Add a "STALE DATA" banner or gray overlay to prevent traders from acting on old information. |
| This is not optional — it is a trader safety feature. Stale data looks identical to live data without this. |

# **10\. Visual Theme Specification**

Trading UIs are universally dark-themed. Bright white backgrounds cause eye strain in dim trading environments and wash out color-coded data. This is not a stylistic choice — it is an ergonomic and usability standard. Light mode is a future consideration, not an MVP requirement.

| Token | Color (Hex) | Usage |
| :---- | :---- | :---- |
| \--bg-primary | \#0D1B2A | Main app background, chart background |
| \--bg-secondary | \#111F2E | Panel backgrounds, toolbar |
| \--bg-elevated | \#162436 | Cards, dropdowns, tooltips |
| \--bg-row-alt | \#0A1520 | Alternating footprint rows |
| \--text-primary | \#E0E7EF | Main text — price labels, values |
| \--text-secondary | \#8FA8BE | Axis labels, secondary info |
| \--text-muted | \#4A6A82 | Timestamps, low-priority info |
| \--accent-buy | \#26A69A | Buy volume, positive delta |
| \--accent-sell | \#EF5350 | Sell volume, negative delta |
| \--accent-neutral | \#546E7A | Neutral/low imbalance levels |
| \--accent-flag | \#F9A825 | Detection flag markers (ABS, EXH) |
| \--accent-blue | \#1565C0 | UI interactions, selected state, links |
| \--border-subtle | \#1E3448 | Grid lines, panel dividers |
| \--border-strong | \#2E5070 | Active panel borders, focused elements |
| \--candle-up | \#26A69A | Bullish candle body and wick |
| \--candle-down | \#EF5350 | Bearish candle body and wick |
| \--crosshair | \#8FA8BE | Crosshair line color |
| \--current-price | \#F9A825 | Current price line |

# **11\. Anti-Patterns — What Must Never Be Done**

This section documents failure modes that have been observed in real charting projects. Each anti-pattern is banned. If a developer or AI assistant produces code matching any of these patterns, it must be refactored before merging.

| \# | Anti-Pattern | Why It's Wrong | Correct Approach |
| :---- | :---- | :---- | :---- |
| 1 | useState for tick data | Every tick triggers React re-render → 100 re-renders/sec → UI freeze | useRef for all live data; useEffect \+ requestAnimationFrame to render |
| 2 | Recreating chart on data change | Canvas torn down and rebuilt → flash, lost zoom state, poor UX | Initialize once in useEffect(\[\]), update via series.update() API |
| 3 | SVG for chart rendering | 500 candles \= 1500+ DOM nodes → 22 FPS on mid-range phone | HTML5 Canvas via Lightweight Charts — mandatory |
| 4 | setInterval for chart updates | Fights with browser compositor, causes tearing and irregular frame timing | requestAnimationFrame loop — always |
| 5 | height: 100vh on mobile | Browser chrome covers bottom of chart on iOS/Android | height: 100dvh with vh fallback |
| 6 | Fixed pixel chart dimensions | Chart breaks on resize, wrong on different screens | CSS 100% width/height within grid container; ResizeObserver |
| 7 | Missing devicePixelRatio scaling | Custom canvas renders blurry on Retina/HiDPI screens | Scale canvas.width/height by window.devicePixelRatio always |
| 8 | user-scalable=no in viewport meta | Breaks accessibility zoom (WCAG 1.4.4 violation) | Let chart JS handle gestures; never disable browser zoom at meta level |
| 9 | Passive touch listeners on chart | Cannot call preventDefault → browser steals gesture → page scrolls instead of chart panning | { passive: false } on all touch handlers within chart container |
| 10 | Unbounded candle buffer | Memory grows indefinitely → mobile browser tab killed after hours | MAX\_CANDLES \= 2000 circular buffer; paginate historical data |
| 11 | Alert indicators without stale data marker | Trader acts on disconnected data thinking it's live → dangerous | Always show stale data overlay when WebSocket is disconnected |
| 12 | CSS animations on chart elements | Compositor-driven CSS animation fights with Canvas rAF loop | Animate within Canvas drawFrame() only |
| 13 | Hardcoded breakpoints as JS conditionals | Breaks on unusual screen sizes; hard to maintain | CSS media queries \+ ResizeObserver for layout decisions |
| 14 | Touch targets \< 44px on mobile | Retail traders miss controls, get frustrated, abandon | Minimum 44×44px for every interactive element |
| 15 | Re-fetching all candle history on reconnect | Network spike, slow recovery, jarring chart reset | Request only missing candles since last received timestamp |

# **12\. Implementation Checklist — Ship Nothing Without This**

Before any component is considered done, run through this checklist. Every item is binary — pass or fail. No partial credit.

## **12.1 Chart Component**

* Chart initializes in useEffect with empty deps — never recreates on data change

* Chart instance stored in useRef — never in useState

* ResizeObserver correctly resizes chart and redraws on container size change

* devicePixelRatio applied to all custom Canvas overlays

* requestAnimationFrame loop used for all custom rendering

* Data conflation enabled for smooth zoom-out behavior

* Min/max visible candle limits enforced in zoom config

* Auto-scroll to latest candle only when user is at the right edge

## **12.2 Responsive Layout**

* Tested at 320px, 375px, 480px, 768px, 1024px, 1280px, 1920px widths

* Chart uses 100dvh (not 100vh) — tested on iOS Safari with toolbar visible

* Footprint panel shows as bottom sheet on mobile (\< 480px)

* All toolbar buttons have minimum 44×44px touch targets

* Timeframe selector usable with one thumb on smallest viewport

* No horizontal scroll on any breakpoint (chart fills available width)

## **12.3 Gesture & Touch**

* Pinch-to-zoom works on iOS Safari, Chrome for Android, Firefox Android

* Pan gesture does not conflict with page scroll — { passive: false } applied

* Double-tap auto-fits chart — does not trigger page zoom

* Long press activates locked crosshair on mobile

* Mouse wheel zoom works on desktop Chrome, Firefox, Safari

## **12.4 Data Flow**

* WebSocket tick data never calls setState — verified in React DevTools Profiler

* WebSocket reconnects with exponential backoff after drop

* Stale data overlay appears within 2 seconds of WebSocket disconnect

* Memory stable after 1 hour of live data — heap does not grow unbounded

* Candle buffer capped at 2000 entries

## **12.5 Performance**

* Lighthouse Performance score \> 80 on simulated mid-range mobile

* 60 FPS maintained during pan and zoom on desktop Chrome

* \>= 45 FPS during pan and zoom on a 2020-era mid-range Android (Snapdragon 730 class)

* Initial JS bundle \< 250KB gzipped — verified in Vite build output

* No memory leak over 1-hour session — Chrome heap timeline flat

## **12.6 Visual**

* Dark theme applied consistently — no white or bright elements in chart area

* Color tokens from Section 10 used — no hardcoded hex in component files

* Buy volume always teal (\#26A69A), sell always red (\#EF5350) — no exceptions

* Detection flags always gold (\#F9A825) — visually distinct from price data

* All custom canvas text renders crisp on Retina (devicePixelRatio applied)

# **13\. Platform-Specific Pitfalls**

| Platform | Known Issue | Fix |
| :---- | :---- | :---- |
| iOS Safari | 100vh includes browser chrome — bottom of chart hidden | Use 100dvh; test with Safari toolbar visible |
| iOS Safari | Passive touch events cannot preventDefault — gesture theft | Add touch-action: none via CSS on chart element, supplemented by JS |
| iOS Safari | Canvas max size \~16M pixels — very large canvas crashes | Never set canvas width × height \> 16,000,000 physical pixels |
| Android Chrome | devicePixelRatio can be 2.75 or 3 — non-integer scaling | Always use Math.round() when computing physical canvas pixels |
| Firefox Desktop | WebSocket frames may batch differently than Chrome | Parse JSON defensively; handle partial frames |
| Low-end Android | Canvas 2D context creation slow — chart appears blank at first | Show skeleton/spinner; delay chart init by one animation frame |
| iPad (split view) | Viewport width can be \~320px even on a large device | Never assume device type from screen width; use breakpoints only |
| Windows Chrome HiDPI | OS DPI scaling changes devicePixelRatio mid-session | Listen to window resize and update canvas on each change |
| Safari (all) | WebSocket does not support binaryType: "arraybuffer" the same way | Use JSON messages — do not use binary WebSocket frames |

# **14\. Reference Resources**

| Resource | URL / Location | Purpose |
| :---- | :---- | :---- |
| Lightweight Charts v5 Docs | https://tradingview.github.io/lightweight-charts/ | Primary chart library API reference |
| Lightweight Charts GitHub | https://github.com/tradingview/lightweight-charts | Source, issues, examples, release notes |
| Lightweight Charts v5 Multi-pane | GitHub releases — v5.0 release notes | Multi-pane API for volume sub-panel |
| MDN Canvas API | https://developer.mozilla.org/en-US/docs/Web/API/Canvas\_API | Canvas 2D context, drawImage, transforms |
| MDN Touch Events | https://developer.mozilla.org/en-US/docs/Web/API/Touch\_events | touchstart, touchmove, changedTouches spec |
| MDN ResizeObserver | https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver | Correct pattern for responsive canvas sizing |
| Google Web Vitals | https://web.dev/vitals/ | LCP, FID, CLS definitions and measurement |
| WCAG 2.1 Touch Targets | https://www.w3.org/WAI/WCAG21/Understanding/target-size.html | 44×44px minimum touch target requirement |
| CSS dvh unit | https://developer.mozilla.org/en-US/docs/Web/CSS/length/dvh | Dynamic viewport height — mobile browser safe |
| react-use-websocket | https://github.com/robtaussig/react-use-websocket | Optional WS hook library — check before using |
| Chrome DevTools Performance | Built into Chrome browser — F12 → Performance | FPS measurement, frame rendering analysis |
| Safari Web Inspector | Built into Safari → Develop menu | iOS-specific performance and Canvas debugging |

***The chart is the product. Build it with the same precision a trader applies to their entries.***

BTC Order Flow Lite — UI/UX Engineering Reference v1.0  |  All decisions in this document are binding unless formally superseded.