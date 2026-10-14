'use client';

/**
 * Reviewer Consensus — a thin renderer over the server's
 * /applications/reviewer-consensus-report/ payload. Lanes, consensus state,
 * conviction spreads, disagreement counts and reviewer calibration are all
 * computed from the scorecard ledger by the backend; nothing here decides an
 * application's fate. The only human actions are filing a scorecard and
 * writing the note that resolves a disagreement.
 */

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  GitCompareArrows,
  Loader2,
  RefreshCw,
  Scale,
  UserRoundSearch,
  Users,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useIntelligence } from '@/app/(dashboard)/accelerator/IntelligenceContext';
import {
  acceleratorApi,
  type ConsensusState,
  type MyReviewerCalibration,
  type ReviewLane,
  type ReviewerConsensusReport,
  type ReviewerConsensusRow,
  type ReviewerDisagreementRow,
  type ReviewerTendency,
} from '@/lib/acceleratorApi';
import {
  apiErrMessage,
  evidenceLevelShort,
  qk,
  relativeTime,
  STATUS_LABELS,
} from '@/lib/screening';
import { cn } from '@/lib/utils';
import { AssignmentChips } from '@/components/accelerator/ReviewerAssignments';
import {
  ReviewerBatchAnalysisModal,
  BatchAppItem,
} from './ReviewerBatchAnalysisModal';
import {
  ScoreComparisonModal,
  CandidateScoreData,
} from './ScoreComparisonModal';

interface ReviewerConsensusViewProps {
  programId?: number;
}

const LANE_META: Record<ReviewLane, { label: string; tone: string; hint: string }> = {
  awaiting_review: {
    label: 'Awaiting first scorecard',
    tone: 'amber',
    hint: 'No reviewer has filed an assessment yet',
  },
  in_review: {
    label: 'In review',
    tone: 'slate',
    hint: 'Scorecards filed, no decision recorded',
  },
  decided: {
    label: 'Decided',
    tone: 'emerald',
    hint: 'Advanced past review by a human',
  },
};

const CONSENSUS_META: Record<ConsensusState, { label: string; cls: string; hint: string }> = {
  none: {
    label: 'No scorecards',
    cls: 'border-slate-200 bg-slate-50 text-slate-500',
    hint: 'Nothing to agree on yet — no human has reviewed this application.',
  },
  single_reviewer: {
    label: 'One ballot only',
    cls: 'border-slate-200 bg-slate-50 text-slate-600',
    hint: 'A single scorecard is a lone opinion, not consensus.',
  },
  consensus: {
    label: 'Consensus',
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    hint: 'Two or more scorecards within the agreement tolerance.',
  },
  divergent: {
    label: 'Divergent',
    cls: 'border-rose-200 bg-rose-50 text-rose-700',
    hint: 'Reviewers are far apart — this needs a human conversation.',
  },
};

