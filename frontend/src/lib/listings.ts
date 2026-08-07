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

export type MediaKind = 'image' | 'video';

export interface PhotoView {
  id: string;
  url: string;
  /**
   * Which element renders this asset. Optional, and absent means image — the
   * same default the column carries server-side. Several call sites build a
   * PhotoView from a search result or a fixture where video is not a
   * possibility, and shouldn't have to say so.
   */
  media_kind?: MediaKind;
  /** Video only — still frame shown before playback. */
  poster_url?: string | null;
  /** Video only — clip length, used for the duration badge. */
  duration_seconds?: number | null;
  room_label: string | null;
  is_cover: boolean;
  display_order: number;
  /** Owning unit type for an off-campus room gallery; null = property gallery. */
  unit_type_id: string | null;
}

// Mirrors the caps in app/listings/service.py. Checked here so a landlord
// learns the file is too big before spending their data on the upload — the
// server re-checks at register time, which is what actually enforces them.
export const MAX_VIDEO_DURATION_SECONDS = 90;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEOS_PER_PROPERTY_GALLERY = 3;
export const MAX_VIDEOS_PER_UNIT_GALLERY = 1;
export const ACCEPTED_VIDEO_TYPES = 'video/mp4,video/quicktime';

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
  beds_total: number;
  beds_available: number;
}

export interface UnitTypeView {
  id: string;
  name: string;
  kind: 'single_room' | 'two_in_a_room' | 'three_in_a_room' | 'self_contain' | 'custom';
  beds_per_room: number;
  total_units: number;
  price: number;
  price_period: 'year' | 'semester';
  gender_tag: 'female' | 'male' | 'any';
  amenities: string[];
  rooms: RoomView[];
  /** This unit type's own gallery, ordered by display_order. */
  photos: PhotoView[];
  /** This unit type's room tour — at most one. Absent on older responses. */
  videos?: PhotoView[];
}

/** Human label for a unit-type billing period, e.g. "year" / "semester". */
export function pricePeriodLabel(period?: string | null): string {
  // 'session' is the legacy value for what we now call a semester — map it
  // through so historic units still render with a label.
  if (period === 'semester' || period === 'session') return 'semester';
  if (period === 'year') return 'year';
  return '';
}

/** Semesters in an academic year. Matches the backend's calendar-semester
 *  window (Jan–Jun / Jul–Dec) in `app/referrals/service.py::_semester_bounds`. */
export const SEMESTERS_PER_YEAR = 2;

/**
 * Annual-equivalent cost of a unit, for *comparison only* — sorting cheapest
 * first is a lie when one unit bills per semester and another per year at the
 * same figure. Never render this as the headline price: seekers are invoiced
 * the landlord's actual `price`, and it is what they must recognise.
 */
export function annualEquivalent(price: number, period?: string | null): number {
  return pricePeriodLabel(period) === 'semester' ? price * SEMESTERS_PER_YEAR : price;
}

// Seeker-facing names for unit kinds. The raw enum is schema language, and
// CSS `capitalize` on it produces junk like "Bed(S)/Room" — humanise here so
// there is one wording and the markup stays free of text transforms.
const UNIT_KIND_LABELS: Record<UnitTypeView['kind'], string> = {
  single_room: 'Single room',
  two_in_a_room: 'Shared by 2',
  three_in_a_room: 'Shared by 3',
  self_contain: 'Self-contain',
  custom: 'Room',
};

// `kind` is a union in the editor payload but a bare string over the public
// API, so this takes the loose type and falls back on anything unrecognised —
// a kind added server-side must never render as a raw enum to a seeker.
export function unitKindLabel(kind: string, bedsPerRoom?: number): string {
  const known = UNIT_KIND_LABELS[kind as UnitTypeView['kind']];
  if (known && kind !== 'custom') return known;
  if (bedsPerRoom && bedsPerRoom > 1) return `Shared by ${bedsPerRoom}`;
  return known ?? 'Room';
}

/** Unit display name, falling back to the humanised kind — seed and
 *  landlord-entered names are sometimes blank or a single stray character. */
export function unitDisplayName(unit: {
  name: string;
  kind: string;
  beds_per_room: number;
}): string {
  const name = unit.name?.trim();
  if (!name || name.length < 2) return unitKindLabel(unit.kind, unit.beds_per_room);
  return name;
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
  amenities: Record<
    string,
    Record<string, { present?: boolean; confirmed?: boolean; featured?: boolean }> | null
  >;
  price: number | null;
  type_data: Record<string, unknown>;
  photos: PhotoView[];
  /** Property-gallery video tours, managed as their own group. */
  videos?: PhotoView[];
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

// Photos live in one of two galleries: the property gallery (no unit type) or
// an off-campus unit type's own gallery. Pass `unitTypeId` to target the
// latter — cover and ordering are scoped per gallery on the server.
export async function getPhotoUploadSignature(listingId: string, unitTypeId?: string | null) {
  const query = unitTypeId ? `?unit_type_id=${encodeURIComponent(unitTypeId)}` : '';
  return api.post<{
    cloud_name: string;
    api_key: string;
    timestamp: number;
    signature: string;
    folder: string;
  }>(`/listings/${listingId}/photos/signature${query}`, undefined, { auth: true });
}

export async function registerPhoto(
  listingId: string,
  args: {
    url: string;
    room_label?: string | null;
    unit_type_id?: string | null;
    media_kind?: MediaKind;
    // Echoed from the Cloudinary response for videos. The server re-validates
    // all of it before writing the row.
    provider_public_id?: string | null;
    poster_url?: string | null;
    duration_seconds?: number | null;
    size_bytes?: number | null;
    video_format?: string | null;
  },
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
  unitTypeId?: string | null,
  mediaKind: MediaKind = 'image',
): Promise<PhotoView[]> {
  return api.post(
    `/listings/${listingId}/photos/reorder`,
    { photo_ids: photoIds, unit_type_id: unitTypeId ?? null, media_kind: mediaKind },
    { auth: true },
  );
}

type CloudinarySignature = Awaited<ReturnType<typeof getPhotoUploadSignature>>;

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id?: string;
  /** Video only, in seconds — fractional, so round before sending. */
  duration?: number;
  bytes?: number;
  format?: string;
}

