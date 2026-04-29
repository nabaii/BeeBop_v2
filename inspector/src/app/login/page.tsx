'use client';

/**
 * Inspector login. Same OTP backend as the main app — only the
 * post-success routing differs (we land on /onboarding or /assignments).
 */

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button, Input } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { requestOtp, verifyOtp, type OtpChannel } from '@/lib/auth';
import { useSession } from '@/stores/session';

type Step = 'identifier' | 'code';

export default function LoginPage() {
  const router = useRouter();
  const session = useSession();
  const [step, setStep] = useState<Step>('identifier');
  const [channel, setChannel] = useState<OtpChannel>('whatsapp');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // If already signed in, jump to the right page.
  useEffect(() => {
    if (!session.hydrated) return;
    if (session.user?.role === 'inspector') {
      router.replace(session.user.activationComplete ? '/assignments' : '/onboarding');
    }
  }, [session.hydrated, session.user, router]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  async function send() {
    setError(null);
    setBusy(true);
    try {
      const res = await requestOtp(channel, identifier.trim());
      setResendIn(res.resend_available_in_seconds);
      setStep('code');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const { user } = await verifyOtp({
        channel,
        identifier: identifier.trim(),
        code,
      });
      if (user.role !== 'inspector') {
        setError('This account is not an inspector. Contact admin.');
        useSession.getState().clear();
        return;
      }
      router.replace(user.activationComplete ? '/assignments' : '/onboarding');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Incorrect code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Inspector sign in</h1>
        {step === 'identifier' && (
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <div className="grid grid-cols-2 gap-2">
              {(['whatsapp', 'email'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className={
                    'rounded-lg border px-3 py-1.5 text-sm font-medium ' +
                    (channel === c
                      ? 'border-brand bg-brand/5 text-brand'
                      : 'border-slate-300 text-slate-700')
                  }
                >
                  {c === 'whatsapp' ? 'WhatsApp' : 'Email'}
                </button>
              ))}
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">
                {channel === 'whatsapp' ? 'WhatsApp number' : 'Email address'}
              </span>
              <Input
                type={channel === 'whatsapp' ? 'tel' : 'email'}
                inputMode={channel === 'whatsapp' ? 'tel' : 'email'}
                placeholder={channel === 'whatsapp' ? '+2348012345678' : 'you@example.com'}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || !identifier.trim()}>
              {busy ? 'Sending…' : 'Send code'}
            </Button>
          </form>
        )}
        {step === 'code' && (
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <p className="text-sm text-slate-600">
              We sent a 6-digit code to <strong>{identifier}</strong>.
            </p>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
              {busy ? 'Verifying…' : 'Verify'}
            </Button>
            <div className="flex justify-between text-xs text-slate-500">
              <button type="button" onClick={() => setStep('identifier')} className="hover:underline">
                Change {channel === 'whatsapp' ? 'number' : 'email'}
              </button>
              <button
                type="button"
                disabled={resendIn > 0 || busy}
                onClick={() => void send()}
                className="hover:underline disabled:opacity-50"
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
