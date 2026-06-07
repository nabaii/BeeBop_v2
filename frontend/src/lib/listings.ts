/**
 * Typed client for the /listings endpoints. Used by the creation wizard and
 * the landlord dashboard.
 */

import { api } from './api';

export type ListingCategory = 'off_campus' | 'short_let' | 'rent' | 'sales';

export type ListingStatus =
  | 'draft'
  | 'under_doc_review'
  | 'live_unverified'
  | 'doc_verified'
  | 'fully_verified'
  | 'let_agreed'
  | 'sale_agreed'
  | 'suspended'
  | 'delisted';

export interface PhotoView {
  id: string;
  url: string;
  room_label: string | null;
  is_cover: boolean;
  display_order: number;
}

export interface DocumentView {
  id: string;
  filename: string;
  doc_type: string;
  content_type: string;
  size_bytes: number | null;
}

export interface RoomView {
  id: string;
  name: string;
  gender_tag: 'female' | 'male' | 'any';
  beds_total: number;
  beds_available: number;
}

export interface UnitTypeView {
  id: string;
  name: string;
  kind: 'single_room' | 'two_in_a_room' | 'three_in_a_room' | 'self_contain' | 'custom';
  beds_per_room: number;
  total_units: number;
  rooms: RoomView[];
}

export interface ListingView {
  id: string;
  owner_id: string;
  category: ListingCategory;
  status: ListingStatus;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  address_line: string | null;
  district: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  amenities: Record<string, Record<string, { present?: boolean; confirmed?: boolean }> | null>;
  price: number | null;
  type_data: Record<string, unknown>;
  photos: PhotoView[];
  documents: DocumentView[];
  unit_types: UnitTypeView[];
}

// --- CRUD ----------------------------------------------------------------

export async function createListing(category: ListingCategory): Promise<ListingView> {
  return api.post('/listings', { category }, { auth: true });
}

export async function getListing(id: string): Promise<ListingView> {
  return api.get(`/listings/${id}`, { auth: true });
}

export async function listMyListings(): Promise<ListingView[]> {
  return api.get('/listings/mine', { auth: true });
}

export async function updateDraft(
  id: string,
  patch: Partial<Pick<ListingView, 'title' | 'subtitle' | 'description' | 'address_line' | 'district' | 'gps_lat' | 'gps_lng' | 'price'>> & {
    amenities?: ListingView['amenities'];
    type_data?: ListingView['type_data'];
  },
): Promise<ListingView> {
  return api.patch(`/listings/${id}`, patch, { auth: true });
}

export async function submitListing(id: string): Promise<ListingView> {
  return api.post(`/listings/${id}/submit`, undefined, { auth: true });
}

export async function deleteListing(id: string, password?: string): Promise<void> {
  return api.delete(`/listings/${id}`, { body: { password }, auth: true });
}

// --- Amenities vocabulary -----------------------------------------------

export async function getAmenityVocabulary(): Promise<Record<string, string[]>> {
  return api.get('/listings/amenities');
}

// --- Photos --------------------------------------------------------------

export async function getPhotoUploadSignature(listingId: string) {
  return api.post<{
    cloud_name: string;
    api_key: string;
    timestamp: number;
    signature: string;
    folder: string;
  }>(`/listings/${listingId}/photos/signature`, undefined, { auth: true });
}

export async function registerPhoto(
  listingId: string,
  args: { url: string; room_label?: string | null },
): Promise<PhotoView> {
  return api.post(`/listings/${listingId}/photos`, args, { auth: true });
}

export async function updatePhoto(
  listingId: string,
  photoId: string,
  args: { room_label?: string | null; is_cover?: boolean },
): Promise<PhotoView> {
  return api.patch(`/listings/${listingId}/photos/${photoId}`, args, { auth: true });
}

export async function deletePhoto(listingId: string, photoId: string): Promise<void> {
  await api.delete(`/listings/${listingId}/photos/${photoId}`, { auth: true });
}

