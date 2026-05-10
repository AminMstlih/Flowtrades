export const TICK_STEPS = [
  0.01, 0.02, 0.05,
  0.1, 0.2, 0.5,
  1, 2, 5,
  10, 20, 50,
  100, 200, 500,
  1000,
];

export function getTickDecimals(tick) {
  const s = Number(tick).toString();
  if (!s.includes('.')) return 0;
  const parts = s.split('.');
  return Math.min(8, parts[1].length);
}

export function getTickStepsForPrice(price) {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return TICK_STEPS.slice();

  // Find a reasonable center step based on 0.05% of price
  const target = p * 0.0005;
  
  // Return all static tick steps that are remotely in the ballpark
  // so the user has a clean, standard dropdown (1, 2, 5, 10, etc)
  return TICK_STEPS.filter(step => step >= target / 100 && step <= target * 100);
}

export function getRecommendedTick(price) {
  const steps = getTickStepsForPrice(price);
  if (steps.length === 0) return 1;
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return steps[0];

  const target = p * 0.0005;
  let best = steps[0];
  let bestDist = Math.abs(best - target);
  for (const step of steps) {
    const dist = Math.abs(step - target);
    if (dist < bestDist) {
      best = step;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Snap a raw tick size to a pre-defined set so the UI is stable cross-platform.
 * mode:
 * - 'nearest': closest by absolute difference (manual drag)
 * - 'fit': pick the smallest step >= raw so range fits vertically
 */
export function snapTick(rawTick, mode = 'nearest') {
  if (!Number.isFinite(rawTick) || rawTick <= 0) return TICK_STEPS[0];

  const steps = TICK_STEPS.slice().sort((a, b) => a - b);
  const clamped = Math.min(Math.max(rawTick, steps[0]), steps[steps.length - 1]);

  if (mode === 'fit') {
    for (const s of steps) {
      if (s + 1e-12 >= clamped) return s;
    }
    return steps[steps.length - 1];
  }

  // nearest
  let best = steps[0];
  let bestDist = Math.abs(clamped - best);
  for (const s of steps) {
    const d = Math.abs(clamped - s);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

