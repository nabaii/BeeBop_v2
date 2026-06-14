/**
 * Price — renders a naira amount with tabular numerals so figures align
 * digit-for-digit down a column (₦1,200,000 over ₦800,000). For a
 * marketplace, prices are data and deserve typographic discipline:
 * `tabular-nums` is wired in here so no call site can forget it.
 */

import { cn } from '@/lib/cn';
import { formatNaira, type NairaOptions } from '@/lib/format';

interface PriceProps extends NairaOptions {
  value: number | null | undefined;
  /** Shown when value is null/undefined (e.g. price on request). */
  fallback?: string;
  className?: string;
}

export function Price({ value, fallback = '—', className, maximumFractionDigits }: PriceProps) {
  return (
    <span className={cn('tabular-nums', className)}>
      {value == null ? fallback : formatNaira(value, { maximumFractionDigits })}
    </span>
  );
}
