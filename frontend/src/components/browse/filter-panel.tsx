'use client';

/**
 * Shared filter panel — every explore scope renders the same shared filters,
 * plus a category-specific slot for the scope's own controls.
 */

import { MapPin, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  CheckRow,
  FilterSection,
  NairaInput,
  RangeSlider,
  ToggleChip,
} from '@/components/browse/filter-controls';
import { ALL_TIERS } from '@/lib/browse-url';
import { cn } from '@/lib/cn';
import { formatNaira } from '@/lib/format';
import { getAmenityVocabulary } from '@/lib/listings';
import {
  getPriceRange,
  getSearchLocations,
  type AnyFilters,
  type LocationOption,
  type PriceRangeBounds,
  type SearchScope,
  type VerificationTier,
} from '@/lib/search';

interface Props {
  value: AnyFilters;
  onChange: (next: AnyFilters) => void;
  /** Which lane is being searched — decides whether a price range is meaningful. */
  scope: SearchScope;
  /**
   * Switches lane from inside the sheet. Lets the "All" price section offer a
   * way into a lane instead of only explaining why there isn't one.
   */
  onScopeChange?: (next: SearchScope) => void;
  /**
   * The scope's headline filter, rendered with Location rather than buried in
   * "More filters" — proximity to campus for off-campus seekers.
   */
  priority?: React.ReactNode;
  /** Category-specific controls rendered below the shared filters. */
  children?: React.ReactNode;
  className?: string;
}

/** The lanes a budget means something in — the doors out of "All". */
const PRICE_LANES: { value: SearchScope; label: string }[] = [
  { value: 'off_campus', label: 'Off-campus' },
  { value: 'short_let', label: 'Short-let' },
  { value: 'rent', label: 'Rent' },
  { value: 'sales', label: 'For sale' },
];

const VERIFICATION_TIERS: { value: VerificationTier; label: string; dot: string }[] = [
  { value: 'fully_verified', label: 'AGIS Verified', dot: 'bg-verification-fully' },
  { value: 'doc_verified', label: 'Doc Verified', dot: 'bg-verification-doc' },
  { value: 'unverified', label: 'Unverified', dot: 'bg-verification-unverified' },
];

/**
 * Price bands per lane, in naira.
 *
 * These cannot be shared: "under ₦1m" is an ordinary annual rent and an
 * impossible sale price. Each lane gets bands matched to how it actually
 * quotes — nightly for short-let, per session for student rooms, annual for
 * rent, outright for sales.
 */
const PRICE_BANDS: Record<SearchScope, readonly number[]> = {
  all: [],
  off_campus: [150_000, 300_000, 600_000],
  short_let: [15_000, 30_000, 60_000],
  rent: [500_000, 1_500_000, 4_000_000],
  sales: [25_000_000, 60_000_000, 150_000_000],
};

const MAX_LOCATION_SUGGESTIONS = 6;

/**
 * A step that divides the span into roughly 40 stops and lands on a round
 * number, so dragging produces figures a person would say out loud
 * (₦1,250,000) rather than ₦1,237,431.
 */
function niceStep(span: number): number {
  const rough = span / 40;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rough, 1)));
  for (const multiple of [1, 2, 2.5, 5, 10]) {
    if (magnitude * multiple >= rough) return magnitude * multiple;
  }
  return magnitude * 10;
}

/** Compact naira for band labels: 1_500_000 -> "₦1.5m". */
function compactNaira(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `₦${Number.isInteger(millions) ? millions : millions.toFixed(1)}m`;
  }
  if (value >= 1_000) return `₦${value / 1_000}k`;
  return formatNaira(value);
}

