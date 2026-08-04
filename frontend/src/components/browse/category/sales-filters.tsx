'use client';

import { NumberPillGroup, PillGroup } from '@/components/browse/filter-controls';
import type { SalesFilters } from '@/lib/search';

const PROPERTY_TYPES = [
  ['flat', 'Flat'],
  ['detached', 'Detached'],
  ['semi_detached', 'Semi-detached'],
  ['terraced', 'Terraced'],
  ['land_only', 'Land only'],
  ['commercial', 'Commercial'],
] as const;

const DEV_STATUS = [
  ['ready', 'Ready'],
  ['off_plan', 'Off-plan'],
  ['under_construction', 'Under construction'],
] as const;

const TITLES = [
  ['c_of_o', 'C of O'],
  ['governors_consent', "Gov's Consent"],
  ['deed_of_assignment', 'Deed of Assignment'],
  ['leasehold', 'Leasehold'],
] as const;

export function SalesFilterFields({
  value,
  onChange,
}: {
  value: SalesFilters;
  onChange: (next: SalesFilters) => void;
}) {
  return (
    <>
      <NumberPillGroup
        label="Bedrooms"
        options={[1, 2, 3, 4, 5]}
        value={value.bedroom_counts ?? []}
        onChange={(next) => onChange({ ...value, bedroom_counts: next })}
      />
      <PillGroup
        label="Property type"
        options={PROPERTY_TYPES}
        value={value.property_types ?? []}
        onChange={(next) => onChange({ ...value, property_types: next })}
      />
      <PillGroup
        label="Development status"
        options={DEV_STATUS}
        value={value.development_status ?? []}
        onChange={(next) => onChange({ ...value, development_status: next })}
      />
      <PillGroup
        label="Title type"
        options={TITLES}
        value={value.title_types ?? []}
        onChange={(next) => onChange({ ...value, title_types: next })}
      />
    </>
  );
}
