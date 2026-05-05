'use client';

/**
 * Landlord NIN verification card. Shown on /dashboard/landlord while the
 * landlord is unverified; hides entirely once nin_verified=true. Three states:
 *   1. No upload yet    -> upload picker
 *   2. Awaiting review  -> banner with the uploaded image and timestamp
 *   3. Rejected         -> banner with the rejection note + re-upload picker
 */

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import {
  getMe,
  getNinDocumentUploadSignature,
  registerNinDocument,
  uploadFileToCloudinary,
  type UserView,
} from '@/lib/users';

export function NinVerifyCard() {
  const [me, setMe] = useState<UserView | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((u) => !cancelled && setMe(u))
      .catch(() => !cancelled && setError('Could not load your account.'));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!me) return null;
  // Agencies verify via CAC, not NIN. Hide entirely for non-individuals.
  if (me.role !== 'landlord' || me.account_type !== 'individual') return null;
  if (me.nin_verified) return null;

  async function onFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const sig = await getNinDocumentUploadSignature();
      const { secure_url } = await uploadFileToCloudinary(sig, file);
      await registerNinDocument(secure_url);
      const next = await getMe();
      setMe(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  const awaitingReview = Boolean(me.nin_document_url) && !me.nin_review_note;
  const wasRejected = !me.nin_document_url && Boolean(me.nin_review_note);

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-amber-900">Verify your identity</h2>
          <p className="mt-1 text-sm text-amber-800">
            Upload a clear photo of your government-issued ID (NIN slip, NIN card, or
            driver&apos;s licence). An admin will review it before your listings go live.
          </p>
        </div>
        {!awaitingReview && (
          <label
            className={
              'inline-flex cursor-pointer items-center rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 ' +
              (uploading ? 'pointer-events-none opacity-60' : '')
            }
          >
            {uploading ? 'Uploading…' : wasRejected ? 'Re-upload ID' : 'Upload ID'}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
      </div>

      {awaitingReview && me.nin_document_url && (
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-amber-200 bg-white p-3">
          <img
            src={me.nin_document_url}
            alt="Uploaded ID"
            className="h-20 w-32 rounded object-cover"
          />
          <div className="text-sm">
            <p className="font-medium text-slate-900">Awaiting admin review</p>
            {me.nin_document_uploaded_at && (
              <p className="text-xs text-slate-500">
                Uploaded {new Date(me.nin_document_uploaded_at).toLocaleString('en-NG')}
              </p>
            )}
          </div>
        </div>
      )}

      {wasRejected && me.nin_review_note && (
        <div className="mt-4 rounded-lg border border-red-200 bg-white p-3 text-sm">
          <p className="font-medium text-red-700">Previous submission was rejected</p>
          <p className="mt-1 text-slate-700">{me.nin_review_note}</p>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
