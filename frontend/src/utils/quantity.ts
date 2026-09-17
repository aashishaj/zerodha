/**
 * Order-quantity helpers. Quantities move in whole lots, so a raw value typed
 * into a field has to be pulled back onto a whole multiple before it is used
 * or saved.
 */

/** Nearest whole multiple of `step`, never below a single step. */
export function snapToStep(value: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 1;
  if (!Number.isFinite(value) || value <= 0) return step;
  return Math.max(step, Math.round(value / step) * step);
}

/** True when `value` is a positive whole multiple of `step`. */
export function isWholeMultiple(value: number, step: number): boolean {
  if (!Number.isFinite(step) || step <= 0) return false;
  return Number.isInteger(value) && value > 0 && value % step === 0;
}
