import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Download } from 'lucide-react';
import { useTaskStore } from '@/store/taskStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TaskStatus } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending:     '#9CA3AF',
  in_progress: '#F4A261',
  completed:   '#2A9D8F',
  blocked:     '#E63946',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending:     'Pending',
  in_progress: 'In Progress',
  completed:   'Completed',
  blocked:     'Blocked',
};

const BRAND_BLUE = '#0077B6';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function formatSubmittedAt(d: Date): string {
  return d.toLocaleString('en-IN', {
    day:    '2-digit',
    month:  'short',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

const STATUS_BADGE: Record<TaskStatus, string> = {
  pending:     'bg-gray-100 text-gray-600',
  in_progress: 'bg-amber-100 text-amber-700',
  completed:   'bg-green-100 text-green-700',
  blocked:     'bg-red-100 text-brand-red',
};

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCsv(rows: { taskNum: string; title: string; assignedToName: string; status: string; submittedAt: Date | null }[]) {
  const header = ['Task #', 'Title', 'Assigned To', 'Status', 'Submitted At'].join(',');
  const body = rows.map((r) =>
    [
      `"${r.taskNum}"`,
      `"${r.title.replace(/"/g, '""')}"`,
      `"${r.assignedToName}"`,
      `"${r.status}"`,
      `"${r.submittedAt ? r.submittedAt.toISOString() : ''}"`,
    ].join(',')
  );
  const csv  = [header, ...body].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `solarops_submissions_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-base font-bold text-gray-800 mb-3">{title}</h2>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ReportsPage() {
  const { tasks } = useTaskStore();

  // ── Pie data ────────────────────────────────────────────────────────────────
  const pieData = useMemo(() => {
    const statuses: TaskStatus[] = ['pending', 'in_progress', 'completed', 'blocked'];
    return statuses
      .map((s) => ({
        name:  STATUS_LABELS[s],
        value: tasks.filter((t) => t.status === s).length,
        color: STATUS_COLORS[s],
      }))
      .filter((d) => d.value > 0);
  }, [tasks]);

  // ── Bar data ─────────────────────────────────────────────────────────────────
  const barData = useMemo(() => {
    const map: Record<string, { assigned: number; completed: number }> = {};
    tasks.forEach((t) => {
      const name = t.assignedToName || 'Unassigned';
      if (!map[name]) map[name] = { assigned: 0, completed: 0 };
      map[name].assigned++;
      if (t.status === 'completed') map[name].completed++;
    });
    return Object.entries(map)
      .map(([name, { assigned, completed }]) => ({
        name:    truncate(name, 12),
        fullName: name,
        rate:    assigned > 0 ? Math.round((completed / assigned) * 100) : 0,
        assigned,
        completed,
      }))
      .sort((a, b) => b.rate - a.rate);
  }, [tasks]);

  // ── Recent submissions ───────────────────────────────────────────────────────
  const allSubmitted = useMemo(() =>
    [...tasks]
      .filter((t) => t.submittedAt !== null)
      .sort((a, b) => b.submittedAt!.getTime() - a.submittedAt!.getTime()),
    [tasks],
  );
  const recentSubmissions = allSubmitted.slice(0, 20);

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 mb-0.5">Reports</h1>
        <p className="text-sm text-gray-400">
          {tasks.length} total task{tasks.length !== 1 ? 's' : ''} · {allSubmitted.length} submitted
        </p>
      </div>

      {/* ── Section 1: Status pie ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 border-t-4 border-t-brand-blue overflow-hidden">
        <SectionHeader title="Tasks by Status" />
        {pieData.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No tasks yet.</p>
        ) : (
          <div className="relative" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={95}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [`${v} tasks`, '']} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span className="text-xs text-gray-600">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Total in centre */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{tasks.length}</p>
                <p className="text-xs text-gray-400">total</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Section 2: Engineer bar chart ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 border-t-4 border-t-brand-blue overflow-hidden">
        <SectionHeader title="Completion Rate by Engineer" />
        {barData.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No assignments yet.</p>
        ) : (
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: number, _name: unknown, props: any) => [
                    `${value}% (${props.payload.completed}/${props.payload.assigned})`,
                    'Completion rate',
                  ]}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  labelFormatter={(label: string, payload: any[]) =>
                    payload?.[0]?.payload?.fullName ?? label
                  }
                  cursor={{ fill: 'rgba(0,119,182,0.06)' }}
                />
                <Bar dataKey="rate" fill={BRAND_BLUE} radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Section 3: Recent submissions ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 border-t-4 border-t-brand-blue overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <SectionHeader title={`Recent Submissions${recentSubmissions.length > 0 ? ` (${allSubmitted.length})` : ''}`} />
          {allSubmitted.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportCsv(allSubmitted)}
              className="flex items-center gap-1.5 text-xs h-8 shrink-0 -mt-1"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          )}
        </div>

        {recentSubmissions.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No submissions yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 pl-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">Task</th>
                  <th className="text-left pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Engineer</th>
                  <th className="text-left pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                  <th className="text-left pb-2 pr-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {recentSubmissions.map((t) => (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-2 pl-1">
                      <p className="font-mono text-xs text-gray-400">{t.taskNum}</p>
                      <p className="text-gray-800 text-xs font-medium mt-0.5">{truncate(t.title, 30)}</p>
                    </td>
                    <td className="py-2 hidden sm:table-cell">
                      <p className="text-xs text-gray-600">{t.assignedToName || '—'}</p>
                    </td>
                    <td className="py-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS_BADGE[t.status])}>
                        {STATUS_LABELS[t.status]}
                      </span>
                    </td>
                    <td className="py-2 pr-1">
                      <p className="text-xs text-gray-400 whitespace-nowrap">
                        {t.submittedAt ? formatSubmittedAt(t.submittedAt) : '—'}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {allSubmitted.length > 20 && (
              <p className="text-xs text-gray-400 mt-2 text-center">
                Showing 20 of {allSubmitted.length} — export CSV for full list
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
