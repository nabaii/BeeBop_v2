'use client';

/**
 * Onboarding entry — dispatches by role. Called after registration (new user)
 * or login (existing user with onboarding_complete = false).
 */

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useSession } from '@/stores/session';

export default function OnboardingEntry() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const hydrated = useSession((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated || !user) return;
    if (user.role === 'seeker') router.replace('/onboarding/seeker');
    else if (user.role === 'landlord') router.replace('/onboarding/landlord');
    else router.replace('/');
  }, [hydrated, user, router]);

  return <p className="text-sm text-slate-500">Loading your account…</p>;
}
