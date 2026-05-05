'use client';

/**
 * Landlord (standard) dashboard.
 *
 * Sprint 5 lands the overview tiles + per-status breakdown + analytics
 * (views/saves/enquiries) + notifications inbox + a billing summary stub.
 * Offers/visits/agreements panels are empty-state until Sprints 8/9/10.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { EmptyPanel } from '@/components/dashboard/empty-panel';
import { NinVerifyCard } from '@/components/dashboard/nin-verify-card';
import { NotificationsInbox } from '@/components/dashboard/notifications-inbox';
import { StatTile } from '@/components/dashboard/stat-tile';
import { ListingCard } from '@/components/listing/listing-card';
import { AgreementsPanel } from '@/components/agreements/agreements-panel';
import { OffersPanel } from '@/components/offers/offers-panel';
import { Button } from '@/components/ui/button';
import {
  dashboards,
  type LandlordOverview,
  type ListingAnalytics,
} from '@/lib/dashboards';
import { listMyListings, type ListingView } from '@/lib/listings';

export default function LandlordDashboardPage() {
  const [overview, setOverview] = useState<LandlordOverview | null>(null);
  const [analytics, setAnalytics] = useState<ListingAnalytics[] | null>(null);
  const [listings, setListings] = useState<ListingView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      dashboards.landlord(),
      dashboards.landlordAnalytics(),
      listMyListings(),
    ])
      .then(([o, a, l]) => {
        if (cancelled) return;
        setOverview(o);
        setAnalytics(a);
        setListings(l);
      })
      .catch(() => !cancelled && setError('Could not load your dashboard.'));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6 sm:p-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Your listings</h1>
          <p className="mt-1 text-sm text-slate-500">
            All listings, offers, and your billing summary.
          </p>
        </div>
        <Link href="/listings/new">
          <Button>Create listing</Button>
        </Link>
      </header>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <NinVerifyCard />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Listings" value={overview?.listings_total ?? '—'} />
        <StatTile
          label="Pending offers"
          value={overview?.pending_offers_count ?? 0}
          hint="Sprint 8"
        />
        <StatTile
          label="Unread notifications"
          value={overview?.unread_notifications ?? 0}
          emphasis={Boolean(overview?.unread_notifications)}
        />
        <StatTile
          label="Total views"
          value={(analytics ?? []).reduce((sum, a) => sum + a.view_count, 0)}
        />
      </div>

      {overview && overview.listings_by_status.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">By status</h2>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs">
            {overview.listings_by_status.map((row) => (
              <li
                key={row.status}
                className="rounded-full bg-slate-100 px-3 py-1 capitalize text-slate-700"
              >
                {row.status.replaceAll('_', ' ')}: <strong>{row.count}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      <NotificationsInbox />

      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Listings</h2>
        {listings === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : listings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
            <p className="text-sm text-slate-600">You haven&apos;t created a listing yet.</p>
            <Link href="/listings/new" className="mt-3 inline-block">
              <Button>Create your first listing</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <div key={l.id} className="space-y-2">
                <ListingCard
                  data={{
                    id: l.id,
                    title: l.title,
                    category: l.category,
                    status: l.status,
                    price: l.price,
                    district: l.district,
                    cover_photo: l.photos.find((p) => p.is_cover) ?? l.photos[0] ?? null,
                  }}
                />
                <Link
                  href={`/listings/edit/${l.id}`}
                  className="block text-center text-xs text-brand hover:underline"
                >
                  {l.status === 'draft'
                    ? 'Continue editing'
                    : l.status === 'under_doc_review'
                      ? 'View submission'
                      : 'Edit listing'}
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {analytics && analytics.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Per-listing analytics</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-2">Listing</th>
                <th className="pb-2 text-right">Views</th>
                <th className="pb-2 text-right">Saves</th>
                <th className="pb-2 text-right">Enquiries</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analytics.map((a) => (
                <tr key={a.listing_id}>
                  <td className="py-2 text-slate-800">
                    {a.title ?? 'Untitled'}{' '}
                    <span className="text-xs text-slate-500">({a.category.replace('_', ' ')})</span>
                  </td>
                  <td className="py-2 text-right text-slate-700">{a.view_count}</td>
                  <td className="py-2 text-right text-slate-700">{a.save_count}</td>
                  <td className="py-2 text-right text-slate-700">{a.enquiry_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <OffersPanel viewerRole="landlord" />
      <AgreementsPanel viewerRole="landlord" />

      <EmptyPanel
        title="Visits"
        hint="Read-only — no landlord coordination. Visit confirmations and post-visit reports."
        comingIn="Sprint 9"
      />
      <EmptyPanel
        title="Agreements"
        hint="Pending-signature state, signed PDF download, and renewal prompts."
        comingIn="Sprint 10"
      />
      <EmptyPanel
        title="Fees & billing"
        hint="Facilitation fees itemised by transaction. No listing fees ever — only post-transaction commission."
        comingIn="Sprint 10"
      />
    </main>
  );
}
