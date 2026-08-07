import { MapPin, RotateCcw } from 'lucide-react';
import type { QcJob } from '@/types/qc';

interface QcTallyBarProps {
  tally:               QcJob['tally'];
  location:            QcJob['location'];
  locationCapturedAt:  Date | null;
  locationUnavailable: boolean;
  onRedoLocation:      () => void;
}

export function QcTallyBar({ tally, location, locationCapturedAt, locationUnavailable, onRedoLocation }: QcTallyBarProps) {
  const percent = tally.total > 0 ? Math.round((tally.answered / tally.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full bg-brand-blue transition-all" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-[11px] text-gray-400 mt-1">{tally.answered}/{tally.total} answered</p>
      </div>

      <div className="flex items-center gap-3 text-xs font-medium flex-wrap">
        <span className="text-green-600">✓ {tally.pass} Pass</span>
        <span className="text-red-600">✗ {tally.fail} Fail</span>
        <span className="text-gray-500">⊘ {tally.na} N/A</span>
        {tally.criticalFail > 0 && (
          <span className="text-red-700 font-bold">⚠ {tally.criticalFail} CRITICAL</span>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        {location ? (
          <>
            <span className="text-gray-500 flex-1">
              Site location captured · ±{Math.round(location.accuracy)}m
              {locationCapturedAt && (
                <> · {locationCapturedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</>
              )}
            </span>
            <button type="button" onClick={onRedoLocation} className="flex items-center gap-1 text-brand-blue hover:underline shrink-0">
              <RotateCcw className="h-3 w-3" />Redo
            </button>
          </>
        ) : locationUnavailable ? (
          <>
            <span className="text-gray-400 flex-1">Location unavailable</span>
            <button type="button" onClick={onRedoLocation} className="text-brand-blue hover:underline shrink-0">Retry</button>
          </>
        ) : (
          <button type="button" onClick={onRedoLocation} className="text-brand-blue hover:underline">Capture location</button>
        )}
      </div>
    </div>
  );
}
