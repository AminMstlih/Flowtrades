export const DETAIL_LEVEL = {
  FULL: 'full',
  COMPACT: 'compact',
  CANDLE_ONLY: 'candle_only',
};

export function getDetailLevel({ candleWidth = 0, visibleCandles = 0, viewportWidth = 0 } = {}) {
  if (candleWidth >= 68 && visibleCandles <= 12 && viewportWidth >= 680) {
    return DETAIL_LEVEL.FULL;
  }

  if (candleWidth >= 28 && visibleCandles <= 28) {
    return DETAIL_LEVEL.COMPACT;
  }

  return DETAIL_LEVEL.CANDLE_ONLY;
}

export function getDetailBlend({ candleWidth = 0, visibleCandles = 0, viewportWidth = 0 } = {}) {
  const widthFactor = Math.min(1, Math.max(0, (candleWidth - 24) / 80));
  const densityFactor = Math.min(1, Math.max(0, (24 - visibleCandles) / 18));
  const viewportFactor = Math.min(1, Math.max(0, (viewportWidth - 480) / 640));
  return Math.min(1, Math.max(0, (widthFactor * 0.5) + (densityFactor * 0.3) + (viewportFactor * 0.2)));
}

export function getFootprintWidth({ candleWidth = 0, detailLevel = DETAIL_LEVEL.CANDLE_ONLY } = {}) {
  if (detailLevel === DETAIL_LEVEL.FULL) {
    return Math.max(44, Math.min(84, candleWidth * 0.58));
  }

  if (detailLevel === DETAIL_LEVEL.COMPACT) {
    return Math.max(24, Math.min(44, candleWidth * 0.36));
  }

  return 0;
}

export function getSmoothFootprintWidth({ candleWidth = 0, visibleCandles = 0, viewportWidth = 0 } = {}) {
  const blend = getDetailBlend({ candleWidth, visibleCandles, viewportWidth });
  const maxWidth = Math.max(0, candleWidth * 0.5);
  const minWidth = 0;
  return minWidth + (maxWidth - minWidth) * blend;
}

export function getCandleFootprintLayout({ candleWidth = 0, detailLevel = DETAIL_LEVEL.CANDLE_ONLY } = {}) {
  const footprintWidth = getFootprintWidth({ candleWidth, detailLevel });
  const half = Math.max(1, Math.floor(footprintWidth / 2));
  return {
    footprintWidth,
    leftWidth: half,
    rightWidth: half,
    showNumbers: detailLevel !== DETAIL_LEVEL.CANDLE_ONLY,
    showBars: detailLevel !== DETAIL_LEVEL.CANDLE_ONLY,
  };
}

export function getVisibleDensity({ viewportHeight = 0, rows = 0 } = {}) {
  if (!viewportHeight || !rows) {
    return 0;
  }

  return viewportHeight / rows;
}

export function shouldShowFootprint(detailLevel) {
  return detailLevel !== DETAIL_LEVEL.CANDLE_ONLY;
}
