'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ShieldCheck,
  Clock,
  HelpCircle,
  CheckCircle2,
  XCircle,
  Minus,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

interface CommitteeWorkspaceProps {
  selectedAppId: number | null;
  applicationDetail: any;
  onCastVote: (
    vote: 'YES' | 'CONDITIONAL' | 'PASS',
    conviction: number,
    notes: string
  ) => void;
  onFinalizeDecision: (
    decision: 'ACCEPTED' | 'REJECTED' | 'WAITLISTED',
    notes: string
  ) => void;
  onRequestEvidence: () => void;
}

const VOTE_CONFIG = {
  YES: {
    label: 'Yes (Conviction)',
    active: 'border-emerald-500 bg-emerald-500/10 text-emerald-400',
    badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  CONDITIONAL: {
    label: 'Conditional',
    active: 'border-amber-500 bg-amber-500/10 text-amber-400',
    badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    icon: <Minus className="w-3.5 h-3.5" />,
  },
  PASS: {
    label: 'Pass',
    active: 'border-rose-500 bg-rose-500/10 text-rose-400',
    badge: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
} as const;

// Decisions that need a confirmation step before executing
const DECISION_LABELS: Record<'ACCEPTED' | 'REJECTED' | 'WAITLISTED', string> = {
  ACCEPTED: 'Accept into Cohort',
  REJECTED: 'Pass (Reject)',
  WAITLISTED: 'Waitlist',
};

const DECISION_CONFIRM_MESSAGES: Record<'ACCEPTED' | 'REJECTED' | 'WAITLISTED', string> = {
  ACCEPTED: 'This will accept the startup into the cohort and create a program membership. Confirm?',
  REJECTED: 'This will permanently reject this application. This action is hard to reverse. Confirm?',
  WAITLISTED: 'This will move the startup to the waitlist. Confirm?',
};

export function CommitteeWorkspace({
  selectedAppId,
  applicationDetail,
  onCastVote,
  onFinalizeDecision,
  onRequestEvidence,
}: CommitteeWorkspaceProps) {
  const [committeeVote, setCommitteeVote] = React.useState<'YES' | 'CONDITIONAL' | 'PASS'>('YES');
  const [committeeConviction, setCommitteeConviction] = React.useState<number>(7);
  const [committeeNotes, setCommitteeNotes] = React.useState<string>('');

  // ── Confirmation state for destructive finalize actions ───────────────────
  const [pendingDecision, setPendingDecision] = React.useState<
    'ACCEPTED' | 'REJECTED' | 'WAITLISTED' | null
  >(null);

  // Reset confirmation state when the selected application changes so
  // a half-completed confirmation on App A doesn't carry over to App B.
  React.useEffect(() => {
    setPendingDecision(null);
  }, [applicationDetail?.id]);

  const handleFinalizeClick = (decision: 'ACCEPTED' | 'REJECTED' | 'WAITLISTED') => {
    // First click → enter confirmation mode
    setPendingDecision(decision);
  };

  const confirmFinalize = () => {
    if (!pendingDecision) return;
    onFinalizeDecision(pendingDecision, committeeNotes);
    setPendingDecision(null);
  };

  const cancelFinalize = () => setPendingDecision(null);

  const companyName = applicationDetail?.company_name ?? 'Select Applicant';

  // ── Real vote data from applicationDetail ─────────────────────────────────
  const committeeDecision = applicationDetail?.committee_decision ?? null;
  const voteSummary: { yes?: number; conditional?: number; pass?: number } =
    committeeDecision?.vote_summary ?? {};
  const yesCount = voteSummary.yes ?? 0;
  const conditionalCount = voteSummary.conditional ?? 0;
  const passCount = voteSummary.pass ?? 0;
  const totalVotes = yesCount + conditionalCount + passCount;

  const individualVotes: Array<{
    voter_name?: string;
    voter_email?: string;
    vote: string;
    conviction_score?: number;
    notes?: string;
  }> = committeeDecision?.individual_votes ?? [];

  const evidenceRequests: Array<{
    id: number;
    message?: string;
    status?: string;
    pre_readiness_score?: number;
    post_readiness_score?: number;
    created_at?: string;
  }> = applicationDetail?.evidence_requests ?? [];

  // Minor #16 — vote quorum + majority logic. Backend does not yet tell us the
  // total expected committee size, so we use a pragmatic, explicit floor:
  // MIN_QUORUM = 2 recorded votes before any verdict can be finalized, plus
  // a directional majority check (yes+conditional > pass for ACCEPT / accept,
  // pass+conditional > yes for PASS/reject). WAITLISTED only needs quorum.
  const MIN_QUORUM = 2;
  const quorumReached = totalVotes >= MIN_QUORUM;
  const acceptAdvanceable = yesCount + conditionalCount > passCount;
  const passAdvanceable = passCount + conditionalCount > yesCount;
  const canFinalizeAccept = quorumReached && acceptAdvanceable;
  const canFinalizeReject = quorumReached && passAdvanceable;
  const canFinalizeWaitlist = quorumReached;
  const quorumHint = (() => {
    if (totalVotes === 0) return `${MIN_QUORUM} votes minimum required before finalizing`;
    if (!quorumReached) return `${totalVotes}/${MIN_QUORUM} quorum — need ${MIN_QUORUM - totalVotes} more`;
    if (acceptAdvanceable && !passAdvanceable) return `Quorum met · YES+Conditional (${yesCount + conditionalCount}) lead PASS (${passCount})`;
    if (passAdvanceable && !acceptAdvanceable) return `Quorum met · PASS+Conditional (${passCount + conditionalCount}) lead YES (${yesCount})`;
    return `Quorum met · split decision — WAITLISTED always available`;
  })();
  const [showQuorumHint, setShowQuorumHint] = React.useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">
            Investment Committee (IC) Workspace
          </h2>
          <p className="text-xs text-neutral-400">
            Partner consensus voting, cross-reviewer variance deliberation, and final binding
            batch selection.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400">Current Candidate:</span>
          <span className="text-xs font-bold text-white bg-neutral-900 px-3 py-1.5 rounded border border-neutral-800">
            {companyName}
          </span>
        </div>
      </div>

      {!applicationDetail ? (
        <div className="flex flex-col items-center justify-center min-h-[280px] rounded-xl border border-neutral-800 bg-neutral-900/40 gap-3 text-center p-8">
          <Users className="w-8 h-8 text-neutral-600" />
          <p className="text-sm font-medium text-neutral-400">No application selected</p>
          <p className="text-xs text-neutral-600 max-w-xs">
            Select an application from the Reviewer Workspace or Pipeline to begin IC deliberation.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Voting panel ─────────────────────────────────────────────── */}
          <Card className="bg-neutral-900/70 border-neutral-800">
            <CardContent className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Partner Consensus Vote
              </h3>

              <div className="space-y-3">
                {/* Vote buttons */}
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(VOTE_CONFIG) as Array<keyof typeof VOTE_CONFIG>).map((v) => {
                    const cfg = VOTE_CONFIG[v];
                    return (
                      <button
                        key={v}
                        onClick={() => setCommitteeVote(v)}
                        className={cn(
                          'p-2.5 rounded-lg border text-center text-xs font-semibold transition-all cursor-pointer',
                          committeeVote === v
                            ? cfg.active
                            : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700'
                        )}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>

                {/* Conviction slider */}
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">
                    Conviction Scale (1-10):{' '}
                    <span className="font-mono text-emerald-400">{committeeConviction}</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={committeeConviction}
                    onChange={(e) => setCommitteeConviction(Number(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                    aria-label="Conviction scale"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">
                    IC Deliberation Notes
                  </label>
                  <textarea
                    rows={3}
                    value={committeeNotes}
                    onChange={(e) => setCommitteeNotes(e.target.value)}
                    placeholder="Conditions for acceptance, valuation tranches, milestone prerequisites…"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-xs text-white focus:border-emerald-500 outline-none resize-none"
                  />
                </div>

                {/* Fix #6: "Record Vote" is the primary action — styled prominently */}
                <Button
                  onClick={() => onCastVote(committeeVote, committeeConviction, committeeNotes)}
                  className="w-full text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  Record Partner Vote
                </Button>
              </div>

              {/* Final verdict — Minor #16: quorum + directional majority gate before
                  destructive / binding actions are even clickable. */}
              <div className="pt-4 border-t border-neutral-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Execute Final Verdict
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowQuorumHint((v) => !v)}
                    className={cn(
                      'text-[10px] font-semibold px-2 py-0.5 rounded shrink-0 cursor-pointer transition-colors',
                      quorumReached
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20'
                        : 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20'
                    )}
                  >
                    {totalVotes}/{MIN_QUORUM} quorum ·{' '}
                    {quorumReached ? 'ready' : `${MIN_QUORUM - totalVotes} short`}
                  </button>
                </div>

                {/* Collapsible quorum breakdown so users see *why* a button is disabled. */}
                <AnimatePresence initial={false}>
                  {showQuorumHint && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div
                        className={cn(
                          'p-2.5 rounded-lg text-[11px] flex items-start gap-2 border mb-0.5',
                          quorumReached
                            ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300'
                            : 'bg-amber-500/5 border-amber-500/20 text-amber-300'
                        )}
                      >
                        {quorumReached ? (
                          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        )}
                        <span>{quorumHint}</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {pendingDecision ? (
                  /* Confirmation panel */
                  <div className="space-y-2.5 p-3 rounded-lg bg-neutral-950 border border-amber-500/40">
                    <div className="flex items-start gap-2 text-xs text-amber-300">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{DECISION_CONFIRM_MESSAGES[pendingDecision]}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={confirmFinalize}
                        className={cn(
                          'flex-1 text-xs font-bold text-white',
                          pendingDecision === 'ACCEPTED'
                            ? 'bg-emerald-600 hover:bg-emerald-500'
                            : pendingDecision === 'REJECTED'
                            ? 'bg-rose-600 hover:bg-rose-500'
                            : 'bg-amber-600 hover:bg-amber-500'
                        )}
                      >
                        Confirm {DECISION_LABELS[pendingDecision]}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={cancelFinalize}
                        className="text-xs border-neutral-700 text-neutral-300"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleFinalizeClick('ACCEPTED')}
                      disabled={!canFinalizeAccept}
                      title={
                        canFinalizeAccept
                          ? 'Accept into cohort'
                          : `Need ${MIN_QUORUM}+ votes with YES+Conditional leading PASS`
                      }
                      className={cn(
                        'text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed'
                      )}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleFinalizeClick('WAITLISTED')}
                      disabled={!canFinalizeWaitlist}
                      title={canFinalizeWaitlist ? 'Move to waitlist' : `Need at least ${MIN_QUORUM} votes before waitlisting`}
                      className="text-xs border-neutral-700 text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Waitlist
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleFinalizeClick('REJECTED')}
                      disabled={!canFinalizeReject}
                      title={
                        canFinalizeReject
                          ? 'Pass / reject application'
                          : `Need ${MIN_QUORUM}+ votes with PASS+Conditional leading YES`
                      }
                      className="text-xs border-rose-800 text-rose-400 hover:bg-rose-950/20 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Pass
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Tally + individual votes ──────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-neutral-900/60 border-neutral-800">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">
                    Committee Tally &amp; Recorded Votes
                  </h3>
                  {totalVotes > 0 && (
                    <span className="text-[11px] text-neutral-400 font-mono">
                      {totalVotes} vote{totalVotes !== 1 ? 's' : ''} recorded
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30">
                    <p className="text-xs text-neutral-400">Yes Votes</p>
                    <p className="text-2xl font-bold text-emerald-400 font-mono">{yesCount}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/30">
                    <p className="text-xs text-neutral-400">Conditional</p>
                    <p className="text-2xl font-bold text-amber-400 font-mono">{conditionalCount}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/30">
                    <p className="text-xs text-neutral-400">Pass</p>
                    <p className="text-2xl font-bold text-rose-400 font-mono">{passCount}</p>
                  </div>
                </div>

                {individualVotes.length > 0 ? (
                  <div className="space-y-2 pt-2 text-xs">
                    {individualVotes.map((v, idx) => {
                      const cfg =
                        VOTE_CONFIG[v.vote?.toUpperCase() as keyof typeof VOTE_CONFIG] ??
                        VOTE_CONFIG['CONDITIONAL'];
                      return (
                        <div
                          key={idx}
                          className="p-2.5 rounded bg-neutral-950 border border-neutral-800 flex items-start justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <span className="font-semibold text-white">
                              {v.voter_name ?? v.voter_email ?? `Partner ${idx + 1}`}:
                            </span>{' '}
                            {v.notes ? (
                              <span className="text-neutral-400 italic">"{v.notes}"</span>
                            ) : (
                              <span className="text-neutral-600 italic">No notes</span>
                            )}
                            {v.conviction_score != null && (
                              <span className="ml-2 text-[10px] text-neutral-500 font-mono">
                                conviction: {v.conviction_score}/10
                              </span>
                            )}
                          </div>
                          <Badge
                            className={cn(
                              'text-[10px] font-bold shrink-0 flex items-center gap-1',
                              cfg.badge
                            )}
                          >
                            {cfg.icon}
                            {v.vote?.toUpperCase()}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-600 pt-1">
                    No votes recorded yet. Cast the first partner vote using the panel on the left.
                  </p>
                )}

                {committeeDecision?.decision && (
                  <div
                    className={cn(
                      'mt-2 p-3 rounded-lg border text-xs font-semibold flex items-center gap-2',
                      committeeDecision.decision === 'ACCEPTED'
                        ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                        : committeeDecision.decision === 'REJECTED'
                        ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                        : 'bg-amber-950/20 border-amber-500/30 text-amber-300'
                    )}
                  >
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    Final Decision: {committeeDecision.decision}
                    {committeeDecision.rationale && (
                      <span className="font-normal text-neutral-400 ml-1">
                        — {committeeDecision.rationale}
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Evidence request history */}
            <Card className="bg-neutral-900/60 border-neutral-800">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    Evidence Request Loop &amp; Readiness Score Delta
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onRequestEvidence}
                    className="text-xs border-neutral-700 text-neutral-300"
                  >
                    <HelpCircle className="w-3.5 h-3.5 mr-1" /> New Request Loop
                  </Button>
                </div>

                {evidenceRequests.length > 0 ? (
                  <div className="space-y-2">
                    {evidenceRequests.map((req) => {
                      const delta =
                        req.post_readiness_score != null && req.pre_readiness_score != null
                          ? req.post_readiness_score - req.pre_readiness_score
                          : null;
                      const isResolved = req.status === 'resolved';
                      return (
                        <div
                          key={req.id}
                          className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800 space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-white truncate pr-2">
                              {req.message || 'Evidence Request'}
                            </span>
                            <Badge
                              className={cn(
                                'shrink-0 text-[10px] font-bold',
                                isResolved
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                  : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              )}
                            >
                              {isResolved ? 'RESOLVED' : 'PENDING'}
                            </Badge>
                          </div>

                          {(req.pre_readiness_score != null || req.post_readiness_score != null) && (
                            <div className="flex items-center gap-4 text-neutral-400 font-mono text-[11px]">
                              {req.pre_readiness_score != null && (
                                <span>
                                  Pre-Score:{' '}
                                  <span className="text-neutral-200">{req.pre_readiness_score}/100</span>
                                </span>
                              )}
                              {req.post_readiness_score != null && (
                                <>
                                  <span>→</span>
                                  <span>
                                    Post-Score:{' '}
                                    <span className="text-emerald-400 font-bold">
                                      {req.post_readiness_score}/100
                                      {delta != null && delta > 0 && (
                                        <span className="text-emerald-300"> (+{delta}pts)</span>
                                      )}
                                    </span>
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-600">
                    No evidence loops initiated yet. Use "New Request Loop" to request additional
                    documentation from the founder.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
