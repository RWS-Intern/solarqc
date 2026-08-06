import { useState, useEffect, useRef, useMemo } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { useAuthStore }        from '@/store/authStore';
import { useTaskSubmit }       from '@/hooks/useTaskSubmit';
import { useDrawerBackButton } from '@/hooks/useDrawerBackButton';
import { enqueueTaskUpdate }   from '@/hooks/useTaskOfflineQueue';
import { _emitToast }          from '@/components/ui/toast';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button }       from '@/components/ui/button';
import { Textarea }     from '@/components/ui/textarea';
import { ChecklistItem } from '@/components/tasks/checklist/ChecklistItem';
import { cn }           from '@/lib/utils';
import type { Task, TaskStatus, FieldType } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function blobUrlToBase64(url: string): Promise<string> {
  if (!url.startsWith('blob:')) return url;
  const resp = await fetch(url);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function convertBlobsInRecord(
  photos: Record<string, string[]>,
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  for (const [fieldId, urls] of Object.entries(photos)) {
    result[fieldId] = await Promise.all(urls.map(blobUrlToBase64));
  }
  return result;
}

// ─── Status selector ─────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: TaskStatus; label: string; active: string }[] = [
  { value: 'in_progress', label: 'In Progress', active: 'bg-amber-500 text-white border-amber-500' },
  { value: 'completed',   label: 'Completed',   active: 'bg-green-600 text-white border-green-600' },
  { value: 'blocked',     label: 'Blocked',     active: 'bg-brand-red text-white border-brand-red' },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface UpdateTaskDrawerProps {
  task:    Task | null;
  onClose: () => void;
}

export function UpdateTaskDrawer({ task, onClose }: UpdateTaskDrawerProps) {
  const { currentUser }    = useAuthStore();
  const { submitTaskUpdate } = useTaskSubmit();

  // Tracks which task has already been initialised — prevents Firestore
  // real-time updates from overwriting the engineer's local photo changes.
  const initialisedForTaskId = useRef<string | null>(null);

  // GPS capture — tracks an in-flight watchPosition call so it can be
  // stopped early (accurate reading found), on timeout, or if the drawer
  // closes/unmounts mid-capture.
  const gpsWatchId       = useRef<number | null>(null);
  const gpsTimeoutId     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gpsBestReading   = useRef<{ lat: number; lng: number; accuracy: number } | null>(null);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [status,           setStatus]           = useState<TaskStatus>('in_progress');
  const [blockedReason,    setBlockedReason]    = useState('');
  const [fieldAnswers,     setFieldAnswers]     = useState<Record<string, { value: string; type: FieldType }>>({});
  const [fieldPhotos,      setFieldPhotos]      = useState<Record<string, string[]>>({});
  const [location,         setLocation]         = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [followUpDate,     setFollowUpDate]     = useState<string>('');
  const [gpsLoading,       setGpsLoading]       = useState(false);
  const [submitting,       setSubmitting]       = useState(false);
  const [showErrors,       setShowErrors]       = useState(false);
  const [uploadingFields,  setUploadingFields]  = useState<Set<string>>(new Set());
  const [confirmClose,     setConfirmClose]     = useState(false);

  // Initialise state when the drawer opens for a new task.
  // Guarded by initialisedForTaskId so Firestore real-time updates
  // never overwrite the engineer's local photo/answer changes mid-session.
  useEffect(() => {
    if (!task) {
      initialisedForTaskId.current = null;
      stopGpsWatch();
      setGpsLoading(false);
      setUploadingFields(new Set());
      return;
    }
    if (initialisedForTaskId.current === task.id) return;
    initialisedForTaskId.current = task.id;

    const existingAnswers = task.fieldAnswers ?? {};
    const today = new Date().toISOString().split('T')[0];
    const autoFilled = { ...existingAnswers };

    for (const field of task.fields) {
      if (
        field.type === 'date' &&
        field.label.trim().toLowerCase() === 'survey done date' &&
        (!autoFilled[field.fieldId] || !autoFilled[field.fieldId].value)
      ) {
        autoFilled[field.fieldId] = { value: today, type: 'date' };
      }
    }

    setFieldAnswers(autoFilled);
    setFieldPhotos(task.fieldPhotos ?? {});
    setStatus(task.status === 'pending' ? 'in_progress' : task.status);
    setBlockedReason(task.blockedReason ?? '');
    setLocation(task.location ?? null);
    setFollowUpDate(
      task.followUpDate ? task.followUpDate.toISOString().split('T')[0] : ''
    );
    setSubmitting(false);
    setShowErrors(false);
    setUploadingFields(new Set());
    setConfirmClose(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, task]);

  // Derived values computed before the null-guard so hooks (useMemo) are
  // always called in the same order regardless of the task prop value.
  const isUploading = uploadingFields.size > 0;

  const hasUnsavedChanges = useMemo(() => {
    if (!task || !!(task.pipelineStage && task.pipelineStage !== 'survey')) return false;
    const originalAnswers = task.fieldAnswers ?? {};
    const answersChanged = Object.keys(fieldAnswers).some(
      (k) => fieldAnswers[k]?.value !== originalAnswers[k]?.value,
    );
    const originalPhotos = task.fieldPhotos ?? {};
    const photosChanged = Object.keys(fieldPhotos).some(
      (k) => (fieldPhotos[k]?.length ?? 0) !== (originalPhotos[k]?.length ?? 0),
    );
    const originalStatus = task.status === 'pending' ? 'in_progress' : task.status;
    const statusChanged = status !== originalStatus;
    return answersChanged || photosChanged || statusChanged;
  }, [task, fieldAnswers, fieldPhotos, status]);

  function handleCloseAttempt() {
    if (submitting || isUploading) return;
    if (hasUnsavedChanges) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }

  useDrawerBackButton(!!task, handleCloseAttempt);

  // Defensive backstop for a genuine component unmount while a GPS watch
  // is still active (e.g. navigating away from this page mid-capture).
  useEffect(() => {
    return () => stopGpsWatch();
  }, []);

  if (!task) return null;

  // Alias after guard so all closures below reference a non-nullable value
  const task_ = task;

  const isReadOnly  = !!(task && task.pipelineStage && task.pipelineStage !== 'survey');

  const latestEntry = task_.stageHistory?.length
    ? task_.stageHistory[task_.stageHistory.length - 1]
    : null;
  const showReturnBanner = !!(
    latestEntry &&
    latestEntry.note &&
    latestEntry.toStage === 'survey' &&
    latestEntry.actorRole === 'admin_override'
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleAnswerChange(fieldId: string, value: string) {
    const fieldDef = task_.fields.find((f) => f.fieldId === fieldId);

    setFieldAnswers((prev) => {
      const updated = {
        ...prev,
        [fieldId]: { value, type: fieldDef?.type ?? 'text' },
      };

      // Auto-calculate Total Roof Area when Length or Width changes
      const label = fieldDef?.label.trim().toLowerCase() ?? '';
      if (label === 'roof length' || label === 'roof width') {
        const lengthField = task_.fields.find(
          (f) => f.label.trim().toLowerCase() === 'roof length',
        );
        const widthField = task_.fields.find(
          (f) => f.label.trim().toLowerCase() === 'roof width',
        );
        const areaField = task_.fields.find(
          (f) => f.label.trim().toLowerCase() === 'total roof area',
        );

        if (lengthField && widthField && areaField) {
          const lengthVal = label === 'roof length'
            ? value
            : (updated[lengthField.fieldId]?.value ?? '');
          const widthVal = label === 'roof width'
            ? value
            : (updated[widthField.fieldId]?.value ?? '');

          const l = parseFloat(lengthVal);
          const w = parseFloat(widthVal);

          if (!isNaN(l) && !isNaN(w) && l > 0 && w > 0) {
            const area = Math.round(l * w * 100) / 100;
            updated[areaField.fieldId] = { value: String(area), type: 'measurement' };
          } else {
            updated[areaField.fieldId] = { value: '', type: 'measurement' };
          }
        }
      }

      return updated;
    });
  }

  function handlePhotosChange(fieldId: string, urls: string[]) {
    setFieldPhotos((prev) => ({ ...prev, [fieldId]: urls }));
  }

  function handleFieldUploadingChange(fieldId: string, uploading: boolean) {
    setUploadingFields((prev) => {
      const next = new Set(prev);
      if (uploading) next.add(fieldId);
      else next.delete(fieldId);
      return next;
    });
  }

  function stopGpsWatch() {
    if (gpsWatchId.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchId.current);
      gpsWatchId.current = null;
    }
    if (gpsTimeoutId.current !== null) {
      clearTimeout(gpsTimeoutId.current);
      gpsTimeoutId.current = null;
    }
  }

  function handleCaptureGps() {
    if (gpsLoading) return;
    if (!navigator.geolocation) {
      _emitToast('Geolocation is not supported by your browser.', 'error');
      return;
    }
    setGpsLoading(true);
    gpsBestReading.current = null;

    const finishWithBestReading = () => {
      stopGpsWatch();
      setGpsLoading(false);
      if (gpsBestReading.current) {
        setLocation(gpsBestReading.current);
      } else {
        _emitToast('Could not get location. Try again.', 'error');
      }
    };

    gpsWatchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const reading = {
          lat:      pos.coords.latitude,
          lng:      pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        if (!gpsBestReading.current || reading.accuracy < gpsBestReading.current.accuracy) {
          gpsBestReading.current = reading;
        }
        if (reading.accuracy < 30) {
          finishWithBestReading();
        }
      },
      () => {
        if (gpsBestReading.current) {
          // A usable reading already arrived — keep it rather than discarding on a later error.
          finishWithBestReading();
        } else {
          stopGpsWatch();
          setGpsLoading(false);
          _emitToast('Could not get location. Try again.', 'error');
        }
      },
      { enableHighAccuracy: true },
    );

    gpsTimeoutId.current = setTimeout(finishWithBestReading, 8000);
  }

  async function handleSubmit() {
    // Belt-and-suspenders: button is already disabled while uploading, but some
    // mobile browsers fire click events on disabled buttons via tap/form submit.
    if (isUploading) {
      _emitToast('Please wait for photos to finish uploading.', 'error');
      return;
    }

    // ── Validate ──────────────────────────────────────────────────────────────
    if (status === 'blocked' && !blockedReason.trim()) {
      setShowErrors(true);
      _emitToast('Please enter a reason for blocking', 'error');
      return;
    }

    const sortedFields = [...task_.fields].sort((a, b) => a.sortOrder - b.sortOrder);

    // Required-field validation only enforced when marking as completed
    if (status === 'completed') {
      const missingRequired = sortedFields.some((f) => {
        if (!f.isRequired) return false;
        if (f.type === 'section_header') return false;
        if (f.type === 'photo_only') return (fieldPhotos[f.fieldId] ?? []).length === 0;
        if (f.type === 'mobile') return !/^\d{10}$/.test(fieldAnswers[f.fieldId]?.value ?? '');
        return !(fieldAnswers[f.fieldId]?.value);
      });

      if (missingRequired) {
        setShowErrors(true);
        _emitToast('Please complete all required fields before marking as done', 'error');
        return;
      }
    }

    setSubmitting(true);

    const t = task_;

    const payload = {
      status,
      blockedReason:    status === 'blocked' ? blockedReason.trim() : null,
      fieldAnswers,
      fieldPhotos,
      location,
      followUpDate:     followUpDate ? new Date(followUpDate + 'T00:00:00') : null,
      previousStatus:   t.status,
      taskNum:          t.taskNum,
      title:            t.title,
      fields:           t.fields,
    };

    if (navigator.onLine) {
      // ── Online path ───────────────────────────────────────────────────────
      try {
        await submitTaskUpdate(t.id, payload);
      } catch {
        _emitToast('Failed to submit. Try again.', 'error');
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      onClose();
    } else {
      // ── Offline path — convert blob: URLs to base64 then enqueue ─────────
      try {
        const safeFieldPhotos = await convertBlobsInRecord(fieldPhotos);

        await enqueueTaskUpdate({
          taskId:         t.id,
          taskNum:        t.taskNum,
          title:          t.title,
          previousStatus: t.status,
          queuedAt:       Date.now(),
          attempts:       0,
          payload: {
            status,
            blockedReason:    status === 'blocked' ? blockedReason.trim() : null,
            fieldAnswers,
            fieldPhotos:      safeFieldPhotos,
            location,
            followUpDate:     followUpDate ? new Date(followUpDate + 'T00:00:00').toISOString() : null,
            submittedAt:      new Date().toISOString(),
            fields:           t.fields,
            completionPhotos: t.completionPhotos ?? [],
          },
        });
        _emitToast('Saved offline — will sync when reconnected', 'info');
        onClose();
      } catch {
        _emitToast('Failed to save offline. Try again.', 'error');
      } finally {
        setSubmitting(false);
      }
    }
  }

  const sortedFields = [...task_.fields].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <Sheet open={!!task} onOpenChange={(o) => { if (!o) handleCloseAttempt(); }}>
      <SheetContent side="right" className="flex flex-col p-0 w-full md:max-w-lg">

        {/* ── Sticky header with gradient ── */}
        <SheetHeader className="border-b border-white/10 px-4 pt-4 pb-3 shrink-0 bg-gradient-to-r from-brand-navy to-brand-blue pr-12">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-white/60">{task_.taskNum}</span>
          </div>
          <SheetTitle className="text-sm leading-snug line-clamp-2 font-semibold text-white">
            {task_.title}
          </SheetTitle>

          {/* Status selector */}
          {!isReadOnly && (
            <div className="flex gap-2 mt-3">
              {STATUS_OPTIONS.map(({ value, label, active }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
                  className={cn(
                    'flex-1 rounded-lg border h-11 px-2 text-sm font-semibold transition-colors',
                    status === value
                      ? active
                      : 'border-white/30 bg-white/10 text-white/80 hover:bg-white/20',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </SheetHeader>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">

          {/* Admin override banner */}
          {showReturnBanner && latestEntry && (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 mb-3">
              <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-1">
                ⚠️ Sent Back By Admin
              </p>
              <p className="text-sm font-semibold text-amber-900">
                {latestEntry.note}
              </p>
            </div>
          )}

          {/* Description */}
          {task_.description && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{task_.description}</p>
            </div>
          )}

          {/* Consumer Mobile */}
          {task_.consumerMobile && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Consumer Mobile</p>
              <p className="text-sm text-gray-700 font-mono">{task_.consumerMobile}</p>
            </div>
          )}

          {/* State */}
          {task_.state && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">State:</span>
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                {task_.state}
              </span>
            </div>
          )}

          {/* District */}
          {task_.district && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">District:</span>
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                {task_.district}
              </span>
            </div>
          )}

          {/* Lead Source */}
          {task_.leadSource && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">Lead Source:</span>
              <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600">
                {task_.leadSource}
              </span>
              {task_.leadSource === 'Employee' && task_.leadSourceEmployeeName && (
                <span className="text-gray-400">({task_.leadSourceEmployeeName})</span>
              )}
              {task_.leadSource === 'Field Engineer' && task_.leadGeneratedByName && (
                <span className="text-gray-400">— {task_.leadGeneratedByName}</span>
              )}
            </div>
          )}

          {/* Pipeline read-only banner */}
          {isReadOnly && (() => {
            const stageMessages: Partial<Record<string, { icon: string; title: string; body: string; border: string; bg: string; titleColor: string; bodyColor: string }>> = {
              proposal:     { icon: '📄', title: 'With Proposal Team',     body: 'Proposal document is being prepared.',           border: 'border-purple-200', bg: 'bg-purple-50', titleColor: 'text-purple-800', bodyColor: 'text-purple-600' },
              field_review: { icon: '👁️', title: 'Awaiting Your Review',   body: 'Proposal is ready. Check your review tasks.',    border: 'border-blue-200',   bg: 'bg-blue-50',   titleColor: 'text-blue-800',   bodyColor: 'text-blue-600'   },
              documents:    { icon: '📎', title: 'Awaiting Documents',     body: 'Field engineer is uploading required documents.', border: 'border-teal-200',   bg: 'bg-teal-50',   titleColor: 'text-teal-800',   bodyColor: 'text-teal-600'   },
              backend:      { icon: '⚙️', title: 'With Backend Team',      body: (() => { const steps = task_.applicationJourneySteps ?? []; if (steps.length === 0) return 'Backend processing is in progress.'; const done = steps.filter((s) => s.status === 'done').length; if (done === steps.length) return '✅ All steps completed. Awaiting next stage.'; const currentStep = steps[task_.currentStepIndex ?? 0]; return `Step ${done + 1} of ${steps.length}: ${currentStep?.label ?? ''}`; })(),             border: 'border-orange-200', bg: 'bg-orange-50', titleColor: 'text-orange-800', bodyColor: 'text-orange-600' },

              completed:    { icon: '✅', title: 'Lead Converted',          body: 'This lead has been successfully converted. All steps are complete.', border: 'border-green-300', bg: 'bg-green-50', titleColor: 'text-green-800', bodyColor: 'text-green-600' },
              dropped:      { icon: '❌', title: 'Lead Dropped',           body: task_.droppedReason ?? 'Consumer declined the proposal.', border: 'border-red-200', bg: 'bg-red-50', titleColor: 'text-red-800', bodyColor: 'text-red-600' },
            };
            const msg = stageMessages[task_.pipelineStage ?? ''] ?? {
              icon: '⏳', title: 'Processing', body: 'This task is being processed.',
              border: 'border-blue-200', bg: 'bg-blue-50', titleColor: 'text-blue-800', bodyColor: 'text-blue-600',
            };
            return (
              <div className={`mx-0 mb-0 rounded-lg border ${msg.border} ${msg.bg} px-4 py-3`}>
                <p className={`text-sm font-semibold ${msg.titleColor}`}>
                  {msg.icon} {msg.title}
                </p>
                <p className={`text-xs mt-0.5 ${msg.bodyColor}`}>{msg.body}</p>
              </div>
            );
          })()}

          {/* Blocked reason */}
          {status === 'blocked' && !isReadOnly && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Reason for blocking <span className="text-brand-red normal-case">*</span>
              </label>
              <Textarea
                value={blockedReason}
                onChange={(e) => setBlockedReason(e.target.value)}
                placeholder="Describe why this task is blocked…"
                rows={3}
                className={cn(
                  showErrors && status === 'blocked' && !blockedReason.trim() && 'border-brand-red',
                )}
              />
              {showErrors && status === 'blocked' && !blockedReason.trim() && (
                <p className="text-xs text-brand-red">Required when blocked</p>
              )}
            </div>
          )}

          {/* Follow-up Date */}
          {!isReadOnly && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Follow-up Date
                <span className="ml-1 text-gray-300 font-normal normal-case tracking-normal">(optional)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  disabled={isReadOnly}
                  className="flex-1 h-11 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue disabled:opacity-50"
                />
                {followUpDate && (
                  <button
                    type="button"
                    onClick={() => setFollowUpDate('')}
                    className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
                  >
                    Clear
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400">
                Set a date to revisit this task — it will appear at the top of your task list on that day.
              </p>
            </div>
          )}

          {/* GPS */}
          {!isReadOnly && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Location</p>
              {location ? (
                <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5">
                  <MapPin className="h-4 w-4 text-green-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-mono text-gray-700 block">
                      {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                    </span>
                    {location.accuracy !== undefined && (
                      <span className="text-xs text-gray-500">
                        Location captured (±{Math.round(location.accuracy)}m)
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleCaptureGps}
                    disabled={gpsLoading}
                    className="text-xs font-medium text-brand-blue hover:underline disabled:opacity-50"
                  >
                    Re-capture
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleCaptureGps}
                  disabled={gpsLoading}
                  className="flex items-center gap-2 w-full justify-center rounded-xl border-2 border-dashed border-brand-blue/30 bg-blue-50 px-4 py-3 text-sm font-medium text-brand-blue hover:bg-blue-100 transition-colors disabled:opacity-50"
                >
                  {gpsLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MapPin className="h-4 w-4" />
                  )}
                  {gpsLoading ? 'Getting location…' : 'Capture Location'}
                </button>
              )}
            </div>
          )}

          {/* Checklist */}
          {sortedFields.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                Task Checklist
              </p>
              {sortedFields.map((field) => (
                <ChecklistItem
                  key={field.fieldId}
                  field={field}
                  answer={fieldAnswers[field.fieldId]?.value ?? null}
                  photos={fieldPhotos[field.fieldId] ?? []}
                  onAnswerChange={handleAnswerChange}
                  onPhotosChange={handlePhotosChange}
                  onUploadingChange={handleFieldUploadingChange}
                  showError={showErrors && status === 'completed'}
                  taskNum={task_.taskNum}
                  disabled={isReadOnly}
                  engineerCode={currentUser?.engineerCode ?? ''}
                  engineerName={currentUser?.name ?? ''}
                />
              ))}
            </div>
          )}

        </div>

        {/* ── Sticky footer ── */}
        {!isReadOnly && (
          <div className="border-t border-gray-100 px-4 py-4 shrink-0">
            <Button
              className="w-full h-12 text-base font-bold bg-brand-green hover:bg-brand-green/90 border-0"
              onClick={handleSubmit}
              disabled={submitting || isUploading}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Submitting…
                </span>
              ) : isUploading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Uploading photos… please wait
                </span>
              ) : (
                'Submit Update'
              )}
            </Button>
          </div>
        )}

        {/* ── Unsaved-changes confirmation ── */}
        {confirmClose && (
          <div className="mx-4 mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-800 mb-2">
              You have unsaved changes. Close without submitting?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-xs text-gray-600 bg-white"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => { setConfirmClose(false); onClose(); }}
                className="flex-1 px-3 py-1.5 bg-amber-600 text-white rounded text-xs font-medium"
              >
                Close anyway
              </button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
