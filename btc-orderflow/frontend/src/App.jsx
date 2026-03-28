import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useFootprint } from './hooks/useFootprint';
import { Header } from './components/Header';
import { FootprintTable } from './components/FootprintTable';
import { InteractiveViewport } from './components/InteractiveViewport';
import { PriceScale } from './components/PriceScale';
import { DeltaPane } from './components/DeltaPane';
import { snapTick } from './utils/tickSteps';
import { binCeilPrice, binFloorPrice, binRoundPrice, unbinPrice } from './utils/priceBinning';

// Connect to the FastAPI WebSocket broadcast
const WS_URL = 'ws://localhost:8000/ws/footprint';

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

  const { state, isConnected } = useFootprint(WS_URL);

  // Tick Size in USD (Semantic Scale)
  const [tickSize, setTickSize] = useState(1.0);
  const setTickSizeSnapped = useCallback(
    (rawTick) => setTickSize(snapTick(Number(rawTick), 'nearest')),
    []
  );

  // Viewport Transform (Shared with Axis)
  const [transform, setTransform] = useState({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [userHasPanned, setUserHasPanned] = useState(false);

  // Auto-fit mode - when ON, chart auto-sizes to fit all candles
  const [autoFit, setAutoFit] = useState(false);

  const orderedCandles = useMemo(() => {
    const candles = state.candles || [];
    if (candles.length < 2) return candles;
    const first = candles[0];
    const last = candles[candles.length - 1];
    const firstTs = first.ts ?? first.time ?? first.timestamp ?? first.open_time ?? first.start_ts;
    const lastTs = last.ts ?? last.time ?? last.timestamp ?? last.open_time ?? last.start_ts;
    if (typeof firstTs === 'number' && typeof lastTs === 'number' && firstTs > lastTs) {
      return [...candles].reverse();
    }
    return candles;
  }, [state.candles]);

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

    if (typeof state.last_price === 'number' && state.last_price > 0) {
      uniqueBins.add(binFloorPrice(state.last_price, tickSize));
    }

    if (uniqueBins.size === 0) return { prices: [], minBin: 0, maxBin: -1 };

    const maxBin = Math.max(...Array.from(uniqueBins));
    const minBin = Math.min(...Array.from(uniqueBins));

    const binsCount = maxBin - minBin + 1;
    if (binsCount <= 0) return { prices: [], minBin: 0, maxBin: -1 };
    if (binsCount > 6000) {
      // Safety cap: prevents pathological tickSize values from creating huge DOM.
      // (Auto-fit + snapping should make this unlikely.)
      return { prices: [], minBin: 0, maxBin: -1 };
    }

    const prices = [];
    for (let bin = maxBin; bin >= minBin; bin--) {
      prices.push(unbinPrice(bin, tickSize));
    }

    return { prices, minBin, maxBin };
  }, [orderedCandles, state.last_price, tickSize]);

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
    const currentBin = typeof state.last_price === 'number' && state.last_price > 0 ? binFloorPrice(state.last_price, tickSize) : null;
    const targetBin = autoFit && fitCenterBin !== null ? fitCenterBin : currentBin;
    if (targetBin === null) return 0;
    if (targetBin < priceLadder.minBin || targetBin > priceLadder.maxBin) return 0;
    const priceIndex = priceLadder.maxBin - targetBin;
    const priceY = HEADER_HEIGHT + priceIndex * CELL_HEIGHT + CELL_HEIGHT / 2;
    return viewportSize.height / 2 - priceY;
  }, [autoFit, fitCenterBin, state.last_price, prices, tickSize, viewportSize.height, priceLadder.minBin, priceLadder.maxBin]);

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
    if (typeof state.last_price !== 'number' || prices.length === 0 || orderedCandles.length === 0) return null;
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return null;
    const currentBin = state.last_price > 0 ? binFloorPrice(state.last_price, tickSize) : null;
    if (currentBin === null || currentBin < priceLadder.minBin || currentBin > priceLadder.maxBin) return null;
    const priceIndex = priceLadder.maxBin - currentBin;
    const y = transform.y + (HEADER_HEIGHT + (priceIndex + 0.5) * CELL_HEIGHT) * transform.scaleY;
    if (y < 0 || y > viewportSize.height) return null;

    const activeCandleX = transform.x + (orderedCandles.length - 0.5) * CELL_WIDTH * transform.scaleX;
    const startX = Math.max(0, Math.min(activeCandleX, viewportSize.width));
    const width = Math.max(0, viewportSize.width - startX);
    if (width <= 0) return null;
    return { top: y, left: startX, width };
  }, [state.last_price, prices, orderedCandles.length, viewportSize.width, viewportSize.height, tickSize, transform, priceLadder.minBin, priceLadder.maxBin]);

  return (
    <div className="dashboard">
      <Header
        state={state}
        isConnected={isConnected}
        tickSize={tickSize}
        setTickSize={setTickSizeSnapped}
        autoFit={autoFit}
        onAutoFitToggle={handleAutoFitToggle}
      />

      <div className="main-viewport-wrapper">
        <div className="chart-area">
          <InteractiveViewport
            transform={transform}
            onTransformChange={setTransform}
            onResize={setViewportSize}
            onUserPan={handleViewportUserInteract}
          >
            <FootprintTable
              candles={orderedCandles}
              prices={prices}
              tickSize={tickSize}
              lastPrice={state.last_price}
            />
          </InteractiveViewport>
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
            lastPrice={state.last_price}
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
    </div>
  );
}

export default App;
