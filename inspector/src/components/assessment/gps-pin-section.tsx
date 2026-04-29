'use client';

/**
 * GPS pin section — Google Maps with a draggable marker for property
 * location. Auto-suggests device GPS on mount. Manual drag to adjust.
 * Coordinates stored to 6 decimal places.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

interface Props {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  expanded: boolean;
  onToggle: () => void;
  complete: boolean;
}

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? '';
const DEFAULT_CENTER = { lat: 9.0579, lng: 7.4951 }; // Abuja

export function GpsPinSection({ lat, lng, onChange, expanded, onToggle, complete }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [gpsStatus, setGpsStatus] = useState<string>('');

  const setPin = useCallback(
    (position: { lat: number; lng: number }) => {
      onChange(
        parseFloat(position.lat.toFixed(6)),
        parseFloat(position.lng.toFixed(6)),
      );
      if (markerRef.current) {
        markerRef.current.position = position;
      }
      if (mapInstance.current) {
        mapInstance.current.panTo(position);
      }
    },
    [onChange],
  );

  // Initialise map
  useEffect(() => {
    if (!expanded || !mapRef.current) return;
    let cancelled = false;

    const init = async () => {
      const loader = new Loader({
        apiKey: MAPS_API_KEY,
        version: 'weekly',
        libraries: ['marker'],
      });

      const { Map } = await loader.importLibrary('maps');
      const { AdvancedMarkerElement } = await loader.importLibrary('marker');
      if (cancelled || !mapRef.current) return;

      const center = lat != null && lng != null ? { lat, lng } : DEFAULT_CENTER;

      const map = new Map(mapRef.current, {
        center,
        zoom: 16,
        mapId: 'beebop-inspector',
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
      });
      mapInstance.current = map;

      const marker = new AdvancedMarkerElement({
        map,
        position: center,
        gmpDraggable: true,
        title: 'Property location',
      });
      markerRef.current = marker;

      marker.addListener('dragend', () => {
        const pos = marker.position;
        if (pos) {
          const p = typeof pos.lat === 'function'
            ? { lat: (pos as google.maps.LatLng).lat(), lng: (pos as google.maps.LatLng).lng() }
            : pos as { lat: number; lng: number };
          onChange(parseFloat(p.lat.toFixed(6)), parseFloat(p.lng.toFixed(6)));
        }
      });

      setLoading(false);

      // Auto-suggest device GPS
      if (lat == null || lng == null) {
        requestDeviceGps();
      }
    };

    init().catch(() => setLoading(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const requestDeviceGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('Geolocation not available');
      return;
    }
    setGpsStatus('Requesting GPS…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsStatus('');
        setPin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (mapInstance.current) mapInstance.current.setZoom(18);
      },
      (err) => setGpsStatus(`GPS error: ${err.message}`),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <section id="gps-pin-section" className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <div className="flex items-center gap-3">
          <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${complete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>5</span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">GPS Location</h2>
            <p className="text-xs text-slate-500">
              {complete
                ? `${lat?.toFixed(6)}, ${lng?.toFixed(6)}`
                : 'Mark property location on the map'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {complete && <CompleteBadge />}
          <ChevronIcon open={expanded} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-3">
          <p className="text-xs text-slate-500">
            Drag the pin to adjust the property location. Coordinates are stored to 6 decimal places.
          </p>

          {/* Map container */}
          <div className="relative overflow-hidden rounded-xl border border-slate-200" style={{ height: 280 }}>
            <div ref={mapRef} className="h-full w-full" />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
              </div>
            )}
          </div>

          {gpsStatus && (
            <p className="text-xs text-amber-600">{gpsStatus}</p>
          )}

          {/* Coordinates display */}
          {lat != null && lng != null && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-center">
              <p className="text-xs text-slate-500">Coordinates</p>
              <p className="font-mono text-sm font-semibold text-slate-800">
                {lat.toFixed(6)}, {lng.toFixed(6)}
              </p>
            </div>
          )}

          {/* Re-detect button */}
          <button
            type="button"
            onClick={requestDeviceGps}
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50"
          >
            📡 Re-detect Device GPS
          </button>
        </div>
      )}
    </section>
  );
}

function CompleteBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
      Done
    </span>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`h-5 w-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
