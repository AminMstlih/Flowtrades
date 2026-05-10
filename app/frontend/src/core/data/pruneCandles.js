const MAX_WINDOW_SEC = 86400; // 24 hours

export function pruneTimeWindow(candles, windowSec = MAX_WINDOW_SEC) {
  if (!candles || candles.length === 0) return [];
  
  const now = Date.now();
  const cutoffMs = now - (windowSec * 1000);
  
  return candles.filter(c => {
    const candleTime = c.start_time || c.end_time || c.timestamp || c.ts || now;
    return candleTime >= cutoffMs;
  });
}
