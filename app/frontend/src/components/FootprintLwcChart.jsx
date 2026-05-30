import { createChart } from 'lightweight-charts';
import { useEffect, useMemo, useRef, useCallback } from 'react';
import { snapTick } from '../utils/tickSteps';
import { formatPrice } from '../utils/instrument';

function defaultOptions() {
  return {
    buyVol: '#26A69A',
    sellVol: '#EF5350',
    grid: 'rgba(143, 168, 190, 0.08)',
    gridStrong: 'rgba(143, 168, 190, 0.16)',
    font: '12px Inter, sans-serif',
  };
}

/**
 * Binary search helpers for sorted-descending bucket arrays.
 * aggBuckets is sorted high→low by price (done once in aggregateCandles).
 *
 * Returns the slice [startIdx, endIdx) of buckets whose price falls within
 * [minPrice, maxPrice] (inclusive). O(log n) per call instead of O(n).
 */
function findVisibleBucketRange(buckets, minPrice, maxPrice) {
  const n = buckets.length;
  if (n === 0) return [0, 0];

  // Array is descending: buckets[0].price is highest, buckets[n-1].price is lowest.
  // Find first index where price <= maxPrice (start of visible range).
  let lo = 0, hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (buckets[mid].price > maxPrice) lo = mid + 1;
    else hi = mid;
  }
  const startIdx = lo;

  // Find first index where price < minPrice (end of visible range).
  lo = startIdx; hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (buckets[mid].price >= minPrice) lo = mid + 1;
    else hi = mid;
  }
  const endIdx = lo;

  return [startIdx, endIdx];
}

/**
 * Measure the pixel row height from the first two adjacent buckets.
 * Buckets are pre-sorted descending, so index 0 and 1 are adjacent price levels.
 * Returns a fallback of 16px if fewer than 2 buckets or coordinates unavailable.
 */
function measureRowHeight(buckets, priceToCoordinate) {
  if (buckets.length < 2) return 16;
  const y0 = priceToCoordinate(buckets[0].price);
  const y1 = priceToCoordinate(buckets[1].price);
  if (y0 === null || y1 === null) return 16;
  return Math.max(6, Math.min(80, Math.abs(y1 - y0)));
}

