'use client';

/**
 * Make-an-offer modal — opens from the listing detail page CTA bar.
 * Captures price + (rent only) move-in date + optional conditions.
 */

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { offers } from '@/lib/offers';
import type { PublicListingDetail } from '@/lib/search';

interface Props {
  listing: PublicListingDetail;
  onClose: () => void;
  onSubmitted: () => void;
}

export function OfferModal({ listing, onClose, onSubmitted }: Props) {
  const initialPrice = listing.price ? String(Math.round(listing.price)) : '';
  const [price, setPrice] = useState(initialPrice);
  const [moveIn, setMoveIn] = useState('');
  const [conditions, setConditions] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit() {
    if (!price) {
      setError('Enter the price you want to offer.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await offers.submit(listing.id, {
        price: Number(price),
        move_in_date: moveIn || undefined,
        conditions: conditions.trim() || undefined,
      });
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit offer.');
    } finally {
      setBusy(false);
    }
  }

  const showMoveIn = listing.category === 'rent' || listing.category === 'off_campus';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <header className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Make an offer</h2>
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
          <label className="block text-sm">
            <span className="mb-1 block text-slate-700">Your offer (₦)</span>
            <Input
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder={initialPrice}
              required
            />
            {listing.price != null && (
              <p className="mt-1 text-xs text-slate-500">
                Asking price: ₦{Math.round(listing.price).toLocaleString('en-NG')}
              </p>
            )}
          </label>
          {showMoveIn && (
            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">Move-in date (optional)</span>
              <Input type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block text-slate-700">Conditions (optional)</span>
            <textarea
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="e.g. payment in two instalments, move-in subject to repairs"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            The landlord has 48 hours to accept, counter, or reject.
            {listing.category !== 'short_let' && (
              <>
                {' '}A BeeBop trusted agent will arrange a property visit before signing.
              </>
            )}
          </p>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Send offer'}
          </Button>
        </form>
      </div>
    </div>
  );
}
