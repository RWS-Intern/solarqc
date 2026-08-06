import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Plus, Trash2, ChevronUp, ChevronDown, Save, Check, X, ChevronRight, Pencil, Route, FileText } from 'lucide-react';
import { collection, doc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { backfillEngineerDistrictCounts, reconcileSaleClosed } from '@/firebase/initAppConfig';
import { db }                 from '@/firebase/config';
import { toTitleCase }        from '@/utils/districtUtils';
import { useAppConfig }       from '@/hooks/useAppConfig';
import { useAuthStore }       from '@/store/authStore';
import { useTemplateActions } from '@/hooks/useTemplateActions';
import { _emitToast }         from '@/components/ui/toast';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { cn }      from '@/lib/utils';
import type { FieldDefinition, FieldType, JourneyStepDefinition } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  yesno:          'Yes / No',
  text:           'Text',
  mobile:         'Mobile Number (10 digits)',
  number:         'Number',
  select:         'Select (options)',
  photo_only:     'Photo only',
  date:           'Date (calendar)',
  measurement:    'Measurement (number + unit)',
  age:            'Age (years + months)',
  section_header: 'Section Header (divider)',
};

const FIELD_TYPE_COLOURS: Partial<Record<FieldType, string>> = {
  yesno:          'bg-green-100 text-green-700',
  text:           'bg-sky-100 text-sky-700',
  mobile:         'bg-cyan-100 text-cyan-700',
  number:         'bg-violet-100 text-violet-700',
  select:         'bg-amber-100 text-amber-700',
  photo_only:     'bg-pink-100 text-pink-700',
  date:           'bg-teal-100 text-teal-700',
  measurement:    'bg-orange-100 text-orange-700',
  age:            'bg-indigo-100 text-indigo-700',
  section_header: 'bg-gray-100 text-gray-500',
};

