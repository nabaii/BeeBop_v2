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

import { OtpFlow } from '@/components/auth/otp-flow';
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
    </div>
  );
}
