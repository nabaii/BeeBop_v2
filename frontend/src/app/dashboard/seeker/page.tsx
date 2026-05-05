'use client';

/**
 * Seeker activity hub. Houses the offers, bookings, and agreements panels.
 * Saved listings, stats, and notifications were moved to /profile when the
 * mobile profile page was introduced.
 */

import Link from 'next/link';

import { AgreementsPanel } from '@/components/agreements/agreements-panel';
import { BookingsPanel } from '@/components/bookings/bookings-panel';
import { OffersPanel } from '@/components/offers/offers-panel';

export default function SeekerActivityPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6 sm:p-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Your activity</h1>
          <p className="mt-1 text-sm text-slate-500">
            Open offers, scheduled bookings, and signed agreements.
          </p>
        </div>
        <Link
          href="/profile"
          className="text-sm font-medium text-brand hover:text-brand-700"
        >
          &lsaquo; Back to profile
        </Link>
      </header>

      <OffersPanel viewerRole="seeker" />
      <BookingsPanel viewerRole="seeker" />
      <AgreementsPanel viewerRole="seeker" />
    </main>
  );
}
