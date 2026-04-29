'use client';

/**
 * Client-side route gate. Blocks render until the session is hydrated, then
 * redirects unauthorised visitors. Roles (optional) restrict to specific
 * user types — used for /internal/admin and /internal/agent in later sprints.
 */

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useSession, type UserRole } from '@/stores/session';

interface Props {
  roles?: readonly UserRole[];
  redirectTo?: Route;
  children: ReactNode;
}

export function RouteGuard({ roles, redirectTo = '/login', children }: Props) {
  const router = useRouter();
  const { user, hydrated } = useSession((s) => ({ user: s.user, hydrated: s.hydrated }));

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace(redirectTo);
      return;
    }
    if (roles && roles.length > 0 && !roles.includes(user.role)) {
      router.replace('/');
    }
  }, [hydrated, user, roles, redirectTo, router]);

  if (!hydrated) return null;
  if (!user) return null;
  if (roles && roles.length > 0 && !roles.includes(user.role)) return null;
  return <>{children}</>;
}
