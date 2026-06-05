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
import { Image as ImageIcon, Trash2, Star, Upload, Plus } from 'lucide-react';

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
      let sig: Awaited<ReturnType<typeof getPhotoUploadSignature>>;
      try {
        sig = await getPhotoUploadSignature(listing.id);
      } catch (err) {
        console.error('[PhotoUpload] signature request failed', err);
        setError('Could not get upload signature. The server may be unavailable.');
        return;
      }

      const next = [...photos];
      for (const file of Array.from(files)) {
        let result: { secure_url: string };
        try {
          result = await uploadPhotoToCloudinary(sig, file);
        } catch (err) {
          console.error('[PhotoUpload] Cloudinary upload failed', err);
          const detail = err instanceof Error ? err.message : 'unknown error';
          setError(`Photo upload to storage failed: ${detail}`);
          return;
        }

        try {
          const photo = await registerPhoto(listing.id, { url: result.secure_url });
          next.push(photo);
        } catch (err) {
          console.error('[PhotoUpload] photo registration failed', err);
          setError('Photo was uploaded but could not be saved. Please try again.');
          return;
        }
      }
      setPhotos(next);
      onSaved({ photos: next });
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
    <section className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-sm transition-all duration-300 hover:shadow-md hover:border-brand/40 space-y-6">
      <header className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-50 p-2.5 text-brand shrink-0">
            <ImageIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Photos</h2>
            <p className="text-xs text-slate-500">
              Drag to reorder. First photo is the cover.
            </p>
          </div>
        </div>
        <label
          className={
            'inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs py-2.5 px-4 shadow-sm transition-colors ' +
            (uploading ? 'pointer-events-none opacity-60' : '')
          }
        >
          {uploading ? (
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
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
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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
            className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white hover:border-brand/40 shadow-sm transition-all cursor-move"
          >
            <div className="relative aspect-square">
              <img src={p.url} alt={p.room_label ?? 'Listing photo'} className="h-full w-full object-cover" />
              {p.is_cover ? (
                <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                  <Star className="h-3 w-3 fill-current" /> Cover
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void setCover(p.id)}
                  className="absolute left-2.5 top-2.5 opacity-0 group-hover:opacity-100 flex items-center gap-1 rounded-full bg-slate-900/80 backdrop-blur-sm px-2 py-0.5 text-[10px] font-bold text-slate-200 hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                >
                  <Star className="h-3 w-3" /> Make Cover
                </button>
              )}
              <button
                type="button"
                onClick={() => void removePhoto(p.id)}
                className="absolute right-2.5 top-2.5 opacity-0 group-hover:opacity-100 flex h-7 w-7 items-center justify-center rounded-full bg-red-600/80 backdrop-blur-sm text-white hover:bg-red-600 transition-all shadow-sm"
                aria-label="Remove photo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="p-2.5 border-t border-slate-100">
              <input
                type="text"
                defaultValue={p.room_label ?? ''}
                onBlur={(e) => void setLabel(p.id, e.target.value.trim())}
                placeholder="Label (e.g. Living Room)"
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs outline-none focus:border-brand focus:ring-1 focus:ring-brand/20 transition-all"
              />
            </div>
          </li>
        ))}
      </ul>
      {photos.length === 0 && (
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 bg-slate-50/50 hover:bg-slate-50 rounded-2xl p-10 cursor-pointer text-center group transition-colors">
          <div className="rounded-xl bg-amber-50 p-3 text-brand group-hover:scale-110 transition-transform">
            <Upload className="h-6 w-6" />
          </div>
          <span className="mt-3 text-sm font-bold text-slate-800">Add property photos</span>
          <span className="mt-1 text-xs text-slate-500 max-w-xs">Drag files here or click to browse. Add at least one photo.</span>
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => void onFiles(e.target.files)}
          />
        </label>
      )}
    </section>
  );
}