/**
 * POST one file to Cloudinary, reporting upload progress.
 *
 * XHR rather than fetch(): fetch cannot report request-body progress, and a
 * 90-second phone video behind an indeterminate spinner is a landlord who
 * force-quits at what they assume is a hang.
 */
function cloudinaryUpload(
  signature: CloudinarySignature,
  file: File,
  resourceType: 'image' | 'video' | 'auto',
  onProgress?: (percent: number) => void,
): Promise<CloudinaryUploadResult> {
  // Dev-stub short-circuit: if the signature comes from our local stub, skip
  // the Cloudinary POST (which would fail) and return an object URL so the
  // browser can preview the file.
  if (signature.cloud_name === 'stub') {
    onProgress?.(100);
    return Promise.resolve({ secure_url: URL.createObjectURL(file) });
  }

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signature.api_key);
  form.append('timestamp', String(signature.timestamp));
  form.append('signature', signature.signature);
  form.append('folder', signature.folder);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      'POST',
      `https://api.cloudinary.com/v1_1/${signature.cloud_name}/${resourceType}/upload`,
    );

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as CloudinaryUploadResult);
        } catch {
          reject(new Error('Cloudinary returned a response we could not read.'));
        }
        return;
      }
      // Surface the real reason (e.g. "Invalid Signature", "File size too
      // large") rather than a bare status code.
      let detail = `HTTP ${xhr.status}`;
      try {
        const body = JSON.parse(xhr.responseText) as { error?: { message?: string } };
        if (body?.error?.message) detail = body.error.message;
      } catch {
        /* body wasn't JSON — keep the status code */
      }
      reject(new Error(`Cloudinary upload rejected: ${detail}`));
    };

    xhr.onerror = () =>
      reject(new Error('Upload failed — check your connection and try again.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));

    xhr.send(form);
  });
}

export async function uploadPhotoToCloudinary(
  signature: CloudinarySignature,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<CloudinaryUploadResult> {
  return cloudinaryUpload(signature, file, 'image', onProgress);
}

export async function uploadVideoToCloudinary(
  signature: CloudinarySignature,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<CloudinaryUploadResult> {
  return cloudinaryUpload(signature, file, 'video', onProgress);
}

/**
 * Read a local video's duration without uploading it.
 *
 * Lets us reject an over-length clip before spending the landlord's data on
 * it. Resolves null when the browser can't read the metadata — the caller then
 * uploads and lets the server be the judge, rather than blocking on a check
 * that isn't working.
 */
export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () =>
      done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

/**
 * Derive a poster frame URL from a Cloudinary video URL.
 *
 * Cloudinary serves any frame of a video as an image by swapping the
 * extension; `so_0` pins it to the first frame. Returns null for anything that
 * isn't a recognisable Cloudinary delivery URL (the dev stub's blob: URLs, for
 * one) so callers fall back to a placeholder rather than a broken image.
 */
export function videoPosterUrl(secureUrl: string): string | null {
  if (!secureUrl.includes('/upload/')) return null;
  const withFrame = secureUrl.replace('/upload/', '/upload/so_0/');
  const lastDot = withFrame.lastIndexOf('.');
  if (lastDot <= withFrame.lastIndexOf('/')) return null;
  return `${withFrame.slice(0, lastDot)}.jpg`;
}

// `formatDuration` lives in lib/format — the public gallery needs it too, and
// shouldn't pull this landlord-side module into its bundle to get it.
export { formatDuration } from './format';

// Upload a non-image file (e.g. a house-rules PDF) to Cloudinary. Reuses the
// per-listing photo signature (it signs only folder + timestamp, so it is valid
// for any resource type) and posts to the `auto` endpoint, which detects PDFs
// and returns a publicly-viewable secure_url — unlike the private-S3 title-doc
// pipeline, this file is meant to be shown to seekers.
export async function uploadRawToCloudinary(
  signature: CloudinarySignature,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<CloudinaryUploadResult> {
  return cloudinaryUpload(signature, file, 'auto', onProgress);
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
  args: {
    name: string;
    kind: UnitTypeView['kind'];
    beds_per_room: number;
    total_units: number;
    price: number;
    price_period: 'year' | 'semester';
    gender_tag: 'female' | 'male' | 'any';
    amenities?: string[];
  },
): Promise<UnitTypeView> {
  return api.post(`/listings/${listingId}/unit-types`, args, { auth: true });
}

export async function deleteUnitType(listingId: string, unitTypeId: string): Promise<void> {
  await api.delete(`/listings/${listingId}/unit-types/${unitTypeId}`, { auth: true });
}

export async function addRoom(
  listingId: string,
  unitTypeId: string,
  args: { name: string; beds_total: number },
): Promise<RoomView> {
  return api.post(`/listings/${listingId}/unit-types/${unitTypeId}/rooms`, args, { auth: true });
}

export async function updateRoom(
  listingId: string,
  unitTypeId: string,
  roomId: string,
  args: {
    name?: string;
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
