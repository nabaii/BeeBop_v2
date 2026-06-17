/**
 * Client-side JWT inspection — read-only, NO signature verification.
 *
 * We only decode the payload to read `exp` so the client can decide whether a
 * stored token is worth using or already dead. The server still verifies every
 * token for real; this just lets us avoid rendering a logged-in shell on top of
 * an expired session (and lets us refresh proactively instead of after a 401).
 */

interface JwtPayload {
  exp?: number; // seconds since epoch
}

function decodePayload(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    // base64url → base64, then pad to a multiple of 4 for atob.
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
}

/** Expiry as epoch milliseconds, or null when the token has no readable `exp`. */
export function tokenExpiryMs(token: string | null): number | null {
  if (!token) return null;
  const payload = decodePayload(token);
  if (!payload?.exp) return null;
  return payload.exp * 1000;
}

/**
 * True when the token is expired, unreadable, or absent. `skewMs` treats a
 * token that expires within the next N ms as already expired — handy for
 * refreshing slightly early so an in-flight request never races the clock.
 */
export function isExpired(token: string | null, skewMs = 0): boolean {
  const expiry = tokenExpiryMs(token);
  if (expiry === null) return true;
  return Date.now() >= expiry - skewMs;
}
