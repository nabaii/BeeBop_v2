'use client';

/**
 * Category-specific structured fields (Listing.type_data). Each category
 * renders a different set of controls; all share the same debounced
 * auto-save pattern as the base form.
 */

import { useEffect, useRef, useState } from 'react';
import { Clock, Home, DollarSign, FileText, LayoutGrid, Trash2, Upload } from 'lucide-react';

import { Input } from '@/components/ui/input';
import {
  getPhotoUploadSignature,
  updateDraft,
  uploadRawToCloudinary,
  type ListingView,
} from '@/lib/listings';

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
    <section className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-sm transition-all duration-300 hover:shadow-md hover:border-brand/40 space-y-6">
      <header className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600 shrink-0">
          <Home className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">Rent details</h2>
          <p className="text-xs text-slate-500">Provide specific tenancy and rental details</p>
        </div>
      </header>
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
    <section className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-sm transition-all duration-300 hover:shadow-md hover:border-brand/40 space-y-6">
      <header className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600 shrink-0">
          <DollarSign className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">Sale details</h2>
          <p className="text-xs text-slate-500">Provide property structure and ownership documents</p>
        </div>
      </header>
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
  const initial = listing.type_data as {
    institutions_accepted?: string[];
    show_availability?: boolean;
    rules_doc_url?: string;
    rules_doc_name?: string;
    drive_min_nile?: number;
    drive_min_baze?: number;
  };
  const [institutionsText, setInstitutionsText] = useState(
    (initial.institutions_accepted ?? []).join(', '),
  );
  // Default on — available beds are a key glance stat for students. Stored as
  // type_data.show_availability so the public page can hide it on request.
  const [showAvailability, setShowAvailability] = useState(initial.show_availability !== false);
  const [driveNile, setDriveNile] = useState(
    initial.drive_min_nile != null ? String(initial.drive_min_nile) : '',
  );
  const [driveBaze, setDriveBaze] = useState(
    initial.drive_min_baze != null ? String(initial.drive_min_baze) : '',
  );
  const [rulesUrl, setRulesUrl] = useState(initial.rules_doc_url ?? '');
  const [rulesName, setRulesName] = useState(initial.rules_doc_name ?? '');
  const [rulesUploading, setRulesUploading] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const save = useAutoSave(listing, onSaved);

  async function onRulesFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setRulesError('Please upload a PDF file.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setRulesError('File is too large. Max 25MB.');
      return;
    }
    setRulesUploading(true);
    setRulesError(null);
    try {
      const sig = await getPhotoUploadSignature(listing.id);
      const { secure_url } = await uploadRawToCloudinary(sig, file);
      // Persist immediately (not debounced) so the link survives a quick exit.
      const next = await updateDraft(listing.id, {
        type_data: { rules_doc_url: secure_url, rules_doc_name: file.name },
      });
      setRulesUrl(secure_url);
      setRulesName(file.name);
      onSaved(next);
    } catch {
      setRulesError('Upload failed. Please try again.');
    } finally {
      setRulesUploading(false);
    }
  }

  async function removeRules() {
    const next = await updateDraft(listing.id, {
      type_data: { rules_doc_url: null, rules_doc_name: null },
    });
    setRulesUrl('');
    setRulesName('');
    onSaved(next);
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-sm transition-all duration-300 hover:shadow-md hover:border-brand/40 space-y-6">
      <header className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="rounded-xl bg-rose-50 p-2.5 text-rose-600 shrink-0">
          <LayoutGrid className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">Off-campus details</h2>
          <p className="text-xs text-slate-500">Provide accepted academic institutions</p>
        </div>
      </header>
      <div className="space-y-4">
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
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showAvailability}
            onChange={(e) => {
              setShowAvailability(e.target.checked);
              save({ show_availability: e.target.checked });
            }}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
          />
          <span className="text-sm">
            <span className="block font-medium text-slate-800">Show available beds at a glance</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Displays total beds available across your unit types near the price. Turn off to keep
              availability private.
            </span>
          </span>
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Labelled
            label="Drive time to Nile University"
            hint="In minutes. Optional."
          >
            <div className="relative">
              <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                inputMode="numeric"
                className="pl-9"
                value={driveNile}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, '');
                  setDriveNile(v);
                  save({ drive_min_nile: v ? Number(v) : null });
                }}
                placeholder="e.g. 12"
              />
            </div>
          </Labelled>
          <Labelled
            label="Drive time to Baze University"
            hint="In minutes. Optional."
          >
            <div className="relative">
              <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                inputMode="numeric"
                className="pl-9"
                value={driveBaze}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, '');
                  setDriveBaze(v);
                  save({ drive_min_baze: v ? Number(v) : null });
                }}
                placeholder="e.g. 18"
              />
            </div>
          </Labelled>
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-medium text-slate-700">
            House rules / code of conduct
            <span className="ml-2 text-xs font-normal text-slate-500">PDF, optional. Max 25MB.</span>
          </span>
          {rulesUrl ? (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <a
                href={rulesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 items-center gap-3"
              >
                <div className="rounded-lg bg-slate-50 p-2 text-slate-400">
                  <FileText className="h-4 w-4" />
                </div>
                <span className="truncate text-xs font-bold text-slate-900 hover:underline">
                  {rulesName || 'House rules.pdf'}
                </span>
              </a>
              <button
                type="button"
                onClick={() => void removeRules()}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition-colors hover:border-red-100 hover:bg-red-50/50 hover:text-red-600"
                aria-label="Remove house rules document"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label
              className={
                'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/20 p-6 text-center text-slate-400 transition-colors hover:border-brand/40 ' +
                (rulesUploading ? 'pointer-events-none opacity-60' : '')
              }
            >
              {rulesUploading ? (
                <div className="mb-2 h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
              ) : (
                <Upload className="mb-2 h-5 w-5" />
              )}
              <span className="text-xs font-semibold">
                {rulesUploading ? 'Uploading…' : 'Upload house rules (PDF)'}
              </span>
              <input
                type="file"
                hidden
                accept="application/pdf"
                onChange={(e) => void onRulesFile(e.target.files)}
              />
            </label>
          )}
          {rulesError && <p className="text-xs font-semibold text-red-600">{rulesError}</p>}
        </div>

        <p className="text-xs text-slate-500">
          Set room-level pricing and gender tags in the inventory section below.
        </p>
      </div>
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
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20 cursor-pointer"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}
