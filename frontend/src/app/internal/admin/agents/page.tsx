'use client';

/**
 * Admin: trusted-agent roster + invite. Same pattern as the inspector roster.
 */

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { adminAgents } from '@/lib/agents';

interface AgentRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  operating_area: string | null;
  activation_complete: boolean;
  created_at: string;
}

export default function AdminAgentsPage() {
  const [items, setItems] = useState<AgentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function refresh() {
    try {
      setItems(await adminAgents.list());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load agents.');
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="p-6 sm:p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Trusted agents</h1>
        <Button onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : 'Invite agent'}
        </Button>
      </header>

      {showForm && (
        <InviteForm
          onCreated={async () => {
            setShowForm(false);
            await refresh();
          }}
        />
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {items === null ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="p-12 text-center text-sm text-slate-500">No agents yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Operating area</th>
                <th className="px-4 py-2">Activation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 text-slate-900">
                    {[a.first_name, a.last_name].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{a.email}</td>
                  <td className="px-4 py-3 text-slate-700">{a.operating_area ?? '—'}</td>
                  <td className="px-4 py-3">
                    {a.activation_complete ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-caption font-medium text-emerald-800">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-caption font-medium text-amber-800">
                        Pending
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function InviteForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminAgents.invite({
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        first_name: first.trim(),
        last_name: last.trim(),
      });
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invitation failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          placeholder="First name"
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          required
        />
        <Input
          placeholder="Last name"
          value={last}
          onChange={(e) => setLast(e.target.value)}
          required
        />
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          type="tel"
          placeholder="WhatsApp number (e.g. +2348012345678)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy || !first.trim() || !last.trim() || !email.trim()}>
        {busy ? 'Sending invite…' : 'Invite'}
      </Button>
    </form>
  );
}
