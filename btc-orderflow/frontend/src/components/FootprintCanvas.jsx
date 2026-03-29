/**
 * FootprintCanvas — Canvas 2D Footprint Ladder
 *
 * Guide Section 6.1 + 6.2:
 * - Raw HTML <canvas> element — no DOM table
 * - HiDPI scaling via devicePixelRatio (Section 1.4)
 * - Driven by requestAnimationFrame
 * - Colors: Buy #26A69A, Sell #EF5350, Flags #F9A825
 */

import React, { useEffect, useRef } from 'react';
import { formatVol } from '../utils/formatVol';

// Color tokens — Section 10
const COLORS = {
  bgPrimary: '#0D1B2A',
  bgRowAlt: '#0A1520',
  bgRowEven: '#111F2E',
  bgCurrentPrice: '#1A2A3A',
  textPrimary: '#E0E7EF',
  textSecondary: '#8FA8BE',
  buy: '#26A69A',
  sell: '#EF5350',
  neutral: '#546E7A',
  flag: '#F9A825',
  imbBuyBg: '#0D3B2E',
  imbSellBg: '#3B0D0D',
  borderSubtle: '#1E3448',
  pocBg: 'rgba(255, 213, 79, 0.12)',
  pocBorder: 'rgba(255, 213, 79, 0.5)',
};

const FONT = '11px "JetBrains Mono", "Roboto Mono", monospace';
const FONT_SMALL = '9px "JetBrains Mono", "Roboto Mono", monospace';
const FONT_FLAGS = '9px "JetBrains Mono", "Roboto Mono", monospace';

// Column layout
const COL = {
  price: 75,
  buy: 65,
  sell: 65,
  delta: 65,
  imbalance: 60,
  flags: 50,
};
const TOTAL_COL_WIDTH = Object.values(COL).reduce((a, b) => a + b, 0);

function setupHiDPICanvas(canvas, width, height) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return ctx;
}

export const FootprintCanvas = React.memo(function FootprintCanvas({ latestDataRef }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const sizeRef = useRef({ width: 0, height: 0 });

  // ResizeObserver — Section 1.4 + 8.2
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      sizeRef.current = { width, height };
      ctxRef.current = setupHiDPICanvas(canvas, width, height);
    });

    observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, []);

  // requestAnimationFrame render loop
  useEffect(() => {
    let animFrameId;

    function drawFrame() {
      const ctx = ctxRef.current;
      const data = latestDataRef.current;
      const { width, height } = sizeRef.current;

      if (ctx && data && width > 0 && height > 0) {
        drawFootprint(ctx, data, width, height);
      }

      animFrameId = requestAnimationFrame(drawFrame);
    }

    animFrameId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animFrameId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="footprint-canvas"
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
});

/**
 * Draw the footprint ladder — Section 6.2 algorithm
 */
