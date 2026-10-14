'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  Download,
  FileSearch,
  Loader2,
  MessageSquare,
  Search,
  ShieldCheck,
  UserRound,
  Vote,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import {
  acceleratorApi,
  type CandidateCard,
  type CommitteeBallot,
  type DecisionRoomCandidate,
} from '@/lib/acceleratorApi';
import { useActiveProgram } from '../ProgramContext';
import { useAuth } from '@/hooks/useAuth';
import {
  apiErrMessage,
  downloadCsv,
  evidenceLevel,
  isTerminal,
  qk,
  relativeTime,
  STATUS_LABELS,
  type EvidenceLevel,
} from '@/lib/screening';

// ── Helpers ──────────────────────────────────────────────────────────────────

function prettify(value?: string | null): string {
  if (!value) return '—';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusLabel(status: string): string {
  return (STATUS_LABELS as Record<string, string>)[status] ?? prettify(status);
}

function initials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

const TONE_CHIP: Record<EvidenceLevel['tone'], string> = {
  strong: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  moderate: 'bg-sky-50 text-sky-700 border-sky-200',
  limited: 'bg-amber-50 text-amber-700 border-amber-200',
  gap: 'bg-rose-50 text-rose-700 border-rose-200',
};

const VOTE_CHIP: Record<string, string> = {
  YES: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CONDITIONAL: 'bg-sky-50 text-sky-700 border-sky-200',
  PASS: 'bg-slate-100 text-slate-600 border-slate-200',
};

const STATUS_CHIP: Record<string, string> = {
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  contradicted: 'bg-rose-50 text-rose-700 border-rose-200',
  unverified: 'bg-amber-50 text-amber-700 border-amber-200',
  pending: 'bg-slate-100 text-slate-600 border-slate-200',
};

const chip = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold';
const panel = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const sectionTitle = 'text-sm font-black uppercase tracking-wider text-slate-700';

/** Evidence wording for a 0–100 signal. The ladder lives in @/lib/screening. */
function toneOf(score: number | null | undefined): EvidenceLevel | null {
  return evidenceLevel(score);
}

type TabId = 'overview' | 'evidence' | 'interviews' | 'dd' | 'committee';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'interviews', label: 'Interviews' },
  { id: 'dd', label: 'DD' },
  { id: 'committee', label: 'Committee' },
];

/** The slice of a react-query mutation this page hands down to the committee tab. */
interface RunMutation {
  isPending: boolean;
  mutate: () => void;
}

