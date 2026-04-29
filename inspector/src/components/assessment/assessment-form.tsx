'use client';

/**
 * Assessment form orchestrator — manages all section state, auto-saves to
 * IndexedDB on every field change (debounced), and coordinates the submit flow.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { inspector, type BriefingPack } from '@/lib/inspector';
import { readDraft, writeDraft, deleteDraft, enqueue } from '@/lib/idb';
import { flush } from '@/lib/sync';

import { BriefingSection } from './briefing-section';
import {
  ChecklistSection,
  EMPTY_CHECKLIST,
  isChecklistComplete,
  type ChecklistValues,
} from './checklist-section';
import {
  InfraScoreSection,
  EMPTY_INFRA,
  isInfraComplete,
  type InfraScoreValues,
} from './infra-score-section';
import {
  PhotoCaptureSection,
  type CapturedItem,
} from './photo-capture-section';
import { GpsPinSection } from './gps-pin-section';
import { SubmitSection } from './submit-section';

/* ---------- form state ---------- */

interface FormState {
  checklist: ChecklistValues;
  infra: InfraScoreValues;
  gpsLat: number | null;
  gpsLng: number | null;
  inspectorNote: string;
}

const EMPTY_FORM: FormState = {
  checklist: EMPTY_CHECKLIST,
  infra: EMPTY_INFRA,
  gpsLat: null,
  gpsLng: null,
  inspectorNote: '',
};

/* ---------- accordion ---------- */

type Section = 'briefing' | 'checklist' | 'infra' | 'photos' | 'gps' | 'submit';

/* ---------- component ---------- */

interface Props {
  reportId: string;
}

