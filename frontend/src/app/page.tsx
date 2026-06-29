'use client';

import { UserRound } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { BeebopMark } from '@/components/brand/beebop-logo';
import { BottomNav } from '@/components/bottom-nav';
import { ChatSearchPanel } from '@/components/chat-search';
import { MainSidebar } from '@/components/main-sidebar';
import { clearChatSession } from '@/lib/ai-search';
import { accountRoute } from '@/lib/navigation';
import { useSearch } from '@/stores/search';
import { useSession } from '@/stores/session';

export default function HomePage() {
  const sessionId = useSearch((state) => state.sessionId);
  const clearSession = useSearch((state) => state.clearSession);
  const role = useSession((state) => state.user?.role);
  const [chatKey, setChatKey] = useState(0);
  const accountHref = accountRoute(role);

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
      <MainSidebar onNewChat={() => void handleNewChat()} />
      <div className="mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col bg-slate-50 shadow-xl">
        <header className="relative flex h-16 shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4">
          {/* Triad mark stays anchored top-left; the wordmark is centered. */}
          <BeebopMark size={28} />
          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-display text-hero font-semibold leading-none lowercase tracking-tight text-ink">
            beebop
          </span>
          <Link
            href={accountHref}
            aria-label="Open account area"
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
