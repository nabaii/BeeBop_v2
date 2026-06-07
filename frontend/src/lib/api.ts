/**
 * API client — typed fetch wrapper with JWT injection and auto-refresh.
 *
 * The access token is read live from the session store. On 401 we attempt a
 * single refresh and retry the original request. Refresh failures clear the
 * session and surface the error to the caller.
 */

import { useSession } from '@/stores/session';

const CONFIGURED_API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');

function apiUrl(path: string): string {
  if (!CONFIGURED_API_URL) {
    if (process.env.NODE_ENV === 'development') return `http://localhost:8000${path}`;
    return `/api/backend${path}`;
  }
  if (typeof window !== 'undefined' && CONFIGURED_API_URL === window.location.origin) {
    return `/api/backend${path}`;
  }
  return `${CONFIGURED_API_URL}${path}`;
}

export class ApiError extends Error {
  status: number;
  body: { error?: { code?: string; message?: string } } | unknown;

  constructor(
    status: number,
    body: { error?: { code?: string; message?: string } } | unknown,
  ) {
    // Derive the message in the constructor and pass it to `super`. A `message`
    // getter would NOT work here: Error's constructor sets an own `message`
    // property on the instance, and an own data property always shadows a
    // prototype accessor — so the getter would be dead code and callers would
    // only ever see "API error <status>".
    super(ApiError.extractMessage(status, body));
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  /** Pull the human-readable reason from our domain-error shape
   * (`{error:{message}}`) or FastAPI's request-validation shape (`{detail}`),
   * falling back to the bare status. */
  private static extractMessage(status: number, body: unknown): string {
    const b = body as {
      error?: { message?: string };
      detail?: string | { msg?: string }[];
    };
    if (b?.error?.message) return b.error.message;
    if (typeof b?.detail === 'string') return b.detail;
    if (Array.isArray(b?.detail)) {
      const msgs = b.detail.map((d) => d?.msg).filter(Boolean);
      if (msgs.length) return msgs.join('; ');
    }
    return `API error ${status}`;
  }

  get code(): string | undefined {
    const body = this.body as { error?: { code?: string } };
    return body?.error?.code;
  }
}

type FetchInit = Omit<RequestInit, 'body'> & { body?: unknown };

async function rawFetch<T>(
  path: string,
  init: FetchInit,
  accessToken: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(apiUrl(path), {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'include',
  });

  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, payload);
  return payload as T;
}

async function refreshTokens(): Promise<boolean> {
  const { refreshToken, setSession, clear } = useSession.getState();
  if (!refreshToken) return false;
  try {
    const res = await fetch(apiUrl('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      clear();
      return false;
    }
    const data = (await res.json()) as { access_token: string; refresh_token: string };
    // Preserve the existing user object — /users/me is not called here.
    const current = useSession.getState().user;
    if (!current) {
      clear();
      return false;
    }
    setSession({
      user: current,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    });
    return true;
  } catch {
    useSession.getState().clear();
    return false;
  }
}

export async function apiFetch<T>(path: string, init: FetchInit = {}): Promise<T> {
  const { accessToken } = useSession.getState();
  try {
    return await rawFetch<T>(path, init, accessToken);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && accessToken) {
      const refreshed = await refreshTokens();
      if (refreshed) {
        const retryToken = useSession.getState().accessToken;
        return rawFetch<T>(path, init, retryToken);
      }
    }
    throw err;
  }
}

export async function checkHealth(): Promise<{ status: string }> {
  return apiFetch('/health');
}

/**
 * Convenience wrapper with per-method helpers. The `auth` flag is accepted
 * but currently a no-op — the access token is always attached when present
 * in the session store. It's kept in the signature so call sites make
 * authentication-intent explicit (grep-friendly) and to reserve space for a
 * future hard-guard ("this endpoint must not send credentials").
 */
export const api = {
  get<T>(path: string, opts?: { auth?: boolean }): Promise<T> {
    void opts;
    return apiFetch<T>(path, { method: 'GET' });
  },
  post<T>(path: string, body?: unknown, opts?: { auth?: boolean }): Promise<T> {
    void opts;
    return apiFetch<T>(path, { method: 'POST', body });
  },
  patch<T>(path: string, body?: unknown, opts?: { auth?: boolean }): Promise<T> {
    void opts;
    return apiFetch<T>(path, { method: 'PATCH', body });
  },
  delete<T>(path: string, opts?: { body?: unknown; auth?: boolean }): Promise<T> {
    void opts;
    return apiFetch<T>(path, { method: 'DELETE', body: opts?.body });
  },
};
