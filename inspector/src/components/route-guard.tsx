'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useSession } from '@/stores/session';

interface Props {
  children: ReactNode;
  /** Skip the activation gate. Onboarding pages set this so they can render. */
  allowIncompleteActivation?: boolean;
}

export function RouteGuard({ children, allowIncompleteActivation = false }: Props) {
  const router = useRouter();
  const { user, hydrated } = useSession((s) => ({ user: s.user, hydrated: s.hydrated }));

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'inspector') {
      router.replace('/login');
      return;
    }
    if (!allowIncompleteActivation && !user.activationComplete) {
      router.replace('/onboarding');
    }
  }, [hydrated, user, allowIncompleteActivation, router]);

  if (!hydrated) return <p className="p-8 text-sm text-slate-500">Loading…</p>;
  if (!user || user.role !== 'inspector') return null;
  if (!allowIncompleteActivation && !user.activationComplete) return null;
  return <>{children}</>;
}
