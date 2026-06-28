/**
 * House rules a landlord can attach to a student-accommodation listing.
 * Checkable like amenities and individually featurable. Keys mirror the backend
 * vocabulary (HOUSE_RULES in app/listings/schemas.py).
 *
 * A rule with `needsValue` shows a free-text input when checked (e.g. curfew
 * time "11:00 PM"), stored on the entry's `value`.
 */

import { Ban, Clock, Dog, Moon, PartyPopper, Sparkles, UserCheck, Wine, type LucideIcon } from 'lucide-react';

export interface HouseRuleDef {
  key: string;
  label: string;
  icon: LucideIcon;
  needsValue?: boolean;
  valuePlaceholder?: string;
}

export const HOUSE_RULES: HouseRuleDef[] = [
  { key: 'curfew', label: 'Curfew', icon: Clock, needsValue: true, valuePlaceholder: 'e.g. 11:00 PM' },
  { key: 'no_smoking', label: 'No smoking', icon: Ban },
  { key: 'no_alcohol', label: 'No alcohol', icon: Wine },
  { key: 'no_pets', label: 'No pets', icon: Dog },
  { key: 'no_overnight_guests', label: 'No overnight guests', icon: Moon },
  { key: 'no_parties_loud_music', label: 'No parties / loud music', icon: PartyPopper },
  { key: 'visitors_sign_in', label: 'Visitors must sign in', icon: UserCheck },
  { key: 'keep_common_areas_clean', label: 'Keep common areas clean', icon: Sparkles },
];

const BY_KEY: Record<string, HouseRuleDef> = Object.fromEntries(
  HOUSE_RULES.map((r) => [r.key, r]),
);

export function houseRuleDef(key: string): HouseRuleDef | undefined {
  return BY_KEY[key];
}

export function houseRuleLabel(key: string): string {
  return BY_KEY[key]?.label ?? key.replaceAll('_', ' ');
}
