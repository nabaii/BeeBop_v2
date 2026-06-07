'use client';

/**
 * Base listing form — shared across all four categories. Auto-saves every
 * field after a short debounce so the landlord never loses progress.
 */

import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { LocationPicker } from '@/components/listing/location-picker';
import { type ListingView, updateDraft } from '@/lib/listings';

interface Props {
  listing: ListingView;
  onSaved: (next: ListingView) => void;
}

type Draft = {
  title: string;
  subtitle: string;
  description: string;
  address_line: string;
  district: string;
  gps_lat: string;
  gps_lng: string;
  price: string;
};

function toDraft(listing: ListingView): Draft {
  return {
    title: listing.title ?? '',
    subtitle: listing.subtitle ?? '',
    description: listing.description ?? '',
    address_line: listing.address_line ?? '',
    district: listing.district ?? '',
    gps_lat: listing.gps_lat?.toString() ?? '',
    gps_lng: listing.gps_lng?.toString() ?? '',
    price: listing.price?.toString() ?? '',
  };
}

const DEBOUNCE_MS = 600;

export function ListingBaseForm({ listing, onSaved }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(listing));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Draft>(draft);

  latest.current = draft;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function updateField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setStatus('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
  }

  // The map picker sets both coordinates at once; save them together.
  function updateLocation(lat: number, lng: number) {
    setDraft((d) => ({ ...d, gps_lat: String(lat), gps_lng: String(lng) }));
    setStatus('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
  }

  async function flush() {
    try {
      const d = latest.current;
      const next = await updateDraft(listing.id, {
        title: d.title || undefined,
        subtitle: d.subtitle || undefined,
        description: d.description || undefined,
        address_line: d.address_line || undefined,
        district: d.district || undefined,
        gps_lat: d.gps_lat ? Number(d.gps_lat) : undefined,
        gps_lng: d.gps_lng ? Number(d.gps_lng) : undefined,
        price: d.price ? Number(d.price) : undefined,
      });
      onSaved(next);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  const priceLabel = priceLabelFor(listing.category);

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-sm transition-all duration-300 hover:shadow-md hover:border-brand/40 space-y-6">
      <header className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-50 p-2.5 text-brand shrink-0">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Listing details</h2>
            <p className="text-xs text-slate-500">Provide basic description and pricing</p>
          </div>
        </div>
        <SaveIndicator status={status} />
      </header>
      <div className="space-y-4">
        <Labelled label="Title">
          <Input
            value={draft.title}
            maxLength={200}
            onChange={(e) => updateField('title', e.target.value)}
            placeholder="e.g. Spacious 2-bed flat in Wuse 2"
          />
        </Labelled>
        <Labelled label="Subtitle (optional)">
          <Input
            value={draft.subtitle}
            maxLength={300}
            onChange={(e) => updateField('subtitle', e.target.value)}
            placeholder="Quiet estate, 24/7 power"
          />
        </Labelled>
        <Labelled label="Description" hint="Minimum 200 characters.">
          <textarea
            rows={6}
            value={draft.description}
            onChange={(e) => updateField('description', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none transition-colors"
            placeholder="Describe the property — rooms, condition, neighbourhood, what the seeker should expect."
          />
          <div className="mt-1 text-xs text-slate-500">{draft.description.length} / 200+ characters</div>
        </Labelled>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Labelled label="Address">
            <Input
              value={draft.address_line}
              onChange={(e) => updateField('address_line', e.target.value)}
              placeholder="12 Gimbiya Street, Area 11"
            />
          </Labelled>
          <Labelled label="District / estate">
            <Input
              value={draft.district}
              onChange={(e) => updateField('district', e.target.value)}
              placeholder="Wuse 2"
            />
          </Labelled>
        </div>
        <Labelled label="Pin location on map" hint="Click the map to place the pin.">
          <LocationPicker
            lat={draft.gps_lat ? Number(draft.gps_lat) : null}
            lng={draft.gps_lng ? Number(draft.gps_lng) : null}
            onChange={updateLocation}
          />
        </Labelled>
        <Labelled label={priceLabel} hint="Naira.">
          <Input
            inputMode="numeric"
            value={draft.price}
            onChange={(e) => updateField('price', e.target.value.replace(/[^0-9]/g, ''))}
          />
        </Labelled>
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

function SaveIndicator({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  const text =
    status === 'saving'
      ? 'Saving…'
      : status === 'saved'
        ? 'Saved'
        : status === 'error'
          ? 'Could not save'
          : '';
  const color =
    status === 'error' ? 'text-red-600' : status === 'saved' ? 'text-emerald-600' : 'text-slate-500';
  return <span className={`text-xs ${color}`}>{text}</span>;
}

function priceLabelFor(category: ListingView['category']): string {
  switch (category) {
    case 'rent':
      return 'Annual rent';
    case 'sales':
      return 'Sale price';
    case 'short_let':
      return 'Nightly rate';
    case 'off_campus':
      return 'Base price (per unit)';
  }
}

