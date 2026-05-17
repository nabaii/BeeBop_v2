'use client';

import type { OffCampusFilters } from '@/lib/search';

export function OffCampusFilterFields({
  value,
  onChange,
}: {
  value: OffCampusFilters;
  onChange: (next: OffCampusFilters) => void;
}) {
  const kinds = value.unit_kinds ?? [];
  function toggleKind(kind: string) {
    onChange({
      ...value,
      unit_kinds: kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind],
    });
  }
  return (
    <>
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-slate-700">Unit type</legend>
        <ul className="space-y-1">
          {[
            ['single_room', 'Single room'],
            ['two_in_a_room', '2-in-a-room'],
            ['three_in_a_room', '3-in-a-room'],
            ['self_contain', 'Self-contain'],
          ].map(([k, label]) => (
            <li key={k}>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={kinds.includes(k)}
                  onChange={() => toggleKind(k)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand focus:ring-brand"
                />
                {label}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <label className="flex items-center gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={Boolean(value.available_now)}
          onChange={(e) => onChange({ ...value, available_now: e.target.checked })}
          className="h-3.5 w-3.5 rounded border-slate-300 text-brand focus:ring-brand"
        />
        Available now
      </label>
    </>
  );
}
