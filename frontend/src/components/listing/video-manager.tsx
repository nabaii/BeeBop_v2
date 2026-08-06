'use client';

/**
 * Video-tour editor for one gallery — the property's, or a single off-campus
 * unit type's. Sits beside PhotoManager rather than inside it: videos are a
 * separate group with their own ordering, no cover, and upload rules photos
 * don't have (duration, size, format).
 *
 * The caps are checked here before the upload starts so a landlord on mobile
 * data learns a clip is too long without paying to send it. The server checks
 * again at register time — that is the check that actually enforces them.
 */

import { useState, type ReactNode } from 'react';
import { Clapperboard, Play, Plus, Trash2, Upload } from 'lucide-react';

import {
  ACCEPTED_VIDEO_TYPES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_DURATION_SECONDS,
  deletePhoto,
  formatDuration,
  getPhotoUploadSignature,
  readVideoDuration,
  registerPhoto,
  updatePhoto,
  uploadVideoToCloudinary,
  videoPosterUrl,
  type PhotoView,
} from '@/lib/listings';
import { UploadProgressBar, type UploadProgress } from '@/components/listing/upload-progress';
import { cn } from '@/lib/cn';

interface Props {
  listingId: string;
  /** Null/omitted targets the property gallery. */
  unitTypeId?: string | null;
  videos: PhotoView[];
  onChange: (next: PhotoView[]) => void;
  /** Per-gallery cap — 3 for a property, 1 for a unit type. */
  maxVideos: number;
  variant?: 'section' | 'inline';
  title: string;
  description: string;
  labelPlaceholder?: string;
  emptyTitle: string;
  emptyHint: string;
}

