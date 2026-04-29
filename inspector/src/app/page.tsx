'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useSession } from '@/stores/session';

export default function HomePage() {
  const router = useRouter();
  const { user, hydrated } = useSession((s) => ({ user: s.user, hydrated: s.hydrated }));
  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    router.replace(user.activationComplete ? '/assignments' : '/onboarding');
  }, [user, hydrated, router]);
  return <p className="p-8 text-sm text-slate-500">Loading…</p>;
}
