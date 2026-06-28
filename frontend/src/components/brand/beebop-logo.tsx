/**
 * Beebop brand marks — the single source for the logo in the product UI.
 * Derived from `beebop branding/beebop-logo-kit` and its Brand Specification.
 *
 * THE ONE RULE: the triad's cells are ALWAYS hollow (`fill="none"`, stroke
 * only). A filled triad becomes a generic badge and loses its meaning — never
 * add a fill. Tone is set by text color via `currentColor`:
 *   • text-brand (Honey #F0980F) — standard, on light grounds (default)
 *   • text-ink   (Hive Black)    — one-color / mono
 *   • text-paper / text-white    — knockout, on dark or honey grounds
 */

import { cn } from '@/lib/cn';

interface BeebopMarkProps {
  /** Square px size. Brand floor is 16px; below that use the favicon cell. */
  size?: number;
  /** Decorative inside a lockup (text carries the name) → hidden from a11y tree. */
  decorative?: boolean;
  className?: string;
}

/**
 * The triad mark — three hollow honeycomb cells in rotational symmetry.
 * Stroke uses `currentColor`; defaults to Honey via `text-brand`.
 */
export function BeebopMark({ size = 28, decorative = false, className }: BeebopMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      className={cn('shrink-0 text-brand', className)}
      {...(decorative
        ? { 'aria-hidden': true, role: 'presentation' as const }
        : { role: 'img' as const, 'aria-label': 'Beebop' })}
    >
      {/* Cells stay hollow — stroke only, never filled. */}
      <g fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinejoin="round">
        <path d="M28 6 l8 4.6 v9.2 l-8 4.6 l-8-4.6 v-9.2 Z" />
        <path d="M44 33 l-2 9 l-9 1 l-5-7.6 l4.6-7.9 Z" />
        <path d="M12 33 l2 9 l9 1 l5-7.6 l-4.6-7.9 Z" />
      </g>
    </svg>
  );
}

interface BeebopLockupProps {
  /** Mark size; the wordmark scales alongside via `wordClassName`. */
  size?: number;
  /** Extra classes on the wrapper (e.g. `justify-center`). */
  className?: string;
  /** Override the wordmark size/weight (default: title scale, SemiBold). */
  wordClassName?: string;
  /** Override the mark tone (e.g. `text-ink` for mono). */
  markClassName?: string;
}

/**
 * Horizontal lockup — mark + the lowercase "beebop" wordmark in Bricolage
 * Grotesque SemiBold (the brand display face). The wordmark is ALWAYS
 * lowercase per the spec ("one casing, everywhere"); never title-case it.
 */
export function BeebopLockup({ size = 28, className, wordClassName, markClassName }: BeebopLockupProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <BeebopMark size={size} decorative className={markClassName} />
      <span className={cn('font-display text-section font-semibold leading-none lowercase tracking-tight text-ink', wordClassName)}>
        beebop
      </span>
    </span>
  );
}
