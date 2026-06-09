'use client';

/**
 * Cloudflare Turnstile widget wrapper.
 *
 * Renders the invisible/managed CAPTCHA on public auth forms and hands the
 * resulting token back via `onToken`. When `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is
 * unset (e.g. local development), it renders nothing and reports readiness so
 * the surrounding form is never blocked — the backend applies the matching
 * "skip when no secret key" policy.
 */

import { useEffect, useRef } from 'react';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const turnstileEnabled = Boolean(SITE_KEY);

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('turnstile script failed')));
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('turnstile script failed')));
    document.head.appendChild(script);
  });
}

interface Props {
  onToken: (token: string | null) => void;
  /**
   * Bump this number to force a fresh challenge. Turnstile tokens are
   * single-use, so callers must reset before re-submitting (e.g. "Resend code").
   */
  resetSignal?: number;
}

export function Turnstile({ onToken, resetSignal = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Re-run the widget when the caller asks for a new token. Skip the initial
  // mount (handled by the render effect below).
  const firstReset = useRef(true);
  useEffect(() => {
    if (firstReset.current) {
      firstReset.current = false;
      return;
    }
    if (widgetIdRef.current && window.turnstile) {
      onToken(null);
      window.turnstile.reset(widgetIdRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          callback: (token) => onToken(token),
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        });
      })
      .catch(() => onToken(null));

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* widget already gone */
        }
      }
    };
    // onToken is stable enough for this one-time render; intentionally run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} className="flex justify-center" />;
}
