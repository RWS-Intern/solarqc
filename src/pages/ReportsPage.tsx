import { useMemo, useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Download } from 'lucide-react';
import {
  getDocs, query, collection, where, limit, orderBy, getCountFromServer,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAppConfig } from '@/hooks/useAppConfig';
import { docToTask } from '@/hooks/useTasks';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Task, TaskStatus } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────


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

const PIPELINE_STAGE_LABEL: Record<string, string> = {
  survey:       'Survey',
  proposal:     'Proposal',
  field_review: 'Field Review',
  documents:    'Documents',
  backend:      'Backend',
  completed:    'Converted',
  dropped:      'Dropped',
  logistics:    'Logistics',
  installation: 'Installation',
};

function csvCell(val: string | number | null | undefined): string {
  if (val == null) return '""';
  return `"${String(val).replace(/"/g, '""')}"`;
}

function isoDate(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : '';
}

function exportSubmissionsCsv(rows: { taskNum: string; title: string; assignedToName: string; status: string; submittedAt: Date | null }[]) {
  const header = ['Task #', 'Title', 'Assigned To', 'Status', 'Submitted At'].join(',');
  const body = rows.map((r) =>
    [
      csvCell(r.taskNum),
      csvCell(r.title),
      csvCell(r.assignedToName),
      csvCell(r.status),
      csvCell(r.submittedAt ? r.submittedAt.toISOString() : ''),
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

function exportPipelineCsv(rows: Task[]) {
  const header = [
    'Task #', 'Title', 'Field Engineer', 'Pipeline Stage', 'Payment Type',
    'Journey Steps Done', 'Journey Total Steps',
    'Proposal Team', 'Backend Team',
    'Dropped Reason', 'Conversion Date', 'Survey Date', 'Created Date',
  ].join(',');

  const body = rows.map((t) => {
    const stageLabel = PIPELINE_STAGE_LABEL[t.pipelineStage ?? 'survey'] ?? (t.pipelineStage ?? 'Survey');
    const paymentType = t.paymentType === 'cash' ? 'Cash' : t.paymentType === 'loan' ? 'Loan' : '';
    const stepsDone  = t.applicationJourneySteps.filter((s) => s.status === 'done').length;
    const stepsTotal = t.applicationJourneySteps.length;
    const conversionEntry = (t.stageHistory ?? []).find((e) => e.toStage === 'completed');
    const conversionDate  = isoDate(conversionEntry?.timestamp ?? null);
    return [
      csvCell(t.taskNum),
      csvCell(t.title),
      csvCell(t.assignedToName),
      csvCell(stageLabel),
      csvCell(paymentType),
      csvCell(stepsDone),
      csvCell(stepsTotal),
      csvCell(t.proposalAssignedToName ?? ''),
      csvCell(t.backendAssignedToName ?? ''),
      csvCell(t.droppedReason ?? ''),
      csvCell(conversionDate),
      csvCell(isoDate(t.submittedAt)),
      csvCell(isoDate(t.createdAt)),
    ].join(',');
  });

  const csv  = [header, ...body].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `solarops_pipeline_${new Date().toISOString().slice(0, 10)}.csv`;
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
  const { config }    = useAppConfig();
  const pc            = config.pipelineCounts;
  const { showToast } = useToast();

  // Load status counts independently from Firestore
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>(
    { pending: 0, in_progress: 0, completed: 0, blocked: 0 },
  );
  const [totalTaskCount, setTotalTaskCount] = useState(0);
  const [reportLoading, setReportLoading] = useState(true);
  const [surveyCompletedCount, setSurveyCompletedCount] = useState(0);
  const [pipelineTruncated, setPipelineTruncated]       = useState(false);
  const [submissionsTruncated, setSubmissionsTruncated] = useState(false);
  const [allTasksFull, setAllTasksFull] = useState<Task[]>([]);
  const [allSubmittedTasks, setAllSubmittedTasks] = useState<Array<{
    id:             string;
    taskNum:        string;
    title:          string;
    assignedToName: string;
    status:         TaskStatus;
    submittedAt:    Date | null;
  }>>([]);

  useEffect(() => {
    async function loadReportData() {
      setReportLoading(true);
      try {
        const [pendingCount, inProgressCount, completedCount, blockedCount] = await Promise.all([
          getCountFromServer(query(collection(db, 'tasks'), where('archived', '==', false), where('status', '==', 'pending'))),
          getCountFromServer(query(collection(db, 'tasks'), where('archived', '==', false), where('status', '==', 'in_progress'))),
          getCountFromServer(query(collection(db, 'tasks'), where('archived', '==', false), where('status', '==', 'completed'))),
          getCountFromServer(query(collection(db, 'tasks'), where('archived', '==', false), where('status', '==', 'blocked'))),
        ]);
        const counts = {
          pending:     pendingCount.data().count,
          in_progress: inProgressCount.data().count,
          completed:   completedCount.data().count,
          blocked:     blockedCount.data().count,
        };
        setStatusCounts(counts);
        const total = (pc?.total_active ?? 0) + (pc?.completed ?? 0) + (pc?.dropped ?? 0);
        setTotalTaskCount(
          total || counts.pending + counts.in_progress + counts.completed + counts.blocked,
        );

        // Count survey-stage tasks that have been submitted (status==='completed')
        // for the cumulative funnel chart's "Survey Done" bar.
        // Pure equality query (pipelineStage==='survey', archived===false, status==='completed')
        // — no composite index required.
        const surveyDoneSnap = await getCountFromServer(query(
          collection(db, 'tasks'),
          where('archived',      '==', false),
          where('pipelineStage', '==', 'survey'),
          where('status',        '==', 'completed'),
        ));
        setSurveyCompletedCount(surveyDoneSnap.data().count);

        // Fetch full task objects (fresh, unfiltered) specifically for CSV export —
        // must not depend on the Tasks page's filtered/paginated global store.
        const allFullSnap = await getDocs(query(
          collection(db, 'tasks'),
          where('archived', '==', false),
          limit(5000),
        ));
        setAllTasksFull(allFullSnap.docs.map(docToTask));
        setPipelineTruncated(allFullSnap.size === 5000);

        // Fetch submitted tasks for recent submissions table
        const submittedSnap = await getDocs(query(
          collection(db, 'tasks'),
          where('archived',    '==', false),
          where('submittedAt', '!=', null),
          orderBy('submittedAt', 'desc'),
          limit(500),
        ));
        setSubmissionsTruncated(submittedSnap.size === 500);
        setAllSubmittedTasks(
          submittedSnap.docs.map((d) => {
            const data = d.data();
            const raw  = data['submittedAt'];
            const submittedAt = raw?.toDate ? raw.toDate() : null;
            return {
              id:             d.id,
              taskNum:        (data['taskNum']        as string) || '',
              title:          (data['title']          as string) || '',
              assignedToName: (data['assignedToName'] as string) || '',
              status:         ((data['status']        as string) || 'pending') as TaskStatus,
              submittedAt,
            };
          })
        );
      } catch (err) {
        console.error('[ReportsPage] loadReportData failed:', err);
        showToast('Failed to load report data. Please refresh the page.', 'error');
      } finally {
        setReportLoading(false);
      }
    }
    loadReportData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pie data ────────────────────────────────────────────────────────────────
  const pieData = useMemo(() => [
    { name: 'Pending',     value: statusCounts.pending,     color: '#94A3B8' },
    { name: 'In Progress', value: statusCounts.in_progress, color: '#F59E0B' },
    { name: 'Completed',   value: statusCounts.completed,   color: '#22C55E' },
    { name: 'Blocked',     value: statusCounts.blocked,     color: '#EF4444' },
  ].filter((d) => d.value > 0), [statusCounts]);

  // ── Bar data ─────────────────────────────────────────────────────────────────
  const barData = useMemo(() => {
    const ec = config.engineerCounts;
    if (!ec) return [];
    return Object.entries(ec)
      .map(([, { assigned, completed, name }]) => ({
        name:     truncate(name || 'Unknown', 12),
        fullName: name || 'Unknown',
        rate:     assigned > 0 ? Math.round((completed / assigned) * 100) : 0,
        assigned,
        completed,
      }))
      .sort((a, b) => b.rate - a.rate);
  }, [config.engineerCounts]);

  // ── Pipeline stage data ──────────────────────────────────────────────────────
  const pipelineStageData = useMemo(() => {
    if (!pc) return [];
    return [
      { name: 'Survey',       value: pc.survey       ?? 0, color: '#6B7280' },
      { name: 'Proposal',     value: pc.proposal     ?? 0, color: '#9333EA' },
      { name: 'Field Review', value: pc.field_review ?? 0, color: '#3B82F6' },
      { name: 'Documents',    value: pc.documents    ?? 0, color: '#14B8A6' },
      { name: 'Backend',      value: pc.backend      ?? 0, color: '#F97316' },
      { name: 'Converted',    value: pc.completed    ?? 0, color: '#22C55E' },
      { name: 'Dropped',      value: pc.dropped      ?? 0, color: '#EF4444' },
    ].filter((d) => d.value > 0);
  }, [pc]);

  // ── District data ────────────────────────────────────────────────────────────
  const districtData = useMemo(() => {
    const dc = config.districtCounts;
    if (!dc) return [];
    return Object.entries(dc)
      .map(([name, { total, completed }]) => ({
        name,
        total,
        completed,
        rate: total > 0 ? Math.round((completed / total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
  }, [config.districtCounts]);

  // ── Funnel data ──────────────────────────────────────────────────────────────
  // Cumulative funnel derived purely from pipelineCounts (denormalized counters).
  // Each bar = tasks that have EVER reached at least that stage.
  // Dropped tasks only ever leave from field_review, so they count toward
  // survey/proposal/fieldRev but NOT documents/backend.
  const funnelData = useMemo(() => {
    if (!pc) return {
      total: 0, survey: 0, proposal: 0,
      fieldRev: 0, documents: 0, backend: 0,
      converted: 0, dropped: 0,
      convRate: 0, dropRate: 0,
    };
    const backend    = (pc.backend      ?? 0) + (pc.completed ?? 0);
    const documents  = (pc.documents    ?? 0) + backend;
    const fieldRev   = (pc.field_review ?? 0) + (pc.dropped   ?? 0) + documents;
    const proposal   = (pc.proposal     ?? 0) + fieldRev;
    const survey     = surveyCompletedCount + proposal;
    const total      = (pc.total_active ?? 0) + (pc.completed ?? 0) + (pc.dropped ?? 0);
    const converted  = pc.completed ?? 0;
    const dropped    = pc.dropped   ?? 0;
    const convRate   = total > 0 ? Math.round((converted / total) * 100) : 0;
    const dropRate   = total > 0 ? Math.round((dropped   / total) * 100) : 0;
    return { total, survey, proposal, fieldRev, documents, backend, converted, dropped, convRate, dropRate };
  }, [pc, surveyCompletedCount]);

  // ── Recent submissions ───────────────────────────────────────────────────────
  const allSubmitted      = allSubmittedTasks;
  const recentSubmissions = allSubmitted.slice(0, 20);

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 mb-0.5">Reports</h1>
        <p className="text-sm text-gray-400">
          {totalTaskCount} total task{totalTaskCount !== 1 ? 's' : ''} · {allSubmitted.length} submitted
        </p>
      </div>

      {/* ── Section 1: Status pie ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 border-t-4 border-t-brand-blue overflow-hidden">
        <SectionHeader title="Tasks by Status" />
        {reportLoading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
        ) : pieData.length === 0 ? (
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
                <p className="text-2xl font-bold text-gray-900">{totalTaskCount}</p>
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

      {/* ── Section 3: Pipeline Stage Distribution ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 border-t-4 border-t-brand-blue overflow-hidden">
        <SectionHeader title="Pipeline Stage Distribution" />
        {pipelineStageData.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No pipeline data yet.</p>
        ) : (
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineStageData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#6B7280' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip formatter={(v: number) => [`${v} tasks`, 'Count']} cursor={{ fill: 'rgba(0,119,182,0.06)' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {pipelineStageData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── District Breakdown ── */}
      {districtData.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 border-t-4 border-t-blue-400 overflow-hidden">
          <SectionHeader title="Tasks by District" />
          <div className="flex flex-col gap-2 mt-2">
            {districtData.map(({ name, total }) => {
              const allTotal = funnelData.total || 1;
              const pct      = Math.round((total / allTotal) * 100);
              return (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-32 truncate shrink-0">{name}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-500 w-14 text-right shrink-0">{total} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {districtData.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 border-t-4 border-t-green-500 overflow-hidden">
          <SectionHeader title="Conversion Rate by District (%)" />
          <div className="flex flex-col gap-2 mt-2">
            {districtData.map(({ name, rate, completed, total }) => (
              <div key={name} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-32 truncate shrink-0">{name}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${rate}%` }} />
                </div>
                <span className="text-xs text-gray-500 w-20 text-right shrink-0">{completed}/{total} ({rate}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section 4: Pipeline Funnel ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 border-t-4 border-t-green-500 overflow-hidden">
        <SectionHeader title="Pipeline Funnel" />
        <div className="flex flex-col gap-2 mt-2">
          {[
            { label: 'Total Leads',     value: funnelData.total,     color: 'bg-gray-400',   width: 100 },
            { label: 'Survey Done',     value: funnelData.survey,    color: 'bg-blue-400',   width: funnelData.total > 0 ? Math.round((funnelData.survey    / funnelData.total) * 100) : 0 },
            { label: 'In Proposal',     value: funnelData.proposal,  color: 'bg-purple-400', width: funnelData.total > 0 ? Math.round((funnelData.proposal  / funnelData.total) * 100) : 0 },
            { label: 'In Field Review', value: funnelData.fieldRev,  color: 'bg-blue-500',   width: funnelData.total > 0 ? Math.round((funnelData.fieldRev  / funnelData.total) * 100) : 0 },
            { label: 'In Documents',    value: funnelData.documents, color: 'bg-teal-400',   width: funnelData.total > 0 ? Math.round((funnelData.documents / funnelData.total) * 100) : 0 },
            { label: 'In Backend',      value: funnelData.backend,   color: 'bg-orange-400', width: funnelData.total > 0 ? Math.round((funnelData.backend   / funnelData.total) * 100) : 0 },
            { label: '✅ Converted',    value: funnelData.converted, color: 'bg-green-500',  width: funnelData.total > 0 ? Math.round((funnelData.converted / funnelData.total) * 100) : 0 },
          ].map(({ label, value, color, width }) => (
            <div key={label} className="flex items-center gap-3">
              <p className="text-xs text-gray-500 w-28 shrink-0 text-right">{label}</p>
              <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                <div
                  className={`h-6 rounded-full ${color} flex items-center justify-end pr-2 transition-all`}
                  style={{ width: `${Math.max(width, value > 0 ? 4 : 0)}%` }}
                >
                  <span className="text-[10px] text-white font-bold">{value}</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 w-8 shrink-0">{width}%</p>
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100">
          <div className="flex-1 text-center">
            <p className="text-2xl font-extrabold text-green-600">{funnelData.convRate}%</p>
            <p className="text-xs text-gray-400 mt-0.5">Conversion Rate</p>
          </div>
          <div className="w-px bg-gray-100" />
          <div className="flex-1 text-center">
            <p className="text-2xl font-extrabold text-red-500">{funnelData.dropRate}%</p>
            <p className="text-xs text-gray-400 mt-0.5">Drop Rate</p>
          </div>
          <div className="w-px bg-gray-100" />
          <div className="flex-1 text-center">
            <p className="text-2xl font-extrabold text-gray-700">{funnelData.total}</p>
            <p className="text-xs text-gray-400 mt-0.5">Total Leads</p>
          </div>
        </div>
      </div>

      {/* ── Section 5: Recent submissions ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 border-t-4 border-t-brand-blue overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <SectionHeader title={`Recent Submissions${recentSubmissions.length > 0 ? ` (${allSubmitted.length}${submissionsTruncated ? '+' : ''})` : ''}`} />
          <div className="flex items-center gap-2 -mt-1 shrink-0">
            {allTasksFull.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (pipelineTruncated) {
                    showToast('Export may be incomplete — more than 5,000 tasks exist. Contact admin for a full data export.', 'error');
                  }
                  exportPipelineCsv(allTasksFull);
                }}
                className="flex items-center gap-1.5 text-xs h-8"
              >
                <Download className="h-3.5 w-3.5" />
                Export Pipeline CSV
              </Button>
            )}
            {allSubmitted.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (submissionsTruncated) {
                    showToast('Export may be incomplete — more than 500 submissions exist. Contact admin for a full data export.', 'error');
                  }
                  exportSubmissionsCsv(allSubmitted);
                }}
                className="flex items-center gap-1.5 text-xs h-8"
              >
                <Download className="h-3.5 w-3.5" />
                Export Submissions CSV
              </Button>
            )}
          </div>
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
