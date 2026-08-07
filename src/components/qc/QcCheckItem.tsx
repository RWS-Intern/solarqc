import { useState } from 'react';
import { Camera } from 'lucide-react';
import { PhotoZone } from '@/components/photos/PhotoZone';
import { MeasurementInput } from '@/components/qc/MeasurementInput';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { QcFieldDefinition, QcAnswer, CheckStatus, Severity } from '@/types/qc';
import type { QcValidationIssue } from '@/utils/qcValidation';

const SEVERITY_BADGE: Record<Severity, { bg: string; label: string }> = {
  critical: { bg: 'bg-red-100 text-red-700',    label: 'Critical' },
  major:    { bg: 'bg-amber-100 text-amber-700', label: 'Major'    },
  minor:    { bg: 'bg-gray-100 text-gray-600',   label: 'Minor'    },
};

const STATUS_STYLE: Record<Exclude<CheckStatus, null>, { active: string; label: string }> = {
  pass: { active: 'bg-green-600 text-white border-green-600', label: 'PASS' },
  fail: { active: 'bg-red-600 text-white border-red-600',     label: 'FAIL' },
  na:   { active: 'bg-gray-500 text-white border-gray-500',   label: 'N/A'  },
};

interface QcCheckItemProps {
  field:          QcFieldDefinition;
  answer:         QcAnswer | undefined;
  onAnswerChange: (fieldId: string, patch: Partial<QcAnswer>) => void;
  allIssues:      QcValidationIssue[];
  qcNum?:         string;
  disabled?:      boolean;
}

