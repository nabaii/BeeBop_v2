'use client';

import { CheckRow, MaxSlider, PillGroup, ToggleChip } from '@/components/browse/filter-controls';
import type { Campus, OffCampusFilters } from '@/lib/search';

const UNIT_KINDS = [
  ['single_room', 'Single room'],
  ['two_in_a_room', '2-in-a-room'],
  ['three_in_a_room', '3-in-a-room'],
  ['self_contain', 'Self-contain'],
] as const;

/** The campuses a landlord records a drive time to (type_data.drive_min_*). */
const CAMPUSES: { value: Campus; label: string }[] = [
  { value: 'nile', label: 'Nile University' },
  { value: 'baze', label: 'Baze University' },
];

/**
 * Rooms are tagged for a sex, or open to anyone. Matching is at room level on
 * the server: a listing qualifies when any unit is untagged or matches.
 */
const GENDERS = [
  ['female', 'Women'],
  ['male', 'Men'],
] as const;

/**
 * Mirrors HOUSE_RULES in `backend/app/listings/schemas.py`.
 *
 * Every entry is a restriction, so the filter runs one way only: these are
 * rules to avoid. Labels are phrased as the thing being excluded ("Curfew"),
 * and the chip row is headed "Hide places with".
 */
const HOUSE_RULES = [
  ['curfew', 'Curfew'],
  ['no_smoking', 'No smoking'],
  ['no_alcohol', 'No alcohol'],
  ['no_pets', 'No pets'],
  ['no_overnight_guests', 'No overnight guests'],
  ['no_parties_loud_music', 'No parties'],
  ['visitors_sign_in', 'Visitors sign in'],
  ['keep_common_areas_clean', 'Cleaning duties'],
] as const;

const DRIVE_MIN_DEFAULT = 20;
const DRIVE_MIN_MAX = 60;

export function OffCampusFilterFields({
  value,
  onChange,
}: {
  value: OffCampusFilters;
  onChange: (next: OffCampusFilters) => void;
}) {
  const excluded = value.exclude_house_rules ?? [];

  function toggleRule(rule: string) {
    const next = excluded.includes(rule)
      ? excluded.filter((r) => r !== rule)
      : [...excluded, rule];
    onChange({ ...value, exclude_house_rules: next.length ? next : undefined });
  }

  function selectCampus(campus: Campus) {
    if (value.campus === campus) {
      // Deselecting the campus clears the cap too — a drive time with no
      // campus to measure against filters nothing.
      onChange({ ...value, campus: undefined, max_drive_min: undefined });
      return;
    }
    onChange({ ...value, campus, max_drive_min: value.max_drive_min ?? DRIVE_MIN_DEFAULT });
  }

  return (
    <>
      <PillGroup
        label="Unit type"
        options={UNIT_KINDS}
        value={value.unit_kinds ?? []}
        onChange={(next) => onChange({ ...value, unit_kinds: next })}
      />

      <PillGroup
        label="Rooms for"
        options={GENDERS}
        value={value.gender ? [value.gender] : []}
        onChange={(next) => {
          // Single-select: keep whichever was just added.
          const picked = next.find((g) => g !== value.gender);
          onChange({ ...value, gender: picked as OffCampusFilters['gender'] });
        }}
      />

      <fieldset>
        <legend className="mb-1.5 text-caption font-medium text-ink">Distance to campus</legend>
        <div className="flex flex-wrap gap-1.5">
          {CAMPUSES.map((campus) => (
            <ToggleChip
              key={campus.value}
              active={value.campus === campus.value}
              onClick={() => selectCampus(campus.value)}
            >
              {campus.label}
            </ToggleChip>
          ))}
        </div>
        {value.campus && (
          <MaxSlider
            label="Maximum drive time to campus"
            min={5}
            max={DRIVE_MIN_MAX}
            step={5}
            value={value.max_drive_min ?? DRIVE_MIN_DEFAULT}
            onChange={(next) => onChange({ ...value, max_drive_min: next })}
            format={(v) =>
              v >= DRIVE_MIN_MAX ? `${v}+ min drive` : `Within ${v} min drive`
            }
          />
        )}
        {value.campus && (
          <p className="mt-1 text-caption text-ink-soft">
            Uses the drive time recorded on each listing. Places with no
            recorded time for this campus are hidden.
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-caption font-medium text-ink">Hide places with</legend>
        <div className="flex flex-wrap gap-1.5">
          {HOUSE_RULES.map(([rule, label]) => (
            <ToggleChip
              key={rule}
              active={excluded.includes(rule)}
              onClick={() => toggleRule(rule)}
            >
              {label}
            </ToggleChip>
          ))}
        </div>
      </fieldset>

      <CheckRow
        checked={Boolean(value.available_now)}
        onChange={() =>
          // Undefined rather than false when off, so the filter drops out of the
          // URL and the active-filter count instead of riding along as noise.
          onChange({ ...value, available_now: value.available_now ? undefined : true })
        }
        label="Beds available now"
      />
    </>
  );
}
