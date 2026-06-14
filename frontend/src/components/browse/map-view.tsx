'use client';

/**
 * Map view — Abuja pin map with verification-tier colour coding.
 *
 * Design decision: we embed Google Maps when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
 * is present. When it isn't (common in dev), we render a static fallback
 * grid listing the pins with their colour chips so the UX still demos
 * end-to-end. The upgrade is a drop-in swap.
 */

import { useEffect, useRef, useState } from 'react';

import type { PublicListingSummary, SearchResponse } from '@/lib/search';

interface Props {
  data: SearchResponse | null;
  onSelect: (listing: PublicListingSummary) => void;
}

const ABUJA_CENTRE = { lat: 9.0765, lng: 7.4985 };
const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

type PinTier = 'fully_verified' | 'doc_verified' | 'unverified';

interface GoogleMapsLike {
  maps?: {
    Map: new (
      element: HTMLElement,
      options: {
        center: { lat: number; lng: number };
        zoom: number;
        disableDefaultUI: boolean;
        zoomControl: boolean;
      },
    ) => object;
    Marker: new (options: {
      map: object;
      position: { lat: number; lng: number };
      title: string;
      icon: {
        path: unknown;
        fillColor: string;
        fillOpacity: number;
        strokeColor: string;
        strokeWeight: number;
        scale: number;
      };
    }) => {
      addListener: (event: 'click', handler: () => void) => void;
    };
    SymbolPath: {
      CIRCLE: unknown;
    };
  };
}

function pinTier(status: PublicListingSummary['status']): PinTier {
  if (
    status === 'fully_verified' ||
    status === 'let_agreed' ||
    status === 'sale_agreed'
  ) {
    return 'fully_verified';
  }
  if (status === 'doc_verified') return 'doc_verified';
  return 'unverified';
}

function pinColour(tier: PinTier): string {
  return tier === 'fully_verified' ? '#0d9488' : tier === 'doc_verified' ? '#2563eb' : '#94a3b8';
}

export function MapView({ data, onSelect }: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!MAPS_KEY) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    // Dynamic import so the loader only loads in the browser.
    import('@googlemaps/js-api-loader')
      .then(({ Loader }) => {
        if (cancelled) return;
        const loader = new Loader({ apiKey: MAPS_KEY, version: 'weekly' });
        return loader.importLibrary('maps');
      })
      .then(() => !cancelled && setReady(true))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // Render pins whenever the data changes and the map is ready.
  useEffect(() => {
    if (!ready || !container.current || !data) return;
    const googleRef = (window as Window & { google?: GoogleMapsLike }).google;
    const maps = googleRef?.maps;
    if (!maps) return;
    const map = new maps.Map(container.current, {
      center: ABUJA_CENTRE,
      zoom: 11,
      disableDefaultUI: true,
      zoomControl: true,
    });
    data.results.forEach((r) => {
      if (r.gps_lat == null || r.gps_lng == null) return;
      const tier = pinTier(r.status);
      const marker = new maps.Marker({
        map,
        position: { lat: r.gps_lat, lng: r.gps_lng },
        title: r.title,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          fillColor: pinColour(tier),
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 8,
        },
      });
      marker.addListener('click', () => onSelect(r));
    });
  }, [ready, data, onSelect]);

  if (failed) {
    return <FallbackList data={data} onSelect={onSelect} />;
  }

  return (
    <div className="space-y-2">
      <div
        ref={container}
        className="h-[min(62dvh,500px)] min-h-[320px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
      />
      <Legend />
    </div>
  );
}

function FallbackList({ data, onSelect }: Props) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Map unavailable</h3>
          <p className="text-xs text-slate-500">
            Set <code className="rounded bg-slate-100 px-1 py-0.5 text-caption">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to enable the pin map. Results below use the same filters.
          </p>
        </div>
        <Legend />
      </div>
      <ul className="divide-y divide-slate-100">
        {(data?.results ?? []).map((r) => {
          const tier = pinTier(r.status);
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r)}
                className="flex w-full items-center gap-3 py-2 text-left hover:bg-slate-50"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: pinColour(tier) }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900">{r.title}</div>
                  <div className="truncate text-xs text-slate-500">
                    {r.district ?? 'Abuja'} · {r.gps_lat?.toFixed(4)}, {r.gps_lng?.toFixed(4)}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
      <Pill color="#0d9488" label="AGIS Verified" />
      <Pill color="#2563eb" label="Doc Verified" />
      <Pill color="#94a3b8" label="Unverified" />
    </div>
  );
}

function Pill({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {label}
    </span>
  );
}