export function QcCheckItem({ field, answer, onAnswerChange, allIssues, qcNum, disabled }: QcCheckItemProps) {
  // Live validation, not submit-time: this field's own outstanding issues
  // only surface once the inspector has actually interacted with it (a
  // status pick, or blurring a text/measurement control) — plan §5.2's
  // explicit target is per-field feedback as they go, not a wall of errors
  // only a wrong submit would have revealed.
  const [touched, setTouched] = useState(false);

  const fieldIssues = touched ? allIssues.filter((i) => i.fieldId === field.fieldId) : [];
  const hasIssue = (code: QcValidationIssue['code']) => fieldIssues.some((i) => i.code === code);

  function setStatus(status: CheckStatus) {
    onAnswerChange(field.fieldId, { status });
    setTouched(true);
  }

  const targetMethod = [field.target, field.method ? `🔍 ${field.method}` : null].filter(Boolean);

  const header = (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2">
        {field.code && <span className="font-mono text-xs text-gray-400 shrink-0 mt-0.5">{field.code}</span>}
        <span className="text-sm font-semibold text-gray-900 flex-1">
          {field.label}
          {field.isRequired && <span className="text-brand-red ml-0.5" aria-hidden>*</span>}
        </span>
        {field.severity && (
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0', SEVERITY_BADGE[field.severity].bg)}>
            {SEVERITY_BADGE[field.severity].label}
          </span>
        )}
      </div>
      {field.verifyText && <p className="text-xs text-gray-500">{field.verifyText}</p>}
      {targetMethod.length > 0 && (
        <p className="text-xs text-gray-400">{targetMethod.join('  ·  ')}</p>
      )}
    </div>
  );

  if (field.type === 'signature') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-3">
        {header}
        <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-xs text-gray-400">
          Signature capture is coming in a later update.
        </p>
      </div>
    );
  }

  if (field.type === 'photo_only') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-3">
        {header}
        <PhotoZone
          label={field.label}
          photos={answer?.photoUrls ?? []}
          onPhotosChange={(urls) => { onAnswerChange(field.fieldId, { photoUrls: urls }); setTouched(true); }}
          minPhotos={field.photoRequired ? (field.minPhotos ?? 1) : 0}
          maxPhotos={field.maxPhotos ?? 5}
          qcNum={qcNum}
          fieldId={field.fieldId}
          capture="environment"
          disabled={disabled}
        />
        {hasIssue('required') && <p className="text-xs text-brand-red">This point is required.</p>}
      </div>
    );
  }

  if (field.type === 'number' || field.type === 'text' || field.type === 'longtext' || field.type === 'date') {
    const inputType = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text';
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-3">
        {header}
        {field.type === 'longtext' ? (
          <Textarea
            value={answer?.value ?? ''}
            onChange={(e) => onAnswerChange(field.fieldId, { value: e.target.value })}
            onBlur={() => setTouched(true)}
            disabled={disabled}
            className="text-sm"
          />
        ) : (
          <input
            type={inputType}
            value={field.type === 'number' ? (answer?.numericValue ?? '') : (answer?.value ?? '')}
            onChange={(e) => onAnswerChange(field.fieldId, field.type === 'number'
              ? { numericValue: e.target.value === '' ? undefined : Number(e.target.value) }
              : { value: e.target.value })}
            onBlur={() => setTouched(true)}
            disabled={disabled}
            className="h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        )}
        {hasIssue('required') && <p className="text-xs text-brand-red">This point is required.</p>}
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-3">
        {header}
        <select
          value={answer?.value ?? ''}
          onChange={(e) => { onAnswerChange(field.fieldId, { value: e.target.value }); setTouched(true); }}
          disabled={disabled}
          className="h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">— Select —</option>
          {field.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        {hasIssue('required') && <p className="text-xs text-brand-red">This point is required.</p>}
      </div>
    );
  }

  // ── passfail / measurement — the two types the real 54-point checklist
  // actually uses; full treatment per the mockup. ─────────────────────────
  const showNA = field.allowNA !== false;
  const remarkRequired = hasIssue('remark_required');
  const photoIssue = hasIssue('photo_required') || hasIssue('photo_required_on_fail');

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-3">
      {header}

      {field.type === 'measurement' && (
        <MeasurementInput
          value={answer?.numericValue}
          unit={field.unit}
          expectedMin={field.expectedMin}
          expectedMax={field.expectedMax}
          onChange={(v) => onAnswerChange(field.fieldId, { numericValue: v })}
          onBlur={() => setTouched(true)}
          disabled={disabled}
        />
      )}

      <div className={cn('grid gap-2', showNA ? 'grid-cols-3' : 'grid-cols-2')}>
        {(['pass', 'fail', 'na'] as const)
          .filter((s) => s !== 'na' || showNA)
          .map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => setStatus(s)}
              className={cn(
                'h-11 rounded-lg border text-sm font-semibold transition-colors',
                answer?.status === s ? STATUS_STYLE[s].active : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
              )}
            >
              {STATUS_STYLE[s].label}
            </button>
          ))}
      </div>
      {hasIssue('required') && <p className="text-xs text-brand-red">This point is required.</p>}

      <div className="flex flex-col gap-1.5">
        <p className={cn('flex items-center gap-1.5 text-xs font-medium', photoIssue ? 'text-brand-red' : 'text-gray-500')}>
          <Camera className="h-3.5 w-3.5" />
          {field.photoRequired
            ? `Photo required (${field.minPhotos ?? 1}–${field.maxPhotos ?? 5})`
            : 'Photo evidence (optional)'}
        </p>
        <PhotoZone
          label={field.label}
          photos={answer?.photoUrls ?? []}
          onPhotosChange={(urls) => { onAnswerChange(field.fieldId, { photoUrls: urls }); setTouched(true); }}
          minPhotos={field.photoRequired ? (field.minPhotos ?? 1) : 0}
          maxPhotos={field.maxPhotos ?? 5}
          qcNum={qcNum}
          fieldId={field.fieldId}
          capture="environment"
          disabled={disabled}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">
          Remark {remarkRequired ? <span className="text-brand-red">(required for a Fail)</span> : '(optional)'}
        </label>
        <Textarea
          value={answer?.remark ?? ''}
          onChange={(e) => onAnswerChange(field.fieldId, { remark: e.target.value })}
          onBlur={() => setTouched(true)}
          disabled={disabled}
          className={cn('text-sm', remarkRequired && 'border-brand-red focus-visible:ring-brand-red')}
        />
        {remarkRequired && <p className="text-xs text-brand-red">⚠ Remark required for a Fail.</p>}
      </div>
    </div>
  );
}
