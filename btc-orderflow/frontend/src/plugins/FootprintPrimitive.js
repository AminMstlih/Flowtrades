import { formatVol } from '../utils/formatVol';

const POC_BORDER = 'rgba(255, 213, 79, 0.6)';

/**
 * FootprintRenderer — Canvas 2D draw loop.
 *
 * Uses useMediaCoordinateSpace (CSS pixel coordinates).
 * timeToCoordinate() and priceToCoordinate() return CSS pixels — matching.
 */
class FootprintRenderer {
  constructor(primitive) {
    this._primitive = primitive;
  }

  draw(target) {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const chart = this._primitive.chart;
      const series = this._primitive.series;
      if (!chart || !series) return;

      const timeScale = chart.timeScale();

      try {
        const logicalRange = timeScale.getVisibleLogicalRange();
        if (!logicalRange) return;

        const dataMap = this._primitive.data;
        if (!dataMap || dataMap.size === 0) return;

        const visibleBars = Math.max(1, logicalRange.to - logicalRange.from);
        const chartWidth = (typeof timeScale.width === 'function') ? timeScale.width() : 800;
        const barSpacingPx = chartWidth / visibleBars;

        // Skip only if truly microscopic
        if (barSpacingPx < 4) return;

        // Cell width in CSS pixels
        const cellWidth = Math.min(barSpacingPx * 0.8, 160);
        const halfWidth = cellWidth / 2;

        ctx.save();

        for (const [timeInt, footprintItem] of dataMap.entries()) {
          const x = timeScale.timeToCoordinate(timeInt);
          if (x === null || x === undefined) continue;

          const buckets = footprintItem.buckets || [];
          if (buckets.length === 0) continue;
          const pocPrice = footprintItem.pocPrice;

          // Tick size from bucket spacing
          let tickSize = 1;
          if (buckets.length > 1) {
            tickSize = Math.abs(buckets[0].price - buckets[1].price);
          }
          if (!tickSize || tickSize === 0) tickSize = 1;

          // Tick height in CSS pixels
          const yA = series.priceToCoordinate(buckets[0].price);
          const yB = series.priceToCoordinate(buckets[0].price + tickSize);
          if (yA === null || yB === null) continue;
          const tickHeight = Math.abs(yA - yB);

          // One-shot diagnostic log
          if (!this._primitive._logged) {
            console.log('[FP] Coords:', {
              x, yA, yB, tickHeight, barSpacingPx, cellWidth, halfWidth,
              firstPrice: buckets[0].price,
              bucketsCount: buckets.length,
            });
            this._primitive._logged = true;
          }

          // Max volume for heatmap scaling
          let maxVol = 0.001;
          let totalDelta = 0;
          for (const b of buckets) {
            const tv = (b.buy_vol || 0) + (b.sell_vol || 0);
            if (tv > maxVol) maxVol = tv;
            totalDelta += (b.buy_vol || 0) - (b.sell_vol || 0);
          }

          // Always show text if cell width allows — use minimum of 2px tick height
          const effectiveTickH = Math.max(tickHeight, 2);
          const showText = (cellWidth > 20);

          // Font size adapts to cell height but has a reasonable minimum
          const fontSize = Math.max(8, Math.min(11, effectiveTickH * 0.8));
          ctx.font = `bold ${fontSize}px "JetBrains Mono", monospace`;

          // Central spine
          const firstY = series.priceToCoordinate(buckets[0].price);
          const lastY = series.priceToCoordinate(buckets[buckets.length - 1].price);
          if (firstY !== null && lastY !== null) {
            ctx.beginPath();
            ctx.moveTo(x, firstY);
            ctx.lineTo(x, lastY);
            ctx.strokeStyle = 'rgba(143, 168, 190, 0.4)';
            ctx.lineWidth = 1;
            ctx.stroke();
          }

          // Render each bucket
          for (const bucket of buckets) {
            const y = series.priceToCoordinate(bucket.price);
            if (y === null) continue;

            const buyVol = bucket.buy_vol || 0;
            const sellVol = bucket.sell_vol || 0;
            const vol = buyVol + sellVol;
            if (vol === 0) continue;

            const cellH = Math.max(effectiveTickH, 2);
            const halfH = cellH / 2;
            const intensity = vol / maxVol;

            // Heatmap alpha — ensure always visible
            let bidAlpha = 0.2 + intensity * 0.6;
            let askAlpha = 0.2 + intensity * 0.6;
            const imb = bucket.imbalance || 0;
            if (Math.abs(imb) >= 70) {
              if (imb > 0) askAlpha = Math.min(0.95, askAlpha + 0.3);
              else bidAlpha = Math.min(0.95, bidAlpha + 0.3);
            }

            // Bid bar (left of spine) — minimum 3px width so always visible
            const bidBarW = Math.max(3, halfWidth * (buyVol / maxVol));
            ctx.fillStyle = `rgba(239, 83, 80, ${bidAlpha.toFixed(2)})`;
            ctx.fillRect(x - bidBarW, y - halfH, bidBarW, cellH);

            // Ask bar (right of spine) — minimum 3px width
            const askBarW = Math.max(3, halfWidth * (sellVol / maxVol));
            ctx.fillStyle = `rgba(38, 166, 154, ${askAlpha.toFixed(2)})`;
            ctx.fillRect(x, y - halfH, askBarW, cellH);

            // POC highlight
            if (pocPrice !== null && bucket.price === pocPrice) {
              ctx.strokeStyle = POC_BORDER;
              ctx.lineWidth = 1.5;
              ctx.strokeRect(x - halfWidth, y - halfH, cellWidth, cellH);
            }

            // Text labels — always show when cell width allows
            if (showText && cellH >= 2) {
              ctx.save();
              ctx.fillStyle = '#FFFFFF';
              ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
              ctx.shadowBlur = 3;
              ctx.textBaseline = 'middle';

              ctx.textAlign = 'right';
              const buyText = formatVol(buyVol);
              if (buyText) ctx.fillText(buyText, x - 3, y);

              ctx.textAlign = 'left';
              const sellText = formatVol(sellVol);
              if (sellText) ctx.fillText(sellText, x + 3, y);
              ctx.restore();
            }
          }

          // Delta label below candle
          if (cellWidth > 20) {
            const lowestPrice = Math.min(...buckets.map(b => b.price));
            const lowestY = series.priceToCoordinate(lowestPrice);
            if (lowestY !== null) {
              ctx.save();
              ctx.fillStyle = totalDelta > 0 ? '#26A69A' : (totalDelta < 0 ? '#EF5350' : '#8FA8BE');
              ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
              ctx.shadowBlur = 3;
              ctx.font = `bold ${fontSize + 1}px "JetBrains Mono", monospace`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              const prefix = totalDelta > 0 ? '+' : '';
              ctx.fillText(`Δ${prefix}${formatVol(totalDelta)}`, x, lowestY + effectiveTickH + 4);
              ctx.restore();
            }
          }
        }

        ctx.restore();
      } catch (err) {
        ctx.save();
        ctx.fillStyle = 'red';
        ctx.font = '16px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`Footprint Error: ${err.message}`, 10, 30);
        ctx.restore();
        console.error('[FootprintPrimitive]', err);
      }
    });
  }
}

