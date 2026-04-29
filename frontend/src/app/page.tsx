'use client';

/**
 * Main page — conversational front door. Sprint 3 builds the visible shell
 * with:
 *   • Left sidebar (categories + New Chat)
 *   • Ask BeeBop input with suggestion pills (stub routed to Rent browse)
 *   • Featured verified-listings carousel
 *
 * Sprint 13 replaces the chat stub with the real Claude pipeline and adds
 * the three-state results window.
 */

import { ChatInputStub } from '@/components/chat-input-stub';
import { FeaturedCarousel } from '@/components/featured-carousel';
import { MainSidebar } from '@/components/main-sidebar';
import { SessionButton } from '@/components/session-button';

export default function HomePage() {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <MainSidebar />
      <main className="flex-1 overflow-y-auto">
        <header className="flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-6 py-3">
          <SessionButton />
        </header>
        <div className="mx-auto max-w-5xl space-y-10 p-6 sm:p-10">
          <section className="pt-8 text-center">
            <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              Find a verified home in Abuja.
            </h1>
            <p className="mt-2 text-base text-slate-600">
              Tell BeeBop what you want, or browse by category.
            </p>
            <div className="mt-6">
              <ChatInputStub />
            </div>
          </section>
          <FeaturedCarousel />
        </div>
      </main>
    </div>
  );
}
