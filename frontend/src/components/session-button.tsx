'use client';

/**
 * Sign-in / sign-out button for the main shell header. Sprint 1 places this
 * on the landing page as a quick way to get into the app while the real
 * sidebar header is built in Sprint 3.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { logout } from '@/lib/auth';
import { useSession } from '@/stores/session';

export function SessionButton() {
  const router = useRouter();
  const { user, hydrated } = useSession((s) => ({ user: s.user, hydrated: s.hydrated }));

  if (!hydrated) return null;

  if (!user) {
    return (
      <Link href="/login">
        <Button variant="secondary">Sign in</Button>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-600">
        {user.firstName ? `Hi, ${user.firstName}` : user.email}
      </span>
      <Button
        variant="ghost"
        onClick={async () => {
          await logout();
          router.replace('/');
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
