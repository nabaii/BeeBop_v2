/**
 * Thin wrappers over the auth endpoints — used by the OTP pages and the
 * session hydrator.
 */

import { api } from './api';
import { useSession, type SessionUser, type UserRole } from '@/stores/session';

export type OtpChannel = 'email' | 'whatsapp';

interface OtpRequestResponse {
  delivered: boolean;
  resend_available_in_seconds: number;
}

interface AuthenticatedUserResponse {
  id: string;
  email: string;
  role: UserRole;
  first_name?: string | null;
  last_name?: string | null;
  onboarding_complete: boolean;
  has_password?: boolean;
}

interface VerifyResponse {
  tokens: { access_token: string; refresh_token: string };
  user: AuthenticatedUserResponse;
  is_new_user: boolean;
}

function toSessionUser(user: AuthenticatedUserResponse): SessionUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.first_name ?? null,
    lastName: user.last_name ?? null,
    onboardingComplete: user.onboarding_complete,
    hasPassword: user.has_password ?? false,
  };
}

function applyVerifyResponse(data: VerifyResponse): { user: SessionUser; isNewUser: boolean } {
  const user = toSessionUser(data.user);
  useSession.getState().setSession({
    user,
    accessToken: data.tokens.access_token,
    refreshToken: data.tokens.refresh_token,
  });
  return { user, isNewUser: data.is_new_user };
}

export async function requestOtp(
  channel: OtpChannel,
  identifier: string,
): Promise<OtpRequestResponse> {
  return api.post('/auth/otp/request', { channel, identifier });
}

export async function verifyOtp(args: {
  channel: OtpChannel;
  identifier: string;
  code: string;
  role_if_new?: UserRole;
}): Promise<{ user: SessionUser; isNewUser: boolean }> {
  const params = args.role_if_new ? `?role_if_new=${args.role_if_new}` : '';
  const data = await api.post<VerifyResponse>(`/auth/otp/verify${params}`, {
    channel: args.channel,
    identifier: args.identifier,
    code: args.code,
  });
  return applyVerifyResponse(data);
}

export async function loginWithPassword(args: {
  email: string;
  password: string;
}): Promise<{ user: SessionUser; isNewUser: boolean }> {
  const data = await api.post<VerifyResponse>('/auth/password/login', {
    email: args.email.trim().toLowerCase(),
    password: args.password,
  });
  return applyVerifyResponse(data);
}

export async function setPassword(args: {
  currentPassword?: string;
  newPassword: string;
}): Promise<SessionUser> {
  const data = await api.post<AuthenticatedUserResponse>(
    '/auth/password',
    {
      current_password: args.currentPassword || undefined,
      new_password: args.newPassword,
    },
    { auth: true },
  );
  const user = toSessionUser(data);
  useSession.getState().setUser(user);
  return user;
}

export type DevRole = 'seeker' | 'landlord' | 'admin';

export async function devLoginAs(role: DevRole = 'landlord'): Promise<{
  user: SessionUser;
  isNewUser: boolean;
}> {
  const data = await api.post<VerifyResponse>('/auth/dev-login', { role });
  return applyVerifyResponse(data);
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout', undefined, { auth: true });
  } finally {
    useSession.getState().clear();
  }
}

export async function fetchMe(): Promise<SessionUser | null> {
  try {
    const data = await api.get<{
      id: string;
      email: string;
      role: UserRole;
      first_name?: string | null;
      last_name?: string | null;
      onboarding_complete: boolean;
      has_password?: boolean;
    }>('/users/me', { auth: true });
    return toSessionUser(data);
  } catch {
    return null;
  }
}
