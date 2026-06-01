'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { setPassword } from '@/lib/auth';
import { useSession } from '@/stores/session';

export default function ProfileSecurityPage() {
  const hasPassword = useSession((s) => s.user?.hasPassword ?? false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit() {
    setError(null);
    setSaved(false);
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await setPassword({
        currentPassword: hasPassword ? currentPassword : undefined,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err, 'Could not update your password.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 px-4 py-5 pb-8">
      <Link href="/profile" className="text-sm font-medium text-brand hover:underline">
        &lsaquo; Back to profile
      </Link>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Password & security</h1>
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {hasPassword && (
            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">Current password</span>
              <Input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                invalid={Boolean(error)}
                required
              />
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block text-slate-700">New password</span>
            <Input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              invalid={Boolean(error)}
              required
              minLength={8}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-700">Confirm password</span>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              invalid={Boolean(error)}
              required
              minLength={8}
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && <p className="text-sm text-green-700">Password updated.</p>}
          <Button
            type="submit"
            className="w-full"
            disabled={busy || newPassword.length < 8 || confirmPassword.length < 8}
          >
            {busy ? 'Saving...' : hasPassword ? 'Update password' : 'Set password'}
          </Button>
        </form>
      </section>
    </div>
  );
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || fallback;
  return fallback;
}
