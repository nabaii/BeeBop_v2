'use client';

/**
 * Photo & video capture with GPS + timestamp metadata.
 * Uses `<input type="file" capture>` for mobile camera access.
 * Uploads via presigned S3 URL with progress indicator.
 */

import { useCallback, useRef, useState } from 'react';
import { uploadMedia, type CapturedMedia, type UploadProgress } from '@/lib/upload';

export interface CapturedItem {
  id: string;
  file: File;
  preview: string;
  capturedAt: string;
  gpsLat: number | null;
  gpsLng: number | null;
  uploadState: UploadProgress['phase'];
  uploadPercent: number;
  s3Key: string | null;
  error: string | null;
}

interface Props {
  reportId: string;
  items: CapturedItem[];
  onItemsChange: (items: CapturedItem[]) => void;
  expanded: boolean;
  onToggle: () => void;
}

export function PhotoCaptureSection({ reportId, items, onItemsChange, expanded, onToggle }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const captureGps = (): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setGpsError('Geolocation not supported');
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsError(null);
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => {
          setGpsError(`GPS: ${err.message}`);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
  };

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const gps = await captureGps();
      const now = new Date().toISOString();

      const newItems: CapturedItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const id = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`;
        const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
        newItems.push({
          id,
          file,
          preview,
          capturedAt: now,
          gpsLat: gps?.lat ?? null,
          gpsLng: gps?.lng ?? null,
          uploadState: 'signing',
          uploadPercent: 0,
          s3Key: null,
          error: null,
        });
      }

      const updated = [...items, ...newItems];
      onItemsChange(updated);

      // Start uploads in background
      for (const item of newItems) {
        uploadSingle(item, updated);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, onItemsChange, reportId],
  );

  const uploadSingle = async (item: CapturedItem, currentItems: CapturedItem[]) => {
    const media: CapturedMedia = {
      file: item.file,
      capturedAt: item.capturedAt,
      gpsLat: item.gpsLat,
      gpsLng: item.gpsLng,
    };

    const updateItem = (patch: Partial<CapturedItem>) => {
      const idx = currentItems.findIndex((c) => c.id === item.id);
      if (idx === -1) return;
      currentItems[idx] = { ...currentItems[idx], ...patch };
      onItemsChange([...currentItems]);
    };

    try {
      const s3Key = await uploadMedia(reportId, media, (phase, percent) => {
        updateItem({ uploadState: phase, uploadPercent: percent });
      });
      updateItem({ uploadState: 'done', uploadPercent: 100, s3Key });
    } catch (err) {
      updateItem({
        uploadState: 'error',
        error: err instanceof Error ? err.message : 'Upload failed',
      });
    }
  };

  const removeItem = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      onItemsChange(items.filter((i) => i.id !== id));
    },
    [items, onItemsChange],
  );

  const doneCount = items.filter((i) => i.uploadState === 'done').length;

  return (
    <section id="photo-capture-section" className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <div className="flex items-center gap-3">
          <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${items.length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>4</span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Photo &amp; Video Evidence</h2>
            <p className="text-xs text-slate-500">
              {items.length === 0 ? 'Capture photos with GPS & timestamp' : `${doneCount}/${items.length} uploaded`}
            </p>
          </div>
        </div>
        <ChevronIcon open={expanded} />
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-4">
          <p className="text-xs text-slate-500">
            Each photo/video is automatically stamped with your GPS location and the current timestamp.
            Uploads continue in the background even if you navigate away.
          </p>

          {gpsError && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{gpsError}</p>
          )}

          {/* Capture buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 py-4 text-sm font-medium text-slate-600 transition-all hover:border-brand hover:text-brand active:bg-blue-50"
            >
              <CameraIcon />
              Take Photo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/mp4,video/quicktime"
              capture="environment"
              multiple
              onChange={(e) => handleFiles(e.target.files)}
              className="sr-only"
            />
          </div>

          {/* Gallery */}
          {items.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {items.map((item) => (
                <div key={item.id} className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {item.preview ? (
                    <img src={item.preview} alt="Evidence" className="h-32 w-full object-cover" />
                  ) : (
                    <div className="flex h-32 items-center justify-center bg-slate-100">
                      <span className="text-xs text-slate-400">Video</span>
                    </div>
                  )}

                  {/* Upload progress overlay */}
                  {item.uploadState !== 'done' && item.uploadState !== 'error' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white">
                      <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      <span className="mt-2 text-xs font-medium">
                        {item.uploadState === 'signing' && 'Preparing…'}
                        {item.uploadState === 'uploading' && `${item.uploadPercent}%`}
                        {item.uploadState === 'registering' && 'Registering…'}
                      </span>
                    </div>
                  )}

                  {/* Error overlay */}
                  {item.uploadState === 'error' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-900/50 text-white">
                      <span className="text-xs font-medium">Failed</span>
                    </div>
                  )}

                  {/* Done badge */}
                  {item.uploadState === 'done' && (
                    <div className="absolute right-1 top-1 rounded-full bg-emerald-500 p-1">
                      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}

                  {/* Metadata bar */}
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <div className="text-[10px] text-slate-500 space-y-0.5">
                      {item.gpsLat != null && (
                        <p>📍 {item.gpsLat.toFixed(4)}, {item.gpsLng?.toFixed(4)}</p>
                      )}
                      <p>🕐 {new Date(item.capturedAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Remove"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CameraIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`h-5 w-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
