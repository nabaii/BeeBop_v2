'use client';

/**
 * Per-role dashboard sidebar. Sections shown depend on the user's role.
 * Internal portals (admin, agent) are NOT included here — they have their
 * own shell under /internal/*.
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { logout } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { becomeLandlord } from '@/lib/users';
import { useSession, type UserRole } from '@/stores/session';

const SECTIONS = [
  { href: '/dashboard/seeker', label: 'Saved & enquiries', roles: ['seeker'] },
  { href: '/dashboard/landlord', label: 'My listings', roles: ['landlord', 'agent'] },
  { href: '/dashboard/student', label: 'Student PMS', roles: ['landlord', 'agent'] },
  { href: '/dashboard/short-let', label: 'Short-let calendar', roles: ['landlord', 'agent'] },
] as const satisfies ReadonlyArray<{
  href: '/dashboard/seeker' | '/dashboard/landlord' | '/dashboard/student' | '/dashboard/short-let';
  label: string;
  roles?: readonly UserRole[];
}>;

export function DashboardSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useSession((s) => s.user);
  const [landlordBusy, setLandlordBusy] = useState(false);
  const [landlordError, setLandlordError] = useState<string | null>(null);
  if (!user) return null;

  const visible = SECTIONS.filter(
    (s) => !s.roles || (s.roles as readonly UserRole[]).includes(user.role),
  );
  const hasLandlordAccess = user.role === 'landlord' || user.role === 'agent';
  const canBecomeLandlord = user.role === 'seeker';

  async function handleBecomeLandlord() {
    setLandlordError(null);
    setLandlordBusy(true);
    try {
      const updated = await becomeLandlord();
      router.replace(updated.onboarding_complete ? '/dashboard/landlord' : '/onboarding/landlord');
    } catch (err) {
      setLandlordError(
        err instanceof ApiError ? err.message : 'Could not switch this account. Try again.',
      );
    } finally {
      setLandlordBusy(false);
    }
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <Link href="/" className="text-lg font-bold text-brand">
          Beebop
        </Link>
        <div className="mt-1 truncate text-xs text-slate-500">{user.email}</div>
      </div>
      <nav className="flex-1 space-y-0.5 p-2">
        {visible.map((s) => {
          const active = pathname === s.href || pathname?.startsWith(s.href + '/');
          return (
            <Link
              key={s.href}
              href={s.href}
              className={cn(
                'block rounded-lg px-3 py-2 text-sm transition-colors',
                active ? 'bg-brand/10 text-brand' : 'text-slate-700 hover:bg-slate-50',
              )}
            >
              {s.label}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-2 border-t border-slate-200 p-3">
        {canBecomeLandlord && (
          <>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => void handleBecomeLandlord()}
              disabled={landlordBusy}
            >
              {landlordBusy ? 'Starting...' : 'List a property'}
            </Button>
            {landlordError && <p className="text-xs text-red-600">{landlordError}</p>}
          </>
        )}
        {hasLandlordAccess && (
          <Link
            href="/dashboard/landlord"
            className="block rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Landlord dashboard
          </Link>
        )}
        <Link href="/" className="block text-center text-xs text-slate-500 hover:text-brand">
          Back to Beebop
        </Link>
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
  );
}
