'use client';

/**
 * Listing gallery — room-grouped. Inspector walkthrough shots are surfaced
 * as a separately labelled section below the main gallery (product brief §6).
 */

import { useMemo, useState } from 'react';

import type { PublicListingDetail } from '@/lib/search';

export function ListingGallery({ listing }: { listing: PublicListingDetail }) {
  const { listingPhotos, walkthroughPhotos } = useMemo(() => {
    const listingPhotos = listing.photos.filter((p) => !p.is_inspector_walkthrough);
    const walkthroughPhotos = listing.photos.filter((p) => p.is_inspector_walkthrough);
    return { listingPhotos, walkthroughPhotos };
  }, [listing]);

  if (listingPhotos.length === 0) {
    return (
      <div className="aspect-[16/9] rounded-xl bg-slate-100 text-sm text-slate-400">
        <div className="flex h-full items-center justify-center">No photos yet</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HeroGrid photos={listingPhotos} />
      {listingPhotos.length > 4 && <FullScrollRow photos={listingPhotos} />}
      {walkthroughPhotos.length > 0 && (
        <section className="space-y-2">
          <header>
            <h3 className="text-sm font-semibold text-slate-900">BeeBop Verified Walkthrough</h3>
            <p className="text-xs text-slate-500">
              Taken during an independent on-site inspection.
            </p>
          </header>
          <FullScrollRow photos={walkthroughPhotos} />
        </section>
      )}
    </div>
  );
}

function HeroGrid({ photos }: { photos: PublicListingDetail['photos'] }) {
  const cover = photos.find((p) => p.is_cover) ?? photos[0];
  const supporting = photos.filter((p) => p.id !== cover.id).slice(0, 4);
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr]">
      <div className="overflow-hidden rounded-xl bg-slate-100">
        <img src={cover.url} alt={cover.room_label ?? 'Listing cover'} className="h-full w-full object-cover" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {supporting.map((p) => (
          <div key={p.id} className="aspect-square overflow-hidden rounded-xl bg-slate-100">
            <img
              src={p.url}
              alt={p.room_label ?? 'Listing photo'}
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function FullScrollRow({ photos }: { photos: PublicListingDetail['photos'] }) {
  // Group by room label so the gallery reads naturally when scanning.
  const groups = useMemo(() => {
    const by = new Map<string, PublicListingDetail['photos']>();
    for (const p of photos) {
      const key = p.room_label ?? 'Other';
      if (!by.has(key)) by.set(key, []);
      by.get(key)!.push(p);
    }
    return Array.from(by.entries());
  }, [photos]);

  const [expanded, setExpanded] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {photos.length} photo{photos.length === 1 ? '' : 's'}
        </p>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-xs text-brand hover:underline"
        >
          {expanded ? 'Show less' : 'Show all'}
        </button>
      </div>
      <div className={expanded ? 'space-y-4' : 'overflow-hidden'}>
        {(expanded ? groups : groups.slice(0, 1)).map(([label, items]) => (
          <section key={label} className="space-y-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</h4>
            <div className="flex gap-2 overflow-x-auto">
              {items.map((p) => (
                <div
                  key={p.id}
                  className="aspect-[4/3] w-64 shrink-0 overflow-hidden rounded-lg bg-slate-100"
                >
                  <img src={p.url} alt={p.room_label ?? label} className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
