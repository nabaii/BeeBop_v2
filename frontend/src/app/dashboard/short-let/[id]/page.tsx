'use client';

/**
 * Per-listing short-let dashboard: rolling availability calendar (14/30/60/90),
 * pricing summary with edit link to the listing wizard, booking requests stub.
 */

import type { Route } from 'next';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';

import { BookingsPanel } from '@/components/bookings/bookings-panel';
import { ShortLetCalendar } from '@/components/dashboard/short-let-calendar';
import { StatTile } from '@/components/dashboard/stat-tile';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { dashboards, type ShortLetDashboardData } from '@/lib/dashboards';

export default function ShortLetDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<ShortLetDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(14);

  useEffect(() => {
    let cancelled = false;
    dashboards
      .shortLet(id, days)
      .then((d) => !cancelled && setData(d))
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Could not load dashboard.');
      });
    return () => {
      cancelled = true;
    };
  }, [id, days]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl p-6 sm:p-10">
        <p className="text-sm text-red-600">{error}</p>
        <Link
          href="/dashboard/short-let"
          className="mt-3 inline-block text-sm text-brand underline"
        >
          Back to short-let index
        </Link>
      </main>
    );
  }
  if (!data) {
    return <main className="p-8 text-sm text-slate-500">Loading…</main>;
  }

  const { pricing } = data;

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6 sm:p-10">
      <header>
        <Link href="/dashboard/short-let" className="text-xs text-slate-500 hover:underline">
          ← All short-let listings
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">
            {data.title ?? 'Untitled'}
          </h1>
          <Link href={`/listings/edit/${id}` as Route}>
            <Button variant="secondary">Edit listing</Button>
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile
          label="Base rate"
          value={pricing.base_rate ? `₦${pricing.base_rate.toLocaleString('en-NG')}` : '—'}
        />
        <StatTile
          label="Weekend rate"
          value={pricing.weekend_rate ? `₦${pricing.weekend_rate.toLocaleString('en-NG')}` : '—'}
        />
        <StatTile label="Min stay" value={pricing.min_stay_nights ?? '—'} hint="nights" />
        <StatTile
          label="Turnaround"
          value={pricing.turnaround_days ?? 0}
          hint="days between bookings"
        />
      </div>

      <ShortLetCalendar days={data.calendar.days} onWindowChange={setDays} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Upcoming bookings" value={data.upcoming_bookings_count} hint="Sprint 11" />
        <StatTile
          label="Pending booking requests"
          value={data.pending_booking_requests}
          hint="Sprint 11"
        />
        <StatTile
          label="Revenue (30d)"
          value={data.revenue_30d ? `₦${data.revenue_30d.toLocaleString('en-NG')}` : '—'}
          hint="Sprint 11"
        />
      </div>

      <BookingsPanel viewerRole="host" />
    </main>
  );
}
