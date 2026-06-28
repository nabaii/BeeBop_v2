'use client';

import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { setPassword } from '@/lib/auth';
import { deleteAccount } from '@/lib/users';
import { useSession } from '@/stores/session';

export default function ProfileSecurityPage() {
  const router = useRouter();
  const hasPassword = useSession((s) => s.user?.hasPassword ?? false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDeleteAccount() {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteAccount();
      router.replace('/');
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : 'Could not delete your account. Please try again.',
      );
      setDeleting(false);
    }
  }

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

      <section className="space-y-2 rounded-2xl border border-red-200 bg-red-50/40 p-4">
        <h2 className="text-sm font-semibold text-red-700">Danger zone</h2>
        <p className="text-xs text-slate-600">
          Deleting your account removes your profile and signs you out everywhere. This cannot be
          undone.
        </p>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="flex w-full items-center justify-between rounded-xl border border-red-300 bg-white px-4 py-3 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
        >
          <span className="flex items-center gap-3">
            <Trash2 className="h-5 w-5" aria-hidden />
            Delete my account
          </span>
        </button>
      </section>

      {confirmingDelete && (
        <DeleteAccountDialog
          busy={deleting}
          error={deleteError}
          onCancel={() => {
            if (deleting) return;
            setConfirmingDelete(false);
            setDeleteError(null);
          }}
          onConfirm={() => void handleDeleteAccount()}
        />
      )}
    </div>
  );
}

function DeleteAccountDialog({
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
            <Trash2 className="h-5 w-5" aria-hidden />
          </div>
          <h2 id="delete-account-title" className="text-base font-semibold text-slate-900">
            Delete your account?
          </h2>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          This permanently removes your profile and preferences and signs you out. You won&apos;t be
          able to recover this account.
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </div>
    </div>
  );
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || fallback;
  return fallback;
}
