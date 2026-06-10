'use client';

import { Input } from '@/components/ui/input';
import type { ShortLetFilters } from '@/lib/search';

export function ShortLetFilterFields({
  value,
  onChange,
}: {
  value: ShortLetFilters;
  onChange: (next: ShortLetFilters) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-700">
          <span className="mb-1 block">Check-in</span>
          <Input
            type="date"
            value={value.check_in ?? ''}
            onChange={(e) => onChange({ ...value, check_in: e.target.value || undefined })}
          />
        </label>
        <label className="text-xs text-slate-700">
          <span className="mb-1 block">Check-out</span>
          <Input
            type="date"
            value={value.check_out ?? ''}
            onChange={(e) => onChange({ ...value, check_out: e.target.value || undefined })}
          />
        </label>
      </div>
      <label className="text-xs text-slate-700">
        <span className="mb-1 block">Guests</span>
        <Input
          inputMode="numeric"
          value={value.guests?.toString() ?? ''}
          onChange={(e) =>
            onChange({
              ...value,
              guests: e.target.value ? Number(e.target.value.replace(/[^0-9]/g, '')) : undefined,
            })
          }
        />
      </label>
      <label className="text-xs text-slate-700">
        <span className="mb-1 block">Minimum stay (nights)</span>
        <Input
          inputMode="numeric"
          value={value.min_stay?.toString() ?? ''}
          onChange={(e) =>
            onChange({
              ...value,
              min_stay: e.target.value ? Number(e.target.value.replace(/[^0-9]/g, '')) : undefined,
            })
          }
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={value.instant_booking === true}
          onChange={(e) =>
            onChange({ ...value, instant_booking: e.target.checked ? true : undefined })
          }
          className="h-3.5 w-3.5 rounded border-slate-300 text-brand focus:ring-brand"
        />
        Instant booking only
      </label>
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-slate-700">Minimum rating</legend>
        <div className="flex gap-2">
          {[0, 3, 4, 4.5].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() =>
                onChange({ ...value, min_rating: v === 0 ? undefined : v })
              }
              className={
                'rounded-full px-2 py-1 text-xs ' +
                ((value.min_rating ?? 0) === v
                  ? 'bg-brand text-slate-900'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
              }
            >
              {v === 0 ? 'Any' : `${v}+`}
            </button>
          ))}
        </div>
      </fieldset>
    </>
  );
}