export function FilterPanel({
  value,
  onChange,
  scope,
  onScopeChange,
  priority,
  children,
  className,
}: Props) {
  const [locationInput, setLocationInput] = useState('');
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);
  const [vocab, setVocab] = useState<Record<string, string[]>>({});
  const [bounds, setBounds] = useState<PriceRangeBounds | null>(null);

  useEffect(() => {
    void getAmenityVocabulary().then(setVocab).catch(() => setVocab({}));
  }, []);

  // Scoped to the active lane: offering a district with no inventory here is
  // just a slower route to an empty result set.
  useEffect(() => {
    let live = true;
    void getSearchLocations(scope)
      .then((options) => {
        if (live) setLocationOptions(options);
      })
      .catch(() => {
        if (live) setLocationOptions([]);
      });
    return () => {
      live = false;
    };
  }, [scope]);

  // Slider bounds come from the lane's real inventory, so the track always
  // spans prices a seeker can actually reach.
  useEffect(() => {
    if (scope === 'all') {
      setBounds(null);
      return;
    }
    let live = true;
    void getPriceRange(scope)
      .then((range) => {
        if (live) setBounds(range);
      })
      .catch(() => {
        if (live) setBounds(null);
      });
    return () => {
      live = false;
    };
  }, [scope]);

  const selectedLocations = useMemo(() => value.locations ?? [], [value.locations]);

  const suggestions = useMemo(() => {
    const query = locationInput.trim().toLowerCase();
    const chosen = new Set(selectedLocations.map((l) => l.toLowerCase()));
    return locationOptions
      .filter((option) => !chosen.has(option.district.toLowerCase()))
      .filter((option) => !query || option.district.toLowerCase().includes(query))
      .slice(0, MAX_LOCATION_SUGGESTIONS);
  }, [locationInput, locationOptions, selectedLocations]);

  const bands = PRICE_BANDS[scope];

  /**
   * Slider domain, rounded outward to a clean step so the thumbs land on
   * readable figures. Null when the lane has no priced inventory (or the
   * bounds haven't loaded) — the band chips and the manual fields still work,
   * so the section degrades rather than disappears.
   */
  const slider = useMemo(() => {
    if (!bounds || bounds.min == null || bounds.max == null) return null;
    if (bounds.max <= bounds.min) return null;
    const step = niceStep(bounds.max - bounds.min);
    return {
      min: Math.floor(bounds.min / step) * step,
      max: Math.ceil(bounds.max / step) * step,
      step,
    };
  }, [bounds]);

  function toggleTier(tier: VerificationTier) {
    const current = value.verification ?? [...ALL_TIERS];
    const next = current.includes(tier)
      ? current.filter((t) => t !== tier)
      : [...current, tier];
    // Deselecting every tier would match nothing; read it as "no preference".
    onChange({ ...value, verification: next.length ? next : [...ALL_TIERS] });
  }

  function addLocation(district: string) {
    const token = district.trim();
    if (!token) return;
    setLocationInput('');
    if (selectedLocations.some((l) => l.toLowerCase() === token.toLowerCase())) return;
    onChange({ ...value, locations: [...selectedLocations, token] });
  }

  function removeLocation(token: string) {
    const next = selectedLocations.filter((t) => t !== token);
    onChange({ ...value, locations: next.length ? next : undefined });
  }

  function toggleAmenity(group: string, key: string) {
    const token = `${group}:${key}`;
    const current = value.amenities ?? [];
    const next = current.includes(token)
      ? current.filter((t) => t !== token)
      : [...current, token];
    onChange({ ...value, amenities: next.length ? next : undefined });
  }

  function applyBand(min: number | undefined, max: number | undefined) {
    const same = value.min_price === min && value.max_price === max;
    // Tapping the active band clears it — the chips behave like a radio group
    // you can also switch off.
    onChange({
      ...value,
      min_price: same ? undefined : min,
      max_price: same ? undefined : max,
    });
  }

  return (
    <aside className={cn('space-y-6 rounded-xl border border-hairline bg-white p-4', className)}>
      {/* No keyword field here: the explore header owns `q`. Two inputs bound
          to the same state is a race the user has to reason about. */}

      <FilterSection title="Location">
        <div className="flex min-h-11 items-center gap-2 rounded-xl border border-hairline bg-white px-3 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
          <MapPin className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
          <input
            value={locationInput}
            placeholder="Search districts"
            aria-label="Search districts"
            autoComplete="off"
            onChange={(e) => setLocationInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                // Enter takes the top suggestion — free text can't match a
                // district that isn't in the inventory.
                if (suggestions[0]) addLocation(suggestions[0].district);
              }
            }}
            className="min-w-0 flex-1 bg-transparent py-2 text-body text-ink outline-none placeholder:text-ink-soft"
          />
        </div>

        {selectedLocations.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {selectedLocations.map((token) => (
              <li key={token}>
                <button
                  type="button"
                  onClick={() => removeLocation(token)}
                  aria-label={`Remove ${token}`}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-brand bg-brand px-3 py-1.5 text-caption font-semibold text-ink transition-colors hover:bg-brand-600"
                >
                  {token}
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        {suggestions.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {suggestions.map((option) => (
              <li key={option.district}>
                <ToggleChip active={false} onClick={() => addLocation(option.district)}>
                  {option.district}
                  <span className="tabular-nums text-ink-soft">{option.count}</span>
                </ToggleChip>
              </li>
            ))}
          </ul>
        )}

        {locationOptions.length > 0 && suggestions.length === 0 && locationInput.trim() && (
          <p className="text-caption text-ink-soft">
            No district matches “{locationInput.trim()}”.
          </p>
        )}
      </FilterSection>

      {/* Proximity to campus sits with Location, not under "More filters":
          for a student it is a location filter, and the sharpest one they have. */}
      {priority && <FilterSection title="Minutes to campus">{priority}</FilterSection>}

      {/* Price only means one thing inside a single lane: rent quotes annually,
          short-let nightly, sales outright. Across "All" the control can't be
          shown carrying three meanings — but the section stays, offering a way
          into a lane rather than a dead end that only explains itself. */}
      {scope !== 'all' ? (
        <FilterSection title="Price">
          {slider && (
            <RangeSlider
              label="Price"
              min={slider.min}
              max={slider.max}
              step={slider.step}
              value={[value.min_price ?? slider.min, value.max_price ?? slider.max]}
              format={compactNaira}
              onChange={([low, high]) =>
                onChange({
                  ...value,
                  // A thumb parked on its bound means "no limit this side" —
                  // it drops out of the URL and the active-filter count rather
                  // than pinning a redundant constraint.
                  min_price: low <= slider.min ? undefined : low,
                  max_price: high >= slider.max ? undefined : high,
                })
              }
            />
          )}
          <div className="flex flex-wrap gap-1.5">
            {bands.map((band, i) => {
              const min = i === 0 ? undefined : bands[i - 1];
              const label = i === 0 ? `Under ${compactNaira(band)}` : `${compactNaira(min!)}–${compactNaira(band)}`;
              return (
                <ToggleChip
                  key={band}
                  active={value.min_price === min && value.max_price === band}
                  onClick={() => applyBand(min, band)}
                >
                  {label}
                </ToggleChip>
              );
            })}
            {bands.length > 0 && (
              <ToggleChip
                active={value.min_price === bands[bands.length - 1] && value.max_price === undefined}
                onClick={() => applyBand(bands[bands.length - 1], undefined)}
              >
                {compactNaira(bands[bands.length - 1])}+
              </ToggleChip>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NairaInput
              label="Minimum price"
              placeholder="Min"
              value={value.min_price}
              onChange={(next) => onChange({ ...value, min_price: next })}
            />
            <NairaInput
              label="Maximum price"
              placeholder="Max"
              value={value.max_price}
              onChange={(next) => onChange({ ...value, max_price: next })}
            />
          </div>
        </FilterSection>
      ) : (
        <FilterSection
          title="Price"
          hint="Nightly, per-session, annual, and sale prices aren’t comparable, so a budget lives inside a category."
        >
          {onScopeChange ? (
            <div className="flex flex-wrap gap-1.5">
              {PRICE_LANES.map((lane) => (
                <ToggleChip
                  key={lane.value}
                  active={false}
                  onClick={() => onScopeChange(lane.value)}
                >
                  {lane.label}
                </ToggleChip>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-hairline bg-paper px-3 py-2.5 text-caption text-ink-muted">
              Pick a category to filter by price.
            </p>
          )}
        </FilterSection>
      )}

      <FilterSection title="Verification">
        <ul className="space-y-1.5">
          {VERIFICATION_TIERS.map((t) => (
            <li key={t.value}>
              <CheckRow
                checked={(value.verification ?? [...ALL_TIERS]).includes(t.value)}
                onChange={() => toggleTier(t.value)}
                label={t.label}
                adornment={<span className={cn('h-2 w-2 rounded-full', t.dot)} aria-hidden />}
              />
            </li>
          ))}
        </ul>
      </FilterSection>

      {Object.keys(vocab).length > 0 && (
        <FilterSection title="Amenities">
          <div className="space-y-3">
            {Object.entries(vocab).map(([group, items]) => (
              <div key={group}>
                <p className="mb-1.5 text-caption font-medium capitalize text-ink">{group}</p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((key) => {
                    const token = `${group}:${key}`;
                    return (
                      <ToggleChip
                        key={key}
                        active={(value.amenities ?? []).includes(token)}
                        onClick={() => toggleAmenity(group, key)}
                        className="capitalize"
                      >
                        {key.replaceAll('_', ' ')}
                      </ToggleChip>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </FilterSection>
      )}

      {children && <FilterSection title="More filters">{children}</FilterSection>}

      <FilterSection title="Sort">
        <select
          value={value.sort ?? 'relevance'}
          onChange={(e) => onChange({ ...value, sort: e.target.value as AnyFilters['sort'] })}
          className="min-h-11 w-full rounded-xl border border-hairline bg-white px-3 py-2 text-body text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
        >
          <option value="relevance">Relevance</option>
          {/* Sorting by price across lanes would rank a nightly rate against a
              sale price, so these appear only within a category. */}
          {scope !== 'all' && <option value="price_asc">Price: low to high</option>}
          {scope !== 'all' && <option value="price_desc">Price: high to low</option>}
          <option value="newest">Newest first</option>
          <option value="highest_rated">Highest rated</option>
        </select>
      </FilterSection>
    </aside>
  );
}
