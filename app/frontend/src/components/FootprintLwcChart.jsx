import { createChart } from 'lightweight-charts';
import { useEffect, useMemo, useRef, useCallback } from 'react';

function defaultOptions() {
  return {
    buyVol: '#26A69A',
    sellVol: '#EF5350',
    grid: 'rgba(143, 168, 190, 0.08)',
    gridStrong: 'rgba(143, 168, 190, 0.16)',
    font: '12px Inter, sans-serif',
  };
}

function makeFootprintPaneView() {
  const state = {
    bars: [],
    barSpacing: 8,
    conflationFactor: 1,
    options: defaultOptions(),
  };

  const renderer = {
    draw(target, priceToCoordinate, _isHovered) {
      const { bars, barSpacing, conflationFactor, options } = state;
      if (!bars || bars.length === 0) return;

      const effectiveBarSpacing = Math.max(1, barSpacing * (conflationFactor || 1));
      const laneWidth = Math.max(6, effectiveBarSpacing * 0.9);

      // Define zoom levels based on laneWidth (approximate transition points)
      const showFootprint = laneWidth > 18;
      const showNumbers = laneWidth > 48;

      target.useBitmapCoordinateSpace((scope) => {
        const ctx = scope.context;
        ctx.save();
        ctx.font = options.font;
        ctx.textBaseline = 'middle';
        ctx.lineCap = 'square';

        const px = scope.horizontalPixelRatio || 1;
        const py = scope.verticalPixelRatio || 1;

        for (const item of bars) {
          const x = item.x;
          const d = item.originalData;
          if (!d) continue;

          const open = Number(d.open);
          const high = Number(d.high);
          const low = Number(d.low);
          const close = Number(d.close);
          if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) continue;

          const yHigh = priceToCoordinate(high);
          const yLow = priceToCoordinate(low);
          const yOpen = priceToCoordinate(open);
          const yClose = priceToCoordinate(close);
          if (yHigh === null || yLow === null || yOpen === null || yClose === null) continue;

          const isUp = close >= open;
          const bodyTop = Math.min(yOpen, yClose);
          const bodyBottom = Math.max(yOpen, yClose);
          const bodyHeight = Math.max(2, bodyBottom - bodyTop);

          // Candle body width is wide when footprints are shown (Option A)
          const bodyWidth = showFootprint
            ? laneWidth * 0.95
            : laneWidth * 0.7;

          const left = x - laneWidth / 2;
          const centerX = x;
          const laneLeft = x - laneWidth / 2;

          // 1. Wick
          ctx.strokeStyle = isUp ? 'rgba(38, 166, 154, 0.6)' : 'rgba(239, 83, 80, 0.6)';
          ctx.lineWidth = Math.max(1, px);
          ctx.beginPath();
          ctx.moveTo(centerX, yHigh);
          ctx.lineTo(centerX, yLow);
          ctx.stroke();

          // 2. Footprint Data (Underlay: Tints and Bars)
          if (showFootprint) {
            const buckets = Array.isArray(d.aggBuckets) ? d.aggBuckets : [];
            if (buckets.length > 0) {
              const maxVol = Math.max(options.maxVolumeGlobal || 1, 1);

              // Measure actual vertical row height from price coordinates
              const sortedPrices = buckets.map(b => Number(b.price)).filter(p => Number.isFinite(p)).sort((a, b) => b - a);
              let rowH = 16; // fallback
              if (sortedPrices.length >= 2) {
                const y0 = priceToCoordinate(sortedPrices[0]);
                const y1 = priceToCoordinate(sortedPrices[1]);
                if (y0 !== null && y1 !== null) {
                  rowH = Math.max(6, Math.min(32, Math.abs(y1 - y0)));
                }
              }
              const barHeight = Math.max(2, rowH * 0.55);

              for (const b of buckets) {
                const price = Number(b.price);
                const y = priceToCoordinate(price);
                if (y === null) continue;

                const buy = Number(b.buy_vol) || 0;
                const sell = Number(b.sell_vol) || 0;
                if (buy + sell <= 0) continue;

                const halfLane = bodyWidth * 0.48;
                const leftBar = Math.min((sell / maxVol) * halfLane, halfLane);
                const rightBar = Math.min((buy / maxVol) * halfLane, halfLane);

                const opacity = Math.min((buy + sell) / maxVol, 1);
                
                // background cell tint
                ctx.fillStyle = isUp ? `rgba(38, 166, 154, ${opacity * 0.12})` : `rgba(239, 83, 80, ${opacity * 0.12})`;
                ctx.fillRect(centerX - bodyWidth / 2, y - rowH / 2, bodyWidth, rowH);

                // volume bars
                if (leftBar > 0) {
                  ctx.fillStyle = options.sellVol + 'CC';
                  ctx.fillRect(centerX - 1 - leftBar, y - barHeight / 2, leftBar, barHeight);
                }
                if (rightBar > 0) {
                  ctx.fillStyle = options.buyVol + 'CC';
                  ctx.fillRect(centerX + 1, y - barHeight / 2, rightBar, barHeight);
                }
              }
            }
          }

          // 3. Body (Option A style: Hollow outline when zoomed in, solid when zoomed out)
          if (showFootprint) {
            ctx.strokeStyle = isUp ? '#26A69A' : '#EF5350';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(centerX - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
          } else {
            ctx.fillStyle = isUp ? 'rgba(38, 166, 154, 0.8)' : 'rgba(239, 83, 80, 0.8)';
            ctx.fillRect(centerX - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
          }

          // 4. Footprint Overlay (Numeric detail)
          if (showFootprint && showNumbers) {
            const buckets = Array.isArray(d.aggBuckets) ? d.aggBuckets : [];
            // Measure rowH the same way as section 2
            const sortedPrices = buckets.map(b => Number(b.price)).filter(p => Number.isFinite(p)).sort((a, b) => b - a);
            let rowH = 16;
            if (sortedPrices.length >= 2) {
              const y0 = priceToCoordinate(sortedPrices[0]);
              const y1 = priceToCoordinate(sortedPrices[1]);
              if (y0 !== null && y1 !== null) {
                rowH = Math.max(6, Math.min(32, Math.abs(y1 - y0)));
              }
            }


            for (const b of buckets) {
              const price = Number(b.price);
              const y = priceToCoordinate(price);
              if (y === null) continue;

              const buy = Number(b.buy_vol) || 0;
              const sell = Number(b.sell_vol) || 0;
              if (buy + sell <= 0 || rowH <= 8) continue;

              const fontSize = Math.max(8, Math.min(13, rowH * 0.65));
              ctx.font = `500 ${fontSize}px Inter, sans-serif`;
              ctx.fontVariantNumeric = 'tabular-nums';
              
              ctx.strokeStyle = '#0D1B2A';
              ctx.lineWidth = 1.8;
              ctx.lineJoin = 'round';
              
              const sellText = String(Math.round(sell));
              const buyText = String(Math.round(buy));
              
              ctx.textAlign = 'right';
              ctx.strokeText(sellText, centerX - 3, y);
              ctx.fillStyle = '#FFFFFF'; 
              ctx.fillText(sellText, centerX - 3, y);
              
              ctx.textAlign = 'left';
              ctx.strokeText(buyText, centerX + 3, y);
              ctx.fillStyle = '#FFFFFF';
              ctx.fillText(buyText, centerX + 3, y);
            }
          }
        }

        ctx.restore();
      });
    },
  };

  return {
    renderer() {
      return renderer;
    },
    update(data, seriesOptions) {
      state.bars = data.bars || [];
      state.barSpacing = data.barSpacing || 8;
      state.conflationFactor = data.conflationFactor || 1;
      state.options = { ...defaultOptions(), ...(seriesOptions || {}) };
    },
    priceValueBuilder(plotRow) {
      if (!plotRow) return [];
      return [plotRow.high, plotRow.low, plotRow.close];
    },
    isWhitespace(d) {
      return d == null || d.open == null || d.high == null || d.low == null || d.close == null;
    },
    defaultOptions() {
      return defaultOptions();
    },
  };
}

export function FootprintLwcChart({ candles = [], height = 0, autoFit = false, onInteraction, maxVolumeGlobal, onViewportChange }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const hasInitializedRef = useRef(false);
  const isProgrammaticChangeRef = useRef(false);
  const lastFirstCandleTimeRef = useRef(null);
  const lastCandleCountRef = useRef(0);
  const lastTickSizeRef = useRef(null);

  const mapCandle = useCallback((c) => ({
    time: c.time || c.ts || c.start_time || c.open_time || Math.floor((c.timestamp || Date.now()) / 1000),
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    aggBuckets: c.aggBuckets || [],
  }), []);

  const candlesRef = useRef(candles);
  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  const onInteractionRef = useRef(onInteraction);
  const onViewportChangeRef = useRef(onViewportChange);

  useEffect(() => {
    onInteractionRef.current = onInteraction;
    onViewportChangeRef.current = onViewportChange;
  }, [onInteraction, onViewportChange]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (chartRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: 'solid', color: '#0D1B2A' },
        textColor: '#E0E7EF',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: 'rgba(30, 52, 72, 0.9)' },
        horzLines: { color: 'rgba(30, 52, 72, 0.9)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(30, 52, 72, 0.9)',
        autoScale: true,
      },
      timeScale: {
        borderColor: 'rgba(30, 52, 72, 0.9)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
      },
      handleScroll: true,
      handleScale: true,
      autoSize: true,
    });

    const paneView = makeFootprintPaneView();
    const series = chart.addCustomSeries(paneView, {
      maxVolumeGlobal: Math.max(maxVolumeGlobal || 1, 1),
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Detect user interaction
    chart.timeScale().subscribeVisibleTimeRangeChange(() => {
      if (!isProgrammaticChangeRef.current && hasInitializedRef.current) {
        onInteractionRef.current?.();
      }
      
      // Always sync the viewport, even during programmatic fits/initial load
      if (onViewportChangeRef.current) {
        const logicalRange = chart.timeScale().getVisibleLogicalRange();
        const currentCandles = candlesRef.current;
        if (logicalRange && currentCandles.length > 0) {
          const visibleCandles = Math.max(1, logicalRange.to - logicalRange.from);
          const totalWidthPx = chart.timeScale().width();
          let exactBarSpacing = totalWidthPx / visibleCandles;

          // Find a visible candle to get a reliable coordinate
          const firstVisibleIndex = Math.max(0, Math.floor(logicalRange.from));
          const safeIndex = Math.min(firstVisibleIndex, currentCandles.length - 1);
          
          const mappedSafeCandle = mapCandle(currentCandles[safeIndex]);
          const safeX = chart.timeScale().timeToCoordinate(mappedSafeCandle.time);

          // Get EXACT bar spacing directly from LWC's coordinate system to avoid fractional drifting
          if (safeIndex + 1 < currentCandles.length) {
            const nextX = chart.timeScale().timeToCoordinate(mapCandle(currentCandles[safeIndex + 1]).time);
            if (safeX !== null && nextX !== null) exactBarSpacing = nextX - safeX;
          } else if (safeIndex - 1 >= 0) {
            const prevX = chart.timeScale().timeToCoordinate(mapCandle(currentCandles[safeIndex - 1]).time);
            if (safeX !== null && prevX !== null) exactBarSpacing = safeX - prevX;
          }

          if (safeX !== null) {
            // Calculate where index 0 would be using exact spacing
            const firstX = safeX - safeIndex * exactBarSpacing;
            // We want the center of Delta cell 0 to align with firstX
            const offsetX = firstX - exactBarSpacing / 2;

            onViewportChangeRef.current({ 
              offsetX, 
              barSpacing: exactBarSpacing,
              scaleX: Math.max(0.75, exactBarSpacing / 105) // Fallback for components still using scale
            });
          }
        }
      }
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Update Data Logic
  useEffect(() => {
    if (!seriesRef.current || !candles || candles.length === 0) return;

    // Apply any updated global volume option securely
    seriesRef.current.applyOptions({
      maxVolumeGlobal: Math.max(maxVolumeGlobal || 1, 1)
    });

    const firstCandleTime = mapCandle(candles[0]).time;
    const isHistoryShift = lastFirstCandleTimeRef.current !== firstCandleTime;
    const isMajorCountChange = Math.abs(candles.length - lastCandleCountRef.current) > 1;

    // Detect tick size changes by checking if aggBuckets structure changed
    // We use maxVolumeGlobal as a proxy — when tick size changes, aggregation produces different volumes
    const tickSizeChanged = lastTickSizeRef.current !== null && lastTickSizeRef.current !== maxVolumeGlobal;
    // More reliable: check if first candle's aggBuckets count changed
    const firstBucketsCount = candles[0]?.aggBuckets?.length || 0;
    const bucketsChanged = candles.length > 0 && firstBucketsCount > 0;

    // If it's a completely new dataset, history shifted (pruned), or tick size changed
    if (!hasInitializedRef.current || isHistoryShift || isMajorCountChange || tickSizeChanged) {
      const allMapped = candles.map(mapCandle);
      seriesRef.current.setData(allMapped);

      if (!hasInitializedRef.current) {
        isProgrammaticChangeRef.current = true;
        chartRef.current?.timeScale().fitContent();
        hasInitializedRef.current = true;
        setTimeout(() => { isProgrammaticChangeRef.current = false; }, 100);
      }
    } else {
      // Just a live tick update: use update() instead of setData()
      // This preserves user zoom, pan, and manual scale states!
      const lastCandle = mapCandle(candles[candles.length - 1]);
      seriesRef.current.update(lastCandle);
    }

    lastFirstCandleTimeRef.current = firstCandleTime;
    lastCandleCountRef.current = candles.length;
    lastTickSizeRef.current = maxVolumeGlobal;
  }, [candles, mapCandle, maxVolumeGlobal]);

  // Handle explicit Auto-Fit trigger from parent
  useEffect(() => {
    if (autoFit && chartRef.current && candles.length > 0) {
      isProgrammaticChangeRef.current = true;
      chartRef.current.timeScale().fitContent();
      // Optional: reset vertical scale to auto
      chartRef.current.priceScale('right').applyOptions({ autoScale: true });
      setTimeout(() => { isProgrammaticChangeRef.current = false; }, 100);
    }
  }, [autoFit]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: height ? `${height}px` : '100%',
        position: 'relative',
      }}
    />
  );
}
