/**
 * Formatting helpers — one source of truth so a price reads the same
 * everywhere it appears. Pair with the <Price> component (or the
 * `tabular-nums` utility) so digits align column-to-column in lists.
 */

export interface NairaOptions {
  /** Max fraction digits. Defaults to 0 — prices are whole naira. */
  maximumFractionDigits?: number;
}

/** Format a number as naira, e.g. 1200000 → "₦1,200,000". */
export function formatNaira(value: number, { maximumFractionDigits = 0 }: NairaOptions = {}): string {
  return `₦${value.toLocaleString('en-NG', { maximumFractionDigits })}`;
}
