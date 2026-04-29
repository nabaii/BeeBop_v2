'use client';

/**
 * Category-specific structured fields (Listing.type_data). Each category
 * renders a different set of controls; all share the same debounced
 * auto-save pattern as the base form.
 */

import { useEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import { type ListingView, updateDraft } from '@/lib/listings';

interface Props {
  listing: ListingView;
  onSaved: (next: ListingView) => void;
}

const DEBOUNCE_MS = 600;

export function TypeDataForm({ listing, onSaved }: Props) {
  if (listing.category === 'rent') return <RentFields listing={listing} onSaved={onSaved} />;
  if (listing.category === 'sales') return <SalesFields listing={listing} onSaved={onSaved} />;
  if (listing.category === 'off_campus') return <OffCampusFields listing={listing} onSaved={onSaved} />;
  // short_let uses ShortLetPricing component (separate endpoint). No generic
  // type_data controls shown here.
  return null;
}

function useAutoSave(listing: ListingView, onSaved: (next: ListingView) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return function save(patch: Record<string, unknown>) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const next = await updateDraft(listing.id, { type_data: patch });
      onSaved(next);
    }, DEBOUNCE_MS);
  };
}

function RentFields({ listing, onSaved }: Props) {
  const initial = listing.type_data as Record<string, string | number | undefined>;
  const [bedrooms, setBedrooms] = useState(String(initial.bedroom_count ?? ''));
  const [propertyType, setPropertyType] = useState(String(initial.property_type ?? 'flat'));
  const [furnishing, setFurnishing] = useState(String(initial.furnishing ?? 'unfurnished'));
  const [payment, setPayment] = useState(String(initial.payment_structure ?? 'annual'));
  const [availableFrom, setAvailableFrom] = useState(String(initial.available_from ?? ''));

  const save = useAutoSave(listing, onSaved);

  function commit(next: Record<string, unknown>) {
    save({
      bedroom_count: bedrooms ? Number(bedrooms) : undefined,
      property_type: propertyType,
      furnishing,
      payment_structure: payment,
      available_from: availableFrom || undefined,
      ...next,
    });
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-slate-900">Rent details</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Labelled label="Bedrooms">
          <Input
            inputMode="numeric"
            value={bedrooms}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '');
              setBedrooms(v);
              commit({ bedroom_count: v ? Number(v) : undefined });
            }}
          />
        </Labelled>
        <Labelled label="Property type">
          <Select
            value={propertyType}
            onChange={(v) => {
              setPropertyType(v);
              commit({ property_type: v });
            }}
            options={[
              ['flat', 'Flat'],
              ['detached', 'Detached'],
              ['semi_detached', 'Semi-detached'],
              ['terraced', 'Terraced'],
              ['bq', 'Boys quarters'],
              ['mini_flat', 'Mini flat'],
              ['self_contain', 'Self-contain'],
            ]}
          />
        </Labelled>
        <Labelled label="Furnishing">
          <Select
            value={furnishing}
            onChange={(v) => {
              setFurnishing(v);
              commit({ furnishing: v });
            }}
            options={[
              ['furnished', 'Furnished'],
              ['semi_furnished', 'Semi-furnished'],
              ['unfurnished', 'Unfurnished'],
            ]}
          />
        </Labelled>
        <Labelled label="Payment structure">
          <Select
            value={payment}
            onChange={(v) => {
              setPayment(v);
              commit({ payment_structure: v });
            }}
            options={[
              ['annual', 'Annual'],
              ['two_years_upfront', '2 years upfront'],
            ]}
          />
        </Labelled>
        <Labelled label="Available from">
          <Input
            type="date"
            value={availableFrom}
            onChange={(e) => {
              setAvailableFrom(e.target.value);
              commit({ available_from: e.target.value || undefined });
            }}
          />
        </Labelled>
      </div>
    </section>
  );
}

function SalesFields({ listing, onSaved }: Props) {
  const initial = listing.type_data as Record<string, string | number | undefined>;
  const [bedrooms, setBedrooms] = useState(String(initial.bedroom_count ?? ''));
  const [propertyType, setPropertyType] = useState(String(initial.property_type ?? 'flat'));
  const [devStatus, setDevStatus] = useState(String(initial.development_status ?? 'ready'));
  const [titleType, setTitleType] = useState(String(initial.title_type ?? 'c_of_o'));
  const save = useAutoSave(listing, onSaved);

  function commit(next: Record<string, unknown>) {
    save({
      bedroom_count: bedrooms ? Number(bedrooms) : undefined,
      property_type: propertyType,
      development_status: devStatus,
      title_type: titleType,
      ...next,
    });
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-slate-900">Sale details</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Labelled label="Bedrooms (if applicable)">
          <Input
            inputMode="numeric"
            value={bedrooms}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '');
              setBedrooms(v);
              commit({ bedroom_count: v ? Number(v) : undefined });
            }}
          />
        </Labelled>
        <Labelled label="Property type">
          <Select
            value={propertyType}
            onChange={(v) => {
              setPropertyType(v);
              commit({ property_type: v });
            }}
            options={[
              ['flat', 'Flat'],
              ['detached', 'Detached'],
              ['semi_detached', 'Semi-detached'],
              ['terraced', 'Terraced'],
              ['land_only', 'Land only'],
              ['commercial', 'Commercial'],
            ]}
          />
        </Labelled>
        <Labelled label="Development status">
          <Select
            value={devStatus}
            onChange={(v) => {
              setDevStatus(v);
              commit({ development_status: v });
            }}
            options={[
              ['ready', 'Ready'],
              ['off_plan', 'Off-plan'],
              ['under_construction', 'Under construction'],
            ]}
          />
        </Labelled>
        <Labelled label="Title type">
          <Select
            value={titleType}
            onChange={(v) => {
              setTitleType(v);
              commit({ title_type: v });
            }}
            options={[
              ['c_of_o', 'Certificate of Occupancy'],
              ['governors_consent', "Governor's Consent"],
              ['deed_of_assignment', 'Deed of Assignment'],
              ['leasehold', 'Leasehold'],
            ]}
          />
        </Labelled>
      </div>
    </section>
  );
}

function OffCampusFields({ listing, onSaved }: Props) {
  const initial = listing.type_data as { institutions_accepted?: string[] };
  const [institutionsText, setInstitutionsText] = useState(
    (initial.institutions_accepted ?? []).join(', '),
  );
  const save = useAutoSave(listing, onSaved);

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-slate-900">Off-campus details</h2>
      <Labelled label="Institutions accepted" hint="Comma-separated.">
        <Input
          value={institutionsText}
          onChange={(e) => {
            setInstitutionsText(e.target.value);
            const list = e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            save({ institutions_accepted: list });
          }}
          placeholder="e.g. University of Abuja, Baze University"
        />
      </Labelled>
      <p className="text-xs text-slate-500">
        Set room-level pricing and gender tags in the inventory section below.
      </p>
    </section>
  );
}

function Labelled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">
        {label}
        {hint && <span className="ml-2 text-xs font-normal text-slate-500">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}
