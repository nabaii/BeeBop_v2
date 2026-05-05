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

interface VerifyResponse {
  tokens: { access_token: string; refresh_token: string };
  user: {
    id: string;
    email: string;
    role: UserRole;
    first_name?: string | null;
    last_name?: string | null;
    onboarding_complete: boolean;
  };
  is_new_user: boolean;
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
  const user: SessionUser = {
    id: data.user.id,
    email: data.user.email,
    role: data.user.role,
    firstName: data.user.first_name ?? null,
    lastName: data.user.last_name ?? null,
    onboardingComplete: data.user.onboarding_complete,
  };
  useSession.getState().setSession({
    user,
    accessToken: data.tokens.access_token,
    refreshToken: data.tokens.refresh_token,
  });
  return { user, isNewUser: data.is_new_user };
}

export type DevRole = 'landlord' | 'admin';

export async function devLoginAs(role: DevRole = 'landlord'): Promise<{
  user: SessionUser;
  isNewUser: boolean;
}> {
  const data = await api.post<VerifyResponse>('/auth/dev-login', { role });
  const user: SessionUser = {
    id: data.user.id,
    email: data.user.email,
    role: data.user.role,
    firstName: data.user.first_name ?? null,
    lastName: data.user.last_name ?? null,
    onboardingComplete: data.user.onboarding_complete,
  };
  useSession.getState().setSession({
    user,
    accessToken: data.tokens.access_token,
    refreshToken: data.tokens.refresh_token,
  });
  return { user, isNewUser: data.is_new_user };
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
    }>('/users/me', { auth: true });
    return {
      id: data.id,
      email: data.email,
      role: data.role,
      firstName: data.first_name ?? null,
      lastName: data.last_name ?? null,
      onboardingComplete: data.onboarding_complete,
    };
  } catch {
    return null;
  }
}
