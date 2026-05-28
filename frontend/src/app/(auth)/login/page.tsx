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
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { devLoginAs, loginWithPassword, type DevRole } from '@/lib/auth';
import type { SessionUser } from '@/stores/session';

type RoleHomeRoute =
  | '/dashboard/seeker'
  | '/dashboard/landlord'
  | '/internal/agent'
  | '/internal/admin'
  | 'http://localhost:3001';

type LoginMode = 'password' | 'code';

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
  const [mode, setMode] = useState<LoginMode>('password');
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
      <div className="mb-4 grid grid-cols-2 gap-2">
        <ModeTab active={mode === 'password'} onClick={() => setMode('password')}>
          Password
        </ModeTab>
        <ModeTab active={mode === 'code'} onClick={() => setMode('code')}>
          Code
        </ModeTab>
      </div>
      {mode === 'password' ? (
        <PasswordLoginForm onAuthenticated={handleAuthenticated} onUseCode={() => setMode('code')} />
      ) : (
        <OtpFlow roleIfNew="seeker" onAuthenticated={handleAuthenticated} submitLabel="Send code" />
      )}
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

function PasswordLoginForm({
  onAuthenticated,
  onUseCode,
}: {
  onAuthenticated: (args: { user: SessionUser; isNewUser: boolean }) => void;
  onUseCode: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPasswordValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res = await loginWithPassword({ email, password });
      onAuthenticated(res);
    } catch (err) {
      setError(errorMessage(err, 'Invalid email or password.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="block text-sm">
        <span className="mb-1 block text-slate-700">Email address</span>
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          invalid={Boolean(error)}
          required
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-700">Password</span>
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPasswordValue(e.target.value)}
          invalid={Boolean(error)}
          required
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy || !email.trim() || password.length < 8} className="w-full">
        {busy ? 'Signing in...' : 'Sign in'}
      </Button>
      <button
        type="button"
        className="w-full text-center text-sm font-medium text-brand hover:underline"
        onClick={onUseCode}
      >
        Sign in with a code
      </button>
    </form>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'min-h-11 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ' +
        (active ? 'border-brand bg-brand/5 text-brand' : 'border-slate-300 text-slate-600 hover:bg-slate-50')
      }
    >
      {children}
    </button>
  );
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || fallback;
  return fallback;
}
