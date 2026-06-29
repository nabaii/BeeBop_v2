'use client';

/**
 * Amenities checklist — collapsible groups. Shape persisted to
 * `listing.amenities`:
 *
 *   { power: { generator: { present: true } }, water: { borehole: {...} }, ... }
 *
 * A present amenity can also be *starred* to feature it as a headline tile on
 * the public listing page; that adds `featured: true` to its meta. Stars share
 * one budget with featured house rules (see `lib/featured`) — at most
 * `featuredBudget(listing)` items may be featured across both at once.
 */

import { useEffect, useMemo, useState } from 'react';
import { Sparkles, ChevronDown, Star } from 'lucide-react';

import { cn } from '@/lib/cn';
import { countFeaturedHouseRules, featuredBudget } from '@/lib/featured';
import { getAmenityVocabulary, updateDraft, type ListingView } from '@/lib/listings';

interface Props {
  listing: ListingView;
  onSaved: (next: ListingView) => void;
}

type AmenityMeta = { present: boolean; featured?: boolean };
type AmenitySel = Record<string, Record<string, AmenityMeta>>;

function normalise(amenities: ListingView['amenities']): AmenitySel {
  const out: AmenitySel = {};
  for (const [group, items] of Object.entries(amenities ?? {})) {
    if (!items) continue;
    out[group] = {};
    for (const [key, meta] of Object.entries(items)) {
      out[group][key] = { present: Boolean(meta?.present), featured: Boolean(meta?.featured) };
    }
  }
  return out;
}

function countFeatured(sel: AmenitySel): number {
  let n = 0;
  for (const items of Object.values(sel)) {
    for (const meta of Object.values(items)) if (meta.present && meta.featured) n += 1;
  }
  return n;
}

export function AmenitiesChecklist({ listing, onSaved }: Props) {
  const [vocab, setVocab] = useState<Record<string, string[]> | null>(null);
  const [sel, setSel] = useState<AmenitySel>(() => normalise(listing.amenities));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getAmenityVocabulary().then(setVocab).catch(() => setVocab({}));
  }, []);

  const groups = useMemo(() => (vocab ? Object.entries(vocab) : []), [vocab]);

  // Stars are a shared budget: amenities starred here plus house rules starred
  // in the other checklist (read live from props) must fit within the budget.
  const max = featuredBudget({ category: listing.category, typeData: listing.type_data });
  const ruleFeatured = useMemo(
    () =>
      countFeaturedHouseRules(
        (listing.type_data as { house_rules?: Record<string, { present?: boolean; featured?: boolean }> })
          ?.house_rules,
      ),
    [listing.type_data],
  );
  const ownFeatured = useMemo(() => countFeatured(sel), [sel]);
  const featuredCount = ownFeatured + ruleFeatured;

  async function persist(next: AmenitySel) {
    setSel(next);
    setSaving(true);
    try {
      const updated = await updateDraft(listing.id, { amenities: next });
      onSaved(updated);
    } finally {
      setSaving(false);
    }
  }

  function toggle(group: string, key: string, present: boolean) {
    const prev = sel[group]?.[key];
    // Un-checking an amenity also drops it from the featured set.
    const meta: AmenityMeta = present
      ? { present: true, featured: Boolean(prev?.featured) }
      : { present: false, featured: false };
    void persist({ ...sel, [group]: { ...(sel[group] ?? {}), [key]: meta } });
  }

  function toggleFeatured(group: string, key: string) {
    const prev = sel[group]?.[key];
    if (!prev?.present) return;
    const nextFeatured = !prev.featured;
    if (nextFeatured && featuredCount >= max) return; // shared cap reached
    void persist({
      ...sel,
      [group]: { ...(sel[group] ?? {}), [key]: { present: true, featured: nextFeatured } },
    });
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-sm transition-all duration-300 hover:shadow-md hover:border-brand/40 space-y-6">
      <header className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-rose-50 p-2.5 text-rose-600 shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Amenities</h2>
            <p className="text-xs text-slate-500">
              Select what&apos;s available, then star up to {max} to feature as tiles.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-caption font-semibold text-amber-700">
            <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
            {featuredCount}/{max} featured
          </span>
          {saving && <span className="text-xs text-slate-500 animate-pulse">Saving…</span>}
        </div>
      </header>
      {!vocab && (
        <div className="flex items-center gap-2 text-slate-400 py-4 justify-center">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <span className="text-xs">Loading amenities...</span>
        </div>
      )}
      <div className="space-y-3">
        {groups.map(([group, keys]) => (
          <details
            key={group}
            className="group rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden transition-all duration-200"
            open={group === 'features'}
          >
            <summary className="flex items-center justify-between cursor-pointer text-sm font-bold capitalize text-slate-800 bg-slate-50/50 p-4 select-none outline-none hover:bg-slate-50 transition-colors">
              <span>{group === 'features' ? 'Featured highlights' : group}</span>
              <ChevronDown className="h-4 w-4 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <ul className="p-4 border-t border-slate-100 grid grid-cols-1 gap-3 sm:grid-cols-2 bg-white">
              {keys.map((key) => {
                const meta = sel[group]?.[key];
                const checked = Boolean(meta?.present);
                const featured = Boolean(meta?.featured);
                const capped = !featured && featuredCount >= max;
                return (
                  <li key={key} className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer select-none hover:text-slate-900 transition-colors">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => toggle(group, key, e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                      />
                      <span className="capitalize">{key.replaceAll('_', ' ')}</span>
                    </label>
                    {checked && (
                      <button
                        type="button"
                        onClick={() => toggleFeatured(group, key)}
                        disabled={capped}
                        aria-pressed={featured}
                        title={
                          featured
                            ? 'Featured as a tile — tap to remove'
                            : capped
                              ? `Remove another feature first (max ${max})`
                              : 'Feature this as a tile on your listing'
                        }
                        className={cn(
                          'shrink-0 rounded-lg p-1.5 transition-colors',
                          featured
                            ? 'text-amber-500 hover:bg-amber-50'
                            : capped
                              ? 'text-slate-200 cursor-not-allowed'
                              : 'text-slate-300 hover:bg-slate-100 hover:text-amber-500',
                        )}
                      >
                        <Star className={cn('h-4 w-4', featured && 'fill-amber-500')} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
