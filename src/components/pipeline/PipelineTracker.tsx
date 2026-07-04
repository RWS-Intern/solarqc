import { cn } from '@/lib/utils';
import type { PipelineStage, StageHistoryEntry } from '@/types';

interface PipelineTrackerProps {
  pipelineStage:  PipelineStage;
  stageHistory:   StageHistoryEntry[];
  droppedReason?: string | null;
}

const STAGE_CONFIG: { key: PipelineStage; label: string; icon: string }[] = [
  { key: 'survey',       label: 'Survey',       icon: '📋' },
  { key: 'proposal',     label: 'Proposal',     icon: '📄' },
  { key: 'field_review', label: 'Field Review', icon: '👁️' },
  { key: 'documents',    label: 'Documents',    icon: '📎' },
  { key: 'backend',      label: 'Backend',      icon: '⚙️' },
  { key: 'completed',    label: 'Completed',    icon: '✅' },
];

const STAGE_ORDER: PipelineStage[] = STAGE_CONFIG.map((s) => s.key);

function stageIndex(stage: PipelineStage): number {
  return STAGE_ORDER.indexOf(stage);
}

function formatDateTime(d: Date): string {
  return d.toLocaleString('en-IN', {
    day:    '2-digit',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });
}

export function PipelineTracker({ pipelineStage, stageHistory, droppedReason }: PipelineTrackerProps) {
  if (!pipelineStage) return null;

  const isDropped  = pipelineStage === 'dropped';
  const currentIdx = isDropped ? stageIndex('field_review') : stageIndex(pipelineStage);

  return (
    <div className="flex flex-col gap-4">

      {/* ── Stage pills row ── */}
      <div className="flex flex-wrap gap-1.5">
        {STAGE_CONFIG.filter((s) => s.key !== 'completed' || pipelineStage === 'completed').map(({ key, label, icon }, idx) => {
          const isPast    = !isDropped && idx < currentIdx;
          const isCurrent = !isDropped && idx === currentIdx;
          const isDroppedStep = isDropped && idx > currentIdx;

          return (
            <span
              key={key}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border',
                isCurrent    ? 'bg-blue-500 text-white border-blue-500 ring-2 ring-blue-200'  :
                isPast       ? 'bg-green-100 text-green-700 border-green-200'                 :
                isDroppedStep ? 'bg-red-50 text-red-300 border-red-100'                       :
                isDropped && idx <= currentIdx ? 'bg-green-100 text-green-700 border-green-200' :
                               'bg-gray-100 text-gray-400 border-gray-200',
              )}
            >
              <span>{icon}</span>
              <span>{label}</span>
              {isPast && (
                <svg className="h-3 w-3 shrink-0" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5"
                        strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
          );
        })}

        {isDropped && (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border bg-red-100 text-red-600 border-red-200">
            ❌ Dropped
          </span>
        )}
      </div>

      {/* ── Dropped reason ── */}
      {isDropped && droppedReason && (
        <p className="text-xs text-red-500 italic pl-1">Reason: {droppedReason}</p>
      )}

      {/* ── Stage history log ── */}
      {stageHistory && stageHistory.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-1">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            Pipeline History
          </p>
          <div className="flex flex-col gap-1">
            {[...stageHistory].reverse().map((entry, i) => {
              const toLabel   = STAGE_CONFIG.find((s) => s.key === entry.toStage)?.label ?? entry.toStage;
              const fromLabel = entry.fromStage
                ? (STAGE_CONFIG.find((s) => s.key === entry.fromStage)?.label ?? entry.fromStage)
                : null;
              const ts = entry.timestamp instanceof Date
                ? entry.timestamp
                : new Date((entry.timestamp as unknown as { toDate?: () => Date })?.toDate?.() ?? entry.timestamp);
              return (
                <div key={i} className="flex flex-col gap-0.5 pl-2 border-l-2 border-gray-100">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-gray-400 tabular-nums shrink-0">{formatDateTime(ts)}</span>
                    <span className="text-gray-400">·</span>
                    <span className="font-medium text-gray-700">{entry.actorName}</span>
                    <span className="text-gray-400 text-[10px]">({entry.actorRole})</span>
                  </div>
                  <div className="text-xs text-gray-500 pl-0">
                    {fromLabel ? `${fromLabel} → ${toLabel}` : `Entered ${toLabel}`}
                    {entry.note && <span className="italic text-gray-400 ml-1">· {entry.note}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
