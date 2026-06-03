'use client';

/**
 * Registration — choose seeker vs landlord, then OTP. On verify, the user
 * is redirected straight to their onboarding wizard because new users
 * always have `onboardingComplete: false`.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { OtpFlow } from '@/components/auth/otp-flow';
import { ApiError } from '@/lib/api';
import { becomeLandlord } from '@/lib/users';
import type { SessionUser } from '@/stores/session';

type Role = 'seeker' | 'landlord';

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>('seeker');
  const [conversionError, setConversionError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('role') === 'landlord') setRole('landlord');
  }, []);

  async function handleAuthenticated({
    user,
    isNewUser,
  }: {
    user: SessionUser;
    isNewUser: boolean;
  }) {
    setConversionError(null);
    if (role === 'landlord' && user.role === 'seeker') {
      try {
        const updated = await becomeLandlord();
        router.replace(updated.onboarding_complete ? '/dashboard/landlord' : '/onboarding/landlord');
      } catch (err) {
        setConversionError(
          err instanceof ApiError ? err.message : 'Could not switch this account. Try again.',
        );
      }
      return;
    }
    if (!isNewUser && user.onboardingComplete) {
      if (user.role === 'seeker') router.replace('/dashboard/seeker');
      else if (user.role === 'landlord' || user.role === 'agent') router.replace('/dashboard/landlord');
      else router.replace('/');
      return;
    }
    router.replace('/onboarding');
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Create an account</h1>
      <div className="mb-6 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
        <RoleCard active={role === 'seeker'} onClick={() => setRole('seeker')} title="I'm looking" subtitle="Find a home" />
        <RoleCard active={role === 'landlord'} onClick={() => setRole('landlord')} title="I'm listing" subtitle="Rent or sell" />
      </div>
      <OtpFlow
        roleIfNew={role}
        onAuthenticated={(args) => void handleAuthenticated(args)}
        submitLabel="Send code"
        isSignup
      />
      {conversionError && <p className="mt-3 text-sm text-red-600">{conversionError}</p>}
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

function RoleCard({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'min-h-[76px] rounded-lg border p-3 text-left transition-colors ' +
        (active
          ? 'border-brand bg-brand/5 text-brand'
          : 'border-slate-300 text-slate-600 hover:bg-slate-50')
      }
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs">{subtitle}</div>
    </button>
  );
}
