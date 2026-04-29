'use client';

/**
 * Property assessment form — Sprint 6.
 *
 * The assessment form for a specific inspection report. The reportId comes
 * from the assignments page which links to /assessment/{report_id}.
 *
 * Contains:
 *   - Briefing pack (read-only listing details)
 *   - Structured checklist (identity, accuracy, amenities, structural)
 *   - Infrastructure scoring (1–5, area-level, independently submittable)
 *   - Photo/video capture with GPS + timestamp metadata
 *   - GPS property pin placement on map
 *   - Inspector notes + submit
 *
 * Every field change auto-saves to IndexedDB. Background sync dispatches
 * to the server on reconnect.
 */

import Link from 'next/link';
import { use } from 'react';

import { RouteGuard } from '@/components/route-guard';
import { AssessmentForm } from '@/components/assessment/assessment-form';

export default function AssessmentPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = use(params);

  return (
    <RouteGuard>
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <nav className="mb-4">
          <Link
            href="/assignments"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Assignments
          </Link>
        </nav>

        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Property Assessment</h1>
          <p className="mt-1 text-sm text-slate-500">
            Complete all sections below. Your progress is automatically saved.
          </p>
        </header>

        <AssessmentForm reportId={reportId} />
      </div>
    </RouteGuard>
  );
}
