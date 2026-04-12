import React, { useMemo } from 'react';
import { formatVol } from '../utils/formatVol';
import { binFloorPrice, unbinPrice } from '../utils/priceBinning';

const CELL_HEIGHT = 24;

// Detection flag badge component
function DetectionBadge({ flag }) {
  const typeColors = {
    IMB: { bg: flag.direction === 'buy' ? 'rgba(0,230,118,0.25)' : 'rgba(255,23,68,0.25)', border: flag.direction === 'buy' ? '#00e676' : '#ff1744' },
    ABS: { bg: 'rgba(255,152,0,0.25)', border: '#ff9800' },
    EXH: { bg: 'rgba(156,39,176,0.25)', border: '#9c27b0' },
  };
  const colors = typeColors[flag.type] || typeColors.IMB;

  return (
    <span
      className="detection-badge"
      style={{
        display: 'inline-block',
        fontSize: '9px',
        padding: '1px 3px',
        borderRadius: '2px',
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.border,
        fontWeight: 'bold',
        cursor: 'help',
        marginLeft: '2px',
      }}
      title={flag.label}
    >
      {flag.type}
    </span>
  );
}

export function FootprintTable({ candles, aggCandles = [], maxVolumeGlobal = 1, prices: sharedPrices = null, tickSize = 1.0, lastPrice = null, showBadges = true }) {
  // Use pocsByCandle just like we computed it (we can recompute it minimally or just find the max dynamically if needed).
  // Actually, we can compute pocsByCandle here simply or pass it from App.jsx. Let's compute it simply for the table:
  const pocsByCandle = useMemo(() => {
    const pocs = {};
    (aggCandles || []).forEach((c, i) => {
      let maxV = -1;
      let pocPrice = null;
      (c.aggBuckets || []).forEach(b => {
        const v = b.buy_vol + b.sell_vol;
        if (v > maxV) {
          maxV = v;
          pocPrice = b.price;
        }
      });
      pocs[i] = pocPrice;
    });
    return pocs;
  }, [aggCandles]);

  const priceEps = tickSize / 1000;
  const currentPriceBinned = lastPrice !== null && lastPrice !== undefined
    ? unbinPrice(binFloorPrice(lastPrice, tickSize), tickSize)
    : null;
  const prices = useMemo(() => {
    const base = sharedPrices ? [...sharedPrices] : [];
    if (currentPriceBinned === null) return base;
    if (!base.some(p => Math.abs(p - currentPriceBinned) <= priceEps)) {
      base.push(currentPriceBinned);
      base.sort((a, b) => b - a);
    }
    return base;
  }, [sharedPrices, currentPriceBinned, priceEps]);

  if (!candles || candles.length === 0 || prices.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
        AWAITING TAPE DATA...
      </div>
    );
  }

  return (
    <table className="footprint-chart" style={{ borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {aggCandles.map((c, i) => {
            const isUp = c.close >= c.open;
            return <th key={i} style={{ color: isUp ? 'var(--buy-green)' : 'var(--sell-red)' }}></th>;
          })}
        </tr>
      </thead>
      <tbody>
        {prices.map(price => {
          const isCurrentPriceRow = currentPriceBinned !== null && Math.abs(price - currentPriceBinned) <= priceEps;

          return (
            <tr key={price} className={isCurrentPriceRow ? 'current-price-row' : ''} style={{ height: `${CELL_HEIGHT}px`, background: isCurrentPriceRow ? 'rgba(255,152,0,0.05)' : 'transparent' }}>
              {aggCandles.map((c, i) => {
                const bucket = c.aggBuckets?.find(b => Math.abs(b.price - price) <= priceEps);
                const isPOC = pocsByCandle[i] !== null && Math.abs(pocsByCandle[i] - price) <= priceEps;

                const isBody = price <= Math.max(c.open, c.close) && price >= Math.min(c.open, c.close);
                const isWick = price <= c.high && price >= c.low;
                const isUp = c.close >= c.open;

                let candleLineClass = "";
                if (isBody) candleLineClass = isUp ? 'ohlc-body-up' : 'ohlc-body-down';
                else if (isWick) candleLineClass = isUp ? 'ohlc-wick-up' : 'ohlc-wick-down';

                const isLastCandle = i === aggCandles.length - 1;
                const isLivePriceCell = isLastCandle && isCurrentPriceRow;

                if (!bucket) {
                  return (
                    <td key={i} className={`exo-cell ${isLivePriceCell ? 'live-cell-blink' : ''}`}>
                      <div className={`ohlc-line-center ${candleLineClass}`}></div>
                    </td>
                  );
                }

                const cellVol = bucket.buy_vol + bucket.sell_vol;
                const opacity = Math.min(cellVol / maxVolumeGlobal, 1.0);
                const isBuyDom = bucket.delta > 0;

                const bgStyle = isBuyDom
                  ? { backgroundColor: `rgba(0, 230, 118, ${opacity * 0.4})` }
                  : { backgroundColor: `rgba(255, 23, 68, ${opacity * 0.4})` };

                // Use backend detection flags if available, fallback to client-side
                const hasBackendFlags = bucket.flags && bucket.flags.length > 0;
                const buyImb = hasBackendFlags
                  ? bucket.flags.some(f => f.type === 'IMB' && f.direction === 'buy')
                  : bucket.buy_vol > (bucket.sell_vol * 3) && bucket.buy_vol > 0;
                const sellImb = hasBackendFlags
                  ? bucket.flags.some(f => f.type === 'IMB' && f.direction === 'sell')
                  : bucket.sell_vol > (bucket.buy_vol * 3) && bucket.sell_vol > 0;

                // Collect non-IMB detection flags for badges
                const badges = hasBackendFlags
                  ? bucket.flags.filter(f => f.type !== 'IMB')
                  : [];

                return (
                  <td
                    key={i}
                    className={`exo-cell ${isPOC ? 'poc-cell' : ''} ${isLivePriceCell ? 'live-cell-blink' : ''}`}
                    style={bgStyle}
                  >
                    <div className={`ohlc-line-center ${candleLineClass}`}></div>
                    <div className="exo-splits">
                      <span className={`vol-left ${sellImb ? 'imb-sell' : ''}`}>{formatVol(bucket.sell_vol)}</span>
                      <span className={`vol-right ${buyImb ? 'imb-buy' : ''}`}>{formatVol(bucket.buy_vol)}</span>
                    </div>
                    {showBadges && badges.length > 0 && (
                      <div className="detection-badges" style={{ position: 'absolute', bottom: '1px', right: '1px' }}>
                        {badges.map((flag, fi) => <DetectionBadge key={fi} flag={flag} />)}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        {/* Volume Bar Row - stays in chart */}
        <tr className="indicator-row">
          {aggCandles.map((c, i) => {
            const totalVol = c.buy_vol + c.sell_vol;
            const volPct = maxVolumeGlobal > 0 ? Math.min((totalVol / maxVolumeGlobal) * 100, 100) : 0;
            const isUp = c.close >= c.open;
            return (
              <td key={i} className="indicator-cell">
                <div className="vol-bar-container">
                  <div
                    className={`vol-bar ${isUp ? 'vol-bar-up' : 'vol-bar-down'}`}
                    style={{ height: `${volPct}%` }}
                  />
                </div>
              </td>
            );
          })}
        </tr>
      </tfoot>
    </table>
  );
}
