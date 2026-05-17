'use client';

import { Menu, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { BottomNav } from '@/components/bottom-nav';
import { ChatSearchPanel } from '@/components/chat-search';
import { MainSidebar } from '@/components/main-sidebar';
import { clearChatSession } from '@/lib/ai-search';
import { useSearch } from '@/stores/search';

export default function HomePage() {
  const sessionId = useSearch((state) => state.sessionId);
  const clearSession = useSearch((state) => state.clearSession);
  const [chatKey, setChatKey] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function handleNewChat(): Promise<void> {
    const activeSessionId = sessionId;
    clearSession();
    setChatKey((value) => value + 1);
    if (!activeSessionId) return;
    try {
      await clearChatSession(activeSessionId);
    } catch {
      // Local reset matters more than remote cleanup when the user wants a fresh chat.
    }
  }

  return (
    <div className="flex min-h-[100dvh] bg-slate-100">
      <MainSidebar
        onNewChat={() => void handleNewChat()}
        mobileOpen={drawerOpen}
        onMobileClose={() => setDrawerOpen(false)}
      />
      <div className="mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col bg-slate-50 shadow-xl">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
            <BeeBopMark />
            <span className="text-lg font-bold text-brand-700">BeeBop</span>
          </div>
          <Link
            href="/dashboard/seeker"
            aria-label="Open profile"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
          >
            <UserRound className="h-5 w-5" aria-hidden />
          </Link>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">
          <ChatSearchPanel key={chatKey} />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}

function BeeBopMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
      <circle cx="6" cy="9" r="3" fill="#f59e0b" />
      <circle cx="14" cy="6" r="3" fill="#f59e0b" />
      <circle cx="10" cy="15" r="3" fill="#fbbf24" />
    </svg>
  );
}
