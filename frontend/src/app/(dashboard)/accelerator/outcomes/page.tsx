'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Database,
  Eye,
  History,
  Layers,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Target,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { acceleratorApi, ApplicationItem } from '@/lib/acceleratorApi';
import { useActiveProgram } from '../ProgramContext';

type Tab = 'screening' | 'memory' | 'outcomes';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'screening', label: 'Screening Effectiveness' },
  { key: 'memory', label: 'Program Screening Memory' },
  { key: 'outcomes', label: 'Cohort Outcomes' },
];

const FUNNEL_STAGES = [
  'SUBMITTED',
  'SCREENING',
  'SHORTLISTED',
  'INTERVIEW_INVITED',
  'INTERVIEW_COMPLETE',
  'COMMITTEE_REVIEW',
  'ACCEPTED',
];

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.eE+-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function display(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return '—';
  return String(v);
}

function shortDate(v: unknown): string {
  const s = typeof v === 'string' ? v.slice(0, 10) : '';
  return s || '—';
}

function prettyStatus(s: string): string {
  return s
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

export default function OutcomesPage() {
  const { toast } = useToast();
  const { activeProgram, activeProgramId: pid } = useActiveProgram();
  const [tab, setTab] = React.useState<Tab>('screening');

  // ?tab= deep-link support without useSearchParams (avoids Suspense requirement)
  React.useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'memory' || t === 'outcomes' || t === 'screening') setTab(t);
  }, []);

  const switchTab = React.useCallback((t: Tab) => {
    setTab(t);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', t);
      window.history.replaceState(null, '', url.toString());
    } catch {
      // non-critical — URL sync only
    }
  }, []);

  // Screening diagnostics source: the live application list
  const appsQuery = useQuery({
    queryKey: ['accelerator-applications', pid],
    queryFn: () =>
      acceleratorApi
        .getApplications(pid ?? undefined)
        .catch(() => {
          throw new Error('Failed to load applications');
        }),
    enabled: pid != null,
  });

  const memoryQuery = useQuery({
    queryKey: ['program-memory', pid],
    queryFn: () =>
      acceleratorApi
        .osList<Record<string, any>>('program-memory', pid ?? undefined)
        .catch(() => {
          throw new Error('Failed to load program memory');
        }),
    enabled: pid != null,
  });

  const outcomesQuery = useQuery({
    queryKey: ['program-outcomes', pid],
    queryFn: () =>
      acceleratorApi
        .osList<Record<string, any>>('outcomes', pid ?? undefined)
        .catch(() => {
          throw new Error('Failed to load outcomes');
        }),
    enabled: pid != null,
  });

  const refetchAll = () => {
    appsQuery.refetch();
    memoryQuery.refetch();
    outcomesQuery.refetch();
    toast({ title: 'Refreshed', description: 'Learning-loop data reloaded.', variant: 'info' });
  };

  // ── Screening effectiveness computations (review diagnostics) ──────────────
  const apps: ApplicationItem[] = React.useMemo(() => appsQuery.data ?? [], [appsQuery.data]);

  const diagnostics = React.useMemo(() => {
    const total = apps.length;
    const reviewed = apps.filter((a) => (a.reviewer_count ?? 0) > 0).length;
    const coveragePct = total > 0 ? Math.round((reviewed / total) * 100) : 0;
    const uncertaintyWatch = apps.filter(
      (a) => a.stage_conflict_detected === true || (a.unverified_claims ?? 0) > 0
    ).length;
    const evidenceThin = apps.filter(
      (a) => typeof a.evidence_confidence_score === 'number' && a.evidence_confidence_score < 45
    ).length;
    const stageConflict = apps.filter((a) => a.stage_conflict_detected === true).length;
    const withUnverified = apps.filter((a) => (a.unverified_claims ?? 0) > 0).length;
    const funnel = FUNNEL_STAGES.map((s) => ({
      status: s,
      count: apps.filter((a) => (a.status ?? '').toUpperCase() === s).length,
    }));
    return { total, reviewed, coveragePct, uncertaintyWatch, evidenceThin, stageConflict, withUnverified, funnel };
  }, [apps]);

  // ── Outcome aggregates (computed only from numeric fields actually present) ─
  const outcomes: Record<string, any>[] = React.useMemo(() => outcomesQuery.data ?? [], [outcomesQuery.data]);

  const outcomeAgg = React.useMemo(() => {
    let fundingSum = 0;
    let fundingCount = 0;
    let revenueCount = 0;
    let survivedCount = 0;
    for (const r of outcomes) {
      const f = toNum(r.funding_raised);
      if (f != null) {
        fundingSum += f;
        fundingCount += 1;
      }
      const rev = toNum(r.revenue);
      if (rev != null && rev > 0) revenueCount += 1;
      const surv = r.survived ?? r.status;
      if (surv === true || String(surv ?? '').toLowerCase().match(/surviv|active|alive/)) survivedCount += 1;
    }
    return { fundingSum, fundingCount, revenueCount, survivedCount };
  }, [outcomes]);

  const memory: Record<string, any>[] = React.useMemo(() => memoryQuery.data ?? [], [memoryQuery.data]);

  const loading = (q: { isLoading: boolean }) => q.isLoading && pid != null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl lg:text-3xl font-black tracking-tight">Outcomes &amp; Learning Loop</h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-indigo-600/10 text-indigo-700 border border-indigo-500/20">
              Program Screening Memory
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            How well screening is working, what the committee learned, and how the cohort is doing afterwards — for{' '}
            <span className="font-semibold text-slate-700">{activeProgram?.name ?? 'the active program'}</span>.
            These are review diagnostics, not per-company accept/reject scores.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refetchAll}
          className="bg-white text-indigo-600 border-indigo-500/30 hover:bg-indigo-50 w-fit"
          leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
        >
          Refresh
        </Button>
      </div>

      {/* Segmented tab control */}
      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={cn(
              'px-3 lg:px-4 py-1.5 rounded-lg text-xs lg:text-sm font-bold transition-colors',
              tab === t.key
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {pid == null ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-sm text-slate-500">
          No active program selected. Choose a program to view its learning-loop data.
        </div>
      ) : (
        <>
          {tab === 'screening' && (
            <section className="space-y-6">
              {loading(appsQuery) ? (
                <LoadingCard label="Computing screening diagnostics…" />
              ) : appsQuery.isError ? (
                <ErrorCard
                  label="Could not load applications for screening diagnostics."
                  onRetry={() => appsQuery.refetch()}
                />
              ) : diagnostics.total === 0 ? (
                <EmptyCard label="No applications in this program yet — screening diagnostics need at least one application." />
              ) : (
                <>
                  {/* Diagnostic stat cards */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Eye className="h-4 w-4 text-indigo-600" />
                        <span className="text-[11px] font-bold uppercase tracking-wider">Human Review Coverage</span>
                      </div>
                      <div className="mt-3 text-3xl font-black tracking-tight">{diagnostics.coveragePct}%</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {diagnostics.reviewed} of {diagnostics.total} applications have at least one reviewer.
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-600"
                          style={{ width: `${diagnostics.coveragePct}%` }}
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center gap-2 text-slate-500">
                        <ShieldAlert className="h-4 w-4 text-amber-600" />
                        <span className="text-[11px] font-bold uppercase tracking-wider">Uncertainty Watchlist</span>
                      </div>
                      <div className="mt-3 text-3xl font-black tracking-tight">{diagnostics.uncertaintyWatch}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Applications with a detected stage conflict ({diagnostics.stageConflict}) or unverified claims
                        ({diagnostics.withUnverified}) — historically these need more evidence before a call.
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center gap-2 text-slate-500">
                        <AlertTriangle className="h-4 w-4 text-rose-600" />
                        <span className="text-[11px] font-bold uppercase tracking-wider">Evidence Thinness</span>
                      </div>
                      <div className="mt-3 text-3xl font-black tracking-tight">{diagnostics.evidenceThin}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Applications with evidence confidence below 45 — candidates for evidence requests rather than
                        fast decisions.
                      </div>
                    </div>
                  </div>

                  {/* Selection funnel snapshot */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <ArrowUpDown className="h-4 w-4 text-indigo-600" />
                      <h2 className="text-sm font-black uppercase tracking-wider text-slate-700">
                        Selection Funnel Snapshot
                      </h2>
                    </div>
                    <div className="space-y-2">
                      {diagnostics.funnel.map((f) => {
                        const max = Math.max(1, ...diagnostics.funnel.map((x) => x.count));
                        return (
                          <div key={f.status} className="flex items-center gap-3">
                            <div className="w-44 shrink-0 text-xs font-bold text-slate-600">{prettyStatus(f.status)}</div>
                            <div className="flex-1 h-5 rounded-md bg-slate-100 overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-md',
                                  f.status === 'ACCEPTED' ? 'bg-emerald-500' : 'bg-indigo-500'
                                )}
                                style={{ width: `${Math.round((f.count / max) * 100)}%` }}
                              />
                            </div>
                            <div className="w-10 shrink-0 text-right text-sm font-black tabular-nums">{f.count}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Honest framing explainer */}
                  <div className="rounded-2xl border border-indigo-500/20 bg-indigo-50/50 p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="h-4 w-4 text-indigo-600" />
                      <h2 className="text-sm font-black uppercase tracking-wider text-indigo-900">
                        Reading These Diagnostics
                      </h2>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      A program judges whether screening surfaces the right candidates using recall (did strong
                      eventual performers reach interview?) and override rate (how often the committee disagrees with
                      the automated tier). Both need post-decision outcomes, so until enough cohort history exists,
                      <span className="font-semibold text-slate-800"> coverage and uncertainty are the honest proxies</span>:
                      low review coverage means most calls rest on automation alone, and a large uncertainty
                      watchlist means screening is passing forward evidence that reviewers still cannot verify.
                      Nothing here scores individual companies for accept/reject.
                    </p>
                  </div>
                </>
              )}
            </section>
          )}

          {tab === 'memory' && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <History className="h-4 w-4 text-indigo-600" />
                Institutional screening memory — patterns, exceptions and lessons the program has recorded.
              </div>
              {loading(memoryQuery) ? (
                <LoadingCard label="Loading program memory…" />
              ) : memoryQuery.isError ? (
                <ErrorCard label="Could not load program memory." onRetry={() => memoryQuery.refetch()} />
              ) : memory.length === 0 ? (
                <EmptyCard label="No memory entries recorded yet for this program." />
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {memory.map((item, idx) => (
                    <div key={item.id ?? idx} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-sm font-black tracking-tight">
                          {display(item.title ?? item.entry_type ?? 'Memory entry')}
                        </h3>
                        <span className="shrink-0 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-indigo-600/10 text-indigo-700 border border-indigo-500/20">
                          {display(item.signal_type ?? item.entry_type ?? 'note')}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                        {display(item.summary ?? item.content ?? '') === '—'
                          ? 'No description recorded.'
                          : display(item.summary ?? item.content ?? '')}
                      </p>
                      <div className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        {shortDate(item.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === 'outcomes' && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <TrendingUp className="h-4 w-4 text-indigo-600" />
                What happened to companies after the decision — the ground truth that makes screening measurable.
              </div>
              {loading(outcomesQuery) ? (
                <LoadingCard label="Loading cohort outcomes…" />
              ) : outcomesQuery.isError ? (
                <ErrorCard label="Could not load outcome records." onRetry={() => outcomesQuery.refetch()} />
              ) : outcomes.length === 0 ? (
                <EmptyCard label="No outcome records reported for this cohort yet." />
              ) : (
                <>
                  {/* Aggregates — only shown when the underlying numeric data exists */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Funding Reported
                      </div>
                      <div className="mt-2 text-2xl font-black tracking-tight text-emerald-600">
                        {outcomeAgg.fundingCount > 0
                          ? `$${Math.round(outcomeAgg.fundingSum).toLocaleString()}`
                          : '—'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Across {outcomeAgg.fundingCount} of {outcomes.length} outcome records.
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Revenue-Generating
                      </div>
                      <div className="mt-2 text-2xl font-black tracking-tight">{outcomeAgg.revenueCount}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Records reporting revenue above zero ({outcomes.length} total).
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Surviving</div>
                      <div className="mt-2 text-2xl font-black tracking-tight">{outcomeAgg.survivedCount}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Marked survived / active in outcome records.
                      </div>
                    </div>
                  </div>

                  {/* Outcome records table */}
                  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-5 pt-5 pb-3">
                      <Database className="h-4 w-4 text-indigo-600" />
                      <h2 className="text-sm font-black uppercase tracking-wider text-slate-700">Outcome Records</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-t border-slate-200 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            <th className="px-5 py-2.5">Company</th>
                            <th className="px-5 py-2.5">Status</th>
                            <th className="px-5 py-2.5">Funding Raised</th>
                            <th className="px-5 py-2.5">Revenue</th>
                            <th className="px-5 py-2.5">Hired</th>
                            <th className="px-5 py-2.5">Survived</th>
                            <th className="px-5 py-2.5">Recorded</th>
                          </tr>
                        </thead>
                        <tbody>
                          {outcomes.map((r, idx) => (
                            <tr key={r.id ?? idx} className="border-t border-slate-100 hover:bg-slate-50/60">
                              <td className="px-5 py-3 font-bold text-slate-900">
                                {display(r.company_name ?? r.application ?? 'Outcome record')}
                              </td>
                              <td className="px-5 py-3 text-slate-600">{display(r.status)}</td>
                              <td className="px-5 py-3 tabular-nums text-slate-600">
                                {r.funding_raised == null ? '—' : display(r.funding_raised)}
                              </td>
                              <td className="px-5 py-3 tabular-nums text-slate-600">
                                {r.revenue == null ? '—' : display(r.revenue)}
                              </td>
                              <td className="px-5 py-3 text-slate-600">{display(r.hired)}</td>
                              <td className="px-5 py-3 text-slate-600">
                                {r.survived == null ? '—' : r.survived ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Yes
                                  </span>
                                ) : (
                                  <span className="font-bold text-rose-600">No</span>
                                )}
                              </td>
                              <td className="px-5 py-3 text-slate-400 text-xs font-semibold">
                                {shortDate(r.created_at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ── Small presentational helpers ──────────────────────────────────────────────

function LoadingCard({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-3 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
      {label}
    </div>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 shadow-sm text-center">
      <Layers className="mx-auto h-6 w-6 text-slate-300" />
      <div className="mt-3 text-sm font-semibold text-slate-600">Nothing here yet</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}

function ErrorCard({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
      <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
      <div className="flex-1 text-sm text-rose-800 font-semibold">{label}</div>
      <button
        onClick={onRetry}
        className="w-fit px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white"
      >
        Retry
      </button>
    </div>
  );
}
