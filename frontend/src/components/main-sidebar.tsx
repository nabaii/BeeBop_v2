'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { cn } from '@/lib/cn';

const CATEGORIES = [
  { href: '/browse/off-campus', label: 'Off-campus', icon: '🎓' },
  { href: '/browse/short-let', label: 'Short-let', icon: '🏖' },
  { href: '/browse/rent', label: 'Rent', icon: '🏠' },
  { href: '/browse/sales', label: 'For Sale', icon: '🏷' },
] as const;

interface MainSidebarProps {
  onNewChat?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function MainSidebar({ onNewChat, mobileOpen = false, onMobileClose }: MainSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  function handleNavigate() {
    onMobileClose?.();
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
          'fixed inset-y-0 left-0 z-50 flex w-[280px] shrink-0 flex-col border-r border-slate-200 bg-white transition-transform',
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
              BeeBop
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
            {collapsed ? '›' : '‹'}
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
            <span>✎</span>
            <span className={cn(collapsed && 'lg:hidden')}>New chat</span>
          </button>
        </div>
        <nav className="mt-3 flex-1 space-y-0.5 px-2">
          {CATEGORIES.map((c) => {
            const active = pathname?.startsWith(c.href);
            return (
              <Link
                key={c.href}
                href={c.href}
                onClick={handleNavigate}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
                  active ? 'bg-brand/10 text-brand' : 'text-slate-700 hover:bg-slate-100',
                  collapsed && 'lg:justify-center',
                )}
                title={c.label}
              >
                <span>{c.icon}</span>
                <span className={cn(collapsed && 'lg:hidden')}>{c.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
