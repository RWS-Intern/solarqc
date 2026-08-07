import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { useQcJob } from '@/hooks/useQcJob';
import { computeQcTally } from '@/utils/qcTally';
import type { QcAnswer, QcJob } from '@/types/qc';

const AUTOSAVE_INTERVAL_MS = 20_000;

// Wraps useQcJob(jobId) with local, editable answer state. The guard below
// is the plan §5.2 / old UpdateTaskDrawer "initialisedForTaskId" pattern:
// useQcJob's live snapshot re-fires on every remote change, including this
// hook's OWN autosaves echoing back through the listener — local state must
// only ever be re-seeded when the job id itself changes, never on every
// snapshot tick, or an inspector's unsaved keystroke gets silently
// overwritten by their own prior autosave.
export function useQcFill(jobId: string | null | undefined) {
  const { currentUser } = useAuthStore();
  const { job, loading, error } = useQcJob(jobId);

  const [answers,  setAnswers]  = useState<Record<string, QcAnswer>>({});
  const [location, setLocation] = useState<QcJob['location']>(null);
  // Client-side only — display text ("captured at HH:MM"), never the value
  // written to Firestore. saveDraft always writes locationAt as
  // serverTimestamp(); an inspector's device clock is not trusted for the
  // audit record, only used here to show *something* before the first save.
  const [locationCapturedAt, setLocationCapturedAt] = useState<Date | null>(null);
  const [locationUnavailable, setLocationUnavailable] = useState(false);
  const [dirty,    setDirty]    = useState(false);
  const [saving,   setSaving]   = useState(false);

  const initializedForJobId = useRef<string | null>(null);
  const dirtyRef            = useRef(false);
  const locationDirtyRef    = useRef(false);
  const currentUserRef      = useRef(currentUser);
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
    dirtyRef.current = false;
    setDirty(false);
    locationDirtyRef.current = false;

    if (!job.location) captureLocation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        },
      };
    });
    dirtyRef.current = true;
    setDirty(true);
  }, []);

  // What a save actually writes — answers, a freshly-recomputed tally
  // (never trusted from stale local state), location/locationAt only if
  // GPS was (re-)captured since the last save, and status:'in_progress'
  // only on the first save off of 'assigned' — subsequent saves while
  // already in_progress/rework omit the key rather than rewriting it to
  // the same value every ~20s for no reason.
  const saveDraft = useCallback(async () => {
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
      await updateDoc(doc(db, 'qcJobs', job.id), payload);
      locationDirtyRef.current = false;
      dirtyRef.current = false;
      setDirty(false);
    } catch (err) {
      console.error('[useQcFill] saveDraft failed:', err);
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, answers, location]);

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

  const tally = useMemo(
    () => computeQcTally(job?.template ?? [], answers),
    [job?.template, answers],
  );

  return {
    job, loading, error,
    answers, answerField,
    location, locationCapturedAt, locationUnavailable, captureLocation,
    tally, dirty, saving,
    saveDraft, onSectionCollapse,
  };
}
