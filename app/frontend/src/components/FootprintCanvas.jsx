import { useRef, useEffect, useCallback } from 'react';
import { setupHiDPICanvas } from '../utils/canvas';
import { formatVol } from '../utils/formatVol';
import { binFloorPrice, unbinPrice } from '../utils/priceBinning';
import { DETAIL_LEVEL, getCandleFootprintLayout, getDetailLevel, getSmoothFootprintWidth, shouldShowFootprint } from '../utils/uiGeometry';

/**
 * Canvas-based Footprint rendering component.
 * 
 * Per UI Engineering Guide Section 6:
 * - Raw HTML Canvas element (no library wrapping)
 * - HiDPI/Retina scaling via devicePixelRatio
 * - Driven by requestAnimationFrame loop
 * - Y-coordinate synced with chart price axis
 * 
 * @param {Object} props
 * @param {Array} props.candles - Candle data with buckets
 * @param {Array} props.prices - Visible price levels
 * @param {number} props.tickSize - Price binning size
 * @param {number} props.lastPrice - Current market price
 * @param {Object} props.chartRef - Lightweight Charts instance (for price sync)
 */
export function FootprintCanvas({ 
  candles = [], 
  aggCandles = [],
  prices = [], 
  tickSize = 1.0, 
  lastPrice = null,
  transform = { x: 0, y: 0, scaleX: 1, scaleY: 1 },
  showBadges = true,
  priceDecimals = 2
}) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const sizeRef = useRef({ width: 0, height: 0 });

  // Canvas colors from Guide Section 10
  const colors = {
    buyVol: '#26A69A',
    sellVol: '#EF5350',
    buyImbalanceBg: '#0D3B2E',
    sellImbalanceBg: '#3B0D0D',
    flagColor: '#F9A825',
    currentPriceBg: '#1A2A3A',
    rowBgDark: '#0D1B2A',
    rowBgLight: '#111F2E',
    grid: 'rgba(143, 168, 190, 0.08)',
    gridStrong: 'rgba(143, 168, 190, 0.16)',
  };

  const ROW_HEIGHT = 24; // Logical pixels
  const HEADER_HEIGHT = 32; // Offset for DOM Table header
  const priceEps = tickSize / 1000;
  const visibleCandles = Math.max(candles.length, 1);
  const viewportWidth = sizeRef.current.width || 0;
  const widthPerCandle = viewportWidth > 0
    ? viewportWidth / Math.max(visibleCandles + 1, 6)
    : 140;
  const candleWidth = Math.max(42, Math.min(120, widthPerCandle * Math.max(0.85, transform.scaleX)));
  const detailLevel = getDetailLevel({
    candleWidth,
    visibleCandles: candles.length,
    viewportWidth,
  });
  const smoothFootprintWidth = getSmoothFootprintWidth({
    candleWidth,
    visibleCandles: candles.length,
    viewportWidth,
  });
  const footprintLayout = getCandleFootprintLayout({ candleWidth, detailLevel });
  const compactMode = detailLevel === DETAIL_LEVEL.COMPACT;
  const hideFootprint = !shouldShowFootprint(detailLevel);

  // Initialize canvas with HiDPI support
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    
    // Set initial size immediately
    const container = canvas.parentElement || document.querySelector('.chart-area');
    
    if (!container) {
      console.error('[FootprintCanvas] No parent container found');
      return;
    }

    const rect = container.getBoundingClientRect();
    console.log(`[FootprintCanvas] Parent container size: ${rect.width}x${rect.height}`);
    
    if (rect.width > 0 && rect.height > 0) {
      sizeRef.current = { width: rect.width, height: rect.height };
      ctxRef.current = setupHiDPICanvas(canvas, rect.width, rect.height);
      
      // Set positioning immediately
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '100';
      console.log(`[FootprintCanvas] Canvas initialized: ${rect.width}x${rect.height}`);
    }

    const resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;

      const { width, height } = entry.contentRect;
      
      // Only update if we have valid dimensions
      if (width > 0 && height > 0) {
        sizeRef.current = { width, height };

        // Setup HiDPI canvas (Guide Section 1.4)
        ctxRef.current = setupHiDPICanvas(canvas, width, height);
        
        // Position canvas absolutely
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.pointerEvents = 'none'; // Let chart handle interactions
        canvas.style.zIndex = '10';

        // Redraw after resize
        drawFootprint();
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []); // Run once on mount

  // Main drawing function
  const drawFootprint = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) {
      return;
    }
    if (candles.length === 0) {
      return;
    }
    if (prices.length === 0) {
      return;
    }

    const { width, height } = sizeRef.current;
    if (width === 0 || height === 0) {
      return;
    }

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(transform.x, transform.y);
    // ctx.scale(transform.scaleX, transform.scaleY); // Skip scaling for text crispness unless we also apply it

    // Calculate current price
    const currentPriceBinned = lastPrice !== null && lastPrice !== undefined
      ? unbinPrice(binFloorPrice(lastPrice, tickSize), tickSize)
      : null;

    // Column positions
    const colWidth = candleWidth;
    const totalCols = candles.length;
    const tableWidth = totalCols * colWidth;

    const maxPrice = prices[0];
    const minPrice = prices[prices.length - 1];
    const rowCount = prices.length;

    const maxVol = Math.max(
      ...aggCandles.flatMap((c) => c.aggBuckets?.map((b) => b.buy_vol + b.sell_vol) || [0]),
      1,
    );

    const priceToRowIndex = (price) => {
      if (typeof price !== 'number') return null;
      if (price > maxPrice + priceEps || price < minPrice - priceEps) return null;
      const idx = Math.round((maxPrice - price) / tickSize);
      if (!Number.isFinite(idx) || idx < 0 || idx >= rowCount) return null;
      return idx;
    };

    // Draw candle bodies/wicks once per candle (chart-like), not per price-row (grid-like)
    aggCandles.forEach((candle, colIndex) => {
      const x = colIndex * colWidth;
      const laneWidth = Math.max(1, Math.min(colWidth, smoothFootprintWidth || footprintLayout.footprintWidth));
      const laneLeft = x + Math.max(2, (colWidth - laneWidth) / 2);
      const centerX = laneLeft + laneWidth / 2;

      const hiIdx = priceToRowIndex(candle.high);
      const loIdx = priceToRowIndex(candle.low);
      const openIdx = priceToRowIndex(candle.open);
      const closeIdx = priceToRowIndex(candle.close);
      if (hiIdx === null || loIdx === null || openIdx === null || closeIdx === null) return;

      const yHigh = HEADER_HEIGHT + (hiIdx + 0.5) * ROW_HEIGHT;
      const yLow = HEADER_HEIGHT + (loIdx + 0.5) * ROW_HEIGHT;
      const yOpen = HEADER_HEIGHT + (openIdx + 0.5) * ROW_HEIGHT;
      const yClose = HEADER_HEIGHT + (closeIdx + 0.5) * ROW_HEIGHT;

      const isUp = candle.close >= candle.open;
      const bodyTop = Math.min(yOpen, yClose);
      const bodyBottom = Math.max(yOpen, yClose);
      const bodyHeight = Math.max(3, bodyBottom - bodyTop);
      const bodyWidth = Math.max(3, Math.min(8, laneWidth * 0.18));

      ctx.strokeStyle = isUp ? 'rgba(38, 166, 154, 0.55)' : 'rgba(239, 83, 80, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(centerX, yHigh);
      ctx.lineTo(centerX, yLow);
      ctx.stroke();

      ctx.fillStyle = isUp ? 'rgba(38, 166, 154, 0.85)' : 'rgba(239, 83, 80, 0.85)';
      ctx.fillRect(centerX - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
    });

    // Draw each price row
    prices.forEach((price, rowIndex) => {
      const y = (rowIndex * ROW_HEIGHT) + HEADER_HEIGHT;
      
      // Skip if off-screen (canvas only translates, no scale applied)
      const screenY = transform.y + y;
      const screenBottom = screenY + ROW_HEIGHT;
      if (screenBottom < 0 || screenY > height) return;

      const isCurrentPriceRow = currentPriceBinned !== null && 
        Math.abs(price - currentPriceBinned) <= priceEps;

      // Subtle row separator instead of strong table banding
      ctx.fillStyle = isCurrentPriceRow ? colors.currentPriceBg : 'transparent';
      if (isCurrentPriceRow) {
        ctx.fillRect(0, y, tableWidth, ROW_HEIGHT);
      }
      // Reduce grid density to avoid the "table" feeling
      const isMajor = rowIndex % 5 === 0;
      const isMinor = rowIndex % 2 === 0;
      if (isMajor || isMinor || isCurrentPriceRow) {
        ctx.strokeStyle = isCurrentPriceRow ? colors.gridStrong : (isMajor ? colors.gridStrong : colors.grid);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + ROW_HEIGHT);
        ctx.lineTo(tableWidth, y + ROW_HEIGHT);
        ctx.stroke();
      }

      // Draw cells for each candle
      aggCandles.forEach((candle, colIndex) => {
        const x = colIndex * colWidth;
        const isUp = candle.close >= candle.open;
        
        // Find bucket for this price
        const bucket = candle.aggBuckets?.find(b => 
          Math.abs(b.price - price) <= priceEps
        );

        if (!bucket) {
          return;
        }

        if (hideFootprint) {
          return;
        }

        const buyVol = Number(bucket.buy_vol) || 0;
        const sellVol = Number(bucket.sell_vol) || 0;
        const delta = Number(bucket.delta) || 0;

        // Calculate volume opacity
        const cellVol = buyVol + sellVol;
        const opacity = Math.min(cellVol / maxVol, 1.0);

        // Background color based on delta
        const isBuyDom = delta > 0;
        const laneWidth = Math.max(1, Math.min(colWidth, smoothFootprintWidth || footprintLayout.footprintWidth));
        const laneLeft = x + Math.max(2, (colWidth - laneWidth) / 2);

        if (footprintLayout.showBars) {
          ctx.fillStyle = isBuyDom
            ? `rgba(38, 166, 154, ${opacity * 0.35})`
            : `rgba(239, 83, 80, ${opacity * 0.35})`;
          ctx.fillRect(laneLeft, y, laneWidth, ROW_HEIGHT);
        }

        const leftBar = Math.max(1, Math.min(laneWidth * 0.48, (sellVol / maxVol) * laneWidth));
        const rightBar = Math.max(1, Math.min(laneWidth * 0.48, (buyVol / maxVol) * laneWidth));

        ctx.fillStyle = colors.sellVol;
        ctx.fillRect(laneLeft + Math.max(1, (laneWidth / 2) - leftBar - 1), y + 4, leftBar, ROW_HEIGHT - 8);

        ctx.fillStyle = colors.buyVol;
        ctx.fillRect(laneLeft + (laneWidth / 2) + 1, y + 4, rightBar, ROW_HEIGHT - 8);

        if (footprintLayout.showNumbers) {
          ctx.font = '12px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = colors.sellVol;
          ctx.fillText(formatVol(sellVol), laneLeft + 4, y + ROW_HEIGHT / 2);
          ctx.textAlign = 'right';
          ctx.fillStyle = colors.buyVol;
          ctx.fillText(formatVol(buyVol), laneLeft + laneWidth - 4, y + ROW_HEIGHT / 2);
        }

        // Imbalance highlight
        const hasBackendFlags = bucket.flags && bucket.flags.length > 0;
        const buyImb = hasBackendFlags
          ? bucket.flags.some(f => f.type === 'IMB' && f.direction === 'buy')
          : buyVol > (sellVol * 3) && buyVol > 0;
        const sellImb = hasBackendFlags
          ? bucket.flags.some(f => f.type === 'IMB' && f.direction === 'sell')
          : sellVol > (buyVol * 3) && sellVol > 0;

        if (buyImb || sellImb) {
          ctx.fillStyle = buyImb ? colors.buyImbalanceBg : colors.sellImbalanceBg;
          ctx.fillRect(laneLeft, y, laneWidth, ROW_HEIGHT);
        }

        if (footprintLayout.showBars) {
          ctx.strokeStyle = isUp ? 'rgba(38, 166, 154, 0.18)' : 'rgba(239, 83, 80, 0.18)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(laneLeft, y + ROW_HEIGHT / 2);
          ctx.lineTo(laneLeft + laneWidth, y + ROW_HEIGHT / 2);
          ctx.stroke();
        }

        // Detection flags (non-IMB)
        if (showBadges && hasBackendFlags && !compactMode) {
          const badges = bucket.flags.filter(f => f.type !== 'IMB');
          if (badges.length > 0) {
            ctx.fillStyle = colors.flagColor;
            ctx.font = '10px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(badges.map(f => f.type).join(' '), laneLeft + laneWidth / 2, y + ROW_HEIGHT - 3);
          }
        }
      });
    });

    ctx.restore();
  }, [candles, aggCandles, prices, tickSize, lastPrice, colors, transform, showBadges]);

  // Redraw when data changes (don't include drawFootprint in deps to avoid infinite loop)
  useEffect(() => {
    // Skip if canvas isn't ready yet
    if (!ctxRef.current || sizeRef.current.width === 0) return;
    
    drawFootprint();
  }, [candles, aggCandles, prices, tickSize, lastPrice, transform, showBadges]); // Only redraw when data changes

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: '100',
      }}
    />
  );
}
