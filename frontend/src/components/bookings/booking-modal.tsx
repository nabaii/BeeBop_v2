'use client';

/**
 * Short-let booking modal opened from the listing CTA. Quotes live as the
 * seeker picks dates. Submit triggers either an instant Paystack redirect
 * or a request that the host has 24 hours to action.
 */

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { bookings, type BookingQuote } from '@/lib/bookings';
import type { PublicListingDetail } from '@/lib/search';

interface Props {
  listing: PublicListingDetail;
  onClose: () => void;
  onCreated: (paystackUrl: string | null) => void;
}

export function BookingModal({ listing, onClose, onCreated }: Props) {
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState('1');
  const [quote, setQuote] = useState<BookingQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-quote whenever both dates are filled.
  useEffect(() => {
    if (!checkIn || !checkOut) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    bookings
      .quote(listing.id, {
        check_in: checkIn,
        check_out: checkOut,
        guest_count: Number(guests) || 1,
      })
      .then((q) => !cancelled && setQuote(q))
      .catch(() => !cancelled && setQuote(null));
    return () => {
      cancelled = true;
    };
  }, [listing.id, checkIn, checkOut, guests]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await bookings.create(listing.id, {
        check_in: checkIn,
        check_out: checkOut,
        guest_count: Number(guests) || 1,
      });
      onCreated(result.paystack_authorization_url ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Booking failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <header className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Book this stay</h2>
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
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">Check-in</span>
              <Input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">Check-out</span>
              <Input
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                required
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-700">Guests</span>
            <Input
              inputMode="numeric"
              value={guests}
              onChange={(e) => setGuests(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </label>

          {quote && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <Row label={`${quote.nights} night(s) × base rate`} value={quote.base_total} />
              {quote.weekend_uplift > 0 && (
                <Row label="Weekend uplift" value={quote.weekend_uplift} />
              )}
              <Row label="Beebop service fee" value={quote.seeker_fee} />
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
                <span>Total</span>
                <span>₦{Math.round(quote.grand_total).toLocaleString('en-NG')}</span>
              </div>
              {!quote.min_stay_satisfied && (
                <p className="mt-2 text-xs text-amber-700">
                  Below the host&apos;s minimum stay.
                </p>
              )}
              {!quote.instant_booking && (
                <p className="mt-2 text-xs text-slate-600">
                  This listing requires host approval. You won&apos;t be charged
                  until they accept (within 24 hours).
                </p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button
            type="submit"
            className="w-full"
            disabled={busy || !quote || !quote.min_stay_satisfied}
          >
            {busy
              ? 'Submitting…'
              : quote?.instant_booking
                ? 'Book and pay now'
                : 'Send request'}
          </Button>
        </form>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-slate-700">
      <span>{label}</span>
      <span>₦{Math.round(value).toLocaleString('en-NG')}</span>
    </div>
  );
}
