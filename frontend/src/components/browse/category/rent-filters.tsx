'use client';

import {
  DateField,
  MinCountPills,
  NumberPillGroup,
  PillGroup,
} from '@/components/browse/filter-controls';
import type { RentFilters } from '@/lib/search';

const PROPERTY_TYPES = [
  ['flat', 'Flat'],
  ['detached', 'Detached'],
  ['semi_detached', 'Semi-detached'],
  ['terraced', 'Terraced'],
  ['bq', 'BQ'],
  ['mini_flat', 'Mini flat'],
  ['self_contain', 'Self-contain'],
] as const;

const FURNISHING = [
  ['furnished', 'Furnished'],
  ['semi_furnished', 'Semi-furnished'],
  ['unfurnished', 'Unfurnished'],
] as const;

const PAYMENT = [
  ['annual', 'Annual'],
  ['two_years_upfront', '2 years upfront'],
] as const;

export function RentFilterFields({
  value,
  onChange,
}: {
  value: RentFilters;
  onChange: (next: RentFilters) => void;
}) {
  return (
    <>
      <NumberPillGroup
        label="Bedrooms"
        options={[1, 2, 3, 4, 5]}
        value={value.bedroom_counts ?? []}
        onChange={(next) => onChange({ ...value, bedroom_counts: next })}
      />
      <MinCountPills
        label="Bathrooms"
        options={[1, 2, 3, 4]}
        value={value.min_bathrooms}
        onChange={(next) => onChange({ ...value, min_bathrooms: next })}
      />
      <PillGroup
        label="Property type"
        options={PROPERTY_TYPES}
        value={value.property_types ?? []}
        onChange={(next) => onChange({ ...value, property_types: next })}
      />
      <PillGroup
        label="Furnishing"
        options={FURNISHING}
        value={value.furnishing ?? []}
        onChange={(next) => onChange({ ...value, furnishing: next })}
      />
      <PillGroup
        label="Payment"
        options={PAYMENT}
        value={value.payment_structure ?? []}
        onChange={(next) => onChange({ ...value, payment_structure: next })}
      />
      <DateField
        label="Available from"
        value={value.available_from}
        onChange={(next) => onChange({ ...value, available_from: next })}
      />
    </>
  );
}
