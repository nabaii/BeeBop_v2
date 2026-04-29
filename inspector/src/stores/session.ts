/**
 * Inspector PWA session store. Mirrors the main app session shape for
 * consistency, but the inspector-side localStorage key is namespaced so
 * a shared device with both apps doesn't cross-leak tokens.
 */

import { create } from 'zustand';

export interface InspectorSessionUser {
  id: string;
  email: string;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
  profilePhotoUrl?: string | null;
  ninVerified: boolean;
  conductAcknowledged: boolean;
  activationComplete: boolean;
}

interface SessionState {
  user: InspectorSessionUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  hydrated: boolean;
  setSession: (args: {
    user: InspectorSessionUser;
    accessToken: string;
    refreshToken: string;
  }) => void;
  setUser: (user: InspectorSessionUser) => void;
  setTokens: (args: { accessToken: string; refreshToken: string }) => void;
  clear: () => void;
  hydrate: () => void;
}

const STORAGE_KEY = 'beebop.inspector.session';

function readPersisted():
  | Pick<SessionState, 'user' | 'accessToken' | 'refreshToken'>
  | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ReturnType<typeof readPersisted>;
  } catch {
    return null;
  }
}

function writePersisted(
  value: Pick<SessionState, 'user' | 'accessToken' | 'refreshToken'>,
): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function clearPersisted(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

type SetState = (
  partial:
    | SessionState
    | Partial<SessionState>
    | ((s: SessionState) => SessionState | Partial<SessionState>),
) => void;
type GetState = () => SessionState;

export const useSession = create<SessionState>(
  (set: SetState, _get: GetState): SessionState => ({
    user: null,
    accessToken: null,
    refreshToken: null,
    hydrated: false,
    setSession: ({ user, accessToken, refreshToken }) => {
      writePersisted({ user, accessToken, refreshToken });
      set({ user, accessToken, refreshToken });
    },
    setUser: (user) => {
      set((s: SessionState) => {
        writePersisted({
          user,
          accessToken: s.accessToken,
          refreshToken: s.refreshToken,
        });
        return { ...s, user };
      });
    },
    setTokens: ({ accessToken, refreshToken }) => {
      set((s: SessionState) => {
        writePersisted({ user: s.user, accessToken, refreshToken });
        return { accessToken, refreshToken };
      });
    },
    clear: () => {
      clearPersisted();
      set({ user: null, accessToken: null, refreshToken: null });
    },
    hydrate: () => {
      const persisted = readPersisted();
      if (persisted) set({ ...persisted, hydrated: true });
      else set({ hydrated: true });
    },
  }),
);
