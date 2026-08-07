import { X } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { roleLabel } from '@/config/roles';
import { cn } from '@/lib/utils';
import type { User } from '@/types';

// TODO(Phase 3+): bring back a QC-job list for this inspector/approver once
// useQcJobs.ts exists — the old task list here read the sales `tasks`
// collection and is gone with TaskDetailDrawer.

interface EngineerDetailDrawerProps {
  engineer: User | null;
  onClose:  () => void;
}

function Field({ label, value }: { label: string; value: string | undefined | null }) {
  if (!value) return null;
  return (
    <div className="px-4 py-3 border-b border-gray-100">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

export function EngineerDetailDrawer({ engineer, onClose }: EngineerDetailDrawerProps) {
  if (!engineer) return null;

  const initial = engineer.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <Sheet open={!!engineer} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">

        <div className="bg-gradient-to-r from-brand-navy to-brand-blue px-5 py-5 shrink-0 relative pr-14">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 rounded-full p-1.5 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-teal-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white font-bold text-lg leading-tight truncate">
                  {engineer.name}
                </span>
                {engineer.engineerCode && (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-mono font-medium bg-white/20 text-white">
                    {engineer.engineerCode}
                  </span>
                )}
              </div>
              <p className="text-sm text-white/70 mt-0.5">
                {roleLabel(engineer.role)}
              </p>
              {engineer.mobileNumber && (
                <a
                  href={`tel:${engineer.mobileNumber}`}
                  className="text-xs text-white/60 hover:text-white/90 mt-0.5 block"
                >
                  {engineer.mobileNumber}
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Field label="Email"    value={engineer.email} />
          <Field label="Mobile"   value={engineer.mobileNumber} />
          <Field label="State"    value={engineer.state} />
          <Field label="District" value={engineer.district} />
          <div className={cn('px-4 py-3 border-b border-gray-100 flex items-center justify-between')}>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Status</p>
            <span className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
              engineer.active ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600',
            )}>
              {engineer.active ? 'Active' : 'Disabled'}
            </span>
          </div>
        </div>

      </SheetContent>
    </Sheet>
  );
}
