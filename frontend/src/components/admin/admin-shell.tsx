'use client';

/**
 * Admin portal shell — left rail with section links. Used by every page
 * under /internal/admin. Role-guarding lives one level up in the layout.
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { logout } from '@/lib/auth';
import { useSession } from '@/stores/session';

const SECTIONS = [
  { href: '/internal/admin', label: 'Doc review queue' },
  { href: '/internal/admin/nin', label: 'NIN review' },
  { href: '/internal/admin/inspections', label: 'Inspection review' },
  { href: '/internal/admin/visits', label: 'Visit queue' },
  { href: '/internal/admin/visit-reports', label: 'Visit reports' },
  { href: '/internal/admin/agents', label: 'Trusted agents' },
  { href: '/internal/admin/listings', label: 'All listings' },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useSession((s) => s.user);

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <div className="text-sm font-bold text-brand">BeeBop · Admin</div>
          <div className="mt-1 text-xs text-slate-500">{user?.email}</div>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {SECTIONS.map((s) => {
            const active =
              s.href === '/internal/admin' ? pathname === s.href : pathname?.startsWith(s.href);
            return (
              <Link
                key={s.href}
                href={s.href}
                className={
                  'block rounded-lg px-3 py-2 text-sm transition-colors ' +
                  (active ? 'bg-brand/10 text-brand' : 'text-slate-700 hover:bg-slate-50')
                }
              >
                {s.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3">
          <Button
            variant="secondary"
            className="w-full"
            onClick={async () => {
              await logout();
              router.replace('/');
            }}
          >
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