class FootprintPaneView {
  constructor(primitive) {
    this._primitive = primitive;
  }

  update() {}

  zOrder() {
    return 'top';
  }

  renderer() {
    return new FootprintRenderer(this._primitive);
  }
}

export class FootprintPrimitive {
  constructor() {
    this.chart = null;
    this.series = null;
    this._requestUpdate = null;
    this.data = new Map();
    this._logged = false;
  }

  attached(param) {
    this.chart = param.chart;
    this.series = param.series;
    this._requestUpdate = param.requestUpdate;
  }

  detached() {
    this.chart = null;
    this.series = null;
    this._requestUpdate = null;
  }

  updateAll() {
    if (this._requestUpdate) {
      this._requestUpdate();
    }
  }

  paneViews() {
    return [new FootprintPaneView(this)];
  }

  setData(candles) {
    this.data.clear();
    for (const c of candles) {
      const time = Math.floor((c.start_time || c.ts || 0) / 1000);
      let pocPrice = null;
      let pocVol = 0;

      for (const b of (c.buckets || [])) {
        const vol = (b.buy_vol || 0) + (b.sell_vol || 0);
        if (vol > pocVol) {
          pocVol = vol;
          pocPrice = b.price;
        }
      }

      this.data.set(time, { buckets: c.buckets || [], pocPrice });
    }
    this.updateAll();
  }
}
