'use client';

/**
 * Shared filter panel — every explore scope renders the same shared filters,
 * plus a category-specific slot for the scope's own controls.
 */

import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Input } from '@/components/ui/input';
import { ALL_TIERS } from '@/lib/browse-url';
import { cn } from '@/lib/cn';
import { getAmenityVocabulary } from '@/lib/listings';
import {
  getSearchLocations,
  type AnyFilters,
  type LocationOption,
  type SearchScope,
  type VerificationTier,
} from '@/lib/search';

interface Props {
  value: AnyFilters;
  onChange: (next: AnyFilters) => void;
  /** Which lane is being searched — decides whether a price range is meaningful. */
  scope: SearchScope;
  /** Category-specific controls rendered below the shared filters. */
  children?: React.ReactNode;
  className?: string;
}

const VERIFICATION_TIERS: { value: VerificationTier; label: string; dot: string }[] = [
  { value: 'fully_verified', label: 'AGIS Verified', dot: 'bg-verification-fully' },
  { value: 'doc_verified', label: 'Doc Verified', dot: 'bg-verification-doc' },
  { value: 'unverified', label: 'Unverified', dot: 'bg-verification-unverified' },
];

const MAX_LOCATION_SUGGESTIONS = 6;

export function FilterPanel({ value, onChange, scope, children, className }: Props) {
  const [locationInput, setLocationInput] = useState('');
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);
  const [vocab, setVocab] = useState<Record<string, string[]>>({});

  useEffect(() => {
    void getAmenityVocabulary().then(setVocab).catch(() => setVocab({}));
  }, []);

  // Scoped to the active lane: offering a district with no inventory in this
  // lane would just be a slower route to an empty result set.
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

  const selectedLocations = useMemo(() => value.locations ?? [], [value.locations]);

  const suggestions = useMemo(() => {
    const query = locationInput.trim().toLowerCase();
    const chosen = new Set(selectedLocations.map((l) => l.toLowerCase()));
    return locationOptions
      .filter((option) => !chosen.has(option.district.toLowerCase()))
      .filter((option) => !query || option.district.toLowerCase().includes(query))
      .slice(0, MAX_LOCATION_SUGGESTIONS);
  }, [locationInput, locationOptions, selectedLocations]);

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

  function setPrice(field: 'min_price' | 'max_price', raw: string) {
    const digits = raw.replace(/[^0-9]/g, '');
    onChange({ ...value, [field]: digits ? Number(digits) : undefined });
  }

  return (
    <aside className={cn('space-y-5 rounded-xl border border-hairline bg-white p-4', className)}>
      {/* No keyword field here: the explore header owns `q`. Two inputs bound
          to the same state is a race the user has to reason about. */}
      <section>
        <h3 className="text-caption font-semibold uppercase tracking-wide text-ink-muted">
          Location
        </h3>
        <div className="mt-2">
          <Input
            value={locationInput}
            placeholder="Search districts"
            aria-label="Search districts"
            autoComplete="off"
            onChange={(e) => setLocationInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                // Enter takes the top suggestion — free text can't match a
                // district that isn't there.
                if (suggestions[0]) addLocation(suggestions[0].district);
              }
            }}
          />
        </div>

        {suggestions.length > 0 && (
          <ul className="mt-2 space-y-1">
            {suggestions.map((option) => (
              <li key={option.district}>
                <button
                  type="button"
                  onClick={() => addLocation(option.district)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-caption text-ink hover:bg-nectar"
                >
                  <span>{option.district}</span>
                  <span className="text-ink-soft">{option.count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {locationOptions.length > 0 && suggestions.length === 0 && locationInput.trim() && (
          <p className="mt-2 text-caption text-ink-soft">
            No district matches “{locationInput.trim()}”.
          </p>
        )}

        {selectedLocations.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {selectedLocations.map((token) => (
              <li
                key={token}
                className="flex items-center gap-1 rounded-full bg-nectar px-2 py-0.5 text-caption text-ink"
              >
                {token}
                <button
                  type="button"
                  onClick={() => removeLocation(token)}
                  className="text-ink-muted hover:text-ink"
                  aria-label={`Remove ${token}`}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-caption font-semibold uppercase tracking-wide text-ink-muted">
          Verification
        </h3>
        <ul className="mt-2 space-y-1.5">
          {VERIFICATION_TIERS.map((t) => {
            const checked = (value.verification ?? [...ALL_TIERS]).includes(t.value);
            return (
              <li key={t.value}>
                <label className="flex items-center gap-2 text-body text-ink">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTier(t.value)}
                    className="h-4 w-4 rounded border-ink-soft text-brand focus:ring-brand"
                  />
                  <span className={`h-2 w-2 rounded-full ${t.dot}`} aria-hidden />
                  <span>{t.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Price only means one thing inside a single lane: rent quotes annually,
          short-let nightly, sales outright. Across "All" the control is hidden
          rather than shown with three meanings. */}
      {scope !== 'all' ? (
        <section>
          <h3 className="text-caption font-semibold uppercase tracking-wide text-ink-muted">
            Price
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Input
              inputMode="numeric"
              placeholder="Min"
              aria-label="Minimum price"
              value={value.min_price?.toString() ?? ''}
              onChange={(e) => setPrice('min_price', e.target.value)}
            />
            <Input
              inputMode="numeric"
              placeholder="Max"
              aria-label="Maximum price"
              value={value.max_price?.toString() ?? ''}
              onChange={(e) => setPrice('max_price', e.target.value)}
            />
          </div>
        </section>
      ) : (
        <p className="rounded-lg bg-paper px-3 py-2 text-caption text-ink-muted">
          Pick a category to filter by price — nightly, annual, and sale prices
          aren’t comparable.
        </p>
      )}

      <section>
        <h3 className="text-caption font-semibold uppercase tracking-wide text-ink-muted">
          Amenities
        </h3>
        <div className="mt-2 space-y-2">
          {Object.entries(vocab).map(([group, items]) => {
            const chosen = items.filter((key) =>
              (value.amenities ?? []).includes(`${group}:${key}`),
            ).length;
            return (
              <details key={group} className="rounded-lg border border-hairline p-2">
                <summary className="flex cursor-pointer items-center justify-between text-caption font-medium capitalize text-ink">
                  <span>{group}</span>
                  {chosen > 0 && (
                    <span className="rounded-full bg-brand px-1.5 text-caption font-semibold text-ink">
                      {chosen}
                    </span>
                  )}
                </summary>
                <ul className="mt-2 space-y-1">
                  {items.map((key) => {
                    const token = `${group}:${key}`;
                    const checked = (value.amenities ?? []).includes(token);
                    return (
                      <li key={key}>
                        <label className="flex items-center gap-2 text-caption text-ink">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAmenity(group, key)}
                            className="h-3.5 w-3.5 rounded border-ink-soft text-brand focus:ring-brand"
                          />
                          <span className="capitalize">{key.replaceAll('_', ' ')}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </div>
      </section>

      {children && (
        <section>
          <h3 className="text-caption font-semibold uppercase tracking-wide text-ink-muted">
            More filters
          </h3>
          <div className="mt-2 space-y-3">{children}</div>
        </section>
      )}

      <section>
        <h3 className="text-caption font-semibold uppercase tracking-wide text-ink-muted">
          Sort
        </h3>
        <select
          value={value.sort ?? 'relevance'}
          onChange={(e) => onChange({ ...value, sort: e.target.value as AnyFilters['sort'] })}
          className="mt-2 min-h-11 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-body text-ink"
        >
          <option value="relevance">Relevance</option>
          {/* Sorting by price across lanes would rank a nightly rate against a
              sale price, so these appear only within a category. */}
          {scope !== 'all' && <option value="price_asc">Price: low to high</option>}
          {scope !== 'all' && <option value="price_desc">Price: high to low</option>}
          <option value="newest">Newest first</option>
          <option value="highest_rated">Highest rated</option>
        </select>
      </section>
    </aside>
  );
}
