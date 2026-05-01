'use client';

/**
 * Shared filter panel — every category browse page renders the same shared
 * filters, plus a category-specific slot at the bottom.
 */

import { useEffect, useState } from 'react';

import { Input } from '@/components/ui/input';
import { getAmenityVocabulary } from '@/lib/listings';
import type { SharedFilters, VerificationTier } from '@/lib/search';

interface Props {
  value: SharedFilters;
  onChange: (next: SharedFilters) => void;
  /** Category-specific controls rendered below the shared filters. */
  children?: React.ReactNode;
}

const VERIFICATION_TIERS: { value: VerificationTier; label: string; dot: string }[] = [
  { value: 'fully_verified', label: 'Fully Verified', dot: 'bg-verified-teal' },
  { value: 'doc_verified', label: 'Doc Verified', dot: 'bg-verified-blue' },
  { value: 'unverified', label: 'Unverified', dot: 'bg-verified-grey' },
];

export function FilterPanel({ value, onChange, children }: Props) {
  const [locationInput, setLocationInput] = useState('');
  const [vocab, setVocab] = useState<Record<string, string[]>>({});

  useEffect(() => {
    void getAmenityVocabulary().then(setVocab).catch(() => setVocab({}));
  }, []);

  function toggleTier(tier: VerificationTier) {
    const current = value.verification ?? ['fully_verified', 'doc_verified'];
    const next = current.includes(tier)
      ? current.filter((t) => t !== tier)
      : [...current, tier];
    onChange({ ...value, verification: next });
  }

  function addLocation() {
    const token = locationInput.trim();
    if (!token) return;
    const current = value.locations ?? [];
    if (current.includes(token)) {
      setLocationInput('');
      return;
    }
    onChange({ ...value, locations: [...current, token] });
    setLocationInput('');
  }

  function removeLocation(token: string) {
    onChange({
      ...value,
      locations: (value.locations ?? []).filter((t) => t !== token),
    });
  }

  function toggleAmenity(group: string, key: string) {
    const token = `${group}:${key}`;
    const current = value.amenities ?? [];
    const next = current.includes(token)
      ? current.filter((t) => t !== token)
      : [...current, token];
    onChange({ ...value, amenities: next });
  }

  return (
    <aside className="space-y-5 rounded-xl border border-slate-200 bg-white p-4">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Keywords
        </h3>
        <div className="mt-2">
          <Input
            value={value.q ?? ''}
            placeholder="Generator, duplex, balcony..."
            onChange={(e) =>
              onChange({
                ...value,
                q: e.target.value.trim() ? e.target.value : undefined,
              })
            }
          />
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Location
        </h3>
        <div className="mt-2 flex gap-2">
          <Input
            value={locationInput}
            placeholder="District or estate"
            onChange={(e) => setLocationInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addLocation();
              }
            }}
          />
          <button
            type="button"
            onClick={addLocation}
            className="rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
          >
            Add
          </button>
        </div>
        {(value.locations ?? []).length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {(value.locations ?? []).map((token) => (
              <li
                key={token}
                className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
              >
                {token}
                <button
                  type="button"
                  onClick={() => removeLocation(token)}
                  className="text-slate-500 hover:text-red-600"
                  aria-label={`Remove ${token}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Verification
        </h3>
        <ul className="mt-2 space-y-1.5">
          {VERIFICATION_TIERS.map((t) => {
            const checked = (value.verification ?? []).includes(t.value);
            return (
              <li key={t.value}>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTier(t.value)}
                    className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                  />
                  <span className={`h-2 w-2 rounded-full ${t.dot}`} aria-hidden />
                  <span>{t.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Price
        </h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Input
            inputMode="numeric"
            placeholder="Min"
            value={value.min_price?.toString() ?? ''}
            onChange={(e) =>
              onChange({
                ...value,
                min_price: e.target.value ? Number(e.target.value.replace(/[^0-9]/g, '')) : undefined,
              })
            }
          />
          <Input
            inputMode="numeric"
            placeholder="Max"
            value={value.max_price?.toString() ?? ''}
            onChange={(e) =>
              onChange({
                ...value,
                max_price: e.target.value ? Number(e.target.value.replace(/[^0-9]/g, '')) : undefined,
              })
            }
          />
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Amenities
        </h3>
        <div className="mt-2 space-y-2">
          {Object.entries(vocab).map(([group, items]) => (
            <details key={group} className="rounded-lg border border-slate-200 p-2">
              <summary className="cursor-pointer text-xs font-medium capitalize text-slate-700">
                {group}
              </summary>
              <ul className="mt-2 space-y-1">
                {items.map((key) => {
                  const token = `${group}:${key}`;
                  const checked = (value.amenities ?? []).includes(token);
                  return (
                    <li key={key}>
                      <label className="flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAmenity(group, key)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-brand focus:ring-brand"
                        />
                        <span className="capitalize">{key.replaceAll('_', ' ')}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}
        </div>
      </section>

      {children && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            More filters
          </h3>
          <div className="mt-2 space-y-3">{children}</div>
        </section>
      )}

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Sort
        </h3>
        <select
          value={value.sort ?? 'relevance'}
          onChange={(e) => onChange({ ...value, sort: e.target.value as SharedFilters['sort'] })}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="relevance">Relevance</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="newest">Newest first</option>
          <option value="highest_rated">Highest rated</option>
        </select>
      </section>
    </aside>
  );
}
