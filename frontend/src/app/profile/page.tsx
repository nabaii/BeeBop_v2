'use client';

import type { Route } from 'next';
import {
  Bell,
  Bookmark,
  Building2,
  CalendarCheck,
  ChevronRight,
  CreditCard,
  Gift,
  LogOut,
  MapPin,
  MessageSquare,
  Pencil,
  PlusCircle,
  Settings,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ListingCard } from '@/components/listing/listing-card';
import { ApiError } from '@/lib/api';
import { logout } from '@/lib/auth';
import { listSavedListings } from '@/lib/bookmarks';
import { deleteAccount } from '@/lib/users';
import { dashboards, type SeekerOverview } from '@/lib/dashboards';
import type { PublicListingSummary } from '@/lib/search';
import { useSession } from '@/stores/session';

export default function ProfilePage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const [overview, setOverview] = useState<SeekerOverview | null>(null);
  const [saved, setSaved] = useState<PublicListingSummary[] | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([dashboards.seeker(), listSavedListings()])
      .then(([o, s]) => {
        if (cancelled) return;
        setOverview(o);
        setSaved(s);
      })
      .catch(() => {
        if (!cancelled) {
          setOverview({
            saved_count: 0,
            active_offers_count: 0,
            agreements_count: 0,
            unread_notifications: 0,
          });
          setSaved([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
    user?.email?.split('@')[0] ||
    'Your profile';
  const initials = (user?.firstName?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase();
  const hasLandlordAccess = user?.role === 'landlord' || user?.role === 'agent';

  async function handleLogout() {
    await logout();
    router.replace('/');
  }

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

  return (
    <div className="space-y-5 px-4 py-5 pb-8">
      <ProfileHeader fullName={fullName} initials={initials} email={user?.email ?? ''} />

      <div className="grid grid-cols-2 gap-2 min-[380px]:grid-cols-4">
        <StatTile
          icon={Bookmark}
          label="Saved"
          value={overview?.saved_count}
          href="#saved"
        />
        <StatTile icon={MessageSquare} label="Messages" value="—" href="/profile/messages" />
        <StatTile icon={CalendarCheck} label="Visits" value="—" href="/profile/visits" />
        <StatTile
          icon={Bell}
          label="Alerts"
          value={overview?.unread_notifications}
          href="/profile/notifications"
          emphasis={Boolean(overview?.unread_notifications)}
        />
      </div>

      <ComingSoonCard
        icon={ShieldCheck}
        title="Verification & Trust"
        hint="Phone & email verification coming soon."
      />

      <SavedSection items={saved} />

      <ComingSoonCard
        title="Recent queries"
        hint="Your most recent Beebop search will appear here."
      />

      <ComingSoonCard
        icon={CalendarCheck}
        title="Upcoming visits"
        hint="Scheduled property tours will show up here."
      />

      <ComingSoonCard
        title="Recommended for you"
        hint="Personalised picks based on your activity."
      />

      <ComingSoonCard
        title="Lifestyle profile"
        hint="Tags and matching are coming soon."
      />

      <ComingSoonCard
        icon={CreditCard}
        title="Payments"
        hint="Saved cards and transaction history."
      />

      <nav className="space-y-2">
        <RowLink href="/dashboard/seeker" icon={CalendarCheck} label="Activity" hint="Offers · Bookings · Agreements" />
        <RowLink
          href="/profile/referrals"
          icon={Gift}
          label="Refer & earn"
          hint="Share your code · Track earnings · Withdraw"
        />
        <RowLink
          href="/dashboard/landlord"
          icon={Building2}
          label={hasLandlordAccess ? 'Landlord dashboard' : 'Become a landlord'}
          hint={hasLandlordAccess ? 'Listings · Uploads · Analytics' : 'List your property on Beebop'}
        />
        <RowLink
          href="/listings/new"
          icon={PlusCircle}
          label="Create listing"
          hint="Upload property details"
        />
        <RowLink href="/profile/notifications" icon={Bell} label="Notifications" />
        <RowLink
          href="/profile/security"
          icon={Settings}
          label="Password & security"
          hint="Manage sign-in"
        />
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex w-full items-center justify-between rounded-2xl border border-red-200 bg-white px-4 py-3 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
        >
          <span className="flex items-center gap-3">
            <LogOut className="h-5 w-5" aria-hidden />
            Log out
          </span>
          <ChevronRight className="h-4 w-4 text-red-400" aria-hidden />
        </button>
      </nav>

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
          <ChevronRight className="h-4 w-4 text-red-400" aria-hidden />
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

function ProfileHeader({
  fullName,
  initials,
  email,
}: {
  fullName: string;
  initials: string;
  email: string;
}) {
  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start gap-3">
        <div className="relative">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700">
            {initials}
          </div>
          <button
            type="button"
            className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-slate-900 shadow"
            aria-label="Edit avatar"
          >
            <Pencil className="h-3 w-3" aria-hidden />
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-slate-900">{fullName}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
            <MapPin className="h-3 w-3" aria-hidden />
            <span>Abuja, Nigeria</span>
          </p>
          <p className="mt-1 truncate text-xs text-slate-500">{email}</p>
        </div>
        <button
          type="button"
          className="w-full shrink-0 rounded-full bg-brand px-3 py-2 text-caption font-semibold text-slate-900 shadow-sm transition hover:bg-brand-600 min-[380px]:w-auto"
        >
          Edit profile
        </button>
      </div>
    </section>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  href,
  emphasis,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string | undefined;
  href: string;
  emphasis?: boolean;
}) {
  const display = value === undefined ? '—' : value;
  const className = `flex flex-col items-center justify-center gap-1 rounded-2xl border p-3 text-center transition hover:bg-brand-50 ${
    emphasis ? 'border-brand bg-brand-50' : 'border-slate-200 bg-white'
  }`;

  if (href.startsWith('#')) {
    return (
      <a href={href} className={className}>
        <Icon className={`h-4 w-4 ${emphasis ? 'text-brand-700' : 'text-slate-500'}`} aria-hidden />
        <span className="text-base font-semibold text-slate-900">{display}</span>
        <span className="text-caption font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
      </a>
    );
  }

  return (
    <Link
      href={href as Route}
      className={className}
    >
      <Icon className={`h-4 w-4 ${emphasis ? 'text-brand-700' : 'text-slate-500'}`} aria-hidden />
      <span className="text-base font-semibold text-slate-900">{display}</span>
      <span className="text-caption font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
    </Link>
  );
}

function ComingSoonCard({
  icon: Icon,
  title,
  hint,
}: {
  icon?: LucideIcon;
  title: string;
  hint: string;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-slate-400" aria-hidden />}
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-caption font-semibold uppercase tracking-wide text-slate-500">
          Coming soon
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
    </section>
  );
}

function SavedSection({ items }: { items: PublicListingSummary[] | null }) {
  return (
    <section id="saved" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Saved properties</h2>
        <Link
          href="/dashboard/seeker"
          className="text-xs font-medium text-brand hover:text-brand-700"
        >
          See all &rsaquo;
        </Link>
      </div>
      {items === null ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center">
          <p className="text-sm text-slate-600">You haven&apos;t saved any listings yet.</p>
          <Link href="/" className="mt-2 inline-block text-xs font-medium text-brand">
            Browse listings
          </Link>
        </div>
      ) : (
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
          {items.map((r) => (
            <div key={r.id} className="w-[min(15rem,78vw)] shrink-0">
              <ListingCard
                data={{
                  id: r.id,
                  title: r.title,
                  category: r.category,
                  status: r.status,
                  price: r.price,
                  district: r.district,
                  cover_photo: r.cover_url
                    ? {
                        id: `${r.id}-cover`,
                        url: r.cover_url,
                        room_label: null,
                        is_cover: true,
                        display_order: 0,
                      }
                    : null,
                  rating: r.rating,
                  review_count: r.review_count,
                }}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RowLink({
  href,
  icon: Icon,
  label,
  hint,
  disabled = false,
}: {
  href?: string;
  icon: LucideIcon;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  const content = (
    <>
      <span className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-slate-500" aria-hidden />
        <span>
          {label}
          {hint && <span className="block text-xs font-normal text-slate-500 min-[380px]:ml-2 min-[380px]:inline">{hint}</span>}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden />
    </>
  );

  if (disabled || !href) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-500">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={href as Route}
      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
    >
      {content}
    </Link>
  );
}
