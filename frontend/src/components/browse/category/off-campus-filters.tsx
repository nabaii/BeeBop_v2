'use client';

import { useEffect, useState } from 'react';

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

const DRIVE_MIN_MAX = 60;

/**
 * One-tap caps, in minutes. Proximity to campus is the sharpest thing a
 * student filters on, so it costs one tap — the slider underneath is only for
 * the values in between.
 */
const DRIVE_CAPS = [10, 20, 30, 45] as const;

/** Nile is the default measurement target: it is the campus the result cards
 *  already quote ("12 min to Nile"), so the filter opens speaking the same
 *  language. Baze is a swap, not a prerequisite. */
const DEFAULT_CAMPUS: Campus = 'nile';

/**
 * Minutes to campus — promoted out of "More filters" to its own section.
 *
 * `campus` and `max_drive_min` are written and cleared together: a cap with no
 * campus to measure against filters nothing, and a campus with no cap is dead
 * weight in the URL. Which campus is being measured from is local state until a
 * cap exists, so tapping "Baze" moves the target visibly without silently
 * applying a filter the seeker didn't ask for.
 */
export function CampusProximityFields({
  value,
  onChange,
  hiddenUnknown = 0,
}: {
  value: OffCampusFilters;
  onChange: (next: OffCampusFilters) => void;
  /** From the search response: places this cap is hiding for want of a
   *  recorded drive time, not for being too far away. */
  hiddenUnknown?: number;
}) {
  const cap = value.max_drive_min;
  const [target, setTarget] = useState<Campus>(value.campus ?? DEFAULT_CAMPUS);

  // A campus arriving from outside (a removed chip, the back button, a shared
  // link) wins over the local target.
  useEffect(() => {
    if (value.campus) setTarget(value.campus);
  }, [value.campus]);

  const targetLabel = CAMPUSES.find((c) => c.value === target)?.label ?? 'campus';
  const including = Boolean(value.include_unknown_drive);

  function setCap(next: number | undefined) {
    onChange({
      ...value,
      campus: next === undefined ? undefined : target,
      max_drive_min: next,
      // Clearing the cap clears its opt-in — left behind it would be a filter
      // in the URL with nothing to modify.
      include_unknown_drive: next === undefined ? undefined : value.include_unknown_drive,
    });
  }

  function retarget(next: Campus) {
    setTarget(next);
    // Switching campus keeps the cap — "within 20 minutes" is still what was
    // asked for, just measured from somewhere else.
    if (cap !== undefined) onChange({ ...value, campus: next });
  }

  return (
    <>
      <fieldset>
        <legend className="mb-1.5 text-caption font-medium text-ink">Measured from</legend>
        <div className="flex flex-wrap gap-1.5">
          {CAMPUSES.map((campus) => (
            <ToggleChip
              key={campus.value}
              active={target === campus.value}
              onClick={() => retarget(campus.value)}
            >
              {campus.label}
            </ToggleChip>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-1.5">
        <ToggleChip active={cap === undefined} onClick={() => setCap(undefined)}>
          Any
        </ToggleChip>
        {DRIVE_CAPS.map((minutes) => (
          <ToggleChip
            key={minutes}
            active={cap === minutes}
            onClick={() => setCap(cap === minutes ? undefined : minutes)}
          >
            {minutes} min
          </ToggleChip>
        ))}
      </div>

      {cap !== undefined && (
        <>
          <MaxSlider
            label={`Maximum minutes to ${targetLabel}`}
            min={5}
            max={DRIVE_MIN_MAX}
            step={5}
            value={cap}
            onChange={setCap}
            format={(v) =>
              v >= DRIVE_MIN_MAX
                ? `${v}+ min to ${targetLabel}`
                : `Within ${v} min of ${targetLabel}`
            }
          />
          {/* Stated plainly because this filter would otherwise shrink the
              result set for a reason the seeker cannot see: the drive time is
              optional for landlords, so a listing with an empty box is excluded
              no matter how generous the cap. When the server reports a real
              count, name it — "12 places are hidden" is actionable in a way
              that a general caveat is not. */}
          <p className="mt-1 text-caption text-ink-soft">
            {including
              ? `Including places with no recorded time to ${targetLabel} — their commute is unknown.`
              : hiddenUnknown > 0
                ? `${hiddenUnknown} ${hiddenUnknown === 1 ? 'place has' : 'places have'} no recorded time to ${targetLabel} and ${hiddenUnknown === 1 ? 'is' : 'are'} hidden.`
                : `Uses the drive time recorded on each listing. Places with no recorded time to ${targetLabel} are hidden.`}
          </p>

          {/* Only offered when it would change something. Once on, the server
              stops counting what it is no longer hiding, so the toggle has to
              stay visible on `including` alone or it would vanish under the
              seeker's finger. */}
          {(including || hiddenUnknown > 0) && (
            <CheckRow
              checked={including}
              onChange={() =>
                onChange({
                  ...value,
                  include_unknown_drive: including ? undefined : true,
                })
              }
              label="Show places with no recorded time"
            />
          )}
        </>
      )}
    </>
  );
}

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

      {/* Minutes to campus is not here — it has its own section above the fold
          in the sheet, via `CampusProximityFields`. */}

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
