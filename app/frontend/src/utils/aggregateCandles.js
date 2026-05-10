import { binFloorPrice, unbinPrice } from './priceBinning';

export function aggregateCandles(candles, tickSize) {
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
            // Deduplicate flags by type (e.g. only one ABS per aggregated block)
            const existing = agg.flags.find(ef => ef.type === f.type);
            if (!existing) {
              agg.flags.push({ ...f });
            } else if ((f.severity || 0) > (existing.severity || 0)) {
              // Keep the highest severity instance
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

    newlyAggregatedCandles.push({
      ...c,
      aggBuckets: Array.from(aggregatedBuckets.values())
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
