'use client';

/**
 * Reusable OTP flow — email or WhatsApp entry, then 6-digit code with resend
 * timer. Works for both login and registration; the difference is the
 * `roleIfNew` value forwarded to the verify endpoint and the post-success
 * callback.
 */

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { requestOtp, verifyOtp, type OtpChannel } from '@/lib/auth';
import type { UserRole, SessionUser } from '@/stores/session';

type Step = 'identifier' | 'code';

interface Props {
  roleIfNew: UserRole;
  onAuthenticated: (args: { user: SessionUser; isNewUser: boolean }) => void;
  submitLabel?: string;
}

export function OtpFlow({ roleIfNew, onAuthenticated, submitLabel = 'Continue' }: Props) {
  const [step, setStep] = useState<Step>('identifier');
  const [channel, setChannel] = useState<OtpChannel>('email');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  const normalisedIdentifier = channel === 'email' ? identifier.trim().toLowerCase() : identifier.trim();

  async function sendCode() {
    setError(null);
    setBusy(true);
    try {
      const res = await requestOtp(channel, normalisedIdentifier);
      setResendIn(res.resend_available_in_seconds);
      setStep('code');
    } catch (err) {
      setError(errorMessage(err, 'Could not send the code. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    setError(null);
    setBusy(true);
    try {
      const res = await verifyOtp({
        channel,
        identifier: normalisedIdentifier,
        code,
        role_if_new: roleIfNew,
      });
      onAuthenticated(res);
    } catch (err) {
      setError(errorMessage(err, 'Incorrect code. Try again or request a new one.'));
    } finally {
      setBusy(false);
    }
  }

  if (step === 'identifier') {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void sendCode();
        }}
      >
        <div className="flex gap-2">
          <ChannelTab active={channel === 'email'} onClick={() => setChannel('email')}>
            Email
          </ChannelTab>
          <ChannelTab active={channel === 'whatsapp'} onClick={() => setChannel('whatsapp')}>
            WhatsApp
          </ChannelTab>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-700">
            {channel === 'email' ? 'Email address' : 'WhatsApp number'}
          </span>
          <Input
            type={channel === 'email' ? 'email' : 'tel'}
            inputMode={channel === 'email' ? 'email' : 'tel'}
            autoComplete={channel === 'email' ? 'email' : 'tel'}
            placeholder={channel === 'email' ? 'you@example.com' : '+2348012345678'}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={busy || !normalisedIdentifier} className="w-full">
          {busy ? 'Sending…' : submitLabel}
        </Button>
      </form>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submitCode();
      }}
    >
      <div className="text-sm text-slate-600">
        We sent a 6-digit code to <span className="font-medium text-slate-900">{normalisedIdentifier}</span>.
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-700">Verification code</span>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="\d{6}"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          invalid={Boolean(error)}
          required
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
        {busy ? 'Verifying…' : 'Verify'}
      </Button>
      <div className="flex items-center justify-between text-sm text-slate-600">
        <button
          type="button"
          className="underline-offset-2 hover:underline"
          onClick={() => setStep('identifier')}
        >
          Change {channel === 'email' ? 'email' : 'number'}
        </button>
        <button
          type="button"
          disabled={resendIn > 0 || busy}
          className="disabled:cursor-not-allowed disabled:opacity-50 hover:underline"
          onClick={() => void sendCode()}
        >
          {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
        </button>
      </div>
    </form>
  );
}

function ChannelTab({
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
        'flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ' +
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
