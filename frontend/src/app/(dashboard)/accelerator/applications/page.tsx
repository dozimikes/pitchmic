'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckSquare,
  Compass,
  Download,
  FileCheck,
  Inbox,
  Layers,
  Loader2,
  Search,
  ShieldAlert,
  ShieldCheck,
  Square,
  Users,
  Video,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import {
  acceleratorApi,
  type ApplicationItem,
  type ApplicationListParams,
} from '@/lib/acceleratorApi';
import {
  STATUS_LABELS,
  evidenceLevel,
  evidenceLevelShort,
  apiErrMessage,
  downloadCsv,
  formatDateTime,
  qk,
  type EvidenceLevel,
} from '@/lib/screening';
import { PipelineKanban } from '@/components/accelerator/PipelineKanban';
import { useActiveProgram } from '../ProgramContext';
import { useIntelligence, type RiskSeverity } from '../IntelligenceContext';
import { ApplicationDossierDrawer } from '@/components/accelerator/applications/ApplicationDossierDrawer';
import { AssignmentChips, AssignReviewerDialog } from '@/components/accelerator/ReviewerAssignments';
import { EligibilityTriageView } from '@/components/accelerator/applications/EligibilityTriageView';
import { SelectionMatrixView } from '@/components/accelerator/applications/SelectionMatrixView';
import { ReviewerConsensusView } from '@/components/accelerator/applications/ReviewerConsensusView';
import { InterviewOperationsView } from '@/components/accelerator/applications/InterviewOperationsView';
import { cn } from '@/lib/utils';

// ── Inbox status chips → real backend statuses (server-side `status` filter) ──
// Every value here is an APP_STATUSES member (see lib/screening). Anything not
// listed (DRAFT, DEFERRED, …) simply only appears under "All" — never invented.
type StatusGroup = 'UNPROCESSED' | 'IN_REVIEW' | 'SHORTLISTED' | 'REJECTED';

const STATUS_GROUPS: Record<StatusGroup, string[]> = {
  UNPROCESSED: ['SUBMITTED'],
  IN_REVIEW: ['SCREENING', 'EVIDENCE_REQUESTED'],
  SHORTLISTED: ['SHORTLISTED', 'INTERVIEW_INVITED', 'INTERVIEW_COMPLETE', 'COMMITTEE_REVIEW', 'WAITLISTED'],
  REJECTED: ['REJECTED', 'WITHDRAWN'],
};

const STATUS_CHIP_TONE: Record<StatusGroup | 'ALL', string> = {
  ALL: '',
  UNPROCESSED: 'bg-slate-100 text-slate-600 border-slate-200',
  IN_REVIEW: 'bg-sky-50 text-sky-700 border-sky-200',
  SHORTLISTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
};

