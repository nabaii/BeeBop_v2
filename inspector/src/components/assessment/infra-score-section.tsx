'use client';

/**
 * Infrastructure scoring — Road condition, Electricity, Security, Proximity.
 * Each scored 1–5. Stored against GPS coordinates (area level), not listing.
 * Independently submittable via its own save button.
 */

import { useCallback, useState } from 'react';
import { inspector } from '@/lib/inspector';
import { enqueue } from '@/lib/idb';
import { flush } from '@/lib/sync';

export interface InfraScoreValues {
  roadCondition: number | null;
  electricitySupplyHours: number | null;
  security: number | null;
  proximity: number | null;
}

export const EMPTY_INFRA: InfraScoreValues = {
  roadCondition: null,
  electricitySupplyHours: null,
  security: null,
  proximity: null,
};

export function isInfraComplete(v: InfraScoreValues): boolean {
  return v.roadCondition != null && v.electricitySupplyHours != null && v.security != null && v.proximity != null;
}

interface Props {
  values: InfraScoreValues;
  onChange: (next: InfraScoreValues) => void;
  reportId: string;
  gpsLat: number | null;
  gpsLng: number | null;
  expanded: boolean;
  onToggle: () => void;
  complete: boolean;
}

export function InfraScoreSection({ values, onChange, reportId, gpsLat, gpsLng, expanded, onToggle, complete }: Props) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(
    (patch: Partial<InfraScoreValues>) => {
      setSaved(false);
      onChange({ ...values, ...patch });
    },
    [values, onChange],
  );

  const handleSave = async () => {
    if (gpsLat == null || gpsLng == null) {
      setError('GPS pin required before saving infrastructure scores.');
      return;
    }
    if (!isInfraComplete(values)) {
      setError('Please complete all four scores.');
      return;
    }
    setError(null);
    setSaving(true);

    const payload = {
      lat: gpsLat,
      lng: gpsLng,
      road_condition: values.roadCondition!,
      electricity_supply_hours: values.electricitySupplyHours!,
      security: values.security!,
      proximity: values.proximity!,
    };

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await enqueue({ kind: 'score_area', reportId, payload });
        void flush();
      } else {
        await inspector.scoreArea(reportId, payload);
      }
      setSaved(true);
    } catch {
      await enqueue({ kind: 'score_area', reportId, payload });
      void flush();
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="infra-score-section" className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <div className="flex items-center gap-3">
          <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${complete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>3</span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Infrastructure Score</h2>
            <p className="text-xs text-slate-500">{complete ? 'All scores set' : 'Road, electricity, security, proximity'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {complete && <CompleteBadge />}
          <ChevronIcon open={expanded} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-5">
          <p className="text-xs text-slate-500">
            Scores are stored at the area level (GPS cell), not against the specific listing.
            Multiple listings sharing the same area will share these scores.
          </p>

          <ScoreSlider label="Road Condition" description="Quality of access roads to the property" value={values.roadCondition} onChange={(v) => update({ roadCondition: v })} lowLabel="Very poor" highLabel="Excellent" />
          <ScoreSlider label="Electricity (NEPA/PHCN)" description="Hours of power supply per day" value={values.electricitySupplyHours} onChange={(v) => update({ electricitySupplyHours: v })} lowLabel="0–4 hrs" highLabel="20–24 hrs" />
          <ScoreSlider label="Security" description="Safety of the neighbourhood" value={values.security} onChange={(v) => update({ security: v })} lowLabel="Very poor" highLabel="Excellent" />
          <ScoreSlider label="Proximity" description="Access to amenities, transport, markets" value={values.proximity} onChange={(v) => update({ proximity: v })} lowLabel="Remote" highLabel="Central" />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isInfraComplete(values)}
            className={`w-full rounded-xl py-3 text-sm font-semibold transition-all ${
              saved
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50'
            }`}
          >
            {saving ? 'Saving…' : saved ? '✓ Area Score Saved' : 'Save Area Score Independently'}
          </button>
        </div>
      )}
    </section>
  );
}

function ScoreSlider({ label, description, value, onChange, lowLabel, highLabel }: {
  label: string;
  description: string;
  value: number | null;
  onChange: (v: number) => void;
  lowLabel: string;
  highLabel: string;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-800">{label}</p>
      <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      <div className="mt-2 flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`flex h-11 flex-1 items-center justify-center rounded-xl border-2 text-sm font-semibold transition-all ${
              value === n
                ? 'border-brand bg-brand text-white shadow-md shadow-brand/25'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

function CompleteBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
      Done
    </span>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`h-5 w-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
