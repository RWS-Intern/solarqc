import { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuthStore }        from '@/store/authStore';
import { useTaskSubmit }       from '@/hooks/useTaskSubmit';
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

  // ── Form state ──────────────────────────────────────────────────────────────
  const [status,           setStatus]           = useState<TaskStatus>('in_progress');
  const [blockedReason,    setBlockedReason]    = useState('');
  const [fieldAnswers,     setFieldAnswers]     = useState<Record<string, { value: string; type: FieldType }>>({});
  const [fieldPhotos,      setFieldPhotos]      = useState<Record<string, string[]>>({});
  const [location,         setLocation]         = useState<{ lat: number; lng: number } | null>(null);
  const [followUpDate,     setFollowUpDate]     = useState<string>('');
  const [gpsLoading,       setGpsLoading]       = useState(false);
  const [submitting,       setSubmitting]       = useState(false);
  const [showErrors,       setShowErrors]       = useState(false);

  // Initialise state when the drawer opens for a new task.
  // Guarded by initialisedForTaskId so Firestore real-time updates
  // never overwrite the engineer's local photo/answer changes mid-session.
  useEffect(() => {
    if (!task) {
      initialisedForTaskId.current = null;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, task]);

  if (!task) return null;

  // Alias after guard so all closures below reference a non-nullable value
  const task_ = task;

  const isReadOnly = task_.status === 'completed' && currentUser?.role !== 'admin';

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

  function handleCaptureGps() {
    if (!navigator.geolocation) {
      _emitToast('Geolocation is not supported by your browser.', 'error');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsLoading(false);
      },
      () => {
        _emitToast('Could not get location. Try again.', 'error');
        setGpsLoading(false);
      },
      { timeout: 15000, enableHighAccuracy: true },
    );
  }

  async function handleSubmit() {
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
    <Sheet open={!!task} onOpenChange={(o) => { if (!o && !submitting) onClose(); }}>
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

          {/* Read-only banner */}
          {isReadOnly && (
            <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
              This task has been completed.
            </div>
          )}

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
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Location</p>
            {location ? (
              <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5">
                <MapPin className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-sm font-mono text-gray-700 flex-1">
                  {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                </span>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={handleCaptureGps}
                    disabled={gpsLoading}
                    className="text-xs font-medium text-brand-blue hover:underline disabled:opacity-50"
                  >
                    Re-capture
                  </button>
                )}
              </div>
            ) : !isReadOnly ? (
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
            ) : (
              <p className="text-sm text-gray-400 italic">No location captured</p>
            )}
          </div>

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
              disabled={submitting}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Submitting…
                </span>
              ) : (
                'Submit Update'
              )}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
