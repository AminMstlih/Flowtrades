import { useRef, useEffect, useCallback } from 'react';
import { setupHiDPICanvas } from '../utils/canvas';
import { formatVol } from '../utils/formatVol';
import { binFloorPrice, unbinPrice } from '../utils/priceBinning';

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
  prices = [], 
  tickSize = 1.0, 
  lastPrice = null,
  chartRef = null 
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
    pocBorder: '#F9A825',
  };

  const ROW_HEIGHT = 24; // Logical pixels
  const priceEps = tickSize / 1000;

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
    
    // DEBUG: Draw a red border so we can see the canvas bounds
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    // Calculate current price
    const currentPriceBinned = lastPrice !== null && lastPrice !== undefined
      ? unbinPrice(binFloorPrice(lastPrice, tickSize), tickSize)
      : null;

    // Column positions
    const colWidth = 70;
    const priceColWidth = 80;
    const totalCols = candles.length;
    const tableWidth = priceColWidth + (totalCols * colWidth);

    // Draw each price row
    prices.forEach((price, rowIndex) => {
      const y = rowIndex * ROW_HEIGHT;
      
      // Skip if off-screen
      if (y < 0 || y > height) return;

      const isCurrentPriceRow = currentPriceBinned !== null && 
        Math.abs(price - currentPriceBinned) <= priceEps;

      // Row background
      ctx.fillStyle = isCurrentPriceRow ? colors.currentPriceBg : 
        (rowIndex % 2 === 0 ? colors.rowBgDark : colors.rowBgLight);
      ctx.fillRect(0, y, tableWidth, ROW_HEIGHT);

      // Price label
      ctx.fillStyle = isCurrentPriceRow ? '#FFFFFF' : '#8FA8BE';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(price.toFixed(1), priceColWidth - 8, y + ROW_HEIGHT / 2);

      // Draw cells for each candle
      candles.forEach((candle, colIndex) => {
        const x = priceColWidth + (colIndex * colWidth);
        
        // Find bucket for this price
        const bucket = candle.aggBuckets?.find(b => 
          Math.abs(b.price - price) <= priceEps
        );

        if (!bucket) {
          // Empty cell - draw OHLC line indicator
          const isUp = candle.close >= candle.open;
          const isBody = price <= Math.max(candle.open, candle.close) && 
                        price >= Math.min(candle.open, candle.close);
          const isWick = price <= candle.high && price >= candle.low;

          if (isBody || isWick) {
            ctx.fillStyle = isUp ? colors.buyVol : colors.sellVol;
            ctx.fillRect(x + colWidth / 2 - 1, y + 4, 2, ROW_HEIGHT - 8);
          }
          return;
        }

        // Calculate volume opacity
        const cellVol = bucket.buy_vol + bucket.sell_vol;
        const maxVol = Math.max(...candles.flatMap(c => 
          c.aggBuckets?.map(b => b.buy_vol + b.sell_vol) || [0]
        ), 1);
        const opacity = Math.min(cellVol / maxVol, 1.0);

        // Background color based on delta
        const isBuyDom = bucket.delta > 0;
        ctx.fillStyle = isBuyDom 
          ? `rgba(38, 166, 154, ${opacity * 0.4})`
          : `rgba(239, 83, 80, ${opacity * 0.4})`;
        ctx.fillRect(x, y, colWidth, ROW_HEIGHT);

        // Sell volume (left)
        ctx.fillStyle = colors.sellVol;
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(formatVol(bucket.sell_vol), x + 4, y + ROW_HEIGHT / 2);

        // Buy volume (right)
        ctx.fillStyle = colors.buyVol;
        ctx.textAlign = 'right';
        ctx.fillText(formatVol(bucket.buy_vol), x + colWidth - 4, y + ROW_HEIGHT / 2);

        // Imbalance highlight
        const hasBackendFlags = bucket.flags && bucket.flags.length > 0;
        const buyImb = hasBackendFlags
          ? bucket.flags.some(f => f.type === 'IMB' && f.direction === 'buy')
          : bucket.buy_vol > (bucket.sell_vol * 3) && bucket.buy_vol > 0;
        const sellImb = hasBackendFlags
          ? bucket.flags.some(f => f.type === 'IMB' && f.direction === 'sell')
          : bucket.sell_vol > (bucket.buy_vol * 3) && bucket.sell_vol > 0;

        if (buyImb || sellImb) {
          ctx.fillStyle = buyImb ? colors.buyImbalanceBg : colors.sellImbalanceBg;
          ctx.fillRect(x, y, colWidth, ROW_HEIGHT);
          
          // Redraw text on top
          ctx.fillStyle = buyImb ? colors.buyVol : colors.sellVol;
          ctx.font = 'bold 11px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.fillText(formatVol(bucket.sell_vol), x + 4, y + ROW_HEIGHT / 2);
          ctx.fillStyle = buyImb ? colors.buyVol : colors.sellVol;
          ctx.textAlign = 'right';
          ctx.fillText(formatVol(bucket.buy_vol), x + colWidth - 4, y + ROW_HEIGHT / 2);
        }

        // Detection flags (non-IMB)
        if (hasBackendFlags) {
          const badges = bucket.flags.filter(f => f.type !== 'IMB');
          if (badges.length > 0) {
            ctx.fillStyle = colors.flagColor;
            ctx.font = '9px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(badges.map(f => f.type).join(' '), x + colWidth / 2, y + ROW_HEIGHT - 3);
          }
        }
      });
    });
  }, [candles, prices, tickSize, lastPrice, colors]);

  // Redraw when data changes (don't include drawFootprint in deps to avoid infinite loop)
  useEffect(() => {
    // Skip if canvas isn't ready yet
    if (!ctxRef.current || sizeRef.current.width === 0) return;
    
    drawFootprint();
  }, [candles, prices, tickSize, lastPrice]); // Only redraw when data changes

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
