'use client';

/**
 * Reusable OTP flow — email or WhatsApp entry, then 6-digit code with resend
 * timer. Works for both login and registration; the difference is the
 * `roleIfNew` value forwarded to the verify endpoint and the post-success
 * callback.
 */

import { useEffect, useState } from 'react';
import { Check, X, Eye, EyeOff } from 'lucide-react';

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
  isSignup?: boolean;
}

export function OtpFlow({ roleIfNew, onAuthenticated, submitLabel = 'Continue', isSignup = false }: Props) {
  const [step, setStep] = useState<Step>('identifier');
  const [channel, setChannel] = useState<OtpChannel>('email');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  const normalisedIdentifier = channel === 'email' ? identifier.trim().toLowerCase() : identifier.trim();

  // Password validation criteria
  const isLengthValid = password.length > 10;
  const hasNumber = /\d/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isPasswordValid = !isSignup || (isLengthValid && hasNumber && passwordsMatch);

  async function sendCode() {
    setError(null);
    setBusy(true);
    try {
      const res = await requestOtp(channel, normalisedIdentifier);
      setResendIn(res.resend_available_in_seconds);
      if (res.dev_otp_code) {
        setDevOtp(res.dev_otp_code);
        setCode(res.dev_otp_code);
      } else {
        setDevOtp(null);
      }
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
        password: isSignup ? password : undefined,
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
          if (isPasswordValid) {
            void sendCode();
          }
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
          <span className="mb-1 block text-slate-700 font-medium">
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

        {isSignup && (
          <>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-700 font-medium">Password</span>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-slate-700 font-medium">Confirm password</span>
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </label>

            {/* Checklist */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2 text-xs">
              <p className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Password Requirements</p>
              <div className="space-y-1.5">
                <ChecklistItem met={isLengthValid} text="Above 10 characters" />
                <ChecklistItem met={hasNumber} text="Contains at least one number" />
                <ChecklistItem met={passwordsMatch} text="Passwords match" />
              </div>
            </div>
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        
        <Button 
          type="submit" 
          disabled={busy || !normalisedIdentifier || !isPasswordValid} 
          className="w-full transition-all duration-200"
        >
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
      {devOtp && (
        <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-semibold uppercase tracking-wide text-xs mb-1">Dev only notice</p>
          <p>OTP code <strong>{devOtp}</strong> has been auto-filled (stubbed in development mode).</p>
        </div>
      )}
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

function ChecklistItem({ met, text }: { met: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2 transition-all duration-300">
      {met ? (
        <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white transition-all scale-100">
          <Check className="h-3 w-3 stroke-[3]" />
        </div>
      ) : (
        <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-400 bg-white transition-all">
          <X className="h-2.5 w-2.5" />
        </div>
      )}
      <span className={`transition-colors duration-300 ${met ? 'text-emerald-700 font-medium' : 'text-slate-400'}`}>
        {text}
      </span>
    </div>
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
