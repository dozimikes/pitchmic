'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  GitBranch,
  Inbox,
  Link2,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveProgram } from '../ProgramContext';
import {
  acceleratorApi,
  type ApplicationItem,
  type EvidenceGraph,
} from '@/lib/acceleratorApi';

type Tab = 'signals' | 'evidence' | 'contradictions';
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'signals', label: 'Attention Signals', icon: Activity },
  { id: 'evidence', label: 'Evidence Graph', icon: GitBranch },
  { id: 'contradictions', label: 'Contradictions', icon: AlertTriangle },
];

// Characterize a 0-100 dimension as reviewer evidence — never a black-box verdict.
function level(score: number): { label: string; cls: string } {
  if (score >= 75) return { label: 'Strong evidence', cls: 'text-emerald-700 bg-emerald-600/10 border-emerald-500/20' };
  if (score >= 55) return { label: 'Moderate evidence', cls: 'text-sky-700 bg-sky-600/10 border-sky-500/20' };
  if (score >= 35) return { label: 'Limited evidence', cls: 'text-amber-700 bg-amber-600/10 border-amber-500/20' };
  return { label: 'Requires validation', cls: 'text-rose-700 bg-rose-600/10 border-rose-500/20' };
}

const STATUS_CHIP: Record<string, string> = {
  verified: 'bg-emerald-600/10 text-emerald-700 border-emerald-500/20',
  contradicted: 'bg-rose-600/10 text-rose-700 border-rose-500/20',
  partially_verified: 'bg-sky-600/10 text-sky-700 border-sky-500/20',
  unverified: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
};

function statusChipCls(status: string): string {
  return STATUS_CHIP[status] ?? STATUS_CHIP.unverified;
}

function prettify(value?: string | null): string {
  if (!value) return '—';
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);

export default function IntelligencePage() {
  return (
    <React.Suspense fallback={null}>
      <IntelligenceInner />
    </React.Suspense>
  );
}

function IntelligenceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeProgram, activeProgramId } = useActiveProgram();
  const pid = activeProgramId ?? null;

  const initialTab: Tab = (() => {
    const t = searchParams.get('tab') as Tab | null;
    return t && TABS.some((x) => x.id === t) ? t : 'signals';
  })();
  const [tab, setTab] = React.useState<Tab>(initialTab);
  React.useEffect(() => setTab(initialTab), [initialTab]);

  const switchTab = (next: Tab) => {
    setTab(next);
    router.replace(`/accelerator/intelligence?tab=${next}`, { scroll: false });
  };

  const { data: rawApplications = [], isLoading } = useQuery({
    queryKey: ['accelerator-applications', pid],
    queryFn: () => acceleratorApi.getApplications(pid ?? undefined),
    enabled: pid != null,
  });
  const applications: ApplicationItem[] = Array.isArray(rawApplications)
    ? rawApplications
    : (rawApplications as any)?.results ?? [];

  // ── Program-level signal counters (evidence-framed, not a score) ──────────
  const stats = React.useMemo(() => {
    const total = applications.length;
    const unverifiedSum = applications.reduce((acc, a) => acc + num(a.unverified_claims), 0);
    const stageConflicts = applications.filter((a) => a.stage_conflict_detected).length;
    const weakEvidence = applications.filter((a) => num(a.evidence_confidence_score) < 45).length;
    const avgFit = total
      ? Math.round(applications.reduce((acc, a) => acc + num(a.program_fit_score), 0) / total)
      : 0;
    return { total, unverifiedSum, stageConflicts, weakEvidence, avgFit };
  }, [applications]);

  // ── Attention ranking ──────────────────────────────────────────────────────
  const attention = React.useMemo(() => {
    return applications
      .map((a) => ({
        app: a,
        score:
          num(a.unverified_claims) +
          (a.stage_conflict_detected ? 2 : 0) +
          (num(a.evidence_confidence_score) < 45 ? 1 : 0),
      }))
      .filter((r) => r.score > 0)
      .sort((x, y) => y.score - x.score);
  }, [applications]);

  // ── Evidence / contradictions tab: application selection ──────────────────
  // Default: the application with the most unverified claims.
  const topUnverifiedId = React.useMemo(() => {
    let best: number | null = null;
    let bestCount = -1;
    for (const a of applications) {
      if (num(a.unverified_claims) > bestCount) {
        bestCount = num(a.unverified_claims);
        best = a.id;
      }
    }
    return best;
  }, [applications]);

  const [evidenceAppId, setEvidenceAppId] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (evidenceAppId == null && topUnverifiedId != null) setEvidenceAppId(topUnverifiedId);
  }, [topUnverifiedId, evidenceAppId]);

  const { data: graph, isFetching: graphLoading } = useQuery({
    queryKey: ['accelerator-evidence-graph', evidenceAppId],
    queryFn: () =>
      acceleratorApi
        .getEvidenceGraph(evidenceAppId as number)
        .catch(() => null) as Promise<EvidenceGraph | null>,
    enabled: evidenceAppId != null,
  });

  const [contradictionAppId, setContradictionAppId] = React.useState<number | null>(null);
  const conflictApps = React.useMemo(
    () => applications.filter((a) => a.stage_conflict_detected),
    [applications]
  );
  React.useEffect(() => {
    if (conflictApps.length > 0 && (contradictionAppId == null || !conflictApps.some((a) => a.id === contradictionAppId))) {
      setContradictionAppId(conflictApps[0].id);
    }
  }, [conflictApps, contradictionAppId]);

  const { data: rawDisagreements, isFetching: disLoading } = useQuery({
    queryKey: ['accelerator-disagreements', contradictionAppId],
    queryFn: () => acceleratorApi.getDisagreements(contradictionAppId as number).catch(() => []),
    enabled: contradictionAppId != null,
  });
  const disagreements: any[] = Array.isArray(rawDisagreements)
    ? rawDisagreements
    : (rawDisagreements as any)?.results ?? [];

  const evidenceApp = applications.find((a) => a.id === evidenceAppId) ?? null;

  if (pid == null) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 p-4 lg:p-8 space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-sm text-slate-500">
          Select an active program to view its screening intelligence.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 lg:p-8 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight">Screening Intelligence</h1>
          <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-indigo-600/10 text-indigo-700 border border-indigo-500/20">
            Signals &amp; Evidence
          </span>
        </div>
        <p className="text-sm text-slate-500 max-w-2xl">
          Program-level signal map for {activeProgram?.name ?? 'the active program'}: where evidence is
          missing, where claims contradict, and where reviewers disagree. Pitchmic ranks human
          attention — humans make the decisions.
        </p>
      </div>

      {/* Signal stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Applications', value: stats.total, sub: 'in program pipeline' },
          { label: 'Unverified claims', value: stats.unverifiedSum, sub: 'awaiting evidence' },
          { label: 'Stage conflicts', value: stats.stageConflicts, sub: 'declared vs inferred stage' },
          { label: 'Weak evidence', value: stats.weakEvidence, sub: 'evidence confidence < 45' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-2xl font-black">{s.value}</p>
            <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">{s.label}</p>
            <p className="mt-1 text-[11px] text-slate-500">{s.sub}</p>
          </div>
        ))}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-2xl font-black">{stats.avgFit}</p>
          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Avg program fit</p>
          <span
            className={cn(
              'mt-1 inline-block px-2 py-0.5 rounded text-[11px] font-bold border',
              level(stats.avgFit).cls
            )}
          >
            {level(stats.avgFit).label}
          </span>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const activeTab = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold border transition-colors',
                activeTab
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
          Loading program signals…
        </div>
      ) : stats.total === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Inbox className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-semibold">No applications in this program yet</p>
            <p className="text-xs text-slate-500 max-w-sm">
              Signals appear once applications are screened and claims are extracted.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* ── SIGNALS TAB ─────────────────────────────────────────────────── */}
          {tab === 'signals' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-indigo-600" />
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">
                  Where to look next
                </h3>
                <span className="text-[11px] text-slate-400">
                  ranked by unverified claims, stage conflicts and weak evidence
                </span>
              </div>
              {attention.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  No applications need extra attention right now — every extracted claim has support.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {attention.map(({ app, score }) => (
                    <li key={app.id} className="p-3.5 bg-white flex flex-wrap items-center gap-3">
                      <span className="w-6 h-6 shrink-0 rounded-full bg-indigo-600/10 border border-indigo-500/20 text-indigo-700 text-[11px] font-black grid place-items-center">
                        {score}
                      </span>
                      <div className="flex-1 min-w-[180px]">
                        <p className="text-sm font-bold">{app.company_name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase border border-slate-500/20 bg-slate-500/10 text-slate-600">
                            Tier {app.automated_screening_tier ?? '—'}
                          </span>
                          {num(app.unverified_claims) > 0 && (
                            <span className="px-1.5 py-0.5 rounded border border-amber-500/20 bg-amber-600/10 text-amber-700 font-semibold">
                              {num(app.unverified_claims)} unverified claim{num(app.unverified_claims) === 1 ? '' : 's'}
                            </span>
                          )}
                          {app.stage_conflict_detected && (
                            <span className="px-1.5 py-0.5 rounded border border-rose-500/20 bg-rose-600/10 text-rose-700 font-semibold">
                              stage conflict
                            </span>
                          )}
                          {num(app.evidence_confidence_score) < 45 && (
                            <span className="px-1.5 py-0.5 rounded border border-slate-500/20 bg-slate-500/10 text-slate-600 font-semibold">
                              limited evidence
                            </span>
                          )}
                        </div>
                      </div>
                      <Link
                        href={`/accelerator/applications/${app.id}`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:text-indigo-500"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        Open analysis
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── EVIDENCE TAB ────────────────────────────────────────────────── */}
          {tab === 'evidence' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <GitBranch className="h-4 w-4 text-indigo-600" />
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">
                  Evidence graph
                </h3>
                <label className="ml-auto flex items-center gap-2 text-xs text-slate-500">
                  Application
                  <select
                    value={evidenceAppId ?? ''}
                    onChange={(e) => setEvidenceAppId(Number(e.target.value))}
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 max-w-[240px]"
                  >
                    {applications.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.company_name} ({num(a.unverified_claims)} unverified)
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {evidenceAppId == null ? (
                <p className="py-6 text-center text-sm text-slate-500">No applications available.</p>
              ) : graphLoading ? (
                <div className="flex items-center gap-3 text-sm text-slate-500 py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                  Loading evidence graph…
                </div>
              ) : !graph || (graph.claims ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  No evidence extracted yet — run screening analysis for{' '}
                  <span className="font-semibold text-slate-700">{evidenceApp?.company_name ?? 'this application'}</span>.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {graph.claims.map((claim) => (
                    <li key={claim.claim_id ?? claim.id} className="p-3.5 bg-white">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-sm font-semibold flex-1 min-w-[200px]">
                          {claim.statement || '(claim without statement)'}
                        </p>
                        <span
                          className={cn(
                            'shrink-0 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border',
                            statusChipCls(claim.verification_status)
                          )}
                        >
                          {prettify(claim.verification_status)}
                        </span>
                      </div>
                      {claim.verification_status === 'contradicted' && claim.discrepancy_notes?.trim() && (
                        <p className="mt-1.5 text-xs text-rose-700 bg-rose-600/5 border border-rose-500/20 rounded-lg px-2.5 py-1.5">
                          {claim.discrepancy_notes}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── CONTRADICTIONS TAB ──────────────────────────────────────────── */}
          {tab === 'contradictions' && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] items-start">
              {/* Stage-conflict applications */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">
                  Stage conflicts · {conflictApps.length}
                </h3>
                {conflictApps.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-500">
                    No declared-vs-inferred stage conflicts detected in this program.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {conflictApps.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setContradictionAppId(a.id)}
                          className={cn(
                            'w-full text-left rounded-xl border px-3 py-2.5 transition-colors',
                            a.id === contradictionAppId
                              ? 'bg-rose-600/10 border-rose-500/30'
                              : 'border-slate-200 hover:bg-slate-50'
                          )}
                        >
                          <span className="flex items-center gap-2 text-sm font-bold">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                            {a.company_name}
                          </span>
                          <span className="mt-1 block text-[11px] text-slate-500">
                            Inferred stage: <span className="font-semibold text-slate-700">{prettify(a.inferred_stage)}</span>
                            {a.stage ? ` · declared: ${prettify(a.stage)}` : ''}
                          </span>
                          <span className="mt-1 block text-[11px] text-slate-500">
                            Screening reports the founder&apos;s stated stage and the evidence-inferred stage diverge — verify before deciding.
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Reviewer disagreements for the selected application */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">
                    Reviewer disagreements
                  </h3>
                  {contradictionAppId != null && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-indigo-600/10 text-indigo-700 border border-indigo-500/20">
                      {applications.find((a) => a.id === contradictionAppId)?.company_name ?? `Application #${contradictionAppId}`}
                    </span>
                  )}
                </div>
                {contradictionAppId == null ? (
                  <p className="py-4 text-center text-sm text-slate-500">
                    Select a conflicted application to inspect reviewer disagreement rows.
                  </p>
                ) : disLoading ? (
                  <div className="flex items-center gap-3 text-sm text-slate-500 py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                    Loading disagreements…
                  </div>
                ) : disagreements.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-500">
                    No reviewer disagreements recorded for this application yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {disagreements.map((d: any, i: number) => (
                      <li key={d?.id ?? `dis-${i}`} className="rounded-xl border border-amber-500/30 bg-amber-600/5 p-3.5">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-bold">{String(d?.reviewer_a ?? d?.reviewer_1 ?? d?.reviewer_name ?? 'Reviewer')}</span>
                          <span className="text-slate-500">vs</span>
                          <span className="font-bold">{String(d?.reviewer_b ?? d?.reviewer_2 ?? 'other reviewer')}</span>
                          {(d?.dimension ?? d?.field ?? d?.score_field) != null && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase border border-slate-500/20 bg-white text-slate-600">
                              {prettify(d?.dimension ?? d?.field ?? d?.score_field ?? '')}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
                          {(d?.score_a ?? d?.value_a) != null && (
                            <span>A scored {String(d?.score_a ?? d?.value_a ?? '')}</span>
                          )}
                          {(d?.score_b ?? d?.value_b) != null && (
                            <span>B scored {String(d?.score_b ?? d?.value_b ?? '')}</span>
                          )}
                          {(d?.divergence ?? d?.gap) != null && (
                            <span>gap: {String(d?.divergence ?? d?.gap ?? '')}</span>
                          )}
                        </div>
                        {(d?.notes ?? d?.reason) && (
                          <p className="mt-1 text-xs text-slate-500">{String(d?.notes ?? d?.reason ?? '')}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
