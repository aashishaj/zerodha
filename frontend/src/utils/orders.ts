/** Helpers for reasoning about Kite order rows. */

/**
 * Statuses an order can no longer leave. Everything else — OPEN, TRIGGER
 * PENDING, and the transient *PENDING states Kite passes through — is still
 * live on the exchange.
 */
const TERMINAL_STATUSES = new Set(["COMPLETE", "CANCELLED", "REJECTED"]);

/**
 * Whether an order is still live and so can be cancelled. Written as "not
 * terminal" rather than a list of cancellable states because Kite has many
 * transient ones (OPEN PENDING, MODIFY PENDING, AMO REQ RECEIVED …) and adds
 * more; missing one would wrongly hide the button on a live order.
 */
export function isOrderCancellable(status: string | undefined | null): boolean {
  if (!status) return false;
  return !TERMINAL_STATUSES.has(status.trim().toUpperCase());
}
