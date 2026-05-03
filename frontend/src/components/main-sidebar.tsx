'use client';

/**
 * Left sidebar on the main page. Sprint 3 scope:
 *   • New Chat (resets the session — fully wired in Sprint 13)
 *   • Category links (Off-campus, Short-let, Rent, For Sale)
 *   • No Chats history section (sessions expire on inactivity — §10.4)
 *   • Collapses to icon-only rail
 */

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

export function MainSidebar({ onNewChat }: { onNewChat?: () => void }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col border-r border-slate-200 bg-white transition-all lg:flex',
        collapsed ? 'w-[56px]' : 'w-[240px]',
      )}
    >
      <div className="flex items-center justify-between p-3">
        {!collapsed && (
          <Link href="/" className="text-lg font-bold text-brand">
            BeeBop
          </Link>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>
      <div className="px-2">
        <button
          type="button"
          onClick={onNewChat}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50',
            collapsed && 'justify-center',
          )}
          title="New chat"
        >
          <span>✎</span>
          {!collapsed && <span>New chat</span>}
        </button>
      </div>
      <nav className="mt-3 flex-1 space-y-0.5 px-2">
        {CATEGORIES.map((c) => {
          const active = pathname?.startsWith(c.href);
          return (
            <Link
              key={c.href}
              href={c.href}
              className={cn(
                'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
                active ? 'bg-brand/10 text-brand' : 'text-slate-700 hover:bg-slate-100',
                collapsed && 'justify-center',
              )}
              title={c.label}
            >
              <span>{c.icon}</span>
              {!collapsed && <span>{c.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
