'use client';

/**
 * Main page — conversational front door. Sprint 3 builds the visible shell
 * with:
 *   • Left sidebar (categories + New Chat)
 *   • Ask BeeBop input with suggestion pills (stub routed to Rent browse)
 *   • Featured verified-listings carousel
 *
 * Sprint 13 replaces the chat stub with the real conversational pipeline and adds
 * the three-state results window.
 */

import { useState } from 'react';

import { ChatSearchPanel } from '@/components/chat-search';
import { FeaturedCarousel } from '@/components/featured-carousel';
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
    <div className="flex min-h-screen bg-[radial-gradient(circle_at_top,_rgba(219,234,254,0.7),_rgba(248,250,252,1)_42%,_rgba(255,255,255,1)_100%)]">
      <MainSidebar onNewChat={() => void handleNewChat()} />
      <main className="flex-1 overflow-y-auto">
        <header className="flex items-center justify-end gap-3 border-b border-slate-200/70 bg-white/80 px-6 py-3 backdrop-blur">
          <SessionButton />
        </header>
        <div className="mx-auto max-w-5xl space-y-10 p-6 sm:p-10">
          <section className="pt-8 text-center">
            <h1 className="text-3xl font-bold text-slate-900 sm:text-5xl">
              Find a verified home in Abuja.
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-slate-600">
              Describe the area, budget, or amenities you want. BeeBop keeps the conversation session-scoped and can hand the same filters into the full browse pages.
            </p>
            <div className="mt-6">
              <ChatSearchPanel key={chatKey} />
            </div>
          </section>
          <FeaturedCarousel />
        </div>
      </main>
    </div>
  );
}
