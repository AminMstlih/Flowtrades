/**
 * Format a volume value for compact display.
 * Handles null/undefined/zero, and abbreviates thousands as "k".
 *
 * @param {number} vol - Volume to format.
 * @param {boolean} showSign - If true, prefix positive values with "+".
 * @returns {string} Formatted volume string.
 */
export function formatVol(vol, showSign = false) {
  if (vol === null || vol === undefined || isNaN(vol) || vol === 0) return "";
  if (vol >= 1000) return (vol / 1000).toFixed(1) + "k";
  if (vol <= -1000) return (vol / 1000).toFixed(1) + "k";
  const str = Math.round(vol).toString();
  return showSign && vol > 0 ? "+" + str : str;
}
