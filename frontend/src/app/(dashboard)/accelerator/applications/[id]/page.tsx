'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  ClipboardList,
  Clock,
  FileText,
  GitBranch,
  HelpCircle,
  LayoutDashboard,
  Link2,
  Loader2,
  MessageSquare,
  PauseCircle,
  Rocket,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Target,
  TrendingUp,
  UserRound,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { useActiveProgram } from '../../ProgramContext';
import { ReviewerWorkspace } from '@/components/accelerator/ReviewerWorkspace';
import { ReviewerAssignmentPanel } from '@/components/accelerator/ReviewerAssignments';
import { DiligenceItemPanel } from '@/components/accelerator/DiligenceItems';
import {
  acceleratorApi,
  type AppNote,
  type ApplicationItem,
  type ApplicationAssessment,
  type CandidateCard,
  type EvidenceGraph,
  type EvidenceGraphClaim,
  type ScoringDimensionRow,
} from '@/lib/acceleratorApi';
import {
  STATUS_LABELS,
  isTerminal,
  evidenceLevel,
  evidenceLevelShort,
  apiErrMessage,
  formatDateTime,
  relativeTime,
  qk,
  type AppStatus,
} from '@/lib/screening';

// ── Evidence ladder ──────────────────────────────────────────────────────────
// Levels themselves come from @/lib/screening (single source of truth). This
// page only owns the Tailwind mapping. MISSING IS NOT ZERO: a null score
// renders "No data", never "Requires validation" and never a 0-width bar.

const TONE_CLS: Record<'strong' | 'moderate' | 'limited' | 'gap', { chip: string; bar: string }> = {
  strong: { chip: 'text-emerald-700 bg-emerald-50 border-emerald-200', bar: 'bg-emerald-500' },
  moderate: { chip: 'text-sky-700 bg-sky-50 border-sky-200', bar: 'bg-sky-500' },
  limited: { chip: 'text-amber-700 bg-amber-50 border-amber-200', bar: 'bg-amber-500' },
  gap: { chip: 'text-rose-700 bg-rose-50 border-rose-200', bar: 'bg-rose-500' },
};

function evidenceBits(score: number | null | undefined): {
  label: string;
  chip: string;
  bar: string;
  pct: number;
} {
  const lvl = evidenceLevel(score);
  if (!lvl) return { label: 'No data', chip: 'text-slate-500 bg-slate-100 border-slate-200', bar: 'bg-slate-300', pct: 0 };
  return {
    label: lvl.label,
    chip: TONE_CLS[lvl.tone].chip,
    bar: TONE_CLS[lvl.tone].bar,
    pct: Math.max(0, Math.min(100, lvl.score)),
  };
}

