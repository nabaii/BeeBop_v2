'use client';

/**
 * Location picker — drop / drag a pin on a Google Map to set a listing's
 * GPS coordinates.
 *
 * Mirrors the loader pattern in `components/browse/map-view.tsx`: we embed
 * Google Maps when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is present and fall back
 * to manual numeric entry when it isn't (common in dev) or when the script
 * fails to load — so the wizard still works end-to-end without a key.
 */

import { useEffect, useRef, useState } from 'react';
import { MapPin, LocateFixed, Loader2 } from 'lucide-react';

import { Input } from '@/components/ui/input';

interface Props {
  lat: number | null;
  lng: number | null;
  /** Fired whenever a complete coordinate pair is chosen. */
  onChange: (lat: number, lng: number) => void;
}

const ABUJA_CENTRE = { lat: 9.0765, lng: 7.4985 };
const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

// --- Minimal typings for the slice of the Maps JS API we use ---------------

interface GLatLng {
  lat(): number;
  lng(): number;
}
interface GMapMouseEvent {
  latLng: GLatLng | null;
}
interface GMarker {
  setPosition(position: { lat: number; lng: number }): void;
  addListener(event: 'dragend', handler: (e: GMapMouseEvent) => void): void;
}
interface GMap {
  panTo(position: { lat: number; lng: number }): void;
  addListener(event: 'click', handler: (e: GMapMouseEvent) => void): void;
}
interface GoogleMapsNS {
  maps?: {
    Map: new (
      element: HTMLElement,
      options: {
        center: { lat: number; lng: number };
        zoom: number;
        disableDefaultUI: boolean;
        zoomControl: boolean;
        clickableIcons: boolean;
      },
    ) => GMap;
    Marker: new (options: {
      map: GMap;
      position: { lat: number; lng: number };
      draggable: boolean;
    }) => GMarker;
  };
}

export function LocationPicker({ lat, lng, onChange }: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GMap | null>(null);
  const markerRef = useRef<GMarker | null>(null);
  // Keep the latest onChange without forcing the init effect to re-run.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [phase, setPhase] = useState<'loading' | 'ready' | 'fallback'>(
    MAPS_KEY ? 'loading' : 'fallback',
  );
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    lat != null && lng != null ? { lat, lng } : null,
  );
  const [locating, setLocating] = useState(false);

  // Initialise the map once, in the browser.
  useEffect(() => {
    if (!MAPS_KEY) return;
    let cancelled = false;

    import('@googlemaps/js-api-loader')
      .then(({ Loader }) => {
        if (cancelled) return undefined;
        const loader = new Loader({ apiKey: MAPS_KEY, version: 'weekly' });
        return loader.importLibrary('maps');
      })
      .then(() => {
        if (cancelled || !container.current) return;
        const maps = (window as Window & { google?: GoogleMapsNS }).google?.maps;
        if (!maps) {
          setPhase('fallback');
          return;
        }

        const start = lat != null && lng != null ? { lat, lng } : ABUJA_CENTRE;
        const map = new maps.Map(container.current, {
          center: start,
          zoom: lat != null && lng != null ? 16 : 11,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
        });
        mapRef.current = map;

        if (lat != null && lng != null) placeMarker(maps, map, { lat, lng });

        map.addListener('click', (e: GMapMouseEvent) => {
          if (!e.latLng) return;
          const next = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          placeMarker(maps, map, next);
          commit(next);
        });

        setPhase('ready');
      })
      .catch(() => {
        if (!cancelled) setPhase('fallback');
      });

    return () => {
      cancelled = true;
    };
    // Initial coordinates are read once on mount by design; later updates flow
    // through the marker, not a re-init.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function placeMarker(
    maps: NonNullable<GoogleMapsNS['maps']>,
    map: GMap,
    position: { lat: number; lng: number },
  ) {
    if (markerRef.current) {
      markerRef.current.setPosition(position);
      return;
    }
    const marker = new maps.Marker({ map, position, draggable: true });
    marker.addListener('dragend', (e: GMapMouseEvent) => {
      if (!e.latLng) return;
      commit({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    });
    markerRef.current = marker;
  }

  function commit(next: { lat: number; lng: number }) {
    setCoords(next);
    onChangeRef.current(round(next.lat), round(next.lng));
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const maps = (window as Window & { google?: GoogleMapsNS }).google?.maps;
        if (mapRef.current && maps) {
          mapRef.current.panTo(next);
          placeMarker(maps, mapRef.current, next);
        }
        commit(next);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  if (phase === 'fallback') {
    return <ManualFallback lat={lat} lng={lng} onChange={onChange} />;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {coords ? 'Drag the pin or click the map to adjust.' : 'Click on the map to drop a pin at the property.'}
        </p>
        <button
          type="button"
          onClick={useMyLocation}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
          Use my location
        </button>
      </div>

      <div className="relative">
        <div
          ref={container}
          className="h-72 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
        />
        {phase === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading map…
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-600">
        <MapPin className="h-3.5 w-3.5 text-brand" />
        {coords ? (
          <span className="font-medium">
            {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </span>
        ) : (
          <span className="text-slate-400">No pin placed yet</span>
        )}
      </div>
    </div>
  );
}

/** Manual numeric entry — used when no Maps key is configured. */
function ManualFallback({ lat, lng, onChange }: Props) {
  const [latStr, setLatStr] = useState(lat?.toString() ?? '');
  const [lngStr, setLngStr] = useState(lng?.toString() ?? '');

  function push(nextLat: string, nextLng: string) {
    const a = Number(nextLat);
    const b = Number(nextLng);
    if (nextLat && nextLng && Number.isFinite(a) && Number.isFinite(b)) {
      onChange(a, b);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Labelled label="GPS latitude">
        <Input
          inputMode="decimal"
          value={latStr}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.\-]/g, '');
            setLatStr(v);
            push(v, lngStr);
          }}
          placeholder="9.0765"
        />
      </Labelled>
      <Labelled label="GPS longitude">
        <Input
          inputMode="decimal"
          value={lngStr}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.\-]/g, '');
            setLngStr(v);
            push(latStr, v);
          }}
          placeholder="7.4985"
        />
      </Labelled>
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

/** Trim coordinate precision to ~1m — plenty for a property pin. */
function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