export async function reorderPhotos(
  listingId: string,
  photoIds: string[],
): Promise<PhotoView[]> {
  return api.post(`/listings/${listingId}/photos/reorder`, { photo_ids: photoIds }, { auth: true });
}

export async function uploadPhotoToCloudinary(
  signature: Awaited<ReturnType<typeof getPhotoUploadSignature>>,
  file: File,
): Promise<{ secure_url: string }> {
  // Dev-stub short-circuit: if the signature comes from our local stub, skip
  // the Cloudinary POST (which would fail) and return an object URL so the
  // browser can preview the image.
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

// --- Documents (private S3) ---------------------------------------------

export async function getDocumentUploadSignature(
  listingId: string,
  args: {
    filename: string;
    content_type: 'application/pdf' | 'image/jpeg' | 'image/png';
    doc_type: 'c_of_o' | 'deed_of_assignment' | 'governors_consent' | 'tenancy_agreement' | 'receipt' | 'other';
    size_bytes?: number;
  },
): Promise<{ url: string; key: string; headers: Record<string, string> }> {
  return api.post(`/listings/${listingId}/documents/signature`, args, { auth: true });
}

export async function uploadDocumentToS3(
  signature: Awaited<ReturnType<typeof getDocumentUploadSignature>>,
  file: File,
): Promise<void> {
  // Dev-stub short-circuit — the presigned URL points at https://stub.local
  // which is unreachable. The register call below succeeds regardless.
  if (signature.url.startsWith('https://stub.local/')) return;
  const res = await fetch(signature.url, {
    method: 'PUT',
    headers: signature.headers,
    body: file,
  });
  if (!res.ok) throw new Error('Document upload failed');
}

export async function registerDocument(
  listingId: string,
  args: {
    s3_key: string;
    filename: string;
    doc_type: string;
    content_type: string;
    size_bytes?: number;
  },
): Promise<DocumentView> {
  return api.post(`/listings/${listingId}/documents`, args, { auth: true });
}

export async function deleteDocument(listingId: string, documentId: string): Promise<void> {
  await api.delete(`/listings/${listingId}/documents/${documentId}`, { auth: true });
}

// --- Student inventory --------------------------------------------------

export async function listUnitTypes(listingId: string): Promise<UnitTypeView[]> {
  return api.get(`/listings/${listingId}/unit-types`, { auth: true });
}

export async function addUnitType(
  listingId: string,
  args: { name: string; kind: UnitTypeView['kind']; beds_per_room: number; total_units: number },
): Promise<UnitTypeView> {
  return api.post(`/listings/${listingId}/unit-types`, args, { auth: true });
}

export async function deleteUnitType(listingId: string, unitTypeId: string): Promise<void> {
  await api.delete(`/listings/${listingId}/unit-types/${unitTypeId}`, { auth: true });
}

export async function addRoom(
  listingId: string,
  unitTypeId: string,
  args: { name: string; gender_tag: 'female' | 'male' | 'any'; beds_total: number },
): Promise<RoomView> {
  return api.post(`/listings/${listingId}/unit-types/${unitTypeId}/rooms`, args, { auth: true });
}

export async function updateRoom(
  listingId: string,
  unitTypeId: string,
  roomId: string,
  args: {
    name?: string;
    gender_tag?: 'female' | 'male' | 'any';
    beds_total?: number;
    beds_available?: number;
  },
): Promise<RoomView> {
  return api.patch(
    `/listings/${listingId}/unit-types/${unitTypeId}/rooms/${roomId}`,
    args,
    { auth: true },
  );
}

// --- Short-let pricing --------------------------------------------------

export async function setShortLetPricing(
  listingId: string,
  args: {
    base_rate: number;
    weekend_rate?: number;
    min_stay_nights: number;
    turnaround_days: number;
    instant_booking: boolean;
  },
): Promise<ListingView> {
  return api.patch(`/listings/${listingId}/short-let-pricing`, args, { auth: true });
}
