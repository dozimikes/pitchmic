'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  Building2,
  CheckCircle2,
  Compass,
  FileCheck,
  Filter,
  Layers,
  Sparkles,
  Target,
  Users,
  Vote,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useIntelligence } from '@/app/(dashboard)/accelerator/IntelligenceContext';
import { ApplicationItem, AcceleratorProgram, EvaluationPolicyItem, acceleratorApi } from '@/lib/acceleratorApi';
import { cn } from '@/lib/utils';

interface SelectionMatrixViewProps {
  applications: ApplicationItem[];
  program: AcceleratorProgram | null;
  onSelectCandidate: (appId: number) => void;
}

export function SelectionMatrixView({
  applications,
  program,
  onSelectCandidate,
}: SelectionMatrixViewProps) {
  const { openIntelligenceDrawer } = useIntelligence();

  // Which weights a program scored by is a fact about its stored evaluation
  // policy, and a program may have none. Nothing below substitutes a set.
  const { data: policies = [] } = useQuery({
    queryKey: ['accelerator-policies', program?.id],
    queryFn: () => acceleratorApi.getPolicies(program?.id),
    enabled: !!program?.id,
  });

  const activePolicy: EvaluationPolicyItem | null =
    policies.find((p) => p.is_active) || policies[0] || null;

  // Funnel numbers derived from live applications
  const total = applications.length;
  const shortlisted = applications.filter((a) =>
    ['SHORTLISTED', 'INTERVIEW_INVITED', 'INTERVIEW_COMPLETE', 'COMMITTEE_REVIEW', 'ACCEPTED'].includes(a.status)
  ).length;
  const interviewed = applications.filter((a) =>
    ['INTERVIEW_COMPLETE', 'COMMITTEE_REVIEW', 'ACCEPTED'].includes(a.status)
  ).length;
  const committee = applications.filter((a) =>
    ['COMMITTEE_REVIEW', 'ACCEPTED'].includes(a.status)
  ).length;
  // A target the program set, or nothing at all. An unset capacity used to render
  // as "25 Seats" — a cohort size nobody chose, shown as if it were planned.
  const capacity: number | null =
    program?.target_cohort_size ? Number(program.target_cohort_size) : null;

  // Dynamic 2x2 Matrix classification of actual applications
  const FIT_THRESHOLD = 70;
  const QUALITY_THRESHOLD = 65;

  const priorityShortlist = applications.filter(
    (a) => (a.program_fit_score || 0) >= FIT_THRESHOLD && (a.startup_strength_score || 0) >= QUALITY_THRESHOLD
  );

  const investigatePivot = applications.filter(
    (a) => (a.program_fit_score || 0) < FIT_THRESHOLD && (a.startup_strength_score || 0) >= QUALITY_THRESHOLD
  );

  const evidenceGap = applications.filter(
    (a) => (a.program_fit_score || 0) >= FIT_THRESHOLD && (a.startup_strength_score || 0) < QUALITY_THRESHOLD
  );

  const rejectMonitor = applications.filter(
    (a) => (a.program_fit_score || 0) < FIT_THRESHOLD && (a.startup_strength_score || 0) < QUALITY_THRESHOLD
  );

  // The policy's own dimensions, in the order it stores them. A dimension whose
  // weight is missing reports "—" rather than being rounded into existence.
  const dimensionWeights: Array<{ label: string; weight: string; pct: number | null; color: string }> =
    React.useMemo(() => {
      const colors = ['bg-indigo-500', 'bg-purple-500', 'bg-emerald-500', 'bg-blue-500', 'bg-pink-500', 'bg-amber-500', 'bg-teal-500'];
      return (activePolicy?.scoring_dimensions ?? []).map((dim, idx) => {
        const pct = typeof dim.weight === 'number' && Number.isFinite(dim.weight)
          ? Math.round(dim.weight * 100)
          : null;
        const fallbackLabel = (dim.name || 'unnamed dimension')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
        return {
          label: dim.label || fallbackLabel,
          weight: pct === null ? '—' : `${pct}%`,
          pct,
          color: colors[idx % colors.length],
        };
      });
    }, [activePolicy]);

  return (
    <div className="space-y-8">
      
      {/* ── 5.0 Live Funnel Snapshot ─────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 text-xs font-semibold">
                Selection Intelligence Console
              </span>
              <span className="text-xs text-white/50">
                {activePolicy
                  ? `Policy ${activePolicy.version}${activePolicy.is_active ? '' : ' (not the active version)'}`
                  : 'No evaluation policy recorded'}
              </span>
            </div>
            <h2 className="text-xl font-extrabold text-white">
              {program?.name || 'Venture Accelerator'} Selection Pipeline
            </h2>
          </div>
          <div className="text-right">
            <span className="text-xs text-white/50 block">Target Cohort Capacity</span>
            <span className="text-xl font-black text-emerald-400">{capacity === null ? '—' : `${capacity} Seats`}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1 text-center">
          <div className="rounded-xl bg-white/[0.03] p-3 border border-white/5">
            <span className="text-[10px] text-white/40 uppercase font-bold">Applications</span>
            <div className="text-2xl font-black text-white mt-0.5">{total}</div>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-3 border border-white/5">
            <span className="text-[10px] text-white/40 uppercase font-bold">Shortlisted</span>
            <div className="text-2xl font-black text-indigo-300 mt-0.5">{shortlisted}</div>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-3 border border-white/5">
            <span className="text-[10px] text-white/40 uppercase font-bold">Interviewed</span>
            <div className="text-2xl font-black text-purple-300 mt-0.5">{interviewed}</div>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-3 border border-white/5">
            <span className="text-[10px] text-white/40 uppercase font-bold">Committee IC</span>
            <div className="text-2xl font-black text-emerald-400 mt-0.5">{committee}</div>
          </div>
          <div className="rounded-xl bg-emerald-500/10 p-3 border border-emerald-500/30">
            <span className="text-[10px] text-emerald-300 uppercase font-bold">Target Seats</span>
            <div className="text-2xl font-black text-emerald-400 mt-0.5">{capacity === null ? '—' : capacity}</div>
          </div>
        </div>
      </div>

      {/* ── 5.1 Dynamic 2x2 Selection Matrix Visual ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* The Matrix (8 Cols) */}
        <div className="lg:col-span-8 rounded-2xl border border-white/10 bg-[#0F1623] p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Compass className="h-4 w-4 text-indigo-400" />
              2x2 Selection Matrix: Quality vs Program Fit
            </h3>
            <span className="text-xs text-white/40">{applications.length} Candidates Positioned</span>
          </div>

          {/* 2x2 Quadrant Grid */}
          <div className="grid grid-cols-2 gap-3 min-h-[380px]">
            
            {/* Top-Left: High Quality / Low Fit (Investigate) */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                    Investigate / Pivot
                  </span>
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded">
                    {investigatePivot.length} Candidates
                  </span>
                </div>
                <p className="text-[11px] text-amber-200/70">
                  High Startup Strength (&ge;65%), but Low Program Fit (&lt;70%).
                </p>
              </div>

              <div className="space-y-1.5 pt-3 max-h-48 overflow-y-auto">
                {investigatePivot.length === 0 ? (
                  <span className="text-[11px] text-white/30 italic">No candidates in this quadrant.</span>
                ) : (
                  investigatePivot.map((app) => (
                    <button
                      key={app.id}
                      onClick={() => onSelectCandidate(app.id)}
                      className="w-full text-left p-2 rounded bg-black/40 hover:bg-black/60 text-xs text-white flex items-center justify-between transition"
                    >
                      <span className="truncate">{app.company_name}</span>
                      <span className="text-[10px] text-amber-400 font-mono shrink-0 ml-2">
                        Q: {Math.round(app.startup_strength_score)} | Fit: {Math.round(app.program_fit_score)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Top-Right: High Quality / High Fit (PRIORITY) */}
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex flex-col justify-between shadow-inner">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                    Priority Shortlist
                  </span>
                  <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/30 px-2 py-0.5 rounded">
                    {priorityShortlist.length} Candidates
                  </span>
                </div>
                <p className="text-[11px] text-emerald-200/80">
                  High Quality (&ge;65%) &amp; High Fit (&ge;70%). Direct pipeline to IC.
                </p>
              </div>

              <div className="space-y-1.5 pt-3 max-h-48 overflow-y-auto">
                {priorityShortlist.length === 0 ? (
                  <span className="text-[11px] text-white/30 italic">No candidates in this quadrant.</span>
                ) : (
                  priorityShortlist.map((app) => (
                    <button
                      key={app.id}
                      onClick={() => onSelectCandidate(app.id)}
                      className="w-full text-left p-2 rounded bg-emerald-950/40 hover:bg-emerald-900/50 text-xs text-white flex items-center justify-between border border-emerald-500/30 transition"
                    >
                      <span className="font-bold truncate">{app.company_name}</span>
                      <span className="text-[10px] text-emerald-400 font-mono font-bold shrink-0 ml-2">
                        Q: {Math.round(app.startup_strength_score)} | Fit: {Math.round(app.program_fit_score)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Bottom-Left: Low Quality / Low Fit (Reject / Monitor) */}
            <div className="rounded-xl border border-white/5 bg-black/40 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white/40 uppercase tracking-wider">
                    Reject / Monitor
                  </span>
                  <span className="text-[10px] font-bold text-white/40 bg-white/5 px-1.5 py-0.5 rounded">
                    {rejectMonitor.length} Candidates
                  </span>
                </div>
                <p className="text-[11px] text-white/40">
                  Below threshold for both execution strength and cohort mandate.
                </p>
              </div>

              <div className="space-y-1.5 pt-3 max-h-48 overflow-y-auto">
                {rejectMonitor.length === 0 ? (
                  <span className="text-[11px] text-white/30 italic">No candidates in this quadrant.</span>
                ) : (
                  rejectMonitor.map((app) => (
                    <button
                      key={app.id}
                      onClick={() => onSelectCandidate(app.id)}
                      className="w-full text-left p-1.5 rounded bg-white/5 hover:bg-white/10 text-xs text-white/70 flex items-center justify-between transition"
                    >
                      <span className="truncate">{app.company_name}</span>
                      <span className="text-[10px] text-white/40 font-mono shrink-0 ml-2">
                        Fit: {Math.round(app.program_fit_score)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Bottom-Right: Low Quality / High Fit (Evidence Gap) */}
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                    Evidence Gap / Re-request
                  </span>
                  <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/20 px-1.5 py-0.5 rounded">
                    {evidenceGap.length} Candidates
                  </span>
                </div>
                <p className="text-[11px] text-indigo-200/70">
                  High Program Fit (&ge;70%), but requires evidence verification.
                </p>
              </div>

              <div className="space-y-1.5 pt-3 max-h-48 overflow-y-auto">
                {evidenceGap.length === 0 ? (
                  <span className="text-[11px] text-white/30 italic">No candidates in this quadrant.</span>
                ) : (
                  evidenceGap.map((app) => (
                    <button
                      key={app.id}
                      onClick={() => onSelectCandidate(app.id)}
                      className="w-full text-left p-2 rounded bg-black/40 hover:bg-black/60 text-xs text-white flex items-center justify-between transition"
                    >
                      <span className="truncate">{app.company_name}</span>
                      <span className="text-[10px] text-indigo-300 font-mono shrink-0 ml-2">
                        Q: {Math.round(app.startup_strength_score)} | Fit: {Math.round(app.program_fit_score)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 5.2 Program DNA & Weighted Policy Evaluation (4 Cols) */}
        <div className="lg:col-span-4 rounded-2xl border border-white/10 bg-[#0F1623] p-6 shadow-xl space-y-5">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Target className="h-4 w-4 text-purple-400" />
              Program DNA Evaluation Policy
            </h3>
            <p className="text-xs text-white/50 mt-0.5">
              {activePolicy
                ? `Stored as policy version ${activePolicy.version}${activePolicy.created_by_email ? `, written by ${activePolicy.created_by_email}` : ''}.`
                : 'No policy is stored for this program, so the weights it scored by are not recorded.'}
            </p>
          </div>

          {dimensionWeights.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3 text-xs text-white/50">
              {activePolicy
                ? 'This policy version carries no scoring dimensions. Nothing is shown in their place.'
                : 'A policy is written when a program is set up. This screen does not guess one.'}
            </p>
          ) : (
            <div className="space-y-2.5">
              {dimensionWeights.map((dim, idx) => (
                <div key={idx} className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-white/80">{dim.label}</span>
                    <span className="font-bold text-white">{dim.weight}</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', dim.color)}
                      style={{ width: dim.pct === null ? 0 : `${dim.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-white/10 text-xs text-white/40 space-y-1">
            <span className="font-semibold text-white/70 block">Program focus, as recorded:</span>
            <div>• Sectors: <span className="text-white/80 font-bold">{program?.sector_focus || '—'}</span></div>
            <div>• Geography: <span className="text-white/80 font-bold">{program?.geography_focus || '—'}</span></div>
            <div>• Capital model: <span className="text-indigo-400 font-bold">{program?.capital_model || '—'}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
