'use client';

/**
 * House rules checklist for student accommodation. Mirrors the amenities
 * checklist: check a rule, optionally star it to feature as a tile on the public
 * listing. Valued rules (curfew) reveal a free-text input when checked.
 *
 * Persisted to `listing.type_data.house_rules`:
 *   { no_smoking: { present: true, featured: true },
 *     curfew: { present: true, value: "11:00 PM" } }
 */

import { useMemo, useState } from 'react';
import { ScrollText, Star } from 'lucide-react';

import { cn } from '@/lib/cn';
import { countFeaturedAmenities, featuredBudget } from '@/lib/featured';
import { HOUSE_RULES } from '@/lib/house-rules';
import { updateDraft, type ListingView } from '@/lib/listings';

interface Props {
  listing: ListingView;
  onSaved: (next: ListingView) => void;
}

type RuleMeta = { present: boolean; featured?: boolean; value?: string | null };
type RuleSel = Record<string, RuleMeta>;

function normalise(td: ListingView['type_data']): RuleSel {
  const raw = (td as { house_rules?: Record<string, RuleMeta> })?.house_rules ?? {};
  const out: RuleSel = {};
  for (const [key, meta] of Object.entries(raw)) {
    out[key] = {
      present: Boolean(meta?.present),
      featured: Boolean(meta?.featured),
      value: meta?.value ?? null,
    };
  }
  return out;
}

function countFeatured(sel: RuleSel): number {
  return Object.values(sel).filter((m) => m.present && m.featured).length;
}

export function HouseRulesChecklist({ listing, onSaved }: Props) {
  const [sel, setSel] = useState<RuleSel>(() => normalise(listing.type_data));
  const [saving, setSaving] = useState(false);

  // Stars are a shared budget: house rules starred here plus amenities starred
  // in the other checklist (read live from props) must fit within the budget.
  const max = featuredBudget({ category: listing.category, typeData: listing.type_data });
  const amenityFeatured = useMemo(
    () => countFeaturedAmenities(listing.amenities),
    [listing.amenities],
  );
  const ownFeatured = useMemo(() => countFeatured(sel), [sel]);
  const featuredCount = ownFeatured + amenityFeatured;

  async function persist(next: RuleSel) {
    setSel(next);
    setSaving(true);
    try {
      const updated = await updateDraft(listing.id, { type_data: { house_rules: next } });
      onSaved(updated);
    } finally {
      setSaving(false);
    }
  }

  function toggle(key: string, present: boolean) {
    const prev = sel[key];
    const meta: RuleMeta = present
      ? { present: true, featured: Boolean(prev?.featured), value: prev?.value ?? null }
      : { present: false, featured: false, value: null };
    void persist({ ...sel, [key]: meta });
  }

  function toggleFeatured(key: string) {
    const prev = sel[key];
    if (!prev?.present) return;
    const nextFeatured = !prev.featured;
    if (nextFeatured && featuredCount >= max) return;
    void persist({ ...sel, [key]: { ...prev, featured: nextFeatured } });
  }

  function setValue(key: string, value: string) {
    const prev = sel[key];
    if (!prev?.present) return;
    void persist({ ...sel, [key]: { ...prev, value } });
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-sm transition-all duration-300 hover:shadow-md hover:border-brand/40 space-y-6">
      <header className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-50 p-2.5 text-amber-600 shrink-0">
            <ScrollText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">House rules</h2>
            <p className="text-xs text-slate-500">
              Select the rules tenants must follow, then star up to {max} to feature them.
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

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {HOUSE_RULES.map((rule) => {
          const meta = sel[rule.key];
          const checked = Boolean(meta?.present);
          const featured = Boolean(meta?.featured);
          const capped = !featured && featuredCount >= max;
          const Icon = rule.icon;
          return (
            <li key={rule.key} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer select-none hover:text-slate-900 transition-colors">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggle(rule.key, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                  />
                  <Icon className="h-4 w-4 text-slate-400" aria-hidden />
                  <span>{rule.label}</span>
                </label>
                {checked && (
                  <button
                    type="button"
                    onClick={() => toggleFeatured(rule.key)}
                    disabled={capped}
                    aria-pressed={featured}
                    title={
                      featured
                        ? 'Featured as a tile — tap to remove'
                        : capped
                          ? `Remove another feature first (max ${max})`
                          : 'Feature this rule on your listing'
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
              </div>
              {checked && rule.needsValue && (
                <input
                  value={meta?.value ?? ''}
                  onChange={(e) => setValue(rule.key, e.target.value)}
                  placeholder={rule.valuePlaceholder}
                  maxLength={50}
                  className="mt-2.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
