'use client';

/**
 * Optional title document upload. Files go directly to a private S3 bucket via a
 * short-lived presigned PUT — the backend never sees the file body. Admin
 * review (Sprint 4) uses short-expiry presigned GET URLs.
 */

import { useState } from 'react';

import {
  deleteDocument,
  getDocumentUploadSignature,
  registerDocument,
  uploadDocumentToS3,
  type DocumentView,
  type ListingView,
} from '@/lib/listings';

interface Props {
  listing: ListingView;
  onSaved: (next: Partial<ListingView>) => void;
}

const DOC_TYPES: { value: 'c_of_o' | 'deed_of_assignment' | 'governors_consent' | 'tenancy_agreement' | 'receipt' | 'other'; label: string }[] = [
  { value: 'c_of_o', label: 'Certificate of Occupancy' },
  { value: 'governors_consent', label: "Governor's Consent" },
  { value: 'deed_of_assignment', label: 'Deed of Assignment' },
  { value: 'tenancy_agreement', label: 'Existing Tenancy Agreement' },
  { value: 'receipt', label: 'Purchase Receipt' },
  { value: 'other', label: 'Other' },
];

export function DocumentUpload({ listing, onSaved }: Props) {
  const [docs, setDocs] = useState<DocumentView[]>(listing.documents);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState<(typeof DOC_TYPES)[number]['value']>('c_of_o');

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const next: DocumentView[] = [...docs];
      for (const file of Array.from(files)) {
        const contentType = mimeOf(file);
        if (!contentType) {
          setError(`Unsupported file type: ${file.name}. Use PDF, JPEG, or PNG.`);
          continue;
        }
        const sig = await getDocumentUploadSignature(listing.id, {
          filename: file.name,
          content_type: contentType,
          doc_type: docType,
          size_bytes: file.size,
        });
        await uploadDocumentToS3(sig, file);
        const registered = await registerDocument(listing.id, {
          s3_key: sig.key,
          filename: file.name,
          doc_type: docType,
          content_type: contentType,
          size_bytes: file.size,
        });
        next.push(registered);
      }
      setDocs(next);
      onSaved({ documents: next });
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function removeDoc(id: string) {
    await deleteDocument(listing.id, id);
    const next = docs.filter((d) => d.id !== id);
    setDocs(next);
    onSaved({ documents: next });
  }

  return (
    <section className="space-y-3">
      <header>
        <h2 className="text-base font-semibold text-slate-900">Title documents (optional)</h2>
        <p className="text-xs text-slate-500">
          Add documents now if you want them ready for later verification. Max 25MB per file.
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">
          <span className="mr-2 text-slate-700">Document type</span>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as typeof docType)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
          >
            {DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label
          className={
            'inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 ' +
            (uploading ? 'pointer-events-none opacity-60' : '')
          }
        >
          {uploading ? 'Uploading…' : 'Upload'}
          <input
            type="file"
            multiple
            hidden
            accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => void onFiles(e.target.files)}
          />
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {docs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
          No documents uploaded yet. You can still submit the listing.
        </p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium text-slate-900">{d.filename}</div>
                <div className="text-xs text-slate-500">
                  {humanLabelFor(d.doc_type)} · {d.content_type}
                  {d.size_bytes ? ` · ${Math.ceil(d.size_bytes / 1024)} KB` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void removeDoc(d.id)}
                className="text-xs text-slate-500 hover:text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function mimeOf(file: File): 'application/pdf' | 'image/jpeg' | 'image/png' | null {
  if (file.type === 'application/pdf') return 'application/pdf';
  if (file.type === 'image/jpeg' || file.type === 'image/jpg') return 'image/jpeg';
  if (file.type === 'image/png') return 'image/png';
  return null;
}

function humanLabelFor(kind: string): string {
  const match = DOC_TYPES.find((t) => t.value === kind);
  return match ? match.label : kind;
}
