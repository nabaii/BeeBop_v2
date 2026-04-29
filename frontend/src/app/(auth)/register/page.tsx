'use client';

/**
 * Registration — choose seeker vs landlord, then OTP. On verify, the user
 * is redirected straight to their onboarding wizard because new users
 * always have `onboardingComplete: false`.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { OtpFlow } from '@/components/auth/otp-flow';

type Role = 'seeker' | 'landlord';

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>('seeker');

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Create an account</h1>
      <div className="mb-6 grid grid-cols-2 gap-2">
        <RoleCard active={role === 'seeker'} onClick={() => setRole('seeker')} title="I'm looking" subtitle="Find a home" />
        <RoleCard active={role === 'landlord'} onClick={() => setRole('landlord')} title="I'm listing" subtitle="Rent or sell" />
      </div>
      <OtpFlow
        roleIfNew={role}
        onAuthenticated={() => router.replace('/onboarding')}
        submitLabel="Send code"
      />
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
        'rounded-lg border p-3 text-left transition-colors ' +
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
