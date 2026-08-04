'use client';

import { CheckRow, PillGroup } from '@/components/browse/filter-controls';
import type { OffCampusFilters } from '@/lib/search';

const UNIT_KINDS = [
  ['single_room', 'Single room'],
  ['two_in_a_room', '2-in-a-room'],
  ['three_in_a_room', '3-in-a-room'],
  ['self_contain', 'Self-contain'],
] as const;

export function OffCampusFilterFields({
  value,
  onChange,
}: {
  value: OffCampusFilters;
  onChange: (next: OffCampusFilters) => void;
}) {
  return (
    <>
      <PillGroup
        label="Unit type"
        options={UNIT_KINDS}
        value={value.unit_kinds ?? []}
        onChange={(next) => onChange({ ...value, unit_kinds: next })}
      />
      <CheckRow
        checked={Boolean(value.available_now)}
        onChange={() =>
          // Undefined rather than false when off, so the filter drops out of the
          // URL and the active-filter count instead of riding along as noise.
          onChange({ ...value, available_now: value.available_now ? undefined : true })
        }
        label="Beds available now"
      />
    </>
  );
}
