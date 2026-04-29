'use client';

/**
 * Seeker dashboard.
 *
 * Sprint 3 landed the saved-listings grid. Sprint 5 adds the overview tiles
 * (saved count, active offers, agreements, unread notifications) and the
 * notifications inbox. Active offers + agreements panels are stubs until
 * Sprints 8 and 10 land their data.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { BookmarkButton } from '@/components/browse/bookmark-button';
import { EmptyPanel } from '@/components/dashboard/empty-panel';
import { NotificationsInbox } from '@/components/dashboard/notifications-inbox';
import { StatTile } from '@/components/dashboard/stat-tile';
import { ListingCard } from '@/components/listing/listing-card';
import { AgreementsPanel } from '@/components/agreements/agreements-panel';
import { BookingsPanel } from '@/components/bookings/bookings-panel';
import { OffersPanel } from '@/components/offers/offers-panel';
import { listSavedListings } from '@/lib/bookmarks';
import { dashboards, type SeekerOverview } from '@/lib/dashboards';
import type { PublicListingSummary } from '@/lib/search';

const UNAVAILABLE_STATUSES = new Set(['let_agreed', 'sale_agreed', 'delisted', 'suspended']);

export default function SeekerDashboardPage() {
  const [overview, setOverview] = useState<SeekerOverview | null>(null);
  const [items, setItems] = useState<PublicListingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([dashboards.seeker(), listSavedListings()])
      .then(([o, s]) => {
        if (cancelled) return;
        setOverview(o);
        setItems(s);
      })
      .catch(() => !cancelled && setError('Could not load your dashboard.'));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6 sm:p-10">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Your dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Saved homes, offers, and your active agreements.
        </p>
      </header>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Saved listings" value={overview?.saved_count ?? '—'} />
        <StatTile
          label="Active offers"
          value={overview?.active_offers_count ?? 0}
          hint="Sprint 8"
        />
        <StatTile label="Agreements" value={overview?.agreements_count ?? 0} hint="Sprint 10" />
        <StatTile
          label="Unread notifications"
          value={overview?.unread_notifications ?? 0}
          emphasis={Boolean(overview?.unread_notifications)}
        />
      </div>

      <NotificationsInbox />

      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Saved listings</h2>
        {items === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
            <p className="text-sm text-slate-600">You haven&apos;t saved any listings yet.</p>
            <Link href="/" className="mt-3 inline-block text-sm text-brand underline">
              Browse listings
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((r) => {
              const unavailable = UNAVAILABLE_STATUSES.has(r.status);
              return (
                <li key={r.id} className="relative">
                  <div className={unavailable ? 'opacity-60' : ''}>
                    <ListingCard
                      data={{
                        id: r.id,
                        title: r.title,
                        category: r.category,
                        status: r.status,
                        price: r.price,
                        district: r.district,
                        cover_photo: r.cover_url
                          ? {
                              id: `${r.id}-cover`,
                              url: r.cover_url,
                              room_label: null,
                              is_cover: true,
                              display_order: 0,
                            }
                          : null,
                        rating: r.rating,
                        review_count: r.review_count,
                      }}
                    />
                  </div>
                  <BookmarkButton
                    listingId={r.id}
                    initial={true}
                    className="absolute right-3 top-3"
                  />
                  {unavailable && (
                    <span className="absolute left-3 top-3 rounded-full bg-slate-900/80 px-2 py-0.5 text-[11px] font-medium text-white">
                      Unavailable
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <OffersPanel viewerRole="seeker" />
      <BookingsPanel viewerRole="seeker" />
      <AgreementsPanel viewerRole="seeker" />
    </main>
  );
}
