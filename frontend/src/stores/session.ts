/**
 * Session state — JWT tokens, current user, role.
 *
 * Persists tokens to localStorage so a hard reload keeps the user signed in.
 * The Zustand `persist` middleware is avoided here — we want manual control
 * over which keys hit storage and how we rehydrate on the client only
 * (Next.js SSR must not read localStorage).
 */
import { create } from 'zustand';

export type UserRole =
  | 'seeker'
  | 'landlord'
  | 'agent'
  | 'inspector'
  | 'trusted_agent'
  | 'admin';

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  firstName?: string | null;
  lastName?: string | null;
  onboardingComplete: boolean;
}

interface SessionState {
  user: SessionUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  hydrated: boolean;
  setSession: (args: {
    user: SessionUser;
    accessToken: string;
    refreshToken: string;
  }) => void;
  setUser: (user: SessionUser) => void;
  setTokens: (args: { accessToken: string; refreshToken: string }) => void;
  clear: () => void;
  hydrate: () => void;
}

const STORAGE_KEY = 'beebop.session';

function readPersisted(): Pick<
  SessionState,
  'user' | 'accessToken' | 'refreshToken'
> | null {
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
  partial: SessionState | Partial<SessionState> | ((s: SessionState) => SessionState | Partial<SessionState>),
) => void;

type GetState = () => SessionState;

export const useSession = create<SessionState>(
  (set: SetState, _get: GetState): SessionState => ({
    user: null,
    accessToken: null,
    refreshToken: null,
    hydrated: false,
    setSession: ({
      user,
      accessToken,
      refreshToken,
    }: {
      user: SessionUser;
      accessToken: string;
      refreshToken: string;
    }) => {
      writePersisted({ user, accessToken, refreshToken });
      set({ user, accessToken, refreshToken });
    },
    setUser: (user: SessionUser) => {
      set((s: SessionState) => {
        writePersisted({ user, accessToken: s.accessToken, refreshToken: s.refreshToken });
        return { ...s, user };
      });
    },
    setTokens: ({ accessToken, refreshToken }: { accessToken: string; refreshToken: string }) => {
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
      if (persisted) {
        set({ ...persisted, hydrated: true });
      } else {
        set({ hydrated: true });
      }
    },
  }),
);
