'use client';

/**
 * Accelerator Overview — the attention-allocation cockpit.
 *
 * Every pool-wide number comes from the server `screening_summary` aggregate
 * (whole program, never one page of rows); the table is server-paginated and
 * server-searched. The client only re-projects server fields. Tiers, lanes and
 * "potential" chips are ML attention routing backed by evidence — never
 * admission verdicts. A reviewer decides; Pitchmic decides where the queue is
 * longest.
 */

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Award,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileSearch,
  HelpCircle,
  Inbox,
  Loader2,
  PauseCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useActiveProgram } from './ProgramContext';
import {
  acceleratorApi,
  type ApplicationAssessment,
  type EventOutboxItem,
  type EvidenceGraph,
} from '@/lib/acceleratorApi';
import {
  ACTIVE_FUNNEL_STATUSES,
  APP_STATUSES,
  STATUS_LABELS,
  apiErrMessage,
  evidenceLevel,
  formatDateTime,
  qk,
  relativeTime,
  type AppStatus,
  type CohortDeltaKey,
  type ScreeningSummary,
} from '@/lib/screening';

// ── Shared derivations ───────────────────────────────────────────────────────

const STATUS_TONE: Record<AppStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-500 border-slate-200',
  SUBMITTED: 'bg-slate-100 text-slate-600 border-slate-200',
  SCREENING: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  SHORTLISTED: 'bg-violet-50 text-violet-700 border-violet-200',
  INTERVIEW_INVITED: 'bg-blue-50 text-blue-700 border-blue-200',
  INTERVIEW_COMPLETE: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  COMMITTEE_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
  EVIDENCE_REQUESTED: 'bg-sky-50 text-sky-700 border-sky-200',
  WAITLISTED: 'bg-teal-50 text-teal-700 border-teal-200',
  ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-600 border-rose-200',
  WITHDRAWN: 'bg-slate-100 text-slate-500 border-slate-200',
  DEFERRED: 'bg-orange-50 text-orange-700 border-orange-200',
};

function isAppStatus(status: string): status is AppStatus {
  return (APP_STATUSES as readonly string[]).includes(status);
}

