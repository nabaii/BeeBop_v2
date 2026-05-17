'use client';

import type { ReactNode } from 'react';

import { BottomNav } from '@/components/bottom-nav';
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar';
import { useSession } from '@/stores/session';

export function DashboardChrome({ children }: { children: ReactNode }) {
  const user = useSession((s) => s.user);
  const seeker = user?.role === 'seeker';

  if (seeker) {
    return (
      <div className="flex min-h-[100dvh] bg-slate-50">
        <div className="hidden lg:flex">
          <DashboardSidebar />
        </div>
        <div className="flex min-h-[100dvh] flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          <div className="lg:hidden">
            <BottomNav />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <DashboardSidebar />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
