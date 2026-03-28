import { getTickDecimals } from './tickSteps';

function getTickScale(tick) {
  const decimals = getTickDecimals(tick);
  const factor = Math.pow(10, decimals);
  const tickInt = Math.round(tick * factor);
  return { decimals, factor, tickInt };
}

export function binFloorPrice(value, tick) {
  if (!Number.isFinite(value) || !Number.isFinite(tick) || tick <= 0) return 0;
  const { tickInt, factor } = getTickScale(tick);
  const vInt = Math.round(value * factor);
  return Math.floor(vInt / tickInt);
}

export function binCeilPrice(value, tick) {
  if (!Number.isFinite(value) || !Number.isFinite(tick) || tick <= 0) return 0;
  const { tickInt, factor } = getTickScale(tick);
  const vInt = Math.round(value * factor);
  return Math.ceil(vInt / tickInt);
}

export function binRoundPrice(value, tick) {
  if (!Number.isFinite(value) || !Number.isFinite(tick) || tick <= 0) return 0;
  const { tickInt, factor } = getTickScale(tick);
  const vInt = Math.round(value * factor);
  return Math.round(vInt / tickInt);
}

export function unbinPrice(bin, tick) {
  if (!Number.isFinite(bin) || !Number.isFinite(tick) || tick <= 0) return 0;
  const { decimals, factor, tickInt } = getTickScale(tick);
  const q = (bin * tickInt) / factor;
  return Number(q.toFixed(decimals));
}

export function quantizeFloorPrice(value, tick) {
  return unbinPrice(binFloorPrice(value, tick), tick);
}

