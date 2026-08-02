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
  History,
  LogOut,
  MapPin,
  MessageSquare,
  Pencil,
  PlusCircle,
  Search,
  Settings,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ListingCard } from '@/components/listing/listing-card';
import {
  clearRecentQueries,
  deleteRecentQuery,
  listRecentQueries,
  type RecentQuery,
} from '@/lib/ai-search';
import { logout } from '@/lib/auth';
import { listSavedListings } from '@/lib/bookmarks';
import { dashboards, type SeekerOverview } from '@/lib/dashboards';
import type { PublicListingSummary } from '@/lib/search';
import { useSearch } from '@/stores/search';
import { useSession } from '@/stores/session';

export default function ProfilePage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const setPendingQuery = useSearch((s) => s.setPendingQuery);
  const [overview, setOverview] = useState<SeekerOverview | null>(null);
  const [saved, setSaved] = useState<PublicListingSummary[] | null>(null);
  const [queries, setQueries] = useState<RecentQuery[] | null>(null);

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

  // Fetched separately from the overview above: history is the least important
  // thing on the page, so a failure here renders an empty card rather than
  // taking the saved listings and stat tiles down with it.
  useEffect(() => {
    let cancelled = false;
    listRecentQueries()
      .then((rows) => {
        if (!cancelled) setQueries(rows);
      })
      .catch(() => {
        if (!cancelled) setQueries([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Hand the text to the homepage chat and let it run the search fresh —
  // results move, so replaying the question beats replaying stale results.
  function handleReplayQuery(query: string): void {
    setPendingQuery(query);
    router.push('/');
  }

  async function handleDeleteQuery(id: string): Promise<void> {
    const previous = queries;
    setQueries((current) => current?.filter((q) => q.id !== id) ?? current);
    try {
      await deleteRecentQuery(id);
    } catch {
      setQueries(previous ?? null);
    }
  }

  async function handleClearQueries(): Promise<void> {
    const previous = queries;
    setQueries([]);
    try {
      await clearRecentQueries();
    } catch {
      setQueries(previous ?? null);
    }
  }

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

      <RecentQueriesSection
        items={queries}
        onReplay={handleReplayQuery}
        onDelete={handleDeleteQuery}
        onClear={handleClearQueries}
      />

      <ComingSoonCard
        icon={CalendarCheck}
        title="Upcoming visits"
        hint="Scheduled property tours will show up here."
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
        {hasLandlordAccess && (
          <RowLink
            href="/listings/new"
            icon={PlusCircle}
            label="Create listing"
            hint="Upload property details"
          />
        )}
        <RowLink href="/profile/notifications" icon={Bell} label="Notifications" />
        <RowLink
          href="/profile/security"
          icon={Settings}
          label="Manage account"
          hint="Password · Security · Delete account"
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

// Shown on the profile card. The full history the API returns is longer; the
// card is a glance, not an archive.
const VISIBLE_QUERY_COUNT = 5;

function RecentQueriesSection({
  items,
  onReplay,
  onDelete,
  onClear,
}: {
  items: RecentQuery[] | null;
  onReplay: (query: string) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  const visible = items?.slice(0, VISIBLE_QUERY_COUNT) ?? [];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-slate-400" aria-hidden />
        <h3 className="text-sm font-semibold text-slate-700">Recent queries</h3>
        {visible.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="ml-auto rounded-full px-2 py-0.5 text-caption font-semibold text-slate-500 transition hover:bg-red-50 hover:text-red-600"
          >
            Clear all
          </button>
        )}
      </div>

      {items === null ? (
        <p className="mt-2 text-xs text-slate-500">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          Your Beebop searches will show up here. Ask for somewhere to live and
          we&apos;ll keep the question handy.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {visible.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-1 rounded-xl border border-slate-100 transition hover:border-brand-200 hover:bg-brand-50/40"
            >
              {/* Two sibling buttons rather than a nested one — a delete
                  control inside the replay button would be invalid markup and
                  unreachable by keyboard. */}
              <button
                type="button"
                onClick={() => onReplay(entry.query)}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left"
              >
                <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-800">
                    {entry.query}
                  </span>
                  <span className="mt-0.5 block text-caption text-slate-500">
                    {describeQuery(entry)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(entry.id)}
                aria-label={`Remove "${entry.query}" from recent queries`}
                className="mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Meta line under a stored query: how it went, and how long ago. */
function describeQuery(entry: RecentQuery): string {
  const when = formatRelativeTime(entry.created_at);
  if (entry.result_count === 0) return when;
  const matches = `${entry.result_count} match${entry.result_count === 1 ? '' : 'es'}`;
  return `${matches} · ${when}`;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  // Clamped at zero: a server clock marginally ahead of the browser's should
  // read "just now", never "in 3 seconds".
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
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
                        unit_type_id: null,
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
