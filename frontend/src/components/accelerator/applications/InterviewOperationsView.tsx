'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Sparkles,
  TrendingUp,
  UserCheck,
  Vote,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import { acceleratorApi, ApplicationItem } from '@/lib/acceleratorApi';
import { evidenceLevelShort, formatDateTime } from '@/lib/screening';

/**
 * One row of /accelerator/interviews/ (InterviewSessionSerializer). Only the
 * fields this view reads are declared; the endpoint returns the whole model.
 */
interface InterviewSessionRow {
  id: number;
  application: number;
  interview_type?: string;
  round_number?: number;
  status?: string;
  scheduled_at: string | null;
  completed_at?: string | null;
  interviewer?: number | null;
  interviewer_name?: string | null;
  transcript_turn_count?: number;
  claims_recorded_from_it?: number;
}

type Slot = 'Today' | 'Tomorrow' | 'Upcoming' | 'Completed';

interface InterviewItem {
  id: string;
  /** Null when no session exists — there is nothing to attribute to anyone. */
  sessionId: number | null;
  applicationId: number;
  candidateName: string;
  sector: string;
  /** Straight off the session row; never a stand-in for "we don't know". */
  interviewer: string;
  sessionLabel: string;
  scheduledTime: string;
  /** Raw InterviewSession.status, so every count keys off the stored value. */
  status: string;
  statusLabel: string;
  slot: Slot | 'Needs a date';
  /** Why an open session has no usable date. */
  dateProblem: string | null;
  turnCount: number | null;
  claimsFromSession: number | null;
  preInterviewScore: number | null;
  tier: string | null;
  inferredStage: string | null;
  evidenceConfidence: number | null;
  totalClaims: number | null;
  unverifiedClaims: number | null;
  reviewerCount: number | null;
}

const SESSION_STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  complete: 'Complete',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

const ENDED_STATUSES = new Set(['complete', 'cancelled', 'no_show']);

const INTERVIEW_TYPE_LABEL: Record<string, string> = {
  ai_voice: 'ML voice screening',
  human_video: 'Human video call',
  human_in_person: 'Human in person',
};

/** Calendar-day distance from today, so "Today" means the reviewer's today. */
function dayOffset(iso: string): number | null {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  const now = new Date();
  const then = new Date(when.getFullYear(), when.getMonth(), when.getDate()).getTime();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((then - startToday) / 86_400_000);
}

// The Interviews workspace caches sessions under this key with the program id
// appended, so both screens read one fetch.
const QK_SESSIONS = ['accelerator-interview-sessions'] as const;

