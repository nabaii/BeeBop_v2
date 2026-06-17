'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Tracks the user's `prefers-reduced-motion` setting. CSS paths handle this via
 * Tailwind's `motion-safe:` variant; this hook is for JS-driven motion (typed
 * streaming, cycling placeholders) that CSS can't express. Returns `true` when
 * motion should be suppressed.
 */
export function useReducedMotion(): boolean {
  // Default to reduced so SSR / first paint never animates before we know.
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Rotates through example prompts to use as an input placeholder. Holds steady
 * (first example) when motion is reduced, the input is focused, or the user has
 * typed something — we never swap copy out from under an active typist.
 */
export function useCyclingPlaceholder(
  examples: string[],
  { paused = false, intervalMs = 3200 }: { paused?: boolean; intervalMs?: number } = {},
): string {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const stopped = reduced || paused || examples.length <= 1;

  useEffect(() => {
    if (stopped) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % examples.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [stopped, intervalMs, examples.length]);

  return examples[stopped ? 0 : index] ?? '';
}

/**
 * Reveals `text` word-by-word so a bot reply reads as if it's being composed.
 * Falls back to the full string instantly under reduced motion. Re-streams only
 * when the text itself changes.
 */
export function useStreamedText(text: string, { wordMs = 55 }: { wordMs?: number } = {}): string {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(0);
  const words = useRef<string[]>([]);

  useEffect(() => {
    words.current = text.split(/(\s+)/); // keep whitespace tokens for spacing
    if (reduced) {
      setCount(words.current.length);
      return;
    }
    setCount(0);
    const id = window.setInterval(() => {
      setCount((current) => {
        if (current >= words.current.length) {
          window.clearInterval(id);
          return current;
        }
        return current + 1;
      });
    }, wordMs);
    return () => window.clearInterval(id);
  }, [text, reduced, wordMs]);

  return words.current.slice(0, count).join('');
}
