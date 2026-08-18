import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { PhotoZone } from '@/components/photos/PhotoZone';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { QcJob } from '@/types/qc';
import type { QcValidationIssue } from '@/utils/qcValidation';

type Panel = NonNullable<QcJob['system']['panels']>[number];

interface DcrPanelSectionProps {
  panels:             Panel[] | undefined;
  onSetPanelCount:    (count: number) => void;
  onUpdateSerial:     (index: number, value: string) => void;
  onPanelPhotoChange: (index: number, url: string) => void;
  jobId:              string;
  qcNum:              string;
  disabled?:          boolean;
  allIssues:          QcValidationIssue[];
  // Threaded straight into each panel's PhotoZone, same as every other
  // PhotoZone call site (QcCheckItem.tsx) — PhotoZone already builds the
  // (url, allUrls, index) click payload itself, so this component just
  // needs to forward whatever its caller passed, not build anything new.
  onPhotoClick?:      (url: string, allUrls: string[], index: number) => void;
}

// Only rendered when job.system.moduleType === 'dcr' (QcFillPage.tsx). A
// distinct, top-level section rather than woven into the template-driven
// checklist below — this isn't part of the standardized template, it's
// conditional on job data, so it doesn't belong in groupBySections().
export function DcrPanelSection({
  panels, onSetPanelCount, onUpdateSerial, onPanelPhotoChange,
  jobId, qcNum, disabled, allIssues, onPhotoClick,
}: DcrPanelSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const list = panels ?? [];
  const [countInput, setCountInput] = useState(list.length ? String(list.length) : '');

  const total = list.length;
  const completeCount = list.filter((p) => p.serialNumber.trim() && p.photoUrl).length;
  const chip = total > 0
    ? `${completeCount}/${total}${completeCount === total ? ' ✓' : ''}`
    : disabled ? 'No panels recorded' : 'Set panel count';

  function commitCount() {
    const n = Math.floor(Number(countInput));
    if (!Number.isNaN(n) && n > 0) onSetPanelCount(n);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-900 flex-1">DCR Panel Serials &amp; Nameplates</span>
        <span className={cn(
          'rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0',
          total === 0 || completeCount < total ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500',
        )}>
          {chip}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-gray-400 shrink-0 transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 px-3 pb-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dcr-panel-count">Number of panels</Label>
            <Input
              id="dcr-panel-count" type="number" min={1} step="1"
              value={countInput}
              onChange={(e) => setCountInput(e.target.value)}
              onBlur={commitCount}
              disabled={disabled}
              className="max-w-[140px]"
            />
          </div>

          {list.map((p, i) => {
            const issue = allIssues.find((iss) => iss.fieldId === `panel_${i}`);
            return (
              <div key={i} className="rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
                <p className="text-sm font-semibold text-gray-900">Panel {i + 1} of {total}</p>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`dcr-panel-serial-${i}`}>Serial number</Label>
                  <Input
                    id={`dcr-panel-serial-${i}`}
                    value={p.serialNumber}
                    onChange={(e) => onUpdateSerial(i, e.target.value)}
                    disabled={disabled}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-gray-500">Nameplate photo</p>
                  <PhotoZone
                    label={`Panel ${i + 1} nameplate`}
                    photos={p.photoUrl ? [p.photoUrl] : []}
                    onPhotosChange={(urls) => onPanelPhotoChange(i, urls[0] ?? '')}
                    minPhotos={1}
                    maxPhotos={1}
                    jobId={jobId}
                    qcNum={qcNum}
                    fieldId={`panel_${i}`}
                    uploadIndex={i}
                    uploadType="panel_nameplate"
                    queueKind="panel"
                    capture="environment"
                    disabled={disabled}
                    onPhotoClick={onPhotoClick}
                  />
                </div>

                {issue && <p className="text-xs text-brand-red">{issue.message}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
