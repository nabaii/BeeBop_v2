/**
 * Presigned S3 upload with progress tracking.
 *
 * Flow:
 *   1. Request a presigned upload URL from the backend.
 *   2. PUT the file to S3 using XMLHttpRequest (for progress events).
 *   3. Register the uploaded evidence with the backend.
 *
 * If the device is offline the registration step is queued to IndexedDB
 * via the sync queue so it dispatches on reconnect.
 */

import { inspector } from './inspector';
import { enqueue } from './idb';
import { flush } from './sync';

export interface CapturedMedia {
  file: File;
  capturedAt: string;
  gpsLat: number | null;
  gpsLng: number | null;
  note?: string;
}

export interface UploadProgress {
  mediaIndex: number;
  phase: 'signing' | 'uploading' | 'registering' | 'done' | 'error';
  percent: number;
  error?: string;
}

/**
 * Upload a single captured file to S3 via presigned URL.
 *
 * @returns The S3 key on success.
 */
export async function uploadMedia(
  reportId: string,
  media: CapturedMedia,
  onProgress?: (phase: UploadProgress['phase'], percent: number) => void,
): Promise<string> {
  const emit = (phase: UploadProgress['phase'], percent: number) =>
    onProgress?.(phase, percent);

  // 1. Get presigned signature
  emit('signing', 0);
  const sig = await inspector.evidenceSignature(reportId, {
    filename: media.file.name,
    content_type: media.file.type as Parameters<typeof inspector.evidenceSignature>[1]['content_type'],
    captured_at: media.capturedAt,
    gps_lat: media.gpsLat ?? undefined,
    gps_lng: media.gpsLng ?? undefined,
    size_bytes: media.file.size,
  });

  // 2. PUT to S3 with progress
  emit('uploading', 0);
  await putToS3(sig.url, media.file, sig.headers, (pct) => emit('uploading', pct));

  // 3. Register evidence with backend (or queue offline)
  emit('registering', 90);
  const registration = {
    s3_key: sig.s3_key,
    filename: media.file.name,
    content_type: media.file.type,
    captured_at: media.capturedAt,
    gps_lat: media.gpsLat ?? undefined,
    gps_lng: media.gpsLng ?? undefined,
    note: media.note,
  };

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await enqueue({
      kind: 'register_evidence',
      reportId,
      payload: registration,
    });
    void flush();
  } else {
    try {
      await inspector.registerEvidence(reportId, registration);
    } catch {
      // Offline fallback — queue it
      await enqueue({
        kind: 'register_evidence',
        reportId,
        payload: registration,
      });
      void flush();
    }
  }

  emit('done', 100);
  return sig.s3_key;
}

function putToS3(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`S3 upload failed: ${xhr.status}`));
    });
    xhr.addEventListener('error', () => reject(new Error('S3 upload network error')));
    xhr.addEventListener('abort', () => reject(new Error('S3 upload aborted')));
    xhr.send(file);
  });
}