// Per-dimension assessment scores are 1–10; aggregates are 0–100. Normalise a
// dimension score to the 0–100 ladder without inventing a value for null.
function readScore(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function dimPct(v: unknown): number | null {
  const n = readScore(v);
  if (n === null) return null;
  return Math.round(n <= 10 ? n * 10 : n);
}

// Confidence arrives either as 0-1 or 0-100 depending on engine version — normalise.
function confidencePct(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return null;
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
}

// Columns of the stored ApplicationAssessment row itself — used to phrase
// low-confidence cautions and to feed the fixed section tabs. NOT the program's
// Selection Framework: those rows come from the candidate card.
const ASSESSMENT_DIMENSIONS: { key: keyof ApplicationAssessment; label: string }[] = [
  { key: 'founder_score', label: 'Founder' },
  { key: 'problem_score', label: 'Problem' },
  { key: 'product_score', label: 'Product' },
  { key: 'market_score', label: 'Market' },
  { key: 'traction_score', label: 'Traction' },
  { key: 'revenue_score', label: 'Business model' },
  { key: 'team_score', label: 'Team' },
];

function statusLabel(status: string | null | undefined): string {
  const s = status ?? '';
  return STATUS_LABELS[s as AppStatus] ?? s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

function stageBadge(status: string | undefined): { label: string; cls: string } {
  const s = status ?? '';
  if (s === 'COMMITTEE_REVIEW') return { label: 'IC', cls: 'bg-violet-100 text-violet-700 border-violet-200' };
  if (s.startsWith('INTERVIEW')) return { label: 'Interview', cls: 'bg-sky-100 text-sky-700 border-sky-200' };
  if (s === 'SHORTLISTED') return { label: 'Shortlist', cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' };
  if (s === 'ACCEPTED') return { label: statusLabel(s), cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  if (s === 'REJECTED' || s === 'WITHDRAWN') return { label: statusLabel(s), cls: 'bg-rose-100 text-rose-700 border-rose-200' };
  return { label: statusLabel(s), cls: 'bg-slate-100 text-slate-600 border-slate-200' };
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function money(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toLocaleString()}` : '—';
}

// claim.value is the backend's verified_value JSON — could be a string, number or object.
function formatClaimValue(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    const o = v as Record<string, any>;
    const inner = o.value ?? o.amount ?? o.usd ?? o.ngn ?? o.total;
    if (inner != null && typeof inner !== 'object') return String(inner);
    const parts = Object.entries(o)
      .filter(([, val]) => val != null && typeof val !== 'object')
      .map(([k, val]) => `${k}: ${val}`);
    return parts.length ? parts.join(' · ') : null;
  }
  return String(v);
}

// qk (screening.ts) has no entry for evidence requests — one local key so the
// list is not re-fetched under five different strings.
const qkEvidenceRequests = (id: number) => ['accelerator-evidence-requests', id] as const;

// ── Tabs ─────────────────────────────────────────────────────────────────────
type TabId =
  | 'overview'
  | 'founder'
  | 'company'
  | 'product'
  | 'market'
  | 'traction'
  | 'evidence'
  | 'reviews'
  | 'timeline';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'founder', label: 'Founder', icon: UserRound },
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'product', label: 'Product', icon: Rocket },
  { id: 'market', label: 'Market', icon: Target },
  { id: 'traction', label: 'Traction', icon: TrendingUp },
  { id: 'evidence', label: 'Evidence', icon: GitBranch },
  { id: 'reviews', label: 'Reviews', icon: ClipboardList },
  { id: 'timeline', label: 'Timeline', icon: Clock },
];

// Which dimensions / response categories / claim categories feed each section tab.
const SECTION_TAB_MAP: Record<'founder' | 'company' | 'product' | 'market' | 'traction', {
  dimensionKeys: (keyof ApplicationAssessment)[];
  responseCategories: string[];
  claimCategories: string[];
}> = {  founder: { dimensionKeys: ['founder_score', 'team_score'], responseCategories: ['team'], claimCategories: ['team'] },
  company: { dimensionKeys: ['problem_score'], responseCategories: ['legal', 'other'], claimCategories: ['funding', 'regulatory'] },
  product: { dimensionKeys: ['product_score'], responseCategories: ['product'], claimCategories: ['product', 'ip'] },
  market: { dimensionKeys: ['market_score'], responseCategories: ['market'], claimCategories: ['market'] },
  traction: { dimensionKeys: ['traction_score', 'revenue_score'], responseCategories: ['traction', 'financials'], claimCategories: ['revenue', 'commercial_traction'] },
};

// Keyword probes used to surface assessment bull/bear notes relevant to a tab.
const SECTION_KEYWORDS: Record<'founder' | 'company' | 'product' | 'market' | 'traction', RegExp> = {
  founder: /founder|team|background|experience|hire/,
  company: /company|incorporat|legal|funding|cap table|structure/,
  product: /product|mvp|build|ip|platform|feature/,
  market: /market|tam|sam|customer segment|competitor|adoption/,
  traction: /traction|revenu|mrr|arr|growth|loi|pilot|retention|customer/,
};

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Application360Page() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading application…
        </div>
      }
    >
      <Application360Content />
    </React.Suspense>
  );
}

function Application360Content() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeProgramId } = useActiveProgram();
  const pid = activeProgramId ?? null;
  const validId = !Number.isNaN(id) && id > 0;

  // ── Queries (all via shared qk keys — one cache, not five) ─────────────────
  const { data: rawApplications = [] } = useQuery({
    queryKey: qk.applications(pid),
    queryFn: () => acceleratorApi.getApplications(pid ?? undefined),
    enabled: pid != null,
  });
  const applications: ApplicationItem[] = Array.isArray(rawApplications) ? rawApplications : (rawApplications as any)?.results ?? [];

  const { data: detail, isLoading } = useQuery({
    queryKey: qk.appDetail(id),
    queryFn: () => acceleratorApi.getApplicationDetail(id),
    enabled: validId,
  });

  const {
    data: assessment,
    isLoading: assessmentLoading,
    error: assessmentError,
  } = useQuery<ApplicationAssessment>({
    queryKey: qk.appAssessment(id),
    queryFn: () => acceleratorApi.getApplicationAssessment(id),
    enabled: validId,
  });

  const {
    data: graph,
    isLoading: graphLoading,
    error: graphError,
  } = useQuery<EvidenceGraph>({
    queryKey: qk.evidenceGraph(id),
    queryFn: () => acceleratorApi.getEvidenceGraph(id),
    enabled: validId,
  });

  // Workflow gate: the rail renders ONLY what this endpoint says is legal.
  const {
    data: transitions,
    isLoading: transitionsLoading,
    error: transitionsError,
  } = useQuery({
    queryKey: qk.allowedTransitions(id),
    queryFn: () => acceleratorApi.getAllowedTransitions(id),
    enabled: validId,
  });

  // Selection Framework rows (dimension name/label/weight/score/confidence) are
  // computed server-side against THIS program's policy — the page must not keep
  // its own dimension list, or a program that renames a dimension would still
  // be shown the old one.
  const {
    data: frameworkCard,
    isLoading: frameworkLoading,
    error: frameworkError,
  } = useQuery<CandidateCard>({
    queryKey: qk.candidateCard(id),
    queryFn: () => acceleratorApi.getCandidateCard(id),
    enabled: validId,
    staleTime: 30_000,
  });

  // Append-only reviewer notes — one row per author, no shared blob to clobber.
  const {
    data: notes,
    isLoading: notesLoading,
    error: notesError,
  } = useQuery<AppNote[]>({
    queryKey: qk.appNotes(id),
    queryFn: () => acceleratorApi.getApplicationNotes(id),
    enabled: validId,
  });

  // Evidence requests for this application (for the Timeline tab) — endpoint exists:
  // /accelerator/evidence-requests/ returns all; filtered client-side by application.
  const { data: evidenceRequests, error: evidenceRequestsError } = useQuery<any[]>({
    queryKey: qkEvidenceRequests(id),
    queryFn: async () => {
      const rows = await acceleratorApi.osList<any>('evidence-requests');
      return rows.filter((r) => Number(r?.application) === id);
    },
    enabled: validId,
  });

  // ── Tab state synced to ?tab= ──────────────────────────────────────────────
  const tabParam = (searchParams.get('tab') ?? 'overview') as TabId;
  const activeTab: TabId = TABS.some((t) => t.id === tabParam) ? tabParam : 'overview';
  const setActiveTab = (next: TabId) => {
    router.replace(next === 'overview' ? `/accelerator/applications/${id}` : `/accelerator/applications/${id}?tab=${next}`);
  };

  // ── Derived data ───────────────────────────────────────────────────────────
  const listApp = applications.find((a) => a.id === id);
  const companyName: string = detail?.company_name ?? listApp?.company_name ?? `Application #${id}`;
  const status: string = detail?.status ?? listApp?.status ?? transitions?.current ?? '';
  const tier: string = (detail?.automated_screening_tier ?? listApp?.automated_screening_tier ?? '') as string;
  const profile = detail?.startup_profile ?? {};
  const sector: string = profile.industry ?? profile.sector_tags ?? listApp?.sector ?? '—';
  const location: string = profile.geography ?? '—';
  const declaredStage: string = profile.declared_stage ?? assessment?.declared_stage ?? listApp?.stage ?? '—';
  const claims: EvidenceGraphClaim[] = Array.isArray(graph?.claims) ? graph.claims : [];
  const reviews: any[] = Array.isArray(detail?.reviewer_assessments) ? detail.reviewer_assessments : [];
  const responses: any[] = Array.isArray(detail?.responses) ? detail.responses : [];
  const terminal = isTerminal(status);
  const submittedAt: string | null = detail?.submitted_at ?? frameworkCard?.submitted_at ?? null;

  // Screening score fields default to 0.0 on the model, so an application that
  // has never been screened is indistinguishable from a zero-scoring one. The
  // tier is only set by the screening run, so it is the honest gate.
  const screened = Boolean(tier);
  const frameworkDimensions: ScoringDimensionRow[] = frameworkCard?.dimension_scores ?? [];
  const frameworkSignals = [
    {
      label: 'Framework score',
      value: screened ? readScore(frameworkCard?.scores?.weighted_score) : null,
      hint: 'Weighted across program dimension weights',
    },
    {
      label: 'Evidence quality',
      value: screened ? readScore(frameworkCard?.scores?.evidence_confidence_score) : null,
      hint: 'Evidence confidence recorded at screening',
    },
    {
      label: 'Program fit',
      value: screened ? readScore(frameworkCard?.scores?.program_fit_score) : null,
      hint: 'Fit against program selection criteria',
    },
  ];

  // Refetch the record + the workflow gate after any stage move.
  const refreshAfterStage = () => {
    queryClient.invalidateQueries({ queryKey: qk.appDetail(id) });
    queryClient.invalidateQueries({ queryKey: qk.allowedTransitions(id) });
    queryClient.invalidateQueries({ queryKey: qk.applications(pid) });
    queryClient.invalidateQueries({ queryKey: qk.appAssessment(id) });
    queryClient.invalidateQueries({ queryKey: qk.candidateCard(id) });
    queryClient.invalidateQueries({ queryKey: qk.evidenceGraph(id) });
    queryClient.invalidateQueries({ queryKey: qkEvidenceRequests(id) });
  };

  // ── Decision rail: every move goes through the real workflow endpoint ──────
  const transitionMutation = useMutation({
    mutationFn: (vars: { toStage: string; reason?: string }) =>
      acceleratorApi.advanceApplicationStage(id, vars.toStage, vars.reason),
    onSuccess: (data: any, vars) => {
      const err = typeof data?.error === 'string' ? data.error : null;
      if (err) {
        toast({ title: 'Move blocked', description: err, variant: 'error' });
        return;
      }
      toast({
        title: 'Stage updated',
        description: `Moved to ${statusLabel(data?.status ?? vars.toStage)}. The workflow engine recorded this transition.`,
        variant: 'success',
      });
      refreshAfterStage();
    },
    onError: (err: unknown, vars) =>
      toast({
        // ApiError.message already carries the workflow-gate 400 reason and
        // the decision-authority 403 reason ("…not permitted…"). Show it.
        title: `Could not move to ${statusLabel(vars.toStage)}`,
        description: apiErrMessage(err, 'The backend rejected this stage transition.'),
        variant: 'error',
      }),
  });

  const evidenceRequestMutation = useMutation({
    mutationFn: (payload: { claims: EvidenceGraphClaim[]; message: string }) =>
      acceleratorApi.requestEvidence(
        id,
        payload.claims.map((c) => ({ type: 'custom', description: c.statement })),
        payload.message,
      ),
    onSuccess: () => {
      toast({ title: 'Evidence requested', description: 'The founder has been asked to supply the selected evidence.', variant: 'success' });
      refreshAfterStage();
    },
    onError: (err: unknown) =>
      toast({
        title: 'Evidence request failed',
        description: apiErrMessage(err, 'Could not dispatch the evidence request.'),
        variant: 'error',
      }),
  });

  const addNoteMutation = useMutation({
    mutationFn: (body: string) => acceleratorApi.addApplicationNote(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.appNotes(id) });
      toast({ title: 'Note added', description: 'Appended to the note trail for every reviewer.', variant: 'success' });
    },
    onError: (err: unknown) =>
      toast({ title: 'Note could not be saved', description: apiErrMessage(err, 'Could not add the note.'), variant: 'error' }),
  });

  // Modal state for the decision rail
  const [holdOpen, setHoldOpen] = React.useState(false);
  const [holdReason, setHoldReason] = React.useState('');
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState('');
  const [evidenceOpen, setEvidenceOpen] = React.useState(false);
  const [evidenceChecked, setEvidenceChecked] = React.useState<number[]>([]);
  const [evidenceMessage, setEvidenceMessage] = React.useState('');

  const openableEvidenceClaims = React.useMemo(
    () => claims.filter((c) => c.verification_status === 'unverified' || c.verification_status === 'contradicted' || c.verification_status === 'pending'),
    [claims],
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading application…
      </div>
    );
  }

  const badge = stageBadge(status);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 lg:p-8 space-y-6">
      {/* ── Header card ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Link href="/accelerator/applications" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 mb-2">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Applications
        </Link>
        <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-500 mb-1">Application Intelligence Record</div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black tracking-tight">{companyName}</h1>
          <span className="text-sm font-semibold text-slate-400">#{id}</span>
          <span className="text-[11px] font-semibold text-slate-400">
            {submittedAt ? `Submitted ${fmtDate(submittedAt)}` : 'Not submitted yet'}
          </span>
          <span className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-bold', badge.cls)}>{badge.label}</span>
          {tier === 'A' && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> High Priority
            </span>
          )}
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
            {statusLabel(status)}
          </span>
        </div>
        <p className="text-sm text-slate-500 mt-1 capitalize">
          {sector} • {location} • Declared stage: {String(declaredStage).replace(/_/g, ' ')}
        </p>
        <p className="text-[11px] text-slate-400 mt-2 max-w-2xl leading-snug">
          Normalized submission → extracted claims → evidence and verification status → contradictions → Selection
          Framework alignment → risks → why this deserves attention. Every field below comes from the record itself.
          ML surfaces evidence; the reviewer decides.
        </p>

        {/* Stage conflict banner (kept from previous version) */}
        {assessment?.stage_conflict && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-800">
              <div className="font-bold">Stage conflict</div>
              <div className="mt-0.5">
                Declared: <span className="font-semibold">{assessment.declared_stage || '—'}</span> · Inferred:{' '}
                <span className="font-semibold">{assessment.inferred_stage || '—'}</span>
              </div>
              <div className="mt-0.5">{assessment.stage_conflict_explanation ?? 'Declared stage and inferred stage disagree.'}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Tab bar (underline pills) ───────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 transition border-b-2 -mb-px whitespace-nowrap rounded-t-lg text-sm',
                isActive
                  ? 'border-indigo-600 text-indigo-600 font-bold bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-white/60',
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <OverviewTab
          assessment={assessment}
          assessmentLoading={assessmentLoading}
          assessmentError={assessmentError}
          frameworkDimensions={frameworkDimensions}
          frameworkSignals={frameworkSignals}
          frameworkLoading={frameworkLoading}
          frameworkError={frameworkError}
          detail={detail}
          claims={claims}
          graph={graph}
          graphLoading={graphLoading}
          graphError={graphError}
          tier={tier}
          listApp={listApp}
          status={status}
          transitions={transitions?.allowed ?? []}
          transitionsLoading={transitionsLoading}
          transitionsError={transitionsError}
          terminal={terminal}
          onTransition={(toStage) => transitionMutation.mutate({ toStage })}
          onHold={() => {
            setHoldReason('');
            setHoldOpen(true);
          }}
          onRequestEvidence={() => {
            setEvidenceChecked([]);
            setEvidenceMessage('');
            setEvidenceOpen(true);
          }}
          onReject={() => {
            setRejectReason('');
            setRejectOpen(true);
          }}
          decisionPending={transitionMutation.isPending || evidenceRequestMutation.isPending}
          notes={Array.isArray(notes) ? notes : []}
          notesLoading={notesLoading}
          notesError={notesError}
          notePending={addNoteMutation.isPending}
          onAddNote={(body) => addNoteMutation.mutate(body)}
        />
      )}

      {(activeTab === 'founder' || activeTab === 'company' || activeTab === 'product' || activeTab === 'market' || activeTab === 'traction') && (
        <SectionTab
          tab={activeTab}
          assessment={assessment}
          assessmentError={assessmentError}
          detail={detail}
          claims={claims}
          responses={responses}
        />
      )}

      {activeTab === 'evidence' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <EvidenceGraphCard graph={graph} loading={graphLoading} error={graphError} claims={claims} compact={false} />
          </div>
          {/* What the ML assembled, and separately what a human decided still
              has to be proved — with a named owner against each question. */}
          <DiligenceItemPanel
            applicationId={id}
            programId={pid}
            applicationLabel={companyName}
          />
        </div>
      )}

      {activeTab === 'reviews' && (
        <div className="space-y-4">
          {/* Ownership first: who the program asked, and whether each of them
              has actually filed a scorecard. Below it, the scorecards. */}
          <ReviewerAssignmentPanel
            applicationId={id}
            programId={pid}
            applicationLabel={companyName}
          />
          <section className="rounded-2xl border border-slate-200 bg-white p-1 shadow-sm overflow-hidden">
            <ReviewerWorkspace
            applications={applications.length ? applications : [{ id, company_name: companyName } as ApplicationItem]}
            selectedAppId={id}
            applicationDetail={detail}
            onSelectApp={(next) => router.push(`/accelerator/applications/${next}`)}
            onRequestEvidence={() => toast({ title: 'Use “Request evidence”', description: 'Dispatch an evidence loop from the Overview tab.', variant: 'info' })}
            onAdvanceToIC={() => transitionMutation.mutate({ toStage: 'COMMITTEE_REVIEW' })}
            onSubmitReview={(scores: any) => {
              // Human scorecard, 1–10 per ReviewerAssessment. No pre-filled or
              // auto-created review: every dimension must have been entered.
              const keys = ['founder', 'market', 'product', 'traction', 'conviction'] as const;
              const bad = keys.some((k) => {
                const v = readScore(scores?.[k]);
                return v === null || v < 1 || v > 10;
              });
              if (bad) {
                toast({ title: 'Scores required', description: 'Enter every dimension score (1–10) before submitting — no default reviews are created.', variant: 'error' });
                return;
              }
              acceleratorApi
                .recordReviewerScore({
                  application: id,
                  founder_score: Number(scores.founder),
                  market_score: Number(scores.market),
                  product_score: Number(scores.product),
                  traction_score: Number(scores.traction),
                  overall_conviction: Number(scores.conviction),
                  recommendation: scores.recommendation,
                  notes: typeof scores.notes === 'string' && scores.notes.trim() ? scores.notes.trim() : undefined,
                })
                .then(() => {
                  queryClient.invalidateQueries({ queryKey: qk.reviews(pid) });
                  queryClient.invalidateQueries({ queryKey: qk.appDetail(id) });
                  queryClient.invalidateQueries({ queryKey: qk.applications(pid) });
                  queryClient.invalidateQueries({ queryKey: qk.appAssessment(id) });
                  toast({ title: 'Review recorded', description: 'Your human scorecard (1–10) was saved for this application.', variant: 'success' });
                })
                .catch((err) => {
                  toast({ title: 'Review could not be saved', description: apiErrMessage(err, 'Could not submit your review.'), variant: 'error' });
                });
            }}
            onQueryCopilot={async (query) => {
              try {
                const res = await acceleratorApi.queryCopilot(id, query);
                return res.answer;
              } catch (err) {
                throw new Error(apiErrMessage(err, 'The copilot is unavailable right now.'));
              }
            }}
          />
        </section>
        </div>
      )}

      {activeTab === 'timeline' && (
        <TimelineTab
          detail={detail}
          assessment={assessment}
          reviews={reviews}
          evidenceRequests={Array.isArray(evidenceRequests) ? evidenceRequests : []}
          evidenceRequestsError={evidenceRequestsError}
          claims={claims}
        />
      )}

      {/* ── Decision modals (Overview tab triggers these) ───────────────────── */}
      <ConfirmModal
        open={holdOpen}
        onClose={() => setHoldOpen(false)}
        title="Hold this application?"
        description="Moves the application to Deferred so it is neither advanced nor rejected."
        confirmLabel="Confirm hold"
        tone="amber"
        pending={transitionMutation.isPending}
        onConfirm={() =>
          transitionMutation.mutate(
            { toStage: 'DEFERRED', reason: holdReason.trim() || undefined },
            { onSuccess: () => setHoldOpen(false) },
          )
        }
      >
        <label className="block text-xs font-semibold text-slate-600 mb-1">Reason (optional)</label>
        <textarea
          rows={3}
          value={holdReason}
          onChange={(e) => setHoldReason(e.target.value)}
          placeholder="Why is this on hold — waiting for what?"
          className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm outline-none focus:border-indigo-400 resize-none"
        />
      </ConfirmModal>

      <ConfirmModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject this application?"
        description="Sets the application status to Rejected. This is a human decision — Pitchmic only surfaces evidence."
        confirmLabel="Confirm rejection"
        tone="rose"
        pending={transitionMutation.isPending}
        disabled={!rejectReason.trim()}
        onConfirm={() =>
          transitionMutation.mutate(
            { toStage: 'REJECTED', reason: rejectReason.trim() },
            { onSuccess: () => setRejectOpen(false) },
          )
        }
      >
        <label className="block text-xs font-semibold text-slate-600 mb-1">
          Reason <span className="text-rose-500">(required)</span>
        </label>
        <textarea
          rows={3}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="The rationale shared with the founder…"
          className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm outline-none focus:border-rose-400 resize-none"
        />
      </ConfirmModal>

      <ConfirmModal
        open={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
        title="Request evidence from the founder"
        description="Select the open claims below and send a targeted evidence loop."
        confirmLabel={evidenceRequestMutation.isPending ? 'Sending…' : 'Send evidence request'}
        tone="indigo"
        wide
        pending={evidenceRequestMutation.isPending}
        disabled={evidenceChecked.length === 0}
        onConfirm={() => {
          const selected = openableEvidenceClaims.filter((c) => evidenceChecked.includes(c.id));
          evidenceRequestMutation.mutate(
            { claims: selected, message: evidenceMessage },
            { onSuccess: () => setEvidenceOpen(false) },
          );
        }}
      >
        {openableEvidenceClaims.length === 0 ? (
          <p className="text-sm text-slate-400 py-2">— No unverified or contradicted claims to request evidence for.</p>
        ) : (
          <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
            {openableEvidenceClaims.map((c) => {
              const checked = evidenceChecked.includes(c.id);
              return (
                <label key={c.id} className="flex items-start gap-2.5 p-3 cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setEvidenceChecked((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)))
                    }
                    className="mt-0.5 h-4 w-4 accent-indigo-600"
                  />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-medium text-slate-800 leading-snug">{c.statement}</span>
                    <span className="block text-[10px] text-slate-400 mt-0.5">
                      {c.category} · materiality {c.materiality} · {c.verification_status.replace(/_/g, ' ')}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
        <div className="mt-3">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Message to founder (optional)</label>
          <textarea
            rows={3}
            value={evidenceMessage}
            onChange={(e) => setEvidenceMessage(e.target.value)}
            placeholder="What exactly do you need, and in what format?"
            className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm outline-none focus:border-indigo-400 resize-none"
          />
        </div>
      </ConfirmModal>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Overview tab (flagship)
// ═════════════════════════════════════════════════════════════════════════════
function OverviewTab({
  assessment,
  assessmentLoading,
  assessmentError,
  frameworkDimensions,
  frameworkSignals,
  frameworkLoading,
  frameworkError,
  detail,
  claims,
  graph,
  graphLoading,
  graphError,
  tier,
  listApp,
  status,
  transitions,
  transitionsLoading,
  transitionsError,
  terminal,
  onTransition,
  onHold,
  onRequestEvidence,
  onReject,
  decisionPending,
  notes,
  notesLoading,
  notesError,
  notePending,
  onAddNote,
}: {
  assessment: ApplicationAssessment | undefined;
  assessmentLoading: boolean;
  assessmentError: unknown;
  frameworkDimensions: ScoringDimensionRow[];
  frameworkSignals: { label: string; value: number | null; hint: string }[];
  frameworkLoading: boolean;
  frameworkError: unknown;
  detail: any;
  claims: EvidenceGraphClaim[];
  graph: EvidenceGraph | undefined;
  graphLoading: boolean;
  graphError: unknown;
  tier: string;
  listApp: ApplicationItem | undefined;
  status: string;
  transitions: Array<{ status: string; label: string }>;
  transitionsLoading: boolean;
  transitionsError: unknown;
  terminal: boolean;
  onTransition: (toStage: string) => void;
  onHold: () => void;
  onRequestEvidence: () => void;
  onReject: () => void;
  decisionPending: boolean;
  notes: AppNote[];
  notesLoading: boolean;
  notesError: unknown;
  notePending: boolean;
  onAddNote: (body: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
      {/* LEFT (~2/3) */}
      <div className="xl:col-span-2 space-y-6">
        <WhyCard assessment={assessment} loading={assessmentLoading} error={assessmentError} claims={claims} />
        <SelectionAssessmentCard
          dimensions={frameworkDimensions}
          signals={frameworkSignals}
          loading={frameworkLoading}
          error={frameworkError}
        />
        <KeyEvidenceCard assessment={assessment} claims={claims} graph={graph} loading={graphLoading} error={graphError} />
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <EvidenceGraphCard graph={graph} loading={graphLoading} error={graphError} claims={claims} compact />
        </div>
      </div>

      {/* RIGHT (~1/3, sticky) */}
      <div className="space-y-6 xl:sticky xl:top-6">
        <RecommendationCard
          assessment={assessment}
          assessmentError={assessmentError}
          tier={tier}
          listApp={listApp}
          graph={graph}
          graphError={graphError}
        />
        <DecisionRail
          status={status}
          transitions={transitions}
          transitionsLoading={transitionsLoading}
          transitionsError={transitionsError}
          terminal={terminal}
          pending={decisionPending}
          onTransition={onTransition}
          onHold={onHold}
          onRequestEvidence={onRequestEvidence}
          onReject={onReject}
        />
        <NotesCard notes={notes} loading={notesLoading} error={notesError} pending={notePending} onAdd={onAddNote} />
      </div>
    </div>
  );
}

// ── "Why this application deserves your attention" ───────────────────────────
// Built strictly from the real ApplicationAssessment (bull/bear case, risk
// flags, stage conflict) and the evidence graph — never invented strings.
function WhyCard({
  assessment,
  loading,
  error,
  claims,
}: {
  assessment: ApplicationAssessment | undefined;
  loading: boolean;
  error: unknown;
  claims: EvidenceGraphClaim[];
}) {
  const strengths: string[] = [];
  const cautions: string[] = [];

  (assessment?.bull_case ?? []).forEach((b) => strengths.push(b.point));
  claims
    .filter((c) => c.verification_status === 'verified')
    .slice(0, 3)
    .forEach((c) => strengths.push(`Verified: ${c.statement}`));

  (assessment?.bear_case ?? []).forEach((b) => cautions.push(b.point));
  claims
    .filter((c) => c.verification_status === 'contradicted')
    .forEach((c) => cautions.push(`Contradiction — ${c.statement}${c.discrepancy_notes ? ` (${c.discrepancy_notes})` : ''}`));
  if (assessment?.stage_conflict) {
    cautions.push(`Stage conflict: declared ${assessment.declared_stage || '—'} vs inferred ${assessment.inferred_stage || '—'}.`);
  }
  if (assessment) {
    ASSESSMENT_DIMENSIONS.forEach(({ key, label }) => {
      const conf = confidencePct((assessment as any)[`${String(key).replace('_score', '')}_confidence`]);
      if (conf !== null && conf > 0 && conf < 40) cautions.push(`${label} evidence unclear — the ML assessment had low confidence (${conf}%) in this dimension.`);
    });
    (assessment.risk_flags ?? [])
      .filter((r) => r.severity === 'high' || r.severity === 'critical')
      .forEach((r) => cautions.push(`${r.risk}${r.evidence ? ` — ${r.evidence}` : ''}`));
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-indigo-500" /> Why this application deserves your attention
      </h2>
      <p className="text-[11px] text-slate-400 mb-4">
        Strengths, weaknesses, contradictions and missing evidence — then you decide. ML surfaces evidence; it does not decide.
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading the ML assessment…
        </div>
      ) : error ? (
        <p className="text-sm text-rose-600 py-2">ML assessment unavailable — {apiErrMessage(error, 'could not load the assessment for this application.')}</p>
      ) : strengths.length === 0 && cautions.length === 0 ? (
        <p className="text-sm text-slate-400">— No assessment generated yet; strengths and cautions appear after screening analysis runs.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 mb-2">Strengths</div>
            {strengths.length === 0 ? (
              <p className="text-[12px] text-slate-400">— None recorded.</p>
            ) : (
              <ul className="space-y-1.5">
                {strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-slate-700 leading-snug">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600 mb-2">Cautions</div>
            {cautions.length === 0 ? (
              <p className="text-[12px] text-slate-400">— None recorded.</p>
            ) : (
              <ul className="space-y-1.5">
                {cautions.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-slate-700 leading-snug">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Selection Assessment (program Selection Framework rows) ─────────────────
// Rows are THIS program's dimensions, weights and scores as computed by the
// server (candidate-card endpoint). The page adds no dimensions of its own:
// a program that scores "Financials" instead of "Business model" sees exactly
// the row it configured, and a dimension with no ML confidence shows "—".
function SelectionAssessmentCard({
  dimensions,
  signals,
  loading,
  error,
}: {
  dimensions: ScoringDimensionRow[];
  signals: { label: string; value: number | null; hint: string }[];
  loading: boolean;
  error: unknown;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-indigo-500" /> Selection Assessment
        </h2>
        <span className="text-[10px] text-slate-400 text-right">
          Dimensions &amp; weights come from the program's Selection Framework
        </span>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the framework scorecard…
        </div>
      ) : error ? (
        <p className="text-sm text-rose-600 py-4">
          Selection Framework scores unavailable — {apiErrMessage(error, 'could not load the dimension scores.')}
        </p>
      ) : dimensions.length === 0 ? (
        <div className="text-sm text-slate-400 py-6 text-center">
          This program has no Selection Framework dimensions yet.
        </div>
      ) : (
        <div className="space-y-3">
          {dimensions.map((d) => {
            const pct = dimPct(d.score);
            const lv = evidenceBits(pct);
            const conf = confidencePct(d.confidence);
            return (
              <div key={d.name} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-xs font-semibold text-slate-600" title={d.description || undefined}>
                  {d.label}
                </span>
                <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold w-[118px] text-center', lv.chip)}>
                  {pct === null ? 'No data' : lv.label}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <div className={cn('h-full rounded-full', lv.bar)} style={{ width: `${pct === null ? 0 : lv.pct}%` }} />
                </div>
                <span className="w-28 shrink-0 text-right text-[10px] text-slate-400">
                  {pct !== null && <span className="mr-1.5 text-slate-500 font-semibold">{pct}/100</span>}
                  {conf !== null && conf > 0 ? `${conf}% confidence` : 'confidence —'}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {signals.length > 0 && (
        <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {signals.map((s) => {
            const lv = evidenceBits(s.value);
            return (
              <div key={s.label}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{s.label}</div>
                <div className={cn('text-lg font-black', s.value === null ? 'text-slate-300' : 'text-slate-900')}>
                  {s.value === null ? '—' : `${Math.round(s.value)}`}
                </div>
                <div className="text-[10px] text-slate-400 leading-snug">{s.value === null ? 'no data' : lv.label}</div>
                <div className="text-[10px] text-slate-300 leading-snug">{s.hint}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── Key Evidence & Flags checklist ───────────────────────────────────────────
function KeyEvidenceCard({
  assessment,
  claims,
  graph,
  loading,
  error,
}: {
  assessment: ApplicationAssessment | undefined;
  claims: EvidenceGraphClaim[];
  graph: EvidenceGraph | undefined;
  loading: boolean;
  error: unknown;
}) {
  type Bullet = { tone: 'ok' | 'flag' | 'gap'; text: string };
  const bullets: Bullet[] = [];

  claims
    .filter((c) => c.verification_status === 'verified' || c.verification_status === 'partially_verified')
    .slice(0, 5)
    .forEach((c) => bullets.push({ tone: 'ok', text: `${c.statement}${c.verification_status === 'partially_verified' ? ' (partially verified)' : ''}` }));

  claims
    .filter((c) => c.verification_status === 'contradicted')
    .forEach((c) => bullets.push({ tone: 'flag', text: `Contradiction: ${c.statement}${c.discrepancy_notes ? ` — ${c.discrepancy_notes}` : ''}` }));

  (assessment?.risk_flags ?? [])
    .filter((r) => r.severity === 'high' || r.severity === 'critical')
    .forEach((r) => bullets.push({ tone: 'flag', text: r.risk }));

  claims
    .filter((c) => c.verification_status === 'unverified' && (c.materiality === 'critical' || c.materiality === 'high'))
    .slice(0, 5)
    .forEach((c) => bullets.push({ tone: 'gap', text: `Missing evidence: ${c.statement}` }));

  if (graph && graph.summary.unverified > 0) {
    bullets.push({ tone: 'gap', text: `${graph.summary.unverified} of ${graph.summary.total} claims are still unverified.` });
  }

  const icon = {
    ok: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />,
    flag: <AlertTriangle className="h-3.5 w-3.5 text-rose-500 mt-0.5 shrink-0" />,
    gap: <HelpCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />,
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-indigo-500" /> Key Evidence &amp; Flags
      </h2>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the evidence graph…
        </div>
      ) : error ? (
        <p className="text-sm text-rose-600 py-2">Evidence graph unavailable — {apiErrMessage(error, 'could not load claims for this application.')}</p>
      ) : bullets.length === 0 ? (
        <p className="text-sm text-slate-400">— No structured evidence recorded for this application yet.</p>
      ) : (
        <ul className="space-y-2">
          {bullets.slice(0, 12).map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-[12px] text-slate-700 leading-snug">
              {icon[b.tone]}
              <span>{b.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Evidence Graph card (also the Evidence tab body) ─────────────────────────
function EvidenceGraphCard({
  graph,
  loading,
  error,
  claims,
  compact,
}: {
  graph: EvidenceGraph | undefined;
  loading: boolean;
  error: unknown;
  claims: EvidenceGraphClaim[];
  compact: boolean;
}) {
  const shown = compact ? claims.slice(0, 5) : claims;
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Link2 className="h-4 w-4 text-indigo-500" /> Evidence Graph
        </h2>
        {graph && (
          <div className="flex items-center gap-3 text-[11px] font-semibold">
            <span className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5">{graph.summary.verified} verified</span>
            <span className="rounded-full bg-rose-50 border border-rose-200 text-rose-700 px-2 py-0.5">{graph.summary.contradicted} contradicted</span>
            <span className="rounded-full bg-slate-100 border border-slate-200 text-slate-500 px-2 py-0.5">{graph.summary.unverified} unverified</span>
          </div>
        )}
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading claims…
        </div>
      ) : error ? (
        <p className="text-sm text-rose-600 py-2">Evidence graph unavailable — {apiErrMessage(error, 'could not load claims for this application.')}</p>
      ) : !graph || claims.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">— No structured claims extracted yet for this application.</p>
      ) : (
        <div className="space-y-4">
          {!compact && <GraphCanvas graph={graph} />}
          <div className="space-y-2">
            {shown.map((c) => (
              <ClaimRow key={c.id} claim={c} />
            ))}
          </div>
          {compact && claims.length > 5 && (
            <p className="w-full text-center text-[11px] font-semibold text-indigo-600 py-1">
              +{claims.length - 5} more claims — open the Evidence tab for the full graph
            </p>
          )}
        </div>
      )}
    </>
  );
}

// ── Founder Evidence Graph drawing ───────────────────────────────────────────
// A layered layout over the server traversal: the application (and any
// interview session) sits on the left and asserts claims (middle), and each
// claim points at the evidence row that supports or contradicts it (right).
// Only stored relations become edges, so an unverified claim draws with no
// outgoing link rather than a guessed one.
const GRAPH_LINK_COLOR: Record<string, string> = {
  asserted: '#cbd5e1',
  supports: '#10b981',
  contradicts: '#f43f5e',
  // A claim heard out loud links back to the session holding that turn.
  heard_in: '#8b5cf6',
};

const GRAPH_NODE_TONE: Record<string, { border: string; fill: string; text: string }> = {
  verified: { border: '#10b981', fill: '#ecfdf5', text: '#047857' },
  partially_verified: { border: '#0ea5e9', fill: '#f0f9ff', text: '#0369a1' },
  contradicted: { border: '#f43f5e', fill: '#fff1f2', text: '#be123c' },
  pending: { border: '#f59e0b', fill: '#fffbeb', text: '#b45309' },
  _: { border: '#cbd5e1', fill: '#f8fafc', text: '#475569' },
};

// The two left-hand kinds are "who said it", not a verification outcome, so
// they carry their own palette instead of the status tones.
const GRAPH_SOURCE_TONE: Record<string, { border: string; fill: string; text: string }> = {
  application: { border: '#6366f1', fill: '#eef2ff', text: '#3730a3' },
  interview: { border: '#8b5cf6', fill: '#f5f3ff', text: '#5b21b6' },
};

function GraphCanvas({ graph }: { graph: EvidenceGraph }) {
  const nodes = graph.graph?.nodes ?? [];
  const links = graph.graph?.links ?? [];
  const appNode = nodes.find((n) => n.kind === 'application');
  const claimNodes = nodes.filter((n) => n.kind === 'claim');
  const evidenceNodes = nodes.filter((n) => n.kind === 'evidence');
  const interviewNodes = nodes.filter((n) => n.kind === 'interview');
  if (!appNode || claimNodes.length === 0) return null;

  const ROW = 46;
  const H = 34;
  const PAD = 8;
  const COL_X = { application: 8, claim: 216, evidence: 470 } as const;
  const COL_W = { application: 190, claim: 238, evidence: 200 } as const;

  // A session node shares the left column with the application — both answer
  // "where did this come from", and the interview rows are drawn under it.
  const yOf = new Map<string, number>();
  const colOf = new Map<string, 'application' | 'claim' | 'evidence'>();
  const kindOf = new Map<string, string>();
  nodes.forEach((n) => {
    kindOf.set(n.id, n.kind);
    colOf.set(n.id, n.kind === 'claim' || n.kind === 'evidence' ? n.kind : 'application');
  });
  claimNodes.forEach((c, i) => yOf.set(c.id, PAD + i * ROW));
  let lastEvidenceY = PAD - ROW;
  evidenceNodes.forEach((e) => {
    const parentClaim = links.find((l) => l.target === e.id && l.kind !== 'asserted' && l.kind !== 'heard_in');
    const wanted = parentClaim ? yOf.get(parentClaim.source) ?? 0 : 0;
    const y = Math.max(wanted, lastEvidenceY + ROW);
    yOf.set(e.id, y);
    lastEvidenceY = y;
  });
  const appY = PAD + ((claimNodes.length - 1) * ROW) / 2;
  yOf.set(appNode.id, appY);
  interviewNodes.forEach((n, i) => yOf.set(n.id, PAD + claimNodes.length * ROW + 10 + i * ROW));

  const height = Math.max(...Array.from(yOf.values()), appY) + H + PAD;
  const width = COL_X.evidence + COL_W.evidence + PAD;
  const tone = (status: string) => GRAPH_NODE_TONE[status] ?? GRAPH_NODE_TONE._;
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const at = (id: string) => colOf.get(id) ?? 'claim';

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/60 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="max-w-full" role="img" aria-label="Founder evidence graph">
          {links.map((l, i) => {
            const sy = yOf.get(l.source);
            const ty = yOf.get(l.target);
            if (sy == null || ty == null) return null;
            const x1 = COL_X[at(l.source)] + COL_W[at(l.source)];
            const x2 = COL_X[at(l.target)];
            const mid = (x2 - x1) / 2;
            return (
              <path
                key={`${l.source}-${l.target}-${i}`}
                d={`M ${x1} ${sy + H / 2} C ${x1 + mid} ${sy + H / 2}, ${x2 - mid} ${ty + H / 2}, ${x2} ${ty + H / 2}`}
                fill="none"
                stroke={GRAPH_LINK_COLOR[l.kind] ?? '#cbd5e1'}
                strokeWidth={l.kind === 'contradicts' ? 1.8 : 1.2}
                strokeDasharray={l.kind === 'contradicts' ? '4 3' : undefined}
              />
            );
          })}
          {nodes.map((n) => {
            const y = yOf.get(n.id);
            if (y == null) return null;
            const col = at(n.id);
            const sourceTone = GRAPH_SOURCE_TONE[n.kind];
            const statusTone = tone(n.status);
            const paint = sourceTone ?? statusTone;
            return (
              <g key={n.id}>
                <title>{n.label}</title>
                <rect
                  x={COL_X[col]}
                  y={y}
                  width={COL_W[col]}
                  height={H}
                  rx={8}
                  fill={paint.fill}
                  stroke={paint.border}
                  strokeWidth={1.2}
                />
                <text
                  x={COL_X[col] + 10}
                  y={y + (n.category ? 14 : 21)}
                  fontSize={11}
                  fontWeight={700}
                  fill={paint.text}
                >
                  {clip(n.label, col === 'claim' ? 34 : 28)}
                </text>
                {n.category && (
                  <text x={COL_X[col] + 10} y={y + 26} fontSize={9} fill="#94a3b8">
                    {clip(`${n.category}${n.materiality ? ` · ${n.materiality}` : ''} · ${n.status.replace(/_/g, ' ')}`, 34)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-semibold text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 bg-slate-300" /> asserted by founder
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 bg-emerald-500" /> evidence supports
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 bg-rose-500" /> evidence contradicts
        </span>
        {interviewNodes.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5 bg-violet-500" /> heard in an interview
          </span>
        )}
        {graph.graph?.truncated && (
          <span className="text-amber-600">
            Showing the {graph.graph.node_limit} most material claims — the ledger below lists all {graph.summary.total}.
          </span>
        )}
      </div>
    </div>
  );
}

function ClaimRow({ claim }: { claim: EvidenceGraphClaim }) {
  const vs = (claim.verification_status || '').toLowerCase();
  const statusMeta =
    vs === 'verified'
      ? { icon: CheckCircle2, cls: 'text-emerald-700 bg-emerald-50 border-emerald-200', label: 'Verified' }
      : vs === 'contradicted'
      ? { icon: ShieldAlert, cls: 'text-rose-700 bg-rose-50 border-rose-200', label: 'Contradicted' }
      : vs === 'partially_verified'
      ? { icon: CheckCircle2, cls: 'text-sky-700 bg-sky-50 border-sky-200', label: 'Partially verified' }
      : vs === 'pending'
      ? { icon: Clock, cls: 'text-indigo-600 bg-indigo-50 border-indigo-200', label: 'Pending' }
      : { icon: CircleDashed, cls: 'text-slate-500 bg-slate-100 border-slate-200', label: vs ? vs.replace(/_/g, ' ') : 'No status' };
  const StatusIcon = statusMeta.icon;

  // Sources: the claim's own source + any evidence document sources.
  const evidenceSources = (claim.evidence ?? [])
    .map((e: any) => (typeof e?.source === 'string' ? e.source : null))
    .filter(Boolean) as string[];
  const sources = Array.from(new Set([claim.source, ...evidenceSources].filter((s) => s && String(s).trim())));

  // Contradiction pairing: founder statement/asserted value vs the verified value the engine holds.
  const contradicted = vs === 'contradicted';
  const verifiedValue = formatClaimValue(claim.value as unknown);

  return (
    <div className={cn('rounded-lg border bg-slate-50/50 p-3', contradicted ? 'border-rose-200' : 'border-slate-100')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-slate-800 leading-snug">{claim.statement}</div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
              {claim.category}
            </span>
            <span className="text-[10px] text-slate-400">materiality {claim.materiality}</span>
            {claim.interview && (
              <span
                className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700"
                title={`Recorded from the transcript of ${claim.interview.interview_type_label.toLowerCase()} round ${claim.interview.round_number}${
                  claim.interview.recorded_by ? `, written down by ${claim.interview.recorded_by}` : ''
                }${claim.interview.said_at ? ` · ${claim.interview.said_at}` : ''}`}
              >
                heard in interview
                {claim.interview.turn != null ? ` · turn ${claim.interview.turn}` : ''}
                {claim.interview.speaker ? ` · said by ${claim.interview.speaker.replace(/_/g, ' ')}` : ''}
              </span>
            )}
            {sources.length > 0 && (
              <span className="text-[10px] text-slate-400">
                · source{sources.length > 1 ? 's' : ''}: {sources.join(', ')}
              </span>
            )}
            {vs === 'verified' && claim.verified_at && (
              <span className="text-[10px] text-slate-400">· verified {relativeTime(claim.verified_at)}</span>
            )}
          </div>
        </div>
        <span className={cn('shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap', statusMeta.cls)}>
          <StatusIcon className="h-3 w-3" /> {statusMeta.label}
        </span>
      </div>

      {contradicted && (
        <div className="mt-2.5 rounded-lg border border-rose-100 bg-white p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-rose-500 mb-2">Contradiction pair</div>
          <div className="flex items-stretch gap-2">
            <div className="flex-1 rounded-md border border-slate-200 bg-slate-50 p-2 min-w-0">
              <div className="text-[10px] font-semibold text-slate-400">Application says</div>
              <div className="text-[12px] font-bold text-slate-800 leading-snug mt-0.5 break-words">
                {claim.founder_asserted ? claim.statement : `${claim.statement} (via ${claim.source || 'claim'})`}
              </div>
            </div>
            <div className="flex items-center">
              <ArrowRight className="h-4 w-4 text-rose-400" />
            </div>
            <div className="flex-1 rounded-md border border-rose-200 bg-rose-50/60 p-2 min-w-0">
              <div className="text-[10px] font-semibold text-rose-400">Records show</div>
              <div className="text-[12px] font-bold text-rose-800 leading-snug mt-0.5 break-words">
                {verifiedValue ?? '—'}
              </div>
            </div>
          </div>
          {claim.discrepancy_notes ? (
            <div className="text-[11px] text-rose-600 mt-2 leading-snug">{claim.discrepancy_notes}</div>
          ) : (
            <div className="text-[11px] text-slate-400 mt-2">— No discrepancy detail recorded.</div>
          )}
        </div>
      )}

      {!contradicted && claim.discrepancy_notes && (
        <div className="text-[11px] text-rose-600 mt-1.5">{claim.discrepancy_notes}</div>
      )}
    </div>
  );
}

// ── ML suggestion (advisory only — the reviewer decides) ─────────────────────
function RecommendationCard({
  assessment,
  assessmentError,
  tier,
  listApp,
  graph,
  graphError,
}: {
  assessment: ApplicationAssessment | undefined;
  assessmentError: unknown;
  tier: string;
  listApp: ApplicationItem | undefined;
  graph: EvidenceGraph | undefined;
  graphError: unknown;
}) {
  const recMap: Record<string, string> = {
    INTERVIEW: 'ML suggestion: proceed to interview',
    REJECT: 'ML suggestion: evidence points low — verify before any rejection',
    WAITLIST: 'ML suggestion: hold on the waitlist',
    REQUEST_EVIDENCE: 'ML suggestion: request evidence before advancing',
  };
  const headline =
    assessment?.overall_recommendation != null
      ? recMap[assessment.overall_recommendation] ?? `ML suggestion: ${String(assessment.overall_recommendation).toLowerCase()}`
      : tier === 'A'
      ? 'Flagged high priority — prioritize for human review'
      : 'No ML suggestion on record — this is a human review call.';

  const coverageTotal = graph?.summary.total ?? 0;
  const coveragePct = graph && coverageTotal > 0 ? Math.round((graph.summary.verified / coverageTotal) * 100) : null;
  const coverageLv = evidenceBits(coveragePct);
  const fitScore = readScore(assessment?.overall_program_fit ?? listApp?.program_fit_score ?? null);
  const fitLv = evidenceBits(fitScore);
  const recConf = confidencePct(assessment?.recommendation_confidence);

  return (
    <section className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-500 mb-1">ML Recommendation (advisory)</div>
      <div className="text-base font-black text-slate-900 leading-snug">{headline}</div>
      {recConf !== null && (
        <div className="text-[11px] text-slate-400 mt-1">Suggestion confidence: {recConf}%</div>
      )}
      {assessment?.recommendation_reasoning ? (
        <p className="text-[12px] text-slate-500 mt-2 leading-snug">{assessment.recommendation_reasoning}</p>
      ) : assessmentError ? (
        <p className="text-[12px] text-rose-600 mt-2">ML assessment unavailable — {apiErrMessage(assessmentError, 'could not load the assessment.')}</p>
      ) : null}
      <p className="text-[11px] font-semibold text-slate-400 mt-3 border-t border-slate-100 pt-2">
        A model suggestion only. ML surfaces evidence — the reviewer decides.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="font-semibold text-slate-600">Evidence coverage</span>
            <span className={cn('rounded-full border px-1.5 py-0.5 font-semibold', coverageLv.chip)}>
              {coveragePct === null ? 'No data' : coverageLv.label}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div className={cn('h-full', coverageLv.bar)} style={{ width: `${coveragePct === null ? 0 : coveragePct}%` }} />
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {graphError
              ? `Evidence graph unavailable — ${apiErrMessage(graphError, 'could not load claims.')}`
              : graph
              ? `${graph.summary.verified} of ${graph.summary.total} claims verified`
              : '— No evidence graph yet'}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="font-semibold text-slate-600">Selection Framework fit</span>
            <span className={cn('rounded-full border px-1.5 py-0.5 font-semibold', fitLv.chip)}>
              {fitScore === null ? 'No data' : fitLv.label}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div className={cn('h-full', fitLv.bar)} style={{ width: `${fitScore === null ? 0 : fitLv.pct}%` }} />
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {fitScore !== null ? `${fitScore.toFixed(0)}% alignment with this program's Selection Framework` : '— Not assessed yet'}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Decision rail — rendered from the backend's allowed-transitions only ─────
// The workflow engine is the authority on what move is legal; the UI never
// offers a transition the server would reject.
function DecisionRail({
  status,
  transitions,
  transitionsLoading,
  transitionsError,
  terminal,
  pending,
  onTransition,
  onHold,
  onRequestEvidence,
  onReject,
}: {
  status: string;
  transitions: Array<{ status: string; label: string }>;
  transitionsLoading: boolean;
  transitionsError: unknown;
  terminal: boolean;
  pending: boolean;
  onTransition: (toStage: string) => void;
  onHold: () => void;
  onRequestEvidence: () => void;
  onReject: () => void;
}) {
  // DEFERRED / REJECTED get dedicated buttons (reason modals); EVIDENCE_REQUESTED
  // is covered by the Request Evidence action below.
  const forward = transitions.filter((t) => !['DEFERRED', 'REJECTED', 'EVIDENCE_REQUESTED'].includes(t.status));
  const canHold = transitions.some((t) => t.status === 'DEFERRED');
  const canReject = transitions.some((t) => t.status === 'REJECTED');

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900 mb-1">Decision</h2>
      <p className="text-[11px] text-slate-400 mb-4">
        Human-triggered. These are only the moves the program&rsquo;s workflow engine currently allows.
      </p>
      {transitionsLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking allowed transitions…
        </div>
      ) : transitionsError ? (
        <p className="text-[12px] text-rose-600 mb-2">
          Workflow options unavailable — {apiErrMessage(transitionsError, 'could not load allowed transitions.')}
        </p>
      ) : terminal ? null : (
        <div className="space-y-2">
          {forward.length === 0 && (
            <p className="text-[12px] text-slate-400">— The workflow allows no further stage moves from “{statusLabel(status)}”.</p>
          )}
          {forward.map((t, i) => (
            <button
              key={t.status}
              type="button"
              onClick={() => onTransition(t.status)}
              disabled={pending}
              className={cn(
                'w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed',
                i === 0
                  ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
              Advance to {t.label || statusLabel(t.status)}
            </button>
          ))}
          {canHold && (
            <button
              type="button"
              onClick={onHold}
              disabled={pending}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-700 transition hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <PauseCircle className="h-4 w-4" /> Hold
            </button>
          )}
          {/* Request Evidence: hidden for decided (terminal) applications —
              you cannot ask for evidence on a closed record. */}
          {!terminal && (
            <button
              type="button"
              onClick={onRequestEvidence}
              disabled={pending}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" /> Request Evidence
            </button>
          )}
          {canReject && (
            <button
              type="button"
              onClick={onReject}
              disabled={pending}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <XCircle className="h-4 w-4" /> Reject
            </button>
          )}
        </div>
      )}
      {terminal && (
        <p className="text-[11px] text-slate-400 mt-1">
          This application is {statusLabel(status).toLowerCase()} — decisions are closed, and no stage moves or
          evidence requests are offered on a decided record.
        </p>
      )}
    </section>
  );
}

// ── Reviewer notes — append-only rows so two reviewers never overwrite ───────
function NotesCard({
  notes,
  loading,
  error,
  pending,
  onAdd,
}: {
  notes: AppNote[];
  loading: boolean;
  error: unknown;
  pending: boolean;
  onAdd: (body: string) => void;
}) {
  const [draft, setDraft] = React.useState('');
  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    onAdd(body);
    setDraft('');
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
        <StickyNote className="h-4 w-4 text-indigo-500" /> Reviewer Notes
      </h2>
      <p className="text-[11px] text-slate-400 mb-3">
        Append-only — each reviewer adds their own entry; nobody can overwrite anyone else&rsquo;s.
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading notes…
        </div>
      ) : error ? (
        <p className="text-[12px] text-rose-600 py-1">Notes unavailable — {apiErrMessage(error, 'could not load the note trail.')}</p>
      ) : notes.length === 0 ? (
        <p className="text-[12px] text-slate-400 py-1">— No reviewer notes yet on this application.</p>
      ) : (
        <ul className="space-y-2 max-h-60 overflow-y-auto pr-1 mb-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
              <p className="text-[12px] text-slate-700 leading-snug whitespace-pre-wrap">{n.body}</p>
              <div className="text-[10px] text-slate-400 mt-1">
                {n.author || 'Reviewer'} · {formatDateTime(n.created_at)} · {relativeTime(n.created_at)}
              </div>
            </li>
          ))}
        </ul>
      )}
      <textarea
        rows={2}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add a note for the review team…"
        className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm outline-none focus:border-indigo-400 resize-none"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending || !draft.trim()}
        className="mt-2 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Add note
      </button>
    </section>
  );
}

// ── Confirm modal (no window.prompt anywhere) ────────────────────────────────
function ConfirmModal({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  tone,
  wide,
  pending,
  disabled,
  onConfirm,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmLabel: string;
  tone: 'indigo' | 'amber' | 'rose';
  wide?: boolean;
  pending?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  if (!open) return null;
  const toneCls = {
    indigo: 'bg-indigo-600 hover:bg-indigo-500 text-white',
    amber: 'bg-amber-500 hover:bg-amber-400 text-white',
    rose: 'bg-rose-600 hover:bg-rose-500 text-white',
  }[tone];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cn('relative w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-xl', wide ? 'max-w-lg' : 'max-w-md')}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            {description && <p className="text-xs text-slate-500 mt-1 leading-snug">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending || disabled}
            className={cn('inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold shadow-sm disabled:opacity-40 disabled:cursor-not-allowed', toneCls)}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Section tabs: Founder / Company / Product / Market / Traction
// ═════════════════════════════════════════════════════════════════════════════
function SectionTab({
  tab,
  assessment,
  assessmentError,
  detail,
  claims,
  responses,
}: {
  tab: 'founder' | 'company' | 'product' | 'market' | 'traction';
  assessment: ApplicationAssessment | undefined;
  assessmentError: unknown;
  detail: any;
  claims: EvidenceGraphClaim[];
  responses: any[];
}) {
  const map = SECTION_TAB_MAP[tab];
  const dims = ASSESSMENT_DIMENSIONS.filter((d) => map.dimensionKeys.includes(d.key));
  const tabResponses = responses.filter((r) => map.responseCategories.includes(String(r?.question_category ?? '')));
  const tabClaims = claims.filter((c) => map.claimCategories.includes(String(c?.category ?? '')));
  const label = TABS.find((t) => t.id === tab)?.label ?? tab;
  const profile = detail?.startup_profile ?? {};

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
      <div className="xl:col-span-2 space-y-6">
        {/* Dimension evidence rows */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 mb-4">{label} — evidence assessment</h2>
          {assessmentError ? (
            <p className="text-sm text-rose-600">ML assessment unavailable — {apiErrMessage(assessmentError, 'could not load the assessment.')}</p>
          ) : !assessment ? (
            <p className="text-sm text-slate-400">— No assessment generated yet for this application.</p>
          ) : (
            <div className="space-y-3">
              {dims.map(({ key, label: dimLabel }) => {
                const pct = dimPct(assessment[key]);
                const raw = readScore(assessment[key]);
                const conf = confidencePct((assessment as any)[`${String(key).replace('_score', '')}_confidence`]);
                const lv = evidenceBits(pct);
                return (
                  <div key={dimLabel} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-600">{dimLabel}</span>
                      <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', lv.chip)}>
                        {pct === null ? 'No data' : lv.label}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div className={cn('h-full', lv.bar)} style={{ width: `${pct === null ? 0 : lv.pct}%` }} />
                    </div>
                    <div className="mt-1 text-[10px] text-slate-400">
                      {raw !== null ? `ML score ${raw}/10 · ` : 'ML score — · '}
                      {conf !== null ? `Confidence in assessment: ${conf}%` : 'Confidence: —'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* Narrative fragments from assessment for this dimension */}
          {assessment && (
            <CaseList
              title={`Assessment notes touching ${label.toLowerCase()}`}
              icon={<MessageSquare className="h-4 w-4 text-indigo-400" />}
              items={[...(assessment.bull_case ?? []), ...(assessment.bear_case ?? [])].filter((b) => {
                const p = String(b.point ?? '').toLowerCase();
                return SECTION_KEYWORDS[tab].test(p);
              })}
              accent="slate"
            />
          )}
        </section>

        {/* Founder answers for this section */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-500" /> Founder answers
          </h2>
          {tabResponses.length === 0 ? (
            <p className="text-sm text-slate-400">— No application responses recorded for this section.</p>
          ) : (
            <div className="space-y-3">
              {tabResponses.map((r: any) => {
                const answer =
                  r.text_response ||
                  (r.numeric_response != null ? String(r.numeric_response) : '') ||
                  (r.boolean_response != null ? (r.boolean_response ? 'Yes' : 'No') : '') ||
                  r.url_response ||
                  (Array.isArray(r.selected_choices) && r.selected_choices.length ? r.selected_choices.join(', ') : '') ||
                  '—';
                return (
                  <div key={r.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                    <div className="text-[11px] font-bold text-slate-500">{r.question_text ?? 'Response'}</div>
                    <p className="text-[12px] text-slate-700 mt-1 leading-relaxed whitespace-pre-line">{answer}</p>
                    {r.evidence_status && r.evidence_status !== 'none' && (
                      <div className="text-[10px] text-slate-400 mt-1.5">Evidence: {String(r.evidence_status).replace(/_/g, ' ')}</div>
                    )}
                    {r.created_at && (
                      <div className="text-[10px] text-slate-400 mt-1">Answered {formatDateTime(r.created_at)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Supporting claims */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-indigo-500" /> Related claims
          </h2>
          {tabClaims.length === 0 ? (
            <p className="text-sm text-slate-400">— No extracted claims in this category yet.</p>
          ) : (
            <div className="space-y-2">
              {tabClaims.map((c) => (
                <ClaimRow key={c.id} claim={c} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Right: structured profile facts where the detail response carries them */}
      <div className="space-y-6">
        {tab === 'company' && (
          <FactCard
            title="Company facts"
            facts={[
              ['Website', profile.website || '—'],
              ['Business model', String(profile.business_model || '—').replace(/_/g, ' ')],
              ['Incorporated', profile.incorporated ? `Yes — ${profile.incorporation_country || ''}` : 'No'],
              ['Founded', profile.founded_date ? fmtDate(profile.founded_date) : '—'],
              ['Team size', profile.employee_count ?? '—'],
              ['Total raised', money(profile.total_funding_raised_usd)],
              ['Pitch deck', profile.pitch_deck_url || '—'],
              ['Financial model', profile.financial_model_url || '—'],
            ]}
          />
        )}
        {tab === 'traction' && (
          <FactCard
            title="Traction facts"
            facts={[
              ['Revenue status', String(profile.revenue_status || '—').replace(/_/g, ' ')],
              ['MRR', money(profile.mrr_usd)],
              ['ARR', money(profile.arr_usd)],
              ['Gross margin', profile.gross_margin_pct != null ? `${profile.gross_margin_pct}%` : '—'],
              ['Paying customers', profile.customer_count ?? '—'],
              ['MAU', profile.monthly_active_users ?? '—'],
              ['LOIs', profile.loi_count ?? '—'],
              ['Pilots', profile.pilot_count ?? '—'],
            ]}
          />
        )}
        {tab === 'product' && (
          <FactCard
            title="Product facts"
            facts={[
              ['Product stage', profile.product_stage ?? '—'],
              ['Live product?', profile.has_live_product ? 'Yes' : 'No'],
              ['Customer description', profile.customer_description || '—'],
            ]}
          />
        )}
        {tab === 'founder' && (
          <FactCard
            title="Founder signal"
            facts={[
              ['Founder evidence', assessment ? evidenceLevelShort(dimPct(assessment.founder_score)) : 'No data'],
              ['Team completeness', assessment ? evidenceLevelShort(dimPct(assessment.team_score)) : 'No data'],
              ['Note', 'The founder profile (experience, equity, co-founders) is not exposed on this endpoint — it is reviewed during diligence.'],
            ]}
          />
        )}
        {tab === 'market' && (
          <FactCard
            title="Market signal"
            facts={[
              ['Market evidence', assessment ? evidenceLevelShort(dimPct(assessment.market_score)) : 'No data'],
              ['Sector', profile.industry || '—'],
              ['Geography', profile.geography || '—'],
              ['Note', 'TAM/SAM detail lives in the founder answers and pitch deck — no separate market dataset on this endpoint.'],
            ]}
          />
        )}
      </div>
    </div>
  );
}

function FactCard({ title, facts }: { title: string; facts: [string, React.ReactNode][] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900 mb-3">{title}</h2>
      <dl className="space-y-2">
        {facts.map(([k, v], i) => (
          <div key={k} className="flex items-start justify-between gap-3 text-[12px]">
            <dt className="text-slate-400 shrink-0">{k}</dt>
            <dd className="text-slate-800 font-medium text-right break-all min-w-0">{v ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Timeline tab — only timestamps the API actually returns
// ═════════════════════════════════════════════════════════════════════════════
type TimelineEvent = { at: string; title: string; detail?: string; icon: React.ElementType };

function TimelineTab({
  detail,
  assessment,
  reviews,
  evidenceRequests,
  evidenceRequestsError,
  claims,
}: {
  detail: any;
  assessment: ApplicationAssessment | undefined;
  reviews: any[];
  evidenceRequests: any[];
  evidenceRequestsError: unknown;
  claims: EvidenceGraphClaim[];
}) {
  const events = React.useMemo<TimelineEvent[]>(() => {
    const ev: TimelineEvent[] = [];
    const push = (at: unknown, title: string, icon: React.ElementType, d?: string) => {
      if (typeof at === 'string' && at && !Number.isNaN(new Date(at).getTime())) ev.push({ at, title, detail: d, icon });
    };
    push(detail?.created_at, 'Application record created', FileText);
    push(detail?.submitted_at, 'Application submitted', Send);
    push(detail?.shortlisted_at, 'Shortlisted', CheckCircle2);
    push(detail?.decision_at, 'Decision recorded', ShieldCheck);
    // NOTE: the application's `updated_at` is NOT a status-change timestamp, so
    // it is deliberately not surfaced as one. Only real event timestamps appear.
    reviews.forEach((r) =>
      push(
        r?.submitted_at ?? r?.created_at,
        `Review submitted${r?.reviewer_name ? ` by ${r.reviewer_name}` : ''}`,
        Users,
        [
          r?.recommendation && `Recommended ${r.recommendation}`,
          readScore(r?.overall_conviction) !== null && `Conviction ${r.overall_conviction}/10`,
          r?.notes,
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
      ),
    );
    evidenceRequests.forEach((er) => {
      push(er?.created_at, 'Evidence requested from founder', HelpCircle,
        Array.isArray(er?.requested_items) && er.requested_items.length
          ? er.requested_items.map((i: any) => i?.description ?? i?.type).filter(Boolean).join('; ')
          : undefined);
      push(er?.resolved_at, 'Evidence request resolved', CheckCircle2);
    });
    claims.forEach((c) => {
      // Claims carry no updated_at — only verified_at exists where the engine
      // recorded a verification (or contradiction) at a point in time.
      if (c.verification_status === 'verified') push(c.verified_at, 'Claim verified', ShieldCheck, c.statement);
      else if (c.verification_status === 'contradicted') push(c.verified_at, 'Contradiction detected', ShieldAlert, c.statement);
    });
    const generatedAt = (assessment as any)?.generated_at;
    if (generatedAt) push(generatedAt, 'ML assessment generated', Sparkles);
    return ev.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [detail, assessment, reviews, evidenceRequests, claims]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Clock className="h-4 w-4 text-indigo-500" /> Timeline
        </h2>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
          Derived from record timestamps
        </span>
      </div>
      <p className="text-[11px] text-slate-400 mb-4">
        Built from the real dates stored on the application, its reviews, evidence requests and verified claims — events
        not captured by the backend (calls, deck views, status-change history) do not appear.
      </p>
      {evidenceRequestsError ? (
        <p className="text-[12px] text-rose-600 mb-3">
          Evidence-request history unavailable — {apiErrMessage(evidenceRequestsError, 'could not load evidence requests.')}
        </p>
      ) : null}
      {events.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">— No dated events found for this application yet.</p>
      ) : (
        <ol className="relative space-y-4 pl-1">
          {events.map((e, i) => {
            const Icon = e.icon;
            return (
              <li key={i} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 shrink-0">
                    <Icon className="h-3.5 w-3.5 text-slate-500" />
                  </span>
                  {i < events.length - 1 && <span className="w-px flex-1 bg-slate-200 mt-1" />}
                </div>
                <div className="pb-1 min-w-0">
                  <div className="text-[12px] font-bold text-slate-800">{e.title}</div>
                  {e.detail && <div className="text-[11px] text-slate-500 mt-0.5 leading-snug break-words">{e.detail}</div>}
                  <div className="text-[10px] text-slate-400 mt-0.5">{formatDateTime(e.at)}</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

// ── Shared helpers kept from the previous version ────────────────────────────
function CaseList({
  title,
  icon,
  items,
  accent,
}: {
  title: string;
  icon: React.ReactNode;
  items?: Array<{ point: string; strength: string }>;
  accent: 'emerald' | 'rose' | 'amber' | 'slate';
}) {
  const list = items ?? [];
  const ring = { emerald: 'border-emerald-100', rose: 'border-rose-100', amber: 'border-amber-100', slate: 'border-slate-100' }[accent];
  return (
    <section className={cn('mt-4 rounded-2xl border bg-white p-4 shadow-sm', ring)}>
      <h3 className="text-xs font-bold text-slate-700 flex items-center gap-2 mb-2">{icon} {title}</h3>
      {list.length === 0 ? (
        <p className="text-[11px] text-slate-400">— None recorded.</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((it, i) => (
            <li key={i} className="text-[12px] text-slate-600 leading-snug">
              {it.point}
              {it.strength && <span className="text-slate-400"> · {it.strength}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