const TENDENCY_META: Record<ReviewerTendency, { label: string; cls: string }> = {
  insufficient_data: { label: 'No baseline yet', cls: 'border-slate-200 bg-slate-50 text-slate-500' },
  in_line: { label: 'In line with cohort', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  lenient: { label: 'Lenient vs cohort', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  strict: { label: 'Strict vs cohort', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
};

const TONE_CLASSES: Record<string, { border: string; bg: string; text: string; sub: string }> = {
  emerald: { border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-700', sub: 'text-emerald-600/70' },
  amber: { border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700', sub: 'text-amber-600/70' },
  rose: { border: 'border-rose-200', bg: 'bg-rose-50', text: 'text-rose-700', sub: 'text-rose-600/70' },
  slate: { border: 'border-slate-200', bg: 'bg-slate-50', text: 'text-slate-700', sub: 'text-slate-500' },
};

function LaneCard({ lane, count, scope }: { lane: ReviewLane; count: number; scope: number }) {
  const meta = LANE_META[lane];
  const tone = TONE_CLASSES[meta.tone];
  return (
    <div className={cn('rounded-2xl border p-4 shadow-sm', tone.border, tone.bg)}>
      <div className="text-[11px] font-bold uppercase tracking-wider">
        <span className={tone.text}>{meta.label}</span>
      </div>
      <div className={cn('mt-1 text-3xl font-black tabular-nums', tone.text)}>{count}</div>
      <div className={cn('mt-0.5 text-[11px]', tone.sub)}>
        {scope > 0 ? `${Math.round((count / scope) * 100)}% of review scope · ` : ''}
        {meta.hint}
      </div>
    </div>
  );
}

function RecommendationChips({ recs }: { recs: Record<string, number> }) {
  const entries = Object.entries(recs ?? {});
  if (entries.length === 0) {
    return <span className="text-[11px] italic text-slate-400">no recommendations filed</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {entries.map(([rec, count]) => (
        <span
          key={rec}
          className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600"
        >
          {rec.replace(/_/g, ' ')}{count > 1 ? ` ×${count}` : ''}
        </span>
      ))}
    </span>
  );
}

export function ReviewerConsensusView({ programId }: ReviewerConsensusViewProps) {
  const { toast } = useToast();
  const { openIntelligenceDrawer } = useIntelligence();
  const queryClient = useQueryClient();

  const [laneFilter, setLaneFilter] = React.useState<ReviewLane | 'all'>('all');
  const [selectedIds, setSelectedIds] = React.useState<number[]>([]);
  const [isBatchModalOpen, setIsBatchModalOpen] = React.useState(false);
  const [comparisonTarget, setComparisonTarget] = React.useState<CandidateScoreData | null>(null);
  const [resolveTarget, setResolveTarget] = React.useState<ReviewerDisagreementRow | null>(null);
  const [resolutionNotes, setResolutionNotes] = React.useState('');

  const reportQuery = useQuery({
    queryKey: qk.reviewerConsensus(programId ?? null),
    queryFn: () => acceleratorApi.getReviewerConsensus(programId),
    enabled: programId != null,
  });
  const report: ReviewerConsensusReport | undefined = reportQuery.data;

  const myCalQuery = useQuery<MyReviewerCalibration>({
    queryKey: qk.myCalibration(programId ?? null),
    queryFn: () => acceleratorApi.getMyReviewerCalibration(programId),
    enabled: programId != null,
  });

  const invalidateReport = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.reviewerConsensus(programId ?? null) });
    queryClient.invalidateQueries({ queryKey: qk.myCalibration(programId ?? null) });
    queryClient.invalidateQueries({ queryKey: qk.applications(programId ?? null) });
    queryClient.invalidateQueries({ queryKey: ['accelerator-screening-summary', programId ?? null] });
  }, [queryClient, programId]);

  const resolveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes: string }) =>
      acceleratorApi.resolveDisagreement(id, notes),
    onSuccess: () => {
      toast({
        title: 'Disagreement resolved',
        description: 'Your written rationale is stored on the record. The scorecards themselves are never rewritten.',
        variant: 'success',
      });
      setResolveTarget(null);
      setResolutionNotes('');
      invalidateReport();
    },
    onError: (err) => {
      toast({
        title: 'Could not resolve disagreement',
        description: apiErrMessage(err, 'A written resolution note is required.'),
        variant: 'error',
      });
    },
  });

  if (programId == null) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
        Select a program to see its reviewer ledger — scorecards, consensus state and calibration.
      </div>
    );
  }

  if (reportQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-12 text-sm text-slate-500 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
        Reading the scorecard ledger for this program…
      </div>
    );
  }

  if (reportQuery.isError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
        <div className="text-sm font-bold text-rose-800">Consensus report failed</div>
        <p className="mt-1 text-xs text-rose-700">
          {apiErrMessage(reportQuery.error, 'The reviewer consensus report request failed.')}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3 border-rose-300 bg-white text-rose-700 hover:bg-rose-100"
          onClick={() => reportQuery.refetch()}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }

  if (!report) return null;

  const rows = laneFilter === 'all' ? report.rows : report.rows.filter((r) => r.lane === laneFilter);
  const openDisagreements = report.disagreements.filter((d) => !d.resolved);
  const selectedBatchApps: BatchAppItem[] = report.rows
    .filter((r) => selectedIds.includes(r.application_id))
    .map((r) => ({ id: r.application_id, name: r.company_name, sector: r.sector ?? '—' }));

  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  const allSelected = selectedIds.length > 0 && selectedIds.length === report.rows.length;
  const toggleSelectAll = () =>
    setSelectedIds(allSelected ? [] : report.rows.map((r) => r.application_id));

  const openRowEvidence = (row: ReviewerConsensusRow) => {
    openIntelligenceDrawer({
      title: `${row.company_name} — review evidence`,
      entityName: row.company_name,
      category: 'ML screening evidence',
      severity: row.claims.contradicted > 0 ? 'MEDIUM' : 'INFO',
      confidence: row.ml.evidence_confidence ?? 0,
      detectedAt: row.ml.ran_at ? relativeTime(row.ml.ran_at) : 'Screening not run',
      evidence: [
        `Screening tier: ${row.ml.tier ?? 'not run'}`,
        `Program fit: ${row.ml.program_fit !== null ? `${row.ml.program_fit}/100` : 'no data'} · strength: ${
          row.ml.startup_strength !== null ? `${row.ml.startup_strength}/100` : 'no data'
        }`,
        `Completeness: ${row.ml.completeness !== null ? `${Math.round(row.ml.completeness)}%` : 'no data'}`,
        `Claims: ${row.claims.total} extracted · ${row.claims.unverified} unverified · ${row.claims.contradicted} contradicted`,
        `Human scorecards: ${row.reviewer_count} (mean conviction ${
          row.human_avg_conviction !== null ? `${row.human_avg_conviction}/10` : '—'
        })`,
        ...(row.stage_conflict ? ['Declared stage conflicts with reported metrics'] : []),
      ],
      sources: ['Application record', 'Reviewer assessment ledger'],
      model: 'ML-assisted screening',
      policy: 'ML produces evidence and recommendations only — reviewers decide.',
    });
  };

  const openCalibrationEvidence = (reviewerName: string, blurb: string) => {
    openIntelligenceDrawer({
      title: `${reviewerName} — calibration`,
      entityName: reviewerName,
      category: 'Reviewer calibration',
      severity: 'INFO',
      confidence: 0,
      detectedAt: report.calibration.reviewers.length
        ? relativeTime(
            report.calibration.reviewers
              .map((r) => r.last_submitted_at)
              .filter((t): t is string => !!t)
              .sort()
              .slice(-1)[0] ?? null
          )
        : 'No submissions recorded',
      evidence: [blurb, report.calibration.agreement_basis],
      sources: ['Reviewer assessment ledger'],
      model: 'Descriptive statistics over filed scorecards',
      policy: 'Calibration describes scoring patterns; it is never a performance judgement or an automated action.',
    });
  };

  const cal = report.calibration;
  const myCal: MyReviewerCalibration | undefined = myCalQuery.data;

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-xs text-slate-500">
          These rows are <strong className="text-slate-700">every application in this program</strong> ({
            report.scope.review_scope
          }
          ), not an assigned subset. Each row shows both facts side by side: who the program{' '}
          <strong className="text-slate-700">asked</strong>, and who has actually{' '}
          <strong className="text-slate-700">filed a scorecard</strong>. An ask routes attention — it does not gate
          who may review, and it decides nothing. Consensus, conviction spread and calibration are computed
          server-side from the scorecard ledger; ML only supplies evidence and advisory recommendations. Filing a
          scorecard and resolving a disagreement are human acts.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          disabled={reportQuery.isFetching}
          onClick={() => reportQuery.refetch()}
        >
          {reportQuery.isFetching ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          Refresh ledger
        </Button>
      </div>

      {/* ── Scope strip ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span className="font-bold uppercase tracking-wider text-slate-400">Scope</span>
        <span>
          {report.scope.total_applications} application(s) in program · {report.scope.evaluated} in this view
        </span>
        <span aria-hidden>·</span>
        <span>
          ML screening run on {report.rollup.ml_screened}, not run on {report.rollup.ml_not_run}
        </span>
        <span aria-hidden>·</span>
        <span>
          {report.rollup.scorecards_recorded} scorecard(s) from {report.rollup.active_reviewers} reviewer(s)
        </span>
        <span aria-hidden>·</span>
        {/* Both halves are stated: an application nobody asked about is still
            open for any reviewer to score, so this is coverage, not a gate. */}
        <span>
          reviewer asked on {report.rollup.applications_assigned}, nobody asked yet on{' '}
          {report.rollup.applications_unassigned}
        </span>
        <span aria-hidden>·</span>
        <span>
          mean human conviction{' '}
          {report.rollup.avg_human_conviction !== null ? (
            <strong className="text-slate-700">{report.rollup.avg_human_conviction}/10</strong>
          ) : (
            <span className="italic">no data yet</span>
          )}
        </span>
        {report.scope.excluded.length > 0 && (
          <>
            <span aria-hidden>·</span>
            <span title="Drafts and withdrawals are not reviewable records">
              excluded: {report.scope.excluded.map((e) => `${e.count} ${STATUS_LABELS[e.status as keyof typeof STATUS_LABELS] ?? e.status.toLowerCase()}`).join(', ')}
            </span>
          </>
        )}
      </div>

      {report.scope.truncated && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
          This program has more applications than a single report renders — showing the first {report.scope.evaluated}{' '}
          of {report.scope.review_scope}. Counts below cover the displayed set only.
        </div>
      )}

      {/* ── Lane cards (filters) + alignment stat ────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(['awaiting_review', 'in_review', 'decided'] as ReviewLane[]).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLaneFilter(laneFilter === l ? 'all' : l)}
            className="text-left"
          >
            <LaneCard lane={l} count={report.rollup.lanes[l]} scope={report.rows.length} />
          </button>
        ))}
        <div className={cn(
          'rounded-2xl border p-4 shadow-sm',
          openDisagreements.length > 0 ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'
        )}>
          <div className="text-[11px] font-bold uppercase tracking-wider">
            <span className={openDisagreements.length > 0 ? 'text-rose-700' : 'text-slate-700'}>
              Needs alignment
            </span>
          </div>
          <div className={cn(
            'mt-1 text-3xl font-black tabular-nums',
            openDisagreements.length > 0 ? 'text-rose-700' : 'text-slate-500'
          )}>
            {openDisagreements.length}
          </div>
          <div className={cn('mt-0.5 text-[11px]', openDisagreements.length > 0 ? 'text-rose-600/70' : 'text-slate-500')}>
            {cal.inter_reviewer_agreement_pct !== null
              ? `reviewers agree on ${cal.inter_reviewer_agreement_pct}% of dimensions · `
              : 'not enough overlapping scorecards to measure agreement · '}
            {openDisagreements.length === 1 ? '1 open variance' : `${openDisagreements.length} open variances`}
          </div>
        </div>
      </div>

      {/* ── Batch ML bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="select-all-consensus"
            checked={allSelected}
            onChange={toggleSelectAll}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="select-all-consensus" className="text-xs font-semibold text-slate-600">
            Select all ({report.rows.length})
          </label>
          {selectedIds.length > 0 && (
            <span className="text-xs text-slate-500">
              <strong className="text-slate-700">{selectedIds.length}</strong> selected · ML screening records a
              tier and an eligibility row per application; it files no scorecard and no decision
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs text-slate-500"
              onClick={() => setSelectedIds([])}
            >
              Clear
            </Button>
          )}
          <Button
            size="sm"
            disabled={selectedIds.length === 0}
            onClick={() => setIsBatchModalOpen(true)}
            className="bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            <Zap className="mr-1.5 h-3.5 w-3.5" />
            Run ML screening{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
          </Button>
        </div>
      </div>

      {/* ── Consensus table ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
            <Users className="h-4 w-4 text-indigo-600" />
            {laneFilter === 'all' ? 'All applications' : LANE_META[laneFilter].label}
            <span className="text-xs font-semibold text-slate-400">({rows.length})</span>
          </h2>
          {laneFilter !== 'all' && (
            <Button size="sm" variant="ghost" className="text-xs text-slate-500" onClick={() => setLaneFilter('all')}>
              Clear filter
            </Button>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-400 shadow-sm">
            Nothing in this lane. Applications move only when a human files a scorecard or records a decision.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-3 w-10 text-center" aria-label="Select" />
                  <th className="px-4 py-3">Candidate</th>
                  <th className="px-4 py-3">Human scorecards</th>
                  <th className="px-4 py-3">ML screening</th>
                  <th className="px-3 py-3">Evidence</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const cs = CONSENSUS_META[row.consensus_state];
                  return (
                    <tr key={row.application_id} className="align-top hover:bg-slate-50/70">
                      <td className="px-3 py-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.application_id)}
                          onChange={() => toggleSelect(row.application_id)}
                          aria-label={`Select ${row.company_name}`}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-slate-900">{row.company_name}</span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            {STATUS_LABELS[row.status as keyof typeof STATUS_LABELS] ?? row.status}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {row.sector ?? 'sector not stated'} · {row.stage ?? 'stage not stated'}
                          {row.aging_days !== null && (
                            <span className={cn(
                              'ml-1.5 font-semibold',
                              row.aging_days >= 14 ? 'text-amber-700' : 'text-slate-400'
                            )}>
                              {row.aging_days}d in review
                            </span>
                          )}
                        </div>
                        {row.open_disagreements > 0 && (
                          <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                            <AlertTriangle className="h-3 w-3" />
                            {row.open_disagreements} open variance(s)
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'rounded-full border px-2 py-0.5 text-[10px] font-bold',
                            cs.cls
                          )} title={cs.hint}>
                            {cs.label}
                          </span>
                          <span className="font-black text-slate-900 tabular-nums">
                            {row.human_avg_conviction !== null ? `${row.human_avg_conviction}/10` : '—'}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {row.reviewer_count === 0
                              ? 'no ballots'
                              : `${row.reviewer_count} ballot${row.reviewer_count > 1 ? 's' : ''}${
                                  row.human_conviction_spread_points !== null
                                    ? ` · spread ${row.human_conviction_spread_points} pts`
                                    : ''
                                }`}
                          </span>
                        </div>
                        {/* Who the program asked, next to who actually voted.
                            A row can read "asked 2 · ballots 0" — that is the
                            coverage gap this screen exists to show. */}
                        {row.assignments && (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Asked
                            </span>
                            <AssignmentChips assignments={row.assignments} />
                          </div>
                        )}
                        <div className="mt-1">
                          <RecommendationChips recs={row.recommendations} />
                        </div>
                        <div className="mt-1 text-[11px]">
                          {row.my_review ? (
                            <span className="text-slate-500">
                              you filed <strong className="text-slate-700">{row.my_review.conviction}/10</strong>{' '}
                              <span className="uppercase tracking-wide">{row.my_review.recommendation.replace(/_/g, ' ')}</span>{' '}
                              · {relativeTime(row.my_review.submitted_at)}
                            </span>
                          ) : (
                            <span className="italic text-slate-400">you have not filed one</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {row.ml.screening_ran ? (
                          <>
                            <div className="font-black text-slate-900 tabular-nums">
                              {row.ml.program_fit !== null ? `${row.ml.program_fit}` : '—'}
                              <span className="text-[10px] font-semibold text-slate-400">/100 fit</span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-500">
                              lane {row.ml.tier ?? '—'} · {relativeTime(row.ml.ran_at)}
                            </div>
                          </>
                        ) : (
                          <span className="text-[11px] italic text-slate-400">
                            Screening not run — no ML numbers exist for this application yet
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <button
                          type="button"
                          onClick={() => openRowEvidence(row)}
                          className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-100"
                          title={`${row.claims.total} claims · ${row.claims.unverified} unverified · ${row.claims.contradicted} contradicted`}
                        >
                          {evidenceLevelShort(row.ml.evidence_confidence)}
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-indigo-200 bg-indigo-50 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                          onClick={() =>
                            setComparisonTarget({
                              applicationId: row.application_id,
                              startupName: row.company_name,
                              sector: row.sector ?? undefined,
                            })
                          }
                        >
                          <GitCompareArrows className="mr-1.5 h-3.5 w-3.5" />
                          Compare &amp; file scorecard
                          <ArrowRight className="ml-1.5 h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Open disagreements (human alignment work) ────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
          <Scale className="h-4 w-4 text-rose-600" /> Reviewer variances needing alignment
        </h2>
        <p className="mt-0.5 mb-4 text-xs text-slate-500">
          Detected when two scorecards on the same application differ by more than the agreement tolerance. ML flags
          the gap; only a human can write the note that closes it.
        </p>
        {openDisagreements.length === 0 ? (
          <p className="text-xs text-slate-400">
            No open variances. {cal.multi_reviewer_applications === 0
              ? 'Only one ballot per application so far, so inter-reviewer agreement cannot be measured yet.'
              : `Every flagged variance has been resolved, or none was ever raised across ${cal.multi_reviewer_applications} multi-reviewer application(s).`}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {openDisagreements.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3.5"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-rose-900">
                    {d.application_name}
                    <span className="ml-1.5 font-semibold text-rose-700">
                      {d.dimension.replace(/_/g, ' ')}: {d.reviewer_a_name} {d.dimension_a ?? '—'} vs{' '}
                      {d.reviewer_b_name} {d.dimension_b ?? '—'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-rose-700/80">
                    {d.variance_points} points apart · flagged {d.detected_at ? relativeTime(d.detected_at) : '—'}
                    {d.resolution_notes && <p className="mt-1 truncate" title={d.resolution_notes}>{d.resolution_notes}</p>}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-rose-300 bg-white text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  onClick={() => {
                    setResolveTarget(d);
                    setResolutionNotes('');
                  }}
                >
                  Record alignment outcome
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Calibration ──────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
              <Brain className="h-4 w-4 text-indigo-600" /> Reviewer calibration
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {cal.agreement_basis} · computed from {cal.total_scorecards} scorecard(s) across{' '}
              {cal.applications_reviewed} application(s). Descriptive only — never a performance label.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-500">
              inter-reviewer agreement:{' '}
              {cal.inter_reviewer_agreement_pct !== null ? (
                <strong className="text-slate-800">{cal.inter_reviewer_agreement_pct}%</strong>
              ) : (
                <span className="italic">not enough overlapping scorecards</span>
              )}
              {' · '}cohort mean:{' '}
              {cal.cohort_avg_conviction !== null ? (
                <strong className="text-slate-800">{cal.cohort_avg_conviction}/10</strong>
              ) : (
                <span className="italic">no data</span>
              )}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() =>
                openIntelligenceDrawer({
                  title: 'My calibration',
                  entityName: myCal ? `${myCal.reviews_submitted} scorecard(s) filed` : 'No scorecards yet',
                  category: 'Reviewer calibration',
                  severity: 'INFO',
                  confidence: myCal?.agreement_with_cohort_pct ?? 0,
                  detectedAt: myCalQuery.isFetching ? 'Refreshing…' : relativeTime(
                    report.rows.find((r) => r.my_review)?.my_review?.submitted_at ?? null
                  ),
                  evidence: myCal
                    ? [
                        `Scorecards filed: ${myCal.reviews_submitted} across ${myCal.applications_reviewed} application(s)`,
                        `Dimension scores comparable to peers: ${myCal.comparable_dimension_scores}`,
                        `Agreement with peers: ${
                          myCal.agreement_with_cohort_pct !== null ? `${myCal.agreement_with_cohort_pct}%` : 'not measurable yet'
                        }`,
                        `Mean bias: ${
                          myCal.mean_bias_points !== null ? `${myCal.mean_bias_points} points` : 'not measurable yet'
                        } — ${myCal.bias_note}`,
                      ]
                    : ['No scorecards filed by you in this program yet.'],
                  sources: ['Reviewer assessment ledger'],
                  model: 'Descriptive statistics over filed scorecards',
                  policy: 'Your own scoring pattern, shown so you can self-check — it triggers no action and is never shared as a ranking.',
                })
              }
            >
              <UserRoundSearch className="mr-1.5 h-3.5 w-3.5" /> Your calibration
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Reviewer</th>
                <th className="px-4 py-3">Scorecards</th>
                <th className="px-4 py-3">Avg conviction</th>
                <th className="px-4 py-3">Last filed</th>
                <th className="px-4 py-3">Scoring tendency</th>
                <th className="px-4 py-3 text-right">Agreement with cohort</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cal.reviewers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-xs text-slate-400">
                    No scorecards in this program yet. Calibration appears once reviewers file ballots.
                  </td>
                </tr>
              ) : (
                cal.reviewers.map((rev) => {
                  const t = TENDENCY_META[rev.tendency];
                  return (
                    <tr key={rev.reviewer_id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5">
                        <button
                          type="button"
                          className="text-xs font-bold text-slate-900 hover:text-indigo-700"
                          onClick={() =>
                            openCalibrationEvidence(
                              rev.reviewer_name,
                              `${rev.reviews} scorecard(s), mean conviction ${
                                rev.avg_overall_conviction ?? '—'
                              }/10 (cohort ${cal.cohort_avg_conviction ?? '—'}). ${t.label}.`
                            )
                          }
                        >
                          {rev.reviewer_name}
                        </button>
                      </td>
                      <td className="px-4 py-3.5 tabular-nums">{rev.reviews}</td>
                      <td className="px-4 py-3.5 font-black tabular-nums text-slate-900">
                        {rev.avg_overall_conviction ?? '—'}
                      </td>
                      <td className="px-4 py-3.5 text-slate-500">
                        {rev.last_submitted_at ? relativeTime(rev.last_submitted_at) : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold', t.cls)}>
                          {t.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-slate-600">
                        {rev.agreement_with_cohort_pct !== null ? `${rev.agreement_with_cohort_pct}%` : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      <ReviewerBatchAnalysisModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        selectedApps={selectedBatchApps}
        onComplete={() => {
          setSelectedIds([]);
          invalidateReport();
        }}
      />

      <ScoreComparisonModal
        isOpen={!!comparisonTarget}
        onClose={() => setComparisonTarget(null)}
        candidateData={comparisonTarget}
        onSaved={invalidateReport}
      />

      {resolveTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Record alignment outcome"
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="flex items-center gap-2 text-sm font-black text-slate-900">
                <Scale className="h-4 w-4 text-indigo-600" /> Record alignment outcome
              </h3>
              <button
                onClick={() => setResolveTarget(null)}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <p className="text-xs leading-relaxed text-slate-600">
              <strong className="text-slate-800">{resolveTarget.application_name}</strong> ·{' '}
              {resolveTarget.dimension.replace(/_/g, ' ')} — {resolveTarget.reviewer_a_name} scored{' '}
              {resolveTarget.dimension_a ?? '—'}, {resolveTarget.reviewer_b_name} scored{' '}
              {resolveTarget.dimension_b ?? '—'} ({resolveTarget.variance_points} points apart). Both ballots stay
              exactly as filed; your note documents how the humans aligned.
            </p>

            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!resolutionNotes.trim() || !resolveTarget) return;
                resolveMutation.mutate({ id: resolveTarget.id, notes: resolutionNotes.trim() });
              }}
            >
              <div>
                <label htmlFor="resolution-notes" className="mb-1.5 block text-xs font-bold text-slate-700">
                  How was this resolved? (required)
                </label>
                <textarea
                  id="resolution-notes"
                  rows={3}
                  required
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                  placeholder="e.g. Second reviewer saw the pilot LOI the first had missed; discussion ended at a shared read of traction."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-slate-200 text-slate-600"
                  onClick={() => setResolveTarget(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!resolutionNotes.trim() || resolveMutation.isPending}
                  className="bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  {resolveMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Save resolution note
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
