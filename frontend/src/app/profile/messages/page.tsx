'use client';

import { ChevronLeft, MessageSquare } from 'lucide-react';
import Link from 'next/link';

export default function MessagesPage() {
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
        <h1 className="text-xl font-semibold text-slate-900">Messages</h1>
        <p className="text-sm text-slate-500">Direct conversations with landlords.</p>
      </header>
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <MessageSquare className="h-6 w-6" aria-hidden />
        </div>
        <p className="mt-3 text-sm font-medium text-slate-800">Messaging is coming soon.</p>
        <p className="mt-1 text-xs text-slate-500">
          You&apos;ll be able to chat directly with landlords here once a verified listing is shortlisted.
        </p>
      </div>
    </div>
  );
}
