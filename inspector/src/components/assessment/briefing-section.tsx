'use client';

/**
 * Briefing pack — read-only reference showing the listing details the
 * inspector is visiting. Loaded from the backend briefing endpoint.
 */

import { useState } from 'react';
import type { BriefingPack } from '@/lib/inspector';

interface Props {
  briefing: BriefingPack;
}

export function BriefingSection({ briefing }: Props) {
  const [expanded, setExpanded] = useState(true);

  return (
    <section id="briefing-section" className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
            1
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Briefing Pack</h2>
            <p className="text-xs text-slate-500">Review listing details before inspection</p>
          </div>
        </div>
        <ChevronIcon open={expanded} />
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5">
          {/* Cover photo */}
          {briefing.cover_photo_url && (
            <div className="mt-4 overflow-hidden rounded-xl">
              <img
                src={briefing.cover_photo_url}
                alt={briefing.listing_title}
                className="h-48 w-full object-cover"
              />
            </div>
          )}

          {/* Title + category */}
          <div className="mt-4">
            <h3 className="text-lg font-semibold text-slate-900">{briefing.listing_title}</h3>
            {briefing.listing_subtitle && (
              <p className="mt-0.5 text-sm text-slate-600">{briefing.listing_subtitle}</p>
            )}
            <span className="mt-2 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-600">
              {briefing.listing_category.replace('_', ' ')}
            </span>
          </div>

          {/* Address */}
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Address</p>
            <p className="mt-1 text-sm text-slate-800">
              {briefing.address_line ?? 'Not specified'}
              {briefing.district && ` · ${briefing.district}`}
            </p>
            {(briefing.listing_gps_lat != null && briefing.listing_gps_lng != null) && (
              <p className="mt-1 text-xs text-slate-500">
                GPS: {briefing.listing_gps_lat.toFixed(6)}, {briefing.listing_gps_lng.toFixed(6)}
              </p>
            )}
          </div>

          {/* Description */}
          {briefing.description && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Description</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{briefing.description}</p>
            </div>
          )}

          {/* Listed amenities */}
          {Object.keys(briefing.listed_amenities).length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Listed Amenities</p>
              <div className="mt-2 space-y-2">
                {Object.entries(briefing.listed_amenities).map(([category, items]) => (
                  <div key={category}>
                    <p className="text-xs font-semibold text-slate-600 capitalize">{category.replace(/_/g, ' ')}</p>
                    {items && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {Object.keys(items).map((item) => (
                          <span
                            key={item}
                            className="rounded-md bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                          >
                            {item.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Listing photos */}
          {briefing.listing_photos.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Listing Photos ({briefing.listing_photos.length})
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {briefing.listing_photos.map((photo) => (
                  <div key={photo.id} className="overflow-hidden rounded-lg">
                    <img
                      src={photo.url}
                      alt={photo.room_label ?? 'Listing photo'}
                      className="h-20 w-full object-cover"
                    />
                    {photo.room_label && (
                      <p className="bg-slate-50 px-1 py-0.5 text-center text-[10px] text-slate-500 truncate">
                        {photo.room_label}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-5 w-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
