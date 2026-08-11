import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { useQcJob } from '@/hooks/useQcJob';
import { computeQcTally } from '@/utils/qcTally';
import type { QcAnswer, QcJob, SignOff } from '@/types/qc';

const AUTOSAVE_INTERVAL_MS = 20_000;

interface SaveOverrides {
  inspectorSignOff?: SignOff;
  customerSignOff?:  SignOff | null;
}

// Wraps useQcJob(jobId) with local, editable answer state. The guard below
// is the plan §5.2 / old UpdateTaskDrawer "initialisedForTaskId" pattern:
// useQcJob's live snapshot re-fires on every remote change, including this
// hook's OWN autosaves echoing back through the listener — local state must
// only ever be re-seeded when the job id itself changes, never on every
// snapshot tick, or an inspector's unsaved keystroke gets silently
// overwritten by their own prior autosave.
export function useQcFill(jobId: string | null | undefined) {
  const { currentUser } = useAuthStore();
  const { job, loading, error, hasPendingWrites } = useQcJob(jobId);

  const [answers,  setAnswers]  = useState<Record<string, QcAnswer>>({});
  const [location, setLocation] = useState<QcJob['location']>(null);
  // Client-side only — display text ("captured at HH:MM"), never the value
  // written to Firestore. saveDraft always writes locationAt as
  // serverTimestamp(); an inspector's device clock is not trusted for the
  // audit record, only used here to show *something* before the first save.
  const [locationCapturedAt, setLocationCapturedAt] = useState<Date | null>(null);
  const [locationUnavailable, setLocationUnavailable] = useState(false);
  const [inspectorSignOff, setInspectorSignOff] = useState<SignOff | null>(null);
  const [customerSignOff,  setCustomerSignOff]  = useState<SignOff | null>(null);
  const [dirty,    setDirty]    = useState(false);
  const [saving,   setSaving]   = useState(false);

  // DCR panel tracking (§3/§4 of the QcFillPage move) — local draft state,
  // same relationship to job.system.panels as `answers` above has to
  // job.answers. Undefined until a moduleType:'dcr' job is loaded.
  const [panels, setPanels] = useState<QcJob['system']['panels']>(undefined);

  const initializedForJobId  = useRef<string | null>(null);
  const dirtyRef              = useRef(false);
  const locationDirtyRef      = useRef(false);
  const inspectorSignDirtyRef = useRef(false);
  const customerSignDirtyRef  = useRef(false);
  const panelsDirtyRef        = useRef(false);
  const currentUserRef        = useRef(currentUser);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  const captureLocation = useCallback(() => {
    if (!navigator.geolocation) { setLocationUnavailable(true); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setLocationCapturedAt(new Date());
        setLocationUnavailable(false);
        locationDirtyRef.current = true;
      },
      // Never blocks anything — a denied/unavailable reading is just an
      // empty state in the UI, not an error state (plan §5.2's
      // submit-blocking list doesn't include location at all).
      (err) => {
        console.warn('[useQcFill] geolocation unavailable:', err.message);
        setLocationUnavailable(true);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    if (!job) return;
    if (initializedForJobId.current === job.id) return;
    initializedForJobId.current = job.id;

    setAnswers(job.answers);
    setLocation(job.location);
    setLocationCapturedAt(job.locationAt);
    setLocationUnavailable(false);
    setInspectorSignOff(job.inspectorSignOff);
    setCustomerSignOff(job.customerSignOff);
    setPanels(job.system?.panels);
    dirtyRef.current = false;
    setDirty(false);
    locationDirtyRef.current = false;
    inspectorSignDirtyRef.current = false;
    customerSignDirtyRef.current = false;
    panelsDirtyRef.current = false;

    if (!job.location) captureLocation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  // jobRef mirrors the latest job so answerField (stable via empty deps,
  // called from 54 individual QcCheckItems) always stamps the CURRENT
  // rework round rather than closing over a stale one from first render.
  const jobRef = useRef(job);
  useEffect(() => { jobRef.current = job; }, [job]);

  // A background offline-queue replay (Phase 7) can land a confirmed
  // photoUrl or a real sign-off directly on the live document while this
  // hook's own local draft sits in memory unaware — the seed effect above
  // deliberately never re-syncs from a live snapshot after mount, to stop
  // a routine remote echo (including this hook's own autosave echoing
  // back) from clobbering an inspector's in-progress edit. A replay isn't
  // a routine echo, though: it's evidence this same device queued and is
  // now confirming, and if it's never merged in, the next autosave's
  // whole-map write for `answers` would silently revert it — the exact
  // kind of silent loss this phase exists to prevent. Both merges below
  // are strictly additive (only add a URL, or adopt a sign-off local
  // state doesn't already have) so they can never discard an in-progress
  // edit, and they're safe to run on every snapshot since they're
  // idempotent once caught up.
  useEffect(() => {
    if (!job) return;
    setAnswers((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [fieldId, serverAns] of Object.entries(job.answers)) {
        const serverUrls = serverAns.photoUrls ?? [];
        if (serverUrls.length === 0) continue;
        const localAns  = next[fieldId];
        const localUrls = localAns?.photoUrls ?? [];
        const missing   = serverUrls.filter((u) => !localUrls.includes(u));
        if (missing.length === 0) continue;
        changed = true;
        next[fieldId] = {
          ...(localAns ?? {
            fieldId, status: null, remark: '', photoUrls: [],
            answeredAt: null, answeredBy: '', round: serverAns.round,
          }),
          photoUrls: [...localUrls, ...missing],
        };
      }
      return changed ? next : prev;
    });
    setInspectorSignOff((prev) => (
      !inspectorSignDirtyRef.current && job.inspectorSignOff && !prev ? job.inspectorSignOff : prev
    ));
    setCustomerSignOff((prev) => (
      !customerSignDirtyRef.current && job.customerSignOff && !prev ? job.customerSignOff : prev
    ));

    // Same reasoning, applied to panel nameplate photos: a background
    // replay (offlineQueueReplay.ts) can confirm a photoUrl directly on
    // the live doc while this hook's local draft sits unaware. Only ever
    // adopts a photoUrl the server has that the local draft doesn't —
    // never touches serialNumber, so an in-progress edit there is safe.
    setPanels((prev) => {
      const serverPanels = job.system?.panels;
      if (!serverPanels || !prev) return prev;
      let changed = false;
      const next = prev.map((p, i) => {
        const serverP = serverPanels[i];
        if (serverP?.photoUrl && p.photoUrl !== serverP.photoUrl) {
          changed = true;
          return { ...p, photoUrl: serverP.photoUrl };
        }
        return p;
      });
      return changed ? next : prev;
    });
  }, [job]);

  const answerField = useCallback((fieldId: string, patch: Partial<QcAnswer>) => {
    setAnswers((prev) => {
      const base: QcAnswer = prev[fieldId] ?? {
        fieldId, status: null, remark: '', photoUrls: [],
        answeredAt: null, answeredBy: '', round: 0,
      };
      return {
        ...prev,
        [fieldId]: {
          ...base, ...patch,
          answeredAt: new Date(),
          answeredBy: currentUserRef.current?.uid ?? '',
          // Stamp the CURRENT round, not whatever round this answer was
          // first created in — once rework exists, re-touching a
          // previously-answered field during round 2 must actually
          // become round 1, not stay silently stuck at round 0 forever.
          round: jobRef.current?.reworkRound ?? base.round,
        },
      };
    });
    dirtyRef.current = true;
    setDirty(true);
  }, []);

  // Grows or shrinks the panel list to match a newly entered/changed
  // count, preserving whatever's already been filled in at each
  // surviving index — never wiping serials/photos just because the
  // count was edited again.
  const setPanelCount = useCallback((count: number) => {
    setPanels((prev) => {
      const current = prev ?? [];
      if (current.length === count) return prev ?? [];
      return Array.from({ length: count }, (_, i) => current[i] ?? { serialNumber: '', photoUrl: '' });
    });
    panelsDirtyRef.current = true;
    setDirty(true);
  }, []);

  const updatePanelSerial = useCallback((index: number, value: string) => {
    setPanels((prev) => (prev ?? []).map((p, i) => (i === index ? { ...p, serialNumber: value } : p)));
    panelsDirtyRef.current = true;
    setDirty(true);
  }, []);

  // The online-success path only — PhotoZone calls this directly once an
  // upload confirms. The offline-queued path never touches this; it lands
  // via the replay-merge effect above instead, same split as checklist
  // photos already have between answerField and that same effect.
  const updatePanelPhoto = useCallback((index: number, url: string) => {
    setPanels((prev) => (prev ?? []).map((p, i) => (i === index ? { ...p, photoUrl: url } : p)));
    panelsDirtyRef.current = true;
    setDirty(true);
  }, []);

  // What a save actually writes — answers, a freshly-recomputed tally
  // (never trusted from stale local state), location/locationAt only if
  // GPS was (re-)captured since the last save, sign-offs only if freshly
  // (re-)set since the last save (never re-stamped on a routine 20s tick),
  // and status:'assigned'->'in_progress' only on the first save — subsequent
  // saves while already in_progress/rework omit the key rather than
  // rewriting it to the same value every ~20s for no reason.
  //
  // `overrides` exists for onInspectorSign/onCustomerSign below: signing is
  // a deliberate, immediate-save action, but the just-signed value hasn't
  // landed in `inspectorSignOff` state yet at the moment saveDraft would be
  // called (React state updates aren't synchronous) — passing it directly
  // sidesteps that stale-closure race instead of waiting a render.
  const saveDraft = useCallback(async (overrides?: SaveOverrides) => {
    if (!job) return;
    setSaving(true);
    try {
      const tally = computeQcTally(job.template, answers);
      const payload: Record<string, unknown> = {
        answers, tally, updatedAt: serverTimestamp(),
      };
      if (job.status === 'assigned') payload.status = 'in_progress';
      if (locationDirtyRef.current && location) {
        payload.location = location;
        payload.locationAt = serverTimestamp();
      }

      const inspectorToSave = overrides?.inspectorSignOff
        ?? (inspectorSignDirtyRef.current ? inspectorSignOff : undefined);
      if (inspectorToSave) {
        payload.inspectorSignOff = { ...inspectorToSave, signedAt: serverTimestamp() };
      }

      const customerOverridden = overrides && 'customerSignOff' in overrides;
      const customerToSave = customerOverridden
        ? overrides.customerSignOff
        : (customerSignDirtyRef.current ? customerSignOff : undefined);
      if (customerOverridden || customerSignDirtyRef.current) {
        payload.customerSignOff = customerToSave
          ? { ...customerToSave, signedAt: serverTimestamp() }
          : null;
      }

      await updateDoc(doc(db, 'qcJobs', job.id), payload);
      locationDirtyRef.current = false;
      inspectorSignDirtyRef.current = false;
      customerSignDirtyRef.current = false;

      // A separate write, not folded into the payload above — firestore.
      // rules scopes DCR panel edits to their own narrower rule
      // (assigned/in_progress only, no rework, inspector-owned-job only),
      // so bundling 'system' into the same call as answers/tally would
      // need both rules' field sets to cover the union of everything
      // touched, defeating the point of having two narrowly-scoped rules.
      if (panelsDirtyRef.current && panels) {
        await updateDoc(doc(db, 'qcJobs', job.id), {
          system: { ...job.system, panels, moduleCount: panels.length },
          updatedAt: serverTimestamp(),
        });
        panelsDirtyRef.current = false;
      }

      dirtyRef.current = false;
      setDirty(false);
    } catch (err) {
      console.error('[useQcFill] saveDraft failed:', err);
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, answers, location, inspectorSignOff, customerSignOff, panels]);

  // Always call the latest saveDraft closure from the interval/visibility
  // listeners below without re-subscribing them on every keystroke.
  const saveDraftRef = useRef(saveDraft);
  useEffect(() => { saveDraftRef.current = saveDraft; }, [saveDraft]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (dirtyRef.current) void saveDraftRef.current();
    }, AUTOSAVE_INTERVAL_MS);

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden' && dirtyRef.current) {
        void saveDraftRef.current();
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const onSectionCollapse = useCallback(() => {
    if (dirtyRef.current) void saveDraftRef.current();
  }, []);

  // Signing is deliberate and final-ish — don't leave it to the next 20s
  // tick. signedAt here is a local display-only placeholder (§2.3 of the
  // plan): the actual write above always uses serverTimestamp().
  const onInspectorSign = useCallback((signOff: Omit<SignOff, 'signedAt'>) => {
    const withPlaceholder: SignOff = { ...signOff, signedAt: new Date() };
    setInspectorSignOff(withPlaceholder);
    inspectorSignDirtyRef.current = true;
    void saveDraftRef.current({ inspectorSignOff: withPlaceholder });
  }, []);

  const onCustomerSign = useCallback((signOff: Omit<SignOff, 'signedAt'> | null) => {
    const withPlaceholder: SignOff | null = signOff ? { ...signOff, signedAt: new Date() } : null;
    setCustomerSignOff(withPlaceholder);
    customerSignDirtyRef.current = true;
    void saveDraftRef.current({ customerSignOff: withPlaceholder });
  }, []);

  const tally = useMemo(
    () => computeQcTally(job?.template ?? [], answers),
    [job?.template, answers],
  );

  return {
    job, loading, error, hasPendingWrites,
    answers, answerField,
    location, locationCapturedAt, locationUnavailable, captureLocation,
    inspectorSignOff, customerSignOff, onInspectorSign, onCustomerSign,
    panels, setPanelCount, updatePanelSerial, updatePanelPhoto,
    tally, dirty, saving,
    saveDraft, onSectionCollapse,
  };
}
