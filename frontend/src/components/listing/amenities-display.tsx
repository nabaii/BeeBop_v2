'use client';

/**
 * Read-only amenities list on the public listing page. Items marked
 * `confirmed: true` (set on physical-badge issuance in Sprint 7) carry a
 * small "Confirmed" indicator.
 */

import type { PublicListingDetail } from '@/lib/search';

interface Props {
  amenities: PublicListingDetail['amenities'];
}

export function AmenitiesDisplay({ amenities }: Props) {
  const rows = Object.entries(amenities ?? {}).flatMap(([group, items]) => {
    if (!items) return [] as { group: string; key: string; confirmed: boolean }[];
    return Object.entries(items)
      .filter(([, meta]) => meta?.present)
      .map(([key, meta]) => ({ group, key, confirmed: Boolean(meta?.confirmed) }));
  });

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No amenities specified.</p>;
  }

  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {rows.map(({ group, key, confirmed }) => (
        <li
          key={`${group}:${key}`}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <span className="capitalize text-slate-800">{key.replaceAll('_', ' ')}</span>
          {confirmed && (
            <span
              className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
              title="Inspector confirmed"
            >
              ✓ Confirmed
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
