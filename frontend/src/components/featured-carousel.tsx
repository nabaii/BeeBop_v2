'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ListingCard } from '@/components/listing/listing-card';
import { ListingCardSkeleton } from '@/components/ui/skeleton';
import { getFeaturedListings, type PublicListingSummary } from '@/lib/search';

export function FeaturedCarousel({ showBrowseLink = true }: { showBrowseLink?: boolean }) {
  const [items, setItems] = useState<PublicListingSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Request a generous page of live listings. If the backend rejects the
    // size (older deploys cap this lower and return 422), fall back to a
    // conservative limit so a frontend/backend deploy-order mismatch can
    // never silently blank the whole row.
    getFeaturedListings(50)
      .catch(() => getFeaturedListings(12))
      .then((l) => !cancelled && setItems(l))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (items === null) {
    return (
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Properties in Abuja</h2>
        <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-64 shrink-0">
              <ListingCardSkeleton />
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Properties in Abuja</h2>
        {showBrowseLink && (
          <Link href="/browse" className="text-sm font-medium text-brand hover:text-brand-700">
            See all &rsaquo;
          </Link>
        )}
      </div>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
        {items.map((r) => (
          <div key={r.id} className="w-64 shrink-0">
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
                bedroom_count: r.bedroom_count,
                bathroom_count: r.bathroom_count,
              }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
