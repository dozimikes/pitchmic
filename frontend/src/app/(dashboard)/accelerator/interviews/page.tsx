'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CalendarClock,
  Check,
  ClipboardList,
  HelpCircle,
  Inbox,
  Loader2,
  MessagesSquare,
  PencilLine,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  StickyNote,
  ThumbsUp,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { useActiveProgram } from '../ProgramContext';
import { useAuth } from '@/hooks/useAuth';
import { TranscriptPanel } from '@/components/accelerator/InterviewTranscript';
import {
  acceleratorApi,
  type AppNote,
  type ApplicationAssessment,
  type ApplicationItem,
  type EvidenceGraph,
  type InterviewGuide,
  type InterviewProbe,
  type InterviewTranscriptTurn,
  type ReviewerScoreInput,
} from '@/lib/acceleratorApi';
import {
  evidenceLevel,
  isTerminal,
  apiErrMessage,
  formatDateTime,
  qk,
} from '@/lib/screening';

/** Interview population = founders we've invited / already spoke to, pre-committee. */
const INTERVIEW_STATUSES = ['INTERVIEW_INVITED', 'INTERVIEW_COMPLETE'];

// qk (screening.ts) has no entries for interview sessions or the user context —
// one shared local key each, so a page never keeps five copies of one fetch.
const qkInterviewSessions = (pid?: number | null) => ['accelerator-interview-sessions', pid] as const;
const qkUserContext = ['accelerator-user-context'] as const;

// ─── Backend row shapes (Program-OS generic resources) ────────────────────────
// /accelerator/interviews/ is InterviewSessionSerializer (fields = "__all__").
// We read the real persisted fields only: application, scheduled_at, status,
// interviewer_name, round_number, interview_type, completed_at.
interface InterviewSessionRow {
  id: number;
  application: number;
  interview_type?: string;
  round_number?: number;
  status?: string;
  scheduled_at: string | null;
  completed_at?: string | null;
  interviewer?: number | null;
  interviewer_name?: string;
  // Append-only record of what was said. Each turn is numbered, stamped and
  // attributed by the server, so the browser only ever reads it back.
  transcript?: InterviewTranscriptTurn[];
  transcript_turn_count?: number;
  claims_recorded_from_it?: number;
}

// /accelerator/reviews/ is ReviewerAssessmentSerializer (fields = "__all__").
// All scores are 1–10 — human scorecards, never /5, never auto-created.
interface ReviewRow {
  id: number;
  application: number;
  reviewer: number;
  reviewer_name?: string;
  reviewer_email?: string;
  founder_score?: number | null;
  market_score?: number | null;
  product_score?: number | null;
  team_score?: number | null;
  traction_score?: number | null;
  overall_conviction?: number | null;
  recommendation?: string;
  notes?: string;
  created_at?: string;
  submitted_at?: string;
}

// ─── Evidence ladder (from @/lib/screening — single source of truth) ─────────
// MISSING IS NOT ZERO: a null score renders "No data", never 0, never a
// statement about the applicant derived from absent data.

const TONE_CLS: Record<'strong' | 'moderate' | 'limited' | 'gap', { chip: string; bar: string }> = {
  strong: { chip: 'text-emerald-700 bg-emerald-50 border-emerald-200', bar: 'bg-emerald-500' },
  moderate: { chip: 'text-sky-700 bg-sky-50 border-sky-200', bar: 'bg-sky-500' },
  limited: { chip: 'text-amber-700 bg-amber-50 border-amber-200', bar: 'bg-amber-500' },
  gap: { chip: 'text-rose-700 bg-rose-50 border-rose-200', bar: 'bg-rose-500' },
};

