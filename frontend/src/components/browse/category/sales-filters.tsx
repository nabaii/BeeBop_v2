'use client';

import type { SalesFilters } from '@/lib/search';

const PROPERTY_TYPES: [string, string][] = [
  ['flat', 'Flat'],
  ['detached', 'Detached'],
  ['semi_detached', 'Semi-detached'],
  ['terraced', 'Terraced'],
  ['land_only', 'Land only'],
  ['commercial', 'Commercial'],
];

const DEV_STATUS: [string, string][] = [
  ['ready', 'Ready'],
  ['off_plan', 'Off-plan'],
  ['under_construction', 'Under construction'],
];

const TITLES: [string, string][] = [
  ['c_of_o', 'C of O'],
  ['governors_consent', "Gov's Consent"],
  ['deed_of_assignment', 'Deed of Assignment'],
  ['leasehold', 'Leasehold'],
];

export function SalesFilterFields({
  value,
  onChange,
}: {
  value: SalesFilters;
  onChange: (next: SalesFilters) => void;
}) {
  function toggleNum(list: number[] | undefined, n: number): number[] {
    const current = list ?? [];
    return current.includes(n) ? current.filter((i) => i !== n) : [...current, n];
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
                  onChange({ ...value, bedroom_counts: toggleNum(value.bedroom_counts, n) })
                }
                className={
                  'rounded-full px-3 py-1 text-xs ' +
                  (active ? 'bg-brand text-slate-900' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
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
        label="Development status"
        options={DEV_STATUS}
        value={value.development_status ?? []}
        onChange={(next) => onChange({ ...value, development_status: next })}
      />
      <PillSet
        label="Title type"
        options={TITLES}
        value={value.title_types ?? []}
        onChange={(next) => onChange({ ...value, title_types: next })}
      />
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
                (active ? 'bg-brand text-slate-900' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
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
