'use client';

import { useEffect, useState } from 'react';

import { ListingCard } from '@/components/listing/listing-card';
import { getFeaturedListings, type PublicListingSummary } from '@/lib/search';

export function FeaturedCarousel() {
  const [items, setItems] = useState<PublicListingSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFeaturedListings(8)
      .then((l) => !cancelled && setItems(l))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (items === null) return null;
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Featured verified listings
      </h2>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {items.map((r) => (
          <div key={r.id} className="w-72 shrink-0">
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
        ))}
      </div>
    </section>
  );
}