function readScore(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Per-dimension assessment scores are 1–10; aggregates are 0–100.
function dimPct(v: unknown): number | null {
  const n = readScore(v);
  if (n === null) return null;
  return Math.round(n <= 10 ? n * 10 : n);
}

function priorityChip(tier: string | null | undefined): { label: string; cls: string } {
  switch (tier) {
    case 'A':
      return { label: 'High priority', cls: 'bg-indigo-600 text-white' };
    case 'B':
      return { label: 'Priority', cls: 'bg-indigo-100 text-indigo-700 border border-indigo-200' };
    case 'C':
      return { label: 'Selective probe', cls: 'bg-amber-100 text-amber-700 border border-amber-200' };
    default:
      return { label: 'Low priority', cls: 'bg-slate-100 text-slate-600 border border-slate-200' };
  }
}

/**
 * Status chip honesty: "Interview Scheduled" only when a real InterviewSession
 * exists with a date and an open status. Otherwise reflect the application stage.
 */
function interviewStatusChip(appStatus: string, session: InterviewSessionRow | null): { label: string; cls: string } {
  if (appStatus === 'INTERVIEW_COMPLETE')
    return { label: 'Interview complete', cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200' };
  if (session?.scheduled_at && (session.status || 'scheduled') === 'scheduled')
    return { label: 'Interview Scheduled', cls: 'bg-indigo-100 text-indigo-700 border border-indigo-200' };
  if (session?.scheduled_at)
    return { label: 'Interview scheduled · held', cls: 'bg-slate-100 text-slate-600 border border-slate-200' };
  return { label: 'Interview Pending', cls: 'bg-amber-100 text-amber-700 border border-amber-200' };
}

function humanise(value: string): string {
  return (value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

/** "Aug 28, 2027 · 10:00 AM" from an ISO timestamp, in the reviewer's locale. */
function formatSchedule(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

/** ISO → value for <input type="datetime-local"> in local time. */
function toDatetimeLocal(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── localStorage helpers (reviewer-progress only; never faked to the server) ─
const LS_PREFIX = 'pitchmic.interviews';

function lsRead<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(`${LS_PREFIX}.${key}`);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function lsWrite(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${LS_PREFIX}.${key}`, JSON.stringify(value));
  } catch {
    /* storage full / private mode — progress is best-effort */
  }
}

interface Probe {
  key: string;
  question: string;
  tag: string;
  tagCls: string;
  detail?: string;
}

// The server sends severity, never styling — this is the only place a probe
// becomes a colour.
const SEVERITY_TONE: Record<string, string> = {
  high: 'text-rose-700 bg-rose-50 border-rose-200',
  medium: 'text-amber-700 bg-amber-50 border-amber-200',
  info: 'text-slate-600 bg-slate-50 border-slate-200',
};

function toProbe(p: InterviewProbe): Probe {
  return {
    key: p.key,
    question: p.question,
    tag: p.tag,
    tagCls: SEVERITY_TONE[p.severity] ?? SEVERITY_TONE.info,
    detail: p.detail ?? undefined,
  };
}

interface Strength {
  key: string;
  point: string;
  detail?: string;
}

type TabKey = 'brief' | 'questions' | 'transcript' | 'notes' | 'assessment' | 'decision';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'brief', label: 'Interview Brief' },
  { key: 'questions', label: 'Questions' },
  // What was asked, then what was actually said. The transcript sits between
  // them because it is the record the notes and the scorecard are supposed to
  // be evidence for.
  { key: 'transcript', label: 'Transcript' },
  { key: 'notes', label: 'Notes' },
  { key: 'assessment', label: 'Assessment' },
  { key: 'decision', label: 'Decision' },
];

export default function InterviewsPage() {
  // The route is statically rendered, so anything reading useSearchParams
  // has to sit behind a Suspense boundary.
  return (
    <React.Suspense fallback={null}>
      <InterviewsWorkspace />
    </React.Suspense>
  );
}

function InterviewsWorkspace() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { activeProgram, activeProgramId } = useActiveProgram();
  const pid = activeProgramId ?? null;

  const {
    data: rawApplications = [],
    isLoading,
    error: applicationsError,
  } = useQuery({
    queryKey: qk.applications(pid),
    queryFn: () => acceleratorApi.getApplications(pid ?? undefined),
    enabled: pid != null,
  });

  const applications: ApplicationItem[] = Array.isArray(rawApplications)
    ? rawApplications
    : ((rawApplications as any)?.results ?? []);

  const candidates = React.useMemo<ApplicationItem[]>(() => {
    return applications
      .filter((a) => INTERVIEW_STATUSES.includes(a.status))
      .sort((a, b) => {
        // Un-invited first: they are the live work. Then rank by where the
        // evidence is thinnest, so attention lands on the weakest claims.
        const stageDelta =
          (a.status === 'INTERVIEW_INVITED' ? 0 : 1) - (b.status === 'INTERVIEW_INVITED' ? 0 : 1);
        if (stageDelta !== 0) return stageDelta;
        const risk = (app: ApplicationItem) =>
          (app.stage_conflict_detected ? 100 : 0) + app.unverified_claims * 10;
        return risk(b) - risk(a);
      });
  }, [applications]);

  // Deep link support: /accelerator/interviews?app=<id> preselects a candidate.
  const requestedId = React.useMemo<number | null>(() => {
    const raw = searchParams.get('app');
    const parsed = raw == null ? NaN : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);

  const [selectedId, setSelectedId] = React.useState<number | null>(requestedId);
  React.useEffect(() => {
    if (requestedId != null) setSelectedId(requestedId);
  }, [requestedId]);
  React.useEffect(() => {
    if (candidates.length === 0) return;
    setSelectedId((current) =>
      current != null && candidates.some((c) => c.id === current) ? current : candidates[0].id
    );
  }, [candidates]);

  const selected = candidates.find((c) => c.id === selectedId) ?? null;
  const selectedAppId = selected?.id ?? null;

  const [filter, setFilter] = React.useState('');
  // Tab selection is remembered per application inside this visit.
  const [tabsByApp, setTabsByApp] = React.useState<Record<number, TabKey>>({});
  const activeTab: TabKey = (selectedAppId != null && tabsByApp[selectedAppId]) || 'brief';
  const setTab = (t: TabKey) => {
    if (selectedAppId != null) setTabsByApp((prev) => ({ ...prev, [selectedAppId]: t }));
  };
  const [scheduleModalOpen, setScheduleModalOpen] = React.useState(false);
  const [rejectModalOpen, setRejectModalOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState('');

  // ── Program-level supporting data (real endpoints, client-side per-app filter)
  // InterviewSessionViewSet ignores program_id and returns every session the
  // reviewer can see; we filter by application id on the client.
  const {
    data: interviewRows = [],
    isLoading: sessionsLoading,
    error: sessionsError,
  } = useQuery<InterviewSessionRow[]>({
    queryKey: qkInterviewSessions(pid),
    queryFn: () => acceleratorApi.osList<InterviewSessionRow>('interviews', pid ?? undefined),
    enabled: pid != null,
  });
  const appInterviews = React.useMemo(
    () =>
      interviewRows
        .filter((r) => r.application === selectedAppId)
        .sort((a, b) => (b.scheduled_at || '').localeCompare(a.scheduled_at || '')),
    [interviewRows, selectedAppId]
  );
  // The live/upcoming session drives the schedule chip; newest scheduled first.
  const scheduledSession = React.useMemo<InterviewSessionRow | null>(() => {
    const upcoming = appInterviews.find(
      (r) => r.scheduled_at && (r.status || 'scheduled') === 'scheduled'
    );
    return upcoming ?? appInterviews[0] ?? null;
  }, [appInterviews]);

  // Reviews: only rows a human actually submitted. No pre-filled, no phantom 5s.
  const {
    data: reviewRows = [],
    isLoading: reviewsLoading,
    error: reviewsError,
  } = useQuery<ReviewRow[]>({
    queryKey: qk.reviews(pid),
    queryFn: () => acceleratorApi.osList<ReviewRow>('reviews', pid ?? undefined),
    enabled: pid != null,
  });
  const appReviews = React.useMemo(
    () => reviewRows.filter((r) => r.application === selectedAppId),
    [reviewRows, selectedAppId]
  );

  const { data: ctx } = useQuery({
    queryKey: qkUserContext,
    queryFn: () => acceleratorApi.getContext(),
  });

  const { user, isAccelerator, isAdmin } = useAuth();
  // Writing down what a founder said is a staff act — the endpoint is gated the
  // same way server-side, so this only decides whether the form is offered.
  const canWriteTranscript = isAccelerator || isAdmin || Boolean(user?.is_staff);
  const myReview = React.useMemo<ReviewRow | null>(() => {
    const email = (ctx?.email || '').toLowerCase();
    if (!email) return null;
    return appReviews.find((r) => (r.reviewer_email || '').toLowerCase() === email) ?? null;
  }, [appReviews, ctx]);

  const {
    data: assessment,
    isLoading: assessmentLoading,
    error: assessmentError,
  } = useQuery<ApplicationAssessment>({
    queryKey: qk.appAssessment(selectedAppId ?? -1),
    queryFn: () => acceleratorApi.getApplicationAssessment(selectedAppId as number),
    enabled: selectedAppId != null,
  });

  const {
    data: graph,
    isLoading: graphLoading,
    error: graphError,
  } = useQuery<EvidenceGraph>({
    queryKey: qk.evidenceGraph(selectedAppId ?? -1),
    queryFn: () => acceleratorApi.getEvidenceGraph(selectedAppId as number),
    enabled: selectedAppId != null,
  });

  // The workflow engine decides which stage moves are legal for this app.
  const {
    data: transitions,
    isLoading: transitionsLoading,
    error: transitionsError,
  } = useQuery({
    queryKey: qk.allowedTransitions(selectedAppId ?? -1),
    queryFn: () => acceleratorApi.getAllowedTransitions(selectedAppId as number),
    enabled: selectedAppId != null,
  });

  // Append-only reviewer notes (one row per author — no shared blob to clobber).
  const {
    data: notes = [],
    isLoading: notesLoading,
    error: notesError,
  } = useQuery<AppNote[]>({
    queryKey: qk.appNotes(selectedAppId ?? -1),
    queryFn: () => acceleratorApi.getApplicationNotes(selectedAppId as number),
    enabled: selectedAppId != null,
  });

  const invalidateSchedule = () => {
    queryClient.invalidateQueries({ queryKey: qkInterviewSessions(pid) });
    queryClient.invalidateQueries({ queryKey: qk.applications(pid) });
  };

  // A new turn changes the session row; a claim recorded from one changes the
  // evidence graph the transcript panel reads its "already recorded" state from.
  const invalidateTranscript = () => {
    invalidateSchedule();
    queryClient.invalidateQueries({ queryKey: qk.evidenceGraph(selectedAppId ?? -1) });
  };

  // ── Mutations: all hit real endpoints, none fabricate fields ────────────────
  const schedule = useMutation({
    mutationFn: async (scheduledAt: string) => {
      if (scheduledSession) {
        return acceleratorApi.osUpdate<InterviewSessionRow>('interviews', scheduledSession.id, {
          scheduled_at: scheduledAt,
          status: 'scheduled',
        });
      }
      return acceleratorApi.osCreate<InterviewSessionRow>('interviews', {
        application: selectedAppId,
        interview_type: 'human_video',
        round_number: (appInterviews[0]?.round_number ?? 0) + 1,
        status: 'scheduled',
        scheduled_at: scheduledAt,
      });
    },
    onSuccess: () => {
      invalidateSchedule();
      setScheduleModalOpen(false);
      toast({
        title: scheduledSession ? 'Interview rescheduled' : 'Interview scheduled',
        description: 'The session record is saved against this application.',
        variant: 'success',
      });
    },
    onError: (err: unknown) => {
      toast({
        title: 'Could not save the schedule',
        description: apiErrMessage(err, 'The backend rejected the interview session.'),
        variant: 'error',
      });
    },
  });

  const addNote = useMutation({
    mutationFn: async (body: string) => {
      if (selectedAppId == null) throw new Error('No application selected');
      return acceleratorApi.addApplicationNote(selectedAppId, body);
    },
    onSuccess: () => {
      if (selectedAppId != null) queryClient.invalidateQueries({ queryKey: qk.appNotes(selectedAppId) });
      toast({
        title: 'Note added',
        description: 'Appended to the note trail — every reviewer sees it on Application 360.',
        variant: 'success',
      });
    },
    onError: (err: unknown) => {
      toast({
        title: 'Note could not be saved',
        description: apiErrMessage(err, 'The backend rejected the note.'),
        variant: 'error',
      });
    },
  });

  type ReviewPayload =
    | { mode: 'create'; data: ReviewerScoreInput }
    | { mode: 'update'; id: number; data: Record<string, any> };

  const saveReview = useMutation({
    mutationFn: async (vars: ReviewPayload) => {
      if (vars.mode === 'update') return acceleratorApi.osUpdate('reviews', vars.id, vars.data);
      return acceleratorApi.submitReview(vars.data);
    },
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: qk.reviews(pid) });
      queryClient.invalidateQueries({ queryKey: qk.applications(pid) });
      if (selectedAppId != null) queryClient.invalidateQueries({ queryKey: qk.appDetail(selectedAppId) });
      toast({
        title: vars.mode === 'update' ? 'Your review was updated' : 'Your review was submitted',
        description: 'Recorded as a human reviewer scorecard (1–10) — separate from the ML screening output.',
        variant: 'success',
      });
    },
    onError: (err: unknown) => {
      toast({
        title: 'Review could not be saved',
        description: apiErrMessage(err, 'The backend rejected the review.'),
        variant: 'error',
      });
    },
  });

  const advance = useMutation({
    mutationFn: ({ appId, toStage, reason }: { appId: number; toStage: string; reason?: string }) =>
      acceleratorApi.advanceApplicationStage(appId, toStage, reason),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: qk.applications(pid) });
      queryClient.invalidateQueries({ queryKey: qk.appDetail(vars.appId) });
      queryClient.invalidateQueries({ queryKey: qk.allowedTransitions(vars.appId) });
      queryClient.invalidateQueries({ queryKey: qk.appAssessment(vars.appId) });
      queryClient.invalidateQueries({ queryKey: qk.interviewGuide(vars.appId) });
      const titles: Record<string, string> = {
        COMMITTEE_REVIEW: 'Sent to committee',
        INTERVIEW_COMPLETE: 'Interview marked complete',
        DEFERRED: 'Deferred to next cohort',
        REJECTED: 'Application rejected',
      };
      const descriptions: Record<string, string> = {
        COMMITTEE_REVIEW: 'Stage recorded. The committee still has to convene — this is not an acceptance.',
        INTERVIEW_COMPLETE: 'This application now shows as interviewed for the program.',
        DEFERRED: 'The startup moves to the next-cohort pile. Nothing is lost — only postponed.',
        REJECTED: 'The application is now in REJECTED. Reversing this requires a fresh stage transition.',
      };
      toast({
        title: titles[vars.toStage] ?? 'Stage updated',
        description: descriptions[vars.toStage] ?? 'The workflow stage was recorded.',
        variant: 'success',
      });
      if (vars.toStage === 'REJECTED') setRejectModalOpen(false);
    },
    onError: (err: unknown) => {
      toast({
        title: 'Stage could not be updated',
        // ApiError.message carries the workflow-gate 400 reason and the
        // decision-authority 403 reason ("…not permitted…") — surface it.
        description: apiErrMessage(err, 'The backend rejected the stage transition.'),
        variant: 'error',
      });
    },
  });

  const visible = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        c.company_name.toLowerCase().includes(q) ||
        (c.inferred_stage ?? '').toLowerCase().includes(q) ||
        (c.sector ?? '').toLowerCase().includes(q)
    );
  }, [candidates, filter]);

  // ── Queue walk ─────────────────────────────────────────────────────────────
  // "Next" cycles only the candidates the current filter actually shows, so a
  // reviewer never lands on a row they had just filtered out.
  const queueIndex = visible.findIndex((c) => c.id === selectedId);
  const nextCandidate =
    visible.length > 1 ? visible[((queueIndex < 0 ? 0 : queueIndex) + 1) % visible.length] : null;

  const latestNote = React.useMemo<AppNote | null>(() => {
    if (notes.length === 0) return null;
    return [...notes].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
  }, [notes]);

  // ── Brief content: strengths + areas to explore ─────────────────────────────
  const strengths = React.useMemo<Strength[]>(() => {
    const out: Strength[] = [];
    (assessment?.bull_case ?? []).slice(0, 4).forEach((b, i) => {
      out.push({ key: `bull-${i}`, point: b.point, detail: b.strength });
    });
    return out;
  }, [assessment]);

  // ── Interview probes: derived by the server from the stored assessment and
  //    open claims, so this workspace and the candidate dossier ask the same
  //    questions about the same evidence. The page maps severity → tone only.
  const {
    data: guide,
    isLoading: guideLoading,
    error: guideError,
  } = useQuery<InterviewGuide>({
    queryKey: qk.interviewGuide(selectedAppId ?? -1),
    queryFn: () => acceleratorApi.getInterviewGuide(selectedAppId as number),
    enabled: selectedAppId != null,
    staleTime: 60_000,
  });

  const areasToExplore = React.useMemo<Probe[]>(
    () => (guide?.areas_to_explore ?? []).map(toProbe),
    [guide]
  );
  const suggestedQuestions = React.useMemo<Probe[]>(
    () => (guide?.probes ?? []).map(toProbe),
    [guide]
  );


  const totalUnverifiedClaims = candidates.reduce((sum, c) => sum + (c.unverified_claims || 0), 0);
  const conflicted = candidates.filter((c) => c.stage_conflict_detected).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 lg:p-8 space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-indigo-600/10 text-indigo-700 border border-indigo-500/20">
            Interviews
          </span>
          <span className="text-xs text-slate-400">{activeProgram?.name ?? '—'}</span>
        </div>
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight flex items-center gap-2.5">
          <CalendarClock className="h-6 w-6 lg:h-7 lg:w-7 text-indigo-600" />
          Interview Workspace
        </h1>
        <p className="text-sm text-slate-500 mt-1 max-w-2xl">
          Before the call, Pitchmic turns the evidence gaps into concrete questions. The interview itself —
          and every decision after it — stays with the reviewer. ML surfaces evidence; the reviewer decides.
        </p>
      </div>

      {applicationsError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Applications could not be loaded — {apiErrMessage(applicationsError, 'the service is unavailable.')}
        </div>
      ) : null}

      {/* ── Interview population summary ───────────────────────────────────── */}
      {pid != null && !isLoading && candidates.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="In interview stage" value={candidates.length} hint="Invited or complete" />
          <StatCard
            label="Awaiting the call"
            value={candidates.filter((c) => c.status === 'INTERVIEW_INVITED').length}
            hint="Not yet interviewed"
          />
          <StatCard label="Claims to verify live" value={totalUnverifiedClaims} hint="Unverified in evidence" />
          <StatCard
            label="Stage conflicts"
            value={conflicted}
            hint="Declared vs inferred"
            tone={conflicted > 0 ? 'text-rose-600' : 'text-slate-900'}
          />
        </div>
      )}

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      {pid == null ? (
        <EmptyState
          icon={Search}
          title="Select a program first"
          body="Interview work is scoped to one program cycle. Pick the active program in the header to load its candidates."
        />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading interview candidates…
        </div>
      ) : candidates.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No interviews in this program yet"
          body="Applications appear here once they are invited to interview. Run ML Screening triage from the Command Center or progress a candidate from the review queue."
          action={
            <Link href="/accelerator/review-queue">
              <Button size="sm" variant="outline" className="border-slate-300 bg-white text-slate-600 hover:bg-slate-100">
                Open review queue <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(300px,360px)_1fr] gap-6 items-start">
          {/* ── Master: candidate list ────────────────────────────────────── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter candidates…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50/60 py-2 pl-8 pr-3 text-xs outline-none focus:border-indigo-300 focus:bg-white"
              />
            </div>

            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {visible.length} of {candidates.length} candidates
            </div>

            {visible.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">No candidate matches that filter.</p>
            ) : (
              <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                {visible.map((app) => {
                  const hasSchedule = interviewRows.some(
                    (r) => r.application === app.id && r.scheduled_at && (r.status || 'scheduled') === 'scheduled'
                  );
                  const chip = interviewStatusChip(app.status, null);
                  const isSelected = app.id === selectedId;
                  return (
                    <button
                      key={app.id}
                      onClick={() => setSelectedId(app.id)}
                      className={cn(
                        'w-full text-left rounded-xl border px-3 py-2.5 transition',
                        isSelected
                          ? 'border-indigo-300 bg-indigo-50/70 shadow-xs ring-1 ring-indigo-200'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900 truncate">{app.company_name}</span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                            app.automated_screening_tier === 'A'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          )}
                        >
                          Tier {app.automated_screening_tier}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        {app.inferred_stage && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                            {humanise(app.inferred_stage)}
                          </span>
                        )}
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                            hasSchedule
                              ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                              : chip.cls
                          )}
                        >
                          {hasSchedule ? 'Interview Scheduled' : chip.label}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-500">
                        {app.unverified_claims > 0 && (
                          <span className="inline-flex items-center gap-1 text-rose-600 font-medium">
                            <ShieldAlert className="h-3 w-3" /> {app.unverified_claims} unverified
                          </span>
                        )}
                        {app.stage_conflict_detected && (
                          <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                            <AlertTriangle className="h-3 w-3" /> Stage conflict
                          </span>
                        )}
                        {app.reviewer_count > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <ClipboardList className="h-3 w-3" /> {app.reviewer_count} reviewer
                            {app.reviewer_count > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Detail: Interview Workspace ───────────────────────────────── */}
          <div className="space-y-5 min-w-0">
            {selected == null ? (
              <EmptyState
                icon={MessagesSquare}
                title="Pick a candidate"
                body="Select a founder from the list to load the workspace: brief, questions, notes, assessment and decision."
              />
            ) : (
              <>
                <DetailHeader
                  app={selected}
                  session={scheduledSession}
                  onSchedule={() => setScheduleModalOpen(true)}
                />

                {/* Tab bar — underline pills */}
                <div className="rounded-2xl border border-slate-200 bg-white px-2 shadow-sm">
                  <div className="flex items-center gap-1 overflow-x-auto">
                    {TABS.map((t) => {
                      const active = t.key === activeTab;
                      return (
                        <button
                          key={t.key}
                          onClick={() => setTab(t.key)}
                          className={cn(
                            'shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold transition -mb-px border-b-2',
                            active
                              ? 'text-indigo-600 border-indigo-600 bg-indigo-50/50'
                              : 'text-slate-500 border-transparent hover:text-slate-800 hover:bg-slate-50'
                          )}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
                  {/* ── Tab content ─────────────────────────────────────────── */}
                  <div className="min-w-0 space-y-5">
                    {assessmentLoading ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-2 text-sm text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" /> Reading the ML screening assessment…
                      </div>
                    ) : activeTab === 'brief' ? (
                      <BriefTab
                        app={selected}
                        assessment={assessment ?? null}
                        assessmentError={assessmentError}
                        graph={graph ?? null}
                        graphLoading={graphLoading}
                        graphError={graphError}
                        strengths={strengths}
                        areasToExplore={areasToExplore}
                        suggestedQuestions={suggestedQuestions}
                        guideLoading={guideLoading}
                        guideError={guideError}
                      />
                    ) : activeTab === 'questions' ? (
                      <QuestionsTab
                        appId={selected.id}
                        questions={suggestedQuestions}
                        loading={guideLoading}
                        error={guideError}
                      />
                    ) : activeTab === 'transcript' ? (
                      <TranscriptPanel
                        session={scheduledSession}
                        applicationId={selected.id}
                        applicationLabel={selected.company_name}
                        claims={graph?.claims ?? []}
                        canWrite={canWriteTranscript}
                        afterWrite={invalidateTranscript}
                      />
                    ) : activeTab === 'notes' ? (
                      <NotesTab
                        loading={notesLoading}
                        error={notesError}
                        notes={notes}
                        saving={addNote.isPending}
                        onAdd={(body) => addNote.mutate(body)}
                      />
                    ) : activeTab === 'assessment' ? (
                      <AssessmentTab
                        appId={selected.id}
                        existing={myReview}
                        saving={saveReview.isPending}
                        onSubmit={(payload) => saveReview.mutate(payload)}
                      />
                    ) : (
                      <DecisionTab
                        app={selected}
                        existing={myReview}
                        saving={saveReview.isPending}
                        advancing={advance.isPending}
                        transitions={transitions?.allowed ?? []}
                        transitionsLoading={transitionsLoading}
                        transitionsError={transitionsError}
                        onSubmitRecommendation={(payload) => saveReview.mutate(payload)}
                        onAdvance={(toStage, reason) => advance.mutate({ appId: selected.id, toStage, reason })}
                        onReject={() => setRejectModalOpen(true)}
                      />
                    )}
                  </div>

                  {/* ── Right rail: everything the reviewer needs while on the call
                       stays visible, so the tab below never has to be re-scrolled.
                       It renders stored rows only — sessions, reviews, notes. ───── */}
                  <aside className="min-w-0 space-y-4 2xl:sticky 2xl:top-6">
                    <RailCard
                      title="Interview queue"
                      action={
                        <span className="text-[11px] font-semibold text-slate-500">
                          {queueIndex >= 0 ? `${queueIndex + 1} / ${visible.length}` : `— / ${visible.length}`}
                        </span>
                      }
                    >
                      {nextCandidate ? (
                        <>
                          <p className="text-xs text-slate-500 truncate">
                            Up next:{' '}
                            <span className="font-semibold text-slate-800">{nextCandidate.company_name}</span>
                          </p>
                          <Button
                            size="sm"
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white"
                            onClick={() => setSelectedId(nextCandidate.id)}
                          >
                            Next candidate <ArrowRight className="h-3.5 w-3.5 ml-1" />
                          </Button>
                        </>
                      ) : (
                        <p className="text-xs text-slate-400">
                          {visible.length <= 1
                            ? 'One candidate is in this view — there is no next interview to open.'
                            : 'No candidates left in the current filter.'}
                        </p>
                      )}
                    </RailCard>

                    <PanelCard
                      sessions={appInterviews}
                      sessionsLoading={sessionsLoading}
                      sessionsError={sessionsError}
                      reviews={appReviews}
                      reviewsLoading={reviewsLoading}
                      reviewsError={reviewsError}
                    />

                    <RailCard
                      title="Interview notes"
                      action={<RailTabLink onClick={() => setTab('notes')} />}
                    >
                      {notesLoading ? (
                        <p className="text-xs text-slate-400">Loading the note trail…</p>
                      ) : notesError ? (
                        <p className="text-[11px] text-rose-600">
                          Notes unavailable — {apiErrMessage(notesError, 'could not load the note trail.')}
                        </p>
                      ) : latestNote == null ? (
                        <p className="text-xs text-slate-400">
                          No notes yet — the Notes tab is where the first one lands.
                        </p>
                      ) : (
                        <>
                          <p className="text-xs text-slate-700 line-clamp-4 whitespace-pre-wrap">
                            {latestNote.body}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {latestNote.author || 'Reviewer'} · {formatDateTime(latestNote.created_at)}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {notes.length} note{notes.length === 1 ? '' : 's'} on this application.
                          </p>
                        </>
                      )}
                    </RailCard>

                    <RailCard
                      title="Suggested questions"
                      action={<RailTabLink onClick={() => setTab('questions')} />}
                    >
                      {guideLoading && suggestedQuestions.length === 0 ? (
                        <p className="text-xs text-slate-400">Building probes from the assessment…</p>
                      ) : guideError != null && !guideLoading ? (
                        <p className="text-[11px] text-rose-600">
                          Probes unavailable — {apiErrMessage(guideError, 'could not build the interview guide.')}
                        </p>
                      ) : suggestedQuestions.length === 0 ? (
                        <p className="text-xs text-slate-400">
                          No evidence gaps to ask about yet — run ML Screening for this application.
                        </p>
                      ) : (
                        <ol className="space-y-2">
                          {suggestedQuestions.slice(0, 3).map((p) => (
                            <li key={p.key} className="text-xs text-slate-700 leading-snug">
                              <span
                                className={cn(
                                  'mr-1 inline-block align-middle text-[10px] font-semibold px-1.5 py-0.5 rounded border',
                                  p.tagCls
                                )}
                              >
                                {p.tag}
                              </span>
                              {p.question}
                            </li>
                          ))}
                          {suggestedQuestions.length > 3 && (
                            <li className="text-[10px] text-slate-400">
                              …and {suggestedQuestions.length - 3} more in the Questions tab.
                            </li>
                          )}
                        </ol>
                      )}
                    </RailCard>
                  </aside>
                </div>

                {/* Reject confirmation — the only irreversible action on this screen */}
                {rejectModalOpen && (
                  <Modal title="Reject this application?" onClose={() => setRejectModalOpen(false)}>
                    <p className="text-sm text-slate-600">
                      This moves <span className="font-semibold text-slate-900">{selected.company_name}</span> to{' '}
                      <span className="font-semibold">REJECTED</span> in the pipeline. The rationale is recorded with
                      the transition. Committee-level rejections belong on the Decisions screen — this is the
                      interview-stage call.
                    </p>
                    <Textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Why is this candidate being rejected at interview stage? (optional)"
                      rows={3}
                      className="mt-3 border-slate-200 bg-slate-50/50 focus-visible:ring-indigo-500"
                    />
                    <div className="mt-4 flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-slate-500"
                        onClick={() => setRejectModalOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="bg-rose-600 hover:bg-rose-500"
                        loading={advance.isPending}
                        disabled={advance.isPending}
                        onClick={() =>
                          advance.mutate({
                            appId: selected.id,
                            toStage: 'REJECTED',
                            reason: rejectReason.trim() || undefined,
                          })
                        }
                      >
                        Confirm rejection <Ban className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </div>
                  </Modal>
                )}

                {/* Schedule modal — persists a real InterviewSession */}
                {scheduleModalOpen && (
                  <ScheduleModal
                    initialValue={toDatetimeLocal(scheduledSession?.scheduled_at)}
                    isReschedule={Boolean(scheduledSession?.scheduled_at)}
                    saving={schedule.isPending}
                    onCancel={() => setScheduleModalOpen(false)}
                    onSave={(iso) => schedule.mutate(iso)}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Detail header ────────────────────────────────────────────────────────────

function DetailHeader({
  app,
  session,
  onSchedule,
}: {
  app: ApplicationItem;
  session: InterviewSessionRow | null;
  onSchedule: () => void;
}) {
  const priority = priorityChip(app.automated_screening_tier);
  const chip = interviewStatusChip(app.status, session);
  const scheduled = Boolean(session?.scheduled_at && (session.status || 'scheduled') === 'scheduled');
  const founderName: string | null = null; // no founder full_name is exposed by the applications API serializers

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-black tracking-tight truncate">
              {founderName ?? app.company_name}
            </h2>
            <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', priority.cls)}>
              {priority.label}
            </span>
            <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', chip.cls)}>
              {chip.label}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {founderName
              ? `Founder, ${app.company_name}`
              : 'Founder name is not exposed by the applications API — open Application 360 for the submission record'}{' '}
            · {app.sector ? `${humanise(app.sector)} · ` : ''}
            {app.organization_name ?? app.program_name}
          </p>
          {scheduled && session?.scheduled_at && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-2">
              <CalendarClock className="h-4 w-4 text-indigo-600 shrink-0" />
              <span className="text-sm font-bold text-indigo-800">{formatSchedule(session.scheduled_at)}</span>
              {session.interviewer_name && (
                <span className="text-xs text-indigo-600">· {session.interviewer_name}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-500 text-white"
            onClick={onSchedule}
          >
            <CalendarClock className="h-3.5 w-3.5 mr-1" />
            {scheduled ? 'Reschedule' : 'Schedule Interview'}
          </Button>
          <Link href={`/accelerator/applications/${app.id}`}>
            <Button size="sm" variant="outline" className="border-slate-300 bg-white text-slate-600 hover:bg-slate-100">
              Open Application 360 <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Brief tab ────────────────────────────────────────────────────────────────

function BriefTab({
  app,
  assessment,
  assessmentError,
  graph,
  graphLoading,
  graphError,
  strengths,
  areasToExplore,
  suggestedQuestions,
  guideLoading,
  guideError,
}: {
  app: ApplicationItem;
  assessment: ApplicationAssessment | null;
  assessmentError: unknown;
  graph: EvidenceGraph | null;
  graphLoading: boolean;
  graphError: unknown;
  strengths: Strength[];
  areasToExplore: Probe[];
  suggestedQuestions: Probe[];
  guideLoading: boolean;
  guideError: unknown;
}) {
  if (assessmentError) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-rose-600">
          ML assessment unavailable — {apiErrMessage(assessmentError, 'could not load the screening assessment for this application.')}
        </p>
        <p className="text-[11px] text-slate-400 mt-2">
          The interview can still run; there is simply no pre-read to show until the record loads.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {!assessment ? (
        <EmptyState
          icon={Sparkles}
          title="No ML assessment yet — run ML Screening first."
          body="Without a screening assessment this interview has no pre-read. Open the full analysis to run it, then come back."
          action={
            <Link href={`/accelerator/applications/${app.id}`}>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white">
                Open full analysis <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* Dimensions the written application already supports */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <SectionHeading
              icon={ShieldCheck}
              title="What the written application already supports"
              subtitle="Evidence statements, not verdicts. Confidence rises only with proof."
            />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {(
                [
                  ['Founder', dimPct(assessment.founder_score)],
                  ['Problem', dimPct(assessment.problem_score)],
                  ['Product', dimPct(assessment.product_score)],
                  ['Market', dimPct(assessment.market_score)],
                  ['Traction', dimPct(assessment.traction_score)],
                  ['Revenue', dimPct(assessment.revenue_score)],
                  ['Team', dimPct(assessment.team_score)],
                  ['Application completeness', readScore(assessment.application_completeness)],
                ] as Array<[string, number | null]>
              ).map(([labelText, pct]) => (
                <DimensionCell key={labelText} label={labelText} scorePct={pct} />
              ))}
            </div>
            {assessment.recommendation_reasoning && (
              <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <HelpCircle className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    ML suggestion (advisory)
                  </div>
                  <p className="text-xs text-slate-700 mt-0.5">
                    {humanise(assessment.overall_recommendation)} — {assessment.recommendation_reasoning}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    A model suggestion only. Interviewers and the committee decide.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Why we're interviewing */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <SectionHeading
              icon={ThumbsUp}
              title="Why we're interviewing"
              subtitle="The strongest points in the application so far."
            />
            {strengths.length === 0 ? (
              <p className="text-xs text-slate-400">
                The assessment found no strengths worth carrying into the room — worth probing why.
              </p>
            ) : (
              <ul className="space-y-2">
                {strengths.map((s) => (
                  <li
                    key={s.key}
                    className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3"
                  >
                    <span className="mt-0.5 shrink-0 h-5 w-5 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center">
                      <Check className="h-3 w-3 text-emerald-700" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{s.point}</p>
                      {s.detail && (
                        <p className="text-xs text-emerald-800/80 mt-0.5">Evidence: {s.detail}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Areas to Explore */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <SectionHeading
              icon={AlertTriangle}
              title="Areas to Explore"
              subtitle="Bear-case points, risk flags and contradictions that only a live conversation can settle."
            />
            {guideLoading && areasToExplore.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Building the pre-read from the assessment and
                open claims…
              </div>
            ) : guideError != null && !guideLoading ? (
              <p className="text-xs text-rose-600">
                Interview guide unavailable —{' '}
                {apiErrMessage(guideError, 'could not build probes for this application.')}
              </p>
            ) : areasToExplore.length === 0 ? (
              <p className="text-xs text-slate-400">
                The server flagged nothing — the stored record is internally consistent. Use the time to test
                founder judgement and team dynamics.
              </p>
            ) : (
              <ul className="space-y-2">
                {areasToExplore.map((a) => (
                  <li
                    key={a.key}
                    className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/40 px-4 py-3"
                  >
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800">{a.question}</p>
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded border', a.tagCls)}>
                          {a.tag}
                        </span>
                        {a.detail && <span className="text-[10px] text-slate-500">{a.detail}</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {graphLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-400 pt-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the evidence graph…
              </div>
            )}
            {graphError != null && !graphLoading && (
              <p className="text-[11px] text-rose-600 pt-1">
                Evidence graph unavailable — {apiErrMessage(graphError, 'could not load claims for this application.')}
              </p>
            )}
            {!graphLoading && graphError == null && graph?.summary && (
              <div className="pt-1 flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                <span className="font-semibold uppercase tracking-wide">Claims:</span>
                <span>{graph.summary.total} total</span>
                <span className="text-emerald-600">{graph.summary.verified} verified</span>
                <span className="text-amber-600">{graph.summary.unverified} unverified</span>
                <span className="text-rose-600">{graph.summary.contradicted} contradicted</span>
              </div>
            )}
          </div>

          {/* Suggested Questions (preview of the Questions tab) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <SectionHeading
                icon={MessagesSquare}
                title="Suggested Questions"
                subtitle="Built by the server from weak dimensions, open claims and risk flags"
              />
              <span className="shrink-0 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                {suggestedQuestions.length} questions
              </span>
            </div>
            {guideLoading && suggestedQuestions.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Building the question set…
              </div>
            ) : guideError != null && !guideLoading ? (
              <p className="text-xs text-rose-600">
                Questions unavailable — {apiErrMessage(guideError, 'could not build the interview guide.')}
              </p>
            ) : suggestedQuestions.length === 0 ? (
              <p className="text-xs text-slate-400">
                No gaps were flagged for this application — every stored claim is verified and no dimension came
                back weak.
              </p>
            ) : (
              <ol className="space-y-2">
                {suggestedQuestions.slice(0, 5).map((p, i) => (
                  <li
                    key={p.key}
                    className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3"
                  >
                    <span className="mt-0.5 shrink-0 h-5 w-5 rounded-md bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800">{p.question}</p>
                      <span className={cn('mt-1.5 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border', p.tagCls)}>
                        {p.tag}
                      </span>
                    </div>
                  </li>
                ))}
                {suggestedQuestions.length > 5 && (
                  <li className="text-[11px] text-slate-400 pl-1">
                    …and {suggestedQuestions.length - 5} more in the Questions tab.
                  </li>
                )}
              </ol>
            )}
            <p className="text-[10px] text-slate-400">
              Built by the interview-guide endpoint from the stored assessment, risk flags and unverified claims.
              Deterministic — no model call is made, so the same gaps always produce the same questions.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Questions tab: checklist with per-app localStorage progress ─────────────

function QuestionsTab({
  appId,
  questions,
  loading,
  error,
}: {
  appId: number;
  questions: Probe[];
  loading: boolean;
  error: unknown;
}) {
  const storageKey = `questions.${appId}`;
  const [checked, setChecked] = React.useState<Record<string, boolean>>(() => lsRead<Record<string, boolean>>(storageKey, {}));
  React.useEffect(() => {
    setChecked(lsRead<Record<string, boolean>>(storageKey, {}));
  }, [storageKey]);

  const toggle = (key: string) => {
    setChecked((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      lsWrite(storageKey, next);
      return next;
    });
  };

  const answered = questions.filter((q) => checked[q.key]).length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <SectionHeading
          icon={ClipboardList}
          title="Question checklist"
          subtitle="Built server-side from weak dimensions, risk flags and open claims. Tick as you cover them in the call."
        />
        <span className="shrink-0 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
          {answered}/{questions.length} covered
        </span>
      </div>
      {loading && questions.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Building the question set from the stored evidence…
        </div>
      ) : error != null && !loading ? (
        <p className="text-sm text-rose-600">
          Questions unavailable — {apiErrMessage(error, 'could not build the interview guide.')}
        </p>
      ) : questions.length === 0 ? (
        <p className="text-xs text-slate-400">
          Nothing to ask yet — the server found no weak dimension, risk flag or open claim on this application.
          Tick progress will appear here as soon as probes exist.
        </p>
      ) : (
        <ul className="space-y-2">
          {questions.map((q) => {
            const done = Boolean(checked[q.key]);
            return (
              <li key={q.key}>
                <label
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition',
                    done ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/60 hover:border-slate-300'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition',
                      done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white'
                    )}
                  >
                    {done && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <input type="checkbox" className="sr-only" checked={done} onChange={() => toggle(q.key)} />
                  <span className="min-w-0">
                    <span className={cn('block text-sm', done ? 'text-slate-500 line-through' : 'text-slate-800')}>
                      {q.question}
                    </span>
                    <span className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded border', q.tagCls)}>{q.tag}</span>
                      {q.detail && <span className="text-[10px] text-slate-500">{q.detail}</span>}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[10px] text-slate-400">
        Checklist progress is stored in this browser only (per application) — the backend has no
        per-question state, and we do not fake one.
      </p>
    </div>
  );
}

// ─── Notes tab: append-only rows via /applications/{id}/notes/ ───────────────
// One row per author with a server timestamp — two reviewers can never
// overwrite each other the way a single mutable notes blob allowed.

function NotesTab({
  loading,
  error,
  notes,
  saving,
  onAdd,
}: {
  loading: boolean;
  error: unknown;
  notes: AppNote[];
  saving: boolean;
  onAdd: (body: string) => void;
}) {
  const [draft, setDraft] = React.useState('');

  const save = () => {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft('');
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <SectionHeading
        icon={StickyNote}
        title="Interview notes"
        subtitle="Append-only rows saved to this application's note trail — visible to every reviewer on Application 360."
      />
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the note trail…
        </div>
      ) : error ? (
        <p className="text-sm text-rose-600">Notes unavailable — {apiErrMessage(error, 'could not load the note trail.')}</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-slate-400">No notes yet on this application.</p>
      ) : (
        <ul className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
          {notes.map((n) => (
            <li key={n.id} className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-slate-600">{n.author || 'Reviewer'}</span>
                <span className="text-[10px] text-slate-400">{formatDateTime(n.created_at)}</span>
              </div>
              <p className="text-xs text-slate-700 mt-1 whitespace-pre-wrap">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">New note</label>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What the founder evidenced live, what stayed vague, and what the committee should look at next."
          rows={3}
          className="mt-1.5 border-slate-200 bg-slate-50/50 focus-visible:ring-indigo-500"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-500 text-white"
          loading={saving}
          disabled={saving || !draft.trim()}
          onClick={save}
        >
          Save Note <Send className="h-3.5 w-3.5 ml-1" />
        </Button>
        <span className="text-[10px] text-slate-400">Each note is a separate append-only row — nobody overwrites anybody.</span>
      </div>
    </div>
  );
}

// ─── Assessment tab: human scorecard via /accelerator/reviews/ ───────────────
// Scores are 1–10 (ReviewerAssessment). Nothing is pre-filled and no review
// row exists until a human submits one — the old default-3/5 bug is gone.

const REVIEW_DIMENSIONS: Array<{ key: keyof Omit<ReviewerScoreInput, 'application' | 'recommendation' | 'notes'>; label: string }> = [
  { key: 'founder_score', label: 'Founder' },
  { key: 'product_score', label: 'Product' },
  { key: 'market_score', label: 'Market' },
  { key: 'traction_score', label: 'Traction' },
  { key: 'team_score', label: 'Team' },
  { key: 'overall_conviction', label: 'Overall conviction' },
];

function scoreHint(v: number): string {
  if (v <= 4) return 'Weak';
  if (v <= 7) return 'Moderate';
  return 'Strong';
}

type ReviewPayload =
  | { mode: 'create'; data: ReviewerScoreInput }
  | { mode: 'update'; id: number; data: Record<string, any> };

function AssessmentTab({
  appId,
  existing,
  saving,
  onSubmit,
}: {
  appId: number;
  existing: ReviewRow | null;
  saving: boolean;
  onSubmit: (payload: ReviewPayload) => void;
}) {
  // null = not set by a human. A review row only ever exists when someone submits.
  const [scores, setScores] = React.useState<Record<string, number | null>>({});
  const [comment, setComment] = React.useState('');
  const [recommendation, setRecommendation] = React.useState<ReviewerScoreInput['recommendation']>('INTERVIEW');

  React.useEffect(() => {
    // Prefill ONLY from this reviewer's existing, real record — never defaults.
    setScores(
      existing
        ? {
            founder_score: readScore(existing.founder_score),
            product_score: readScore(existing.product_score),
            market_score: readScore(existing.market_score),
            traction_score: readScore(existing.traction_score),
            team_score: readScore(existing.team_score),
            overall_conviction: readScore(existing.overall_conviction),
          }
        : {},
    );
    setComment(existing?.notes ?? '');
    setRecommendation(
      (['INTERVIEW', 'REJECT', 'WAITLIST', 'NEEDS_MORE_INFO'] as const).includes(
        (existing?.recommendation ?? '') as any
      )
        ? ((existing?.recommendation ?? 'INTERVIEW') as ReviewerScoreInput['recommendation'])
        : 'INTERVIEW'
    );
    // appId in deps: re-init when the selected candidate changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, existing?.id]);

  const unset = REVIEW_DIMENSIONS.filter((d) => scores[d.key] == null);
  const complete = unset.length === 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <SectionHeading
        icon={ShieldCheck}
        title="Reviewer assessment (your judgment, not the ML's)"
        subtitle={
          existing
            ? 'You have already submitted a review for this application — saving updates your record.'
            : 'Scored 1–10 per dimension and submitted to your reviewer scorecard. Nothing is pre-filled; the ML screening scores are untouched.'
        }
      />
      {!existing && (
        <p className="text-[11px] text-slate-400 -mt-1">
          No human review yet on this application — a record exists only after you submit one.
        </p>
      )}
      <div className="space-y-3">
        {REVIEW_DIMENSIONS.map((dim) => {
          const value = scores[dim.key] ?? null;
          return (
            <div
              key={dim.key}
              className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3"
            >
              <div className="sm:w-44 shrink-0">
                <div className="text-sm font-semibold text-slate-800">{dim.label}</div>
                <div className="text-[10px] text-slate-400">
                  {value !== null ? `${value}/10 · ${scoreHint(value)}` : 'Not set'}
                </div>
              </div>
              <div className="inline-flex items-center gap-1 flex-wrap">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setScores((prev) => ({ ...prev, [dim.key]: n }))}
                    className={cn(
                      'h-8 w-8 rounded-lg border text-sm font-bold transition',
                      n === value
                        ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-300 hover:text-indigo-600'
                    )}
                    aria-label={`${dim.label} = ${n} of 10`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Recommendation</label>
        <select
          value={recommendation}
          onChange={(e) => setRecommendation(e.target.value as ReviewerScoreInput['recommendation'])}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300"
        >
          <option value="INTERVIEW">Interview — evidence supports proceeding</option>
          <option value="WAITLIST">Waitlist — strong but not now</option>
          <option value="NEEDS_MORE_INFO">Needs more info — resolve gaps first</option>
          <option value="REJECT">Reject — does not fit this cohort</option>
        </select>
      </div>
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Overall comment</label>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What you concluded from the scores, and what remains unresolved."
          rows={3}
          className="mt-1.5 border-slate-200 bg-slate-50/50 focus-visible:ring-indigo-500"
        />
      </div>
      {!complete && (
        <p className="text-[11px] text-amber-600">
          Set every dimension (1–10) before submitting — unset: {unset.map((u) => u.label).join(', ')}.
        </p>
      )}
      <Button
        size="sm"
        className="bg-indigo-600 hover:bg-indigo-500 text-white"
        loading={saving}
        disabled={saving || !complete}
        onClick={() => {
          const data = {
            application: appId,
            founder_score: Number(scores.founder_score),
            market_score: Number(scores.market_score),
            product_score: Number(scores.product_score),
            team_score: Number(scores.team_score),
            traction_score: Number(scores.traction_score),
            overall_conviction: Number(scores.overall_conviction),
            recommendation,
            notes: comment.trim() || undefined,
          };
          onSubmit(
            existing
              ? { mode: 'update', id: existing.id, data }
              : { mode: 'create', data: data as ReviewerScoreInput },
          );
        }}
      >
        {existing ? 'Update my assessment' : 'Submit assessment'} <Check className="h-3.5 w-3.5 ml-1" />
      </Button>
    </div>
  );
}

// ─── Decision tab: recommendation record + real stage actions ────────────────
// Pipeline buttons are rendered ONLY from the backend's allowed-transitions
// response — the UI never offers a move the workflow engine would reject.

function DecisionTab({
  app,
  existing,
  saving,
  advancing,
  transitions,
  transitionsLoading,
  transitionsError,
  onSubmitRecommendation,
  onAdvance,
  onReject,
}: {
  app: ApplicationItem;
  existing: ReviewRow | null;
  saving: boolean;
  advancing: boolean;
  transitions: Array<{ status: string; label: string }>;
  transitionsLoading: boolean;
  transitionsError: unknown;
  onSubmitRecommendation: (payload: ReviewPayload) => void;
  onAdvance: (toStage: string, reason?: string) => void;
  onReject: () => void;
}) {
  const [recommendation, setRecommendation] = React.useState<ReviewerScoreInput['recommendation']>('INTERVIEW');
  const [note, setNote] = React.useState('');

  React.useEffect(() => {
    setRecommendation(
      (['INTERVIEW', 'REJECT', 'WAITLIST', 'NEEDS_MORE_INFO'] as const).includes(
        (existing?.recommendation ?? '') as any
      )
        ? ((existing?.recommendation ?? 'INTERVIEW') as ReviewerScoreInput['recommendation'])
        : 'INTERVIEW'
    );
    setNote(existing?.notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id, existing?.id]);

  const terminal = isTerminal(app.status);
  const allows = (s: string) => transitions.some((t) => t.status === s);

  const recChoice = (value: ReviewerScoreInput['recommendation'], label: string, desc: string) => (
    <button
      type="button"
      key={value}
      onClick={() => setRecommendation(value)}
      className={cn(
        'text-left rounded-xl border px-4 py-3 transition',
        recommendation === value
          ? 'border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-200'
          : 'border-slate-200 bg-white hover:border-slate-300'
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0',
            recommendation === value ? 'border-indigo-600' : 'border-slate-300'
          )}
        >
          {recommendation === value && <span className="h-2 w-2 rounded-full bg-indigo-600" />}
        </span>
        <span className="text-sm font-bold text-slate-900">{label}</span>
      </div>
      <p className="text-[11px] text-slate-500 mt-1 pl-6">{desc}</p>
    </button>
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <SectionHeading
        icon={ArrowRight}
        title="Your decision for this interview"
        subtitle="The recommendation is saved to your reviewer record; the stage buttons move the real pipeline."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {recChoice('INTERVIEW', 'Advance to Committee', 'Endorse moving this into the committee queue (COMMITTEE_REVIEW).')}
        {recChoice('WAITLIST', 'Advance to Offer Discussion', 'No interview-stage offer path exists — record WAITLIST here and take the offer call on the Decisions screen.')}
        {recChoice('NEEDS_MORE_INFO', 'Defer to next cohort', 'Moves the application to DEFERRED — postponed, not rejected.')}
        {recChoice('REJECT', 'Reject', 'Moves the application to REJECTED with your rationale. Needs confirmation.')}
      </div>

      <div>
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Decision note</label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="One paragraph the committee will read alongside your scores."
          rows={3}
          className="mt-1.5 border-slate-200 bg-slate-50/50 focus-visible:ring-indigo-500"
        />
      </div>

      <Button
        size="sm"
        variant="outline"
        className="border-indigo-200 bg-indigo-50/60 text-indigo-700 hover:bg-indigo-100"
        loading={saving}
        disabled={saving || !existing}
        onClick={() => {
          if (!existing) return; // never auto-create a review with default scores
          onSubmitRecommendation({
            mode: 'update',
            id: existing.id,
            data: { recommendation, notes: note.trim() || undefined },
          });
        }}
      >
        Save recommendation to my review <PencilLine className="h-3.5 w-3.5 ml-1" />
      </Button>
      {!existing && (
        <p className="text-[11px] text-amber-600 -mt-2">
          No human review yet on this application — submit your scorecard on the Assessment tab first.
          Pitchmic does not create review records with default scores.
        </p>
      )}

      <div className="border-t border-slate-200 pt-4">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Pipeline actions</div>
        {transitionsLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking allowed transitions…
          </div>
        ) : transitionsError ? (
          <p className="text-[12px] text-rose-600 py-1">
            Workflow options unavailable — {apiErrMessage(transitionsError, 'could not load allowed transitions.')}
          </p>
        ) : terminal ? (
          <p className="text-[12px] text-slate-400">
            This application is already decided ({humanise(app.status)}) — the workflow offers no further moves.
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
            {allows('COMMITTEE_REVIEW') && (
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-500 text-white"
                loading={advancing}
                disabled={advancing}
                onClick={() => onAdvance('COMMITTEE_REVIEW')}
              >
                Send to committee <Send className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
            {app.status !== 'INTERVIEW_COMPLETE' && allows('INTERVIEW_COMPLETE') && (
              <Button
                size="sm"
                variant="outline"
                className="border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                loading={advancing}
                disabled={advancing}
                onClick={() => onAdvance('INTERVIEW_COMPLETE')}
              >
                Mark interview complete
              </Button>
            )}
            {allows('DEFERRED') && (
              <Button
                size="sm"
                variant="outline"
                className="border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                loading={advancing}
                disabled={advancing}
                onClick={() => onAdvance('DEFERRED', note.trim() || undefined)}
              >
                Defer to next cohort
              </Button>
            )}
            {allows('REJECTED') && (
              <Button
                size="sm"
                variant="destructive"
                className="bg-rose-600 hover:bg-rose-500 text-white"
                disabled={advancing}
                onClick={onReject}
              >
                Reject <Ban className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
            {!advancing &&
              !allows('COMMITTEE_REVIEW') &&
              !allows('INTERVIEW_COMPLETE') &&
              !allows('DEFERRED') &&
              !allows('REJECTED') && (
                <p className="text-[12px] text-slate-400">
                  — The workflow engine currently allows none of these moves from{' '}
                  <span className="font-semibold">{humanise(app.status)}</span>.
                </p>
              )}
            <Link href="/accelerator/decision-room" className="sm:ml-auto">
              <Button size="sm" variant="ghost" className="text-slate-500 hover:text-slate-900">
                Offer & final decisions <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        )}
        <p className="mt-3 text-[10px] text-slate-400 flex items-start gap-1.5">
          <Ban className="h-3.5 w-3.5 mt-px shrink-0" />
          &ldquo;Send to committee&rdquo; only moves the application into the committee queue. It does not
          accept, reject or waitlist the startup — the committee does that on the Decisions screen. Only moves the
          program&rsquo;s configured workflow currently allows are shown; illegal transitions are refused by the
          backend and the reason is reported back to you.
        </p>
      </div>
    </div>
  );
}

// ─── Interview Panel card ─────────────────────────────────────────────────────
// Who the program ASKED to review an application is a separate record, on that
// application's Reviews tab (/review-assignments/). This card answers a
// different question — who is actually tied to this application's interviews —
// so it is built ONLY from records the backend already has: interview-session
// interviewers and reviewers who submitted assessments. Never invented names.

function PanelCard({
  sessions,
  sessionsLoading,
  sessionsError,
  reviews,
  reviewsLoading,
  reviewsError,
}: {
  sessions: InterviewSessionRow[];
  sessionsLoading: boolean;
  sessionsError: unknown;
  reviews: ReviewRow[];
  reviewsLoading: boolean;
  reviewsError: unknown;
}) {
  const humans = React.useMemo(() => {
    const map = new Map<string, { name: string; why: string[] }>();
    const add = (rawName: string | undefined | null, why: string) => {
      const name = (rawName || '').trim();
      if (!name || name === 'Pitchmic ML') return; // ML interviewer is not a human panel member
      const key = name.toLowerCase();
      const hit = map.get(key);
      if (hit) {
        if (!hit.why.includes(why)) hit.why.push(why);
      } else {
        map.set(key, { name, why: [why] });
      }
    };
    sessions.forEach((s) => {
      if (s.interviewer != null) add(s.interviewer_name, 'assigned to an interview session');
    });
    reviews.forEach((r) => add(r.reviewer_name || r.reviewer_email, 'submitted a review'));
    return Array.from(map.values());
  }, [sessions, reviews]);

  const loading = sessionsLoading || reviewsLoading;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <SectionHeading
        icon={Users}
        title="Interview Panel"
        subtitle="Everyone the backend actually ties to this application — no manual roster exists yet."
      />
      {sessionsError ? (
        <p className="text-[11px] text-rose-600">Interview sessions unavailable — {apiErrMessage(sessionsError, 'could not load sessions.')}</p>
      ) : null}
      {reviewsError ? (
        <p className="text-[11px] text-rose-600">Human reviews unavailable — {apiErrMessage(reviewsError, 'could not load review records.')}</p>
      ) : null}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading panel records…
        </div>
      ) : humans.length === 0 ? (
        <p className="text-xs text-slate-400">No panel assigned yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {humans.map((h) => (
            <li
              key={h.name.toLowerCase()}
              className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600/10 border border-indigo-500/20 text-[10px] font-black text-indigo-700">
                {h.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-slate-800">{h.name}</span>
                <span className="block text-[10px] text-slate-400">{h.why.join(' · ')}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {!loading && (
        <p className="text-[11px] text-slate-500">
          {reviews.length === 0
            ? 'No human review yet on this application — review rows appear only when a reviewer submits one.'
            : `${reviews.length} human review${reviews.length === 1 ? '' : 's'} on record (scores 1–10).`}
        </p>
      )}
      {sessions.length > 0 && (
        <div className="pt-1 space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Sessions on record</div>
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
              <CalendarClock className="h-3 w-3 text-slate-400" />
              <span className="font-semibold text-slate-700">Round {s.round_number ?? 1}</span>
              <span>{humanise(s.interview_type || 'session')}</span>
              <span>{s.scheduled_at ? formatSchedule(s.scheduled_at) : 'unscheduled'}</span>
              <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', s.status === 'complete' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500')}>
                {humanise(s.status || 'scheduled')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-black tracking-tight text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

function ScheduleModal({
  initialValue,
  isReschedule,
  saving,
  onCancel,
  onSave,
}: {
  initialValue: string;
  isReschedule: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: (iso: string) => void;
}) {
  const [value, setValue] = React.useState(initialValue);
  const valid = Boolean(value) && !Number.isNaN(new Date(value).getTime());
  return (
    <Modal title={isReschedule ? 'Reschedule interview' : 'Schedule interview'} onClose={onCancel}>
      <p className="text-sm text-slate-600">
        Saves a real interview session against this application (you are recorded as the interviewer).
        Times are stored in your local timezone.
      </p>
      <label className="mt-4 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
        Date & time
      </label>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:bg-white"
      />
      {valid && (
        <p className="mt-2 text-xs text-indigo-600 font-semibold">Will be recorded as: {formatSchedule(value)}</p>
      )}
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" className="text-slate-500" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-500 text-white"
          loading={saving}
          disabled={saving || !valid}
          onClick={() => valid && onSave(new Date(value).toISOString())}
        >
          {isReschedule ? 'Save new time' : 'Schedule'} <CalendarClock className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
    </Modal>
  );
}

// ─── Presentational pieces ─────────────────────────────────────────────────────

/** Shell for the right rail. The rail is a worklist sidebar, so it carries a
 *  tighter header than the icon SectionHeading used across the main column. */
function RailCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</span>
        {action}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function RailTabLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-500 shrink-0"
    >
      Open
    </button>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600/10 border border-indigo-500/20 shrink-0">
        <Icon className="h-4 w-4 text-indigo-600" />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-bold tracking-tight text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function DimensionCell({ label, scorePct }: { label: string; scorePct: number | null }) {
  const lvl = evidenceLevel(scorePct);
  const tone = lvl ? TONE_CLS[lvl.tone] : null;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 truncate">{label}</div>
      <div
        className={cn(
          'mt-1.5 inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold',
          lvl ? tone!.chip : 'text-slate-500 bg-slate-100 border-slate-200'
        )}
      >
        {/* Missing is not zero: no data renders "No data", never 0/"Requires validation". */}
        {lvl ? lvl.label : 'No data'}
      </div>
      <div className="mt-2 h-1 w-full rounded-full bg-slate-200 overflow-hidden">
        <div
          className={cn('h-full rounded-full', lvl ? tone!.bar : 'bg-slate-300')}
          style={{ width: `${scorePct === null ? 0 : Math.max(0, Math.min(100, scorePct))}%` }}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={cn('text-2xl font-black leading-tight mt-0.5', tone ?? 'text-slate-900')}>{value}</div>
      {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-dashed border-slate-200 rounded-2xl bg-white">
      <Icon className="h-8 w-8 mb-2 text-slate-300" />
      <p className="text-sm font-bold text-slate-700">{title}</p>
      <p className="text-xs text-slate-500 mt-1 max-w-md">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
