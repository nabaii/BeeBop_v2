'use client';

import { Compass, MessageSquare, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';

const TABS = [
  { href: '/', label: 'Chat', icon: MessageSquare, match: (p: string) => p === '/' },
  {
    href: '/browse',
    label: 'Explore',
    icon: Compass,
    match: (p: string) => p.startsWith('/browse'),
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: User,
    match: (p: string) => p.startsWith('/profile') || p.startsWith('/dashboard'),
  },
] as const;

export function BottomNav() {
  const pathname = usePathname() ?? '/';

  return (
    <nav className="bg-white px-5 pb-4 pt-1">
      <ul className="grid grid-cols-3 gap-1 rounded-[28px] bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,0.13)]">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.match(pathname);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={cn(
                  'flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-2xl px-2 text-[10px] font-semibold uppercase leading-none tracking-wide transition-colors',
                  active
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-400 hover:text-slate-600',
                )}
              >
                <Icon
                  className={cn('h-5 w-5', active ? 'text-brand-600' : 'text-slate-400')}
                  aria-hidden
                />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
