'use client';

/**
 * Ask Beebop input — Sprint 3 visual shell only. The real conversational
 * pipeline (Claude + session context, five-stage parameter extraction)
 * lands in Sprint 13. For now the input routes to the Rent browse page
 * with the query injected as `?q=...` so the demo still feels end-to-end.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const SUGGESTIONS = [
  'a 2-bed in Wuse 2 under 4m',
  'Gwarinpa short-let for next weekend',
  'Self-contain near UniAbuja',
  '3-bed for sale in Lekki',
];

export function ChatInputStub() {
  const router = useRouter();
  const [value, setValue] = useState('');

  function go(q: string) {
    const query = q.trim();
    if (!query) return;
    router.push(`/browse/rent?q=${encodeURIComponent(query)}`);
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(value);
        }}
        className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask Beebop — e.g. a 2-bed in Wuse 2 under 4m"
          className="flex-1 bg-transparent px-3 py-2 text-sm focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={!value.trim()}
        >
          Ask
        </button>
      </form>
      <ul className="mt-3 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => {
                setValue(s);
                go(s);
              }}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