const RISK_TONE: Record<'High' | 'Medium' | 'Low', string> = {
  High: 'bg-rose-50 text-rose-700 border-rose-200',
  Medium: 'bg-amber-50 text-amber-700 border-amber-200',
  Low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const TONE_TEXT: Record<EvidenceLevel['tone'], string> = {
  strong: 'text-emerald-700',
  moderate: 'text-sky-700',
  limited: 'text-amber-700',
  gap: 'text-rose-700',
};
const TONE_BAR: Record<EvidenceLevel['tone'], string> = {
  strong: 'bg-emerald-500',
  moderate: 'bg-sky-500',
  limited: 'bg-amber-500',
  gap: 'bg-rose-500',
};

// Status → display label. Reads the shared STATUS_LABELS vocabulary, never a
// locally re-derived set of strings that could drift from other screens.
function statusLabel(status: string): string {
  return (
    (STATUS_LABELS as Record<string, string>)[status] ??
    status
      .split('_')
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(' ')
  );
}

function ApplicationsPageContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeProgram } = useActiveProgram();
  const { openIntelligenceDrawer } = useIntelligence();
  const pid = activeProgram?.id ?? null;

  // Tab synchronization with ?tab= query parameter
  const tabParam = searchParams.get('tab');
  const activeTab = React.useMemo(() => {
    if (tabParam === 'eligibility') return 'ELIGIBILITY';
    if (tabParam === 'reviews') return 'REVIEWS';
    if (tabParam === 'interviews') return 'INTERVIEWS';
    if (tabParam === 'matrix' || tabParam === 'selection') return 'SELECTION_MATRIX';
    if (tabParam === 'kanban') return 'KANBAN';
    return 'INBOX';
  }, [tabParam]);

  const handleTabChange = (tabId: string) => {
    let query = '';
    if (tabId === 'ELIGIBILITY') query = '?tab=eligibility';
    else if (tabId === 'REVIEWS') query = '?tab=reviews';
    else if (tabId === 'INTERVIEWS') query = '?tab=interviews';
    else if (tabId === 'SELECTION_MATRIX') query = '?tab=matrix';
    else if (tabId === 'KANBAN') query = '?tab=kanban';
    router.push(`/accelerator/applications${query}`);
  };

  // Server-driven filter state — none of this is applied client-side anymore.
  const [statusChip, setStatusChip] = React.useState<'ALL' | StatusGroup>('ALL');
  const [tier, setTier] = React.useState<string>('ALL');
  const [filterStage, setFilterStage] = React.useState<string>('ALL');
  const [filterSector, setFilterSector] = React.useState<string>('ALL');
  const [filterCountry, setFilterCountry] = React.useState<string>('ALL');

  const [searchInput, setSearchInput] = React.useState<string>('');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  React.useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Pagination + selection
  const [page, setPage] = React.useState<number>(1);
  const [pageSize, setPageSize] = React.useState<number>(25);
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());

  // Evidence-request modal (single row or bulk)
  const [evidenceModal, setEvidenceModal] = React.useState<{ ids: number[]; label: string } | null>(null);
  const [evidenceText, setEvidenceText] = React.useState<string>('');
  const evidenceRef = React.useRef<HTMLTextAreaElement>(null);

  const [selectedAppId, setSelectedAppId] = React.useState<number | null>(null);
  // Ask-a-reviewer dialog target (null = closed).
  const [assignFor, setAssignFor] = React.useState<ApplicationItem | null>(null);

  // Build server params from active filters.
  const listParams = React.useMemo<ApplicationListParams>(() => {
    const p: ApplicationListParams = { page, page_size: pageSize };
    if (statusChip !== 'ALL') p.status = STATUS_GROUPS[statusChip].join(',');
    if (tier !== 'ALL') p.tier = tier;
    if (filterSector !== 'ALL') p.sector = filterSector;
    if (filterCountry !== 'ALL') p.country = filterCountry;
    if (filterStage !== 'ALL') p.declared_stage = filterStage;
    if (searchQuery) p.q = searchQuery;
    return p;
  }, [page, pageSize, statusChip, tier, filterSector, filterCountry, filterStage, searchQuery]);

  // Inbox table — server paginated & server filtered.
  const {
    data: paged,
    isLoading: listLoading,
    isError: listError,
    error: listErrorObj,
    isSuccess: listSuccess,
    refetch,
  } = useQuery({
    queryKey: [...qk.applications(pid), 'paged', listParams],
    queryFn: () => acceleratorApi.getApplicationsPaged(pid ?? undefined, listParams),
    enabled: pid != null,
    placeholderData: (prev) => prev,
  });

  // Full working set (for the analytical sub-tabs). Capped at the server max.
  const { data: allApps = [] } = useQuery({
    queryKey: [...qk.applications(pid), 'all'],
    queryFn: () => acceleratorApi.getApplications(pid ?? undefined, { page_size: 200 }),
    enabled: pid != null,
  });

  // Server aggregates drive counters, chip counts and the filter option lists.
  const { data: summary } = useQuery({
    queryKey: qk.screeningSummary(pid),
    queryFn: () => acceleratorApi.getScreeningSummary(pid ?? undefined),
    enabled: pid != null,
  });

  const total = paged?.count ?? 0;
  const rows = paged?.results ?? [];
  const programTotal = summary?.total ?? total;

  // Reset page + clear selection whenever the query context changes; clamp the
  // page if the result set shrinks below the current page.
  React.useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [pid, statusChip, tier, filterSector, filterCountry, filterStage, searchQuery, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  // Navigating pages shows a different row set — drop any carried-over selection.
  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [page]);
  const currentPage = Math.min(page, totalPages);

  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, total);

  // Option lists derived from the server aggregate (never from fabricated data).
  const sectorOptions = summary?.sectors ?? [];
  const countryOptions = summary?.countries ?? [];
  const stageOptions = summary?.declared_stages ?? [];
  const tierOptions = ['A', 'B', 'C', 'D'];

  // Chip counts from the server status breakdown (not client filtering).
  const groupCount = (statuses: string[]) =>
    statuses.reduce((s, k) => s + (summary?.by_status?.[k] ?? 0), 0);
  const chipCounts: Record<'ALL' | StatusGroup, number> = {
    ALL: programTotal,
    UNPROCESSED: groupCount(STATUS_GROUPS.UNPROCESSED),
    IN_REVIEW: groupCount(STATUS_GROUPS.IN_REVIEW),
    SHORTLISTED: groupCount(STATUS_GROUPS.SHORTLISTED),
    REJECTED: groupCount(STATUS_GROUPS.REJECTED),
  };

  const invalidateLists = () => {
    queryClient.invalidateQueries({ queryKey: qk.applications(pid) });
    queryClient.invalidateQueries({ queryKey: qk.screeningSummary(pid) });
  };

  // ── Mutations ───────────────────────────────────────────────────────────
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['accelerator-applications'] });
    queryClient.invalidateQueries({ queryKey: ['accelerator-screening-summary'] });
    queryClient.invalidateQueries({ queryKey: ['decision-room'] });
  };

  const triageMutation = useMutation({
    mutationFn: async () => {
      if (!activeProgram) return null;
      return acceleratorApi.triageAllApplications(activeProgram.id);
    },
    onSuccess: (res) => {
      if (!res) return;
      const skipped = res.not_run > 0 ? ` ${res.not_run} skipped (draft, withdrawn or past the batch cap).` : '';
      const failed = res.failed > 0 ? ` ${res.failed} failed.` : '';
      toast({
        title: res.ran > 0 ? 'Automated triage recorded' : 'Nothing was triaged',
        description: `${res.ran} applications now carry a screening tier and an eligibility row.${skipped}${failed}`,
        variant: res.ran > 0 ? 'success' : 'info',
      });
      invalidateAll();
    },
    onError: (err: unknown) => {
      toast({ title: 'Screening failed', description: apiErrMessage(err, 'No application was screened. Nothing changed.'), variant: 'error' });
    },
  });

  const transitionMutation = useMutation({
    mutationFn: async ({ appId, toStage }: { appId: number; toStage: string }) =>
      acceleratorApi.advanceApplicationStage(appId, toStage),
    onSuccess: (_data, { appId, toStage }) => {
      toast({ title: 'Stage updated', description: `Application #${appId} advanced to ${statusLabel(toStage)}.`, variant: 'success' });
      invalidateAll();
    },
    onError: (err: unknown) => {
      toast({ title: 'Stage transition failed', description: apiErrMessage(err, 'Could not advance application stage.'), variant: 'error' });
    },
  });

  const seedDefaultsMutation = useMutation({
    mutationFn: () => acceleratorApi.seedDefaults(),
    onSuccess: (data: any) => {
      toast({
        title: 'Database initialized',
        description: data?.message || 'Default accelerator applications and archetypes seeded into database.',
        variant: 'success',
      });
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ['accelerator-programs'] });
    },
    onError: (err: unknown) => {
      toast({ title: 'Seed failed', description: apiErrMessage(err, 'Could not initialize the database.'), variant: 'error' });
    },
  });

  // Bulk / single evidence request — allSettled so one failure never aborts the
  // rest; a per-id summary is surfaced via apiErrMessage.
  const evidenceMutation = useMutation({
    mutationFn: async ({ ids, description }: { ids: number[]; description: string }) => {
      const settled = await Promise.allSettled(
        ids.map((id) => acceleratorApi.requestEvidence(id, [{ type: 'custom', description }], description))
      );
      const failures: { id: number; msg: string }[] = [];
      settled.forEach((r, i) => {
        if (r.status === 'rejected') failures.push({ id: ids[i], msg: apiErrMessage(r.reason, 'request failed') });
      });
      return { ok: ids.length - failures.length, attempted: ids.length, failures };
    },
    onSuccess: ({ ok, attempted, failures }) => {
      if (failures.length === 0) {
        toast({
          title: 'Evidence request dispatched',
          description: ok === 1 ? 'The founder has been asked for supporting evidence.' : `${ok} founders have been asked for supporting evidence.`,
          variant: 'success',
        });
      } else {
        toast({
          title: `Dispatched ${ok} of ${attempted}`,
          description: failures.map((f) => `#${f.id}: ${f.msg}`).join('; '),
          variant: 'error',
        });
      }
      invalidateAll();
      setEvidenceModal(null);
      setEvidenceText('');
    },
  });

  // ── Selection helpers (rows on the current page) ──────────────────────────
  const allPageSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const toggleRow = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePage = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });

  // ── CSV export of the current page (formula-injection safe via downloadCsv) ─
  const exportCsv = () => {
    const headers = [
      'Company', 'Program', 'Status', 'Declared Stage', 'Inferred Stage', 'Country', 'Sector',
      'Screening Tier', 'Program Fit', 'Startup Strength', 'Evidence Confidence', 'Completeness',
      'Total Claims', 'Unverified Claims', 'Reviewers', 'Stage Conflict', 'Screening Risk',
      'Queue Lane',
    ];
    const body = rows.map((app) => [
      app.company_name, app.program_name, app.status, app.declared_stage ?? '', app.inferred_stage,
      app.country ?? '', app.sector ?? '', app.automated_screening_tier || 'UNRATED',
      app.program_fit_score, app.startup_strength_score, app.evidence_confidence_score,
      app.application_completeness_score, app.total_claims, app.unverified_claims,
      app.reviewer_count, app.stage_conflict_detected ? 'yes' : 'no',
      app.risk_level ?? 'Not screened', app.queue_bucket ?? 'unrouted',
    ]);
    downloadCsv(`applications-${pid ?? 'program'}-${new Date().toISOString().slice(0, 10)}.csv`, headers, body);
  };

  // Evidence modal: focus in/out + close on Escape (lightweight a11y).
  React.useEffect(() => {
    if (!evidenceModal) return;
    const restore = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => evidenceRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEvidenceModal(null);
        setEvidenceText('');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      restore?.focus?.();
    };
  }, [evidenceModal]);

  const selectCls =
    'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 space-y-6">
      {/* ── Top Header & Tab Controls ─────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2.5">
              <Inbox className="h-6 w-6 text-indigo-600" />
              Applications Selection Pipeline
            </h1>
            <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              {programTotal} Submissions
            </span>
          </div>
          <p className="text-xs text-slate-500">
            {activeProgram?.name || 'Active Program'} · Policy-driven selection runtime
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => triageMutation.mutate()}
            disabled={triageMutation.isPending || programTotal === 0}
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm"
          >
            <Zap className={cn('h-3.5 w-3.5 mr-1.5', triageMutation.isPending && 'animate-pulse')} />
            {triageMutation.isPending ? 'Screening…' : 'Run ML Screening'}
          </Button>

          {process.env.NODE_ENV === 'development' && listSuccess && programTotal === 0 && (
            <Button
              onClick={() => seedDefaultsMutation.mutate()}
              disabled={seedDefaultsMutation.isPending}
              variant="outline"
              size="sm"
              className="border-slate-300 bg-white text-slate-700 hover:bg-slate-100 text-xs"
            >
              <Zap className={cn('h-3.5 w-3.5 mr-1.5', seedDefaultsMutation.isPending && 'animate-spin')} />
              Seed Database Applications
            </Button>
          )}
        </div>
      </div>

      {/* ── Primary Sub-Navigation Tabs ───────────────────────────────── */}
      <div role="tablist" aria-label="Application views" className="flex border-b border-slate-200 gap-2 text-xs font-semibold overflow-x-auto">
        {[
          { id: 'INBOX', label: `Application Inbox (${programTotal})`, icon: Layers },
          { id: 'ELIGIBILITY', label: 'Eligibility & Triage', icon: ShieldCheck },
          { id: 'REVIEWS', label: 'Reviewer Consensus', icon: Users },
          { id: 'INTERVIEWS', label: 'Interviews', icon: Video },
          { id: 'SELECTION_MATRIX', label: 'Selection Matrix (2x2)', icon: Compass },
          { id: 'KANBAN', label: 'Workflow Pipeline (Kanban)', icon: Activity },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 transition border-b-2 -mb-px whitespace-nowrap',
                isActive
                  ? 'border-indigo-600 text-indigo-600 font-bold bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tab 1: Application Inbox — server-paged data table ─────────── */}
      {activeTab === 'INBOX' && (
        <div role="tabpanel" aria-label="Application inbox" className="space-y-4">
          {/* Status filter chips — counts from the server status breakdown */}
          <div role="group" aria-label="Status filter" className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: 'All' },
                { id: 'UNPROCESSED', label: 'Unprocessed' },
                { id: 'IN_REVIEW', label: 'In Review' },
                { id: 'SHORTLISTED', label: 'Shortlisted' },
                { id: 'REJECTED', label: 'Rejected' },
              ] as const
            ).map((chip) => (
              <button
                key={chip.id}
                onClick={() => setStatusChip(chip.id)}
                aria-pressed={statusChip === chip.id}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-semibold transition',
                  statusChip === chip.id
                    ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
                )}
              >
                {chip.label}
                <span className={cn('ml-1.5', statusChip === chip.id ? 'text-indigo-200' : 'text-slate-400')}>
                  {chipCounts[chip.id]}
                </span>
              </button>
            ))}
          </div>

          {/* Filter bar: server-side selects + search + export */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Stage filter" className={selectCls} value={filterStage} onChange={(e) => setFilterStage(e.target.value)}>
                <option value="ALL">Stage: All</option>
                {stageOptions.map((s) => (
                  <option key={s.name} value={s.name}>{statusLabel(s.name)} ({s.count})</option>
                ))}
              </select>
              <select aria-label="Sector filter" className={selectCls} value={filterSector} onChange={(e) => setFilterSector(e.target.value)}>
                <option value="ALL">Sector: All</option>
                {sectorOptions.map((s) => (
                  <option key={s.name} value={s.name}>{s.name} ({s.count})</option>
                ))}
              </select>
              <select aria-label="Country filter" className={selectCls} value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)}>
                <option value="ALL">Country: All</option>
                {countryOptions.map((s) => (
                  <option key={s.name} value={s.name}>{s.name} ({s.count})</option>
                ))}
              </select>
              <select aria-label="Screening tier filter" className={selectCls} value={tier} onChange={(e) => setTier(e.target.value)}>
                <option value="ALL">Tier: All</option>
                {tierOptions.map((t) => (
                  <option key={t} value={t}>Tier {t} ({summary?.tiers?.[t] ?? 0})</option>
                ))}
              </select>

              <div className="relative ml-auto w-full sm:w-64">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="search"
                  aria-label="Search applications"
                  placeholder="Search company, program, founder…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={exportCsv}
                disabled={rows.length === 0}
                title="Exports the rows on this page"
                className="border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export
              </Button>
            </div>
          </div>

          {/* Bulk action bar — navigation + evidence requests only, no status changes */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-2.5">
              <span className="text-xs font-bold text-indigo-700">{selectedIds.size} selected</span>
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-500 text-white"
                onClick={() => {
                  const ids = Array.from(selectedIds);
                  setEvidenceModal({
                    ids,
                    label: ids.length === 1 ? 'the selected application' : `${ids.length} selected applications`,
                  });
                  setEvidenceText('');
                }}
              >
                <FileCheck className="h-3.5 w-3.5 mr-1.5" />
                Request evidence
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-100"
                onClick={() => router.push('/accelerator/review-queue')}
              >
                Open in queue <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="ml-auto text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            </div>
          )}

          {/* Loading / error / empty / table states */}
          {listLoading ? (
            <TableSkeleton />
          ) : listError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center shadow-sm">
              <AlertTriangle className="mx-auto h-8 w-8 text-rose-400 mb-2" />
              <p className="text-sm font-semibold text-rose-700">{apiErrMessage(listErrorObj, 'Could not load applications.')}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3 border-rose-300 bg-white text-rose-700 hover:bg-rose-100">
                Retry
              </Button>
            </div>
          ) : listSuccess && total === 0 && !hasActiveFilters({ statusChip, tier, filterSector, filterCountry, filterStage, searchQuery }) ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center space-y-3 shadow-sm">
              <Inbox className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="text-base font-bold text-slate-900">No applications received yet</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No startup submissions exist in this selection cycle yet. You can initialize the database with standard accelerator records.
              </p>
              <Button
                onClick={() => seedDefaultsMutation.mutate()}
                disabled={seedDefaultsMutation.isPending}
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
              >
                Seed Database Applications
              </Button>
            </div>
          ) : listSuccess && total === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-16 text-center">
              <Inbox className="mx-auto h-8 w-8 text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-500">No applications match the current filters.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200 bg-white">
                    <tr>
                      <th className="w-10 px-4 py-3">
                        <button onClick={togglePage} aria-label="Select all rows on this page" className="text-slate-400 hover:text-indigo-600">
                          {allPageSelected ? <CheckSquare className="h-4 w-4 text-indigo-600" /> : <Square className="h-4 w-4" />}
                        </button>
                      </th>
                      <th className="px-4 py-3 font-semibold">Applicant</th>
                      <th className="px-4 py-3 font-semibold">Stage</th>
                      <th className="px-4 py-3 font-semibold">Sector</th>
                      <th className="px-4 py-3 font-semibold">Potential</th>
                      <th className="px-4 py-3 font-semibold">Evidence</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((app: ApplicationItem) => {
                      // Risk is routed server-side (queue_routing.py). An
                      // unscreened row has no level at all — it never defaults
                      // to "Low", because missing is not zero.
                      const riskLevel = app.risk_level ?? null;
                      const riskReasons = app.risk_reasons ?? [];
                      const isSelected = selectedIds.has(app.id);
                      const openWhy = () => {
                        openIntelligenceDrawer({
                          title: `${app.company_name} — why this deserves review`,
                          entityName: app.company_name,
                          category: 'ML-assisted screening',
                          // 'NOT SCREENED' is deliberate: an unrouted row is not
                          // a low-risk row.
                          severity: (riskLevel ? riskLevel.toUpperCase() : 'NOT SCREENED') as RiskSeverity,
                          // Real DB field (evidence_confidence_score) — never an invented confidence %.
                          confidence: Math.round(app.evidence_confidence_score ?? 0),
                          detectedAt: `Screened ${formatDateTime(app.updated_at)}`,
                          evidence: [
                            `Automated screening tier: ${app.automated_screening_tier ? `Tier ${app.automated_screening_tier}` : 'Unrated'}`,
                            `Program fit: ${evidenceLevelShort(app.program_fit_score)}`,
                            `Startup strength: ${evidenceLevelShort(app.startup_strength_score)}`,
                            `Application completeness: ${Math.round(app.application_completeness_score ?? 0)}%`,
                            `${app.unverified_claims} of ${app.total_claims} claims still unverified`,
                            ...(app.stage_conflict_detected ? ['Declared stage conflicts with reported metrics'] : []),
                            ...riskReasons,
                          ],
                          sources: ['Startup application form', 'ML-assisted screening'],
                          model: 'ML-assisted screening',
                          recommendedAction: { label: 'Open the evidence view to verify claims before deciding', type: 'REVIEW' },
                        });
                      };

                      return (
                        <tr key={app.id} className={cn('border-b border-slate-100 hover:bg-slate-50 transition', isSelected && 'bg-indigo-50/40')}>
                          {/* Checkbox */}
                          <td className="px-4 py-3 align-middle">
                            <button onClick={() => toggleRow(app.id)} aria-label={`Select ${app.company_name}`} className="text-slate-400 hover:text-indigo-600">
                              {isSelected ? <CheckSquare className="h-4 w-4 text-indigo-600" /> : <Square className="h-4 w-4" />}
                            </button>
                          </td>

                          {/* Applicant: company + real sector/tier/program subline */}
                          <td className="px-4 py-3">
                            <button onClick={() => setSelectedAppId(app.id)} className="text-left group" title="Open dossier drawer">
                              <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition">{app.company_name}</span>
                              <span className="block text-[11px] text-slate-500">
                                {app.sector || 'Sector not declared'} · {app.automated_screening_tier ? `Tier ${app.automated_screening_tier}` : 'Unrated'} · {app.program_name}
                              </span>
                            </button>
                            {/* Who the program has asked to review this row — a
                                different fact from the scorecard count in the
                                Review column: asking is not reviewing. Only
                                rendered where the server exposes reviewer
                                identity (staff). */}
                            {app.assignments && (
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <AssignmentChips assignments={app.assignments} />
                                <button
                                  onClick={() => setAssignFor(app)}
                                  className="text-[10px] font-semibold text-slate-400 hover:text-indigo-600"
                                  title="Ask someone on the program team to review this. Any reviewer can also file a scorecard without being asked."
                                >
                                  + ask
                                </button>
                              </div>
                            )}
                          </td>

                          {/* Stage — declared_stage is the real field; conflict flagged */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {app.declared_stage ? statusLabel(app.declared_stage) : '—'}
                            {app.stage_conflict_detected && (
                              <span className="ml-1 inline-flex items-center gap-0.5 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 align-middle" title="Declared vs inferred stage conflict">
                                <AlertTriangle className="h-2.5 w-2.5" /> Conflict
                              </span>
                            )}
                          </td>

                          {/* Sector */}
                          <td className="px-4 py-3 whitespace-nowrap">{app.sector || '—'}</td>

                          {/* Potential (evidence level, never a bare verdict) */}
                          <td className="px-4 py-3 min-w-[150px]">
                            <EvidenceBar score={app.startup_strength_score} label="Potential" />
                            <button
                              onClick={openWhy}
                              className="mt-0.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 underline"
                            >
                              Why?
                            </button>
                          </td>

                          {/* Evidence — deep-links to the real evidence tab */}
                          <td className="px-4 py-3 min-w-[150px]">
                            <Link href={`/accelerator/applications/${app.id}?tab=evidence`} className="w-full block text-left" title="Open evidence view">
                              <EvidenceBar score={app.evidence_confidence_score} label="Evidence" />
                            </Link>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              {riskLevel ? (
                                <span className={cn('inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold', RISK_TONE[riskLevel])} title={riskReasons.length ? riskReasons.join(' · ') : 'No contradiction or verification flags'}>
                                  Risk: {riskLevel}
                                </span>
                              ) : (
                                <span className="inline-block rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-400" title="ML screening has not recorded a risk level for this application">
                                  Risk: —
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400">
                                {app.total_claims} claims · {app.unverified_claims} unverified
                              </span>
                            </div>
                          </td>

                          {/* Status chip */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={cn('inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold', STATUS_CHIP_TONE[statusChipOf(app.status)] || STATUS_CHIP_TONE.ALL || 'bg-indigo-50 text-indigo-700 border-indigo-200')}>
                              {statusLabel(app.status)}
                            </span>
                          </td>

                          {/* Row actions */}
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <Link
                                href={`/accelerator/applications/${app.id}`}
                                className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-500 transition"
                              >
                                Review
                              </Link>
                              <Link
                                href={`/accelerator/applications/${app.id}?tab=evidence`}
                                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 transition"
                              >
                                Investigate
                              </Link>
                              <button
                                onClick={() => {
                                  setEvidenceModal({ ids: [app.id], label: app.company_name });
                                  setEvidenceText('');
                                }}
                                className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 transition"
                              >
                                Needs Evidence
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination footer — driven by the server `count` */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>Showing {rangeStart}–{rangeEnd} of {total}</span>
                  <select aria-label="Rows per page" className={selectCls} value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                    {[10, 25, 50, 100].map((n) => (
                      <option key={n} value={n}>{n} / page</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="border-slate-300 bg-white text-slate-600 hover:bg-slate-100">
                    <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Prev
                  </Button>
                  <span className="text-xs font-semibold text-slate-600">Page {currentPage} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="border-slate-300 bg-white text-slate-600 hover:bg-slate-100">
                    Next <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Ask-a-reviewer dialog (writes the ask; the row shows it) ───── */}
      <AssignReviewerDialog
        open={assignFor != null}
        onOpenChange={(open) => !open && setAssignFor(null)}
        applicationId={assignFor?.id ?? 0}
        applicationLabel={assignFor?.company_name ?? ''}
        programId={pid}
      />

      {/* ── Evidence-request modal (single or bulk) ───────────────────── */}
      {evidenceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setEvidenceModal(null)} />
          <div role="dialog" aria-modal="true" aria-label="Request evidence" className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Request evidence</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Ask {evidenceModal.label} for the specific documents or data points that are missing or unverified.
                </p>
              </div>
              <button onClick={() => setEvidenceModal(null)} aria-label="Close" className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              ref={evidenceRef}
              value={evidenceText}
              onChange={(e) => setEvidenceText(e.target.value)}
              rows={4}
              placeholder="e.g. Please provide bank statements or an API export verifying the reported MRR figure."
              className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEvidenceModal(null)} className="border-slate-300 bg-white text-slate-600 hover:bg-slate-100">
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!evidenceText.trim() || evidenceMutation.isPending}
                onClick={() => evidenceMutation.mutate({ ids: evidenceModal.ids, description: evidenceText.trim() })}
                className="bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                {evidenceMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />}
                {evidenceMutation.isPending ? 'Sending…' : 'Send request'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab 2: Eligibility & Triage ───────────────────────────────── */}
      {activeTab === 'ELIGIBILITY' && (
        <EligibilityTriageView programId={pid ?? undefined} />
      )}

      {/* ── Tab 3: Reviewer Consensus ─────────────────────────────────── */}
      {activeTab === 'REVIEWS' && <ReviewerConsensusView programId={pid ?? undefined} />}

      {/* ── Tab 4: Interviews ─────────────────────────────────────────── */}
      {activeTab === 'INTERVIEWS' && <InterviewOperationsView applications={allApps} />}

      {/* ── Tab 5: Selection Matrix (2x2) ─────────────────────────────── */}
      {activeTab === 'SELECTION_MATRIX' && (
        <SelectionMatrixView applications={allApps} program={activeProgram} onSelectCandidate={(id) => setSelectedAppId(id)} />
      )}

      {/* ── Tab 6: Visual Pipeline (Kanban) ───────────────────────────── */}
      {activeTab === 'KANBAN' && activeProgram && (
        <PipelineKanban
          applications={allApps}
          selectedAppId={selectedAppId}
          workflowStyle={activeProgram.workflow_style}
          onSelectApp={(id: number) => setSelectedAppId(id)}
          onTransitionStatus={(id: number, newStatus: string) => transitionMutation.mutate({ appId: id, toStage: newStatus })}
        />
      )}

      {/* ── Application Detail Dossier Drawer ─────────────────────────── */}
      <ApplicationDossierDrawer
        candidateId={selectedAppId}
        onClose={() => setSelectedAppId(null)}
        onPromoteToDecisionRoom={(id) => transitionMutation.mutate({ appId: id, toStage: 'COMMITTEE_REVIEW' })}
        onAdvanceStage={(id, stage) => transitionMutation.mutate({ appId: id, toStage: stage })}
      />
    </div>
  );
}

// Which chip a raw status belongs to (for chip tone only — display uses STATUS_LABELS).
function statusChipOf(status: string): 'ALL' | StatusGroup {
  for (const [group, statuses] of Object.entries(STATUS_GROUPS) as [StatusGroup, string[]][]) {
    if (statuses.includes(status)) return group;
  }
  return 'ALL';
}

function hasActiveFilters(f: { statusChip: string; tier: string; filterSector: string; filterCountry: string; filterStage: string; searchQuery: string }): boolean {
  return f.statusChip !== 'ALL' || f.tier !== 'ALL' || f.filterSector !== 'ALL' || f.filterCountry !== 'ALL' || f.filterStage !== 'ALL' || !!f.searchQuery;
}

/**
 * Evidence-level bar. Width reflects the underlying 0-100 signal, but the
 * visible text is always evidence-level language — never a bare ML score.
 * Missing (null) is rendered as "No data", never coerced to 0 / "Needs Evidence".
 */
function EvidenceBar({ score, label }: { score: number | null | undefined; label: string }) {
  const lvl = evidenceLevel(score);
  if (!lvl) {
    return (
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[11px] text-slate-500">{label}</span>
          <span className="text-[11px] font-bold text-slate-400">No data</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100" />
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[11px] text-slate-500">{label}</span>
        <span className={cn('text-[11px] font-bold', TONE_TEXT[lvl.tone])}>{lvl.label}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={cn('h-full rounded-full', TONE_BAR[lvl.tone])} style={{ width: `${Math.min(100, Math.max(0, lvl.score))}%` }} />
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="h-4 w-4 rounded bg-slate-100 animate-pulse" />
          <div className="h-4 flex-1 rounded bg-slate-100 animate-pulse" />
          <div className="h-4 w-24 rounded bg-slate-100 animate-pulse" />
          <div className="h-4 w-16 rounded bg-slate-100 animate-pulse" />
          <div className="h-4 w-20 rounded bg-slate-100 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export default function ApplicationsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      }
    >
      <ApplicationsPageContent />
    </React.Suspense>
  );
}
