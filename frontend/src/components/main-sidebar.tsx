'use client';

import {
  Building2,
  GraduationCap,
  House,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Waves,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { becomeLandlord } from '@/lib/users';
import { useSearch } from '@/stores/search';
import { useSession } from '@/stores/session';

const CATEGORIES: ReadonlyArray<{
  href: '/browse/off-campus' | '/browse/short-let' | '/browse/rent' | '/browse/sales';
  label: string;
  icon: LucideIcon;
}> = [
  { href: '/browse/off-campus', label: 'Off-campus', icon: GraduationCap },
  { href: '/browse/short-let', label: 'Short-let', icon: Waves },
  { href: '/browse/rent', label: 'Rent', icon: House },
  { href: '/browse/sales', label: 'For Sale', icon: Building2 },
];

interface MainSidebarProps {
  onNewChat?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function MainSidebar({ onNewChat, mobileOpen = false, onMobileClose }: MainSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [landlordBusy, setLandlordBusy] = useState(false);
  const [landlordError, setLandlordError] = useState<string | null>(null);
  const clearSearchSession = useSearch((state) => state.clearSession);
  const user = useSession((state) => state.user);

  const hasLandlordAccess = user?.role === 'landlord' || user?.role === 'agent';
  const canShowLandlordAction = !user || user.role === 'seeker' || hasLandlordAccess;
  const landlordActionLabel = hasLandlordAccess ? 'Landlord dashboard' : 'List a property';
  const LandlordActionIcon = hasLandlordAccess ? LayoutDashboard : Building2;

  function handleNavigate() {
    onMobileClose?.();
  }

  function handleCategoryNavigate() {
    clearSearchSession();
    handleNavigate();
  }

  async function handleLandlordAction() {
    setLandlordError(null);
    if (!user) {
      handleNavigate();
      router.push('/register?role=landlord');
      return;
    }
    if (hasLandlordAccess) {
      handleNavigate();
      router.push('/dashboard/landlord');
      return;
    }
    if (user.role !== 'seeker') return;

    setLandlordBusy(true);
    try {
      const updated = await becomeLandlord();
      handleNavigate();
      router.push(updated.onboarding_complete ? '/dashboard/landlord' : '/onboarding/landlord');
    } catch (err) {
      setLandlordError(
        err instanceof ApiError ? err.message : 'Could not switch this account. Try again.',
      );
    } finally {
      setLandlordBusy(false);
    }
  }

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={onMobileClose}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[min(82vw,280px)] shrink-0 flex-col border-r border-slate-200 bg-white transition-transform',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:static lg:translate-x-0',
          collapsed ? 'lg:w-[56px]' : 'lg:w-[240px]',
        )}
      >
        <div className="flex items-center justify-between p-3">
          {!collapsed && (
            <Link
              href="/"
              onClick={handleNavigate}
              className="text-lg font-bold text-brand"
            >
              Beebop
            </Link>
          )}
          <button
            type="button"
            onClick={onMobileClose}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="hidden rounded p-1.5 text-slate-500 hover:bg-slate-100 lg:inline-flex"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" aria-hidden />
            ) : (
              <PanelLeftClose className="h-5 w-5" aria-hidden />
            )}
          </button>
        </div>
        <div className="px-2">
          <button
            type="button"
            onClick={() => {
              onNewChat?.();
              handleNavigate();
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50',
              collapsed && 'lg:justify-center',
            )}
            title="New chat"
          >
            <Plus className="h-4 w-4" aria-hidden />
            <span className={cn(collapsed && 'lg:hidden')}>New chat</span>
          </button>
        </div>
        <nav className="mt-3 flex-1 space-y-0.5 px-2">
          {CATEGORIES.map((c) => {
            const active = pathname?.startsWith(c.href);
            const Icon = c.icon;
            return (
              <Link
                key={c.href}
                href={c.href}
                onClick={handleCategoryNavigate}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
                  active ? 'bg-brand/10 text-brand' : 'text-slate-700 hover:bg-slate-100',
                  collapsed && 'lg:justify-center',
                )}
                title={c.label}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className={cn(collapsed && 'lg:hidden')}>{c.label}</span>
              </Link>
            );
          })}
        </nav>
        {canShowLandlordAction && (
          <div className="border-t border-slate-200 p-2">
            <button
              type="button"
              onClick={() => void handleLandlordAction()}
              disabled={landlordBusy}
              className={cn(
                'flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-brand/10 hover:text-brand disabled:cursor-not-allowed disabled:opacity-60',
                collapsed && 'lg:justify-center',
              )}
              title={landlordActionLabel}
            >
              <LandlordActionIcon className="h-4 w-4 shrink-0" aria-hidden />
              <span className={cn(collapsed && 'lg:hidden')}>
                {landlordBusy ? 'Switching...' : landlordActionLabel}
              </span>
            </button>
            {landlordError && (
              <p className={cn('mt-2 text-xs text-red-600', collapsed && 'lg:hidden')}>
                {landlordError}
              </p>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