function drawFootprint(ctx, data, W, H) {
  const candles = data.candles || [];
  if (candles.length === 0) {
    // Draw "awaiting data" message
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COLORS.bgPrimary;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = COLORS.textSecondary;
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.fillText('AWAITING TAPE DATA...', W / 2, H / 2);
    return;
  }

  // Use the latest candle's buckets for the footprint ladder
  const latestCandle = candles[candles.length - 1];
  const buckets = latestCandle?.buckets || [];

  if (buckets.length === 0) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COLORS.bgPrimary;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = COLORS.textSecondary;
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.fillText('NO BUCKET DATA', W / 2, H / 2);
    return;
  }

  // Sort buckets descending by price
  const sorted = [...buckets].sort((a, b) => b.price - a.price);

  // Find max volume for opacity scaling
  const maxVol = Math.max(...sorted.map(b => (b.buy_vol || 0) + (b.sell_vol || 0)), 1);

  // Find POC (Point of Control)
  let pocPrice = null;
  let pocVol = 0;
  sorted.forEach(b => {
    const vol = (b.buy_vol || 0) + (b.sell_vol || 0);
    if (vol > pocVol) {
      pocVol = vol;
      pocPrice = b.price;
    }
  });

  const currentPrice = data.last_price;

  // Determine row height based on available space
  const ROW_HEIGHT = Math.max(18, Math.min(28, Math.floor(H / sorted.length)));
  const HEADER_H = 24;

  // Clear canvas
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = COLORS.bgPrimary;
  ctx.fillRect(0, 0, W, H);

  // Draw column headers
  ctx.fillStyle = '#111F2E';
  ctx.fillRect(0, 0, W, HEADER_H);
  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = FONT_SMALL;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let hx = 0;
  const headers = ['PRICE', 'BID', 'ASK', 'DELTA', 'IMB%', 'FLAGS'];
  const colWidths = [COL.price, COL.buy, COL.sell, COL.delta, COL.imbalance, COL.flags];

  // Scale columns to fit available width
  const scale = Math.min(1, W / TOTAL_COL_WIDTH);
  const scaledWidths = colWidths.map(w => Math.floor(w * scale));

  headers.forEach((h, i) => {
    ctx.fillText(h, hx + scaledWidths[i] / 2, HEADER_H / 2);
    hx += scaledWidths[i];
  });

  // Draw header border
  ctx.strokeStyle = COLORS.borderSubtle;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, HEADER_H);
  ctx.lineTo(W, HEADER_H);
  ctx.stroke();

  // Draw rows
  const scrollOffset = 0;
  const visibleRows = Math.floor((H - HEADER_H) / ROW_HEIGHT);
  const startIdx = Math.max(0, Math.floor(scrollOffset / ROW_HEIGHT));
  const endIdx = Math.min(sorted.length, startIdx + visibleRows + 1);

  for (let i = startIdx; i < endIdx; i++) {
    const row = sorted[i];
    const y = HEADER_H + (i - startIdx) * ROW_HEIGHT;

    if (y + ROW_HEIGHT < 0 || y > H) continue; // Off-screen

    const cellVol = (row.buy_vol || 0) + (row.sell_vol || 0);
    const opacity = Math.min(cellVol / maxVol, 1.0);
    const delta = row.delta || 0;
    const isBuyDom = delta > 0;
    const isPOC = pocPrice !== null && row.price === pocPrice;
    const isCurrentPrice = currentPrice && Math.abs(row.price - currentPrice) < 1;

    // Row background
    if (isCurrentPrice) {
      ctx.fillStyle = COLORS.bgCurrentPrice;
    } else if (isPOC) {
      ctx.fillStyle = COLORS.pocBg;
    } else {
      ctx.fillStyle = i % 2 === 0 ? COLORS.bgRowEven : COLORS.bgRowAlt;
    }
    ctx.fillRect(0, y, W, ROW_HEIGHT);

    // Volume heatmap layer
    if (cellVol > 0) {
      ctx.fillStyle = isBuyDom
        ? `rgba(38, 166, 154, ${opacity * 0.25})`
        : `rgba(239, 83, 80, ${opacity * 0.25})`;
      ctx.fillRect(0, y, W, ROW_HEIGHT);
    }

    // POC border
    if (isPOC) {
      ctx.strokeStyle = COLORS.pocBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, y + 0.5, W - 1, ROW_HEIGHT - 1);
    }

    // Current price marker
    if (isCurrentPrice) {
      ctx.fillStyle = COLORS.flag;
      ctx.fillRect(0, y, 3, ROW_HEIGHT);
    }

    // Text rendering
    ctx.textBaseline = 'middle';
    const textY = y + ROW_HEIGHT / 2;
    let x = 0;

    // Price
    ctx.fillStyle = isCurrentPrice ? '#FFFFFF' : COLORS.textPrimary;
    ctx.font = isCurrentPrice ? 'bold ' + FONT : FONT;
    ctx.textAlign = 'right';
    ctx.fillText(row.price.toFixed(1), x + scaledWidths[0] - 6, textY);
    x += scaledWidths[0];

    // Buy volume (bid)
    const buyImb = row.buy_vol > (row.sell_vol * 3) && row.buy_vol > 0;
    ctx.fillStyle = buyImb ? COLORS.buy : COLORS.textSecondary;
    ctx.font = buyImb ? 'bold ' + FONT : FONT;
    ctx.textAlign = 'right';
    ctx.fillText(formatVol(row.buy_vol) || '—', x + scaledWidths[1] - 6, textY);
    x += scaledWidths[1];

    // Sell volume (ask)
    const sellImb = row.sell_vol > (row.buy_vol * 3) && row.sell_vol > 0;
    ctx.fillStyle = sellImb ? COLORS.sell : COLORS.textSecondary;
    ctx.font = sellImb ? 'bold ' + FONT : FONT;
    ctx.textAlign = 'right';
    ctx.fillText(formatVol(row.sell_vol) || '—', x + scaledWidths[2] - 6, textY);
    x += scaledWidths[2];

    // Delta
    ctx.fillStyle = delta >= 0 ? COLORS.buy : COLORS.sell;
    ctx.font = FONT;
    ctx.textAlign = 'right';
    const deltaStr = delta !== 0 ? ((delta >= 0 ? '+' : '') + formatVol(delta)) : '—';
    ctx.fillText(deltaStr, x + scaledWidths[3] - 6, textY);
    x += scaledWidths[3];

    // Imbalance
    const imb = row.imbalance;
    if (imb !== null && imb !== undefined) {
      if (Math.abs(imb) >= 70) {
        ctx.fillStyle = imb > 0 ? COLORS.imbBuyBg : COLORS.imbSellBg;
        ctx.fillRect(x, y, scaledWidths[4], ROW_HEIGHT);
      }
      ctx.fillStyle = imb >= 0 ? COLORS.buy : COLORS.sell;
      ctx.font = FONT;
      ctx.textAlign = 'right';
      ctx.fillText((imb >= 0 ? '+' : '') + Math.round(imb) + '%', x + scaledWidths[4] - 6, textY);
    }
    x += scaledWidths[4];

    // Detection flags
    const flags = row.flags || [];
    if (flags.length > 0) {
      ctx.fillStyle = COLORS.flag;
      ctx.font = FONT_FLAGS;
      ctx.textAlign = 'left';
      const flagStr = flags.map(f => f.type || f).join(' ');
      ctx.fillText(flagStr, x + 4, textY);
    }

    // Row separator
    ctx.strokeStyle = 'rgba(30, 52, 72, 0.5)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y + ROW_HEIGHT);
    ctx.lineTo(W, y + ROW_HEIGHT);
    ctx.stroke();
  }
}
