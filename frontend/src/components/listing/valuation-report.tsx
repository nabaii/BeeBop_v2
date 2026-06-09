'use client';

/**
 * Valuation report panel. Section exists for every listing status that has
 * passed doc verification. Content gated behind login: unauthenticated
 * visitors see a locked panel with a sign-in prompt; signed-in users see
 * the report contents.
 *
 * Per v2.0 change: NO fair-market-value indicator and NO comparable
 * listings — only area scores, inspector note, report date.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { ValuationReport } from '@/lib/search';
import { useSession } from '@/stores/session';

interface Props {
  report: ValuationReport | null;
}

export function ValuationReportPanel({ report }: Props) {
  const user = useSession((s) => s.user);
  const pathname = usePathname();

  if (!user) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent to-white/90" />
        <div className="relative space-y-3 blur-sm">
          <div className="h-4 w-32 rounded bg-slate-200" />
          <div className="h-3 w-full rounded bg-slate-200" />
          <div className="h-3 w-3/4 rounded bg-slate-200" />
          <div className="h-3 w-5/6 rounded bg-slate-200" />
        </div>
        <div className="relative mt-4">
          <h3 className="text-sm font-semibold text-slate-900">Beebop Valuation Report</h3>
          <p className="mt-1 text-xs text-slate-600">
            Area infrastructure scores and an independent inspector note. Sign in to view.
          </p>
          <Link
            href={`/login?return_to=${encodeURIComponent(pathname ?? '/')}`}
            className="mt-3 inline-flex items-center rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white"
          >
            Sign in to view report
          </Link>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-slate-900">Beebop Valuation Report</h3>
        <p className="mt-2 text-sm text-slate-500">
          Not yet available for this listing. Reports are generated when a listing earns its physical-inspection badge.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <header className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Beebop Valuation Report</h3>
          {report.report_date && (
            <p className="mt-1 text-xs text-slate-500">Issued {report.report_date}</p>
          )}
          {report.area_scores_last_updated && (
            <p className="mt-1 text-xs text-slate-500">
              Area scores last updated {new Date(report.area_scores_last_updated).toLocaleDateString('en-NG')}
            </p>
          )}
        </div>
      </header>
      <section className="mt-4 space-y-4">
        {report.area_scores && <AreaScores scores={report.area_scores} />}
        {report.inspector_note && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Inspector note
            </div>
            {report.inspector_note}
          </div>
        )}
      </section>
    </div>
  );
}

function AreaScores({ scores }: { scores: Record<string, unknown> }) {
  const entries = Object.entries(scores ?? {}).filter(
    ([, v]) => typeof v === 'number',
  ) as [string, number][];
  if (entries.length === 0) return null;
  return (
    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-lg border border-slate-200 p-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {key.replaceAll('_', ' ')}
          </dt>
          <dd className="mt-1 text-sm font-semibold text-slate-900">{value} / 5</dd>
        </div>
      ))}
    </dl>
  );
}
