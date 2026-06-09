'use client';

import { useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';

import { BottomNav } from '@/components/bottom-nav';
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar';
import { useSession } from '@/stores/session';

export function DashboardChrome({ children }: { children: ReactNode }) {
  const user = useSession((s) => s.user);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    <div className="flex min-h-screen bg-slate-50 relative overflow-hidden">
      {/* Desktop Sidebar (visible on screens lg and up) */}
      <div className="hidden lg:flex lg:shrink-0">
        <DashboardSidebar />
      </div>

      {/* Mobile Drawer (visible when sidebarOpen is true, on screens < lg) */}
      <div
        className={`fixed inset-0 z-50 flex lg:hidden transition-opacity duration-300 ${
          sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Backdrop overlay */}
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />

        {/* Drawer content sliding from left */}
        <div
          className={`relative flex w-64 max-w-xs flex-1 flex-col bg-white transition-transform duration-300 ease-in-out ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Close button inside drawer */}
          <div className="absolute right-2 top-2 z-10">
            <button
              onClick={() => setSidebarOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 active:bg-slate-200"
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <DashboardSidebar />
        </div>
      </div>

      {/* Main page content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header (visible on screens < lg) */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-50 active:bg-slate-100"
              aria-label="Open sidebar"
            >
              <Menu className="h-6 w-6" />
            </button>
            <span className="text-lg font-bold text-brand">Beebop</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-sm">
              {user?.firstName ? user.firstName[0].toUpperCase() : 'L'}
            </div>
          </div>
        </header>

        {/* Child page contents */}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
