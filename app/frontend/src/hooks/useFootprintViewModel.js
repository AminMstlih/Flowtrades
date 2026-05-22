import { useMemo, useCallback } from 'react';
import { snapTick, getTickStepsForPrice, getRecommendedTick } from '../utils/tickSteps';
import { binCeilPrice, binFloorPrice, binRoundPrice, unbinPrice } from '../utils/priceBinning';
import { aggregateCandles } from '../utils/aggregateCandles';
import { inferInstrument } from '../utils/instrument';

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
  orderedCandles,
  transform,
  userHasPanned,
  setTickSize,
  setTransform,
}) {
  const instrument = useMemo(
    () => inferInstrument({ lastPrice: chartData.last_price }),
    [chartData.last_price],
  );

  const tickOptions = useMemo(
    () => getTickStepsForPrice(chartData.last_price || 1),
    [chartData.last_price],
  );

  const setTickSizeSnapped = useCallback((rawTick) => {
    setTickSize(snapTick(Number(rawTick), 'nearest'));
  }, [setTickSize]);

  const { aggCandles, maxVolumeGlobal } = useMemo(() => {
    return aggregateCandles(orderedCandles, tickSize);
  }, [orderedCandles, tickSize]);

  const priceLadder = useMemo(() => {
    if (!orderedCandles || orderedCandles.length === 0) {
      return { prices: [], minBin: 0, maxBin: -1 };
    }

    const uniqueBins = new Set();
    orderedCandles.forEach((c) => {
      if (typeof c.high === 'number') uniqueBins.add(binCeilPrice(c.high, tickSize));
      if (typeof c.low === 'number') uniqueBins.add(binFloorPrice(c.low, tickSize));
      if (c.buckets) {
        c.buckets.forEach((b) => {
          const rawPrice = Number(b.price);
          if (!Number.isFinite(rawPrice)) return;
          uniqueBins.add(binFloorPrice(rawPrice, tickSize));
        });
      }
    });

    if (typeof chartData.last_price === 'number' && chartData.last_price > 0) {
      uniqueBins.add(binFloorPrice(chartData.last_price, tickSize));
    }

    if (uniqueBins.size === 0) return { prices: [], minBin: 0, maxBin: -1 };

    const rawMax = Math.max(...Array.from(uniqueBins));
    const rawMin = Math.min(...Array.from(uniqueBins));
    const dataRangeBins = Math.max(rawMax - rawMin, 1);

    // Padding is proportional to the actual data range, not a hardcoded 200.
    // 15% on each side, capped at 30 bins so the ladder never grows absurdly large.
    const paddingBins = Math.min(30, Math.ceil(dataRangeBins * 0.15));
    const maxBin = rawMax + paddingBins;
    const minBin = rawMin - paddingBins;

    const binsCount = maxBin - minBin + 1;
    if (binsCount <= 0 || binsCount > 10000) return { prices: [], minBin: 0, maxBin: -1 };

    const prices = [];
    for (let bin = maxBin; bin >= minBin; bin -= 1) {
      prices.push(unbinPrice(bin, tickSize));
    }

    return { prices, minBin, maxBin };
  }, [orderedCandles, chartData.last_price, tickSize]);

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
    if (!autoFit || !candleRange || viewportSize.height <= 0) return;
    const rowsAvailable = Math.max(2, Math.floor((viewportSize.height - HEADER_HEIGHT) / CELL_HEIGHT));
    const rowsForRange = Math.max(1, rowsAvailable - 2);
    const requiredTick = candleRange.range / rowsForRange;
    const nextTick = snapTick(requiredTick, 'fit');
    if (nextTick !== tickSize) setTickSize(nextTick);
  }, [autoFit, candleRange, viewportSize.height, tickSize, setTickSize]);

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
