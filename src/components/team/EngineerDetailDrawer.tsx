import { useState } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useTaskStore }        from '@/store/taskStore';
import { TaskDetailDrawer }    from '@/components/tasks/TaskDetailDrawer';
import { cn }                  from '@/lib/utils';
import type { User, Task, TaskStatus } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<TaskStatus, { label: string; className: string }> = {
  pending:     { label: 'Pending',     className: 'bg-gray-100 text-gray-600'   },
  in_progress: { label: 'In Progress', className: 'bg-amber-100 text-amber-700' },
  completed:   { label: 'Completed',   className: 'bg-green-100 text-green-700' },
  blocked:     { label: 'Blocked',     className: 'bg-red-100 text-red-600'     },
};

function StatusBadge({ status }: { status: TaskStatus }) {
  const { label, className } = STATUS_META[status];
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', className)}>
      {label}
    </span>
  );
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Stat box ─────────────────────────────────────────────────────────────────

function StatBox({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex-1 flex flex-col items-center py-3 px-2">
      <span className="text-2xl font-extrabold text-gray-900 tabular-nums">{value}</span>
      <span className="text-xs text-gray-500 mt-0.5 text-center">{label}</span>
    </div>
  );
}

// ─── Task row ─────────────────────────────────────────────────────────────────

function TaskRow({ task, onClick }: { task: Task; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors flex items-center gap-3"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono text-xs text-gray-400 shrink-0">{task.taskNum}</span>
        </div>
        <p className="text-sm font-medium text-gray-900 line-clamp-1">{task.title}</p>
        {task.dueDate && (
          <p className="text-xs text-gray-400 mt-0.5">Due {formatDate(task.dueDate)}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusBadge status={task.status} />
        <ChevronRight className="h-4 w-4 text-gray-300" />
      </div>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface EngineerDetailDrawerProps {
  engineer: User | null;
  onClose:  () => void;
}

export function EngineerDetailDrawer({ engineer, onClose }: EngineerDetailDrawerProps) {
  const { tasks }                        = useTaskStore();
  const [selectedTask, setSelectedTask]  = useState<Task | null>(null);

  if (!engineer) return null;

  const engineerTasks = [...tasks]
    .filter((t) => t.assignedTo === engineer.id)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const assignedCount  = engineerTasks.length;
  const completedCount = engineerTasks.filter((t) => t.status === 'completed').length;
  const completionPct  = assignedCount > 0
    ? Math.round((completedCount / assignedCount) * 100)
    : 0;

  const initial = engineer.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <>
      <Sheet open={!!engineer} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">

          {/* ── Header ── */}
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
                <p className="text-sm text-white/70 mt-0.5">Field Engineer</p>
              </div>
            </div>
          </div>

          {/* ── Stats row ── */}
          <div className="flex border-b border-gray-100 bg-white shrink-0 divide-x divide-gray-100">
            <StatBox value={assignedCount}        label="Assigned"    />
            <StatBox value={completedCount}        label="Completed"   />
            <StatBox value={`${completionPct}%`}  label="Completion"  />
          </div>

          {/* ── Task list ── */}
          <div className="px-4 py-3 border-b border-gray-100 shrink-0 flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-800">Assigned Tasks</p>
            {assignedCount > 0 && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">
                {assignedCount}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {engineerTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm">
                No tasks assigned yet.
              </div>
            ) : (
              engineerTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onClick={() => setSelectedTask(task)}
                />
              ))
            )}
          </div>

        </SheetContent>
      </Sheet>

      {/* Task detail — opens on top of the engineer drawer */}
      <TaskDetailDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onAdminUpdate={undefined}
      />
    </>
  );
}
