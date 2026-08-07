import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { QcCheckItem } from '@/components/qc/QcCheckItem';
import { isFieldVisible } from '@/utils/qcTally';
import { cn } from '@/lib/utils';
import type { QcFieldDefinition, QcAnswer } from '@/types/qc';
import type { QcValidationIssue } from '@/utils/qcValidation';

interface QcSectionProps {
  title:          string;
  fields:         QcFieldDefinition[];   // non-header fields belonging to this section
  answers:        Record<string, QcAnswer>;
  onAnswerChange: (fieldId: string, patch: Partial<QcAnswer>) => void;
  allIssues:      QcValidationIssue[];
  onCollapse:     () => void;
  qcNum?:         string;
  disabled?:      boolean;
}

export function QcSection({ title, fields, answers, onAnswerChange, allIssues, onCollapse, qcNum, disabled }: QcSectionProps) {
  const [expanded, setExpanded] = useState(true);

  const visibleFields = fields.filter((f) => isFieldVisible(f, answers));
  const total = visibleFields.length;
  const answeredCount = visibleFields.filter((f) => {
    const a = answers[f.fieldId];
    if (!a) return false;
    return a.status === 'pass' || a.status === 'fail' || a.status === 'na'
      || !!a.value || a.numericValue !== undefined;
  }).length;
  const failCount = visibleFields.filter((f) => answers[f.fieldId]?.status === 'fail').length;

  const chip = failCount > 0
    ? `${answeredCount}/${total} · ${failCount} FAIL`
    : `${answeredCount}/${total}${total > 0 && answeredCount === total ? ' ✓' : ''}`;

  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      if (prev && !next) onCollapse();   // expanded -> collapsed is an autosave trigger
      return next;
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-900 flex-1">{title}</span>
        <span className={cn(
          'rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0',
          failCount > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500',
        )}>
          {chip}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-gray-400 shrink-0 transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          {visibleFields.map((field) => (
            <QcCheckItem
              key={field.fieldId}
              field={field}
              answer={answers[field.fieldId]}
              onAnswerChange={onAnswerChange}
              allIssues={allIssues}
              qcNum={qcNum}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}
