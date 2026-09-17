/** Price helpers for deriving order prices from a candle. */

/**
 * Round to a whole number with halves going DOWN: .1–.5 floors, .6–.9 ceils.
 * 283.5 → 283, 283.6 → 284, 288.9 → 289.
 *
 * Deliberately neither Math.round (which sends .5 up) nor the ceil-the-high /
 * floor-the-low pair this replaced, which always rounded away from the candle
 * and so pushed the entry a point further out than intended below .6.
 */
export function roundHalfDown(value: number): number {
  return Math.ceil(value - 0.5);
}
