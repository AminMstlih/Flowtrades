/**
 * ChartContainer — Lightweight Charts v5 Canvas Chart
 *
 * Guide Section 1.3 + 5.3:
 * - Chart created ONCE in useEffect([]) — never recreated
 * - Chart instance in useRef — never useState
 * - requestAnimationFrame loop reads from latestDataRef
 * - Data updates via series.update() / series.setData()
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { createChart, CandlestickSeries, HistogramSeries } from 'lightweight-charts';

// Convert backend candle format to LWC format
function toLWCCandle(c) {
  return {
    time: Math.floor((c.start_time || c.ts || 0) / 1000), // ms → seconds
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  };
}

function toLWCVolume(c) {
  const isUp = c.close >= c.open;
  return {
    time: Math.floor((c.start_time || c.ts || 0) / 1000),
    value: c.total_vol || (c.buy_vol + c.sell_vol) || 0,
    color: isUp ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)',
  };
}

// Chart color config — Section 10 tokens
const CHART_OPTIONS = {
  layout: {
    background: { color: '#0D1B2A' },
    textColor: '#8FA8BE',
    fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace",
    fontSize: 11,
  },
  grid: {
    vertLines: { color: '#1E3448' },
    horzLines: { color: '#1E3448' },
  },
  crosshair: {
    mode: 0, // Normal
    vertLine: { color: '#8FA8BE', width: 1, style: 2, labelBackgroundColor: '#1565C0' },
    horzLine: { color: '#8FA8BE', width: 1, style: 2, labelBackgroundColor: '#1565C0' },
  },
  rightPriceScale: {
    borderColor: '#1E3448',
    scaleMargins: { top: 0.1, bottom: 0.2 },
  },
  timeScale: {
    borderColor: '#1E3448',
    timeVisible: true,
    secondsVisible: false,
    rightOffset: 5,
    minBarSpacing: 0.5,
    fixLeftEdge: false,
    fixRightEdge: false,
  },
  handleScroll: { vertTouchDrag: false },
  handleScale: { axisPressedMouseMove: true },
};

const CANDLE_SERIES_OPTIONS = {
  upColor: '#26A69A',
  downColor: '#EF5350',
  borderUpColor: '#26A69A',
  borderDownColor: '#EF5350',
  wickUpColor: '#26A69A',
  wickDownColor: '#EF5350',
};

const VOLUME_SERIES_OPTIONS = {
  priceFormat: { type: 'volume' },
  priceScaleId: 'volume',
};

const MAX_CANDLES = 2000; // Section 8.3 — circular buffer cap

export const ChartContainer = React.memo(function ChartContainer({
  latestDataRef,
  onVisibleRangeChange,
  onChartReady,
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const candleBufferRef = useRef([]); // Track known candles for .update() vs .setData()
  const lastDataTsRef = useRef(0);   // Prevent redundant redraws

  // Initialize chart ONCE — Section 1.3 mandate
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      ...CHART_OPTIONS,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      autoSize: true,
    });

    // Volume pane at bottom — 20% height
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, CANDLE_SERIES_OPTIONS);
    const volumeSeries = chart.addSeries(HistogramSeries, VOLUME_SERIES_OPTIONS);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Notify parent that chart is ready (for footprint sync)
    if (onChartReady) {
      onChartReady(chart, candleSeries);
    }

    // Subscribe to visible range changes for footprint sync
    if (onVisibleRangeChange) {
      chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleRangeChange);
    }

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []); // Empty deps — chart never remounts

  // requestAnimationFrame render loop — Section 5.3
  useEffect(() => {
    let animFrameId;

    function renderLoop() {
      const data = latestDataRef.current;

      if (data && data.ts !== lastDataTsRef.current) {
        lastDataTsRef.current = data.ts;
        const candles = data.candles || [];

        if (candles.length > 0 && candleSeriesRef.current && volumeSeriesRef.current) {
          const lwcCandles = candles.map(toLWCCandle);
          const lwcVolumes = candles.map(toLWCVolume);

          // Apply circular buffer cap
          const cappedCandles = lwcCandles.slice(-MAX_CANDLES);
          const cappedVolumes = lwcVolumes.slice(-MAX_CANDLES);

          // Use setData for full state replacement (backend sends complete state)
          candleSeriesRef.current.setData(cappedCandles);
          volumeSeriesRef.current.setData(cappedVolumes);

          // Auto-scroll to latest if user hasn't panned away
          const timeScale = chartRef.current?.timeScale();
          if (timeScale) {
            const visibleRange = timeScale.getVisibleLogicalRange();
            if (visibleRange) {
              const rightEdge = cappedCandles.length - 1;
              const visibleRight = visibleRange.to;
              // Only auto-scroll if user is near the right edge
              if (rightEdge - visibleRight < 3) {
                timeScale.scrollToPosition(5, false);
              }
            }
          }
        }
      }

      animFrameId = requestAnimationFrame(renderLoop);
    }

    animFrameId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animFrameId);
  }, []); // Self-sustaining loop

  return (
    <div
      ref={containerRef}
      className="chart-canvas-container"
      style={{ width: '100%', height: '100%' }}
    />
  );
});
