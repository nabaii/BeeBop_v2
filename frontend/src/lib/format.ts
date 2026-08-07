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

/**
 * Abbreviated naira for secondary/derived figures, e.g. 3310000 → "₦3.31M".
 * Only for supporting type where the exact figure is shown elsewhere — a
 * headline price a seeker will actually be invoiced always uses formatNaira.
 */
export function formatNairaCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `₦${trimZeros(value / 1_000_000)}M`;
  if (Math.abs(value) >= 1_000) return `₦${trimZeros(value / 1_000)}K`;
  return formatNaira(value);
}

// 3.10 → "3.1", 3.00 → "3", 3.31 → "3.31"
function trimZeros(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, '');
}

/** Seconds → "0:48" / "1:32", for video duration badges. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
