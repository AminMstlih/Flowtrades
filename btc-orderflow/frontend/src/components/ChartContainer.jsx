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
import { FootprintPrimitive } from '../plugins/FootprintPrimitive';

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
  const delta = c.delta || 0;
  const isUp = delta >= 0;
  return {
    time: Math.floor((c.start_time || c.ts || 0) / 1000),
    value: Math.abs(delta) || 0.001, // Absolute height ensures bars visibly extend upwards and aren't clipped by the bottom border
    color: isUp ? 'rgba(38, 166, 154, 0.9)' : 'rgba(239, 83, 80, 0.9)',
  };
}

// Chart color config — Section 10 tokens
const VOLUME_SERIES_OPTIONS = {
  color: '#26A69A',
  priceScaleId: '', // Default right axis for its own isolated chart
};

const CHART_OPTIONS = {
  layout: {
    background: { type: 'solid', color: 'transparent' },
    textColor: '#8FA8BE',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: 11,
  },
  grid: {
    vertLines: { color: '#1E3448', style: 1 },
    horzLines: { color: '#1E3448', style: 1 },
  },
  crosshair: {
    mode: 1, // Magnet
    vertLine: {
      color: '#8FA8BE',
      width: 1,
      style: 3,
      labelBackgroundColor: '#162436',
    },
    horzLine: {
      color: '#8FA8BE',
      width: 1,
      style: 3,
      labelBackgroundColor: '#162436',
    },
  },
  rightPriceScale: {
    borderColor: '#1E3448',
    scaleMargins: { top: 0.1, bottom: 0.1 },
  },
  timeScale: {
    borderColor: '#1E3448',
    timeVisible: true,
    secondsVisible: false,
    rightOffset: 5,
    minBarSpacing: 0.5,
    barSpacing: 50, // Widen default spacing to fit footprint text
    fixLeftEdge: false,
    fixRightEdge: false,
  },
  handleScroll: { vertTouchDrag: false },
};

const DELTA_CHART_OPTIONS = {
  ...CHART_OPTIONS,
  rightPriceScale: {
    borderColor: '#1E3448',
    scaleMargins: { top: 0.1, bottom: 0.0 }, // Delta uses full height from 10% below top
  },
  timeScale: {
    ...CHART_OPTIONS.timeScale,
    visible: true, // Show time scale on the bottom chart only
  }
};

const CANDLE_SERIES_OPTIONS = {
  upColor: 'rgba(38, 166, 154, 0.15)',    // Soft body — footprint text dominates
  downColor: 'rgba(239, 83, 80, 0.15)',   // Soft body — footprint text dominates
  borderUpColor: '#26A69A',
  borderDownColor: '#EF5350',
  wickUpColor: '#26A69A',
  wickDownColor: '#EF5350',
};

const MAX_CANDLES = 2000; // Section 8.3 — circular buffer cap

export const ChartContainer = React.memo(function ChartContainer({
  latestDataRef,
  onVisibleRangeChange,
  onChartReady,
}) {
  const containerRef = useRef(null);
  const deltaContainerRef = useRef(null);
  
  const chartRef = useRef(null);
  const deltaChartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const footprintRef = useRef(null);
  const lastDataTsRef = useRef(0);   // Prevent redundant redraws

  // Resize handler for BOTH charts
  useEffect(() => {
    if (!containerRef.current || !deltaContainerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (entry.target === containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({ width: entry.contentRect.width, height: entry.contentRect.height });
        }
        if (entry.target === deltaContainerRef.current && deltaChartRef.current) {
          deltaChartRef.current.applyOptions({ width: entry.contentRect.width, height: entry.contentRect.height });
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    resizeObserver.observe(deltaContainerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  // Main Chart + Delta Chart Initialization
  useEffect(() => {
    if (!containerRef.current || !deltaContainerRef.current) return;

    // 1. Main Candlestick Chart
    const mainOptions = { ...CHART_OPTIONS, timeScale: { ...CHART_OPTIONS.timeScale, visible: false } };
    const chart = createChart(containerRef.current, mainOptions);
    const candleSeries = chart.addSeries(CandlestickSeries, CANDLE_SERIES_OPTIONS);
    
    // Attach Custom Footprint Series overlay
    const footprintPrimitive = new FootprintPrimitive();
    candleSeries.attachPrimitive(footprintPrimitive);

    // 2. Auxiliary Delta Chart (Bottom pane)
    const deltaChart = createChart(deltaContainerRef.current, DELTA_CHART_OPTIONS);
    const volumeSeries = deltaChart.addSeries(HistogramSeries, VOLUME_SERIES_OPTIONS);

    // 3. Bidirectional TimeScale Sync (tradingview multi-pane technique)
    let isSyncing = false;
    const syncTimeScale = (source, target) => {
      source.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
        if (isSyncing || !logicalRange) return;
        isSyncing = true;
        target.timeScale().setVisibleLogicalRange(logicalRange);
        isSyncing = false;
      });
    };
    syncTimeScale(chart, deltaChart);
    syncTimeScale(deltaChart, chart);

    chartRef.current = chart;
    deltaChartRef.current = deltaChart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    footprintRef.current = footprintPrimitive;

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
        const candlesRaw = data.candles || [];

        if (candlesRaw.length > 0 && candleSeriesRef.current && volumeSeriesRef.current) {
          const parsedCandles = candlesRaw.map(toLWCCandle);
          const volumes = candlesRaw.map(toLWCVolume);

          const cappedCandles = parsedCandles.slice(-MAX_CANDLES);
          const cappedVolumes = volumes.slice(-MAX_CANDLES);

          // Always setData() — with 20 candles at 2Hz this is trivial cost
          // and eliminates the entire class of update-vs-setData bugs
          candleSeriesRef.current.setData(cappedCandles);
          volumeSeriesRef.current.setData(cappedVolumes);

          // Feed footprint primitive
          if (footprintRef.current) {
            footprintRef.current.setData(candlesRaw.slice(-MAX_CANDLES));
          }
        }
      }

      animFrameId = requestAnimationFrame(renderLoop);
    }

    animFrameId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animFrameId);
  }, []); // Self-sustaining loop

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {/* Main Chart (Top Pane) */}
      <div 
        ref={containerRef} 
        style={{ flex: 1, minHeight: 0 }}
      />
      {/* Delta Histogram (Bottom Pane) */}
      <div 
        ref={deltaContainerRef} 
        style={{ height: '80px', flexShrink: 0, borderTop: '1px solid #1E3448' }} 
      />
    </div>
  );
});
