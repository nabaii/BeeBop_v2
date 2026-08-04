'use client';

/**
 * Shared filter primitives for the explore sheet.
 *
 * Every filter control in the app renders through these, so a restyle happens
 * once. They replace the private `PillSet` that rent-filters and sales-filters
 * had each copy-pasted — two definitions of the same component that would
 * inevitably drift apart.
 *
 * Palette: selected states are Honey fill with `text-ink` (never white — the
 * contrast rule from the Hive system), unselected are hairline-on-white
 * warming to Nectar on hover.
 */

import { Check } from 'lucide-react';

import { cn } from '@/lib/cn';

/** A titled block inside the filter sheet. */
export function FilterSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div>
        <h3 className="text-caption font-semibold uppercase tracking-[0.18em] text-ink-soft">
          {title}
        </h3>
        {hint && <p className="mt-1 text-caption text-ink-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** A single selectable pill. The workhorse of the sheet. */
export function ToggleChip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-caption transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1',
        active
          ? 'border-brand bg-brand font-semibold text-ink'
          : 'border-hairline bg-white text-ink-muted hover:border-brand/40 hover:bg-nectar hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A labelled group of multi-select pills over string values. */
export function PillGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly (readonly [string, string])[];
  value: readonly string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(option: string) {
    onChange(
      value.includes(option) ? value.filter((v) => v !== option) : [...value, option],
    );
  }
  return (
    <fieldset>
      <legend className="mb-1.5 text-caption font-medium text-ink">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([option, text]) => (
          <ToggleChip key={option} active={value.includes(option)} onClick={() => toggle(option)}>
            {text}
          </ToggleChip>
        ))}
      </div>
    </fieldset>
  );
}

/** Multi-select pills over numbers — bedroom counts, where the top option is
 *  an "or more" bucket. */
