/**
 * Inspector PWA API client — JWT injection + 401 refresh + dev-friendly
 * absolute base URL.
 */

import { useSession } from '@/stores/session';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { error?: { code?: string; message?: string } } | unknown,
  ) {
    super(`API error ${status}`);
  }

  get code(): string | undefined {
    const body = this.body as { error?: { code?: string } };
    return body?.error?.code;
  }

  get message(): string {
    const body = this.body as { error?: { message?: string } };
    return body?.error?.message ?? super.message;
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

  const res = await fetch(`${API_URL}${path}`, {
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
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      clear();
      return false;
    }
    const data = (await res.json()) as { access_token: string; refresh_token: string };
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
      const ok = await refreshTokens();
      if (ok) {
        const retry = useSession.getState().accessToken;
        return rawFetch<T>(path, init, retry);
      }
    }
    throw err;
  }
}

export const api = {
  get: <T,>(path: string) => apiFetch<T>(path, { method: 'GET' }),
  post: <T,>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body }),
  patch: <T,>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body }),
  delete: <T,>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
