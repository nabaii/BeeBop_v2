'use client';

import { UserRound } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode } from 'react';

import { BeebopLockup } from '@/components/brand/beebop-logo';
import { BottomNav } from '@/components/bottom-nav';
import { MainSidebar } from '@/components/main-sidebar';
import { RouteGuard } from '@/components/route-guard';

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return (
    <RouteGuard roles={['seeker', 'landlord', 'agent']}>
      <div className="flex min-h-[100dvh] bg-slate-100">
        <MainSidebar />
        <div className="mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col bg-slate-50 shadow-xl">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4">
            <BeebopLockup />
            <Link
              href="/profile"
              aria-label="Profile"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
            >
              <UserRound className="h-5 w-5" aria-hidden />
            </Link>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
          <BottomNav />
        </div>
      </div>
    </RouteGuard>
  );
}
