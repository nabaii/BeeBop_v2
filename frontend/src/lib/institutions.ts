/**
 * Canonical campuses BeeBop currently serves. Shared between seeker onboarding
 * (which institution the student attends) and off-campus listing editors so
 * student categorisation and distance fields stay consistent. Add new campuses
 * here as BeeBop expands; "Other" is handled in the UI as a free-text fallback.
 */

export const KNOWN_INSTITUTIONS = ['Nile University', 'Baze University'] as const;

export type KnownInstitution = (typeof KNOWN_INSTITUTIONS)[number];

/** Sentinel used by select inputs to reveal a free-text "specify" field. */
export const OTHER_INSTITUTION = 'Other' as const;
