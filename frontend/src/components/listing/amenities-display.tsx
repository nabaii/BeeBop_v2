'use client';

/**
 * Read-only amenities list on the public listing page. Items marked
 * `confirmed: true` carry a small inspector-confirmed indicator.
 */

import {
  Car,
  CircleCheck,
  Droplets,
  ShieldCheck,
  Utensils,
  WashingMachine,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react';

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
    <ul className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
      {rows.map(({ group, key, confirmed }) => {
        const Icon = iconForGroup(group);
        return (
          <li key={`${group}:${key}`} className="flex items-center gap-3 text-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 capitalize text-slate-800">
              {key.replaceAll('_', ' ')}
            </span>
            {confirmed && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
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
  );
}

function iconForGroup(group: string): LucideIcon {
  switch (group) {
    case 'power':
      return Zap;
    case 'water':
      return Droplets;
    case 'security':
      return ShieldCheck;
    case 'internet':
      return Wifi;
    case 'parking':
      return Car;
    case 'kitchen':
      return Utensils;
    case 'laundry':
      return WashingMachine;
    default:
      return CircleCheck;
  }
}