export function VideoManager({
  listingId,
  unitTypeId = null,
  videos,
  onChange,
  maxVideos,
  variant = 'section',
  title,
  description,
  labelPlaceholder = 'Label (e.g. Full walkthrough)',
  emptyTitle,
  emptyHint,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inline = variant === 'inline';
  const atCapacity = videos.length >= maxVideos;

  async function onFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    setError(null);

    if (atCapacity) {
      setError(
        maxVideos === 1
          ? 'You can add one video here. Remove the current one to replace it.'
          : `You can add up to ${maxVideos} videos here.`,
      );
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      const mb = Math.round(file.size / (1024 * 1024));
      setError(
        `That video is ${mb}MB. Videos must be ${MAX_VIDEO_BYTES / (1024 * 1024)}MB or smaller — ` +
          'try a shorter clip, or record at a lower quality.',
      );
      return;
    }

    setUploading(true);
    try {
      // Null means the browser couldn't read the metadata; let it through and
      // let the server decide rather than blocking on a check that isn't
      // working.
      const measured = await readVideoDuration(file);
      if (measured !== null && measured > MAX_VIDEO_DURATION_SECONDS) {
        setError(
          `That video is ${formatDuration(measured)} long. Videos must be ` +
            `${MAX_VIDEO_DURATION_SECONDS} seconds or shorter.`,
        );
        return;
      }

      let sig: Awaited<ReturnType<typeof getPhotoUploadSignature>>;
      try {
        sig = await getPhotoUploadSignature(listingId, unitTypeId);
      } catch (err) {
        console.error('[VideoManager] signature request failed', err);
        setError('Could not get upload signature. The server may be unavailable.');
        return;
      }

      setProgress({ index: 1, total: 1, percent: 0, filename: file.name });
      let result: Awaited<ReturnType<typeof uploadVideoToCloudinary>>;
      try {
        result = await uploadVideoToCloudinary(sig, file, (percent) =>
          setProgress({ index: 1, total: 1, percent, filename: file.name }),
        );
      } catch (err) {
        console.error('[VideoManager] Cloudinary upload failed', err);
        const detail = err instanceof Error ? err.message : 'unknown error';
        setError(`Video upload to storage failed: ${detail}`);
        return;
      }

      try {
        // Fall back to what we measured locally when Cloudinary doesn't report
        // a field — the dev stub never does, and every one of these values is
        // client-supplied either way. The server's job here is enforcing the
        // caps, not verifying provenance.
        const duration = result.duration ?? measured;
        const video = await registerPhoto(listingId, {
          url: result.secure_url,
          unit_type_id: unitTypeId,
          media_kind: 'video',
          provider_public_id: result.public_id ?? null,
          poster_url: videoPosterUrl(result.secure_url),
          duration_seconds: duration === null ? null : Math.round(duration),
          size_bytes: result.bytes ?? file.size,
          video_format: result.format ?? file.name.split('.').pop() ?? null,
        });
        onChange([...videos, video]);
      } catch (err) {
        console.error('[VideoManager] video registration failed', err);
        // The server's message carries the specific cap that was hit, which is
        // more useful than anything generic we'd write here.
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'Video was uploaded but could not be saved. Please try again.',
        );
      }
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  async function setLabel(videoId: string, room_label: string) {
    const updated = await updatePhoto(listingId, videoId, { room_label });
    onChange(videos.map((v) => (v.id === videoId ? updated : v)));
  }

  async function removeVideo(videoId: string) {
    await deletePhoto(listingId, videoId);
    onChange(videos.filter((v) => v.id !== videoId));
  }

  const addButton = (
    <AddVideoButton uploading={uploading} inline={inline} onFile={onFile} />
  );

  const body = (
    <>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      {progress && <UploadProgressBar progress={progress} />}
      {videos.length > 0 ? (
        <ul className={inline ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-2 gap-4 sm:grid-cols-3'}>
          {videos.map((v) => (
            <li
              key={v.id}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:border-brand/40"
            >
              <div className="relative aspect-video bg-slate-900">
                <VideoThumbnail video={v} />
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
                    <Play className="h-4 w-4 fill-white text-white" aria-hidden />
                  </span>
                </span>
                {v.duration_seconds != null && (
                  <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-caption font-bold tabular-nums text-white">
                    {formatDuration(v.duration_seconds)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void removeVideo(v.id)}
                  className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-red-600/80 text-white opacity-0 shadow-sm backdrop-blur-sm transition-all hover:bg-red-600 group-hover:opacity-100"
                  aria-label="Remove video"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="border-t border-slate-100 p-2.5">
                <input
                  type="text"
                  defaultValue={v.room_label ?? ''}
                  onBlur={(e) => void setLabel(v.id, e.target.value.trim())}
                  placeholder={labelPlaceholder}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs outline-none transition-all focus:border-brand focus:ring-1 focus:ring-brand/20"
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <label
          className={cn(
            'group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 text-center transition-colors hover:bg-slate-50',
            inline ? 'p-6' : 'p-10',
            uploading && 'pointer-events-none opacity-60',
          )}
        >
          <div className="rounded-xl bg-amber-50 p-3 text-brand transition-transform group-hover:scale-110">
            <Upload className={inline ? 'h-5 w-5' : 'h-6 w-6'} />
          </div>
          <span className="mt-3 text-sm font-bold text-slate-800">{emptyTitle}</span>
          <span className="mt-1 max-w-xs text-xs text-slate-500">{emptyHint}</span>
          <span className="mt-2 text-caption text-slate-400">
            MP4 or MOV · up to {MAX_VIDEO_DURATION_SECONDS} seconds ·{' '}
            {MAX_VIDEO_BYTES / (1024 * 1024)}MB
          </span>
          <input
            type="file"
            accept={ACCEPTED_VIDEO_TYPES}
            hidden
            onChange={(e) => void onFile(e.target.files)}
          />
        </label>
      )}
    </>
  );

  if (inline) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-700">{title}</div>
            <p className="text-caption text-slate-400">{description}</p>
          </div>
          {videos.length > 0 && !atCapacity && addButton}
        </div>
        {body}
      </div>
    );
  }

  return (
    <section className="space-y-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition-all duration-300 hover:border-brand/40 hover:shadow-md sm:p-8">
      <header className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="shrink-0 rounded-xl bg-amber-50 p-2.5 text-brand">
            <Clapperboard className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500">{description}</p>
          </div>
        </div>
        {!atCapacity && addButton}
      </header>
      {body}
    </section>
  );
}

/**
 * Poster frame where we have one, the video itself where we don't. The dev
 * stub hands back a blob: URL with no derivable poster, and `preload="metadata"`
 * is enough for the browser to paint a first frame without fetching the clip.
 */
function VideoThumbnail({ video }: { video: PhotoView }) {
  if (video.poster_url) {
    return (
      <img
        src={video.poster_url}
        alt={video.room_label ?? 'Video tour'}
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <video
      src={video.url}
      preload="metadata"
      muted
      playsInline
      className="h-full w-full object-cover"
    />
  );
}

function AddVideoButton({
  uploading,
  inline,
  onFile,
}: {
  uploading: boolean;
  inline: boolean;
  onFile: (files: FileList | null) => Promise<void>;
}): ReactNode {
  return (
    <label
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-slate-900 font-semibold text-white shadow-sm transition-colors hover:bg-slate-800',
        inline ? 'px-3 py-2 text-caption' : 'px-4 py-2.5 text-xs',
        uploading && 'pointer-events-none opacity-60',
      )}
    >
      {uploading ? (
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
      ) : (
        <Plus className="h-3.5 w-3.5" />
      )}
      {uploading ? 'Uploading…' : 'Add video'}
      <input
        type="file"
        accept={ACCEPTED_VIDEO_TYPES}
        hidden
        onChange={(e) => void onFile(e.target.files)}
      />
    </label>
  );
}
