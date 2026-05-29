// ─────────────────────────────────────────────────────────────────────────────
// Flowtrades — WebWorker Aggregation & Price Ladder Computation
// Self-contained background thread for high-frequency footprint processing.
// ─────────────────────────────────────────────────────────────────────────────

// Constants
const CELL_HEIGHT = 24;
const HEADER_HEIGHT = 32;

// ── Binning Helpers ──────────────────────────────────────────────────────────

function getTickDecimals(tick) {
  const s = Number(tick).toString();
  if (!s.includes('.')) return 0;
  const parts = s.split('.');
  return Math.min(8, parts[1].length);
}

function getTickScale(tick) {
  const decimals = getTickDecimals(tick);
  const factor = Math.pow(10, decimals);
  const tickInt = Math.round(tick * factor);
  return { decimals, factor, tickInt };
}

function binFloorPrice(value, tick) {
  if (!Number.isFinite(value) || !Number.isFinite(tick) || tick <= 0) return 0;
  const { tickInt, factor } = getTickScale(tick);
  const vInt = Math.round(value * factor);
  return Math.floor(vInt / tickInt);
}

function binCeilPrice(value, tick) {
  if (!Number.isFinite(value) || !Number.isFinite(tick) || tick <= 0) return 0;
  const { tickInt, factor } = getTickScale(tick);
  const vInt = Math.round(value * factor);
  return Math.ceil(vInt / tickInt);
}

function unbinPrice(bin, tick) {
  if (!Number.isFinite(bin) || !Number.isFinite(tick) || tick <= 0) return 0;
  const { decimals, factor, tickInt } = getTickScale(tick);
  const q = (bin * tickInt) / factor;
  return Number(q.toFixed(decimals));
}

// ── Footprint Aggregation ────────────────────────────────────────────────────

function aggregateCandles(candles, tickSize) {
  if (!candles || candles.length === 0) {
    return { aggCandles: [], prices: [], pocsByCandle: {}, maxVolumeGlobal: 1 };
  }

  let maxVGlobal = 0;
  const uniquePrices = new Set();
  const pocs = {};
  const newlyAggregatedCandles = [];

  candles.forEach((c, i) => {
    let maxVolInCandle = -1;
    let pocPrice = null;
    const aggregatedBuckets = new Map();

    if (c.buckets) {
      c.buckets.forEach(b => {
        const rawPrice = Number(b.price);
        if (!Number.isFinite(rawPrice)) return;
        const binnedPrice = unbinPrice(binFloorPrice(rawPrice, tickSize), tickSize);
        uniquePrices.add(binnedPrice);

        if (!aggregatedBuckets.has(binnedPrice)) {
          aggregatedBuckets.set(binnedPrice, {
            price: binnedPrice,
            buy_vol: 0,
            sell_vol: 0,
            delta: 0,
            flags: []
          });
        }
        const agg = aggregatedBuckets.get(binnedPrice);
        agg.buy_vol += (b.buy_vol || 0);
        agg.sell_vol += (b.sell_vol || 0);
        agg.delta += (b.delta || 0);
        
        if (b.flags && Array.isArray(b.flags)) {
          b.flags.forEach(f => {
            const existing = agg.flags.find(ef => ef.type === f.type);
            if (!existing) {
              agg.flags.push({ ...f });
            } else if ((f.severity || 0) > (existing.severity || 0)) {
              Object.assign(existing, f);
            }
          });
        }
      });

      aggregatedBuckets.forEach(b => {
        const cellV = b.buy_vol + b.sell_vol;
        if (cellV > maxVGlobal) maxVGlobal = cellV;

        if (cellV > maxVolInCandle) {
          maxVolInCandle = cellV;
          pocPrice = b.price;
        }
      });
    }

    pocs[i] = pocPrice;

    // Pre-sort buckets descending by price for binary search culling
    const sortedBuckets = Array.from(aggregatedBuckets.values())
      .sort((a, b) => b.price - a.price);

    newlyAggregatedCandles.push({
      ...c,
      aggBuckets: sortedBuckets
    });
  });

  const pricesArray = Array.from(uniquePrices).sort((a, b) => b - a);

  return {
    aggCandles: newlyAggregatedCandles,
    prices: pricesArray,
    pocsByCandle: pocs,
    maxVolumeGlobal: Math.max(maxVGlobal, 1)
  };
}

// ── Price Ladder Generator ───────────────────────────────────────────────────

function generatePriceLadder(orderedCandles, lastPrice, tickSize) {
  if (!orderedCandles || orderedCandles.length === 0) {
    return { prices: [], minBin: 0, maxBin: -1 };
  }

  const uniqueBins = new Set();
  orderedCandles.forEach((c) => {
    if (typeof c.high === 'number') uniqueBins.add(binCeilPrice(c.high, tickSize));
    if (typeof c.low === 'number') uniqueBins.add(binFloorPrice(c.low, tickSize));
    if (c.buckets) {
      c.buckets.forEach((b) => {
        const rawPrice = Number(b.price);
        if (!Number.isFinite(rawPrice)) return;
        uniqueBins.add(binFloorPrice(rawPrice, tickSize));
      });
    }
  });

  if (typeof lastPrice === 'number' && lastPrice > 0) {
    uniqueBins.add(binFloorPrice(lastPrice, tickSize));
  }

  if (uniqueBins.size === 0) return { prices: [], minBin: 0, maxBin: -1 };

  const rawMax = Math.max(...Array.from(uniqueBins));
  const rawMin = Math.min(...Array.from(uniqueBins));
  const dataRangeBins = Math.max(rawMax - rawMin, 1);

  // Pad proportional to data range, capped at 30 bins
  const paddingBins = Math.min(30, Math.ceil(dataRangeBins * 0.15));
  const maxBin = rawMax + paddingBins;
  const minBin = rawMin - paddingBins;

  const binsCount = maxBin - minBin + 1;
  if (binsCount <= 0 || binsCount > 10000) return { prices: [], minBin: 0, maxBin: -1 };

  const prices = [];
  for (let bin = maxBin; bin >= minBin; bin -= 1) {
    prices.push(unbinPrice(bin, tickSize));
  }

  return { prices, minBin, maxBin };
}

// ── Message Listener ─────────────────────────────────────────────────────────

self.onmessage = (e) => {
  const { seqId, candles, tickSize, lastPrice } = e.data;

  try {
    const { aggCandles, maxVolumeGlobal } = aggregateCandles(candles, tickSize);
    const priceLadder = generatePriceLadder(candles, lastPrice, tickSize);

    self.postMessage({
      seqId,
      status: 'success',
      aggCandles,
      maxVolumeGlobal,
      priceLadder
    });
  } catch (error) {
    self.postMessage({
      seqId,
      status: 'error',
      error: error.message
    });
  }
};
