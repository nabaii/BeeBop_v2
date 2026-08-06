'use client';

/**
 * Gallery editor for one gallery — the property's, or a single off-campus unit
 * type's. Both use the same pipeline (Cloudinary signed direct upload, then
 * register the returned URL); the only difference is the `unitTypeId` scope,
 * which the server uses to keep cover and ordering per gallery.
 *
 * Features: signed direct upload, drag-to-reorder (HTML5 drag events, no extra
 * deps), free-text labels per photo, cover selection, delete.
 *
 * `variant="section"` renders the standalone white card used on the listing
 * editor; `variant="inline"` renders a denser grid for nesting inside a unit
 * card in the inventory editor.
 */

import { useState, type ReactNode } from 'react';
import { Image as ImageIcon, Trash2, Star, Upload, Plus } from 'lucide-react';

import {
  deletePhoto,
  getPhotoUploadSignature,
  registerPhoto,
  reorderPhotos,
  updatePhoto,
  uploadPhotoToCloudinary,
  type PhotoView,
} from '@/lib/listings';
import { UploadProgressBar, type UploadProgress } from '@/components/listing/upload-progress';

interface Props {
  listingId: string;
  /** Null/omitted targets the property gallery. */
  unitTypeId?: string | null;
  photos: PhotoView[];
  onChange: (next: PhotoView[]) => void;
  variant?: 'section' | 'inline';
  title: string;
  description: string;
  /** Placeholder for the per-photo label field. */
  labelPlaceholder?: string;
  /** Copy shown when the gallery is empty. */
  emptyTitle: string;
  emptyHint: string;
}

export function PhotoManager({
  listingId,
  unitTypeId = null,
  photos,
  onChange,
  variant = 'section',
  title,
  description,
  labelPlaceholder = 'Label (e.g. Living Room)',
  emptyTitle,
  emptyHint,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const inline = variant === 'inline';

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      let sig: Awaited<ReturnType<typeof getPhotoUploadSignature>>;
      try {
        sig = await getPhotoUploadSignature(listingId, unitTypeId);
      } catch (err) {
        console.error('[PhotoManager] signature request failed', err);
        setError('Could not get upload signature. The server may be unavailable.');
        return;
      }

      const chosen = Array.from(files);
      // Photos land one at a time so a failure part-way through keeps the ones
      // already registered — `next` is committed on the way out.
      const next = [...photos];
      for (const [i, file] of chosen.entries()) {
        setProgress({ index: i + 1, total: chosen.length, percent: 0, filename: file.name });

        let result: Awaited<ReturnType<typeof uploadPhotoToCloudinary>>;
        try {
          result = await uploadPhotoToCloudinary(sig, file, (percent) =>
            setProgress({ index: i + 1, total: chosen.length, percent, filename: file.name }),
          );
        } catch (err) {
          console.error('[PhotoManager] Cloudinary upload failed', err);
          const detail = err instanceof Error ? err.message : 'unknown error';
          setError(`Photo upload to storage failed: ${detail}`);
          // Stop the batch, but keep whatever already registered — those rows
          // exist on the server, so dropping them here would hide real photos
          // until the landlord reloaded.
          break;
        }

        try {
          const photo = await registerPhoto(listingId, {
            url: result.secure_url,
            unit_type_id: unitTypeId,
            media_kind: 'image',
            provider_public_id: result.public_id ?? null,
            size_bytes: result.bytes ?? null,
          });
          next.push(photo);
        } catch (err) {
          console.error('[PhotoManager] photo registration failed', err);
          setError('Photo was uploaded but could not be saved. Please try again.');
          break;
        }
      }
      onChange(next);
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  async function setLabel(photoId: string, room_label: string) {
    const updated = await updatePhoto(listingId, photoId, { room_label });
    onChange(photos.map((p) => (p.id === photoId ? updated : p)));
  }

  async function setCover(photoId: string) {
    const updated = await updatePhoto(listingId, photoId, { is_cover: true });
    onChange(
      photos.map((p) => ({
        ...p,
        is_cover: p.id === photoId,
        ...(p.id === updated.id ? updated : {}),
      })),
    );
  }

  async function removePhoto(photoId: string) {
    await deletePhoto(listingId, photoId);
    onChange(photos.filter((p) => p.id !== photoId));
  }

  async function commitReorder(next: PhotoView[]) {
    onChange(next);
    // Reordering is scoped to this gallery, so the server only ever sees the
    // ids it already holds for it.
    const result = await reorderPhotos(
      listingId,
      next.map((p) => p.id),
      unitTypeId,
      'image',
    );
    onChange(result);
  }

  const body = (
    <>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      {progress && <UploadProgressBar progress={progress} />}
      {photos.length > 0 ? (
        <ul
          className={
            inline
              ? 'grid grid-cols-2 gap-3 sm:grid-cols-4'
              : 'grid grid-cols-2 gap-4 sm:grid-cols-3'
          }
        >
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
                <img
                  src={p.url}
                  alt={p.room_label ?? 'Listing photo'}
                  className="h-full w-full object-cover"
                />
                {p.is_cover ? (
                  <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-caption font-bold text-slate-900 shadow-sm">
                    <Star className="h-3 w-3 fill-current" /> Cover
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void setCover(p.id)}
                    className="absolute left-2.5 top-2.5 opacity-0 group-hover:opacity-100 flex items-center gap-1 rounded-full bg-slate-900/80 backdrop-blur-sm px-2 py-0.5 text-caption font-bold text-slate-200 hover:bg-slate-900 hover:text-white transition-all shadow-sm"
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
                  placeholder={labelPlaceholder}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs outline-none focus:border-brand focus:ring-1 focus:ring-brand/20 transition-all"
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <label
          className={
            'flex flex-col items-center justify-center border-2 border-dashed border-slate-300 bg-slate-50/50 hover:bg-slate-50 rounded-2xl cursor-pointer text-center group transition-colors ' +
            (inline ? 'p-6' : 'p-10')
          }
        >
          <div className="rounded-xl bg-amber-50 p-3 text-brand group-hover:scale-110 transition-transform">
            <Upload className={inline ? 'h-5 w-5' : 'h-6 w-6'} />
          </div>
          <span className="mt-3 text-sm font-bold text-slate-800">{emptyTitle}</span>
          <span className="mt-1 text-xs text-slate-500 max-w-xs">{emptyHint}</span>
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => void onFiles(e.target.files)}
          />
        </label>
      )}
    </>
  );

  const addButton = <AddPhotosButton uploading={uploading} inline={inline} onFiles={onFiles} />;

  if (inline) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">{title}</div>
            <p className="text-caption text-slate-400">{description}</p>
          </div>
          {photos.length > 0 && addButton}
        </div>
        {body}
      </div>
    );
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-sm transition-all duration-300 hover:shadow-md hover:border-brand/40 space-y-6">
      <header className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-50 p-2.5 text-brand shrink-0">
            <ImageIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500">{description}</p>
          </div>
        </div>
        {addButton}
      </header>
      {body}
    </section>
  );
}

function AddPhotosButton({
  uploading,
  inline,
  onFiles,
}: {
  uploading: boolean;
  inline: boolean;
  onFiles: (files: FileList | null) => Promise<void>;
}): ReactNode {
  return (
    <label
      className={
        'inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold shadow-sm transition-colors ' +
        (inline ? 'text-caption py-2 px-3' : 'text-xs py-2.5 px-4') +
        (uploading ? ' pointer-events-none opacity-60' : '')
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
  );
}
