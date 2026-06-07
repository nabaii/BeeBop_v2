'use client';

/**
 * Amenities checklist — collapsible groups. Shape persisted to
 * `listing.amenities`:
 *
 *   { power: { generator: { present: true } }, water: { borehole: {...} }, ... }
 */

import { useEffect, useMemo, useState } from 'react';
import { Sparkles, ChevronDown } from 'lucide-react';

import { getAmenityVocabulary, updateDraft, type ListingView } from '@/lib/listings';

interface Props {
  listing: ListingView;
  onSaved: (next: ListingView) => void;
}

type AmenitySel = Record<string, Record<string, { present: boolean }>>;

function normalise(amenities: ListingView['amenities']): AmenitySel {
  const out: AmenitySel = {};
  for (const [group, items] of Object.entries(amenities ?? {})) {
    if (!items) continue;
    out[group] = {};
    for (const [key, meta] of Object.entries(items)) {
      out[group][key] = { present: Boolean(meta?.present) };
    }
  }
  return out;
}

export function AmenitiesChecklist({ listing, onSaved }: Props) {
  const [vocab, setVocab] = useState<Record<string, string[]> | null>(null);
  const [sel, setSel] = useState<AmenitySel>(() => normalise(listing.amenities));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getAmenityVocabulary().then(setVocab).catch(() => setVocab({}));
  }, []);

  const groups = useMemo(() => (vocab ? Object.entries(vocab) : []), [vocab]);

  async function toggle(group: string, key: string, present: boolean) {
    const next: AmenitySel = {
      ...sel,
      [group]: { ...(sel[group] ?? {}), [key]: { present } },
    };
    setSel(next);
    setSaving(true);
    try {
      const updated = await updateDraft(listing.id, { amenities: next });
      onSaved(updated);
    } finally {
      setSaving(false);
    }
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
            <p className="text-xs text-slate-500">Select facilities and amenities available</p>
          </div>
        </div>
        {saving && <span className="text-xs text-slate-500 animate-pulse">Saving…</span>}
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
            open={group === 'power'}
          >
            <summary className="flex items-center justify-between cursor-pointer text-sm font-bold capitalize text-slate-800 bg-slate-50/50 p-4 select-none outline-none hover:bg-slate-50 transition-colors">
              <span>{group}</span>
              <ChevronDown className="h-4 w-4 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <ul className="p-4 border-t border-slate-100 grid grid-cols-1 gap-3 sm:grid-cols-2 bg-white">
              {keys.map((key) => {
                const checked = Boolean(sel[group]?.[key]?.present);
                return (
                  <li key={key}>
                    <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer select-none hover:text-slate-900 transition-colors">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => void toggle(group, key, e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
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
  );
}
