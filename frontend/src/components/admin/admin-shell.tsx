'use client';

/**
 * Admin portal shell - navigation, account controls, and public-site exits
 * for every page under /internal/admin. Role-guarding lives one level up.
 */

import {
  Building2,
  ClipboardCheck,
  FileCheck2,
  GraduationCap,
  Home,
  House,
  IdCard,
  ListChecks,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  UserRoundCheck,
  Waves,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { logout } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { useSession } from '@/stores/session';

type AdminRoute =
  | '/internal/admin'
  | '/internal/admin/nin'
  | '/internal/admin/inspections'
  | '/internal/admin/visits'
  | '/internal/admin/visit-reports'
  | '/internal/admin/agents'
  | '/internal/admin/listings';

type WebsiteRoute =
  | '/'
  | '/browse'
  | '/browse/off-campus'
  | '/browse/short-let'
  | '/browse/rent'
  | '/browse/sales';

type NavItem<THref extends string = string> = {
  href: THref;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

const ADMIN_SECTIONS: readonly NavItem<AdminRoute>[] = [
  { href: '/internal/admin', label: 'Doc review queue', icon: FileCheck2, exact: true },
  { href: '/internal/admin/nin', label: 'NIN review', icon: IdCard },
  { href: '/internal/admin/inspections', label: 'Inspection review', icon: ClipboardCheck },
  { href: '/internal/admin/visits', label: 'Visit queue', icon: ListChecks },
  { href: '/internal/admin/visit-reports', label: 'Visit reports', icon: ShieldCheck },
  { href: '/internal/admin/agents', label: 'Trusted agents', icon: UserRoundCheck },
  { href: '/internal/admin/listings', label: 'All listings', icon: Building2 },
] as const;

const WEBSITE_LINKS: readonly NavItem<WebsiteRoute>[] = [
  { href: '/', label: 'BeeBop home', icon: Home, exact: true },
  { href: '/browse', label: 'Browse listings', icon: Search, exact: true },
  { href: '/browse/off-campus', label: 'Off-campus', icon: GraduationCap },
  { href: '/browse/short-let', label: 'Short-let', icon: Waves },
  { href: '/browse/rent', label: 'Rent', icon: House },
  { href: '/browse/sales', label: 'For sale', icon: Building2 },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useSession((s) => s.user);
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    await logout();
    router.replace('/');
  }

  return (
    <div className="min-h-[100dvh] bg-slate-100 text-slate-900 lg:flex lg:h-[100dvh]">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close admin menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}

      <AdminNavigation
        pathname={pathname ?? '/internal/admin'}
        email={user?.email ?? 'Admin'}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
        onSignOut={() => void handleSignOut()}
      />

      <div className="flex min-h-[100dvh] flex-1 flex-col lg:min-h-0">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
              aria-label="Open admin menu"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">BeeBop Admin</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="min-h-10 shrink-0 gap-2 px-3"
            onClick={() => void handleSignOut()}
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </Button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function AdminNavigation({
  pathname,
  email,
  mobileOpen,
  onNavigate,
  onSignOut,
}: {
  pathname: string;
  email: string;
  mobileOpen: boolean;
  onNavigate: () => void;
  onSignOut: () => void;
}) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[min(84vw,18rem)] shrink-0 flex-col border-r border-slate-200 bg-white transition-transform lg:sticky lg:top-0 lg:z-auto lg:w-72',
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
        <Link href="/" onClick={onNavigate} className="text-lg font-bold text-brand">
          BeeBop
        </Link>
        <button
          type="button"
          onClick={onNavigate}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
          aria-label="Close admin menu"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden />
          Admin portal
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">{email}</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <NavGroup
          title="Admin tools"
          items={ADMIN_SECTIONS}
          pathname={pathname}
          onNavigate={onNavigate}
        />
        <NavGroup
          title="Website"
          items={WEBSITE_LINKS}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      </nav>

      <div className="border-t border-slate-200 p-3">
        <Button type="button" variant="secondary" className="w-full gap-2" onClick={onSignOut}>
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </Button>
      </div>
    </aside>
  );
}

function NavGroup<THref extends string>({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title: string;
  items: readonly NavItem<THref>[];
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <section className="mb-5 last:mb-0">
      <h2 className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h2>
      <div className="space-y-0.5">
        {items.map((item) => (
          <AdminNavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item)}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </section>
  );
}

function AdminNavLink<THref extends string>({
  item,
  active,
  onNavigate,
}: {
  item: NavItem<THref>;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href as Route}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-10 items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-brand/10 text-brand-700'
          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function isActive<THref extends string>(pathname: string, item: NavItem<THref>): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
