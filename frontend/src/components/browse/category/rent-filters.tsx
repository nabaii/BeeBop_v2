'use client';

import { Input } from '@/components/ui/input';
import type { RentFilters } from '@/lib/search';

const PROPERTY_TYPES: [string, string][] = [
  ['flat', 'Flat'],
  ['detached', 'Detached'],
  ['semi_detached', 'Semi-detached'],
  ['terraced', 'Terraced'],
  ['bq', 'BQ'],
  ['mini_flat', 'Mini flat'],
  ['self_contain', 'Self-contain'],
];

const FURNISHING: [string, string][] = [
  ['furnished', 'Furnished'],
  ['semi_furnished', 'Semi-furnished'],
  ['unfurnished', 'Unfurnished'],
];

const PAYMENT: [string, string][] = [
  ['annual', 'Annual'],
  ['two_years_upfront', '2 years upfront'],
];

export function RentFilterFields({
  value,
  onChange,
}: {
  value: RentFilters;
  onChange: (next: RentFilters) => void;
}) {
  function toggle<T>(list: T[] | undefined, item: T): T[] {
    const current = list ?? [];
    return current.includes(item) ? current.filter((i) => i !== item) : [...current, item];
  }
  return (
    <>
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-slate-700">Bedrooms</legend>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = (value.bedroom_counts ?? []).includes(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() =>
                  onChange({ ...value, bedroom_counts: toggle(value.bedroom_counts, n) })
                }
                className={
                  'rounded-full px-3 py-1 text-xs ' +
                  (active ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
                }
              >
                {n === 5 ? '5+' : n}
              </button>
            );
          })}
        </div>
      </fieldset>
      <PillSet
        label="Property type"
        options={PROPERTY_TYPES}
        value={value.property_types ?? []}
        onChange={(next) => onChange({ ...value, property_types: next })}
      />
      <PillSet
        label="Furnishing"
        options={FURNISHING}
        value={value.furnishing ?? []}
        onChange={(next) => onChange({ ...value, furnishing: next })}
      />
      <PillSet
        label="Payment"
        options={PAYMENT}
        value={value.payment_structure ?? []}
        onChange={(next) => onChange({ ...value, payment_structure: next })}
      />
      <label className="text-xs text-slate-700">
        <span className="mb-1 block">Available from</span>
        <Input
          type="date"
          value={value.available_from ?? ''}
          onChange={(e) => onChange({ ...value, available_from: e.target.value || undefined })}
        />
      </label>
    </>
  );
}

function PillSet({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [string, string][];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((i) => i !== v) : [...value, v]);
  }
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium text-slate-700">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, text]) => {
          const active = value.includes(v);
          return (
            <button
              key={v}
              type="button"
              onClick={() => toggle(v)}
              className={
                'rounded-full px-3 py-1 text-xs ' +
                (active ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
              }
            >
              {text}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
