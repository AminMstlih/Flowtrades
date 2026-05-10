import { createChart, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import { useEffect, useRef, useCallback } from 'react';
import { setupHiDPICanvas } from '../utils/canvas';

/**
 * Lightweight Charts v5 container component.
 * 
 * Per UI Engineering Guide Section 1.3:
 * - Chart instance stored in useRef (NEVER useState)
 * - Initialized once in useEffect with empty deps
 * - Data updates via series.update() API
 * - Proper cleanup on unmount
 * 
 * @param {Object} props
 * @param {Array} props.candles - OHLCV candle data
 * @param {Function} props.onChartReady - Callback with chart instance
 * @param {Object} props.theme - Color theme tokens
 */
export function LightweightChart({ candles = [], onChartReady, theme = {} }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);

  // Default theme colors from Guide Section 10
  const colors = {
    background: theme.bgPrimary || '#0D1B2A',
    text: theme.textPrimary || '#E0E7EF',
    grid: theme.borderSubtle || '#1E3448',
    candleUp: theme.candleUp || '#26A69A',
    candleDown: theme.candleDown || '#EF5350',
    volumeUp: theme.accentBuy || '#26A69A',
    volumeDown: theme.accentSell || '#EF5350',
  };

  // Initialize chart ONCE on mount
  useEffect(() => {
    if (!containerRef.current) return;

    // Create chart instance
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: 'solid', color: colors.background },
        textColor: colors.text,
        fontSize: 12,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      crosshair: {
        mode: 1, // Normal crosshair
        vertLine: {
          color: colors.text + '60',
          width: 1,
          style: 2, // Dashed
          labelBackgroundColor: '#1565C0',
        },
        horzLine: {
          color: colors.text + '60',
          width: 1,
          style: 2,
          labelBackgroundColor: '#1565C0',
        },
      },
      rightPriceScale: {
        borderColor: colors.grid,
        scaleMargins: {
          top: 0.1,
          bottom: 0.2, // Leave space for volume
        },
      },
      timeScale: {
        borderColor: colors.grid,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    });

    // Add candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: colors.candleUp,
      downColor: colors.candleDown,
      borderUpColor: colors.candleUp,
      borderDownColor: colors.candleDown,
      wickUpColor: colors.candleUp,
      wickDownColor: colors.candleDown,
    });

    // Add volume histogram series (overlay mode)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '', // Empty = overlay on main chart
      scaleMargins: {
        top: 0.8, // Push volume to bottom 20%
        bottom: 0,
      },
    });

    // Store refs
    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Notify parent chart is ready
    if (onChartReady) {
      onChartReady({ chart, candleSeries, volumeSeries });
    }

    // Setup ResizeObserver for responsive sizing
    const resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      
      const { width, height } = entry.contentRect;
      
      // Apply new dimensions
      chart.applyOptions({ 
        width: Math.round(width),
        height: Math.round(height),
      });
    });

    resizeObserver.observe(containerRef.current);

    // Cleanup on unmount
    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []); // Empty deps - runs ONCE only

  // Update candle data when it changes
  useEffect(() => {
    if (!candleSeriesRef.current || !candles || candles.length === 0) return;

    // Transform backend data to Lightweight Charts format
    const formattedCandles = candles.map(c => ({
      time: c.time || c.ts || Math.floor((c.timestamp || Date.now()) / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    // Set all data at once (for initial load or timeframe change)
    candleSeriesRef.current.setData(formattedCandles);

    // Auto-fit to show all candles
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [candles]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    />
  );
}
