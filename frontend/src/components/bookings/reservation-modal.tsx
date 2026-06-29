'use client';

/**
 * Off-campus "Book now" modal. The seeker picks a unit type and pays the full
 * term price upfront via Paystack. The quote (including the Beebop service
 * fee) comes from the backend so pricing stays a single source of truth.
 */

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { pricePeriodLabel } from '@/lib/listings';
import { reservations, type ReservationQuote } from '@/lib/reservations';
import type { PublicListingDetail, PublicUnitType } from '@/lib/search';

interface Props {
  listing: PublicListingDetail;
  onClose: () => void;
  onCreated: (paystackUrl: string | null) => void;
}

function formatPrice(value: number): string {
  return `₦${Math.round(value).toLocaleString('en-NG')}`;
}

export function ReservationModal({ listing, onClose, onCreated }: Props) {
  const bookable = listing.unit_types.filter((u) => u.beds_available > 0);
  const [unitId, setUnitId] = useState<string>(bookable[0]?.id ?? '');
  const [quote, setQuote] = useState<ReservationQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Pull the authoritative quote whenever the selected unit changes.
  useEffect(() => {
    if (!unitId) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    reservations
      .quote(listing.id, unitId)
      .then((q) => !cancelled && setQuote(q))
      .catch(() => !cancelled && setQuote(null));
    return () => {
      cancelled = true;
    };
  }, [listing.id, unitId]);

  async function submit() {
    if (!unitId) {
      setError('Select a unit to book.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await reservations.create(listing.id, unitId);
      onCreated(result.paystack_authorization_url ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the booking.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <header className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Book this accommodation</h2>
            <p className="mt-1 text-sm text-slate-500">{listing.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {bookable.length === 0 ? (
          <p className="mt-6 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            Every unit on this listing is fully booked right now. Organise a
            visit and we&apos;ll let you know when a space opens up.
          </p>
        ) : (
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium text-slate-700">Choose a unit</legend>
              {bookable.map((unit) => (
                <UnitOption
                  key={unit.id}
                  unit={unit}
                  selected={unit.id === unitId}
                  onSelect={() => setUnitId(unit.id)}
                />
              ))}
            </fieldset>

            {quote && (
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <Row
                  label={`${quote.unit_type_name} · per ${pricePeriodLabel(quote.price_period)}`}
                  value={quote.base_total}
                />
                <Row label="Beebop service fee" value={quote.seeker_fee} />
                <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
                  <span>Total due now</span>
                  <span>{formatPrice(quote.grand_total)}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  You pay the full {pricePeriodLabel(quote.price_period)} upfront. The
                  bed is reserved for you as soon as payment is confirmed.
                </p>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button type="submit" className="w-full" disabled={busy || !quote}>
              {busy ? 'Starting…' : quote ? `Pay ${formatPrice(quote.grand_total)}` : 'Continue'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

function UnitOption({
  unit,
  selected,
  onSelect,
}: {
  unit: PublicUnitType;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2.5 text-sm ${
        selected ? 'border-brand bg-brand/5' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <span className="flex items-center gap-2">
        <input
          type="radio"
          name="unit-type"
          checked={selected}
          onChange={onSelect}
          className="accent-brand"
        />
        <span>
          <span className="font-medium text-slate-900">{unit.name}</span>
          <span className="block text-xs text-slate-500">
            {unit.beds_available} bed{unit.beds_available === 1 ? '' : 's'} left
            {unit.gender_tag !== 'any' ? ` · ${unit.gender_tag}` : ''}
          </span>
        </span>
      </span>
      <span className="text-right">
        <span className="font-semibold text-slate-900">{formatPrice(unit.price)}</span>
        <span className="block text-xs text-slate-500">/ {pricePeriodLabel(unit.price_period)}</span>
      </span>
    </label>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-slate-700">
      <span>{label}</span>
      <span>{formatPrice(value)}</span>
    </div>
  );
}