function getNaturalDecimals(sym) {
  if (sym.includes('BTC')) return 1;
  if (sym.includes('BEAT')) return 4;
  if (sym.includes('HYPE')) return 2;
  return 2; // fallback
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
      // Lowered showNumbers threshold to 38px to keep footprints highly readable and informative at wider zoom ranges
      const showFootprint = laneWidth > 20;
      const showNumbers = laneWidth > 38;

      target.useBitmapCoordinateSpace((scope) => {
        const ctx = scope.context;
        ctx.save();
        ctx.font = options.font;
        ctx.textBaseline = 'middle';
        ctx.lineCap = 'square';

        const px = scope.horizontalPixelRatio || 1;
        const py = scope.verticalPixelRatio || 1;

        // Derive the viewport's visible price range once per draw call.
        // Strategy: probe the price at canvas y=0 (top) and y=height (bottom) by
        // scanning bar prices until we find the extremes that map to valid coordinates.
        // This gives us true viewport bounds — not candle OHLC bounds — for culling.
        // priceToCoordinate returning null means off-screen; we use that as the guard.
        let viewportMinPrice = Infinity;
        let viewportMaxPrice = -Infinity;
        for (const item of bars) {
          const d = item.originalData;
          if (!d) continue;
          const h = Number(d.high), l = Number(d.low);
          if (Number.isFinite(h) && priceToCoordinate(h) !== null) {
            if (h > viewportMaxPrice) viewportMaxPrice = h;
            if (h < viewportMinPrice) viewportMinPrice = h;
          }
          if (Number.isFinite(l) && priceToCoordinate(l) !== null) {
            if (l > viewportMaxPrice) viewportMaxPrice = l;
            if (l < viewportMinPrice) viewportMinPrice = l;
          }
        }
        // If no bars are on screen at all, fall back to unbounded (no culling).
        if (!Number.isFinite(viewportMinPrice)) viewportMinPrice = -Infinity;
        if (!Number.isFinite(viewportMaxPrice)) viewportMaxPrice = Infinity;

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

              let pocPrice = null;
              let pocVol = -1;
              for (const b of buckets) {
                const tv = (Number(b.buy_vol) || 0) + (Number(b.sell_vol) || 0);
                if (tv > pocVol) {
                  pocVol = tv;
                  pocPrice = b.price;
                }
              }

              // Buckets are pre-sorted descending by price from aggregateCandles.
              // measureRowHeight uses the first two adjacent buckets — no sort needed.
              const rowH = measureRowHeight(buckets, priceToCoordinate);
              const barHeight = Math.max(2, rowH * 0.85);

              // Cull to viewport price range (not candle OHLC range).
              // This correctly handles: long wicks, cross-exchange buckets outside OHLC,
              // and zoomed-in views where only part of a candle's range is visible.
              const rowHMargin = rowH; // one row of margin to avoid edge clipping
              const [startIdx, endIdx] = findVisibleBucketRange(
                buckets,
                viewportMinPrice - rowHMargin,
                viewportMaxPrice + rowHMargin,
              );

              for (let bi = startIdx; bi < endIdx; bi++) {
                const b = buckets[bi];
                const price = b.price;
                const y = priceToCoordinate(price);
                if (y === null) continue;

                const buy = Number(b.buy_vol) || 0;
                const sell = Number(b.sell_vol) || 0;
                if (buy + sell <= 0) continue;

                const halfLane = bodyWidth * 0.48;
                const leftBar = Math.min((sell / maxVol) * halfLane, halfLane);
                const rightBar = Math.min((buy / maxVol) * halfLane, halfLane);

                // No default soft background tint for normal cells to ensure maximum contrast and clear wicks.
                // Background tint is strictly reserved as an active highlight for signal/imbalance cells.
                let bgColor = null;
                
                if (b.flags) {
                  for (const flag of b.flags) {
                    if (flag.type === 'IMB') {
                       const flagOpacity = Math.min(1, Math.max(0.2, (flag.severity || 5) / 10));
                       bgColor = flag.direction === 'buy' ? `rgba(38, 166, 154, ${flagOpacity * 0.6})` : `rgba(239, 83, 80, ${flagOpacity * 0.6})`;
                    }
                  }
                }
                
                if (bgColor) {
                  ctx.fillStyle = bgColor;
                  // Fill height matches barHeight perfectly to align with volume bars and keep separator margins clean
                  ctx.fillRect(centerX - bodyWidth / 2, y - barHeight / 2, bodyWidth, barHeight);
                }

                if (b.price === pocPrice) {
                  // High-tech cyber-cyan glass backplate + thin precise neon stroke for Point of Control (POC)
                  // Matches exact width of hollow candle body and exact height of the inner volume bars
                  ctx.fillStyle = 'rgba(0, 229, 255, 0.08)';
                  ctx.fillRect(centerX - bodyWidth / 2, y - barHeight / 2, bodyWidth, barHeight);

                  ctx.strokeStyle = '#00e5ff';
                  ctx.lineWidth = 1;
                  ctx.strokeRect(centerX - bodyWidth / 2, y - barHeight / 2, bodyWidth, barHeight);
                }

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
            // Buckets are pre-sorted descending — reuse measureRowHeight, no re-sort.
            const rowH = measureRowHeight(buckets, priceToCoordinate);

            // Protect horizontal and vertical boundaries: ensure text doesn't bleed into adjacent candles or off the pane margins
            ctx.save();
            ctx.beginPath();
            ctx.rect(centerX - laneWidth / 2, 4, laneWidth, scope.bitmapSize.height - 8);
            ctx.clip();

            const visMinPrice4 = viewportMinPrice - rowH;
            const visMaxPrice4 = viewportMaxPrice + rowH;
            const [startIdx, endIdx] = findVisibleBucketRange(buckets, visMinPrice4, visMaxPrice4);

            for (let bi = startIdx; bi < endIdx; bi++) {
              const b = buckets[bi];
              const price = b.price;
              const y = priceToCoordinate(price);
              if (y === null) continue;

              // Skip drawing text if it falls outside the visible series area boundaries to prevent bleeding into borders
              if (y < 8 || y > scope.bitmapSize.height - 8) continue;

              const buy = Number(b.buy_vol) || 0;
              const sell = Number(b.sell_vol) || 0;
              if (buy + sell <= 0 || rowH <= 8) continue;

              // Scale font size dynamically by both row height AND lane width to prevent overlaps.
              // Raised vertical limit factor to 0.65 to scale numbers up vertically in sync with the taller 85% row height.
              const fontSize = Math.max(6.5, Math.min(20, rowH * 0.65, laneWidth * 0.125));
              ctx.font = `500 ${fontSize}px Inter, sans-serif`;
              ctx.fontVariantNumeric = 'tabular-nums';
              
              ctx.strokeStyle = '#0D1B2A';
              ctx.lineWidth = 1.6;
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
            ctx.restore();
          }

          // 5. Badges / Flags (Absorption, Exhaustion, Imbalance)
          if (showFootprint && options.showBadges !== false) {
            const buckets = Array.isArray(d.aggBuckets) ? d.aggBuckets : [];
            // Reuse binary search — only iterate buckets in visible price range
            const rowH = measureRowHeight(buckets, priceToCoordinate);
            const [startIdx, endIdx] = findVisibleBucketRange(
              buckets,
              viewportMinPrice - rowH,
              viewportMaxPrice + rowH,
            );

            for (let bi = startIdx; bi < endIdx; bi++) {
              const b = buckets[bi];
              if (!b.flags || b.flags.length === 0) continue;
              
              const price = b.price;
              const y = priceToCoordinate(price);
              if (y === null) continue;

              // Draw badges inside the right edge of the candle body
              let currentRight = centerX + bodyWidth / 2 - 2;
              
              for (const flag of b.flags) {
                // Ensure opacity is visible but reflects confidence (severity 1..10 -> opacity 0.3..1.0)
                const opacity = Math.min(1, Math.max(0.3, (flag.severity || 5) / 10));
                
                let bgColor = `rgba(100, 100, 100, ${opacity})`;
                
                if (flag.type === 'IMB') {
                  bgColor = flag.direction === 'buy' ? `rgba(38, 166, 154, ${opacity})` : `rgba(239, 83, 80, ${opacity})`;
                } else if (flag.type === 'ABS') {
                  bgColor = `rgba(249, 168, 37, ${opacity})`; // Orange
                } else if (flag.type === 'EXH') {
                  bgColor = `rgba(21, 101, 192, ${opacity})`; // Blue
                }
                
                // Scale badge size with the row height, but keep it small
                const badgeFontSize = Math.max(6, Math.min(9, rowH * 0.4));
                ctx.font = `600 ${badgeFontSize}px Inter, sans-serif`;
                
                const textWidth = ctx.measureText(flag.type).width;
                const paddingX = 2;
                const boxWidth = textWidth + paddingX * 2;
                const boxHeight = Math.max(10, Math.min(14, rowH * 0.8));
                
                const boxLeft = currentRight - boxWidth;
                
                // Only draw if we have enough space so it doesn't overlap the center numbers
                // (centerX + 3 is where the buy numbers start, assume max 30px width for numbers)
                if (boxLeft < centerX + 25) {
                    continue; // Skip drawing badge if the column is too narrow
                }
                
                ctx.fillStyle = bgColor;
                ctx.beginPath();
                ctx.roundRect(boxLeft, y - boxHeight / 2, boxWidth, boxHeight, 2);
                ctx.fill();
                
                ctx.fillStyle = '#FFFFFF';
                ctx.textAlign = 'center';
                // Adjust text Y position based on font size to keep it vertically centered
                ctx.fillText(flag.type, boxLeft + boxWidth / 2, y + (badgeFontSize * 0.35));
                
                currentRight -= (boxWidth + 2); // Spacing for next badge
              }
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

export function FootprintLwcChart({ candles = [], height = 0, autoFit = false, tickSize = 1, symbol = 'BTC-USDT', onInteraction, maxVolumeGlobal, onViewportChange, showBadges = false, onVisiblePriceRangeChange }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const tooltipRef = useRef(null);
  const hasInitializedRef = useRef(false);
  const isProgrammaticChangeRef = useRef(false);
  const lastFirstCandleTimeRef = useRef(null);
  const lastCandleCountRef = useRef(0);
  const lastTickSizeRef = useRef(null);
  const lastShowBadgesRef = useRef(null);

  const mapCandle = useCallback((c) => {
    let rawTime = c.time || c.ts || c.start_time || c.open_time || c.timestamp || Math.floor(Date.now() / 1000);
    // Lightweight Charts expects seconds. If value is > 10^11, it's likely milliseconds.
    const time = rawTime > 10000000000 ? Math.floor(rawTime / 1000) : rawTime;

    return {
      time,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      aggBuckets: c.aggBuckets || [],
    };
  }, []);

  const candlesRef = useRef(candles);
  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  const symbolRef = useRef(symbol);
  useEffect(() => {
    symbolRef.current = symbol;
  }, [symbol]);

  const onInteractionRef = useRef(onInteraction);
  const onViewportChangeRef = useRef(onViewportChange);
  const onVisiblePriceRangeChangeRef = useRef(onVisiblePriceRangeChange);

  useEffect(() => {
    onInteractionRef.current = onInteraction;
    onViewportChangeRef.current = onViewportChange;
    onVisiblePriceRangeChangeRef.current = onVisiblePriceRangeChange;
  }, [onInteraction, onViewportChange, onVisiblePriceRangeChange]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (chartRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#8FA8BE', // Cool gray-blue for scale typography
        fontSize: 11,
      },
      crosshair: {
        // Normal mode: crosshair follows mouse freely across the full price range.
        // Default (Magnet) snaps to the nearest data point — wrong for footprint charts
        // where the user needs to inspect specific price levels, not just OHLC points.
        mode: 0, // CrosshairMode.Normal
        vertLine: {
          width: 1,
          color: 'rgba(255, 255, 255, 0.15)',
          style: 2, // dashed
        },
        horzLine: {
          width: 1,
          color: 'rgba(255, 255, 255, 0.15)',
          style: 2, // dashed
        },
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' }, // Dynamic visual grid lines
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        autoScale: true,
        scaleMargins: {
          top: 0.02,
          bottom: 0.02,
        },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
      },
      handleScroll: true,
      handleScale: true,
      autoSize: true,
    });

    const paneView = makeFootprintPaneView();
    
    const naturalDecimals = getNaturalDecimals(symbol);
    const lwcMinMove = Number(Math.pow(10, -naturalDecimals).toFixed(naturalDecimals));

    const series = chart.addCustomSeries(paneView, {
      maxVolumeGlobal: Math.max(maxVolumeGlobal || 1, 1),
      priceFormat: {
        type: 'custom',
        formatter: (price) => formatPrice(price, naturalDecimals),
        minMove: lwcMinMove,
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Crosshair tooltip — shows OHLC + delta on hover
    chart.subscribeCrosshairMove((param) => {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;

      if (
        !param.point ||
        param.point.x < 0 ||
        param.point.y < 0 ||
        !param.time
      ) {
        tooltip.style.display = 'none';
        return;
      }

      const data = param.seriesData.get(series);
      if (!data) {
        tooltip.style.display = 'none';
        return;
      }

       const naturalDecimals = getNaturalDecimals(symbolRef.current);
      const open  = formatPrice(data.open, naturalDecimals);
      const high  = formatPrice(data.high, naturalDecimals);
      const low   = formatPrice(data.low, naturalDecimals);
      const close = formatPrice(data.close, naturalDecimals);

      // delta = sum of all bucket deltas
      const buckets = data.aggBuckets || [];
      const delta = buckets.reduce((sum, b) => sum + (Number(b.delta) || 0), 0);
      const deltaStr = (delta >= 0 ? '+' : '') + formatPrice(delta, 2);
      const deltaColor = delta >= 0 ? '#26A69A' : '#EF5350';

      // Format timestamp
      const ts = new Date(param.time * 1000);
      const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = ts.toLocaleDateString([], { month: 'short', day: 'numeric' });

      tooltip.innerHTML = `
        <div class="ct-time">${dateStr} ${timeStr}</div>
        <div class="ct-row"><span class="ct-label">O</span><span class="ct-val">${open}</span></div>
        <div class="ct-row"><span class="ct-label">H</span><span class="ct-val">${high}</span></div>
        <div class="ct-row"><span class="ct-label">L</span><span class="ct-val">${low}</span></div>
        <div class="ct-row"><span class="ct-label">C</span><span class="ct-val">${close}</span></div>
        <div class="ct-row"><span class="ct-label">Δ</span><span class="ct-val" style="color:${deltaColor}">${deltaStr}</span></div>
      `;

      // Position tooltip — keep it inside the container
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const tooltipW = 110;
      const tooltipH = 110;
      const margin = 12;

      let left = param.point.x + margin;
      let top  = param.point.y - tooltipH / 2;

      // Flip horizontally if too close to right edge
      if (left + tooltipW > rect.width) {
        left = param.point.x - tooltipW - margin;
      }
      // Clamp vertically
      top = Math.max(margin, Math.min(top, rect.height - tooltipH - margin));

      tooltip.style.left    = `${left}px`;
      tooltip.style.top     = `${top}px`;
      tooltip.style.display = 'block';
    });

    // Detect user interaction
    chart.timeScale().subscribeVisibleTimeRangeChange(() => {
      if (!isProgrammaticChangeRef.current && hasInitializedRef.current) {
        onInteractionRef.current?.();
      }
      
      // Always sync the viewport, even during programmatic fits/initial load
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
      
      // Actively report the Y-axis range during panning/kinetic scroll so tick sizing can react
      if (seriesRef.current && onVisiblePriceRangeChangeRef.current && containerRef.current) {
        const top = seriesRef.current.coordinateToPrice(0);
        const bottom = seriesRef.current.coordinateToPrice(containerRef.current.clientHeight);
        if (top !== null && bottom !== null) {
          onVisiblePriceRangeChangeRef.current({ top, bottom });
        }
      }
    });

    const reportVisiblePriceRange = () => {
      if (seriesRef.current && onVisiblePriceRangeChangeRef.current && containerRef.current) {
        const top = seriesRef.current.coordinateToPrice(0);
        const bottom = seriesRef.current.coordinateToPrice(containerRef.current.clientHeight);
        if (top !== null && bottom !== null) {
          onVisiblePriceRangeChangeRef.current({ top, bottom });
        }
      }
    };

    containerRef.current.addEventListener('wheel', reportVisiblePriceRange, { passive: true });
    containerRef.current.addEventListener('pointerup', reportVisiblePriceRange);
    
    // Initial report after a short delay to ensure LWC has computed layout
    setTimeout(reportVisiblePriceRange, 200);

    return () => {
      if (containerRef.current) {
        containerRef.current.removeEventListener('wheel', reportVisiblePriceRange);
        containerRef.current.removeEventListener('pointerup', reportVisiblePriceRange);
      }
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Update Data Logic
  useEffect(() => {
    if (!seriesRef.current || !candles || candles.length === 0) return;

    const naturalDecimals = getNaturalDecimals(symbolRef.current);
    const lwcMinMove = Number(Math.pow(10, -naturalDecimals).toFixed(naturalDecimals));

    // Apply any updated global volume option securely
    seriesRef.current.applyOptions({
      maxVolumeGlobal: Math.max(maxVolumeGlobal || 1, 1),
      showBadges: showBadges,
      priceFormat: {
        type: 'custom',
        formatter: (price) => formatPrice(price, naturalDecimals),
        minMove: lwcMinMove,
      },
    });

    const firstCandleTime = mapCandle(candles[0]).time;
    const isHistoryShift = lastFirstCandleTimeRef.current !== firstCandleTime;
    const isMajorCountChange = Math.abs(candles.length - lastCandleCountRef.current) > 1;

    // Detect tick size changes by checking if aggBuckets structure changed
    // We use maxVolumeGlobal as a proxy — when tick size changes, aggregation produces different volumes
    const tickSizeChanged = lastTickSizeRef.current !== null && lastTickSizeRef.current !== maxVolumeGlobal;
    
    // Detect badge toggle
    const badgesToggled = lastShowBadgesRef.current !== null && lastShowBadgesRef.current !== showBadges;

    // If it's a completely new dataset, history shifted (pruned), tick size changed, or badges toggled
    if (!hasInitializedRef.current || isHistoryShift || isMajorCountChange || tickSizeChanged || badgesToggled) {
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
    lastShowBadgesRef.current = showBadges;
  }, [candles, mapCandle, maxVolumeGlobal, showBadges, tickSize]);

  // Handle explicit Auto-Fit trigger from parent
  useEffect(() => {
    if (autoFit && chartRef.current && candles.length > 0) {
      isProgrammaticChangeRef.current = true;
      chartRef.current.timeScale().fitContent();
      // Optional: reset vertical scale to auto
      chartRef.current.priceScale('right').applyOptions({ 
        autoScale: true,
        scaleMargins: { top: 0.02, bottom: 0.02 }
      });
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
    >
      <div ref={tooltipRef} className="crosshair-tooltip" style={{ display: 'none' }} />
    </div>
  );
}