function newFieldId() {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function makeEmptyField(sortOrder: number): FieldDefinition {
  return {
    fieldId:    newFieldId(),
    label:      '',
    type:       'yesno',
    isRequired: true,
    options:    [],
    sortOrder,
    unit:       '',
  };
}

// ─── AddOptionInput ───────────────────────────────────────────────────────────

function AddOptionInput({ onAdd }: { onAdd: (opt: string) => void }) {
  const [val, setVal] = useState('');

  function commit() {
    const trimmed = val.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setVal('');
  }

  return (
    <div className="flex gap-2 mt-1">
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
        placeholder="Type an option…"
        className="h-9 text-sm flex-1"
      />
      <button
        type="button"
        onClick={commit}
        disabled={!val.trim()}
        className="flex items-center gap-1 rounded-md border border-brand-blue bg-brand-blue/5 px-3 text-xs font-semibold text-brand-blue hover:bg-brand-blue/10 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus className="h-3.5 w-3.5" />
        Add
      </button>
    </div>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────

interface FieldRowProps {
  field:        FieldDefinition;
  index:        number;
  total:        number;
  expanded:     boolean;
  onExpand:     (i: number) => void;
  onChange:     (index: number, patch: Partial<FieldDefinition>) => void;
  onDelete:     (index: number) => void;
  onMoveUp:     (index: number) => void;
  onMoveDown:   (index: number) => void;
}

function FieldRow({
  field, index, total, expanded, onExpand, onChange, onDelete, onMoveUp, onMoveDown,
}: FieldRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const typeBadge = FIELD_TYPE_COLOURS[field.type] ?? 'bg-gray-100 text-gray-500';
  const typeLabel = FIELD_TYPE_LABELS[field.type];

  // ── Collapsed section_header ─────────────────────────────────────────────
  if (!expanded && field.type === 'section_header') {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="flex-1 h-px bg-gray-200" />
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
            {field.label || 'Untitled Section'}
          </span>
          <button
            type="button"
            onClick={() => onExpand(index)}
            className="rounded p-0.5 text-gray-300 hover:text-brand-blue"
            aria-label="Edit section"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
    );
  }

  // ── Collapsed regular field ───────────────────────────────────────────────
  if (!expanded) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 cursor-pointer hover:border-brand-blue/40 hover:bg-blue-50/30 transition-colors group"
        onClick={() => onExpand(index)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onExpand(index); }}
        aria-label={`Edit field: ${field.label || 'Untitled field'}`}
      >
        <span className="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue text-[10px] font-bold">
          {index + 1}
        </span>
        <span className="flex-1 text-sm font-medium text-gray-800 truncate">
          {field.label || <span className="text-gray-400 italic">Untitled field</span>}
          {field.isRequired && <span className="text-brand-red ml-0.5 text-xs" aria-hidden>*</span>}
        </span>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0', typeBadge)}>
          {typeLabel}
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-brand-blue shrink-0" />
      </div>
    );
  }

  // ── Expanded edit form ────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-brand-blue/30 bg-white shadow-sm p-4 flex flex-col gap-3">
      {/* Row header */}
      <div className="flex items-center gap-2">
        <span className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue text-xs font-bold">
          {index + 1}
        </span>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', typeBadge)}>
          {typeLabel}
        </span>
        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={() => onMoveUp(index)}
            disabled={index === 0}
            className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
            aria-label="Move up"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMoveDown(index)}
            disabled={index === total - 1}
            className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
            aria-label="Move down"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1 ml-1">
              <span className="text-xs text-red-600 font-medium">Delete?</span>
              <button
                type="button"
                onClick={() => onDelete(index)}
                className="rounded px-2 py-0.5 text-xs font-semibold bg-red-600 text-white hover:bg-red-700"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded p-1 text-gray-300 hover:text-red-500"
              aria-label="Delete field"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onExpand(-1)}
            className="rounded p-1 text-brand-blue hover:text-brand-navy ml-1"
            aria-label="Collapse"
          >
            <Check className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Label */}
      <div className="flex flex-col gap-1">
        <Label htmlFor={`label-${field.fieldId}`} className="text-xs">Label</Label>
        <Input
          id={`label-${field.fieldId}`}
          value={field.label}
          onChange={(e) => onChange(index, { label: e.target.value })}
          placeholder="e.g. Panel Condition"
          className="h-11 text-sm"
          autoFocus
        />
      </div>

      {/* Type + Required row */}
      <div className="flex gap-3 flex-wrap items-end">
        <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
          <Label htmlFor={`type-${field.fieldId}`} className="text-xs">Field type</Label>
          <select
            id={`type-${field.fieldId}`}
            value={field.type}
            onChange={(e) => onChange(index, { type: e.target.value as FieldType, options: [] })}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {(Object.entries(FIELD_TYPE_LABELS) as [FieldType, string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        {field.type !== 'section_header' && (
          <div className="flex items-center gap-2 pb-1.5">
            <input
              type="checkbox"
              id={`req-${field.fieldId}`}
              checked={field.isRequired}
              onChange={(e) => onChange(index, { isRequired: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-brand-blue accent-brand-blue"
            />
            <Label htmlFor={`req-${field.fieldId}`} className="text-xs cursor-pointer">Required</Label>
          </div>
        )}
      </div>

      {/* Options — only for select type */}
      {field.type === 'select' && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Options</Label>
          {field.options.length > 0 && (
            <div className="flex flex-col gap-1 mb-1">
              {field.options.map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5">
                  <span className="flex-1 text-sm text-gray-700">{opt}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = field.options.filter((_, j) => j !== oi);
                      onChange(index, { options: next });
                    }}
                    className="text-gray-300 hover:text-red-500"
                    aria-label={`Remove option ${opt}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <AddOptionInput
            onAdd={(opt) => {
              if (!field.options.includes(opt)) {
                onChange(index, { options: [...field.options, opt] });
              }
            }}
          />
        </div>
      )}

      {/* Unit — for measurement type */}
      {field.type === 'measurement' && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Unit label</Label>
          <Input
            value={field.unit ?? ''}
            onChange={(e) => onChange(index, { unit: e.target.value })}
            placeholder="e.g. mtr, sq.mtr, KW, KVA"
            className="h-9 text-sm"
          />
          <p className="text-xs text-gray-400">
            Shown next to the number input on the engineer&apos;s form
          </p>
        </div>
      )}

      {/* Subtitle — for section_header type */}
      {field.type === 'section_header' && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Subtitle (optional)</Label>
          <Input
            value={field.unit ?? ''}
            onChange={(e) => onChange(index, { unit: e.target.value })}
            placeholder="Optional subtitle text below the divider"
            className="h-9 text-sm"
          />
        </div>
      )}

      {/* Collapse button */}
      <button
        type="button"
        onClick={() => onExpand(-1)}
        className="self-end flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline mt-1"
      >
        <Check className="h-3.5 w-3.5" />
        Done
      </button>
    </div>
  );
}

// ─── Application Journey Editor ───────────────────────────────────────────────

function newStepId() {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function ApplicationJourneyEditor() {
  const { config, loading }          = useAppConfig();
  const { saveBackendJourneySteps }  = useTemplateActions();

  const [journeyTab,  setJourneyTab]  = useState<'cash' | 'loan'>('cash');
  const [cashFields,  setCashFields]  = useState<JourneyStepDefinition[]>([]);
  const [loanFields,  setLoanFields]  = useState<JourneyStepDefinition[]>([]);
  const [dirty,       setDirty]       = useState(false);
  const [saving,      setSaving]      = useState(false);

  useEffect(() => {
    if (!loading) {
      setCashFields([...(config.backendCashSteps ?? [])].sort((a, b) => a.sortOrder - b.sortOrder));
      setLoanFields([...(config.backendLoanSteps ?? [])].sort((a, b) => a.sortOrder - b.sortOrder));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.backendCashSteps?.length, config.backendLoanSteps?.length, loading]);

  function handleStepLabelChange(idx: number, value: string, isLoan: boolean) {
    const setter = isLoan ? setLoanFields : setCashFields;
    setter((prev) => { const next = [...prev]; next[idx] = { ...next[idx], label: value }; return next; });
    setDirty(true);
  }

  function handleMoveStepUp(idx: number, isLoan: boolean) {
    if (idx === 0) return;
    const setter = isLoan ? setLoanFields : setCashFields;
    setter((prev) => { const next = [...prev]; [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; return next; });
    setDirty(true);
  }

  function handleMoveStepDown(idx: number, isLoan: boolean) {
    const setter = isLoan ? setLoanFields : setCashFields;
    setter((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev]; [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]; return next;
    });
    setDirty(true);
  }

  function handleDeleteStep(idx: number, isLoan: boolean) {
    const setter = isLoan ? setLoanFields : setCashFields;
    setter((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }

  function handleAddStep(isLoan: boolean) {
    const setter = isLoan ? setLoanFields : setCashFields;
    setter((prev) => [
      ...prev,
      { stepId: newStepId(), label: '', type: 'yesno', sortOrder: prev.length },
    ]);
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveBackendJourneySteps(
        cashFields.map((f, i) => ({ ...f, sortOrder: i })),
        loanFields.map((f, i) => ({ ...f, sortOrder: i })),
      );
      setDirty(false);
    } catch {
      // error toasted in saveBackendJourneySteps
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-200" />
        ))}
      </div>
    );
  }

  const fields   = journeyTab === 'loan' ? loanFields : cashFields;
  const isLoan   = journeyTab === 'loan';

  return (
    <div>
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <p className="text-sm text-gray-500 flex-1">
          Define the step-by-step journey shown to the backend team for each payment type.
        </p>
        <Button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="w-full sm:w-auto flex items-center justify-center gap-1.5 h-11"
        >
          {saving ? (
            <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Saving…</>
          ) : (
            <><Save className="h-4 w-4" />Save</>
          )}
        </Button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit mb-4">
        <button
          type="button"
          onClick={() => setJourneyTab('cash')}
          className={cn(
            'rounded-md px-4 py-1.5 text-sm font-medium transition-all',
            journeyTab === 'cash'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          💵 Cash ({cashFields.length} steps)
        </button>
        <button
          type="button"
          onClick={() => setJourneyTab('loan')}
          className={cn(
            'rounded-md px-4 py-1.5 text-sm font-medium transition-all',
            journeyTab === 'loan'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          🏦 Loan ({loanFields.length} steps)
        </button>
      </div>

      {/* Step list */}
      {fields.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-12 text-center text-sm text-gray-400 mb-4">
          <p className="mb-1 font-medium">No steps yet</p>
          <p>Add steps to build the {isLoan ? 'loan' : 'cash'} journey.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-4">
          {fields.map((step, idx) => (
            <div
              key={step.stepId}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5"
            >
              <span className="text-xs font-mono text-gray-400 w-6 shrink-0">
                {idx + 1}.
              </span>
              <input
                type="text"
                value={step.label}
                onChange={(e) => handleStepLabelChange(idx, e.target.value, isLoan)}
                className="flex-1 text-sm text-gray-800 bg-transparent border-none outline-none min-w-0"
                placeholder="Step label..."
              />
              <span className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                step.type === 'photo'
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200',
              )}>
                {step.type === 'photo' ? '📷 Photo + Date' : '✓ Yes/No + Date'}
              </span>
              <button
                type="button"
                onClick={() => handleMoveStepUp(idx, isLoan)}
                disabled={idx === 0}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                aria-label="Move up"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleMoveStepDown(idx, isLoan)}
                disabled={idx === fields.length - 1}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                aria-label="Move down"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleDeleteStep(idx, isLoan)}
                className="text-red-400 hover:text-red-600"
                aria-label="Delete step"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Button
        variant="outline"
        onClick={() => handleAddStep(isLoan)}
        className="w-full flex items-center gap-2 border-dashed"
      >
        <Plus className="h-4 w-4" />
        Add Step
      </Button>
    </div>
  );
}

// ─── Sale Closed Mapping Editor ───────────────────────────────────────────────

type SaleClosedFormKey = 'survey' | 'documents';
type SaleClosedRoleKey = 'typeFieldId' | 'amountFieldId' | 'imageFieldId';

function fieldOptionsFor(template: FieldDefinition[]): { fieldId: string; label: string }[] {
  return template
    .filter((f) => f.type !== 'section_header')
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((f) => ({ fieldId: f.fieldId, label: f.label || '(untitled)' }));
}

function SaleClosedMappingEditor() {
  const { config, loading }       = useAppConfig();
  const { saveSaleClosedConfig }  = useTemplateActions();
  const { currentUser }           = useAuthStore();
  const isViewOnly                = currentUser?.role === 'view_only';

  const [surveyType,   setSurveyType]   = useState<string>('');
  const [surveyAmount, setSurveyAmount] = useState<string>('');
  const [surveyImage,  setSurveyImage]  = useState<string>('');
  const [docsType,     setDocsType]     = useState<string>('');
  const [docsAmount,   setDocsAmount]   = useState<string>('');
  const [docsImage,    setDocsImage]    = useState<string>('');
  const [dirty,  setDirty]  = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !dirty) {
      const saved = config.saleClosedConfig;
      setSurveyType(saved?.survey.typeFieldId     ?? '');
      setSurveyAmount(saved?.survey.amountFieldId  ?? '');
      setSurveyImage(saved?.survey.imageFieldId    ?? '');
      setDocsType(saved?.documents.typeFieldId     ?? '');
      setDocsAmount(saved?.documents.amountFieldId ?? '');
      setDocsImage(saved?.documents.imageFieldId   ?? '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.saleClosedConfig, loading]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-200" />
        ))}
      </div>
    );
  }

  const surveyOptions    = fieldOptionsFor(config.taskTemplate ?? []);
  const documentsOptions = fieldOptionsFor(config.documentTemplate ?? []);

  function isMissing(fieldId: string, options: { fieldId: string }[]): boolean {
    return fieldId !== '' && !options.some((o) => o.fieldId === fieldId);
  }

  function setValue(form: SaleClosedFormKey, role: SaleClosedRoleKey, value: string) {
    const setterMap: Record<SaleClosedFormKey, Record<SaleClosedRoleKey, (v: string) => void>> = {
      survey:    { typeFieldId: setSurveyType,  amountFieldId: setSurveyAmount, imageFieldId: setSurveyImage },
      documents: { typeFieldId: setDocsType,    amountFieldId: setDocsAmount,   imageFieldId: setDocsImage   },
    };
    setterMap[form][role](value);
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveSaleClosedConfig({
        survey: {
          typeFieldId:   surveyType   || null,
          amountFieldId: surveyAmount || null,
          imageFieldId:  surveyImage  || null,
        },
        documents: {
          typeFieldId:   docsType   || null,
          amountFieldId: docsAmount || null,
          imageFieldId:  docsImage  || null,
        },
      });
      setDirty(false);
    } catch {
      // error toasted in saveSaleClosedConfig
    } finally {
      setSaving(false);
    }
  }

  function renderDropdown(
    label:   string,
    form:    SaleClosedFormKey,
    role:    SaleClosedRoleKey,
    value:   string,
    options: { fieldId: string; label: string }[],
  ) {
    const missing = isMissing(value, options);
    return (
      <div className="flex flex-col gap-1">
        <Label className="text-xs">{label}</Label>
        <select
          value={value}
          disabled={isViewOnly}
          onChange={(e) => setValue(form, role, e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <option value="">— None —</option>
          {options.map((o) => (
            <option key={o.fieldId} value={o.fieldId}>{o.label}</option>
          ))}
        </select>
        {missing && (
          <p className="text-xs text-amber-600">
            ⚠ Previously selected field no longer exists — please re-select.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <p className="text-sm text-gray-500 flex-1">
          Map the fields used to detect an advance/token payment.
        </p>
        {!isViewOnly && (
          <Button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 h-11"
          >
            {saving ? (
              <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Saving…</>
            ) : (
              <><Save className="h-4 w-4" />Save</>
            )}
          </Button>
        )}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 mb-5 text-sm text-blue-800">
        <FileText className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
        <span>
          Pick which questions capture the advance/token payment. A lead counts as
          Sales Closed when Payment Type, Amount, and Image are all filled — in
          either the Survey or the Documents form.
        </span>
      </div>

      {/* Survey group */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Survey form
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {renderDropdown('Payment Type field', 'survey', 'typeFieldId',   surveyType,   surveyOptions)}
          {renderDropdown('Amount field',       'survey', 'amountFieldId', surveyAmount, surveyOptions)}
          {renderDropdown('Image field',        'survey', 'imageFieldId',  surveyImage,  surveyOptions)}
        </div>
      </div>

      {/* Documents group */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Documents form
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {renderDropdown('Payment Type field', 'documents', 'typeFieldId',   docsType,   documentsOptions)}
          {renderDropdown('Amount field',       'documents', 'amountFieldId', docsAmount, documentsOptions)}
          {renderDropdown('Image field',        'documents', 'imageFieldId',  docsImage,  documentsOptions)}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function TemplatePage() {
  const { currentUser }      = useAuthStore();
  const isViewOnly           = currentUser?.role === 'view_only';
  const { config, loading }  = useAppConfig();
  const { saveTemplate, saveDocumentTemplate, saveDistrictsByState, saveLeadSources } = useTemplateActions();

  const [activeTab, setActiveTab] = useState<'survey' | 'documents' | 'backend'>('survey');

  const [fields,      setFields]      = useState<FieldDefinition[]>([]);
  const [dirty,       setDirty]       = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const [docFields,      setDocFields]      = useState<FieldDefinition[]>([]);
  const [docDirty,       setDocDirty]       = useState(false);
  const [docSaving,      setDocSaving]      = useState(false);
  const [docExpandedIdx, setDocExpandedIdx] = useState<number | null>(null);

  const [recalculating,                 setRecalculating]                = useState(false);
  const [recalculatingEngineerDistrict, setRecalculatingEngineerDistrict] = useState(false);
  const [migratingState,                setMigratingState]               = useState(false);
  const [migratingCorrections, setMigratingCorrections] = useState(false);
  const [backfillingSaleClosed, setBackfillingSaleClosed] = useState(false);

  const [districtsByState,       setDistrictsByState]       = useState<Record<string, string[]>>({});
  const [newState,               setNewState]               = useState('');
  const [newDistrictInput,       setNewDistrictInput]       = useState<Record<string, string>>({});
  const [districtsByStateDirty,  setDistrictsByStateDirty]  = useState(false);
  const [savingDistrictsByState, setSavingDistrictsByState] = useState(false);

  const [leadSources,       setLeadSources]       = useState<string[]>([]);
  const [newLeadSource,     setNewLeadSource]      = useState('');
  const [leadSourcesDirty,  setLeadSourcesDirty]  = useState(false);
  const [savingLeadSources, setSavingLeadSources]  = useState(false);


  useEffect(() => {
    if (!loading && !districtsByStateDirty) {
      setDistrictsByState(config.districtsByState ?? {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.districtsByState, loading]);

  useEffect(() => {
    if (!loading && !leadSourcesDirty) {
      setLeadSources(config.leadSources ?? []);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.leadSources, loading]);

  function handleAddState() {
    const val = toTitleCase(newState.trim());
    if (!val || Object.keys(districtsByState).some((s) => s.toLowerCase() === val.toLowerCase())) return;
    setDistrictsByState((prev) => ({ ...prev, [val]: [] }));
    setNewState('');
    setDistrictsByStateDirty(true);
  }

  function handleRemoveState(state: string) {
    const districtCount = districtsByState[state]?.length ?? 0;
    if (districtCount > 0) {
      const confirmed = window.confirm(
        `"${state}" has ${districtCount} district(s) under it. Removing this ` +
        `state will also remove all its districts from the list. Continue?`
      );
      if (!confirmed) return;
    }
    setDistrictsByState((prev) => {
      const next = { ...prev };
      delete next[state];
      return next;
    });
    setDistrictsByStateDirty(true);
  }

  function handleAddDistrictToState(state: string) {
    const val = toTitleCase((newDistrictInput[state] ?? '').trim());
    const existing = districtsByState[state] ?? [];
    if (!val || existing.some((d) => d.toLowerCase() === val.toLowerCase())) return;
    setDistrictsByState((prev) => ({ ...prev, [state]: [...existing, val] }));
    setNewDistrictInput((prev) => ({ ...prev, [state]: '' }));
    setDistrictsByStateDirty(true);
  }

  function handleRemoveDistrictFromState(state: string, district: string) {
    setDistrictsByState((prev) => ({
      ...prev,
      [state]: (prev[state] ?? []).filter((d) => d !== district),
    }));
    setDistrictsByStateDirty(true);
  }

  async function handleSaveDistrictsByState() {
    setSavingDistrictsByState(true);
    try {
      await saveDistrictsByState(districtsByState);
      setDistrictsByStateDirty(false);
    } catch {
      // toast shown by saveDistrictsByState
    } finally {
      setSavingDistrictsByState(false);
    }
  }

  async function handleRecalculateEngineerDistrictCounts() {
    if (currentUser?.role !== 'admin') return;
    setRecalculatingEngineerDistrict(true);
    try {
      const tasksSnap = await getDocs(
        query(collection(db, 'tasks'), where('archived', '==', false))
      );
      const confirmed = window.confirm(
        `Recalculate engineer & district counts from all ${tasksSnap.size} non-archived tasks?\n\nThis will overwrite stored values. This cannot be undone.`
      );
      if (!confirmed) return;

      await backfillEngineerDistrictCounts();
      _emitToast('Engineer & district counts recalculated successfully.', 'success');
    } catch (err) {
      console.error('[recalculateEngineerDistrict] failed:', err);
      _emitToast('Failed to recalculate engineer & district counts. Try again.', 'error');
    } finally {
      setRecalculatingEngineerDistrict(false);
    }
  }

  async function handleMigrateToMaharashtra() {
    if (currentUser?.role !== 'admin') return;
    setMigratingState(true);
    try {
      // Check if already migrated
      if (config.districtsByState && Object.keys(config.districtsByState).length > 0) {
        const proceed = window.confirm(
          'States & Districts data already exists. Running this again will ' +
          'ADD to the existing Maharashtra district list (safe, no duplicates ' +
          'due to case-insensitive matching) but will NOT re-touch tasks/' +
          'engineers that already have a state set. Continue?'
        );
        if (!proceed) { setMigratingState(false); return; }
      }

      const existingFlatDistricts = config.districts ?? [];

      // Count tasks that need state set
      const tasksSnap = await getDocs(query(
        collection(db, 'tasks'),
        where('archived', '==', false),
      ));
      const tasksNeedingState = tasksSnap.docs.filter((d) => {
        const data = d.data();
        return !!data['district'] && !data['state'];
      });

      // Count users that need state set
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersNeedingState = usersSnap.docs.filter((d) => {
        const data = d.data();
        return !!data['district'] && !data['state'];
      });

      const confirmed = window.confirm(
        `This will:\n\n` +
        `1. Move ${existingFlatDistricts.length} existing districts under "Maharashtra"\n` +
        `2. Set state = "Maharashtra" on ${tasksNeedingState.length} existing tasks\n` +
        `3. Set state = "Maharashtra" on ${usersNeedingState.length} existing field engineers\n\n` +
        `This is safe because your platform has only operated in Maharashtra ` +
        `so far. This cannot be automatically undone. Continue?`
      );
      if (!confirmed) { setMigratingState(false); return; }

      // 1. Set up districtsByState with existing flat list under Maharashtra
      const newDistrictsByState = {
        ...(config.districtsByState ?? {}),
        Maharashtra: Array.from(new Set([
          ...(config.districtsByState?.['Maharashtra'] ?? []),
          ...existingFlatDistricts,
        ])),
      };
      await updateDoc(doc(db, 'appConfig', 'global'), {
        districtsByState: newDistrictsByState,
      });

      // 2. Batch-update tasks, chunked at 499
      const CHUNK = 499;
      for (let i = 0; i < tasksNeedingState.length; i += CHUNK) {
        const batch = writeBatch(db);
        tasksNeedingState.slice(i, i + CHUNK).forEach((d) => {
          batch.update(doc(db, 'tasks', d.id), { state: 'Maharashtra' });
        });
        await batch.commit();
      }

      // 3. Batch-update users, chunked at 499
      for (let i = 0; i < usersNeedingState.length; i += CHUNK) {
        const batch = writeBatch(db);
        usersNeedingState.slice(i, i + CHUNK).forEach((d) => {
          batch.update(doc(db, 'users', d.id), { state: 'Maharashtra' });
        });
        await batch.commit();
      }

      _emitToast(
        `Migration complete: ${tasksNeedingState.length} tasks and ` +
        `${usersNeedingState.length} engineers set to Maharashtra.`,
        'success',
      );
    } catch (err) {
      console.error('[handleMigrateToMaharashtra] failed:', err);
      _emitToast('Migration failed. Try again.', 'error');
    } finally {
      setMigratingState(false);
    }
  }

  async function handleMigrateHistoricalCorrections() {
    if (currentUser?.role !== 'admin') return;
    setMigratingCorrections(true);
    try {
      const PIPELINE_ORDER: Record<string, number> = {
        survey: 0, proposal: 1, field_review: 2, documents: 3, backend: 4,
        completed: 5,
      };

      const tasksSnap = await getDocs(query(
        collection(db, 'tasks'),
        where('archived', '==', false),
      ));

      const candidates: { id: string; fromStage: string; note: string; timestamp: unknown }[] = [];

      tasksSnap.docs.forEach((d) => {
        const data = d.data();
        if (data['correctionReturnTo']) return; // already tracked — never touch

        const history = (data['stageHistory'] ?? []) as Array<Record<string, unknown>>;
        const lastOverride = [...history].reverse().find(
          (e) => e['actorRole'] === 'admin_override',
        );
        if (!lastOverride) return;

        const fromStage = lastOverride['fromStage'] as string | undefined;
        const toStage   = lastOverride['toStage']   as string | undefined;
        if (!fromStage || !toStage) return;
        if (!(fromStage in PIPELINE_ORDER) || !(toStage in PIPELINE_ORDER)) return;

        // Only a genuine backward move
        if (PIPELINE_ORDER[toStage] >= PIPELINE_ORDER[fromStage]) return;

        // Only if the task hasn't moved since — still sitting exactly at
        // the override's destination. If it's moved on, it was already
        // resolved the old way; leave it alone.
        if (data['pipelineStage'] !== toStage) return;

        const note = (lastOverride['note'] as string) ?? '';
        // Exclude Full Restart overrides — these produce this EXACT auto-
        // generated default note (see adminOverrideStage's fallback:
        // `note || \`Admin moved from ${currentStage} to ${newStage}\``).
        // A Full Restart is a deliberate admin choice to NOT track this as a
        // correction — retroactively tracking it would override that choice.
        const isDefaultFullRestartNote = note === `Admin moved from ${fromStage} to ${toStage}`;
        if (isDefaultFullRestartNote) return;

        candidates.push({
          id: d.id,
          fromStage,
          note,
          timestamp: lastOverride['timestamp'],
        });
      });

      if (candidates.length === 0) {
        _emitToast('No historical un-resolved reverts found — nothing to migrate.', 'success');
        return;
      }

      const confirmed = window.confirm(
        `Found ${candidates.length} task(s) reverted before correction ` +
        `tracking existed, still sitting unresolved at their reverted stage.\n\n` +
        `This will ADD correction tracking to them (badge, filter, sort) ` +
        `and reset status to 'pending' if stuck on 'completed'. It does NOT ` +
        `touch any task that already has correction tracking. Continue?`
      );
      if (!confirmed) return;

      const CHUNK = 499;
      for (let i = 0; i < candidates.length; i += CHUNK) {
        const batch = writeBatch(db);
        candidates.slice(i, i + CHUNK).forEach((c) => {
          batch.update(doc(db, 'tasks', c.id), {
            correctionReturnTo:             c.fromStage,
            correctionReturnAssignedTo:     null,
            correctionReturnAssignedToName: '',
            correctionNote:                 c.note || 'Retroactively identified — reverted before correction tracking existed',
            correctionSetAt:                c.timestamp,
          });
        });
        await batch.commit();
      }

      const candidateIds = new Set(candidates.map((c) => c.id));
      const staleStatusDocs = tasksSnap.docs.filter(
        (d) => candidateIds.has(d.id) && d.data()['status'] === 'completed',
      );
      for (let i = 0; i < staleStatusDocs.length; i += CHUNK) {
        const batch = writeBatch(db);
        staleStatusDocs.slice(i, i + CHUNK).forEach((d) => {
          batch.update(doc(db, 'tasks', d.id), { status: 'pending' });
        });
        await batch.commit();
      }

      _emitToast(
        `Migration complete: ${candidates.length} historical revert(s) now tracked correctly.`,
        'success',
      );
    } catch (err) {
      console.error('[handleMigrateHistoricalCorrections] failed:', err);
      _emitToast('Migration failed. Try again.', 'error');
    } finally {
      setMigratingCorrections(false);
    }
  }

  function handleAddLeadSource() {
    const val = newLeadSource.trim();
    if (!val || leadSources.some((s) => s.toLowerCase() === val.toLowerCase())) return;
    setLeadSources((prev) => [...prev, toTitleCase(val)]);
    setNewLeadSource('');
    setLeadSourcesDirty(true);
  }

  function handleRemoveLeadSource(s: string) {
    setLeadSources((prev) => prev.filter((x) => x !== s));
    setLeadSourcesDirty(true);
  }

  async function handleSaveLeadSources() {
    setSavingLeadSources(true);
    try {
      await saveLeadSources(leadSources);
      setLeadSourcesDirty(false);
    } catch {
      // toast shown by saveLeadSources
    } finally {
      setSavingLeadSources(false);
    }
  }

  async function handleRecalculatePipelineCounts() {
    if (currentUser?.role !== 'admin') return;
    setRecalculating(true);
    try {
      const tasksSnap = await getDocs(
        query(collection(db, 'tasks'), where('archived', '==', false))
      );

      const computed: Record<string, number> = {
        survey: 0, proposal: 0, field_review: 0, documents: 0,
        backend: 0, completed: 0, dropped: 0,
        unassigned_proposal: 0, unassigned_backend: 0, total_active: 0,
      };
      const activeStages = new Set(['survey', 'proposal', 'field_review', 'documents', 'backend']);

      tasksSnap.forEach((snap) => {
        const d     = snap.data();
        const stage = (d['pipelineStage'] as string) ?? 'survey';
        if (stage in computed) computed[stage]++;
        if (stage === 'proposal' && !d['proposalAssignedTo']) computed['unassigned_proposal']++;
        if (stage === 'backend'  && !d['backendAssignedTo'])  computed['unassigned_backend']++;
        if (activeStages.has(stage)) computed['total_active']++;
      });

      const stored = (config.pipelineCounts ?? {}) as Record<string, number>;
      const diffs  = Object.keys(computed).filter((k) => (stored[k] ?? 0) !== computed[k]);

      if (diffs.length === 0) {
        _emitToast('Pipeline counts are already accurate — no changes needed.', 'success');
        return;
      }

      const diffLines = diffs
        .map((k) => `  ${k}: ${stored[k] ?? 0} → ${computed[k]}`)
        .join('\n');

      const confirmed = window.confirm(
        `Pipeline counts mismatch detected:\n\n${diffLines}\n\nUpdate dashboard counters to match actual task data?\nThis cannot be undone.`
      );
      if (!confirmed) return;

      await updateDoc(doc(db, 'appConfig', 'global'), { pipelineCounts: computed });

      const summary = diffs.map((k) => `${k}: ${stored[k] ?? 0}→${computed[k]}`).join(', ');
      _emitToast(`Pipeline counts recalculated — ${summary}`, 'success');
    } catch (err) {
      console.error('[recalculate] failed:', err);
      _emitToast('Failed to recalculate pipeline counts. Try again.', 'error');
    } finally {
      setRecalculating(false);
    }
  }

  async function handleBackfillSaleClosed() {
    if (currentUser?.role !== 'admin') return;
    setBackfillingSaleClosed(true);
    try {
      const { totalScanned, updated, skippedManual } = await reconcileSaleClosed();
      _emitToast(
        `Scanned ${totalScanned}, updated ${updated}, skipped ${skippedManual} manual`,
        'success',
      );
    } catch (err) {
      console.error('[backfillSaleClosed] failed:', err);
      _emitToast('Failed to backfill Sales Closed. Try again.', 'error');
    } finally {
      setBackfillingSaleClosed(false);
    }
  }

  useEffect(() => {
    if (!loading && !dirty) {
      setFields(
        [...config.taskTemplate].sort((a, b) => a.sortOrder - b.sortOrder)
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.taskTemplate, loading]);

  const handleChange = useCallback((index: number, patch: Partial<FieldDefinition>) => {
    setFields((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
    setDirty(true);
  }, []);

  function handleExpand(i: number) {
    setExpandedIdx(i === -1 ? null : i);
  }

  function handleAddField() {
    setFields((prev) => {
      const newIdx = prev.length;
      setExpandedIdx(newIdx);
      return [...prev, makeEmptyField(newIdx)];
    });
    setDirty(true);
  }

  function handleDelete(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
    setExpandedIdx(null);
    setDirty(true);
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    setFields((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
    if (expandedIdx === index)          setExpandedIdx(index - 1);
    else if (expandedIdx === index - 1) setExpandedIdx(index);
    setDirty(true);
  }

  function handleMoveDown(index: number) {
    setFields((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
    if (expandedIdx === index)          setExpandedIdx(index + 1);
    else if (expandedIdx === index + 1) setExpandedIdx(index);
    setDirty(true);
  }

  async function handleSave() {
    setExpandedIdx(null);
    const normalised = fields.map((f, i) => ({ ...f, sortOrder: i }));
    setSaving(true);
    try {
      await saveTemplate(normalised);
      setDirty(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('Config not found')) {
        _emitToast('Template config not found. Please refresh.', 'error');
      }
      // other errors already toasted by saveTemplate
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!loading && !docDirty) {
      setDocFields(
        [...(config.documentTemplate ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.documentTemplate, loading]);

  const handleDocChange = useCallback((index: number, patch: Partial<FieldDefinition>) => {
    setDocFields((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
    setDocDirty(true);
  }, []);

  function handleDocExpand(i: number) {
    setDocExpandedIdx(i === -1 ? null : i);
  }

  function handleDocAddField() {
    setDocFields((prev) => {
      const newIdx = prev.length;
      setDocExpandedIdx(newIdx);
      return [...prev, makeEmptyField(newIdx)];
    });
    setDocDirty(true);
  }

  function handleDocDelete(index: number) {
    setDocFields((prev) => prev.filter((_, i) => i !== index));
    setDocExpandedIdx(null);
    setDocDirty(true);
  }

  function handleDocMoveUp(index: number) {
    if (index === 0) return;
    setDocFields((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
    if (docExpandedIdx === index)          setDocExpandedIdx(index - 1);
    else if (docExpandedIdx === index - 1) setDocExpandedIdx(index);
    setDocDirty(true);
  }

  function handleDocMoveDown(index: number) {
    setDocFields((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
    if (docExpandedIdx === index)          setDocExpandedIdx(index + 1);
    else if (docExpandedIdx === index + 1) setDocExpandedIdx(index);
    setDocDirty(true);
  }

  async function handleSaveDocuments() {
    setDocExpandedIdx(null);
    const normalised = docFields.map((f, i) => ({ ...f, sortOrder: i }));
    setDocSaving(true);
    try {
      await saveDocumentTemplate(normalised);
      setDocDirty(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('Config not found')) {
        _emitToast('Template config not found. Please refresh.', 'error');
      }
      // other errors already toasted by saveDocumentTemplate
    } finally {
      setDocSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-4">Template</h1>
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Page header */}
      <h1 className="text-xl font-bold text-gray-900 mb-4">Template</h1>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 mb-5">
        <button
          type="button"
          onClick={() => setActiveTab('survey')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors',
            activeTab === 'survey'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          <AlertTriangle className="h-4 w-4" />
          Survey Checklist
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('documents')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors',
            activeTab === 'documents'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          <FileText className="h-4 w-4" />
          Documents
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('backend')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors',
            activeTab === 'backend'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          <Route className="h-4 w-4" />
          Application Journey
        </button>
      </div>

      {/* Survey tab */}
      {activeTab === 'survey' && (
        <>
          {/* Header row */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-4">
            <p className="text-sm text-gray-500">
              {fields.length} field{fields.length !== 1 ? 's' : ''} — applied to all new tasks
            </p>
            {!isViewOnly && (
              <Button
                onClick={handleSave}
                disabled={!dirty || saving}
                className="w-full sm:w-auto sm:ml-auto flex items-center justify-center gap-1.5 h-11"
              >
                {saving ? (
                  <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Saving…</>
                ) : (
                  <><Save className="h-4 w-4" />Save</>
                )}
              </Button>
            )}
          </div>

          {/* Warning banner */}
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 mb-5 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
            <span>
              Saving updates all <strong>active tasks</strong> (pending, in progress, blocked) automatically. Completed tasks are never changed.
            </span>
          </div>

          {/* Field list */}
          {fields.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-12 text-center text-sm text-gray-400 mb-4">
              <p className="mb-1 font-medium">No fields yet</p>
              <p>Add the first field below to start building the template.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 mb-4">
              {fields.map((field, index) => (
                <FieldRow
                  key={field.fieldId}
                  field={field}
                  index={index}
                  total={fields.length}
                  expanded={expandedIdx === index}
                  onExpand={handleExpand}
                  onChange={handleChange}
                  onDelete={handleDelete}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                />
              ))}
            </div>
          )}

          {!isViewOnly && (
            <Button
              variant="outline"
              onClick={handleAddField}
              className="w-full flex items-center gap-2 border-dashed"
            >
              <Plus className="h-4 w-4" />
              Add Field
            </Button>
          )}
        </>
      )}

      {/* Documents tab */}
      {activeTab === 'documents' && (
        <>
          {/* Header row */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-4">
            <p className="text-sm text-gray-500">
              {docFields.length} field{docFields.length !== 1 ? 's' : ''} — collected during the Documents stage
            </p>
            {!isViewOnly && (
              <Button
                onClick={handleSaveDocuments}
                disabled={!docDirty || docSaving}
                className="w-full sm:w-auto sm:ml-auto flex items-center justify-center gap-1.5 h-11"
              >
                {docSaving ? (
                  <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Saving…</>
                ) : (
                  <><Save className="h-4 w-4" />Save</>
                )}
              </Button>
            )}
          </div>

          {/* Info banner */}
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 mb-5 text-sm text-blue-800">
            <FileText className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
            <span>
              This is the Document Collection template used during the Documents pipeline stage. Saving does not modify tasks already in progress.
            </span>
          </div>

          {/* Field list */}
          {docFields.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-12 text-center text-sm text-gray-400 mb-4">
              <p className="mb-1 font-medium">No fields yet</p>
              <p>Add the first field below to start building the Document Collection template.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 mb-4">
              {docFields.map((field, index) => (
                <FieldRow
                  key={field.fieldId}
                  field={field}
                  index={index}
                  total={docFields.length}
                  expanded={docExpandedIdx === index}
                  onExpand={handleDocExpand}
                  onChange={handleDocChange}
                  onDelete={handleDocDelete}
                  onMoveUp={handleDocMoveUp}
                  onMoveDown={handleDocMoveDown}
                />
              ))}
            </div>
          )}

          {!isViewOnly && (
            <Button
              variant="outline"
              onClick={handleDocAddField}
              className="w-full flex items-center gap-2 border-dashed"
            >
              <Plus className="h-4 w-4" />
              Add Field
            </Button>
          )}
        </>
      )}

      {/* Application journey tab */}
      {activeTab === 'backend' && <ApplicationJourneyEditor />}

      {/* States & Districts */}
      <div className="mt-8 border-t border-gray-200 pt-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">States &amp; Districts</h2>
            <p className="text-xs text-gray-500 mt-0.5">Manage states and their districts for tasks and engineers</p>
          </div>
          <div className="flex items-center gap-2">
            {districtsByStateDirty && !isViewOnly && (
              <Button
                size="sm"
                onClick={handleSaveDistrictsByState}
                disabled={savingDistrictsByState}
                className="flex items-center gap-1.5"
              >
                {savingDistrictsByState ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save
              </Button>
            )}
          </div>
        </div>

        {Object.keys(districtsByState).length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center mb-4">
            <p className="text-sm text-gray-500 font-medium">No states added yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Click &ldquo;Migrate Existing Districts to Maharashtra&rdquo; below to get started.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 mb-4">
            {Object.entries(districtsByState).map(([stateName, statedistricts]) => (
              <div key={stateName} className="rounded-xl border border-gray-200 bg-white p-4">
                {/* State header */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-800">{stateName}</span>
                  {!isViewOnly && (
                    <button
                      type="button"
                      onClick={() => handleRemoveState(stateName)}
                      className="rounded p-0.5 text-gray-300 hover:text-red-500 transition-colors"
                      aria-label={`Remove state ${stateName}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* District chips */}
                <div className="flex flex-wrap gap-2 mb-3 min-h-[1.5rem]">
                  {statedistricts.length === 0 ? (
                    <p className="text-xs text-gray-400">No districts yet — add one below.</p>
                  ) : (
                    statedistricts.map((d) => (
                      <span
                        key={d}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
                      >
                        {d}
                        {!isViewOnly && (
                          <button
                            type="button"
                            onClick={() => handleRemoveDistrictFromState(stateName, d)}
                            className="ml-0.5 rounded-full hover:bg-blue-100 p-0.5"
                            aria-label={`Remove ${d}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))
                  )}
                </div>

                {/* Add district input */}
                {!isViewOnly && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newDistrictInput[stateName] ?? ''}
                      onChange={(e) => setNewDistrictInput((prev) => ({ ...prev, [stateName]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddDistrictToState(stateName); } }}
                      placeholder="New district name…"
                      className="flex-1 h-8 rounded-md border border-gray-200 bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddDistrictToState(stateName)}
                      disabled={!(newDistrictInput[stateName] ?? '').trim()}
                      className="h-8 px-2 flex items-center gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add new state */}
        {!isViewOnly && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newState}
              onChange={(e) => setNewState(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddState(); } }}
              placeholder="New state name…"
              className="flex-1 h-9 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddState}
              disabled={!newState.trim()}
              className="h-9 flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add State
            </Button>
          </div>
        )}
      </div>

      {/* Lead Sources */}
      <div className="mt-8 border-t border-gray-200 pt-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Lead Sources</h2>
            <p className="text-xs text-gray-500 mt-0.5">Manage lead source options for tasks</p>
          </div>
          <div className="flex items-center gap-2">
            {leadSourcesDirty && !isViewOnly && (
              <Button
                size="sm"
                onClick={handleSaveLeadSources}
                disabled={savingLeadSources}
                className="flex items-center gap-1.5"
              >
                {savingLeadSources ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save Lead Sources
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-3 min-h-[2rem]">
          {leadSources.length === 0 ? (
            <p className="text-sm text-gray-400">No lead sources added yet.</p>
          ) : (
            leadSources.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700"
              >
                {s}
                <button
                  type="button"
                  onClick={() => handleRemoveLeadSource(s)}
                  className="ml-0.5 rounded-full hover:bg-purple-100 p-0.5"
                  aria-label={`Remove ${s}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))
          )}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newLeadSource}
            onChange={(e) => setNewLeadSource(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddLeadSource(); } }}
            placeholder="New lead source…"
            className="flex-1 h-9 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddLeadSource}
            disabled={!newLeadSource.trim()}
            className="h-9 flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      </div>

      {/* Sales Closed Detection */}
      <div className="mt-8 border-t border-gray-200 pt-6">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-gray-900">Sales Closed Detection</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Map which form fields capture the advance/token payment used to auto-detect a closed sale
          </p>
        </div>
        <SaleClosedMappingEditor />
      </div>

      {/* Admin Tools */}
      {currentUser?.role === 'admin' && (
        <div className="mt-8 border-t border-gray-200 pt-6">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-gray-900">Admin Tools</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              One-time maintenance actions for fixing data inconsistencies
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleRecalculatePipelineCounts}
            disabled={recalculating}
            className="flex items-center gap-2"
          >
            {recalculating && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
            )}
            🔧 Recalculate Pipeline Counts
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleBackfillSaleClosed}
            disabled={backfillingSaleClosed}
            className="flex items-center gap-2"
          >
            {backfillingSaleClosed && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
            )}
            🔧 Backfill Sales Closed
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleRecalculateEngineerDistrictCounts}
            disabled={recalculatingEngineerDistrict}
            className="flex items-center gap-2"
          >
            {recalculatingEngineerDistrict && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
            )}
            📊 Recalculate Engineer &amp; District Counts
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleMigrateToMaharashtra}
            disabled={migratingState}
            className="flex items-center gap-2"
          >
            {migratingState && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
            )}
            🗺️ Migrate Existing Districts to Maharashtra
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleMigrateHistoricalCorrections}
            disabled={migratingCorrections}
            className="flex items-center gap-2"
          >
            {migratingCorrections && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
            )}
            ↩ Migrate Historical Reverted Tasks
          </Button>
        </div>
      )}

    </div>
  );
}