export default function DecisionRoomPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { activeProgram, activeProgramId } = useActiveProgram();
  const pid = activeProgramId ?? activeProgram?.id ?? null;

  const [selectedAppId, setSelectedAppId] = React.useState<number | null>(null);
  const [tab, setTab] = React.useState<TabId>('overview');
  const [railQuery, setRailQuery] = React.useState('');

  // The room is driven by the server-side selection summary: it walks every
  // application in the program (no 25-row page cap), ranks candidates with the
  // program's own Selection Framework weights, and carries each candidate's
  // ballot tally. The client derives no rankings and no tallies.
  const {
    data: room,
    isLoading,
    isError: roomError,
    error: roomErr,
  } = useQuery({
    queryKey: qk.decisionRoom(pid),
    queryFn: () => acceleratorApi.getDecisionRoom(pid as number),
    enabled: pid != null,
  });

  const rail = React.useMemo<DecisionRoomCandidate[]>(
    () => (room?.candidates ?? []).filter((c) => c.status === 'COMMITTEE_REVIEW'),
    [room]
  );

  const visibleRail = React.useMemo(() => {
    const q = railQuery.trim().toLowerCase();
    if (!q) return rail;
    return rail.filter(
      (c) => c.company_name.toLowerCase().includes(q) || (c.sector ?? '').toLowerCase().includes(q)
    );
  }, [rail, railQuery]);

  const { data: candidate, isLoading: cardLoading, isError: cardError } = useQuery({
    queryKey: qk.candidateCard(selectedAppId),
    queryFn: () => acceleratorApi.getCandidateCard(selectedAppId as number),
    enabled: selectedAppId != null,
  });

  // Auto-select the top-ranked candidate, and re-check whenever the rail
  // changes — a decided candidate leaves the rail and selection must follow.
  React.useEffect(() => {
    if (rail.length > 0 && (selectedAppId == null || !rail.some((c) => c.application_id === selectedAppId))) {
      setSelectedAppId(rail[0].application_id);
    }
  }, [rail, selectedAppId]);

  const selected = rail.find((c) => c.application_id === selectedAppId) ?? null;

  // Decision-authority guard: a terminal status already has its human decision
  // recorded — the room shows it read-only and never re-votes.
  const decided = selected ? isTerminal(selected.status) : false;

  // Committee state is read from the server tally, never recomputed here.
  const tally = candidate?.vote_tally ?? null;
  const ballots: CommitteeBallot[] = tally?.votes ?? [];
  const myBallot =
    user?.id != null ? ballots.find((v) => Number(v.voter_id) === Number(user.id)) ?? null : null;
  const quorumRequired = tally?.quorum_required ?? room?.ic_quorum?.min_votes ?? null;
  const quorumMet = tally?.quorum_met ?? null;
  const ballotsNeeded = quorumRequired == null ? 0 : Math.max(0, quorumRequired - (tally?.total_votes ?? 0));
  const finalizeBlocked = !decided && quorumMet === false;

  const refreshRoom = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.decisionRoom(pid) });
    if (selectedAppId != null) {
      queryClient.invalidateQueries({ queryKey: qk.candidateCard(selectedAppId) });
      queryClient.invalidateQueries({ queryKey: qk.appDetail(selectedAppId) });
    }
  }, [queryClient, pid, selectedAppId]);

  // Committee discussion: real ReviewComment rows. These never become reviewer
  // assessments and never touch quorum.
  const { data: commentRows = [], isLoading: commentsLoading } = useQuery({
    queryKey: selectedAppId != null ? qk.appComments(selectedAppId) : ['accelerator-app-comments', null],
    queryFn: () => acceleratorApi.getApplicationComments(selectedAppId as number).catch(() => []),
    enabled: selectedAppId != null,
  });
  const comments: any[] = Array.isArray(commentRows) ? commentRows : [];

  const [commentText, setCommentText] = React.useState('');
  const addCommentMutation = useMutation({
    mutationFn: () => acceleratorApi.addApplicationComment(selectedAppId as number, commentText.trim()),
    onSuccess: () => {
      toast({ title: 'Comment posted', description: 'Added to the committee discussion.', variant: 'success' });
      setCommentText('');
      if (selectedAppId != null) queryClient.invalidateQueries({ queryKey: qk.appComments(selectedAppId) });
    },
    onError: (err: unknown) => {
      toast({
        title: 'Comment failed',
        description: apiErrMessage(err, 'Could not post to the discussion.'),
        variant: 'error',
      });
    },
  });

  const [voteChoice, setVoteChoice] = React.useState<'YES' | 'CONDITIONAL' | 'PASS'>('YES');
  const [voteConviction, setVoteConviction] = React.useState(8);
  const [voteNotes, setVoteNotes] = React.useState('');
  const castVoteMutation = useMutation({
    mutationFn: () =>
      acceleratorApi.castCommitteeVote({
        application_id: selectedAppId as number,
        vote: voteChoice,
        conviction_score: voteConviction,
        notes: voteNotes.trim() || undefined,
      }),
    onSuccess: () => {
      toast({
        title: myBallot ? 'Vote updated' : 'Vote cast',
        description: `Your ballot is recorded for ${selected?.company_name ?? 'the candidate'}.`,
        variant: 'success',
      });
      setVoteNotes('');
      refreshRoom();
    },
    onError: (err: unknown) => {
      toast({
        title: 'Vote failed',
        description: apiErrMessage(err, 'Could not record your committee vote.'),
        variant: 'error',
      });
    },
  });

  // Final decision: a human committee action. The backend recomputes quorum
  // from stored ballots and refuses without it; the reason surfaces verbatim.
  const [decisionChoice, setDecisionChoice] = React.useState('ACCEPTED');
  const [decisionComment, setDecisionComment] = React.useState('');
  const [confirming, setConfirming] = React.useState(false);
  const decisionLabels: Record<string, string> = {
    ACCEPTED: 'Accept',
    REJECTED: 'Reject',
    WAITLISTED: 'Waitlist',
    DEFERRED: 'Defer',
  };
  const decisionMutation = useMutation({
    mutationFn: () =>
      acceleratorApi.recordCommitteeDecision(selectedAppId as number, {
        decision: decisionChoice,
        rationale: decisionComment.trim(),
      }),
    onSuccess: () => {
      toast({
        title: 'Decision recorded',
        description: `${selected?.company_name ?? 'Candidate'} — committee decision saved: ${decisionLabels[decisionChoice]}.`,
        variant: 'success',
      });
      setConfirming(false);
      setDecisionComment('');
      queryClient.invalidateQueries({ queryKey: qk.applications(pid) });
      queryClient.invalidateQueries({ queryKey: qk.screeningSummary(pid) });
      refreshRoom();
    },
    onError: (err: unknown) => {
      toast({
        title: 'Decision failed',
        description: apiErrMessage(err, 'Only committee members can record decisions on this application.'),
        variant: 'error',
      });
    },
  });

  // Final Select List: accepted candidates straight off the server shortlist.
  const [selectListOpen, setSelectListOpen] = React.useState(false);
  const acceptedRows = React.useMemo(
    () => (room?.candidates ?? []).filter((c) => c.status === 'ACCEPTED'),
    [room]
  );

  const exportSelectList = () => {
    downloadCsv(
      'final-select-list.csv',
      ['Company', 'Sector', 'Stage', 'Framework Score', 'Decision Date', 'Decided By'],
      acceptedRows.map((c) => [
        c.company_name,
        c.sector || '—',
        c.stage || '—',
        String(Math.round(c.weighted_score)),
        c.final_decision ? new Date(c.final_decision.decided_at).toLocaleDateString() : '—',
        c.final_decision?.decided_by || '—',
      ])
    );
    toast({
      title: 'Select list downloaded',
      description: `${acceptedRows.length} accepted companies exported.`,
      variant: 'success',
    });
  };

  const selectedIndex = selected ? rail.findIndex((c) => c.application_id === selected.application_id) : -1;
  const goTo = (offset: number) => {
    if (rail.length === 0) return;
    const next = (selectedIndex + offset + rail.length) % rail.length;
    setSelectedAppId(rail[next].application_id);
  };

  // Risk is routed by the server for the whole candidate list — the room never
  // recomputes it, and an absent block reads as "no signal", not "low risk".
  const risk = selected?.risk ?? null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl lg:text-3xl font-black tracking-tight">Decision Room</h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-indigo-600/10 text-indigo-700 border border-indigo-500/20">
              Investment Committee
            </span>
          </div>
          <p className="text-sm text-slate-500 max-w-2xl">
            Guided final-round workflow for {activeProgram?.name ?? 'the active program'}. Every decision
            below is a human committee action recorded against the real application pipeline — the
            screening engine supplies evidence, never a verdict.
          </p>
        </div>
        {room && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-xs shadow-sm">
            <div className="px-2 text-center">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Finalists</span>
              <span className="text-sm font-black text-slate-900">{room.funnel.committee}</span>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="px-2 text-center">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Accepted</span>
              <span className="text-sm font-black text-emerald-600">{room.funnel.accepted}</span>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="px-2 text-center">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Target Seats</span>
              <span className="text-sm font-black text-indigo-600">{room.target_cohort_size}</span>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <Button size="sm" variant="outline" onClick={() => setSelectListOpen(true)}>
              <ClipboardList className="h-3.5 w-3.5 text-indigo-600" />
              Final Selection ({acceptedRows.length})
            </Button>
          </div>
        )}
      </div>

      {pid == null ? (
        <div className={cn(panel, 'text-sm text-slate-500')}>
          Select an active program to open the decision room.
        </div>
      ) : isLoading ? (
        <div className={cn(panel, 'flex items-center gap-3 text-sm text-slate-500')}>
          <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
          Loading committee candidates…
        </div>
      ) : roomError || !room ? (
        <div className={cn(panel, 'text-sm text-rose-700')}>
          The committee shortlist could not be loaded.{' '}
          <span className="text-slate-500">{apiErrMessage(roomErr, 'Request failed.')}</span>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] items-start">
          {/* ── LEFT: candidate rail ─────────────────────────────────────────── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm space-y-2">
            <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Candidates · {rail.length}
            </p>
            <label className="relative block">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={railQuery}
                onChange={(e) => setRailQuery(e.target.value)}
                placeholder="Search candidates…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
              />
            </label>

            {rail.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-slate-400">
                No applications are in committee review yet. Candidates reach this room from the
                pipeline&apos;s final round.
              </p>
            )}
            {rail.length > 0 && visibleRail.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-slate-400">
                No candidate matches “{railQuery.trim()}”.
              </p>
            )}

            {visibleRail.map((c) => {
              const tone = toneOf(c.evidence_confidence_score);
              const active = c.application_id === selectedAppId;
              return (
                <button
                  key={c.application_id}
                  type="button"
                  onClick={() => setSelectedAppId(c.application_id)}
                  className={cn(
                    'w-full rounded-xl border px-3 py-2.5 text-left transition-colors',
                    active ? 'border-indigo-200 bg-indigo-50' : 'border-transparent hover:bg-slate-50'
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[11px] font-black text-slate-600">
                      {initials(c.company_name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-bold">{c.company_name}</span>
                        {c.votes.total_votes > 0 && (
                          <span
                            className="ml-auto shrink-0 rounded-full bg-indigo-600/10 px-1.5 py-0.5 text-[10px] font-black text-indigo-700"
                            title={`${c.votes.total_votes} committee ballot${c.votes.total_votes === 1 ? '' : 's'} cast`}
                          >
                            {c.votes.total_votes}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-slate-500">
                        {[c.sector, prettify(c.stage)].filter(Boolean).join(' · ') || '—'}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {c.mean_human_conviction != null ? (
                          <span
                            className="rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] font-bold text-indigo-700"
                            title={`Mean of ${c.reviewer_count} human conviction score${c.reviewer_count === 1 ? '' : 's'} (1–10)`}
                          >
                            {c.mean_human_conviction.toFixed(1)}
                          </span>
                        ) : (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
                            No scorecard yet
                          </span>
                        )}
                        {tone && (
                          <span className={cn(chip, 'px-1.5 py-0.5 text-[10px]', TONE_CHIP[tone.tone])} title={tone.label}>
                            {tone.label}
                          </span>
                        )}
                        {c.contradicted_claims > 0 && (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                            {c.contradicted_claims} contradicted
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">
                        Framework score {Math.round(c.weighted_score)}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── RIGHT: selected candidate ────────────────────────────────────── */}
          <div className="space-y-4">
            {selected == null ? (
              <div className={cn(panel, 'text-sm text-slate-500')}>
                Select a candidate to begin the committee review.
              </div>
            ) : (
              <>
                {/* Candidate header */}
                <div className={cn(panel, 'space-y-2')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-black tracking-tight">{selected.company_name}</h2>
                    <span className={cn(chip, 'border-slate-200 bg-slate-50 text-slate-600')}>
                      {statusLabel(selected.status)}
                    </span>
                    <span className={cn(chip, 'border-slate-200 bg-slate-50 text-slate-600')}>
                      Tier {selected.tier || '—'}
                    </span>
                    {risk && risk.level !== 'Low' && (
                      <span
                        className={cn(
                          chip,
                          risk.level === 'High'
                            ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700'
                        )}
                        title={risk.reasons.join('; ')}
                      >
                        {risk.level} evidence risk
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-2 text-xs">
                      {selected.mean_human_conviction != null ? (
                        <span title="Mean of human reviewer conviction scores (1–10)">
                          <span className="font-bold text-indigo-700">{selected.mean_human_conviction.toFixed(1)}</span>
                          <span className="text-slate-400"> / 10 committee rating</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">No human scorecard filed yet</span>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {`Application #${selected.application_id} · `}
                    {selected.submitted_at
                      ? `submitted ${relativeTime(selected.submitted_at)}`
                      : 'never marked submitted'}
                    {risk && risk.reasons.length > 0 ? ` · risk signals: ${risk.reasons.join(' · ')}` : ''}
                  </p>
                </div>

                {/* Tabs */}
                <div className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTab(t.id)}
                      className={cn(
                        'rounded-xl px-3 py-1.5 text-xs font-bold transition-colors',
                        tab === t.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      {t.label}
                      {t.id === 'committee' && selected.votes.total_votes > 0 && (
                        <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-black">
                          {selected.votes.total_votes}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {cardLoading || !candidate ? (
                  <div className={cn(panel, 'flex items-center gap-3 text-sm')}>
                    {cardError ? (
                      <span className="text-rose-700">
                        This candidate&apos;s dossier could not be loaded — the committee can only act on
                        candidates whose evidence is readable.
                      </span>
                    ) : (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                        <span className="text-slate-500">Loading candidate dossier…</span>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    {tab === 'overview' && <OverviewTab candidate={candidate} />}
                    {tab === 'evidence' && <EvidenceTab candidate={candidate} />}
                    {tab === 'interviews' && <InterviewsTab candidate={candidate} />}
                    {tab === 'dd' && <DiligenceTab candidate={candidate} />}
                    {tab === 'committee' && (
                      <CommitteeTab
                        candidate={candidate}
                        decided={decided}
                        myBallot={myBallot}
                        quorumRequired={quorumRequired}
                        finalizeBlocked={finalizeBlocked}
                        ballotsNeeded={ballotsNeeded}
                        voteChoice={voteChoice}
                        setVoteChoice={setVoteChoice}
                        voteConviction={voteConviction}
                        setVoteConviction={setVoteConviction}
                        voteNotes={voteNotes}
                        setVoteNotes={setVoteNotes}
                        castVoteMutation={castVoteMutation}
                        comments={comments}
                        commentsLoading={commentsLoading}
                        commentText={commentText}
                        setCommentText={setCommentText}
                        addCommentMutation={addCommentMutation}
                        decisionChoice={decisionChoice}
                        setDecisionChoice={setDecisionChoice}
                        decisionComment={decisionComment}
                        setDecisionComment={setDecisionComment}
                        confirming={confirming}
                        setConfirming={setConfirming}
                        decisionMutation={decisionMutation}
                        decisionLabels={decisionLabels}
                      />
                    )}
                  </>
                )}

                {/* Footer navigation */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => goTo(-1)} disabled={rail.length < 2}>
                      <ArrowLeft className="h-3.5 w-3.5" /> Back
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => goTo(1)} disabled={rail.length < 2}>
                      Next Candidate <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Link
                    href={`/accelerator/applications/${selected.application_id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:border-indigo-200 hover:text-indigo-700"
                  >
                    <FileSearch className="h-3.5 w-3.5" />
                    Open Application 360
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Final Select List modal ─────────────────────────────────────────── */}
      {selectListOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close select list"
            onClick={() => setSelectListOpen(false)}
            className="absolute inset-0 bg-slate-900/40"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-2xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">
                  Final Select List · {acceptedRows.length}
                </h3>
                <p className="text-[11px] text-slate-400">
                  Every application this program has accepted, read from the server shortlist.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectListOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {acceptedRows.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                No acceptances recorded yet in {activeProgram?.name ?? 'this program'}.
              </p>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3 font-bold">Company</th>
                      <th className="py-2 pr-3 font-bold">Sector</th>
                      <th className="py-2 pr-3 font-bold">Score</th>
                      <th className="py-2 pr-3 font-bold">Decided</th>
                      <th className="py-2 font-bold">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {acceptedRows.map((c) => (
                      <tr key={c.application_id}>
                        <td className="py-2 pr-3 font-bold text-slate-900">{c.company_name}</td>
                        <td className="py-2 pr-3 text-xs text-slate-600">{c.sector || '—'}</td>
                        <td className="py-2 pr-3 text-xs text-slate-600">{Math.round(c.weighted_score)}</td>
                        <td className="py-2 pr-3 text-xs text-slate-600">
                          {c.final_decision ? new Date(c.final_decision.decided_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-2 text-xs text-slate-600">{c.final_decision?.decided_by || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectListOpen(false)}>
                Close
              </Button>
              <Button
                size="sm"
                onClick={exportSelectList}
                disabled={acceptedRows.length === 0}
                className="bg-indigo-600 text-white hover:bg-indigo-500"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Overview — the program's own Selection Framework rows ────────────────

function OverviewTab({ candidate }: { candidate: CandidateCard }) {
  const dims = candidate.dimension_scores ?? [];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className={cn(panel, 'space-y-3')}>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-indigo-600" />
          <h3 className={sectionTitle}>Overall Assessment</h3>
        </div>
        <p className="text-[11px] text-slate-400">
          These rows are this program&apos;s Selection Framework dimensions, with stage/sector-adjusted
          weights computed on the server. Each chip states how well-evidenced a dimension is — it is
          never a verdict on the company.
        </p>
        {dims.length === 0 ? (
          <p className="text-xs text-slate-400">
            This program has no scoring dimensions configured, so there is nothing to show.
          </p>
        ) : (
          <div className="space-y-1.5">
            {dims.map((d) => {
              const tone = toneOf(d.score);
              return (
                <div
                  key={d.name}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <span className="block text-xs font-bold text-slate-800">{d.label}</span>
                    <span className="block text-[10px] text-slate-400">
                      Weight {Math.round(d.weight * 100)}%
                      {d.description ? ` · ${d.description}` : ''}
                    </span>
                  </div>
                  {tone ? (
                    <span
                      className={cn(chip, 'shrink-0', TONE_CHIP[tone.tone])}
                      title={`${Math.round(d.score)}/100 evidence signal`}
                    >
                      {tone.label}
                    </span>
                  ) : (
                    <span className={cn(chip, 'shrink-0 border-slate-200 bg-white text-slate-400')}>No data</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className={cn(panel, 'space-y-3')}>
          <h3 className={sectionTitle}>Screening Signals</h3>
          <p className="text-[11px] text-slate-400">
            Produced by the ML screening engine. They inform the committee; they do not decide.
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Signal label="Framework score" value={candidate.scores.weighted_score} />
            <Signal label="Program fit" value={candidate.scores.program_fit_score} />
            <Signal label="Startup strength" value={candidate.scores.startup_strength_score} />
            <Signal label="Evidence confidence" value={candidate.scores.evidence_confidence_score} />
          </div>
          <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Screening recommendation
            </p>
            <p className="text-xs font-bold text-slate-900">
              {prettify(candidate.assessment.overall_recommendation)}
              {candidate.assessment.recommendation_confidence
                ? ` · ${Math.round(candidate.assessment.recommendation_confidence * 100)}% confidence`
                : ''}
            </p>
            <p className="text-xs text-slate-600">
              {candidate.assessment.recommendation_reasoning ||
                'No reasoning was recorded with this screening run.'}
            </p>
          </div>
        </div>

        <div className={cn(panel, 'space-y-3')}>
          <h3 className={sectionTitle}>Case For &amp; Against</h3>
          {candidate.assessment.bull_case.length === 0 &&
          candidate.assessment.bear_case.length === 0 &&
          candidate.assessment.risk_flags.length === 0 ? (
            <p className="text-xs text-slate-400">
              The screening engine recorded no cases or flags for this candidate.
            </p>
          ) : (
            <>
              <CaseList title="Bull case" items={candidate.assessment.bull_case} tone="emerald" />
              <CaseList title="Bear case" items={candidate.assessment.bear_case} tone="rose" />
              <CaseList title="Risk flags" items={candidate.assessment.risk_flags} tone="amber" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Signal({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-sm font-black text-slate-900">{value == null ? '—' : Math.round(value)}</p>
    </div>
  );
}

function CaseList({
  title,
  items,
  tone,
}: {
  title: string;
  items: any[];
  tone: 'emerald' | 'rose' | 'amber';
}) {
  const list = (items ?? [])
    .map((i) => (typeof i === 'string' ? i : String(i?.point ?? i?.label ?? '')).trim())
    .filter(Boolean);
  if (list.length === 0) return null;
  const cls = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    rose: 'border-rose-200 bg-rose-50 text-rose-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
  }[tone];
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</p>
      <ul className="space-y-1">
        {list.map((t, i) => (
          <li key={`${title}-${i}`} className={cn('rounded-lg border px-3 py-1.5 text-xs', cls)}>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Tab: Evidence ─────────────────────────────────────────────────────────────

function EvidenceTab({ candidate }: { candidate: CandidateCard }) {
  const claims = candidate.claims ?? [];
  return (
    <div className={cn(panel, 'space-y-3')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={sectionTitle}>Claim Ledger · {claims.length}</h3>
        <Link
          href="/accelerator/due-diligence"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
        >
          <FileSearch className="h-3.5 w-3.5" />
          Due Diligence workspace
        </Link>
      </div>
      <p className="text-[11px] text-slate-400">
        Every material claim extracted from the application, with the verification state stored against
        it. Unverified is not the same as false — it means nobody has checked yet.
      </p>
      {claims.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
          No claims have been extracted from this application, so there is nothing to verify.
        </p>
      ) : (
        <ul className="space-y-2">
          {claims.map((c) => (
            <li key={c.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn(chip, STATUS_CHIP[c.verification_status] ?? 'border-slate-200 bg-slate-100 text-slate-600')}>
                  {prettify(c.verification_status)}
                </span>
                <span className="text-[11px] font-semibold text-slate-500">{prettify(c.category)}</span>
                <span className="text-[11px] text-slate-400">Materiality: {prettify(c.materiality)}</span>
                {c.confidence > 0 && (
                  <span className="text-[11px] text-slate-400">Confidence {Math.round(c.confidence * 100)}%</span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-700">{c.claim_text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Tab: Interviews ───────────────────────────────────────────────────────────

function InterviewsTab({ candidate }: { candidate: CandidateCard }) {
  const interviews = candidate.interviews ?? [];
  return (
    <div className={cn(panel, 'space-y-3')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={sectionTitle}>Interview Record · {interviews.length}</h3>
        <Link
          href="/accelerator/interviews"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
        >
          Interview workspace
        </Link>
      </div>
      {interviews.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
          No interview has been held with this founder, so there are no notes here. A candidate can
          reach the committee without one — the room records that fact rather than hiding it.
        </p>
      ) : (
        <div className="space-y-2">
          {interviews.map((iv) => (
            <div key={iv.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold">{prettify(iv.interview_type)}</span>
                {iv.round_number ? <span className="text-[11px] text-slate-500">Round {iv.round_number}</span> : null}
                <span className={cn(chip, 'border-slate-200 bg-white text-slate-600')}>{statusLabel(iv.status)}</span>
                {iv.scheduled_at && (
                  <span className="text-[11px] text-slate-400">{new Date(iv.scheduled_at).toLocaleString()}</span>
                )}
                {iv.overall_score != null && (
                  <span className="text-[11px] text-slate-500">
                    Score: <span className="font-bold text-slate-700">{iv.overall_score}</span>
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-600">
                {iv.notes?.trim() ? iv.notes : 'The interview was held without written notes.'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: DD ───────────────────────────────────────────────────────────────────

function DiligenceTab({ candidate }: { candidate: CandidateCard }) {
  const requests = candidate.evidence_requests ?? [];
  const claims = candidate.claims ?? [];
  const outstanding = claims.filter(
    (c) => c.verification_status === 'unverified' || c.verification_status === 'pending'
  );
  const contradicted = claims.filter((c) => c.verification_status === 'contradicted');

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className={cn(panel, 'space-y-3')}>
        <h3 className={sectionTitle}>Evidence Requests · {requests.length}</h3>
        <p className="text-[11px] text-slate-400">
          Loop-back requests sent to the founder. Status is stored on the request, not inferred here.
        </p>
        {requests.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
            No evidence has been requested from this founder yet.
          </p>
        ) : (
          <div className="space-y-2">
            {requests.map((er) => (
              <div key={er.id} className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn(chip, STATUS_CHIP.pending)}>{prettify(er.status)}</span>
                  <span className="text-[11px] text-slate-500">by {er.requested_by || '—'}</span>
                  <span className="text-[10px] text-slate-400">{relativeTime(er.created_at)}</span>
                  {er.response_deadline && (
                    <span className="text-[10px] text-slate-400">
                      due {new Date(er.response_deadline).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                  {(er.requested_items ?? []).map((item: any, i: number) => (
                    <li key={`${er.id}-${i}`}>
                      • {typeof item === 'string' ? item : String(item?.description ?? item?.type ?? '—')}
                      {item?.required ? ' (required)' : ''}
                    </li>
                  ))}
                </ul>
                {er.founder_response?.trim() && (
                  <p className="text-xs text-slate-600">Founder response: {er.founder_response}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={cn(panel, 'space-y-3')}>
        <h3 className={sectionTitle}>Open Diligence Items</h3>
        <p className="text-[11px] text-slate-400">
          Claims still awaiting verification, and claims that contradict one another.
        </p>
        {contradicted.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
              Contradicted · {contradicted.length}
            </p>
            {contradicted.map((c) => (
              <p key={c.id} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-800">
                {c.claim_text}
              </p>
            ))}
          </div>
        )}
        {outstanding.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
              Unverified · {outstanding.length}
            </p>
            {outstanding.map((c) => (
              <p key={c.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
                {c.claim_text}
              </p>
            ))}
          </div>
        )}
        {contradicted.length === 0 && outstanding.length === 0 && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-4 text-center text-xs text-emerald-800">
            Every extracted claim on this application has been verified.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Tab: Committee — scorecards, ballots, discussion, decision ────────────────

interface CommitteeTabProps {
  candidate: CandidateCard;
  decided: boolean;
  myBallot: CommitteeBallot | null;
  quorumRequired: number | null;
  finalizeBlocked: boolean;
  ballotsNeeded: number;
  voteChoice: 'YES' | 'CONDITIONAL' | 'PASS';
  setVoteChoice: (v: 'YES' | 'CONDITIONAL' | 'PASS') => void;
  voteConviction: number;
  setVoteConviction: (n: number) => void;
  voteNotes: string;
  setVoteNotes: (s: string) => void;
  castVoteMutation: RunMutation;
  comments: any[];
  commentsLoading: boolean;
  commentText: string;
  setCommentText: (s: string) => void;
  addCommentMutation: RunMutation;
  decisionChoice: string;
  setDecisionChoice: (s: string) => void;
  decisionComment: string;
  setDecisionComment: (s: string) => void;
  confirming: boolean;
  setConfirming: (b: boolean) => void;
  decisionMutation: RunMutation;
  decisionLabels: Record<string, string>;
}

function CommitteeTab(p: CommitteeTabProps) {
  const { candidate } = p;
  const tally = candidate.vote_tally;
  const scorecards = candidate.reviewers ?? [];
  const recorded = candidate.committee_decisions[candidate.committee_decisions.length - 1] ?? null;

  return (
    <div className="space-y-4">
      {/* Human scorecards */}
      <div className={cn(panel, 'space-y-3')}>
        <div className="flex items-center gap-2">
          <UserRound className="h-4 w-4 text-indigo-600" />
          <h3 className={sectionTitle}>Reviewer Scorecards</h3>
          <span className="text-[11px] text-slate-400">
            · {scorecards.length} filed · assessments, not ballots
          </span>
        </div>
        {scorecards.length === 0 ? (
          <p className="text-xs text-slate-400">
            No reviewer has filed a scorecard for this candidate. The committee can still vote, but
            nothing here would be backed by a written human assessment.
          </p>
        ) : (
          <div className="space-y-2">
            {scorecards.map((r) => (
              <div key={r.reviewer_id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold">{r.reviewer_name || `Reviewer #${r.reviewer_id}`}</span>
                  <span className={cn(chip, 'border-slate-200 bg-white text-slate-600')}>{prettify(r.recommendation)}</span>
                  <span className="text-[11px] text-slate-500">
                    Conviction: <span className="font-bold text-slate-700">{r.overall_conviction}/10</span>
                  </span>
                  {r.submitted_at && <span className="text-[10px] text-slate-400">{relativeTime(r.submitted_at)}</span>}
                </div>
                <p className="mt-1 text-xs text-slate-600">{r.notes?.trim() ? r.notes : 'Scored without a written note.'}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ballots */}
      <div className={cn(panel, 'space-y-3')}>
        <div className="flex items-center gap-2">
          <Vote className="h-4 w-4 text-indigo-600" />
          <h3 className={sectionTitle}>Committee Ballots</h3>
          <span className="text-[11px] text-slate-400">
            · {tally.total_votes} {tally.total_votes === 1 ? 'ballot' : 'ballots'}
          </span>
        </div>

        {p.quorumRequired == null ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            Quorum requirement is unavailable — decisions are still validated server-side.
          </p>
        ) : tally.quorum_met ? (
          <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
            <Check className="h-3.5 w-3.5" />
            Quorum met · {tally.total_votes} of {tally.quorum_required} distinct ballots recorded.
          </p>
        ) : (
          <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            Quorum not met · {tally.total_votes}/{tally.quorum_required} distinct ballots — {p.ballotsNeeded} more{' '}
            {p.ballotsNeeded === 1 ? 'ballot is' : 'ballots are'} needed before a decision can be recorded.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <span className={cn(chip, VOTE_CHIP.YES)}>Yes · {tally.yes}</span>
          <span className={cn(chip, VOTE_CHIP.CONDITIONAL)}>Conditional · {tally.conditional}</span>
          <span className={cn(chip, VOTE_CHIP.PASS)}>Pass · {tally.pass}</span>
        </div>

        <div className="space-y-2">
          {tally.total_votes === 0 && (
            <p className="text-xs text-slate-400">No committee ballots cast yet for this candidate.</p>
          )}
          {tally.votes.map((v, i) => (
            <div key={v.voter_id ?? `ballot-${i}`} className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] font-black text-slate-600">
                {initials(v.voter_name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold">
                    {v.voter_name || `Reviewer #${v.voter_id}`}
                    {p.myBallot?.voter_id === v.voter_id && (
                      <span className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-600">· you</span>
                    )}
                  </span>
                  <span className={cn(chip, VOTE_CHIP[v.vote] ?? VOTE_CHIP.PASS)}>{prettify(v.vote)}</span>
                  <span className="text-[11px] text-slate-500">
                    Conviction: <span className="font-bold text-slate-700">{v.conviction_score}/10</span>
                  </span>
                  {v.timestamp && (
                    <span className="text-[10px] text-slate-400">{relativeTime(String(v.timestamp))}</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-600">{v.notes?.trim() ? v.notes : 'Cast without a note.'}</p>
              </div>
            </div>
          ))}
        </div>

        {p.decided ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            Voting closed — a final decision is already recorded for this candidate.
          </p>
        ) : (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex flex-wrap gap-2">
              {(['YES', 'CONDITIONAL', 'PASS'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => p.setVoteChoice(opt)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors',
                    p.voteChoice === opt
                      ? opt === 'YES'
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : opt === 'CONDITIONAL'
                          ? 'border-sky-600 bg-sky-600 text-white'
                          : 'border-slate-700 bg-slate-700 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  )}
                >
                  {opt === 'YES' ? 'Yes — accept' : opt === 'CONDITIONAL' ? 'Conditional' : 'Pass'}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
              <label className="space-y-1">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Conviction (1–10)
                </span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={p.voteConviction}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) p.setVoteConviction(Math.max(1, Math.min(10, Math.round(n))));
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Note (optional)
                </span>
                <input
                  type="text"
                  placeholder="What tipped your ballot…"
                  value={p.voteNotes}
                  onChange={(e) => p.setVoteNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="max-w-xs text-[10px] text-slate-400">
                Your ballot is a human vote recorded against this application. Casting again replaces your
                previous vote — the tally always counts one vote per member.
              </p>
              <Button
                size="sm"
                disabled={p.castVoteMutation.isPending}
                loading={p.castVoteMutation.isPending}
                onClick={() => p.castVoteMutation.mutate()}
                className="bg-indigo-600 text-white hover:bg-indigo-500"
              >
                {p.myBallot ? 'Replace your ballot' : 'Cast vote'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Discussion */}
      <div className={cn(panel, 'space-y-3')}>
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-indigo-600" />
          <h3 className={sectionTitle}>Committee Discussion</h3>
          <span className="text-[11px] text-slate-400">
            · {p.comments.length} {p.comments.length === 1 ? 'comment' : 'comments'} · discussion only, not a review
          </span>
        </div>
        <div className="space-y-2">
          {p.commentsLoading ? (
            <p className="text-xs text-slate-400">Loading discussion…</p>
          ) : p.comments.length === 0 ? (
            <p className="text-xs text-slate-400">No discussion comments yet — add context below.</p>
          ) : (
            p.comments.map((c: any, i: number) => {
              const name = String(c?.author ?? 'Reviewer');
              return (
                <div key={c?.id ?? `cmt-${i}`} className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] font-black text-slate-600">
                    {initials(name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold">{name || 'Reviewer'}</span>
                      <span className="text-[10px] text-slate-400">{relativeTime(c?.created_at)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{String(c?.body ?? '')}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <textarea
            rows={2}
            placeholder="Add context for the committee…"
            value={p.commentText}
            onChange={(e) => p.setCommentText(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="max-w-xs text-[10px] text-slate-400">
              Comments are discussion context only — they are not reviewer assessments and do not count
              toward quorum.
            </p>
            <Button
              size="sm"
              disabled={!p.commentText.trim() || p.addCommentMutation.isPending || p.decided}
              loading={p.addCommentMutation.isPending}
              onClick={() => p.addCommentMutation.mutate()}
              className="bg-indigo-600 text-white hover:bg-indigo-500"
            >
              Post to discussion
            </Button>
          </div>
        </div>
      </div>

      {/* Final decision */}
      <div className={cn(panel, 'space-y-3')}>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-indigo-600" />
          <h3 className={sectionTitle}>Final Decision</h3>
          {p.decided && (
            <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              Decided · read-only
            </span>
          )}
        </div>

        {p.decided ? (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-bold text-slate-900">Recorded decision: {statusLabel(candidate.status)}</p>
            {recorded?.notes ? (
              <p className="text-xs text-slate-600">{recorded.notes}</p>
            ) : (
              <p className="text-xs text-slate-400">No written rationale was recorded with this decision.</p>
            )}
            {recorded && (
              <p className="text-[11px] text-slate-400">
                {recorded.decided_by || 'System'} · {relativeTime(recorded.decided_at)}
              </p>
            )}
            <p className="text-[11px] text-slate-400">
              This application has already left the active pool — the committee acts only on undecided
              candidates, and a screening suggestion never stands in place of a human decision here.
            </p>
          </div>
        ) : !p.confirming ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Decision</label>
                <select
                  value={p.decisionChoice}
                  onChange={(e) => p.setDecisionChoice(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="ACCEPTED">Accept into cohort</option>
                  <option value="REJECTED">Reject</option>
                  <option value="WAITLISTED">Waitlist</option>
                  <option value="DEFERRED">Defer to next cohort</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Comment (optional)
                </label>
                <input
                  type="text"
                  placeholder="Rationale recorded with the committee decision…"
                  value={p.decisionComment}
                  onChange={(e) => p.setDecisionComment(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {p.finalizeBlocked ? (
                <p className="text-[11px] font-semibold text-amber-700">
                  Recording is blocked until quorum: {p.ballotsNeeded} more{' '}
                  {p.ballotsNeeded === 1 ? 'ballot is' : 'ballots are'} needed.
                </p>
              ) : (
                <span />
              )}
              <Button
                size="sm"
                disabled={p.finalizeBlocked}
                onClick={() => p.setConfirming(true)}
                className="bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-slate-300"
              >
                Confirm decision
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
            <p className="text-sm font-bold">
              Record {p.decisionLabels[p.decisionChoice]} for {candidate.company_name}?
            </p>
            <p className="text-xs text-slate-500">
              This is a human committee decision on the live pipeline
              {p.decisionComment.trim() ? ` with rationale: “${p.decisionComment.trim()}”` : ''}.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => p.setConfirming(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={p.finalizeBlocked}
                loading={p.decisionMutation.isPending}
                onClick={() => p.decisionMutation.mutate()}
                className={cn(
                  'text-white',
                  p.decisionChoice === 'REJECTED' ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'
                )}
              >
                <Check className="h-3.5 w-3.5" />
                Confirm &amp; record decision
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
