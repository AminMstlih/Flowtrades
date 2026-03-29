/**
 * DeltaCanvas — Canvas 2D Delta Indicator Panel
 *
 * Replaces DOM-based DeltaPane.jsx with Canvas rendering.
 * Shows per-candle cumulative delta as colored bars.
 */

import React, { useEffect, useRef } from 'react';
import { formatVol } from '../utils/formatVol';

const COLORS = {
  bg: '#0D1B2A',
  buy: '#26A69A',
  sell: '#EF5350',
  buyBg: 'rgba(38, 166, 154, 0.3)',
  sellBg: 'rgba(239, 83, 80, 0.3)',
  text: '#8FA8BE',
  textBuy: '#26A69A',
  textSell: '#EF5350',
  border: '#1E3448',
  label: '#8FA8BE',
};

const FONT = '10px "JetBrains Mono", "Roboto Mono", monospace';
const LABEL_FONT = 'bold 9px "JetBrains Mono", "Roboto Mono", monospace';

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

export const DeltaCanvas = React.memo(function DeltaCanvas({ latestDataRef }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const sizeRef = useRef({ width: 0, height: 0 });

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

  useEffect(() => {
    let animFrameId;

    function drawFrame() {
      const ctx = ctxRef.current;
      const data = latestDataRef.current;
      const { width, height } = sizeRef.current;

      if (ctx && data && width > 0 && height > 0) {
        drawDelta(ctx, data, width, height);
      }

      animFrameId = requestAnimationFrame(drawFrame);
    }

    animFrameId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animFrameId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="delta-canvas"
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
});

function drawDelta(ctx, data, W, H) {
  const candles = data.candles || [];

  // Clear
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // Top border
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0.5);
  ctx.lineTo(W, 0.5);
  ctx.stroke();

  // Label
  ctx.fillStyle = COLORS.label;
  ctx.font = LABEL_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('DELTA', 8, 4);

  if (candles.length === 0) return;

  // Extract deltas
  const deltas = candles.map(c => ({
    delta: c.delta || 0,
    close: c.close,
    open: c.open,
    start_time: c.start_time,
  }));

  const maxAbsDelta = Math.max(...deltas.map(d => Math.abs(d.delta)), 1);

  const PADDING_TOP = 18;
  const PADDING_BOTTOM = 16;
  const BAR_AREA_H = H - PADDING_TOP - PADDING_BOTTOM;
  const barWidth = Math.max(2, Math.floor((W - 20) / candles.length) - 2);
  const gap = Math.max(1, Math.floor((W - 20) / candles.length) - barWidth);
  const totalBarWidth = barWidth + gap;
  const startX = Math.max(10, W - candles.length * totalBarWidth - 10);

  deltas.forEach((d, i) => {
    const x = startX + i * totalBarWidth;
    const isBuy = d.delta >= 0;
    const pct = Math.min(Math.abs(d.delta) / maxAbsDelta, 1);
    const barH = Math.max(2, pct * BAR_AREA_H * 0.7);

    const barY = PADDING_TOP + (BAR_AREA_H - barH);

    // Bar
    ctx.fillStyle = isBuy ? COLORS.buy : COLORS.sell;
    ctx.globalAlpha = 0.7 + pct * 0.3;
    ctx.fillRect(x, barY, barWidth, barH);
    ctx.globalAlpha = 1;

    // Value text (only show if there's room)
    if (barWidth > 15 || i === deltas.length - 1) {
      ctx.fillStyle = isBuy ? COLORS.textBuy : COLORS.textSell;
      ctx.font = FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(formatVol(d.delta, true) || '', x + barWidth / 2, barY - 2);
    }

    // Time label at bottom (sparse — every Nth bar)
    const showTime = i === deltas.length - 1 || (candles.length <= 10) || (i % Math.ceil(candles.length / 8) === 0);
    if (showTime && d.start_time) {
      const t = new Date(d.start_time);
      const timeStr = `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`;
      const isUp = d.close >= d.open;
      ctx.fillStyle = isUp ? COLORS.textBuy : COLORS.textSell;
      ctx.globalAlpha = 0.7;
      ctx.font = FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(timeStr, x + barWidth / 2, H - 2);
      ctx.globalAlpha = 1;
    }
  });
}
