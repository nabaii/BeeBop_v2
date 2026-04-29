'use client';

/**
 * Structured assessment checklist — Identity/Existence, Listing Accuracy,
 * Amenity Confirmation, and Structural Condition.
 */

import { useCallback } from 'react';
import type { BriefingPack } from '@/lib/inspector';

export type ExistenceValue = 'yes' | 'no' | 'could_not_verify' | null;
export type AccuracyValue = 'accurate' | 'minor_discrepancies' | 'major_discrepancies' | null;
export type AmenityStatus = 'present' | 'not_confirmed' | 'absent';
export type AmenityMap = Record<string, Record<string, AmenityStatus>>;

export interface ChecklistValues {
  existence: ExistenceValue;
  existenceNote: string;
  accuracy: AccuracyValue;
  accuracyNote: string;
  amenities: AmenityMap;
  structuralCondition: number | null;
  structuralNote: string;
}

export const EMPTY_CHECKLIST: ChecklistValues = {
  existence: null,
  existenceNote: '',
  accuracy: null,
  accuracyNote: '',
  amenities: {},
  structuralCondition: null,
  structuralNote: '',
};

export function isChecklistComplete(v: ChecklistValues, briefing: BriefingPack): boolean {
  if (!v.existence || !v.accuracy || v.structuralCondition == null) return false;
  for (const [category, items] of Object.entries(briefing.listed_amenities)) {
    if (!items) continue;
    for (const item of Object.keys(items)) {
      if (!v.amenities[category]?.[item]) return false;
    }
  }
  return true;
}

interface Props {
  values: ChecklistValues;
  briefing: BriefingPack;
  onChange: (next: ChecklistValues) => void;
  expanded: boolean;
  onToggle: () => void;
  complete: boolean;
}

