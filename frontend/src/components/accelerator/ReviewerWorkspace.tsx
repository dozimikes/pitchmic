'use client';

import * as React from 'react';
import {
  Brain,
  FileText,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  Send,
  Lock,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { ApplicationItem, ApplicationAssessment } from '@/lib/acceleratorApi';
import { useAuth } from '@/hooks/useAuth';

interface ReviewerWorkspaceProps {
  applications: ApplicationItem[];
  selectedAppId: number | null;
  applicationDetail: any;
  onSelectApp: (id: number) => void;
  onScoresDirtyChange?: (dirty: boolean) => void;
  onRequestEvidence: () => void;
  onAdvanceToIC: () => void;
  onSubmitReview: (scores: any) => void;
  onQueryCopilot: (query: string) => Promise<string>;
}

// ── Default (blank) scores — no pre-filled numbers shipped to backend ─────────
const DEFAULT_SCORES = {
  founder: '' as string | number,
  market: '' as string | number,
  product: '' as string | number,
  team: '' as string | number,
  traction: '' as string | number,
  conviction: '' as string | number,
  recommendation: 'INTERVIEW' as 'INTERVIEW' | 'REJECT' | 'WAITLIST' | 'NEEDS_MORE_INFO',
  notes: '',
};

export function ReviewerWorkspace({
  applications,
  selectedAppId,
  applicationDetail,
  onSelectApp,
  onScoresDirtyChange,
  onRequestEvidence,
  onAdvanceToIC,
  onSubmitReview,
  onQueryCopilot,
}: ReviewerWorkspaceProps) {
  const { isAccelerator, isInvestor, isAdmin, isSuperUser } = useAuth();
  // Reviewer scorecard is only operable by accelerators, investors, admins
  const canReview = isAccelerator || isInvestor || isAdmin || isSuperUser;

  // ── Scorecard state ─────────────────────────────────────────────────────────
  const [reviewerScores, setReviewerScores] = React.useState(DEFAULT_SCORES);
  // Track whether the reviewer has actually changed any score from the blank default
  const [scoresTouched, setScoreshTouched] = React.useState(false);
  // Pending app switch — holds the incoming ID when scores are dirty
  const [pendingAppSwitch, setPendingAppSwitch] = React.useState<number | null>(null);

  // When a different application is selected, check for unsaved scores first.
  const handleSelectApp = (id: number) => {
    if (scoresTouched && id !== selectedAppId) {
      // Store the intended target and let the UI prompt the user
      setPendingAppSwitch(id);
    } else {
      onSelectApp(id);
    }
  };

  const confirmAppSwitch = () => {
    if (pendingAppSwitch == null) return;
    // Calling onSelectApp triggers selectedAppId change in the parent,
    // which fires the useEffect below and resets scores cleanly.
    onSelectApp(pendingAppSwitch);
    setPendingAppSwitch(null);
  };

  const cancelAppSwitch = () => setPendingAppSwitch(null);

  // Reset scores when selected app actually changes (after confirmation or when not dirty)
  React.useEffect(() => {
    setReviewerScores(DEFAULT_SCORES);
    setScoreshTouched(false);
    onScoresDirtyChange?.(false);
  }, [selectedAppId, onScoresDirtyChange]);

  const handleScoreChange = (key: string, value: string) => {
    setReviewerScores((prev) => ({ ...prev, [key]: value === '' ? '' : Number(value) }));
    setScoreshTouched(true);
    onScoresDirtyChange?.(true);
  };

  // ── Copilot state ───────────────────────────────────────────────────────────
  const [copilotQuery, setCopilotQuery] = React.useState('');
  const [copilotMessages, setCopilotMessages] = React.useState<
    Array<{ sender: 'user' | 'ai'; text: string; isError?: boolean }>
  >([
    {
      sender: 'ai',
      text: 'Admissions Copilot active. Ask me why an applicant was recommended, what downside risks exist, or to cross-examine claimed metrics.\n\nNote: Responses are generated from structured application data — not a live ML model.',
    },
  ]);
  const [copilotLoading, setCopilotLoading] = React.useState(false);
  const copilotScrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll copilot to bottom on new messages
  React.useEffect(() => {
    if (copilotScrollRef.current) {
      copilotScrollRef.current.scrollTop = copilotScrollRef.current.scrollHeight;
    }
  }, [copilotMessages, copilotLoading]);

  const handleSendCopilot = async (overrideText?: string) => {
    const q = overrideText ?? copilotQuery;
    if (!q.trim()) return;

    setCopilotMessages((prev) => [...prev, { sender: 'user', text: q }]);
    setCopilotQuery('');
    setCopilotLoading(true);

    try {
      const answer = await onQueryCopilot(q);
      setCopilotMessages((prev) => [...prev, { sender: 'ai', text: answer }]);
    } catch (err: any) {
      // Surface a real, honest error — do NOT substitute fabricated analysis
      const message =
        err?.response?.data?.detail ??
        (err?.response?.status === 403
          ? 'Access restricted: Copilot is available to admissions evaluators only.'
          : 'Unable to retrieve analysis. Please check your connection and try again.');
      setCopilotMessages((prev) => [
        ...prev,
        { sender: 'ai', text: message, isError: true },
      ]);
    } finally {
      setCopilotLoading(false);
    }
  };

  const assessment: ApplicationAssessment | undefined = applicationDetail?.assessment;

  // ── 7-dimension rubric rows — correct label for team_score ─────────────────
  // team_score = co-founder completeness + incorporation status (not "defensibility")
  const rubricDimensions = assessment
    ? [
        {
          name: 'Founder & Team DNA',
          score: assessment.founder_score,
          conf: assessment.founder_confidence,
        },
        {
          name: 'Problem Severity & Urgency',
          score: assessment.problem_score,
          conf: assessment.problem_confidence,
        },
        {
          name: 'Product Architecture & IP',
          score: assessment.product_score,
          conf: assessment.product_confidence,
        },
        {
          name: 'Market Depth & Expansion TAM',
          score: assessment.market_score,
          conf: assessment.market_confidence,
        },
        {
          name: 'Traction Velocity & LOIs',
          score: assessment.traction_score,
          conf: assessment.traction_confidence,
        },
        {
          name: 'Revenue Quality & Unit Economics',
          score: assessment.revenue_score,
          conf: assessment.revenue_confidence,
        },
        {
          // Fixed: team_score reflects co-founder completeness + legal incorporation,
          // not "Pan-African Defensibility" (which has no backend signal).
          name: 'Team Completeness & Legal Readiness',
          score: assessment.team_score,
          conf: assessment.team_confidence,
        },
      ]
    : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* ── Left: Applicant selector ─────────────────────────────────────────── */}
      <div className="lg:col-span-3 space-y-3">
        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
          Applications In Review ({applications.length})
        </h3>

        {/* Fix #8: warn before discarding unsaved scores */}
        {pendingAppSwitch != null && (
          <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/30 space-y-2">
            <p className="text-[11px] text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              You have unsaved scorecard entries. Switch application and discard them?
            </p>
            <div className="flex gap-2">
              <button
                onClick={confirmAppSwitch}
                className="flex-1 px-2 py-1 rounded text-[11px] font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-colors"
              >
                Switch &amp; Discard
              </button>
              <button
                onClick={cancelAppSwitch}
                className="flex-1 px-2 py-1 rounded text-[11px] font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
              >
                Stay Here
              </button>
            </div>
          </div>
        )}

        {applications.length === 0 ? (
          <p className="text-xs text-neutral-600 p-3">No applications in review yet.</p>
        ) : (
          <div className="space-y-2">
            {applications.map((app) => (
              <button
                key={app.id}
                type="button"
                onClick={() => handleSelectApp(app.id)}
                aria-pressed={selectedAppId === app.id}
                aria-label={`Select ${app.company_name}`}
                className={cn(
                  'w-full text-left p-3 rounded-lg border transition-all cursor-pointer',
                  selectedAppId === app.id
                    ? 'bg-emerald-950/30 border-emerald-500/60'
                    : pendingAppSwitch === app.id
                    ? 'bg-amber-950/20 border-amber-500/40'
                    : 'bg-neutral-900/50 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900'
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm text-white truncate pr-1">
                    {app.company_name}
                  </p>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 shrink-0">
                    Tier {app.automated_screening_tier}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-400 mt-1 font-mono">
                  <span>Fit: {app.program_fit_score.toFixed(0)}%</span>
                  <span className="capitalize text-neutral-500">
                    {app.status.toLowerCase().replace(/_/g, ' ')}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Center: Forensics panel ───────────────────────────────────────────── */}
      <div className="lg:col-span-6 space-y-6">
        {!applicationDetail ? (
          /* Empty state — clear instruction instead of blank space */
          <div className="flex flex-col items-center justify-center min-h-[320px] rounded-xl border border-neutral-800 bg-neutral-900/40 gap-3 text-center p-8">
            <FileText className="w-8 h-8 text-neutral-600" />
            <p className="text-sm font-medium text-neutral-400">No application selected</p>
            <p className="text-xs text-neutral-600 max-w-xs">
              Choose an application from the left panel to load the forensic assessment, scorecard,
              and evidence graph.
            </p>
          </div>
        ) : (
          <>
            {/* Header banner */}
            <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-bold text-white">
                      {applicationDetail.company_name}
                    </h2>
                    {assessment?.overall_recommendation && (
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                        Rec: {assessment.overall_recommendation}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {applicationDetail.startup_profile?.industry} ·{' '}
                    {applicationDetail.startup_profile?.geography}
                  </p>
                </div>

                {canReview && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onRequestEvidence}
                      className="text-xs border-amber-500/40 text-amber-300 bg-amber-500/10 hover:bg-amber-500/20"
                    >
                      <HelpCircle className="w-3.5 h-3.5 mr-1" /> Request Evidence
                    </Button>
                    <Button
                      size="sm"
                      onClick={onAdvanceToIC}
                      className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                    >
                      Advance to IC
                    </Button>
                  </div>
                )}
              </div>

              {/* 4 composite gauges — no hardcoded fallback numbers */}
              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-neutral-800 text-center">
                {[
                  {
                    label: 'Program Fit',
                    value: assessment?.overall_program_fit,
                    color: 'text-emerald-400',
                  },
                  {
                    label: 'Startup Strength',
                    value: assessment?.startup_strength,
                    color: 'text-purple-400',
                  },
                  {
                    label: 'Evidence Conf.',
                    value: assessment?.evidence_confidence,
                    color: 'text-blue-400',
                  },
                  {
                    label: 'Completeness',
                    value: assessment?.application_completeness,
                    color: 'text-amber-400',
                  },
                ].map((g) => (
                  <div
                    key={g.label}
                    className="p-2 rounded bg-neutral-950/60 border border-neutral-800"
                  >
                    <p className="text-[10px] text-neutral-400 uppercase">{g.label}</p>
                    <p className={cn('text-lg font-bold font-mono', g.color)}>
                      {g.value != null ? `${g.value.toFixed(0)}%` : '—'}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Stage divergence banner */}
            {assessment?.stage_conflict && (
              <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  Stage Divergence Detected by Forensic Engine
                </div>
                <p className="text-xs text-neutral-300">
                  <span className="font-semibold text-white">Declared:</span>{' '}
                  <span className="uppercase text-amber-300 font-mono">
                    {assessment.declared_stage}
                  </span>{' '}
                  ·{' '}
                  <span className="font-semibold text-white">Inferred:</span>{' '}
                  <span className="uppercase text-emerald-300 font-mono">
                    {assessment.inferred_stage}
                  </span>{' '}
                  (Confidence: {(assessment.stage_confidence * 100).toFixed(0)}%)
                </p>
                {assessment.stage_conflict_explanation && (
                  <p className="text-xs text-neutral-400">
                    {assessment.stage_conflict_explanation}
                  </p>
                )}
              </div>
            )}

            {/* 7-Dimension Rubric Scorecard */}
            <Card className="bg-neutral-900/60 border-neutral-800">
              <CardContent className="p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white flex items-center justify-between">
                  <span>7-Dimension Rubric Scorecard</span>
                  <span className="text-xs text-neutral-400 font-normal">
                    Score (0-100) / Confidence %
                  </span>
                </h3>

                {rubricDimensions.length > 0 ? (
                  <div className="space-y-2.5">
                    {rubricDimensions.map((dim) => (
                      <div key={dim.name} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-neutral-300 font-medium">{dim.name}</span>
                          <span className="font-mono text-neutral-400">
                            <span className="text-emerald-400 font-bold">
                              {dim.score.toFixed(0)}
                            </span>
                            <span className="text-neutral-600"> / </span>
                            <span className="text-blue-400">
                              {(dim.conf * 100).toFixed(0)}% conf
                            </span>
                          </span>
                        </div>
                        <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${dim.score}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500">
                    Assessment not yet generated. Submit the application to run the forensic engine.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Structured Claims & Evidence Graph */}
            <Card className="bg-neutral-900/60 border-neutral-800">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-400" />
                    Structured Claims &amp; Evidence Graph
                  </h3>
                  <Badge
                    variant="outline"
                    className="text-neutral-400 text-[10px] border-neutral-700 font-mono"
                  >
                    {applicationDetail.claims?.length ?? 0} Claims recorded
                  </Badge>
                </div>

                {(applicationDetail.claims?.length ?? 0) === 0 ? (
                  <p className="text-xs text-neutral-500">
                    No claims recorded on this application. Filing a document
                    records that it was filed — nothing in this deployment reads
                    the contents of a file, so a claim enters the ledger when a
                    person puts it there.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {applicationDetail.claims.map((claim: any) => (
                      <div
                        key={claim.id}
                        className="p-3.5 rounded-lg bg-neutral-950/80 border border-neutral-800 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-neutral-800 text-neutral-300">
                            {claim.claim_id}
                          </span>
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded text-[10px] font-semibold',
                              claim.verification_status === 'verified'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : claim.verification_status === 'partially_verified'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : claim.verification_status === 'contradicted' ||
                                  claim.verification_status === 'flagged'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-neutral-700/50 text-neutral-400 border border-neutral-700'
                            )}
                          >
                            {claim.verification_status.toUpperCase().replace(/_/g, ' ')}
                          </span>
                        </div>

                        <p className="text-xs font-medium text-white">{claim.claim_text}</p>

                        {claim.evidence_detail && (
                          <div className="p-2.5 rounded bg-neutral-900 border border-neutral-800 text-[11px] space-y-1">
                            <p className="text-emerald-400 font-medium">
                              Evidence Verification Audit:
                            </p>
                            <p className="text-neutral-300">
                              • {claim.evidence_detail.claimed_count} claimed →{' '}
                              {claim.evidence_detail.documents_found} documents found →{' '}
                              {claim.evidence_detail.unique_entities} unique entities →{' '}
                              {claim.evidence_detail.documents_signed} signed.
                            </p>
                            {claim.evidence_detail.commercial_intent_count != null && (
                              <p className="text-neutral-400">
                                • {claim.evidence_detail.commercial_intent_count} explicitly
                                indicate commercial/pilot intent.
                              </p>
                            )}
                          </div>
                        )}

                        {claim.discrepancy_notes && (
                          <p className="text-[11px] text-neutral-400 italic">
                            Forensic note: {claim.discrepancy_notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Bull vs Bear — only shown when backend has generated real content */}
            {assessment &&
              ((assessment.bull_case?.length ?? 0) > 0 ||
                (assessment.bear_case?.length ?? 0) > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card className="bg-emerald-950/10 border-emerald-500/30">
                    <CardContent className="p-4 space-y-2">
                      <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <ThumbsUp className="w-3.5 h-3.5" /> Bull Case (Why Invest?)
                      </h4>
                      <ul className="space-y-1.5 text-xs text-neutral-300">
                        {assessment.bull_case.map((b: any, idx: number) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="text-emerald-400 mt-0.5 shrink-0">•</span>
                            <span>{b.point}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>

                  <Card className="bg-rose-950/10 border-rose-500/30">
                    <CardContent className="p-4 space-y-2">
                      <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                        <ThumbsDown className="w-3.5 h-3.5" /> Bear Case (Downside Risks)
                      </h4>
                      <ul className="space-y-1.5 text-xs text-neutral-300">
                        {assessment.bear_case.map((b: any, idx: number) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="text-rose-400 mt-0.5 shrink-0">•</span>
                            <span>{b.point}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              )}
          </>
        )}
      </div>

      {/* ── Right: Copilot + Scorecard ────────────────────────────────────────── */}
      <div className="lg:col-span-3 space-y-6">
        {/* Copilot panel */}
        <Card className="bg-neutral-900/80 border-neutral-800 flex flex-col h-[420px]">
          <div className="p-3.5 border-b border-neutral-800 flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Brain className="w-4 h-4 text-emerald-400" />
              Admissions Copilot
            </span>
            {/* Honest label: rule-based, not an LLM */}
            <span className="text-[10px] font-mono text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-700">
              Rule-Based
            </span>
          </div>

          <div
            ref={copilotScrollRef}
            className="flex-1 overflow-y-auto p-3 space-y-2.5 text-xs"
          >
            {copilotMessages.map((m, idx) => (
              <div
                key={idx}
                className={cn(
                  'p-2.5 rounded-lg space-y-1',
                  m.sender === 'user'
                    ? 'bg-neutral-800 text-white ml-4'
                    : m.isError
                    ? 'bg-rose-950/40 border border-rose-500/30 text-rose-300 mr-4'
                    : 'bg-neutral-950 border border-neutral-800 text-neutral-200 mr-4'
                )}
              >
                <p className="font-semibold text-[10px] text-neutral-400">
                  {m.sender === 'user' ? 'Reviewer' : 'Pitchmic Copilot'}
                </p>
                <p className="whitespace-pre-line leading-relaxed">{m.text}</p>
              </div>
            ))}
            {copilotLoading && (
              <div className="p-2 rounded bg-neutral-950 text-neutral-400 animate-pulse text-[11px]">
                Auditing evidence graph...
              </div>
            )}
          </div>

          <div className="p-2 border-t border-neutral-800/80 flex flex-wrap gap-1">
            <button
              onClick={() => handleSendCopilot('Why did Pitchmic recommend an interview?')}
              className="px-2 py-0.5 rounded text-[10px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
            >
              Why interview?
            </button>
            <button
              onClick={() => handleSendCopilot('What downside risks could lead to rejection?')}
              className="px-2 py-0.5 rounded text-[10px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
            >
              Key risks?
            </button>
            <button
              onClick={() => handleSendCopilot('Summarise traction and LOI verification')}
              className="px-2 py-0.5 rounded text-[10px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
            >
              Traction audit
            </button>
          </div>

          <div className="p-2.5 border-t border-neutral-800 flex gap-1.5">
            <Input
              value={copilotQuery}
              onChange={(e) => setCopilotQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !copilotLoading && handleSendCopilot()}
              placeholder="Ask about this candidate…"
              disabled={copilotLoading}
              className="h-8 text-xs bg-neutral-950 border-neutral-800"
            />
            <Button
              size="sm"
              onClick={() => handleSendCopilot()}
              disabled={copilotLoading || !copilotQuery.trim()}
              className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </Card>

        {/* Reviewer Scorecard */}
        <Card className="bg-neutral-900/80 border-neutral-800">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Reviewer Scorecard
              </h4>
              {/* Dirty-state indicator */}
              {scoresTouched ? (
                <span className="flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                  Unsaved
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-neutral-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-600 inline-block" />
                  Not started
                </span>
              )}
            </div>

            {/* Role gate — founders can't submit reviews */}
            {!canReview ? (
              <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-neutral-300">
                    Reviewer access required
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    Scorecard submission is restricted to Accelerator and Investor accounts.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                {[
                  { key: 'founder', label: 'Founder DNA (1-10)' },
                  { key: 'product', label: 'Product & IP (1-10)' },
                  { key: 'market', label: 'Market Timing (1-10)' },
                  { key: 'traction', label: 'Traction Velocity (1-10)' },
                  { key: 'conviction', label: 'Personal Conviction (1-10)' },
                ].map((f) => (
                  <div key={f.key} className="flex items-center justify-between gap-2">
                    <span className="text-neutral-400">{f.label}</span>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      placeholder="—"
                      value={(reviewerScores as any)[f.key]}
                      onChange={(e) => handleScoreChange(f.key, e.target.value)}
                      className="w-14 bg-neutral-950 border border-neutral-800 rounded px-2 py-0.5 text-right font-mono text-white placeholder:text-neutral-600 focus:border-emerald-500 outline-none"
                    />
                  </div>
                ))}

                <div className="pt-2 border-t border-neutral-800">
                  <label className="text-[11px] text-neutral-400 block mb-1">
                    Recommendation
                  </label>
                  <select
                    value={reviewerScores.recommendation}
                    onChange={(e) => {
                      setReviewerScores((prev) => ({
                        ...prev,
                        recommendation: e.target.value as any,
                      }));
                      setScoreshTouched(true);
                      onScoresDirtyChange?.(true);
                    }}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs text-white focus:border-emerald-500 outline-none"
                  >
                    <option value="INTERVIEW">Interview</option>
                    <option value="REJECT">Reject</option>
                    <option value="WAITLIST">Waitlist</option>
                    <option value="NEEDS_MORE_INFO">Needs More Info</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-neutral-400 block mb-1">
                    Reviewer Notes
                  </label>
                  <textarea
                    rows={2}
                    value={reviewerScores.notes}
                    onChange={(e) => {
                      setReviewerScores((prev) => ({ ...prev, notes: e.target.value }));
                      setScoreshTouched(true);
                      onScoresDirtyChange?.(true);
                    }}
                    placeholder="Rationale, moat comments…"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-xs text-white focus:border-emerald-500 outline-none resize-none"
                  />
                </div>

                {/* Warn if scores are still blank */}
                {!scoresTouched && (
                  <div className="flex items-start gap-1.5 p-2 rounded bg-neutral-950 border border-neutral-800 text-[11px] text-neutral-400">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-neutral-500" />
                    Enter scores above before submitting. Blank scores will not be saved.
                  </div>
                )}

                <Button
                  size="sm"
                  onClick={() => {
                    onSubmitReview(reviewerScores);
                    setScoreshTouched(false);
                    onScoresDirtyChange?.(false);
                  }}
                  disabled={!scoresTouched || !applicationDetail}
                  className="w-full text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {scoresTouched ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      Submit Scorecard
                    </>
                  ) : (
                    'Complete scores to submit'
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
