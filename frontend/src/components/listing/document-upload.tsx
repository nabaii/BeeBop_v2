'use client';

/**
 * Optional title document upload. Files go directly to a private S3 bucket via a
 * short-lived presigned PUT — the backend never sees the file body. Admin
 * review (Sprint 4) uses short-expiry presigned GET URLs.
 */

import { useState } from 'react';
import { FileCheck, FileText, Upload, Trash2, Plus } from 'lucide-react';

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
    <section className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-sm transition-all duration-300 hover:shadow-md hover:border-brand/40 space-y-6">
      <header className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600 shrink-0">
            <FileCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Title documents (optional)</h2>
            <p className="text-xs text-slate-500">
              Add documents to verify ownership. Max 25MB per file.
            </p>
          </div>
        </div>
      </header>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-slate-50/50 rounded-xl p-4 border border-slate-100">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500 flex-1">
          <span>DOCUMENT TYPE</span>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as typeof docType)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-brand focus:ring-1 focus:ring-brand/20 cursor-pointer w-full sm:max-w-xs"
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
            'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs py-2.5 px-4 shadow-sm transition-colors self-end sm:self-auto ' +
            (uploading ? 'pointer-events-none opacity-60' : '')
          }
        >
          {uploading ? (
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          {uploading ? 'Uploading…' : 'Upload File'}
          <input
            type="file"
            multiple
            hidden
            accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => void onFiles(e.target.files)}
          />
        </label>
      </div>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 bg-slate-50/20 rounded-xl p-6 text-center text-slate-400">
          <Upload className="h-5 w-5 mb-2" />
          <span className="text-xs font-semibold">No documents uploaded yet.</span>
          <span className="text-caption">You can still submit and verify later.</span>
        </div>
      ) : (
        <ul className="space-y-3">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm hover:border-brand/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-slate-50 p-2 text-slate-400">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 truncate max-w-[200px] sm:max-w-md">{d.filename}</div>
                  <div className="text-caption text-slate-500 mt-0.5">
                    {humanLabelFor(d.doc_type)} · {d.content_type.split('/')[1]?.toUpperCase()}
                    {d.size_bytes ? ` · ${Math.ceil(d.size_bytes / 1024)} KB` : ''}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void removeDoc(d.id)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-100 hover:bg-red-50/50 transition-colors"
                aria-label="Remove document"
              >
                <Trash2 className="h-4 w-4" />
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
