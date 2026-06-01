'use client';

import { Eye, EyeOff, LockKeyhole, Mail, MessageCircle } from 'lucide-react';
import { useState } from 'react';

import { OtpFlow } from '@/components/auth/otp-flow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { loginWithPassword } from '@/lib/auth';
import type { SessionUser } from '@/stores/session';

type LoginMode = 'password' | 'code';

interface Props {
  onAuthenticated: (args: { user: SessionUser; isNewUser: boolean }) => void;
}

export function LoginForm({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<LoginMode>('password');

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
        <ModeButton active={mode === 'password'} onClick={() => setMode('password')}>
          <LockKeyhole className="h-4 w-4" aria-hidden />
          Password
        </ModeButton>
        <ModeButton active={mode === 'code'} onClick={() => setMode('code')}>
          <Mail className="h-4 w-4" aria-hidden />
          Code
        </ModeButton>
      </div>

      {mode === 'password' ? (
        <PasswordLoginForm onAuthenticated={onAuthenticated} onUseCode={() => setMode('code')} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
            <span>Email and WhatsApp codes still work.</span>
          </div>
          <OtpFlow roleIfNew="seeker" onAuthenticated={onAuthenticated} submitLabel="Send code" />
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
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length >= 8 && !busy;

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
        <div className="relative">
          <Input
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPasswordValue(e.target.value)}
            invalid={Boolean(error)}
            className="pr-12"
            required
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" aria-hidden />
            ) : (
              <Eye className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={!canSubmit} className="w-full">
        {busy ? 'Signing in...' : 'Sign in'}
      </Button>

      <button
        type="button"
        className="w-full rounded-lg px-3 py-2 text-center text-sm font-medium text-brand transition hover:bg-brand/5"
        onClick={onUseCode}
      >
        Sign in with email or WhatsApp code
      </button>
    </form>
  );
}

function ModeButton({
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
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ' +
        (active ? 'bg-white text-brand shadow-sm' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900')
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
