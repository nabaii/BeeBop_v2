'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

import { NotificationsInbox } from '@/components/dashboard/notifications-inbox';

export default function NotificationsPage() {
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
        <h1 className="text-xl font-semibold text-slate-900">Notifications</h1>
        <p className="text-sm text-slate-500">Activity from BeeBop and landlords you&apos;re engaged with.</p>
      </header>
      <NotificationsInbox />
    </div>
  );
}
