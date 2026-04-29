'use client';

/**
 * Multi-photo upload for a listing. Features:
 *   • Cloudinary signed direct upload (browser -> Cloudinary, never through backend)
 *   • Drag-to-reorder using HTML5 drag events (no extra deps; works everywhere
 *     desktop + modern mobile browsers that support the Drag API). More
 *     sophisticated touch support can move to @dnd-kit later.
 *   • Room labels per photo (free text, e.g. "Living Room")
 *   • Cover selection — first upload auto-sets cover; explicit override here
 *   • Delete
 */

import Image from 'next/image';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  deletePhoto,
  getPhotoUploadSignature,
  registerPhoto,
  reorderPhotos,
  updatePhoto,
  uploadPhotoToCloudinary,
  type ListingView,
  type PhotoView,
} from '@/lib/listings';

interface Props {
  listing: ListingView;
  onSaved: (next: Partial<ListingView>) => void;
}

export function PhotoUpload({ listing, onSaved }: Props) {
  const [photos, setPhotos] = useState<PhotoView[]>(listing.photos);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const sig = await getPhotoUploadSignature(listing.id);
      const next = [...photos];
      for (const file of Array.from(files)) {
        const result = await uploadPhotoToCloudinary(sig, file);
        const photo = await registerPhoto(listing.id, { url: result.secure_url });
        next.push(photo);
      }
      setPhotos(next);
      onSaved({ photos: next });
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function setLabel(photoId: string, room_label: string) {
    const updated = await updatePhoto(listing.id, photoId, { room_label });
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? updated : p)));
  }

  async function setCover(photoId: string) {
    const updated = await updatePhoto(listing.id, photoId, { is_cover: true });
    setPhotos((prev) =>
      prev.map((p) => ({ ...p, is_cover: p.id === photoId, ...(p.id === updated.id ? updated : {}) })),
    );
  }

  async function removePhoto(photoId: string) {
    await deletePhoto(listing.id, photoId);
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
  }

  async function commitReorder(next: PhotoView[]) {
    setPhotos(next);
    const result = await reorderPhotos(listing.id, next.map((p) => p.id));
    setPhotos(result);
    onSaved({ photos: result });
  }

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Photos</h2>
          <p className="text-xs text-slate-500">
            Drag to reorder. First photo is the cover by default.
          </p>
        </div>
        <label
          className={
            'inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 ' +
            (uploading ? 'pointer-events-none opacity-60' : '')
          }
        >
          {uploading ? 'Uploading…' : 'Add photos'}
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => void onFiles(e.target.files)}
          />
        </label>
      </header>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p, index) => (
          <li
            key={p.id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex === null || dragIndex === index) return;
              const next = [...photos];
              const [moved] = next.splice(dragIndex, 1);
              next.splice(index, 0, moved);
              setDragIndex(null);
              void commitReorder(next);
            }}
            className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            <div className="relative aspect-square">
              {/* Using a native img tag — source URLs are user-provided and
                  can point to Cloudinary or the dev-stub blob URL. Next/image
                  remotePatterns is configured for Cloudinary only. */}
              <img src={p.url} alt={p.room_label ?? 'Listing photo'} className="h-full w-full object-cover" />
              {p.is_cover && (
                <span className="absolute left-2 top-2 rounded bg-brand px-2 py-0.5 text-xs font-medium text-white">
                  Cover
                </span>
              )}
            </div>
            <div className="space-y-2 p-2">
              <input
                type="text"
                defaultValue={p.room_label ?? ''}
                onBlur={(e) => void setLabel(p.id, e.target.value.trim())}
                placeholder="Room label (e.g. Living Room)"
                className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
              />
              <div className="flex items-center justify-between text-xs text-slate-500">
                {!p.is_cover && (
                  <button
                    type="button"
                    onClick={() => void setCover(p.id)}
                    className="hover:text-brand"
                  >
                    Make cover
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void removePhoto(p.id)}
                  className="hover:text-red-600"
                >
                  Remove
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {photos.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
          No photos yet. Add at least one before submitting.
        </p>
      )}
    </section>
  );
}
