const DEFAULT_MAX_DECIMALS = 8;

export const DEFAULT_INSTRUMENT = {
  symbol: 'BTCUSDT',
  displaySymbol: 'BTC/USDT',
  priceStepPct: 0.0005,
  minTick: 0.00000001,
  maxTick: 1000000,
};

function decimalsFromNumber(value) {
  const str = Number(value).toString();
  if (!str.includes('.')) return 0;
  return Math.min(DEFAULT_MAX_DECIMALS, str.split('.')[1].length);
}

export function inferInstrument({ symbol, lastPrice } = {}) {
  const price = Number(lastPrice);
  const safePrice = Number.isFinite(price) && price > 0 ? price : 0;
  const base = { ...DEFAULT_INSTRUMENT };

  if (typeof symbol === 'string' && symbol.trim()) {
    base.symbol = symbol.trim();
    base.displaySymbol = symbol.trim().replace(/USDT$/i, '/USDT');
  }

  if (safePrice > 0) {
    const rawTick = safePrice * base.priceStepPct;
    base.recommendedTick = clampTick(rawTick, base.minTick, base.maxTick);
    base.priceDecimals = decimalsFromNumber(base.recommendedTick);
    if (/^BTC/i.test(base.symbol)) {
      base.priceDecimals = 1;
    } else if (/^BEAT/i.test(base.symbol)) {
      base.priceDecimals = 4;
    } else if (/^HYPE/i.test(base.symbol)) {
      base.priceDecimals = 2;
    }
  } else {
    base.recommendedTick = 1;
    base.priceDecimals = 0;
  }

  return base;
}

export function clampTick(value, minTick, maxTick) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return minTick;
  return Math.min(Math.max(n, minTick), maxTick);
}

export function formatPrice(value, decimals = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '';
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
