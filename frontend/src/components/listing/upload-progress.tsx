'use client';

/**
 * Determinate progress for direct-to-Cloudinary uploads, shared by the photo
 * and video managers.
 *
 * A spinner is honest about "working" but not about "how long", and video
 * uploads on mobile data run long enough that the difference matters — an
 * indeterminate spinner at minute two reads as a hang, and the landlord
 * force-quits a transfer that was nearly done.
 */

export interface UploadProgress {
  /** 1-based position in this batch. */
  index: number;
  total: number;
  percent: number;
  filename: string;
}

export function UploadProgressBar({ progress }: { progress: UploadProgress }) {
  const multiple = progress.total > 1;
  return (
    <div
      className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate font-semibold text-slate-700">
          {multiple && `${progress.index} of ${progress.total} · `}
          {progress.filename}
        </span>
        <span className="shrink-0 font-bold tabular-nums text-slate-500">
          {progress.percent}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-200"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      {progress.percent === 100 && (
        // The bar hits 100% when the bytes have left the browser, but
        // Cloudinary still has to process them — say so rather than sitting at
        // a full bar that looks stuck.
        <p className="text-caption text-slate-400">Processing…</p>
      )}
    </div>
  );
}