export function InterviewOperationsView({ applications = [] }: { applications?: ApplicationItem[] }) {
  const router = useRouter();
  const { activeProgramId } = useActiveProgram();
  const [activeSlot, setActiveSlot] = React.useState<Slot>('Today');

  const {
    data: sessions = [],
    isLoading: sessionsLoading,
    error: sessionsError,
  } = useQuery<InterviewSessionRow[]>({
    queryKey: [...QK_SESSIONS, activeProgramId],
    queryFn: () => acceleratorApi.osList<InterviewSessionRow>('interviews', activeProgramId ?? undefined),
    enabled: activeProgramId != null,
  });

  // The interview population: candidates a session would be booked for.
  const population = React.useMemo(
    () =>
      applications.filter((a) =>
        ['INTERVIEW_INVITED', 'INTERVIEW_COMPLETE', 'SHORTLISTED'].includes(a.status)
      ),
    [applications]
  );

  const appById = React.useMemo(() => new Map(applications.map((a) => [a.id, a])), [applications]);

  const items: InterviewItem[] = React.useMemo(() => {
    const screeningOf = (app: ApplicationItem, applicationId: number) => ({
      candidateName: app?.company_name || app?.startup_name || `Application #${applicationId}`,
      sector: app?.sector || '—',
      preInterviewScore: app?.startup_strength_score ?? app?.readiness_score ?? null,
      tier: app?.automated_screening_tier || null,
      inferredStage: app?.inferred_stage || null,
      evidenceConfidence: app?.evidence_confidence_score ?? null,
      totalClaims: app?.total_claims ?? null,
      unverifiedClaims: app?.unverified_claims ?? null,
      reviewerCount: app?.reviewer_count ?? null,
    });

    // /accelerator/interviews/ is not program-scoped by the server, so the join
    // to this program's application rows is what makes the list this program's
    // schedule. Sessions that don't join are counted and stated, not hidden.
    const joinable = sessions.filter((s) => appById.has(s.application));

    const rows: InterviewItem[] = joinable.map((s) => {
      const app = appById.get(s.application)!;
      const status = (s.status || 'scheduled').toLowerCase();
      const ended = ENDED_STATUSES.has(status);
      const offset = s.scheduled_at ? dayOffset(s.scheduled_at) : null;
      const typeLabel = INTERVIEW_TYPE_LABEL[s.interview_type || ''] || s.interview_type || 'Interview';

      // An open session with no date — or a date already behind it — cannot be
      // filed on a schedule without inventing one, so it gets its own strip.
      let dateProblem: string | null = null;
      if (!ended) {
        if (!s.scheduled_at || offset === null) dateProblem = 'was created without a date';
        else if (offset < 0) dateProblem = 'has passed without the session being logged';
      }

      let slot: InterviewItem['slot'];
      if (ended) slot = 'Completed';
      else if (dateProblem) slot = 'Needs a date';
      else if (offset === 0) slot = 'Today';
      else if (offset === 1) slot = 'Tomorrow';
      else slot = 'Upcoming';

      return {
        id: `s-${s.id}`,
        sessionId: s.id,
        applicationId: s.application,
        ...screeningOf(app, s.application),
        interviewer: s.interviewer_name || '—',
        sessionLabel: `${typeLabel} · Round ${s.round_number ?? 1}`,
        scheduledTime: s.scheduled_at ? formatDateTime(s.scheduled_at) : 'No date set',
        status,
        statusLabel: SESSION_STATUS_LABEL[status] || status.replace(/_/g, ' '),
        slot,
        dateProblem,
        turnCount: s.transcript_turn_count ?? null,
        claimsFromSession: s.claims_recorded_from_it ?? null,
      };
    });

    // Candidates in the interview population with no session are not an empty
    // schedule — they are interviews nobody has booked yet.
    const booked = new Set(rows.map((r) => r.applicationId));
    const unbooked: InterviewItem[] = population
      .filter((a) => !booked.has(a.id))
      .map((a) => ({
        id: `unbooked-${a.id}`,
        sessionId: null,
        applicationId: a.id,
        ...screeningOf(a, a.id),
        interviewer: '—',
        sessionLabel: 'No session has been created',
        scheduledTime: 'Not scheduled',
        status: 'unscheduled',
        statusLabel: 'Not scheduled',
        slot: 'Needs a date',
        dateProblem: 'no session exists yet',
        turnCount: null,
        claimsFromSession: null,
      }));

    return [...rows, ...unbooked];
  }, [sessions, population, appById]);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selectedInterview = items.find((i) => i.id === selectedId) ?? null;

  // /accelerator/interviews/ returns every session the reviewer can see, so the
  // ones that don't belong to an application in this program's loaded set are
  // left out — and said to be left out.
  const unattributedSessions = React.useMemo(
    () => sessions.filter((s) => !appById.has(s.application)).length,
    [sessions, appById]
  );

  const slotRows = React.useMemo(() => items.filter((i) => i.slot === activeSlot), [items, activeSlot]);
  const needsDateRows = React.useMemo(() => items.filter((i) => i.slot === 'Needs a date'), [items]);

  const slotCounts = {
    Today: items.filter((i) => i.slot === 'Today').length,
    Tomorrow: items.filter((i) => i.slot === 'Tomorrow').length,
    Upcoming: items.filter((i) => i.slot === 'Upcoming').length,
    Completed: items.filter((i) => i.slot === 'Completed').length,
  };

  const scheduledCount = slotCounts.Today + slotCounts.Tomorrow + slotCounts.Upcoming;
  const completedCount = items.filter((i) => i.status === 'complete').length;
  const noShowCount = items.filter((i) => i.status === 'no_show').length;
  const unbookedCount = items.filter((i) => i.sessionId === null).length;

  return (
    <div className="space-y-8">

      {/* ── 7.0 Interview Status Aggregate Card (FR-17 / Task 12) ───── */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-950/20 via-[#0F1623] to-[#0F1623] p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/60 flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-indigo-400" />
              Interview Status Summary
            </h2>
            <p className="text-[11px] text-white/40">
              Counted from stored interview sessions. Every number here is a row in the
              interview ledger, not an estimate of what the week looks like.
            </p>
          </div>
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-3 py-2 text-[11px] shrink-0">
            <span className="text-white/50 mr-1.5">Pairing:</span>
            <span className="font-bold text-indigo-300">Founder Interview</span>
            <span className="text-white/30 mx-1.5">+</span>
            <span className="font-bold text-purple-300">Product &amp; Market Interview</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-5">
          <div className="rounded-xl border border-white/10 bg-[#0F1623] p-4 hover:border-indigo-500/30 transition">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
              <Clock className="h-3 w-3 text-indigo-400" />
              Scheduled
            </div>
            <div className="text-2xl font-extrabold text-white tabular-nums">{scheduledCount}</div>
            <div className="text-[10px] text-white/40 mt-1">Open sessions carrying a date</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0F1623] p-4 hover:border-emerald-500/30 transition">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              Completed
            </div>
            <div className="text-2xl font-extrabold text-emerald-400 tabular-nums">{completedCount}</div>
            <div className="text-[10px] text-emerald-300/60 mt-1">Sessions marked complete</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0F1623] p-4 hover:border-amber-500/30 transition">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
              <UserCheck className="h-3 w-3 text-amber-400" />
              Not yet booked
            </div>
            <div className="text-2xl font-extrabold text-amber-400 tabular-nums">{unbookedCount}</div>
            <div className="text-[10px] text-amber-300/60 mt-1">
              Interview-stage candidates with no session row
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0F1623] p-4 hover:border-rose-500/30 transition">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
              <X className="h-3 w-3 text-rose-400" />
              No-show
            </div>
            <div className="text-2xl font-extrabold text-rose-400 tabular-nums">{noShowCount}</div>
            <div className="text-[10px] text-rose-300/60 mt-1">
              {noShowCount === 0
                ? 'No session has been logged as a no-show'
                : 'Sessions logged as a no-show'}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0F1623] p-4 hover:border-purple-500/30 transition col-span-2 sm:col-span-1 lg:col-span-1">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
              <Calendar className="h-3 w-3 text-purple-400" />
              Needs a date
            </div>
            <div className="text-2xl font-extrabold text-purple-400 tabular-nums">{needsDateRows.length}</div>
            <div className="text-[10px] text-purple-300/60 mt-1">
              Undated or lapsed sessions, plus candidates with no session at all. A session has
              no reschedule-request field, so a founder asking to move one would not show here.
            </div>
          </div>
        </div>
      </div>

      {/* ── 7.1 Interview Operations & 7.2 Intelligence Split View ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* Left Column: Interview Operations List (6 Cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-400" />
              Interview Operations Schedule
            </h3>

            {/* Slot pills — each bucket is the session's own stored date */}
            <div className="flex rounded-xl bg-black/40 border border-white/10 p-1 text-xs">
              {(['Today', 'Tomorrow', 'Upcoming', 'Completed'] as const).map((slot) => (
                <button
                  key={slot}
                  onClick={() => setActiveSlot(slot)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 font-semibold transition tabular-nums',
                    activeSlot === slot ? 'bg-indigo-600 text-white' : 'text-white/50 hover:text-white'
                  )}
                >
                  {slot} <span className="text-white/40">{slotCounts[slot]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 mb-4">
            <div className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-1.5">
              Interview Pairing
            </div>
            <div className="border-t border-indigo-500/20 pt-2 space-y-1.5 text-xs text-white/70">
              <p>How this program means to run its interviews:</p>
              <ul className="space-y-1 pl-1.5">
                <li className="flex items-start gap-1.5">
                  <span className="text-white/40">·</span>
                  <span>
                    <strong className="text-indigo-300">Founder Interview</strong>
                    {' '}— assesses team pedigree, mission alignment, founder-role fit
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-white/40">·</span>
                  <span>
                    <strong className="text-purple-300">Product &amp; Market Interview</strong>
                    {' '}— assesses product strategy, market size, traction evidence
                  </span>
                </li>
              </ul>
              <p className="text-[10px] text-white/40 pt-1">
                That is the intended format. Each row below carries the type and round actually
                recorded on the session, which is what was really booked.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0F1623] divide-y divide-white/5 overflow-hidden">
            {sessionsError ? (
              <div className="p-8 text-center text-xs text-rose-300">
                The interview ledger could not be loaded. An empty list here would be a fetch
                failure, not an empty schedule.
              </div>
            ) : sessionsLoading ? (
              <div className="p-12 text-center text-xs text-white/40">Loading the interview ledger…</div>
            ) : slotRows.length === 0 ? (
              <div className="p-12 text-center text-xs text-white/40">
                No session carries a {activeSlot.toLowerCase()} date. That is an empty slice of
                the calendar, not a statement about the candidates.
              </div>
            ) : (
              slotRows.map((int) => {
                const isSelected = selectedInterview?.id === int.id;

                return (
                  <div
                    key={int.id}
                    onClick={() => setSelectedId(int.id)}
                    className={cn(
                      'p-4 transition cursor-pointer flex items-center justify-between gap-4',
                      isSelected ? 'bg-indigo-600/10 border-l-4 border-indigo-500' : 'hover:bg-white/[0.02]'
                    )}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{int.candidateName}</span>
                        <span className="rounded bg-white/10 px-1.5 py-0.2 text-[10px] font-bold text-white/60">
                          {int.sector}
                        </span>
                      </div>
                      <p className="text-xs text-white/50">
                        Interviewer: <strong className="text-white/80">{int.interviewer}</strong>
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-indigo-300">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-3 w-3" />
                          {int.scheduledTime}
                        </span>
                        <span className="text-white/30">·</span>
                        <span className="text-white/55">{int.sessionLabel}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/45 block">
                        {int.statusLabel}
                      </span>
                      {int.turnCount !== null && (
                        <span className="text-[10px] text-white/40 block">
                          {int.turnCount} turn{int.turnCount === 1 ? '' : 's'} logged
                        </span>
                      )}
                      {int.preInterviewScore !== null ? (
                        <span className="text-xs font-black text-emerald-400 block">
                          Strength: {int.preInterviewScore}/100
                        </span>
                      ) : (
                        <span className="text-[10px] italic text-white/40 block">No screening score yet</span>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] text-indigo-300 hover:text-white mt-1"
                      >
                        Inspect →
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {unattributedSessions > 0 && (
            <p className="text-[10px] text-white/35 px-1">
              {unattributedSessions} session{unattributedSessions === 1 ? '' : 's'} in the ledger
              point at an application outside this program's loaded set, so they are not placed on
              this schedule.
            </p>
          )}

          {/* Sessions with no usable date, and candidates with no session at all.
              Neither can be bucketed by day without making a date up, so they sit
              apart from the schedule instead of being filed under one. */}
          {needsDateRows.length > 0 && (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 divide-y divide-white/5 overflow-hidden">
              <div className="px-4 py-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  Needs a date · {needsDateRows.length}
                </h4>
                <p className="text-[11px] text-white/50 mt-0.5">
                  Booking happens in the Interviews workspace — this view only reads the ledger.
                </p>
              </div>
              {needsDateRows.map((int) => (
                <button
                  key={int.id}
                  type="button"
                  onClick={() => setSelectedId(int.id)}
                  className={cn(
                    'w-full text-left px-4 py-3 flex items-center justify-between gap-4 transition',
                    selectedInterview?.id === int.id ? 'bg-amber-500/10' : 'hover:bg-white/[0.02]'
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">{int.candidateName}</div>
                    <div className="text-[11px] text-white/50">
                      {int.sessionId === null
                        ? 'No interview session exists for them yet'
                        : `Session #${int.sessionId} ${int.dateProblem}`}
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-amber-300 shrink-0">
                    {int.statusLabel}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Interview Intelligence Dossier (6 Cols) */}
        <div className="lg:col-span-6 rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-6 shadow-xl">
          <div className="flex flex-wrap gap-2">
            <div className="rounded-xl border border-white/10 bg-indigo-500/10 px-3 py-2 text-xs">
              <span className="text-xs font-bold uppercase text-white/50">Scheduled:</span>
              <span className="ml-1.5 text-sm font-extrabold text-indigo-300">{scheduledCount}</span>
            </div>
            <div className="rounded-xl border border-white/10 bg-emerald-500/10 px-3 py-2 text-xs">
              <span className="text-xs font-bold uppercase text-white/50">Completed:</span>
              <span className="ml-1.5 text-sm font-extrabold text-emerald-300">{completedCount}</span>
            </div>
            <div className="rounded-xl border border-white/10 bg-amber-500/10 px-3 py-2 text-xs">
              <span className="text-xs font-bold uppercase text-white/50">Not yet booked:</span>
              <span className="ml-1.5 text-sm font-extrabold text-amber-300">{unbookedCount}</span>
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                Interview Intelligence &amp; ML Analysis
              </span>
              <h3 className="text-lg font-bold text-white mt-0.5">
                {selectedInterview ? selectedInterview.candidateName : 'No Candidate Selected'}
              </h3>
              <p className="text-xs text-white/50">
                {selectedInterview
                  ? `${selectedInterview.sector} · ${selectedInterview.sessionLabel}`
                  : 'Select an interview session to inspect'}
              </p>
            </div>
            {selectedInterview && (
              <span
                className={cn(
                  'rounded border px-2 py-0.5 text-[10px] font-bold shrink-0',
                  selectedInterview.status === 'complete'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-white/5 text-white/50 border-white/15'
                )}
              >
                {selectedInterview.statusLabel}
              </span>
            )}
          </div>

          {!selectedInterview ? (
            <div className="p-8 text-center text-xs text-white/40">
              <Sparkles className="mx-auto h-8 w-8 text-indigo-400/30 mb-2" />
              <p className="font-semibold text-white/70">No interview selected</p>
              <p className="text-[11px] text-white/40 mt-1">
                Select a session from the ledger to view its review brief.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Screening fields, read off the application record */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                  <span className="text-[10px] text-white/40 uppercase font-semibold">Screening Tier</span>
                  <div className="text-xl font-black text-indigo-400">
                    {selectedInterview.tier ? `Tier ${selectedInterview.tier}` : 'Unrated'}
                  </div>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                  <span className="text-[10px] text-white/40 uppercase font-semibold">Inferred Stage</span>
                  <div className="text-sm font-black text-purple-300 mt-1.5">
                    {selectedInterview.inferredStage || 'No data yet'}
                  </div>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                  <span className="text-[10px] text-white/40 uppercase font-semibold">Evidence Level</span>
                  <div className="text-sm font-black text-emerald-400 mt-1.5">
                    {evidenceLevelShort(selectedInterview.evidenceConfidence)}
                  </div>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                  <span className="text-[10px] text-white/40 uppercase font-semibold">Claims</span>
                  <div className="text-xl font-black text-amber-300">
                    {selectedInterview.totalClaims ?? '—'}
                  </div>
                  <span className="text-[10px] text-white/40">
                    {selectedInterview.unverifiedClaims === null
                      ? 'not loaded'
                      : `${selectedInterview.unverifiedClaims} unverified`}
                  </span>
                </div>
              </div>

              {/* The transcript record, read off the session row itself. Counts
                  come from the server; an absent session says so rather than
                  reporting zero turns as if it had checked. */}
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Interview Intelligence
                  </span>
                  <span className="text-[10px] text-white/40 font-mono">Human review surface</span>
                </div>
                <p className="text-xs text-white/80">
                  {selectedInterview.sessionId === null ? (
                    'No interview session has been created for this candidate, so nothing has '
                    + 'been said on the record and there is no transcript to draw on. That is an '
                    + 'absence of evidence, not a finding about them.'
                  ) : selectedInterview.turnCount === null ? (
                    'This session row came back without a turn count, so nothing is said here '
                    + 'about what was or was not written down.'
                  ) : (
                    <>
                      {selectedInterview.turnCount} turn
                      {selectedInterview.turnCount === 1 ? '' : 's'} written down, and{' '}
                      {selectedInterview.claimsFromSession ?? 0} of them recorded by a reviewer
                      as something to verify. Turns are append-only and stamped by the server;
                      reading them stays with the panel.
                    </>
                  )}
                </p>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[10px] text-white/40">
                    Human reviews logged:{' '}
                    {selectedInterview.reviewerCount === null
                      ? '—'
                      : selectedInterview.reviewerCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => router.push(`/accelerator/interviews?app=${selectedInterview.applicationId}`)}
                    className="text-[10px] font-semibold text-indigo-300 underline-offset-2 hover:underline"
                  >
                    Open the transcript record
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    router.push(`/accelerator/applications/${selectedInterview.applicationId}?tab=evidence`);
                  }}
                  className="border-white/15 bg-white/5 text-white hover:bg-white/10 text-xs"
                >
                  View Evidence Graph
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    router.push(`/accelerator/applications/${selectedInterview.applicationId}`);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                >
                  <Vote className="h-3.5 w-3.5 mr-1" />
                  Open in Committee Review
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