export function ChecklistSection({ values, briefing, onChange, expanded, onToggle, complete }: Props) {
  const update = useCallback(
    (patch: Partial<ChecklistValues>) => onChange({ ...values, ...patch }),
    [values, onChange],
  );

  const setAmenity = useCallback(
    (category: string, item: string, status: AmenityStatus) => {
      const next = { ...values.amenities };
      if (!next[category]) next[category] = {};
      next[category] = { ...next[category], [item]: status };
      onChange({ ...values, amenities: next });
    },
    [values, onChange],
  );

  return (
    <section id="checklist-section" className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <div className="flex items-center gap-3">
          <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${complete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>2</span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Property Assessment</h2>
            <p className="text-xs text-slate-500">{complete ? 'All sections complete' : 'Checklist, amenities & condition'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {complete && <CompleteBadge />}
          <ChevronIcon open={expanded} />
        </div>
      </button>

      {expanded && (
        <div className="space-y-6 border-t border-slate-100 px-5 pb-6 pt-4">
          {/* Identity / Existence */}
          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">1. Identity &amp; Existence</legend>
            <p className="mt-1 text-xs text-slate-500">Does the property exist at the stated address?</p>
            <div className="mt-3 space-y-2">
              {(['yes', 'no', 'could_not_verify'] as const).map((val) => (
                <RadioOption key={val} name="existence" value={val} label={existenceLabel(val)} checked={values.existence === val} onChange={() => update({ existence: val })} />
              ))}
            </div>
            <textarea placeholder="Additional observations (optional)…" value={values.existenceNote} onChange={(e) => update({ existenceNote: e.target.value })} className="mt-3 w-full rounded-lg border border-slate-200 p-3 text-sm placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" rows={2} />
          </fieldset>

          {/* Listing Accuracy */}
          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">2. Listing Accuracy</legend>
            <p className="mt-1 text-xs text-slate-500">Does the listing information match reality?</p>
            <div className="mt-3 space-y-2">
              {(['accurate', 'minor_discrepancies', 'major_discrepancies'] as const).map((val) => (
                <RadioOption key={val} name="accuracy" value={val} label={accuracyLabel(val)} checked={values.accuracy === val} onChange={() => update({ accuracy: val })} />
              ))}
            </div>
            <textarea placeholder="Describe any discrepancies (optional)…" value={values.accuracyNote} onChange={(e) => update({ accuracyNote: e.target.value })} className="mt-3 w-full rounded-lg border border-slate-200 p-3 text-sm placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" rows={2} />
          </fieldset>

          {/* Amenity Confirmation */}
          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">3. Amenity Confirmation</legend>
            <p className="mt-1 text-xs text-slate-500">Confirm whether each listed amenity is present.</p>
            <div className="mt-3 space-y-4">
              {Object.entries(briefing.listed_amenities).map(([category, items]) => {
                if (!items || Object.keys(items).length === 0) return null;
                return (
                  <div key={category}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{category.replace(/_/g, ' ')}</p>
                    <div className="mt-2 space-y-2">
                      {Object.keys(items).map((item) => (
                        <AmenityRow key={item} label={item.replace(/_/g, ' ')} value={values.amenities[category]?.[item] ?? null} onChange={(s) => setAmenity(category, item, s)} />
                      ))}
                    </div>
                  </div>
                );
              })}
              {Object.keys(briefing.listed_amenities).length === 0 && (
                <p className="text-sm italic text-slate-400">No amenities listed for this property.</p>
              )}
            </div>
          </fieldset>

          {/* Structural Condition */}
          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">4. Structural Condition</legend>
            <p className="mt-1 text-xs text-slate-500">Rate the overall structural condition.</p>
            <div className="mt-3 flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => update({ structuralCondition: n })} className={`flex h-12 w-12 flex-col items-center justify-center rounded-xl border-2 text-sm font-semibold transition-all ${values.structuralCondition === n ? 'border-brand bg-brand text-white shadow-md shadow-brand/25' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>{n}</button>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-slate-400"><span>Poor</span><span>Excellent</span></div>
            <textarea placeholder="Structural observations (optional)…" value={values.structuralNote} onChange={(e) => update({ structuralNote: e.target.value })} className="mt-3 w-full rounded-lg border border-slate-200 p-3 text-sm placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" rows={2} />
          </fieldset>
        </div>
      )}
    </section>
  );
}

/* -- helpers -- */
function existenceLabel(v: string) {
  return { yes: 'Yes — property exists at stated address', no: 'No — property not found', could_not_verify: 'Could not verify' }[v] ?? v;
}
function accuracyLabel(v: string) {
  return { accurate: 'Accurate — listing matches reality', minor_discrepancies: 'Minor discrepancies', major_discrepancies: 'Major discrepancies' }[v] ?? v;
}

function RadioOption({ name, value, label, checked, onChange }: { name: string; value: string; label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 transition-all ${checked ? 'border-brand bg-blue-50/50 text-slate-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${checked ? 'border-brand bg-brand' : 'border-slate-300'}`}>
        {checked && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
      </span>
      <span className="text-sm">{label}</span>
    </label>
  );
}

function AmenityRow({ label, value, onChange }: { label: string; value: AmenityStatus | null; onChange: (s: AmenityStatus) => void }) {
  const opts: { key: AmenityStatus; icon: string; cls: string }[] = [
    { key: 'present', icon: '✓', cls: 'bg-emerald-100 border-emerald-400 text-emerald-700' },
    { key: 'not_confirmed', icon: '?', cls: 'bg-amber-100 border-amber-400 text-amber-700' },
    { key: 'absent', icon: '✗', cls: 'bg-red-100 border-red-400 text-red-700' },
  ];
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
      <span className="text-sm text-slate-700 capitalize">{label}</span>
      <div className="flex gap-1.5">
        {opts.map((o) => (
          <button key={o.key} type="button" onClick={() => onChange(o.key)} title={o.key.replace(/_/g, ' ')} className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-bold transition-all ${value === o.key ? o.cls : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'}`}>{o.icon}</button>
        ))}
      </div>
    </div>
  );
}

function CompleteBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
      Done
    </span>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`h-5 w-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