export function NumberPillGroup({
  label,
  options,
  value,
  onChange,
  plusOnLast = true,
}: {
  label: string;
  options: readonly number[];
  value: readonly number[];
  onChange: (next: number[]) => void;
  plusOnLast?: boolean;
}) {
  function toggle(option: number) {
    onChange(
      value.includes(option) ? value.filter((v) => v !== option) : [...value, option],
    );
  }
  const last = options[options.length - 1];
  return (
    <fieldset>
      <legend className="mb-1.5 text-caption font-medium text-ink">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <ToggleChip
            key={option}
            active={value.includes(option)}
            onClick={() => toggle(option)}
            className="min-w-[2.75rem] justify-center"
          >
            {plusOnLast && option === last ? `${option}+` : option}
          </ToggleChip>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * "N or more" pills — a single-select floor, not a set of exact counts.
 *
 * Bathrooms want this shape rather than the exact-match `NumberPillGroup`:
 * nobody rules out a 3-bath house because they asked for 2, and the stored
 * value can be fractional (2.5).
 */
export function MinCountPills({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly number[];
  value: number | undefined;
  onChange: (next: number | undefined) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-caption font-medium text-ink">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        <ToggleChip active={value === undefined} onClick={() => onChange(undefined)}>
          Any
        </ToggleChip>
        {options.map((option) => (
          <ToggleChip
            key={option}
            active={value === option}
            onClick={() => onChange(value === option ? undefined : option)}
            className="min-w-[2.75rem] justify-center"
          >
            {option}+
          </ToggleChip>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * A full-width selectable row.
 *
 * The checkbox stays a real `<input>` (screen readers and form semantics need
 * it) but is visually replaced — a native checkbox was the loudest "unstyled"
 * signal left in the sheet. Focus is forwarded from the hidden input to the
 * visible row via `peer-focus-visible`, so keyboard users still see a ring.
 */
export function CheckRow({
  checked,
  onChange,
  label,
  adornment,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  /** Optional leading element, e.g. a verification tier dot. */
  adornment?: React.ReactNode;
}) {
  return (
    <label className="block cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        className={cn(
          'flex min-h-11 items-center gap-2.5 rounded-xl border px-3 py-2 text-body transition-colors',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-1',
          // Deliberately restrained when checked. Verification defaults to all
          // three tiers on, so a full-strength Honey row would make an
          // unfiltered sheet look heavily filtered — the tick box alone
          // carries the checked state, and real selections elsewhere keep
          // their emphasis.
          checked
            ? 'border-brand/40 bg-nectar/50 text-ink'
            : 'border-hairline bg-white text-ink-muted hover:bg-paper',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center rounded-[5px] border transition-colors',
            checked ? 'border-brand bg-brand text-ink' : 'border-ink-soft/60 bg-white',
          )}
        >
          {checked && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
        {adornment}
        <span className="min-w-0 flex-1">{label}</span>
      </span>
    </label>
  );
}

/**
 * Dual-thumb range slider built from two native `<input type="range">`.
 *
 * No dependency, and keyboard + screen-reader behaviour comes free — each
 * thumb is a real range input. The inputs are stacked; pointer events are
 * disabled on the track and re-enabled on the thumbs so whichever thumb you
 * grab is the one that moves, and z-order flips at the top of the range so the
 * max thumb stays reachable when both sit together.
 */
export function RangeSlider({
  min,
  max,
  step,
  value,
  onChange,
  format,
  label,
}: {
  min: number;
  max: number;
  step: number;
  /** Current [low, high]. Either end may equal the bound, meaning "unset". */
  value: [number, number];
  onChange: (next: [number, number]) => void;
  format: (value: number) => string;
  label: string;
}) {
  const [low, high] = value;
  const span = Math.max(1, max - min);
  const lowPct = ((low - min) / span) * 100;
  const highPct = ((high - min) / span) * 100;

  return (
    <div className="pt-1">
      <div className="mb-2 flex items-center justify-between text-caption tabular-nums text-ink">
        <span className="font-semibold">{format(low)}</span>
        <span className="font-semibold">
          {format(high)}
          {high >= max ? '+' : ''}
        </span>
      </div>

      {/* Inset by half a thumb: the inputs span the full width, so a thumb
          parked on either bound would otherwise be sliced in half by the
          container edge. */}
      <div className="relative mx-[10px] h-9">
        {/* Track */}
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-hairline" />
        {/* Selected span */}
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand"
          style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }}
        />
        <input
          type="range"
          aria-label={`${label} — minimum`}
          min={min}
          max={max}
          step={step}
          value={low}
          onChange={(e) => onChange([Math.min(Number(e.target.value), high), high])}
          className={cn(RANGE_INPUT, lowPct > 90 ? 'z-30' : 'z-20')}
        />
        <input
          type="range"
          aria-label={`${label} — maximum`}
          min={min}
          max={max}
          step={step}
          value={high}
          onChange={(e) => onChange([low, Math.max(Number(e.target.value), low)])}
          className={cn(RANGE_INPUT, 'z-20')}
        />
      </div>
    </div>
  );
}

/** Shared styling for the stacked range inputs: invisible track, Honey thumb. */
const RANGE_INPUT = [
  'pointer-events-none absolute inset-x-0 top-0 h-9 w-full appearance-none bg-transparent',
  'focus-visible:outline-none',
  // WebKit. `border-solid` is spelled out because Tailwind's preflight sets a
  // default border-style on elements and pseudo-elements like ::before, but not
  // on ::-webkit-slider-thumb — without it `border-2` has no style to draw and
  // the Honey ring silently doesn't render.
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5',
  '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
  '[&::-webkit-slider-thumb]:border-solid [&::-webkit-slider-thumb]:border-2',
  '[&::-webkit-slider-thumb]:border-brand [&::-webkit-slider-thumb]:bg-white',
  '[&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-grab',
  'focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-brand',
  // Firefox
  '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5',
  '[&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full',
  '[&::-moz-range-thumb]:border-solid [&::-moz-range-thumb]:border-2',
  '[&::-moz-range-thumb]:border-brand [&::-moz-range-thumb]:bg-white',
  '[&::-moz-range-track]:bg-transparent',
].join(' ');

/** Single-thumb slider — a maximum, e.g. drive time to campus. */
export function MaxSlider({
  min,
  max,
  step,
  value,
  onChange,
  format,
  label,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (next: number) => void;
  format: (value: number) => string;
  label: string;
}) {
  const pct = ((value - min) / Math.max(1, max - min)) * 100;
  return (
    <div className="pt-1">
      <p className="mb-2 text-caption font-semibold tabular-nums text-ink">{format(value)}</p>
      {/* Inset by half a thumb — see RangeSlider. */}
      <div className="relative mx-[10px] h-9">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-hairline" />
        <div
          className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn(RANGE_INPUT, 'z-20')}
        />
      </div>
    </div>
  );
}

/** A labelled date field, styled to match the sheet's other inputs. */
export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-caption font-medium text-ink">{label}</span>
      <input
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="min-h-11 w-full rounded-xl border border-hairline bg-white px-3 py-2 text-body text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
    </label>
  );
}

/** A labelled whole-number field (guests, minimum stay). */
export function CountField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-caption font-medium text-ink">{label}</span>
      <input
        inputMode="numeric"
        placeholder={placeholder}
        value={value?.toString() ?? ''}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^0-9]/g, '');
          onChange(digits ? Number(digits) : undefined);
        }}
        className="min-h-11 w-full rounded-xl border border-hairline bg-white px-3 py-2 text-body tabular-nums text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
    </label>
  );
}

/** A naira amount field with the currency mark as a real adornment rather
 *  than placeholder text that vanishes the moment you type. */
export function NairaInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="flex min-h-11 items-center gap-1 rounded-xl border border-hairline bg-white px-3 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
      <span className="shrink-0 text-body text-ink-soft" aria-hidden>
        ₦
      </span>
      <input
        inputMode="numeric"
        aria-label={label}
        placeholder={placeholder}
        value={value?.toLocaleString('en-NG') ?? ''}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^0-9]/g, '');
          onChange(digits ? Number(digits) : undefined);
        }}
        className="min-w-0 flex-1 bg-transparent py-2 text-body tabular-nums text-ink outline-none placeholder:text-ink-soft"
      />
    </div>
  );
}
