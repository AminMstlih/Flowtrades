/**
 * Canvas utilities for HiDPI/Retina rendering.
 * 
 * Per UI Engineering Guide Section 1.4:
 * - All custom canvas overlays MUST support devicePixelRatio scaling
 * - Prevents blurry rendering on Retina/HiDPI displays
 */

/**
 * Setup a canvas with proper HiDPI scaling.
 * 
 * @param {HTMLCanvasElement} canvas - The canvas element to setup
 * @param {number} width - Logical width in CSS pixels
 * @param {number} height - Logical height in CSS pixels
 * @returns {CanvasRenderingContext2D} Scaled 2D context
 */
export function setupHiDPICanvas(canvas, width, height) {
  const dpr = window.devicePixelRatio || 1;
  
  // Physical pixel resolution (actual canvas buffer size)
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  
  // CSS size stays at logical pixels
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  
  // Scale context so drawing commands use logical pixels
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  
  return ctx;
}

/**
 * Resize canvas and maintain HiDPI scaling.
 * Call this on every ResizeObserver update.
 * 
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @param {number} width - New logical width
 * @param {number} height - New logical height
 * @returns {CanvasRenderingContext2D} Fresh scaled context
 */
export function resizeCanvas(canvas, width, height) {
  return setupHiDPICanvas(canvas, width, height);
}

/**
 * Get the device pixel ratio.
 * Useful for conditional rendering optimizations.
 * 
 * @returns {number} devicePixelRatio value
 */
export function getDevicePixelRatio() {
  return window.devicePixelRatio || 1;
}
