'use client';

/**
 * Sign-in — OTP flow.
 *
 * On success: if onboarding is complete, send the user to their role home;
 * if not, route to the shared onboarding entry point (/onboarding) which
 * dispatches by role.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { OtpFlow } from '@/components/auth/otp-flow';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { devLoginAs, type DevRole } from '@/lib/auth';
import type { SessionUser } from '@/stores/session';

type RoleHomeRoute =
  | '/dashboard/seeker'
  | '/dashboard/landlord'
  | '/internal/agent'
  | '/internal/admin'
  | 'http://localhost:3001';

function roleHome(user: SessionUser): RoleHomeRoute {
  switch (user.role) {
    case 'seeker':
      return '/dashboard/seeker';
    case 'landlord':
    case 'agent':
      return '/dashboard/landlord';
    case 'inspector':
      return 'http://localhost:3001';     // inspector PWA
    case 'trusted_agent':
      return '/internal/agent';
    case 'admin':
      return '/internal/admin';
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [devBusyRole, setDevBusyRole] = useState<DevRole | null>(null);
  const [devError, setDevError] = useState<string | null>(null);

  function handleAuthenticated({ user }: { user: SessionUser; isNewUser: boolean }) {
    if (!user.onboardingComplete) {
      router.replace('/onboarding');
      return;
    }
    const destination = roleHome(user);
    if (destination.startsWith('http')) {
      window.location.assign(destination);
      return;
    }
    router.replace(destination);
  }

  async function handleDevLogin(role: DevRole) {
    setDevError(null);
    setDevBusyRole(role);
    try {
      const res = await devLoginAs(role);
      handleAuthenticated(res);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Dev login failed. Is the backend in dev mode?';
      setDevError(msg);
    } finally {
      setDevBusyRole(null);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Sign in</h1>
      <OtpFlow roleIfNew="seeker" onAuthenticated={handleAuthenticated} submitLabel="Send code" />
      <p className="mt-6 text-center text-sm text-slate-500">
        New to BeeBop?{' '}
        <Link href="/register" className="font-medium text-brand hover:underline">
          Create an account
        </Link>
      </p>
      {process.env.NODE_ENV !== 'production' && (
        <div className="mt-8 space-y-2 rounded-md border border-dashed border-amber-300 bg-amber-50 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-amber-800">
            Dev only
          </p>
          <Button
            type="button"
            onClick={() => void handleDevLogin('seeker')}
            disabled={devBusyRole !== null}
            className="w-full"
          >
            {devBusyRole === 'seeker' ? 'Signing in…' : 'Log in as seeker-super'}
          </Button>
          <Button
            type="button"
            onClick={() => void handleDevLogin('landlord')}
            disabled={devBusyRole !== null}
            className="w-full"
            variant="secondary"
          >
            {devBusyRole === 'landlord' ? 'Signing in…' : 'Log in as landlord-super'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleDevLogin('admin')}
            disabled={devBusyRole !== null}
            className="w-full"
          >
            {devBusyRole === 'admin' ? 'Signing in…' : 'Log in as admin-super'}
          </Button>
          {devError && <p className="mt-2 text-sm text-red-600">{devError}</p>}
        </div>
      )}
    </div>
  );
}
