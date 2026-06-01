/**
 * Typed wrappers over the /users endpoints — onboarding steps, verification,
 * profile edits.
 */

import { api } from './api';
import { useSession, type SessionUser } from '@/stores/session';

export type ListingCategory = 'off_campus' | 'short_let' | 'rent' | 'sales';

export interface UserView {
  id: string;
  email: string;
  role: SessionUser['role'];
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  has_password?: boolean;
  account_type?: 'individual' | 'agency' | null;
  nin_verified: boolean;
  nin_document_url?: string | null;
  nin_document_uploaded_at?: string | null;
  nin_review_note?: string | null;
  cac_verified: boolean;
  business_name?: string | null;
  cac_number?: string | null;
  profile_photo_url?: string | null;
  bio?: string | null;
  operating_area?: string | null;
  category_preferences?: ListingCategory[] | null;
  institution?: string | null;
  academic_level?: string | null;
  gender?: 'female' | 'male' | 'any' | null;
  onboarding_complete: boolean;
}

function applyToSession(u: UserView): SessionUser {
  const session: SessionUser = {
    id: u.id,
    email: u.email,
    role: u.role,
    firstName: u.first_name ?? null,
    lastName: u.last_name ?? null,
    onboardingComplete: u.onboarding_complete,
    hasPassword: u.has_password ?? false,
  };
  useSession.getState().setUser(session);
  return session;
}

export async function getMe(): Promise<UserView> {
  const u = await api.get<UserView>('/users/me', { auth: true });
  applyToSession(u);
  return u;
}

export async function saveIdentity(args: {
  first_name: string;
  last_name: string;
  email?: string;
}): Promise<UserView> {
  const u = await api.patch<UserView>('/users/me/identity', args, { auth: true });
  applyToSession(u);
  return u;
}

export async function saveSeekerCategories(categories: ListingCategory[]): Promise<UserView> {
  const u = await api.patch<UserView>('/users/me/seeker-categories', { categories }, { auth: true });
  applyToSession(u);
  return u;
}

export async function saveStudentExtras(args: {
  institution: string;
  academic_level: string;
  gender: 'female' | 'male';
}): Promise<UserView> {
  const u = await api.patch<UserView>('/users/me/student-extras', args, { auth: true });
  applyToSession(u);
  return u;
}

export async function becomeLandlord(): Promise<UserView> {
  const u = await api.post<UserView>('/users/me/become-landlord', undefined, { auth: true });
  applyToSession(u);
  return u;
}

export async function saveAccountType(account_type: 'individual' | 'agency'): Promise<UserView> {
  const u = await api.patch<UserView>('/users/me/account-type', { account_type }, { auth: true });
  applyToSession(u);
  return u;
}

export async function verifyNin(nin: string): Promise<{ verified: boolean; admin_review: boolean }> {
  return api.post('/users/me/verify-nin', { nin }, { auth: true });
}

export async function verifyCac(args: {
  cac_number: string;
  business_name: string;
  agency_areas?: string[];
}): Promise<{ verified: boolean; pending: boolean }> {
  return api.post('/users/me/verify-cac', args, { auth: true });
}

export async function saveProfile(args: {
  profile_photo_url?: string;
  bio?: string;
  operating_area?: string;
  agency_logo_url?: string;
}): Promise<UserView> {
  const u = await api.patch<UserView>('/users/me/profile', args, { auth: true });
  applyToSession(u);
  return u;
}

export async function getPhotoUploadSignature(): Promise<{
  cloud_name: string;
  api_key: string;
  timestamp: number;
  signature: string;
  folder: string;
}> {
  return api.post('/users/me/photo-upload', undefined, { auth: true });
}

export interface CloudinarySignature {
  cloud_name: string;
  api_key: string;
  timestamp: number;
  signature: string;
  folder: string;
}

export async function getNinDocumentUploadSignature(): Promise<CloudinarySignature> {
  return api.post('/users/me/nin-document/signature', undefined, { auth: true });
}

export async function uploadFileToCloudinary(
  signature: CloudinarySignature,
  file: File,
): Promise<{ secure_url: string }> {
  // Mirrors uploadPhotoToCloudinary in lib/listings — kept distinct so the
  // user-side imports do not depend on listings.
  if (signature.cloud_name === 'stub') {
    return { secure_url: URL.createObjectURL(file) };
  }
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signature.api_key);
  form.append('timestamp', String(signature.timestamp));
  form.append('signature', signature.signature);
  form.append('folder', signature.folder);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${signature.cloud_name}/image/upload`,
    { method: 'POST', body: form },
  );
  if (!res.ok) throw new Error('Cloudinary upload failed');
  return res.json() as Promise<{ secure_url: string }>;
}

export async function registerNinDocument(
  url: string,
): Promise<{ nin_document_url: string; nin_document_uploaded_at: string }> {
  return api.post('/users/me/nin-document', { url }, { auth: true });
}
