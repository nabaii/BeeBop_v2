'use client';

import {
  CheckRow,
  CountField,
  DateField,
  ToggleChip,
} from '@/components/browse/filter-controls';
import type { ShortLetFilters } from '@/lib/search';

const RATINGS = [0, 3, 4, 4.5] as const;

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
        <DateField
          label="Check-in"
          value={value.check_in}
          onChange={(next) => onChange({ ...value, check_in: next })}
        />
        <DateField
          label="Check-out"
          value={value.check_out}
          onChange={(next) => onChange({ ...value, check_out: next })}
        />
      </div>
      <p className="-mt-1 text-caption text-ink-soft">
        Both dates hide places already booked for those nights.
      </p>
      {/* No guests field: nothing on a short-let listing records capacity, so
          the control could only ever look like it filtered. */}
      <CountField
        label="Min stay (nights)"
        placeholder="Any"
        value={value.min_stay}
        onChange={(next) => onChange({ ...value, min_stay: next })}
      />
      <CheckRow
        checked={value.instant_booking === true}
        onChange={() =>
          onChange({ ...value, instant_booking: value.instant_booking ? undefined : true })
        }
        label="Instant booking only"
      />
      <fieldset>
        <legend className="mb-1.5 text-caption font-medium text-ink">Minimum rating</legend>
        <div className="flex flex-wrap gap-1.5">
          {RATINGS.map((rating) => (
            <ToggleChip
              key={rating}
              active={(value.min_rating ?? 0) === rating}
              onClick={() => onChange({ ...value, min_rating: rating === 0 ? undefined : rating })}
            >
              {rating === 0 ? 'Any' : `${rating}+`}
            </ToggleChip>
          ))}
        </div>
      </fieldset>
    </>
  );
}
