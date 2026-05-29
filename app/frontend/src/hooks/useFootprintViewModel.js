import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { snapTick, getTickStepsForPrice, getRecommendedTick } from '../utils/tickSteps';
import { binCeilPrice, binFloorPrice, binRoundPrice, unbinPrice } from '../utils/priceBinning';
import { inferInstrument } from '../utils/instrument';
import MyWorker from '../core/data/aggregation.worker.js?worker';

const CELL_HEIGHT = 24;
const HEADER_HEIGHT = 32;
const CELL_WIDTH = 140;
const EPSILON = 1e-6;

export function useFootprintViewModel({
  chartData,
  tickSize,
  autoFit,
  tickMode,
  viewportSize,
  visiblePriceRange,
  orderedCandles,
  transform,
  userHasPanned,
  setTickSize,
  setTransform,
  symbol,
}) {
  const instrument = useMemo(
    () => inferInstrument({ symbol, lastPrice: chartData.last_price }),
    [symbol, chartData.last_price],
  );

  const tickOptions = useMemo(
    () => getTickStepsForPrice(chartData.last_price || 1),
    [chartData.last_price],
  );

  const setTickSizeSnapped = useCallback((rawTick) => {
    setTickSize(snapTick(Number(rawTick), 'nearest'));
  }, [setTickSize]);

  // Persistent Web Worker reference & sequence tracker for race-condition mitigation
  const workerRef = useRef(null);
  const lastProcessedSeqId = useRef(0);

  // Aggregated data state computed asynchronously in Web Worker
  const [aggData, setAggData] = useState({
    aggCandles: [],
    maxVolumeGlobal: 1,
    priceLadder: { prices: [], minBin: 0, maxBin: -1 }
  });

  // Setup Web Worker thread on component mount
  useEffect(() => {
    const worker = new MyWorker();
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { seqId, status, aggCandles, maxVolumeGlobal, priceLadder, error } = e.data;
      if (status === 'error') {
        console.error('[Worker] High-frequency aggregation failed:', error);
        return;
      }

      // Enforce strict sequence ID monotonicity (discard stale race responses)
      if (seqId < lastProcessedSeqId.current) {
        return;
      }
      lastProcessedSeqId.current = seqId;

      setAggData({
        aggCandles,
        maxVolumeGlobal,
        priceLadder
      });
    };

    return () => {
      worker.terminate();
    };
  }, []);

  // Stream parameters to the background Web Worker whenever state changes
  useEffect(() => {
    if (!workerRef.current || !orderedCandles) return;

    const seqId = Date.now();
    workerRef.current.postMessage({
      seqId,
      candles: orderedCandles,
      tickSize,
      lastPrice: chartData.last_price
    });
  }, [orderedCandles, tickSize, chartData.last_price]);

  const { aggCandles, maxVolumeGlobal, priceLadder } = aggData;

  const candleRange = useMemo(() => {
    const highs = orderedCandles.map((c) => c.high).filter((v) => typeof v === 'number');
    const lows = orderedCandles.map((c) => c.low).filter((v) => typeof v === 'number');
    if (highs.length === 0 || lows.length === 0) return null;
    const high = Math.max(...highs);
    const low = Math.min(...lows);
    return { high, low, range: Math.max(high - low, 0), mid: (high + low) / 2 };
  }, [orderedCandles]);

  const fitCenterBin = useMemo(() => {
    if (!candleRange) return null;
    return binRoundPrice(candleRange.mid, tickSize);
  }, [candleRange, tickSize]);

  const autoCenterY = useMemo(() => {
    if (priceLadder.prices.length === 0 || viewportSize.height <= 0) return 0;
    const currentBin = typeof chartData.last_price === 'number' && chartData.last_price > 0
      ? binFloorPrice(chartData.last_price, tickSize)
      : null;
    const targetBin = autoFit && fitCenterBin !== null ? fitCenterBin : currentBin;
    if (targetBin === null) return 0;
    if (targetBin < priceLadder.minBin || targetBin > priceLadder.maxBin) return 0;
    const priceIndex = priceLadder.maxBin - targetBin;
    const priceY = HEADER_HEIGHT + priceIndex * CELL_HEIGHT + CELL_HEIGHT / 2;
    return viewportSize.height / 2 - priceY;
  }, [autoFit, fitCenterBin, chartData.last_price, tickSize, viewportSize.height, priceLadder]);

  const currentPriceLine = useMemo(() => {
    if (typeof chartData.last_price !== 'number' || priceLadder.prices.length === 0 || orderedCandles.length === 0) return null;
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return null;
    const currentBin = chartData.last_price > 0 ? binFloorPrice(chartData.last_price, tickSize) : null;
    if (currentBin === null || currentBin < priceLadder.minBin || currentBin > priceLadder.maxBin) return null;
    const priceIndex = priceLadder.maxBin - currentBin;
    const y = transform.y + (HEADER_HEIGHT + (priceIndex + 0.5) * CELL_HEIGHT) * transform.scaleY;
    if (y < 0 || y > viewportSize.height) return null;

    return { top: y, left: 0, width: viewportSize.width };
  }, [chartData.last_price, orderedCandles.length, viewportSize.width, viewportSize.height, tickSize, transform, priceLadder]);

  const maybeAutoFitTick = useCallback(() => {
    if (!autoFit || viewportSize.height <= 0) return;
    
    let range = 0;
    if (visiblePriceRange && typeof visiblePriceRange.top === 'number' && typeof visiblePriceRange.bottom === 'number') {
      range = Math.max(0, visiblePriceRange.top - visiblePriceRange.bottom);
    } else if (candleRange) {
      range = candleRange.range;
    }
    
    if (range <= 0) return;

    // Target a highly readable, premium 38px average cell height in auto-fit mode.
    // This scales tick sizes up to merge loose intermediate price ticks, resulting in taller, 
    // solid columns and bolder, highly readable numbers, completely auto-adjusting to different screens.
    const targetCellHeight = 38;
    const rowsAvailable = Math.max(2, Math.floor((viewportSize.height - HEADER_HEIGHT) / targetCellHeight));
    const rowsForRange = Math.max(1, rowsAvailable - 2);
    const requiredTick = range / rowsForRange;
    const nextTick = snapTick(requiredTick, 'nearest');
    if (nextTick !== tickSize) setTickSize(nextTick);
  }, [autoFit, candleRange, visiblePriceRange, viewportSize.height, tickSize, setTickSize]);

  const syncAutoTick = useCallback(() => {
    if (tickMode !== 'auto') return;
    const nextTick = getRecommendedTick(chartData.last_price);
    if (nextTick && nextTick !== tickSize) {
      setTickSize(nextTick);
    }
  }, [tickMode, chartData.last_price, tickSize, setTickSize]);

  const handleScaleDrag = useCallback((dy) => {
    setTransform((prev) => {
      const nextScaleY = Math.min(Math.max(0.4, prev.scaleY * Math.exp(-dy * 0.008)), 4);
      return { ...prev, scaleY: nextScaleY };
    });
  }, [setTransform]);

  const handleAutoFitToggle = useCallback((setAutoFit, setTickMode, setUserHasPanned) => {
    setAutoFit((prev) => {
      const next = !prev;
      if (next) {
        setTickMode('auto');
        setUserHasPanned(false);
        setTransform((prevTransform) => ({ ...prevTransform, scaleY: 1 }));
      } else {
        setTickMode('manual');
      }
      return next;
    });
  }, [setTransform]);

  const snapViewportToData = useCallback(() => {
    if (!autoFit || userHasPanned) return null;
    const targetX = Math.min(0, viewportSize.width - orderedCandles.length * CELL_WIDTH);
    const nextX = Number.isFinite(targetX) ? targetX : 0;
    const nextY = autoCenterY;
    return { nextX, nextY };
  }, [autoFit, userHasPanned, viewportSize.width, orderedCandles.length, autoCenterY]);

  return {
    instrument,
    tickOptions,
    setTickSizeSnapped,
    aggCandles,
    maxVolumeGlobal,
    priceLadder,
    candleRange,
    fitCenterBin,
    autoCenterY,
    currentPriceLine,
    maybeAutoFitTick,
    syncAutoTick,
    handleScaleDrag,
    handleAutoFitToggle,
    snapViewportToData,
  };
}
