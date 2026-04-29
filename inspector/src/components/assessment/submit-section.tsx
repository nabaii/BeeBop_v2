'use client';

/**
 * Submit section — completion checklist showing which sections are done,
 * submit button gated on all-required, and confirmation screen.
 */

import Link from 'next/link';
import { useState } from 'react';

export interface CompletionStatus {
  checklist: boolean;
  infraScore: boolean;
  gpsPin: boolean;
  photos: boolean;
}

interface Props {
  status: CompletionStatus;
  inspectorNote: string;
  onNoteChange: (note: string) => void;
  onSubmit: () => Promise<string | null>;
  expanded: boolean;
  onToggle: () => void;
}

export function SubmitSection({ status, inspectorNote, onNoteChange, onSubmit, expanded, onToggle }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allComplete = status.checklist && status.infraScore && status.gpsPin;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const ref = await onSubmit();
      if (ref) setSubmittedRef(ref);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedRef) {
    return (
      <section id="submit-section" className="rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm overflow-hidden">
        <div className="px-5 py-8 text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-emerald-900">Report Submitted</h2>
          <p className="text-sm text-emerald-700">
            Your inspection report has been submitted and is now in the admin review queue.
          </p>
          <div className="rounded-lg bg-white/60 px-4 py-3">
            <p className="text-xs text-emerald-600">Submission Reference</p>
            <p className="mt-1 font-mono text-lg font-bold text-emerald-900">{submittedRef}</p>
          </div>
          <p className="text-xs text-emerald-600">
            Status: <strong>Pending Review</strong>
          </p>
          <Link
            href="/assignments"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-emerald-700"
          >
            ← Back to Assignments
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section id="submit-section" className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <div className="flex items-center gap-3">
          <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${allComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>6</span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Review &amp; Submit</h2>
            <p className="text-xs text-slate-500">
              {allComplete ? 'Ready to submit' : 'Complete all sections first'}
            </p>
          </div>
        </div>
        <ChevronIcon open={expanded} />
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-4">
          {/* Completion checklist */}
          <div className="space-y-2">
            <CheckRow label="Property Assessment Checklist" done={status.checklist} />
            <CheckRow label="Infrastructure Score" done={status.infraScore} />
            <CheckRow label="GPS Location Pin" done={status.gpsPin} />
            <CheckRow label="Photo/Video Evidence" done={status.photos} optional />
          </div>

          {/* Inspector note */}
          <div>
            <label className="text-sm font-semibold text-slate-800">Inspector Note (optional)</label>
            <p className="mt-0.5 text-xs text-slate-500">
              Any general observations or context for the admin reviewer.
            </p>
            <textarea
              value={inspectorNote}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="Additional notes for the reviewer…"
              rows={3}
              className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-sm placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          {!allComplete && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Complete all required sections above before submitting.
            </p>
          )}

          <button
            type="button"
            disabled={!allComplete || submitting}
            onClick={handleSubmit}
            className="w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-white transition-all hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Submitting…
              </span>
            ) : (
              'Submit Inspection Report'
            )}
          </button>
        </div>
      )}
    </section>
  );
}

function CheckRow({ label, done, optional }: { label: string; done: boolean; optional?: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-lg px-3 py-2 ${done ? 'bg-emerald-50' : 'bg-slate-50'}`}>
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${done ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        {done ? (
          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
        )}
      </span>
      <span className={`text-sm ${done ? 'text-emerald-800' : 'text-slate-600'}`}>{label}</span>
      {optional && <span className="text-[10px] text-slate-400">(optional)</span>}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`h-5 w-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
