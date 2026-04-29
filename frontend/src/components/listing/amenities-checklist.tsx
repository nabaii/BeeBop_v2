'use client';

/**
 * Amenities checklist — collapsible groups. Shape persisted to
 * `listing.amenities`:
 *
 *   { power: { generator: { present: true } }, water: { borehole: {...} }, ... }
 */

import { useEffect, useMemo, useState } from 'react';

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
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Amenities</h2>
        {saving && <span className="text-xs text-slate-500">Saving…</span>}
      </header>
      {!vocab && <p className="text-sm text-slate-500">Loading…</p>}
      <div className="space-y-2">
        {groups.map(([group, keys]) => (
          <details
            key={group}
            className="rounded-lg border border-slate-200 bg-white p-3"
            open={group === 'power'}
          >
            <summary className="cursor-pointer text-sm font-medium capitalize text-slate-900">
              {group}
            </summary>
            <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {keys.map((key) => {
                const checked = Boolean(sel[group]?.[key]?.present);
                return (
                  <li key={key}>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
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