function statusChip(status: string): { label: string; cls: string } {
  if (!isAppStatus(status)) {
    return { label: 'Unrecognised status', cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
  return { label: STATUS_LABELS[status], cls: STATUS_TONE[status] };
}

const countOf = (s: ScreeningSummary | undefined, status: AppStatus) =>
  s ? s.by_status[status] ?? 0 : 0;

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function prettify(value?: string | null): string {
  if (!value) return '—';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function initials(name?: string | null): string {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

const money = (v: unknown): string | null => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
};

// ML screening lane → attention label. This is routing language ("where to
// look first"), never a verdict on the company.
const TIER_POTENTIAL: Record<string, { label: string; cls: string }> = {
  A: { label: 'High', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  B: { label: 'Medium', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  C: { label: 'Medium', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  D: { label: 'Low', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const TONE_BAR: Record<string, string> = {
  strong: 'bg-emerald-500',
  moderate: 'bg-sky-500',
  limited: 'bg-amber-500',
  gap: 'bg-rose-500',
};

const TONE_CHIP: Record<string, string> = {
  strong: 'bg-emerald-600/10 text-emerald-700 border-emerald-500/20',
  moderate: 'bg-sky-600/10 text-sky-700 border-sky-500/20',
  limited: 'bg-amber-600/10 text-amber-700 border-amber-500/20',
  gap: 'bg-rose-600/10 text-rose-700 border-rose-500/20',
};

const chip = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold';

// ── Table tabs (server-side filters, not client row-counting) ────────────────

type TabKey = 'all' | 'in_review' | 'shortlist' | 'rejected';
const TAB_STATUSES: Record<TabKey, string | undefined> = {
  all: undefined,
  in_review: ACTIVE_FUNNEL_STATUSES.join(','),
  shortlist: 'SHORTLISTED',
  rejected: 'REJECTED',
};
const TAB_LABELS: Record<TabKey, string> = {
  all: 'All',
  in_review: 'In Review',
  shortlist: 'Shortlist',
  rejected: 'Rejected',
};

const PAGE_SIZE = 10;

interface ActivityEntry {
  key: string;
  title: string;
  detail: string;
  ts: string;
  kind: 'application' | 'event';
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AcceleratorOverviewPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const {
    activeProgram,
    programs,
    isLoading: contextLoading,
    programsError,
    refetchContext,
  } = useActiveProgram();
  const pid = activeProgram?.id ?? null;

  // Clock kept in client state so relative timestamps never hydrate differently.
  const [clock, setClock] = React.useState<number | null>(null);
  React.useEffect(() => {
    setClock(Date.now());
    const id = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const mounted = clock !== null;
  const hour = clock !== null ? new Date(clock).getHours() : null;
  const greeting =
    hour === null ? 'Welcome back' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const reviewerName = user?.first_name || undefined;

  // ── Server aggregates: the ONLY source for tiles, pipeline and lanes ──────
  const summaryQuery = useQuery({
    queryKey: qk.screeningSummary(pid),
    queryFn: () => acceleratorApi.getScreeningSummary(pid ?? undefined),
    enabled: pid !== null,
  });
  const summary = summaryQuery.isSuccess ? summaryQuery.data : undefined;
  const summaryBusy = summaryQuery.isLoading && pid !== null;
  const summaryFailed = summaryQuery.isError && pid !== null;
  const summaryPct = pct(summary?.processed ?? 0, summary?.total ?? 0);

  // ── Applications table: server-paginated, server-searched ─────────────────
  const [tab, setTab] = React.useState<TabKey>('all');
  const [page, setPage] = React.useState(1);
  const [searchInput, setSearchInput] = React.useState('');
  const [search, setSearch] = React.useState('');
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(id);
  }, [searchInput]);
  React.useEffect(() => setPage(1), [tab]);

  const appsQuery = useQuery({
    queryKey: ['accelerator-overview-apps', pid, tab, page, search],
    queryFn: () =>
      acceleratorApi.getApplicationsPaged(pid as number, {
        page,
        page_size: PAGE_SIZE,
        status: TAB_STATUSES[tab],
        q: search || undefined,
      }),
    enabled: pid !== null,
  });
  const rows = appsQuery.data?.results ?? [];
  const rowCount = appsQuery.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(rowCount / PAGE_SIZE));

  // ── Selected candidate dossier (right-hand detail panel) ──────────────────
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (selectedId == null && rows.length > 0) setSelectedId(rows[0].id);
  }, [rows, selectedId]);
  const selectedRow = rows.find((r) => r.id === selectedId) ?? null;

  const detailQuery = useQuery({
    queryKey: qk.appDetail(selectedId as number),
    queryFn: () => acceleratorApi.getApplicationDetail(selectedId as number),
    enabled: selectedId != null,
    staleTime: 30_000,
  });
  const assessmentQuery = useQuery({
    queryKey: qk.appAssessment(selectedId as number),
    queryFn: () =>
      acceleratorApi
        .getApplicationAssessment(selectedId as number)
        .catch(() => null) as Promise<ApplicationAssessment | null>,
    enabled: selectedId != null,
    staleTime: 60_000,
  });
  const graphQuery = useQuery({
    queryKey: qk.evidenceGraph(selectedId as number),
    queryFn: () => acceleratorApi.getEvidenceGraph(selectedId as number).catch(() => null) as Promise<EvidenceGraph | null>,
    enabled: selectedId != null,
    staleTime: 60_000,
  });
  const transitionsQuery = useQuery({
    queryKey: qk.allowedTransitions(selectedId as number),
    queryFn: () => acceleratorApi.getAllowedTransitions(selectedId as number).catch(() => null),
    enabled: selectedId != null,
    staleTime: 30_000,
  });

  const invalidatePool = () => {
    queryClient.invalidateQueries({ queryKey: ['accelerator-overview-apps', pid] });
    queryClient.invalidateQueries({ queryKey: qk.screeningSummary(pid) });
    queryClient.invalidateQueries({ queryKey: qk.applications(pid) });
  };

  const transitionMutation = useMutation({
    mutationFn: (to: string) => acceleratorApi.transitionStatus(selectedId as number, to),
    onSuccess: (_data, to) => {
      toast({
        title: 'Status updated',
        description: `Moved to “${(STATUS_LABELS as Record<string, string>)[to] ?? prettify(to)}” — a human action on the live pipeline.`,
        variant: 'success',
      });
      queryClient.invalidateQueries({ queryKey: qk.appDetail(selectedId as number) });
      queryClient.invalidateQueries({ queryKey: qk.allowedTransitions(selectedId as number) });
      invalidatePool();
    },
    onError: (err: unknown) => {
      toast({
        title: 'Transition failed',
        description: apiErrMessage(err, 'The workflow engine rejected this transition.'),
        variant: 'error',
      });
    },
  });

  const evidenceMutation = useMutation({
    mutationFn: (ids: number[]) =>
      Promise.all(
        ids.map((id) =>
          acceleratorApi.requestEvidence(id, [
            { type: 'other', description: 'Additional evidence requested by the program team.' },
          ])
        )
      ),
    onSuccess: (_data, ids) => {
      toast({
        title: 'Evidence requested',
        description: `Founders of ${ids.length} application${ids.length === 1 ? '' : 's'} asked for supporting evidence.`,
        variant: 'success',
      });
      setSelectedBulk([]);
      invalidatePool();
    },
    onError: (err: unknown) => {
      toast({
        title: 'Request failed',
        description: apiErrMessage(err, 'Could not send the evidence request.'),
        variant: 'error',
      });
    },
  });

  // Bulk selection on the current page only — never a fake "select all N".
  const [selectedBulk, setSelectedBulk] = React.useState<number[]>([]);
  React.useEffect(() => setSelectedBulk([]), [page, tab, search]);
  const toggleBulk = (id: number) =>
    setSelectedBulk((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  // ── Event outbox — enrichment only; a failure must never blank the page ───
  const eventsQuery = useQuery({
    queryKey: ['accelerator-event-outbox', pid],
    queryFn: async (): Promise<EventOutboxItem[]> => {
      try {
        return await acceleratorApi.osList<EventOutboxItem>('events', pid as number);
      } catch {
        return [];
      }
    },
    enabled: pid !== null,
  });
  const events: EventOutboxItem[] = React.useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);

  // ── Recent Activity: current-page applications + workflow events ──────────
  const activity: ActivityEntry[] = React.useMemo(() => {
    const appEntries: ActivityEntry[] = rows
      .filter((a) => a.updated_at || a.created_at)
      .map((a) => ({
        key: `app-${a.id}-${a.updated_at ?? a.created_at}`,
        title: a.company_name,
        detail: statusChip(a.status).label,
        ts: a.updated_at || a.created_at,
        kind: 'application' as const,
      }));
    const companyById = new Map(rows.map((a) => [a.id, a.company_name]));
    const eventEntries: ActivityEntry[] = (Array.isArray(events) ? events : [])
      .filter((e) => e?.occurred_at)
      .map((e) => ({
        key: `evt-${e.id}`,
        title:
          typeof e.application === 'number'
            ? companyById.get(e.application) ?? `Application #${e.application}`
            : 'Program',
        detail: (e.event_type || 'event').replace(/[_-]/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
        ts: e.occurred_at,
        kind: 'event' as const,
      }));
    return [...appEntries, ...eventEntries]
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, 6);
  }, [rows, events]);

  // ── Derived pipeline (server fields only) ──────────────────────────────────
  const eligibilityCount = summary?.funnel?.find((f) => f.key === 'eligibility')?.count ?? 0;
  const pipeline = summary
    ? [
        { key: 'received', label: 'Received', count: summary.total, icon: Inbox, tone: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
        { key: 'eligibility', label: 'Eligibility Check', count: eligibilityCount, icon: CheckCircle2, tone: 'text-sky-600 bg-sky-50 border-sky-200' },
        { key: 'screening', label: 'Screening', count: countOf(summary, 'SCREENING'), icon: Sparkles, tone: 'text-violet-600 bg-violet-50 border-violet-200' },
        { key: 'review', label: 'Review Queue', count: summary.review_queue, icon: ClipboardList, tone: 'text-orange-600 bg-orange-50 border-orange-200' },
        { key: 'interviews', label: 'Interviews', count: countOf(summary, 'INTERVIEW_INVITED') + countOf(summary, 'INTERVIEW_COMPLETE'), icon: Calendar, tone: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
        { key: 'dd', label: 'Due Diligence', count: countOf(summary, 'COMMITTEE_REVIEW') + countOf(summary, 'EVIDENCE_REQUESTED'), icon: FileSearch, tone: 'text-blue-600 bg-blue-50 border-blue-200' },
        { key: 'selected', label: 'Selected', count: countOf(summary, 'ACCEPTED'), icon: Award, tone: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
      ]
    : [];

  // ── KPI tiles with real cohort-over-cohort deltas ──────────────────────────
  const deltas = summary?.cohort_deltas;
  const tiles: Array<{
    label: string;
    value: number;
    sub?: string;
    deltaKey?: CohortDeltaKey;
    icon: React.ComponentType<{ className?: string }>;
    tone: string;
  }> = summary
    ? [
        { label: 'Total Applications', value: summary.total, deltaKey: 'total', icon: Inbox, tone: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
        { label: 'Processed', value: summary.processed, deltaKey: 'processed', icon: CheckCircle2, tone: 'text-sky-600 bg-sky-50 border-sky-200' },
        { label: 'Review Queue', value: summary.review_queue, deltaKey: 'review_queue', icon: ClipboardList, tone: 'text-orange-600 bg-orange-50 border-orange-200' },
        {
          label: 'Interviews',
          value: countOf(summary, 'INTERVIEW_INVITED') + countOf(summary, 'INTERVIEW_COMPLETE'),
          deltaKey: 'interviews',
          icon: Users,
          tone: 'text-indigo-600 bg-indigo-50 border-indigo-200',
        },
        {
          label: 'Due Diligence',
          value: countOf(summary, 'COMMITTEE_REVIEW') + countOf(summary, 'EVIDENCE_REQUESTED'),
          deltaKey: 'due_diligence',
          icon: FileSearch,
          tone: 'text-violet-600 bg-violet-50 border-violet-200',
        },
        {
          label: 'Selected',
          value: countOf(summary, 'ACCEPTED'),
          deltaKey: 'selected',
          sub: activeProgram?.target_cohort_size
            ? `(target ${activeProgram.target_cohort_size})`
            : undefined,
          icon: Award,
          tone: 'text-emerald-600 bg-emerald-50 border-emerald-200',
        },
      ]
    : [];

  // ── Attention lanes (server-side buckets, same predicates as review queue) ─
  const attentionRows = summary
    ? [
        { label: 'High priority applications', value: summary.attention.priority, icon: ClipboardList, tone: 'text-rose-600 bg-rose-50 border-rose-200', href: '/accelerator/review-queue?bucket=priority' },
        { label: 'High uncertainty', value: summary.attention.uncertain, icon: HelpCircle, tone: 'text-orange-600 bg-orange-50 border-orange-200', href: '/accelerator/review-queue?bucket=investigate' },
        { label: 'Evidence verification', value: summary.attention.missing_evidence, icon: ShieldAlert, tone: 'text-red-600 bg-red-50 border-red-200', href: '/accelerator/review-queue?bucket=investigate' },
        { label: 'Contradictory signals', value: summary.attention.contradictory, icon: AlertTriangle, tone: 'text-pink-600 bg-pink-50 border-pink-200', href: '/accelerator/review-queue?bucket=investigate' },
        { label: 'Reviewer holds', value: summary.attention.holds, icon: PauseCircle, tone: 'text-rose-600 bg-rose-50 border-rose-200', href: '/accelerator/review-queue?bucket=hold' },
      ]
    : [];
  const attentionOpen = attentionRows.filter((r) => r.value > 0).length;

  // ── Header status chip (from server processed ratio) ──────────────────────
  const programStatusChip = summaryFailed
    ? { label: 'Summary Unavailable', cls: 'bg-rose-50 text-rose-700 border-rose-200' }
    : !summary
      ? { label: 'Loading…', cls: 'bg-slate-100 text-slate-500 border-slate-200' }
      : summary.total === 0
        ? { label: 'No Applications Yet', cls: 'bg-slate-100 text-slate-600 border-slate-200' }
        : summaryPct >= 70
          ? { label: 'On track', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
          : { label: 'Needs attention', cls: 'bg-amber-50 text-amber-700 border-amber-200' };

  const deadline = activeProgram?.application_deadline;
  const deadlinePassed = deadline ? new Date(deadline).getTime() < (clock ?? Date.now()) : false;
  const deadlineLabel = deadline
    ? new Date(deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  // Quick Actions narrative tabs (about the selected candidate)
  const [qaTab, setQaTab] = React.useState<'summary' | 'claims' | 'risks'>('summary');

  const assessment = assessmentQuery.data ?? null;
  const graph = graphQuery.data ?? null;
  const detail = detailQuery.data ?? null;
  const startupProfile = detail?.startup_profile ?? {};
  const allowed = transitionsQuery.data?.allowed ?? [];
  const allowedSlugs = allowed.map((a) => a.status);
  const advanceTarget = allowed.find((a) => !['REJECTED', 'WITHDRAWN'].includes(a.status)) ?? null;

  if (pid === null) {
    if (contextLoading) {
      return (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
          Loading program context…
        </div>
      );
    }
    if (programsError) {
      return (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <div className="text-sm font-bold text-rose-800">Couldn&apos;t load your programs</div>
          <p className="mt-1 text-xs text-rose-700">
            The API request to <code>/accelerator/programs/</code> failed. Check that the backend is
            running on port 8000 and reachable from this page, then retry.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3 border-rose-300 bg-white text-rose-700 hover:bg-rose-100"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['accelerator-programs'] });
              queryClient.invalidateQueries({ queryKey: ['accelerator-user-context'] });
              refetchContext();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
          </Button>
        </div>
      );
    }
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-bold text-slate-900">No programs yet</div>
        <p className="mt-1 text-sm text-slate-500">
          {programs.length === 0
            ? 'This account has no accelerator programs. Create and publish one to start screening applications.'
            : 'No active program is selected. Choose one from the program switcher in the header.'}
        </p>
        {programs.length === 0 && (
          <Link href="/accelerator/settings">
            <Button size="sm" className="mt-3 bg-indigo-600 text-white hover:bg-indigo-700">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Program Configuration
            </Button>
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header: greeting · deadline · status chip ─────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-slate-900">
            {greeting}
            {reviewerName ? `, ${reviewerName}` : ''} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Here&apos;s what&apos;s happening with your accelerator program.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {deadlineLabel && (
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                Applications {deadlinePassed ? 'closed' : 'close'}
              </p>
              <p className="text-sm font-bold text-slate-800">{deadlineLabel}</p>
            </div>
          )}
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold',
              programStatusChip.cls
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {programStatusChip.label}
          </span>
        </div>
      </div>

      {/* ── Six KPI tiles — server aggregates + real cohort deltas ────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {summaryBusy || summaryFailed
          ? Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
          : tiles.map((t) => (
              <div key={t.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl border', t.tone)}>
                    <t.icon className="h-4 w-4" />
                  </span>
                  {t.deltaKey && <DeltaBadge pct={deltas?.metrics?.[t.deltaKey]} prevName={deltas?.previous_program} />}
                </div>
                <div className="text-2xl font-black text-slate-900 mt-3 tabular-nums">
                  {t.value.toLocaleString()}
                </div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mt-0.5">
                  {t.label}
                  {t.sub ? <span className="normal-case font-medium text-slate-400"> {t.sub}</span> : null}
                </div>
              </div>
            ))}
      </div>

      {/* ── Main grid: [pipeline + table + dossier] | [attention rails] ───── */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] items-start">
        <div className="space-y-6 min-w-0">
          {/* Screening pipeline — server fields re-projected per stage */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-indigo-600" /> Screening Pipeline
              </h2>
              <span className="text-[11px] text-slate-400">server-computed · current occupancy per stage</span>
            </div>
            {summaryBusy || summaryFailed ? (
              <FunnelSkeleton />
            ) : (
              <div className="overflow-x-auto pb-1">
                <div className="flex items-start min-w-[820px]">
                  {pipeline.map((step, i) => (
                    <React.Fragment key={step.key}>
                      {i > 0 && (
                        <div className="flex-1 pt-4 min-w-[14px]">
                          <div className={cn('h-0.5 w-full rounded-full', step.count > 0 ? 'bg-indigo-400' : 'bg-slate-200')} />
                        </div>
                      )}
                      <div className="flex flex-col items-center text-center px-1" style={{ minWidth: 92 }}>
                        <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl border', step.tone)}>
                          <step.icon className="h-4 w-4" />
                        </span>
                        <div className="text-[11px] font-bold text-slate-600 mt-2 leading-tight">{step.label}</div>
                        <div className="text-xl font-black text-slate-900 mt-0.5 tabular-nums">
                          {step.count.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-400 tabular-nums">{pct(step.count, summary?.total ?? 0)}%</div>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
            {/* Applications table — server-paginated & server-searched */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-sm font-black text-slate-900">Applications</h2>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search applications…"
                    className="w-52 rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 mb-3">
                {(Object.keys(TAB_LABELS) as TabKey[]).map((k) => {
                  const cnt =
                    k === 'all' ? summary?.total
                    : k === 'in_review' ? summary?.review_queue
                    : k === 'shortlist' ? countOf(summary, 'SHORTLISTED')
                    : countOf(summary, 'REJECTED');
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setTab(k)}
                      className={cn(
                        'px-3 py-2 text-xs font-bold border-b-2 -mb-px transition-colors',
                        tab === k
                          ? 'border-indigo-600 text-indigo-700'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      )}
                    >
                      {TAB_LABELS[k]}
                      <span className="ml-1.5 text-[10px] font-semibold text-slate-400 tabular-nums">
                        {cnt == null ? '—' : cnt.toLocaleString()}
                      </span>
                    </button>
                  );
                })}
              </div>

              {selectedBulk.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2">
                  <span className="text-xs font-semibold text-indigo-800">
                    {selectedBulk.length} selected on this page
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      loading={evidenceMutation.isPending}
                      onClick={() => evidenceMutation.mutate(selectedBulk)}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white"
                    >
                      Request evidence
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSelectedBulk([])}>
                      Clear
                    </Button>
                  </div>
                </div>
              )}

              {appsQuery.isLoading ? (
                <div className="flex items-center justify-center py-12 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading applications…
                </div>
              ) : appsQuery.isError ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <span className="text-sm font-semibold text-rose-800">
                    {apiErrMessage(appsQuery.error, 'Could not load applications.')}
                  </span>
                  <button
                    onClick={() => appsQuery.refetch()}
                    className="w-fit shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white"
                  >
                    Retry
                  </button>
                </div>
              ) : rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  <Inbox className="h-7 w-7 mb-2 text-slate-300" />
                  <p className="text-sm font-medium">No applications in this view.</p>
                  <p className="text-xs">{search ? 'Try a different search or tab.' : 'Founder submissions will appear here.'}</p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full min-w-[720px] text-left">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                        <th className="w-8 px-1 pb-2">
                          <input
                            type="checkbox"
                            aria-label="Select all on this page"
                            className="accent-indigo-600"
                            checked={rows.length > 0 && rows.every((r) => selectedBulk.includes(r.id))}
                            onChange={(e) => setSelectedBulk(e.target.checked ? rows.map((r) => r.id) : [])}
                          />
                        </th>
                        <th className="px-2 pb-2">Applicant / Company</th>
                        <th className="px-2 pb-2">Stage</th>
                        <th className="px-2 pb-2">Sector</th>
                        <th className="px-2 pb-2">Location</th>
                        <th className="px-2 pb-2">Potential</th>
                        <th className="px-2 pb-2">Evidence</th>
                        <th className="px-2 pb-2">Status</th>
                        <th className="px-2 pb-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((a) => {
                        const sc = statusChip(a.status);
                        const tier = a.automated_screening_tier ? TIER_POTENTIAL[a.automated_screening_tier] : null;
                        return (
                          <tr
                            key={a.id}
                            onClick={() => setSelectedId(a.id)}
                            className={cn(
                              'cursor-pointer text-xs hover:bg-slate-50 transition-colors',
                              selectedId === a.id && 'bg-indigo-50/60 hover:bg-indigo-50/60'
                            )}
                          >
                            <td className="px-1 py-2.5" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                aria-label={`Select ${a.company_name}`}
                                className="accent-indigo-600"
                                checked={selectedBulk.includes(a.id)}
                                onChange={() => toggleBulk(a.id)}
                              />
                            </td>
                            <td className="px-2 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-[10px] font-black text-white">
                                  {initials(a.company_name)}
                                </span>
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-900 truncate">{a.company_name}</div>
                                  <div className="text-[10px] text-slate-400 truncate">
                                    Founded by {a.founder_name || '—'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-2.5">
                              <span className={cn(chip, 'bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold normal-case')}>
                                {prettify(a.declared_stage || a.inferred_stage)}
                              </span>
                            </td>
                            <td className="px-2 py-2.5 text-slate-600">{a.sector || '—'}</td>
                            <td className="px-2 py-2.5 text-slate-600">{a.country || a.location || '—'}</td>
                            <td className="px-2 py-2.5">
                              {tier ? (
                                <span className={cn(chip, tier.cls)} title="ML screening lane — attention routing, not a verdict on the company">
                                  {tier.label}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400">Unscreened</span>
                              )}
                            </td>
                            <td className="px-2 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className="tabular-nums font-semibold text-slate-700 w-8">
                                  {Math.round(a.evidence_confidence_score)}%
                                </span>
                                <span className="h-1.5 w-12 rounded-full bg-slate-100 overflow-hidden">
                                  <span
                                    className={cn(
                                      'block h-full rounded-full',
                                      TONE_BAR[evidenceLevel(a.evidence_confidence_score)?.tone ?? 'gap']
                                    )}
                                    style={{ width: `${Math.max(0, Math.min(100, a.evidence_confidence_score))}%` }}
                                  />
                                </span>
                              </div>
                            </td>
                            <td className="px-2 py-2.5">
                              <span className={cn(chip, sc.cls)}>{sc.label}</span>
                            </td>
                            <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                              <Link
                                href={`/accelerator/applications/${a.id}`}
                                className="inline-block rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-indigo-300 hover:text-indigo-700 transition"
                              >
                                Review
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination footer */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] text-slate-400">
                  {rowCount > 0
                    ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, rowCount)} of ${rowCount.toLocaleString()} applications`
                    : 'No applications'}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="rounded-lg border border-slate-200 p-1 text-slate-500 disabled:opacity-40 hover:bg-slate-50"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  {pageWindow(page, totalPages).map((p, i) =>
                    p === '…' ? (
                      <span key={`gap-${i}`} className="px-1 text-[11px] text-slate-400">…</span>
                    ) : (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPage(p)}
                        className={cn(
                          'min-w-[26px] rounded-lg border px-1.5 py-1 text-[11px] font-bold tabular-nums transition',
                          p === page
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        )}
                      >
                        {p}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="rounded-lg border border-slate-200 p-1 text-slate-500 disabled:opacity-40 hover:bg-slate-50"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </section>

            {/* Candidate dossier (selected row) */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm min-w-0 space-y-4">
              {selectedId == null ? (
                <p className="text-xs text-slate-400 py-10 text-center">
                  Select an application to preview its dossier.
                </p>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-sm font-black text-white">
                        {initials(selectedRow?.company_name ?? detail?.company_name)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-black text-slate-900 truncate">
                            {selectedRow?.company_name ?? detail?.company_name ?? `Application #${selectedId}`}
                          </h3>
                          {selectedRow && (
                            <span className={cn(chip, statusChip(selectedRow.status).cls)}>
                              {statusChip(selectedRow.status).label}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Application #{selectedId}
                          {selectedRow?.submitted_at ? ` · Submitted ${formatDateTime(selectedRow.submitted_at)}` : ''}
                          {/* server-computed; omitted rather than shown as 0 when no timestamp exists */}
                          {selectedRow?.aging_days != null ? ` · ${selectedRow.aging_days}d waiting` : ''}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                      title="Back to list"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Snapshot */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Snapshot</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <SnapField label="Stage" value={prettify(startupProfile.declared_stage || selectedRow?.declared_stage || selectedRow?.inferred_stage)} />
                      <SnapField label="Sector" value={startupProfile.sector_tags ? String(startupProfile.sector_tags).split(',')[0].trim() : (selectedRow?.sector ?? '—')} />
                      <SnapField label="Location" value={startupProfile.incorporation_country || selectedRow?.country || '—'} />
                      <SnapField label="Funding" value={money(startupProfile.total_funding_raised_usd) ?? '—'} />
                      <SnapField label="Team Size" value={startupProfile.team_size != null ? String(startupProfile.team_size) : '—'} />
                      <SnapField
                        label="Website"
                        value={startupProfile.website || '—'}
                        href={startupProfile.website || undefined}
                      />
                    </div>
                  </div>

                  {/* Selection Assessment — evidence levels, never verdicts */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Selection Assessment
                      </p>
                      <Link
                        href={`/accelerator/applications/${selectedId}`}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
                      >
                        View full analysis <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                    {assessment == null ? (
                      <p className="text-xs text-slate-400 rounded-xl border border-dashed border-slate-200 p-3">
                        {assessmentQuery.isLoading ? 'Loading assessment…' : 'No ML assessment yet — run screening from the review queue.'}
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {(
                          [
                            ['Founder', assessment.founder_score],
                            ['Problem', assessment.problem_score],
                            ['Product', assessment.product_score],
                            ['Traction', assessment.traction_score],
                            ['Market', assessment.market_score],
                            ['Team', assessment.team_score],
                            ['Program Fit', assessment.overall_program_fit],
                            ['Evidence Quality', assessment.evidence_confidence],
                          ] as Array<[string, number]>
                        ).map(([label, score]) => {
                          const lvl = evidenceLevel(score);
                          return (
                            <div key={label} className="flex items-center gap-2">
                              <span className="w-24 shrink-0 text-[11px] font-semibold text-slate-600">{label}</span>
                              {lvl && <span className={cn(chip, TONE_CHIP[lvl.tone], 'w-28 justify-center')}>{lvl.label}</span>}
                              <span className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <span
                                  className={cn('block h-full rounded-full', TONE_BAR[lvl?.tone ?? 'gap'])}
                                  style={{ width: `${Math.max(0, Math.min(100, Number(score) || 0))}%` }}
                                />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Why this deserves attention */}
                  {assessment && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 space-y-1.5">
                      <p className="text-[10px] font-black uppercase tracking-wider text-indigo-700">
                        Why this application deserves your attention
                      </p>
                      {(assessment.bull_case ?? []).slice(0, 5).map((b, i) => (
                        <p key={`bull-${i}`} className="flex items-start gap-2 text-[11px] text-slate-700">
                          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 mt-0.5" />
                          {b.point}
                        </p>
                      ))}
                      {(assessment.risk_flags ?? []).slice(0, 3).map((r, i) => (
                        <p key={`risk-${i}`} className="flex items-start gap-2 text-[11px] text-slate-700">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />
                          {r.risk}
                        </p>
                      ))}
                      <p className="text-[10px] text-slate-400 pt-1">
                        ML-surfaced evidence signals. A human reviewer makes every decision.
                      </p>
                    </div>
                  )}

                  {/* Actions — human pipeline moves through the audited engine */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-indigo-200 bg-indigo-50/50 text-indigo-700 hover:bg-indigo-50"
                      disabled={!advanceTarget || transitionMutation.isPending}
                      onClick={() => advanceTarget && transitionMutation.mutate(advanceTarget.status)}
                      title={advanceTarget ? `Move to ${advanceTarget.label}` : 'No forward transition available'}
                    >
                      {advanceTarget ? prettify(advanceTarget.label) : 'Advance'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      disabled={evidenceMutation.isPending}
                      onClick={() => evidenceMutation.mutate([selectedId])}
                    >
                      Request Evidence
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      disabled={!allowedSlugs.includes('DEFERRED') || transitionMutation.isPending}
                      onClick={() => transitionMutation.mutate('DEFERRED')}
                      title={allowedSlugs.includes('DEFERRED') ? 'Park on hold via the workflow engine' : 'Hold is not a legal transition from the current stage'}
                    >
                      Hold
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                      disabled={!allowedSlugs.includes('REJECTED') || transitionMutation.isPending}
                      onClick={() => transitionMutation.mutate('REJECTED')}
                      title={allowedSlugs.includes('REJECTED') ? 'Record rejection via the workflow engine' : 'Rejection is not a legal transition from the current stage'}
                    >
                      Reject
                    </Button>
                  </div>
                  <Link href={`/accelerator/applications/${selectedId}`} className="block">
                    <Button size="sm" className="w-full bg-slate-900 hover:bg-slate-800 text-white">
                      Open Full Analysis
                    </Button>
                  </Link>
                </>
              )}
            </section>
          </div>
        </div>

        {/* ── Right rail ───────────────────────────────────────────────────── */}
        <div className="space-y-6 min-w-0">
          {/* Attention Required */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black text-slate-900">Attention Required</h2>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-black text-white tabular-nums">
                {summaryBusy ? '·' : attentionOpen}
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {attentionRows.map((r) => {
                const Icon = r.icon;
                return (
                  <li key={r.label}>
                    <Link href={r.href} className="flex items-center gap-2.5 py-2 group">
                      <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-lg border', r.tone)}>
                        <Icon className="h-3 w-3" />
                      </span>
                      <span className="flex-1 text-xs font-semibold text-slate-700 group-hover:text-indigo-700 truncate">
                        {r.label}
                      </span>
                      <span className="text-xs font-black text-slate-900 tabular-nums">
                        {summaryBusy ? '—' : r.value}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="text-[10px] text-slate-400 mt-2">
              Server-side lanes — an application can appear in more than one. They route attention;
              they never decide admissions.
            </p>
          </section>

          {/* Quick Actions — narrative tabs over the selected candidate */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black text-slate-900 mb-3">Quick Actions</h2>
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 mb-3 text-[11px] font-bold">
              {(
                [
                  ['summary', 'Summary'],
                  ['claims', 'Claims & Evidence'],
                  ['risks', 'Risks & Unknowns'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setQaTab(k)}
                  className={cn(
                    'flex-1 rounded-lg px-1.5 py-1 transition-colors',
                    qaTab === k ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {selectedId == null ? (
              <p className="text-xs text-slate-400">Select an application to see its summary.</p>
            ) : qaTab === 'summary' ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-600 leading-relaxed">
                  {assessment?.recommendation_reasoning ||
                    (assessmentQuery.isLoading
                      ? 'Loading assessment…'
                      : `${selectedRow?.company_name ?? 'This company'} has no ML assessment yet — run screening to extract evidence signals.`)}
                </p>
                {assessment && (
                  <p className="text-[10px] text-slate-400">
                    Advisory only: recommendation “{prettify(assessment.overall_recommendation)}” is an ML
                    suggestion with {Math.round((assessment.recommendation_confidence ?? 0) * 100)}% evidence
                    confidence — the decision stays with a human reviewer.
                  </p>
                )}
                <Link href={`/accelerator/applications/${selectedId}`}>
                  <Button size="sm" variant="outline" className="w-full border-indigo-200 bg-indigo-50/50 text-indigo-700 hover:bg-indigo-50">
                    Open full analysis
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </Link>
              </div>
            ) : qaTab === 'claims' ? (
              <div className="space-y-2">
                {graph ? (
                  <>
                    <div className="grid grid-cols-4 gap-1.5 text-center">
                      {[
                        ['Total', graph.summary.total, 'text-slate-900'],
                        ['Verified', graph.summary.verified, 'text-emerald-600'],
                        ['Open', graph.summary.unverified, 'text-amber-600'],
                        ['Contradicted', graph.summary.contradicted, 'text-rose-600'],
                      ].map(([label, v, tone]) => (
                        <div key={String(label)} className="rounded-lg border border-slate-200 bg-slate-50 py-1.5">
                          <div className={cn('text-sm font-black tabular-nums', tone as string)}>{v as number}</div>
                          <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">{label as string}</div>
                        </div>
                      ))}
                    </div>
                    {graph.claims.slice(0, 3).map((c) => (
                      <p key={c.id} className="text-[11px] text-slate-600 leading-snug">
                        <span className="font-bold">{c.statement}</span>{' '}
                        <span className="text-slate-400">— {prettify(c.verification_status)}</span>
                      </p>
                    ))}
                  </>
                ) : (
                  <p className="text-xs text-slate-400">
                    {graphQuery.isLoading ? 'Loading claims…' : 'No claims extracted for this application yet.'}
                  </p>
                )}
                <Link href={`/accelerator/applications/${selectedId}`}>
                  <Button size="sm" variant="outline" className="w-full border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
                    View full graph
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {(assessment?.risk_flags ?? []).length === 0 ? (
                  <p className="text-xs text-slate-400">
                    {assessment ? 'No risk flags were raised for this application.' : 'No assessment available yet.'}
                  </p>
                ) : (
                  (assessment?.risk_flags ?? []).slice(0, 5).map((r, i) => (
                    <p key={`qa-risk-${i}`} className="flex items-start gap-2 text-[11px] text-slate-600">
                      <AlertTriangle
                        className={cn(
                          'h-3.5 w-3.5 shrink-0 mt-0.5',
                          r.severity === 'HIGH' || r.severity === 'CRITICAL' ? 'text-rose-600' : 'text-amber-600'
                        )}
                      />
                      <span>
                        <span className="font-semibold">{r.risk}</span>
                        <span className="block text-[10px] text-slate-400">{r.mitigation || r.evidence}</span>
                      </span>
                    </p>
                  ))
                )}
              </div>
            )}
          </section>

          {/* Evidence Graph summary for the selected candidate */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black text-slate-900">Evidence Graph</h2>
              {selectedId != null && (
                <Link
                  href={`/accelerator/applications/${selectedId}`}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700"
                >
                  View full graph
                </Link>
              )}
            </div>
            {selectedId == null || graph == null ? (
              <p className="text-xs text-slate-400">
                {selectedId == null
                  ? 'Select an application to inspect its claims.'
                  : graphQuery.isLoading
                    ? 'Loading claims…'
                    : 'No claims extracted yet — they appear after ML screening.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {graph.claims
                  .slice()
                  .sort((a, b) => (a.verification_status === 'contradicted' ? -1 : 1) - (b.verification_status === 'contradicted' ? -1 : 1))
                  .slice(0, 4)
                  .map((c) => {
                    const tone =
                      c.verification_status === 'verified'
                        ? { label: 'Verified', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
                        : c.verification_status === 'contradicted'
                          ? { label: 'Inconsistent', cls: 'bg-rose-50 text-rose-600 border-rose-200' }
                          : c.verification_status === 'partially_verified'
                            ? { label: 'Partly verified', cls: 'bg-sky-50 text-sky-700 border-sky-200' }
                            : { label: 'Needs verification', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
                    return (
                      <li key={c.id} className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">{c.statement}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider">{prettify(c.category)}</p>
                        </div>
                        <span className={cn(chip, tone.cls, 'shrink-0')}>{tone.label}</span>
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>

          {/* Recent Activity */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4 text-indigo-600" /> Recent Activity
            </h2>
            {activity.length === 0 ? (
              <p className="text-xs text-slate-400">
                {appsQuery.isLoading ? 'Loading activity…' : 'No recent activity — applications and workflow events appear here as the pool moves.'}
              </p>
            ) : (
              <ul className="space-y-3">
                {activity.map((entry) => (
                  <li key={entry.key} className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        'mt-1 h-2 w-2 shrink-0 rounded-full',
                        entry.kind === 'event' ? 'bg-indigo-500' : 'bg-slate-300'
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-800 truncate">{entry.title}</p>
                      <p className="text-[10px] text-slate-400 truncate">{entry.detail}</p>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                      {mounted ? relativeTime(entry.ts) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Local helper components ──────────────────────────────────────────────────

function DeltaBadge({ pct: p, prevName }: { pct?: number | null; prevName?: string | null }) {
  const title = prevName ? `vs “${prevName}” (previous program)` : 'No previous cohort baseline available';
  if (p == null) {
    return (
      <span className="text-[11px] font-semibold text-slate-400 tabular-nums" title={title}>
        — <span className="font-medium text-slate-400">vs last cohort</span>
      </span>
    );
  }
  const up = p > 0;
  const flat = p === 0;
  return (
    <span
      className={cn(
        'text-[11px] font-bold tabular-nums',
        flat ? 'text-slate-400' : up ? 'text-emerald-600' : 'text-rose-500'
      )}
      title={title}
    >
      {flat ? '→' : up ? '↑' : '↓'}
      {Math.abs(p)}% <span className="font-medium text-slate-400">vs last cohort</span>
    </span>
  );
}

function SnapField({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">{label}</p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-indigo-600 hover:underline truncate block"
        >
          {value.replace(/^https?:\/\//, '')}
        </a>
      ) : (
        <p className="text-xs font-semibold text-slate-800 truncate">{value}</p>
      )}
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="h-9 w-9 rounded-xl bg-slate-200 animate-pulse" />
      <div className="h-7 w-14 rounded bg-slate-200 animate-pulse mt-3" />
      <div className="h-3 w-24 rounded bg-slate-100 animate-pulse mt-2" />
    </div>
  );
}

function FunnelSkeleton() {
  return (
    <div className="flex items-start gap-4 overflow-x-auto pb-1">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-2 min-w-[92px]">
          <div className="h-9 w-9 rounded-xl bg-slate-200 animate-pulse" />
          <div className="h-3 w-20 rounded bg-slate-100 animate-pulse" />
          <div className="h-6 w-10 rounded bg-slate-200 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

/** Page-number window: 1 … cur-1 cur cur+1 … last */
function pageWindow(cur: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: Array<number | '…'> = [1];
  if (cur > 3) pages.push('…');
  for (let p = Math.max(2, cur - 1); p <= Math.min(total - 1, cur + 1); p++) pages.push(p);
  if (cur < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}
