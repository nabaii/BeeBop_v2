'use client';

import { useState } from 'react';

import { BottomNav } from '@/components/bottom-nav';
import { ChatSearchPanel } from '@/components/chat-search';
import { MainSidebar } from '@/components/main-sidebar';
import { SessionButton } from '@/components/session-button';
import { clearChatSession } from '@/lib/ai-search';
import { useSearch } from '@/stores/search';

export default function HomePage() {
  const sessionId = useSearch((state) => state.sessionId);
  const clearSession = useSearch((state) => state.clearSession);
  const [chatKey, setChatKey] = useState(0);

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
    <div className="flex min-h-screen bg-slate-100">
      <MainSidebar onNewChat={() => void handleNewChat()} />
      <div className="mx-auto flex h-screen w-full max-w-[440px] flex-col bg-slate-50 shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <BeeBopMark />
            <span className="text-lg font-bold text-slate-900">BeeBop</span>
          </div>
          <SessionButton />
        </header>
        <main className="flex-1 overflow-hidden">
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
