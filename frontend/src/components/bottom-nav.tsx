'use client';

import { Compass, MessageSquare, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';

const TABS = [
  { href: '/', label: 'Chat', icon: MessageSquare, match: (p: string) => p === '/' },
  {
    href: '/browse/rent',
    label: 'Explore',
    icon: Compass,
    match: (p: string) => p.startsWith('/browse'),
  },
  {
    href: '/dashboard/seeker',
    label: 'Profile',
    icon: User,
    match: (p: string) => p.startsWith('/dashboard'),
  },
] as const;

export function BottomNav() {
  const pathname = usePathname() ?? '/';

  return (
    <nav className="border-t border-slate-200 bg-white">
      <ul className="flex items-stretch justify-around px-2 py-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.match(pathname);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-semibold tracking-wide uppercase transition-colors',
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
