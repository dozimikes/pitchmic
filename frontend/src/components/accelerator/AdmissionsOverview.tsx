'use client';

import * as React from 'react';
import {
  Award,
  ChevronRight,
  Sliders,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { ApplicationItem, PipelineData, AcceleratorProgram } from '@/lib/acceleratorApi';

// TabType is the union used in the parent page; kept explicit here so the
// compiler catches any invalid tab name passed via onNavigateTab.
type TabType = 'overview' | 'pipeline' | 'reviewer' | 'committee' | 'cohort' | 'marketplace';

interface AdmissionsOverviewProps {
  program: AcceleratorProgram | undefined;
  pipelineData: PipelineData | undefined;
  applications: ApplicationItem[];
  selectedAppId: number | null;
  onSelectApp: (id: number) => void;
  onNavigateTab: (tab: TabType) => void;
}

export function AdmissionsOverview({
  program,
  pipelineData,
  applications,
  selectedAppId,
  onSelectApp,
  onNavigateTab,
}: AdmissionsOverviewProps) {
  // ── Derived counts ────────────────────────────────────────────────────────
  const total = pipelineData?.total_applications ?? applications.length;
  const tierA = pipelineData?.tiers?.A ?? 0;
  const tierB = pipelineData?.tiers?.B ?? 0;
  const tierC = pipelineData?.tiers?.C ?? 0;
  const avgFit = pipelineData?.avg_fit ?? null;
  const avgEvidence = pipelineData?.avg_evidence_confidence ?? null;

  // Minor #14 — disjoint funnel counts: each bucket contains only applications
  // that are *currently* in the corresponding stage, not a cumulative set of
  // everything that passed through. Users reading a funnel diagram expect
  // "screening" count = apps currently sitting in screening, distinct from
  // shortlisted. Conversion rates = pass-rate from the immediately previous
  // gate so each stage's % is meaningful (e.g. shortlist % = apps that made it
  // out of screening into shortlist, not % of total pipeline).
  const inboundSubmitted = applications.filter((a) => a.status === 'SUBMITTED').length;
  const inScreeningStage = applications.filter((a) => a.status === 'SCREENING').length;
  const shortlistedStage = applications.filter((a) => a.status === 'SHORTLISTED').length;
  const interviewStage = applications.filter((a) =>
    ['INTERVIEW_INVITED', 'INTERVIEW_COMPLETE'].includes(a.status)
  ).length;
  const committeeStage = applications.filter((a) => a.status === 'COMMITTEE_REVIEW').length;
  const acceptedStage = applications.filter((a) => a.status === 'ACCEPTED').length;
  // Disposition totals so the funnel sums back to the total (users can see
  // exactly where "missing" applicants ended up — not just the happy path).
  const rejected = applications.filter((a) => a.status === 'REJECTED').length;
  const withdrawn = applications.filter((a) => a.status === 'WITHDRAWN').length;
  const waitlisted = applications.filter((a) => a.status === 'DEFERRED_WAITLIST').length;
  const dispositionsTotal = rejected + withdrawn + waitlisted;

  // Pass-rate = apps in this stage / apps that reached the prior stage.
  // Guards against division-by-zero.
  const pass = (cur: number, prev: number) =>
    prev > 0 ? `${Math.round((cur / prev) * 100)}%` : '—';
  // Percentage of total inbound for orientation.
  const ofTotal = (cur: number) => pct(cur, total);
  const pct = (num: number, denom: number) =>
    denom > 0 ? `${Math.round((num / denom) * 100)}%` : '—';

  // Priority queue: only Tier A and B
  const priorityApps = applications.filter((a) =>
    a.automated_screening_tier === 'A' || a.automated_screening_tier === 'B'
  );

  return (
    <div className="space-y-6">
      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {
            label: 'Total Inbound',
            val: total,
            sub: 'All program cycles',
          },
          {
            label: 'Tier A Priority',
            val: tierA,
            sub: 'Highly aligned + high evidence',
            highlight: true,
          },
          {
            label: 'Tier B Qualified',
            val: tierB,
            sub: 'Solid fundamentals',
          },
          {
            label: 'Tier C Review Needed',
            val: tierC,
            sub: 'Evidence gaps pending',
          },
          {
            label: 'Avg Program Fit',
            val: avgFit !== null ? `${avgFit}%` : '—',
            sub: 'Thesis calibration',
          },
          {
            label: 'Avg Evidence Confidence',
            val: avgEvidence !== null ? `${avgEvidence}%` : '—',
            sub: 'Audit verification score',
          },
        ].map((kpi, idx) => (
          <Card key={idx} className="bg-neutral-900/70 border-neutral-800">
            <CardContent className="p-4">
              <p className="text-xs text-neutral-400">{kpi.label}</p>
              <p
                className={cn(
                  'text-2xl font-bold mt-1',
                  kpi.highlight ? 'text-emerald-400' : 'text-white'
                )}
              >
                {kpi.val}
              </p>
              <p className="text-[10px] text-neutral-500 mt-1 truncate">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Funnel visualization ───────────────────────────────────────────── */}
      <Card className="bg-neutral-900/60 border-neutral-800">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">Institutional Admissions Funnel</h3>
              <p className="text-xs text-neutral-400">
                Progressive gating from intake through dual-interview rounds to Selection Committee verdict.
              </p>
            </div>
            <Badge
              variant="outline"
              className="border-neutral-700 text-neutral-300 font-mono text-xs"
            >
              Target Cohort: {program?.target_cohort_size ?? '—'} Startups
            </Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 pt-2">
            {[
              {
                stage: '1. Inbound Intake',
                count: inboundSubmitted,
                conversionLabel: 'of total',
                conversionVal: ofTotal(inboundSubmitted),
                color: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
              },
              {
                stage: '2. Forensic Screening',
                count: inScreeningStage,
                conversionLabel: 'pass from intake',
                conversionVal: pass(inScreeningStage, inboundSubmitted),
                color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
              },
              {
                stage: '3. Shortlisted',
                count: shortlistedStage,
                conversionLabel: 'pass from screening',
                conversionVal: pass(shortlistedStage, inScreeningStage),
                color: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
              },
              {
                stage: '4. Dual Interviews',
                count: interviewStage,
                conversionLabel: 'pass from shortlist',
                conversionVal: pass(interviewStage, shortlistedStage),
                color: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
              },
              {
                stage: '5. Committee IC',
                count: committeeStage,
                conversionLabel: 'pass from interview',
                conversionVal: pass(committeeStage, interviewStage),
                color: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
              },
              {
                stage: '6. Batch Enrolled',
                count: acceptedStage,
                conversionLabel: 'accept from IC',
                conversionVal: pass(acceptedStage, committeeStage),
                color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
              },
            ].map((s, idx) => (
              <div
                key={idx}
                className={cn('p-3 rounded-lg border text-center space-y-1', s.color)}
              >
                <p className="text-[11px] font-medium">{s.stage}</p>
                <p className="text-xl font-bold font-mono">{s.count}</p>
                <p className="text-[10px] opacity-75">
                  {s.conversionVal} {s.conversionLabel}
                </p>
              </div>
            ))}
          </div>

          {/* Minor #14 — disposition breakout so the funnel accounts for 100% of
              applicants. Without this, users can't tell whether "missing" counts
              between stages were rejected, withdrawn, or waitlisted. */}
          {dispositionsTotal > 0 && (
            <div className="grid grid-cols-4 gap-2 pt-3 border-t border-neutral-800">
              {[
                {
                  label: 'Rejected',
                  val: rejected,
                  color: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
                },
                {
                  label: 'Waitlisted',
                  val: waitlisted,
                  color: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
                },
                {
                  label: 'Founder Withdrawn',
                  val: withdrawn,
                  color: 'bg-neutral-700/30 text-neutral-300 border-neutral-600',
                },
                {
                  label: 'Total Dispositions',
                  val: dispositionsTotal,
                  sub: `${ofTotal(dispositionsTotal)} of inbound`,
                  color: 'bg-neutral-800/60 text-neutral-200 border-neutral-700',
                },
              ].map((d, idx) => (
                <div
                  key={idx}
                  className={cn('p-2.5 rounded-lg border text-center', d.color)}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
                    {d.label}
                  </p>
                  <p className="text-lg font-bold font-mono mt-0.5">{d.val}</p>
                  {(d as any).sub && (
                    <p className="text-[10px] opacity-75 mt-0.5">{(d as any).sub}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Priority queue + rubric matrix ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Priority queue — Tier A & B only */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-400" />
              Priority Admissions Queue (Tier A &amp; B)
            </h3>
            <button
              onClick={() => onNavigateTab('reviewer')}
              className="text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors"
              aria-label="Open Reviewer Workspace tab"
            >
              Open Reviewer Workspace →
            </button>
          </div>

          {priorityApps.length === 0 ? (
            <div className="p-8 rounded-xl border border-neutral-800 bg-neutral-900/40 text-center">
              <p className="text-sm text-neutral-500">No Tier A or B applications yet.</p>
              <p className="text-xs text-neutral-600 mt-1">
                Applications will appear here once the admissions engine assigns a tier.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {priorityApps.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => {
                    onSelectApp(app.id);
                    onNavigateTab('reviewer');
                  }}
                  aria-label={`Open ${app.company_name} in Reviewer Workspace`}
                  className={cn(
                    'w-full text-left p-4 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group',
                    selectedAppId === app.id
                      ? 'bg-emerald-950/20 border-emerald-500/50'
                      : 'bg-neutral-900/60 border-neutral-800 hover:border-emerald-500/40 hover:bg-neutral-900'
                  )}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white text-base">{app.company_name}</span>
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded text-[11px] font-bold',
                          app.automated_screening_tier === 'A'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        )}
                      >
                        Tier {app.automated_screening_tier}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[11px] bg-neutral-800 text-neutral-300 font-mono">
                        {app.status}
                      </span>
                      {app.stage_conflict_detected && (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Stage Divergence
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-400">
                      Program: {app.program_name} · Inferred Stage:{' '}
                      <span className="font-mono text-neutral-200">
                        {app.inferred_stage.toUpperCase()}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-6 shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-neutral-400">Program Fit</p>
                      <p className="text-base font-bold text-emerald-400 font-mono">
                        {app.program_fit_score.toFixed(0)}%
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-neutral-400">Evidence Conf.</p>
                      <p className="text-base font-bold text-blue-400 font-mono">
                        {app.evidence_confidence_score.toFixed(0)}%
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-neutral-400">Startup Strength</p>
                      <p className="text-base font-bold text-purple-400 font-mono">
                        {app.startup_strength_score.toFixed(0)}%
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-neutral-500 group-hover:text-emerald-400 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Program Rubric Matrix */}
        <Card className="bg-neutral-900/60 border-neutral-800">
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              Program Rubric Matrix
            </h3>
            {program ? (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-neutral-800/80">
                  <span className="text-neutral-400">Organization</span>
                  <span className="text-white font-medium">{program.organization_name}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-neutral-800/80">
                  <span className="text-neutral-400">Funding Offer</span>
                  <span className="text-emerald-400 font-mono font-medium">
                    ${Number(program.funding_amount_usd).toLocaleString()} for {program.equity_offered_pct}%
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-neutral-800/80">
                  <span className="text-neutral-400">Workflow Model</span>
                  <span className="text-white font-medium">
                    {program.workflow_style === 'yc_style'
                      ? 'YC-Style (Rapid 48hr)'
                      : 'Techstars (Multi-Stage Committee)'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-neutral-800/80">
                  <span className="text-neutral-400">Duration</span>
                  <span className="text-white font-medium">
                    {program.program_duration_weeks} Weeks
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-neutral-800/80">
                  <span className="text-neutral-400">Remote / Hub</span>
                  <span className="text-white font-medium">
                    {program.is_remote ? 'Remote-Friendly / Hybrid' : 'In-Person'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-neutral-800/80">
                  <span className="text-neutral-400">Target Focus</span>
                  <span className="text-neutral-300 truncate max-w-[180px]">
                    {program.sector_focus}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-neutral-500">No program selected.</p>
            )}

            <div className="pt-2">
              <p className="text-[11px] text-neutral-400 font-medium mb-2">
                Automated Forensics Active
              </p>
              <div className="space-y-1 text-[11px] text-neutral-300">
                {[
                  'Stage Inference vs Declared Contradiction Engine',
                  'Structured Claim Extraction (LOIs, MRR, Team)',
                  'Multi-Reviewer Disagreement Detection',
                  'Evidence Request Delta Tracking',
                ].map((label) => (
                  <p key={label} className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    {label}
                  </p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
