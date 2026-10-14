'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  Brain,
  Building2,
  Calendar,
  CheckCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Database,
  ExternalLink,
  FileCheck2,
  FileText,
  Fingerprint,
  Layers,
  MapPin,
  Scale,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  Vote,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useIntelligence } from '@/app/(dashboard)/accelerator/IntelligenceContext';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { acceleratorApi, CandidateCard, ApplicationClaim } from '@/lib/acceleratorApi';
import { evidenceLevelShort, formatDateTime, qk } from '@/lib/screening';
import { AssignReviewerDialog } from '@/components/accelerator/ReviewerAssignments';
import { ClaimVerificationDialog } from '@/components/accelerator/applications/ClaimVerificationDialog';

interface ApplicationDossierDrawerProps {
  candidateId: number | null;
  onClose: () => void;
  onPromoteToDecisionRoom?: (id: number) => void;
  onAdvanceStage?: (id: number, stage: string) => void;
}

export function ApplicationDossierDrawer({
  candidateId,
  onClose,
  onPromoteToDecisionRoom,
  onAdvanceStage,
}: ApplicationDossierDrawerProps) {
  const { openIntelligenceDrawer, openEvidenceDrawer } = useIntelligence();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState<'OVERVIEW' | 'CLAIMS_GRAPH' | 'INTELLIGENCE' | 'REVIEWERS'>('OVERVIEW');
  /** The claim whose verification decision is being taken, kept as the two
   *  things the dialog reads rather than the row it was opened from. The state
   *  list, the labels and what each state asks for are read from the server with
   *  the claim, so this screen never keeps a copy of the vocabulary. */
  const [verifyingClaim, setVerifyingClaim] = React.useState<{ id: number; text: string } | null>(null);

  // Fetch live candidate card from backend
  const { data: candidateCard, isLoading: loadingCard } = useQuery({
    queryKey: ['candidate-card', candidateId],
    queryFn: () => acceleratorApi.getCandidateCard(candidateId!),
    enabled: !!candidateId,
  });

  // Fetch live application detail
  const { data: appDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['application-detail', candidateId],
    queryFn: () => acceleratorApi.getApplicationDetail(candidateId!),
    enabled: !!candidateId,
  });

  if (!candidateId) return null;

  const companyName = candidateCard?.company_name || appDetail?.company_name || `Application #${candidateId}`;
  const sector = candidateCard?.sector || appDetail?.sector || '—';
  const stage = candidateCard?.stage || appDetail?.startup_profile?.declared_stage || '—';
  const location = candidateCard?.country || appDetail?.country || '—';
  const status = candidateCard?.status || appDetail?.status || '—';
  const weightedScore = candidateCard?.scores?.weighted_score ?? null;
  const programFit = appDetail?.program_fit_score ?? candidateCard?.scores?.program_fit_score ?? null;
  const reviewers = candidateCard?.reviewers || [];
  const claims = candidateCard?.claims || [];

  // Map the backend claim verification_status enum to the drawer's status type.
  const claimDrawerStatus = (verificationStatus?: string): 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED' | 'CONTRADICTED' | 'FLAGGED' => {
    switch (verificationStatus) {
      case 'verified': return 'VERIFIED';
      case 'partially_verified': return 'PARTIALLY_VERIFIED';
      case 'contradicted': return 'CONTRADICTED';
      case 'flagged': return 'FLAGGED';
      default: return 'UNVERIFIED';
    }
  };

  const handlePromote = () => {
    if (onPromoteToDecisionRoom) {
      onPromoteToDecisionRoom(candidateId);
    }
    toast({
      title: 'Candidate Promoted to Decision Room',
      description: `${companyName} was placed into the Investment Committee consensus docket.`,
      variant: 'success',
    });
    onClose();
  };

  const handleInviteInterview = () => {
    if (onAdvanceStage) {
      onAdvanceStage(candidateId, 'INTERVIEW_INVITED');
    }
    toast({
      title: 'Interview Scheduled',
      description: `Partner interview invitation sent to ${companyName}.`,
      variant: 'success',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/70 backdrop-blur-xs transition-opacity duration-200">
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-8 sm:pl-16">
        <div className="w-screen max-w-3xl border-l border-white/10 bg-[#0F1623] text-white shadow-2xl flex flex-col justify-between">
          
          {/* Header */}
          <div className="border-b border-white/10 px-6 py-5 bg-[#0B0F17]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 font-black text-white text-lg shadow-md">
                  {companyName.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold tracking-tight text-white">
                      {companyName}
                    </h2>
                    <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300 border border-indigo-500/30 uppercase">
                      {status}
                    </span>
                  </div>
                  <p className="text-xs text-white/50">
                    {candidateCard?.description || `${sector} · ${stage} · ${location}`}
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="rounded-lg p-2 text-white/40 hover:bg-white/10 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Quick Metrics Strip */}
            <div className="mt-4 grid grid-cols-4 gap-2 pt-3 border-t border-white/5 text-center">
              <div className="rounded-lg bg-white/5 p-2">
                <span className="text-[10px] text-white/40 uppercase font-semibold">Program Fit</span>
                <div className="text-lg font-black text-indigo-400">
                  {programFit !== null ? `${Math.round(programFit)} / 100` : 'No data yet'}
                </div>
              </div>
              <div className="rounded-lg bg-white/5 p-2">
                <span className="text-[10px] text-white/40 uppercase font-semibold">Tier</span>
                <div className="text-lg font-black text-emerald-400">
                  {candidateCard?.automated_screening_tier ? `Tier ${candidateCard.automated_screening_tier}` : 'Unrated'}
                </div>
              </div>
              <div className="rounded-lg bg-white/5 p-2">
                <span className="text-[10px] text-white/40 uppercase font-semibold">Weighted Score</span>
                <div className="text-lg font-black text-purple-300">
                  {weightedScore !== null ? `${Math.round(weightedScore)}%` : 'No data yet'}
                </div>
              </div>
              <div className="rounded-lg bg-white/5 p-2">
                <span className="text-[10px] text-white/40 uppercase font-semibold">Reviews</span>
                <div className="text-lg font-black text-white">{reviewers.length} Submitted</div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="mt-4 flex border-b border-white/10 gap-1 text-xs">
              {[
                { id: 'OVERVIEW', label: 'Overview & Profile' },
                { id: 'CLAIMS_GRAPH', label: `Claims & Evidence (${claims.length})` },
                { id: 'INTELLIGENCE', label: 'Evaluation Dimensions' },
                { id: 'REVIEWERS', label: `Reviewers (${reviewers.length})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    'px-3.5 py-2 font-semibold transition border-b-2 -mb-px',
                    activeTab === tab.id
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-white/50 hover:text-white'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {loadingCard || loadingDetail ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              </div>
            ) : (
              <>
                {/* ── Tab 1: Overview ──────────────────────────────────────── */}
                {activeTab === 'OVERVIEW' && (
                  <div className="space-y-6">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-white/60">
                        Application Metadata
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                        <div>
                          <span className="text-white/40 block">Sector Focus</span>
                          <span className="font-semibold text-white">{sector}</span>
                        </div>
                        <div>
                          <span className="text-white/40 block">Declared Stage</span>
                          <span className="font-semibold text-white">{stage}</span>
                        </div>
                        <div>
                          <span className="text-white/40 block">Location</span>
                          <span className="font-semibold text-white flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-indigo-400" />
                            {location}
                          </span>
                        </div>
                        <div>
                          <span className="text-white/40 block">Submission Date</span>
                          <span className="font-semibold text-white">
                            {appDetail?.submitted_at ? new Date(appDetail.submitted_at).toLocaleDateString() : 'Not recorded'}
                          </span>
                        </div>
                        <div>
                          <span className="text-white/40 block">Total Claims Extracted</span>
                          <span className="font-semibold text-white">{claims.length} claims</span>
                        </div>
                        <div>
                          {/* This number counts filed scorecards, not asks —
                              the two are different facts (see the Reviewers
                              tab for who the program asked). */}
                          <span className="text-white/40 block">Scorecards Filed</span>
                          <span className="font-semibold text-white">{reviewers.length} human evaluation{reviewers.length === 1 ? '' : 's'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Gate & eligibility signals — derived from real screening fields */}
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-white/60">
                          Gate &amp; Eligibility Signals
                        </h3>
                        <span className="rounded bg-white/10 text-white/50 px-2 py-0.5 text-[10px] font-bold">
                          ML surfaces signals · humans decide
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/5">
                          <span className="text-white/80">Eligibility Score</span>
                          <span className="font-bold text-[11px] text-white/80">
                            {typeof appDetail?.eligibility_score === 'number'
                              ? `${Math.round(appDetail.eligibility_score)}/100 · ${evidenceLevelShort(appDetail.eligibility_score)}`
                              : 'No data yet'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/5">
                          <span className="text-white/80">Stage Conflict Flag</span>
                          <span className={cn(
                            'font-bold text-[11px]',
                            appDetail?.stage_conflict_detected ? 'text-amber-400' : 'text-white/60'
                          )}>
                            {appDetail?.stage_conflict_detected
                              ? 'Conflict flagged — human check needed'
                              : typeof appDetail?.stage_conflict_detected === 'boolean'
                              ? 'No conflict flagged'
                              : 'No data yet'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/5">
                          <span className="text-white/80">Application Completeness</span>
                          <span className="font-bold text-[11px] text-white/80">
                            {typeof appDetail?.application_completeness_score === 'number'
                              ? `${Math.round(appDetail.application_completeness_score)}%`
                              : 'No data yet'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/5">
                          <span className="text-white/80">Unverified Claims</span>
                          <span className="font-bold text-[11px] text-white/80">
                            {claims.filter((c: any) => c.verification_status === 'unverified' || c.verification_status === 'pending').length}
                            {' / '}{claims.length} extracted
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Tab 2: Claims & Evidence Graph ──────────────────────── */}
                {activeTab === 'CLAIMS_GRAPH' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-white/60">
                        Extracted Claims &amp; Verification States
                      </h3>
                      <span className="text-xs text-white/40">{claims.length} total claims recorded</span>
                    </div>

                    {claims.length === 0 ? (
                      <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-xs text-white/40">
                        <Database className="mx-auto h-8 w-8 text-white/20 mb-2" />
                        No structured claims extracted yet for this application.
                      </div>
                    ) : (
                      claims.map((claim: any, idx: number) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-white/10 bg-[#0B0F17] p-4 space-y-2 hover:border-white/20 transition"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                              {claim.category || 'Claim'}
                            </span>
                            <span className={cn(
                              'rounded px-2 py-0.5 text-[10px] font-bold uppercase',
                              claim.verification_status === 'verified' ? 'bg-emerald-500/20 text-emerald-400' :
                              claim.verification_status === 'contradicted' ? 'bg-rose-500/20 text-rose-400' :
                              'bg-amber-500/20 text-amber-400'
                            )}>
                              {claim.verification_status || 'Pending'}
                            </span>
                          </div>

                          <div className="text-sm font-semibold text-white">
                            &ldquo;{claim.claim_text}&rdquo;
                          </div>

                          {claim.discrepancy_notes && (
                            <div className="rounded bg-amber-500/10 border border-amber-500/20 p-2 text-xs text-amber-200">
                              <strong>Discrepancy:</strong> {claim.discrepancy_notes}
                            </div>
                          )}

                          <div className="flex items-center justify-between text-[11px] text-white/40 pt-1">
                            <span>Source: {claim.source || 'Founder application form'}</span>
                            <span className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setVerifyingClaim({ id: claim.id, text: claim.claim_text })}
                              className="h-6 text-[10px] text-emerald-300 hover:text-white"
                            >
                              {claim.verification_status === 'pending' ? 'Record verification' : 'Change decision'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                // Populate strictly from the real claim record's verification fields.
                                const verifiedText = claim.verified_value
                                  ? typeof claim.verified_value === 'string'
                                    ? claim.verified_value
                                    : JSON.stringify(claim.verified_value)
                                  : null;
                                openEvidenceDrawer({
                                  title: `${companyName} - ${claim.category || 'Claim'}`,
                                  claimant: companyName,
                                  status: claimDrawerStatus(claim.verification_status),
                                  declared: {
                                    source: claim.source || 'Founder application form',
                                    value: claim.claim_text,
                                  },
                                  supporting: verifiedText
                                    ? [{ source: 'Verification record (verified value)', value: verifiedText, status: 'MATCH' }]
                                    : [],
                                  observed: claim.discrepancy_notes
                                    ? [{ source: 'Verification record (discrepancy notes)', value: claim.discrepancy_notes, status: 'DISCREPANCY' }]
                                    : [],
                                  notes: claim.discrepancy_notes || undefined,
                                  confidence: typeof claim.confidence === 'number' ? Math.round(claim.confidence) : 0,
                                });
                              }}
                              className="h-6 text-[10px] text-indigo-300 hover:text-white"
                            >
                              Inspect Graph →
                            </Button>
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ── Tab 3: Intelligence Dimensions ──────────────────────── */}
                {activeTab === 'INTELLIGENCE' && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white/60">
                      Program Policy Evaluation Dimension Scores
                    </h3>

                    {(() => {
                      // Rows come from the program's own Selection Framework via the
                      // server (name/label/weight/score). A weight is never a score —
                      // a dimension with no score shows a dash, not weight*100.
                      const rows = candidateCard?.dimension_scores ?? [];
                      if (rows.length === 0) {
                        return (
                          <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-xs text-white/40">
                            <Brain className="mx-auto h-8 w-8 text-white/20 mb-2" />
                            This program has no Selection Framework dimensions yet.
                          </div>
                        );
                      }
                      return (
                        <div className="grid grid-cols-2 gap-3">
                          {rows.map((d) => (
                            <div key={d.name} className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] text-white/50 uppercase">{d.label}</span>
                                <span className="text-[10px] text-white/30">Weight {Math.round(d.weight * 100)}%</span>
                              </div>
                              <div className="text-2xl font-black text-indigo-400">
                                {Number.isFinite(d.score) ? `${Math.round(d.score)} / 100` : '—'}
                              </div>
                              {d.description ? (
                                <p className="text-[11px] leading-snug text-white/40">{d.description}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* ── Tab 4: Reviewer Assessments ─────────────────────────── */}
                {activeTab === 'REVIEWERS' && (
                  <div className="space-y-4">
                    {/* Asking a reviewer, setting their deadline and recusing
                        are writes against one list — that list lives on the
                        application page, so this drawer links to it instead of
                        showing a second copy that can go stale. */}
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-[11px] leading-snug text-white/50">
                        Everything below is a filed scorecard. Who the program{' '}
                        <span className="text-white/70">asked</span>, their deadlines and recusals are recorded on
                        the application page.
                      </p>
                      <Link
                        href={`/accelerator/applications/${candidateId}?tab=reviews`}
                        className="shrink-0 rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-semibold text-indigo-200 hover:bg-indigo-500/20"
                      >
                        Manage reviewers <ArrowRight className="ml-0.5 inline h-3 w-3" />
                      </Link>
                    </div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-white/60">
                        Submitted Reviewer Scorecards
                      </h3>
                      <span className="text-xs text-white/40">{reviewers.length} Reviews</span>
                    </div>

                    {reviewers.length === 0 ? (
                      <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-xs text-white/40">
                        <Users className="mx-auto h-8 w-8 text-white/20 mb-2" />
                        No reviewer assessments submitted yet.
                      </div>
                    ) : (
                      reviewers.map((rev: any, idx: number) => (
                        <div key={idx} className="rounded-xl border border-white/10 bg-[#0B0F17] p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="h-7 w-7 rounded-full bg-indigo-500/20 text-indigo-300 font-bold text-xs flex items-center justify-center">
                                {rev.reviewer_name?.charAt(0) || 'R'}
                              </span>
                              <span className="text-xs font-bold text-white">{rev.reviewer_name}</span>
                            </div>
                            <span className="text-xs font-bold text-emerald-400">
                              {rev.recommendation} (Conviction: {rev.overall_conviction}/10)
                            </span>
                          </div>

                          {rev.notes && (
                            <p className="text-xs text-white/70 italic bg-black/20 p-2 rounded">
                              &ldquo;{rev.notes}&rdquo;
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer Action Strip */}
          <div className="border-t border-white/10 px-6 py-4 bg-[#0B0F17] flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="border-white/15 bg-white/5 text-white hover:bg-white/10 text-xs"
            >
              Close Dossier
            </Button>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleInviteInterview}
                className="border-white/20 bg-white/5 text-white hover:bg-white/10 text-xs"
              >
                Schedule Interview
              </Button>

              <Button
                size="sm"
                onClick={handlePromote}
                className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold text-xs shadow-md"
              >
                <Vote className="h-3.5 w-3.5 mr-1.5" />
                Advance to Decision Room
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ClaimVerificationDialog
        open={verifyingClaim !== null}
        onOpenChange={(next) => { if (!next) setVerifyingClaim(null); }}
        claimId={verifyingClaim?.id ?? null}
        claimText={verifyingClaim?.text ?? ''}
      />
    </div>
  );
}
