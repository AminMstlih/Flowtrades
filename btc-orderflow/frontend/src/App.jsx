import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useFootprint } from './hooks/useFootprint';
import { Header } from './components/Header';
import { FootprintTable } from './components/FootprintTable';
import { FootprintCanvas } from './components/FootprintCanvas';
import { InteractiveViewport } from './components/InteractiveViewport';
import { PriceScale } from './components/PriceScale';
import { DeltaPane } from './components/DeltaPane';
import { snapTick } from './utils/tickSteps';
import { binCeilPrice, binFloorPrice, binRoundPrice, unbinPrice } from './utils/priceBinning';
import { aggregateCandles } from './utils/aggregateCandles';
import { perfMonitor } from './utils/perfMonitor';

// Connect to the FastAPI WebSocket broadcast
// Dynamic WebSocket URL detection
const getWsUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    // For local development: if frontend is on 5173, assume backend is on 8000
    const wsHost = host.includes(':5173') ? host.replace(':5173', ':8000') : host;
    return `${protocol}//${wsHost}/ws/footprint`;
};
const WS_URL_BASE = getWsUrl();

const CELL_HEIGHT = 24;
const CELL_WIDTH = 140;
const HEADER_HEIGHT = 32;
const EPSILON = 1e-6;

function App() {
  const handleViewportUserInteract = useCallback((isInteracting) => {
    if (!isInteracting) return;
    setUserHasPanned(true);
    setAutoFit(false);
  }, []);

  const [tickSize, setTickSize] = useState(1.0);
  const [autoFit, setAutoFit] = useState(true);
  const [renderMode, setRenderMode] = useState('dom');
  const [timeframeWindow, setTimeframeWindow] = useState(5);
  const [showBadges, setShowBadges] = useState(true);

  // Hook handles connection and data pruning behind the scenes
  // Returns a mutable ref containing the latest parsed JSON (to avoid render spam)
  const wsUrl = `${WS_URL_BASE}?window=${timeframeWindow}`;
  const { latestDataRef, status } = useFootprint(wsUrl);
  
  // Processed data for rendering - updated via rAF loop
  const [chartData, setChartData] = useState({
    candles: [],
    last_price: 0,
    window_sec: 300,
    total_trades: 0,
    total_candles: 0,
    active_buckets: 0,
    exchanges: []
  });

  const setTickSizeSnapped = useCallback(
    (rawTick) => setTickSize(snapTick(Number(rawTick), 'nearest')),
    []
  );

  // Viewport Transform (Shared with Axis)
  const [transform, setTransform] = useState({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [userHasPanned, setUserHasPanned] = useState(false);
  
  // CRITICAL: requestAnimationFrame render loop (Guide Section 5.3)
  // Reads from latestDataRef and updates chartData state in batch
  useEffect(() => {
    let animFrameId;
    
    function renderLoop() {
      // Track frame rate (Guide Section 8)
      perfMonitor.tick();
      
      const newData = latestDataRef.current;
      if (newData) {
        // Consume data from ref and update state ONCE per frame
        setChartData({
          candles: newData.candles,
          last_price: newData.last_price,
          window_sec: newData.window_sec,
          total_trades: newData.total_trades,
          total_candles: newData.total_candles,
          active_buckets: newData.active_buckets,
          exchanges: newData.exchanges
        });
        // Clear ref to prevent redundant updates
        latestDataRef.current = null;
      }
      animFrameId = requestAnimationFrame(renderLoop);
    }
    
    // Start the render loop
    animFrameId = requestAnimationFrame(renderLoop);
    
    // Cleanup on unmount
    return () => cancelAnimationFrame(animFrameId);
  }, [latestDataRef]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Press 'R' to toggle render mode (DOM vs Canvas)
      if (e.key === 'r' || e.key === 'R') {
        setRenderMode(prev => prev === 'dom' ? 'canvas' : 'dom');
        console.log(`[App] Render mode: ${renderMode === 'dom' ? 'canvas' : 'dom'}`);
      }
      
      // Press 'P' to log performance report
      if (e.key === 'p' || e.key === 'P') {
        perfMonitor.logReport();
      }
      // Press 'B' to toggle badges
      if (e.key === 'b' || e.key === 'B') {
        setShowBadges(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [renderMode]);

  const orderedCandles = useMemo(() => {
    const candles = chartData.candles || [];
    if (candles.length < 2) return candles;
    const first = candles[0];
    const last = candles[candles.length - 1];
    const firstTs = first.ts ?? first.time ?? first.timestamp ?? first.open_time ?? first.start_ts;
    const lastTs = last.ts ?? last.time ?? last.timestamp ?? last.open_time ?? last.start_ts;
    if (typeof firstTs === 'number' && typeof lastTs === 'number' && firstTs > lastTs) {
      return [...candles].reverse();
    }
    return candles;
  }, [chartData.candles]);

  const { aggCandles, maxVolumeGlobal } = useMemo(() => {
    return aggregateCandles(orderedCandles, tickSize);
  }, [orderedCandles, tickSize]);

  // Compute the global price ladder across all visible candles.
  // Uses integer binning to avoid float/index drift across devices.
  const priceLadder = useMemo(() => {
    if (!orderedCandles || orderedCandles.length === 0) {
      return { prices: [], minBin: 0, maxBin: -1 };
    }

    const uniqueBins = new Set();
    orderedCandles.forEach(c => {
      if (typeof c.high === 'number') uniqueBins.add(binCeilPrice(c.high, tickSize));
      if (typeof c.low === 'number') uniqueBins.add(binFloorPrice(c.low, tickSize));
      if (c.buckets) {
        c.buckets.forEach(b => {
          uniqueBins.add(binFloorPrice(b.price, tickSize));
        });
      }
    });

    if (typeof chartData.last_price === 'number' && chartData.last_price > 0) {
      uniqueBins.add(binFloorPrice(chartData.last_price, tickSize));
    }

    if (uniqueBins.size === 0) return { prices: [], minBin: 0, maxBin: -1 };

    // Pad the top and bottom with 200 bins allowing infinite scroll into empty space
    const PADDING_BINS = 200;
    const maxBin = Math.max(...Array.from(uniqueBins)) + PADDING_BINS;
    const minBin = Math.min(...Array.from(uniqueBins)) - PADDING_BINS;

    const binsCount = maxBin - minBin + 1;
    if (binsCount <= 0) return { prices: [], minBin: 0, maxBin: -1 };
    if (binsCount > 10000) {
      // Safety cap: prevents pathological tickSize values from creating huge DOM.
      // (Auto-fit + snapping should make this unlikely.)
      return { prices: [], minBin: 0, maxBin: -1 };
    }

    const prices = [];
    for (let bin = maxBin; bin >= minBin; bin--) {
      prices.push(unbinPrice(bin, tickSize));
    }

    return { prices, minBin, maxBin };
  }, [orderedCandles, chartData.last_price, tickSize]);

  const prices = priceLadder.prices;

  const candleRange = useMemo(() => {
    const highs = orderedCandles.map(c => c.high).filter(v => typeof v === 'number');
    const lows = orderedCandles.map(c => c.low).filter(v => typeof v === 'number');
    if (highs.length === 0 || lows.length === 0) return null;
    const high = Math.max(...highs);
    const low = Math.min(...lows);
    return {
      high,
      low,
      range: Math.max(high - low, 0),
      mid: (high + low) / 2,
    };
  }, [orderedCandles]);

  useEffect(() => {
    if (!autoFit || !candleRange || viewportSize.height <= 0) return;
    const rowsAvailable = Math.max(2, Math.floor((viewportSize.height - HEADER_HEIGHT) / CELL_HEIGHT));
    const rowsForRange = Math.max(1, rowsAvailable - 2);
    const requiredTick = candleRange.range / rowsForRange;
    const nextTick = snapTick(requiredTick, 'fit');
    if (nextTick !== tickSize) setTickSize(nextTick);
  }, [autoFit, candleRange, viewportSize.height, tickSize]);

  const fitCenterBin = useMemo(() => {
    if (!candleRange) return null;
    return binRoundPrice(candleRange.mid, tickSize);
  }, [candleRange, tickSize]);

  const autoCenterY = useMemo(() => {
    if (prices.length === 0 || viewportSize.height <= 0) return 0;
    const currentBin = typeof chartData.last_price === 'number' && chartData.last_price > 0 ? binFloorPrice(chartData.last_price, tickSize) : null;
    const targetBin = autoFit && fitCenterBin !== null ? fitCenterBin : currentBin;
    if (targetBin === null) return 0;
    if (targetBin < priceLadder.minBin || targetBin > priceLadder.maxBin) return 0;
    const priceIndex = priceLadder.maxBin - targetBin;
    const priceY = HEADER_HEIGHT + priceIndex * CELL_HEIGHT + CELL_HEIGHT / 2;
    return viewportSize.height / 2 - priceY;
  }, [autoFit, fitCenterBin, chartData.last_price, prices, tickSize, viewportSize.height, priceLadder.minBin, priceLadder.maxBin]);

  useEffect(() => {
    if (!autoFit || userHasPanned) return;
    const targetX = Math.min(0, viewportSize.width - orderedCandles.length * CELL_WIDTH);
    const nextX = Number.isFinite(targetX) ? targetX : 0;
    const nextY = autoCenterY;
    setTransform(prev => {
      if (
        Math.abs(prev.x - nextX) < EPSILON &&
        Math.abs(prev.y - nextY) < EPSILON &&
        Math.abs(prev.scaleX - 1) < EPSILON &&
        Math.abs(prev.scaleY - 1) < EPSILON
      ) {
        return prev;
      }
      return { ...prev, x: nextX, y: nextY, scaleX: 1, scaleY: 1 };
    });
  }, [autoFit, userHasPanned, viewportSize.width, orderedCandles.length, autoCenterY]);

  // Handle Dragging the Price Column to Scale Tick Size
  // Also exits auto-fit mode when user drags
  const handleScaleDrag = useCallback((dy) => {
    setAutoFit(false); // Exit auto-fit on manual drag
    const sensitivity = 0.008;
    setTickSize(prev => {
      // Exponential mapping avoids sudden jumps to tiny/huge ticks.
      const raw = prev * Math.exp(-dy * sensitivity);
      return snapTick(raw, 'nearest');
    });
  }, []);

  // Toggle auto-fit mode (double-click on price column)
  const handleAutoFitToggle = useCallback(() => {
    setAutoFit(prev => !prev);
    setUserHasPanned(false);
  }, []);

  const currentPriceLine = useMemo(() => {
    if (typeof chartData.last_price !== 'number' || prices.length === 0 || orderedCandles.length === 0) return null;
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return null;
    const currentBin = chartData.last_price > 0 ? binFloorPrice(chartData.last_price, tickSize) : null;
    if (currentBin === null || currentBin < priceLadder.minBin || currentBin > priceLadder.maxBin) return null;
    const priceIndex = priceLadder.maxBin - currentBin;
    const y = transform.y + (HEADER_HEIGHT + (priceIndex + 0.5) * CELL_HEIGHT) * transform.scaleY;
    if (y < 0 || y > viewportSize.height) return null;

    const activeCandleX = transform.x + (orderedCandles.length - 0.5) * CELL_WIDTH * transform.scaleX;
    const startX = Math.max(0, Math.min(activeCandleX, viewportSize.width));
    const width = Math.max(0, viewportSize.width - startX);
    if (width <= 0) return null;
    return { top: y, left: startX, width };
  }, [chartData.last_price, prices, orderedCandles.length, viewportSize.width, viewportSize.height, tickSize, transform, priceLadder.minBin, priceLadder.maxBin]);

  return (
    <div className="dashboard">
        <Header
          state={chartData}
          status={status}
          tickSize={tickSize}
          setTickSize={setTickSizeSnapped}
          autoFit={autoFit}
          onAutoFitToggle={handleAutoFitToggle}
          timeframeWindow={timeframeWindow}
          setTimeframeWindow={setTimeframeWindow}
          showBadges={showBadges}
          setShowBadges={setShowBadges}
        />

      <div className="main-viewport-wrapper">
        <div className="chart-area">
          <InteractiveViewport
            transform={transform}
            onTransformChange={setTransform}
            onResize={setViewportSize}
            onUserPan={handleViewportUserInteract}
          >
            {renderMode === 'canvas' ? null : (
              <FootprintTable 
                candles={orderedCandles}
                aggCandles={aggCandles}
                maxVolumeGlobal={maxVolumeGlobal}
                prices={prices}
                tickSize={tickSize}
                lastPrice={chartData.last_price}
                showBadges={showBadges}
              />
            )}
          </InteractiveViewport>
          
          {/* Canvas overlay - sits ON TOP of viewport, not inside transformed content */}
          {renderMode === 'canvas' && (
            <FootprintCanvas
              candles={orderedCandles}
              aggCandles={aggCandles}
              prices={prices}
              tickSize={tickSize}
              lastPrice={chartData.last_price}
              transform={transform}
              showBadges={showBadges}
            />
          )}
          {currentPriceLine && (
            <div
              className="current-price-segment"
              style={{
                top: `${currentPriceLine.top}px`,
                left: `${currentPriceLine.left}px`,
                width: `${currentPriceLine.width}px`,
              }}
            />
          )}
        </div>

        <div className="price-axis-sidebar">
          <PriceScale
            prices={prices}
            tickSize={tickSize}
            lastPrice={chartData.last_price}
            transformY={transform.y}
            scaleY={transform.scaleY}
            onScaleDrag={handleScaleDrag}
            onAutoFitToggle={handleAutoFitToggle}
          />
        </div>
      </div>

      {/* Fixed Delta Pane - TradingView style indicator panel at bottom */}
      <div className="fixed-bottom-panels">
        <DeltaPane
          candles={orderedCandles}
          scrollX={transform.x}
          scaleX={transform.scaleX}
        />
      </div>

      {/* Loading overlay for initial data */}
      {prices.length === 0 && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'var(--text-secondary)',
          textAlign: 'center',
          background: 'var(--bg-elevated)',
          padding: '24px',
          borderRadius: '12px',
          zIndex: 1000
        }}>
          <div style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Waiting for Market Data...</div>
          <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>OKX Terminal connected. Latching onto live BTC tape.</div>
        </div>
      )}
    </div>
  );
}

export default App;
