/** Inspector OTP auth wrappers. Reuses the same backend endpoints as the
 * main app — only the post-login routing differs. */

import { api } from './api';
import { useSession, type InspectorSessionUser } from '@/stores/session';

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
    role: string;
    first_name?: string | null;
    last_name?: string | null;
  };
  is_new_user: boolean;
}

interface ActivationStatus {
  complete: boolean;
  has_profile_photo: boolean;
  nin_verified: boolean;
  conduct_acknowledged: boolean;
}

interface MeResponse {
  id: string;
  email: string;
  role: string;
  first_name?: string | null;
  last_name?: string | null;
  profile_photo_url?: string | null;
  nin_verified: boolean;
}

export async function requestOtp(channel: OtpChannel, identifier: string) {
  return api.post<OtpRequestResponse>('/auth/otp/request', { channel, identifier });
}

export async function verifyOtp(args: {
  channel: OtpChannel;
  identifier: string;
  code: string;
}): Promise<{ user: InspectorSessionUser }> {
  const verify = await api.post<VerifyResponse>('/auth/otp/verify', {
    channel: args.channel,
    identifier: args.identifier,
    code: args.code,
  });

  // Persist tokens before any subsequent calls so they include Authorization.
  useSession.getState().setSession({
    user: {
      id: verify.user.id,
      email: verify.user.email,
      role: verify.user.role,
      firstName: verify.user.first_name ?? null,
      lastName: verify.user.last_name ?? null,
      ninVerified: false,
      conductAcknowledged: false,
      activationComplete: false,
    },
    accessToken: verify.tokens.access_token,
    refreshToken: verify.tokens.refresh_token,
  });

  // Hydrate the richer inspector user (profile photo + activation flags).
  const me = await api.get<MeResponse>('/users/me');
  const status = await api.get<ActivationStatus>('/inspector/activation/status');
  const user: InspectorSessionUser = {
    id: me.id,
    email: me.email,
    role: me.role,
    firstName: me.first_name ?? null,
    lastName: me.last_name ?? null,
    profilePhotoUrl: me.profile_photo_url ?? null,
    ninVerified: Boolean(me.nin_verified),
    conductAcknowledged: status.conduct_acknowledged,
    activationComplete: status.complete,
  };
  useSession.getState().setUser(user);
  return { user };
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } finally {
    useSession.getState().clear();
  }
}

export async function refreshActivationStatus(): Promise<void> {
  const status = await api.get<ActivationStatus>('/inspector/activation/status');
  const me = await api.get<MeResponse>('/users/me');
  const current = useSession.getState().user;
  if (!current) return;
  useSession.getState().setUser({
    ...current,
    profilePhotoUrl: me.profile_photo_url ?? null,
    ninVerified: Boolean(me.nin_verified),
    conductAcknowledged: status.conduct_acknowledged,
    activationComplete: status.complete,
  });
}
