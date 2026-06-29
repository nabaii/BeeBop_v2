'use client';

/**
 * Read-only amenities on the public listing page, grouped by category (Power,
 * Water, Security, …) with a heading per group. Each present amenity shows its
 * own icon; items marked `confirmed: true` carry an inspector-confirmed badge.
 */

import { CircleCheck } from 'lucide-react';

import { iconForAmenity, iconForGroup, amenityLabel } from '@/lib/amenity-icons';
import type { PublicListingDetail } from '@/lib/search';

interface Props {
  amenities: PublicListingDetail['amenities'];
}

// Display order + friendly titles for the amenity groups. Mirrors the backend
// vocabulary order (AMENITY_GROUPS in listings/schemas.py). Unknown groups fall
// to the end with a title-cased name.
const GROUP_ORDER = [
  'features',
  'power',
  'water',
  'security',
  'internet',
  'parking',
  'kitchen',
  'laundry',
];

const GROUP_LABELS: Record<string, string> = {
  features: 'Highlights',
  power: 'Power',
  water: 'Water',
  security: 'Security',
  internet: 'Internet',
  parking: 'Parking',
  kitchen: 'Kitchen',
  laundry: 'Laundry',
};

type AmenityItem = { key: string; confirmed: boolean };

export function AmenitiesDisplay({ amenities }: Props) {
  const groups = Object.entries(amenities ?? {})
    .map(([group, items]) => {
      const present: AmenityItem[] = Object.entries(items ?? {})
        .filter(([, meta]) => meta?.present)
        .map(([key, meta]) => ({ key, confirmed: Boolean(meta?.confirmed) }));
      return { group, items: present };
    })
    .filter((g) => g.items.length > 0)
    .sort((a, b) => groupRank(a.group) - groupRank(b.group));

  if (groups.length === 0) {
    return <p className="text-sm text-slate-500">No amenities specified.</p>;
  }

  return (
    <div className="space-y-7">
      {groups.map(({ group, items }) => {
        const GroupIcon = iconForGroup(group);
        return (
          <div key={group}>
            <p className="flex items-center gap-2 text-caption font-semibold uppercase tracking-[0.16em] text-slate-500">
              <GroupIcon className="h-4 w-4 text-brand-600" aria-hidden />
              {groupLabel(group)}
            </p>
            <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              {items.map(({ key, confirmed }) => {
                const Icon = iconForAmenity(group, key);
                return (
                  <li key={`${group}:${key}`} className="flex items-center gap-3 text-sm">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 text-slate-800">{amenityLabel(key)}</span>
                    {confirmed && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-caption font-medium text-emerald-700"
                        title="Inspector confirmed"
                      >
                        <CircleCheck className="h-3 w-3" aria-hidden />
                        Confirmed
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function groupRank(group: string): number {
  const i = GROUP_ORDER.indexOf(group);
  return i === -1 ? GROUP_ORDER.length : i;
}

function groupLabel(group: string): string {
  return GROUP_LABELS[group] ?? amenityLabel(group);
}
