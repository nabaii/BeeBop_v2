'use client';

/** Reusable offers panel — used by both the seeker and landlord dashboards. */

import { useEffect, useState } from 'react';

import { OfferThreadCard } from '@/components/offers/offer-thread';
import { ApiError } from '@/lib/api';
import { offers, type OfferThreadView } from '@/lib/offers';

interface Props {
  viewerRole: 'seeker' | 'landlord';
}

export function OffersPanel({ viewerRole }: Props) {
  const [threads, setThreads] = useState<OfferThreadView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const list = viewerRole === 'seeker'
        ? await offers.myOffers()
        : await offers.landlordOffers();
      setThreads(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load offers.');
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerRole]);

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">
        {viewerRole === 'seeker' ? 'Active offers' : 'Offers and enquiries'}
      </h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {threads === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : threads.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
          {viewerRole === 'seeker'
            ? 'You haven’t made any offers yet.'
            : 'No offers on your listings yet.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {threads.map((t) => (
            <li key={t.current_offer_id}>
              <OfferThreadCard thread={t} viewerRole={viewerRole} onChanged={refresh} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