export function AssessmentForm({ reportId }: Props) {
  const [briefing, setBriefing] = useState<BriefingPack | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [photos, setPhotos] = useState<CapturedItem[]>([]);
  const [expanded, setExpanded] = useState<Section>('briefing');

  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Load briefing + draft ----
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        // Load briefing from API (or from cache if offline — API layer handles 401)
        const bp = await inspector.briefing(reportId);
        if (cancelled) return;
        setBriefing(bp);

        // Restore any local draft
        const draft = await readDraft(reportId);
        if (cancelled) return;
        if (draft) {
          const assessment = (draft.assessment ?? {}) as {
            checklist?: ChecklistValues;
            infra?: InfraScoreValues;
          };
          setForm({
            checklist: assessment.checklist ?? EMPTY_CHECKLIST,
            infra: assessment.infra ?? EMPTY_INFRA,
            gpsLat: draft.visit_gps_lat ?? null,
            gpsLng: draft.visit_gps_lng ?? null,
            inspectorNote: draft.inspector_note ?? '',
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load assessment data.');
          // Try loading a local draft even if API fails
          const draft = await readDraft(reportId);
          if (draft && !cancelled) {
            const assessment = (draft.assessment ?? {}) as {
              checklist?: ChecklistValues;
              infra?: InfraScoreValues;
            };
            setForm({
              checklist: assessment.checklist ?? EMPTY_CHECKLIST,
              infra: assessment.infra ?? EMPTY_INFRA,
              gpsLat: draft.visit_gps_lat ?? null,
              gpsLng: draft.visit_gps_lng ?? null,
              inspectorNote: draft.inspector_note ?? '',
            });
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [reportId]);

  // ---- Auto-save to IDB (debounced 500ms) ----
  const saveDraft = useCallback(
    (next: FormState) => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(async () => {
        const record = {
          reportId,
          assessment: {
            checklist: next.checklist,
            infra: next.infra,
          },
          inspector_note: next.inspectorNote,
          visit_gps_lat: next.gpsLat ?? undefined,
          visit_gps_lng: next.gpsLng ?? undefined,
          updatedAt: Date.now(),
        };
        await writeDraft(record);

        // Also enqueue a server save for background sync
        await enqueue({
          kind: 'save_draft',
          reportId,
          payload: {
            assessment: record.assessment,
            inspector_note: record.inspector_note,
            visit_gps_lat: record.visit_gps_lat,
            visit_gps_lng: record.visit_gps_lng,
          },
        });
        void flush();
      }, 500);
    },
    [reportId],
  );

  const updateForm = useCallback(
    (patch: Partial<FormState>) => {
      setForm((prev) => {
        const next = { ...prev, ...patch };
        saveDraft(next);
        return next;
      });
    },
    [saveDraft],
  );

  // ---- Submit ----
  const handleSubmit = useCallback(async (): Promise<string | null> => {
    // Final draft save before submit
    const record = {
      reportId,
      assessment: { checklist: form.checklist, infra: form.infra },
      inspector_note: form.inspectorNote,
      visit_gps_lat: form.gpsLat ?? undefined,
      visit_gps_lng: form.gpsLng ?? undefined,
      updatedAt: Date.now(),
    };
    await writeDraft(record);

    // Save to server
    try {
      await inspector.saveDraft(reportId, {
        assessment: record.assessment,
        inspector_note: record.inspector_note,
        visit_gps_lat: record.visit_gps_lat,
        visit_gps_lng: record.visit_gps_lng,
      });
    } catch {
      // Queue if offline
      await enqueue({ kind: 'save_draft', reportId, payload: record.assessment });
    }

    // Submit
    try {
      const result = await inspector.submit(reportId);
      await deleteDraft(reportId);
      return result.id.slice(0, 8).toUpperCase(); // Short reference
    } catch {
      // Queue submit for offline
      await enqueue({ kind: 'submit_report', reportId, payload: {} });
      void flush();
      await deleteDraft(reportId);
      return `Q-${reportId.slice(0, 6).toUpperCase()}`; // Queued reference
    }
  }, [form, reportId]);

  // ---- Accordion toggle ----
  const toggle = useCallback(
    (section: Section) => setExpanded((cur) => (cur === section ? (null as unknown as Section) : section)),
    [],
  );

  // ---- Completion checks ----
  const checklistComplete = briefing ? isChecklistComplete(form.checklist, briefing) : false;
  const infraComplete = isInfraComplete(form.infra);
  const gpsComplete = form.gpsLat != null && form.gpsLng != null;
  const photosHaveUploads = photos.length > 0;

  // ---- Render ----
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
        <p className="mt-4 text-sm">Loading assessment…</p>
      </div>
    );
  }

  if (error && !briefing) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center">
        <div className="rounded-xl bg-red-50 p-8">
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg bg-amber-50 px-4 py-2 text-xs text-amber-700">
          ⚠ Could not reach server — working from local draft. Changes will sync when online.
        </div>
      )}

      {briefing && (
        <BriefingSection briefing={briefing} />
      )}

      {briefing && (
        <ChecklistSection
          values={form.checklist}
          briefing={briefing}
          onChange={(checklist) => updateForm({ checklist })}
          expanded={expanded === 'checklist'}
          onToggle={() => toggle('checklist')}
          complete={checklistComplete}
        />
      )}

      <InfraScoreSection
        values={form.infra}
        onChange={(infra) => updateForm({ infra })}
        reportId={reportId}
        gpsLat={form.gpsLat}
        gpsLng={form.gpsLng}
        expanded={expanded === 'infra'}
        onToggle={() => toggle('infra')}
        complete={infraComplete}
      />

      <PhotoCaptureSection
        reportId={reportId}
        items={photos}
        onItemsChange={setPhotos}
        expanded={expanded === 'photos'}
        onToggle={() => toggle('photos')}
      />

      <GpsPinSection
        lat={form.gpsLat}
        lng={form.gpsLng}
        onChange={(lat, lng) => updateForm({ gpsLat: lat, gpsLng: lng })}
        expanded={expanded === 'gps'}
        onToggle={() => toggle('gps')}
        complete={gpsComplete}
      />

      <SubmitSection
        status={{
          checklist: checklistComplete,
          infraScore: infraComplete,
          gpsPin: gpsComplete,
          photos: photosHaveUploads,
        }}
        inspectorNote={form.inspectorNote}
        onNoteChange={(note) => updateForm({ inspectorNote: note })}
        onSubmit={handleSubmit}
        expanded={expanded === 'submit'}
        onToggle={() => toggle('submit')}
      />
    </div>
  );
}
