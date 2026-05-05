'use client';

import { CalendarCheck, ChevronLeft } from 'lucide-react';
import Link from 'next/link';

export default function VisitsPage() {
  return (
    <div className="space-y-4 px-4 py-5">
      <Link
        href="/profile"
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Back to profile
      </Link>
      <header>
        <h1 className="text-xl font-semibold text-slate-900">Visits</h1>
        <p className="text-sm text-slate-500">Property tours you&apos;ve scheduled.</p>
      </header>
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <CalendarCheck className="h-6 w-6" aria-hidden />
        </div>
        <p className="mt-3 text-sm font-medium text-slate-800">No upcoming visits.</p>
        <p className="mt-1 text-xs text-slate-500">
          Once you book a viewing from a listing, it will appear here.
        </p>
      </div>
    </div>
  );
}
