'use client';

/**
 * Analytics & Reports — selection-pipeline measurement.
 *
 * Guardrails on this screen:
 *  1. Pool-wide numbers (totals, funnel, tiers, distributions, week deltas)
 *     come from the server `screening_summary` aggregate, which sees the whole
 *     program. The applications list paginates, so rows are only ever used for
 *     explicitly-labelled SAMPLE diagnostics — never presented as pool truth.
 *  2. A metric that cannot be derived from real API data renders as
 *     "Not enough data yet" with the reason, not as an invented number.
 *  3. Metrics describe the pipeline and the model's attention routing. They
 *     never score companies and never replace a reviewer's decision.
 */

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  BarChart3,
  CheckCircle2,
  Clock,
  Database,
  Download,
  Eye,
  Gauge,
  History,
  Layers,
  Link2,
  Loader2,
  PieChart,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { acceleratorApi, type ApplicationItem } from '@/lib/acceleratorApi';
import { useActiveProgram } from '../ProgramContext';
import {
  STATUS_REACHED_RANK,
  evidenceLevel,
  apiErrMessage,
  downloadCsv,
  formatDateTime,
  qk,
  type CohortDeltaKey,
  type NameCount,
  type StrengthRow,
} from '@/lib/screening';

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'screening' | 'diversity' | 'conversion' | 'outcomes';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'screening', label: 'Screening' },
  { key: 'diversity', label: 'Diversity' },
  { key: 'conversion', label: 'Conversion' },
  { key: 'outcomes', label: 'Outcomes' },
];

const CHART_COLORS = ['#4f46e5', '#059669', '#d97706', '#e11d48', '#0284c7', '#7c3aed', '#0d9488', '#64748b'];

/** Rank at which a human has clearly taken over the decision (shortlist+). */
const HUMAN_ADVANCED_RANK = 3;
/** Lanes the model treats as "surfaced for attention first". */
const PRIORITY_TIERS = new Set(['A', 'B']);

// ── Small utilities ───────────────────────────────────────────────────────────

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

/** Divide-by-zero-safe percentage; null means "no denominator yet". */
function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/** Null-safe emptiness check for loosely-typed (any) JSON payload fields. */
const missing = (v: unknown): boolean => v === null || v === undefined;

const pctText = (v: number | null) => (v === null ? '—' : `${v}%`);

/**
 * Donut segments that sum to exactly 100%: every slice is rounded down from the
 * real share and the final slice absorbs the rounding remainder.
 */
function toSegments(dist: NameCount[]) {
  const list = dist.slice(0, 6);
  const rest = dist.slice(6).reduce((acc, d) => acc + d.count, 0);
  const merged = rest > 0 ? [...list, { name: 'Other', count: rest }] : list;
  const sum = merged.reduce((acc, d) => acc + d.count, 0);
  if (sum <= 0) return { segments: [] as Array<{ label: string; count: number; share: number; color: string; start: number; end: number }>, sum: 0 };
  let acc = 0;
  const segments = merged.map((d, i) => {
    const start = acc;
    const raw = Math.round((d.count / sum) * 100);
    const span =
      i === merged.length - 1 ? Math.max(0, 100 - start) : Math.max(0, Math.min(raw, 100 - start));
    acc = start + span;
    return {
      label: d.name,
      count: d.count,
      share: span,
      color: CHART_COLORS[i % CHART_COLORS.length],
      start,
      end: start + span,
    };
  });
  return { segments, sum };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  // useSearchParams forces a client-side render boundary under App Router.
  return (
    <React.Suspense fallback={null}>
      <AnalyticsInner />
    </React.Suspense>
  );
}

function AnalyticsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeProgram, activeProgramId: pid } = useActiveProgram();

  const tabFromUrl = React.useMemo<Tab>(() => {
    const t = searchParams.get('tab');
    return t && TABS.some((x) => x.key === t) ? (t as Tab) : 'overview';
  }, [searchParams]);
  const [tab, setTab] = React.useState<Tab>(tabFromUrl);
  React.useEffect(() => setTab(tabFromUrl), [tabFromUrl]);

  const switchTab = React.useCallback(
    (t: Tab) => {
      setTab(t);
      router.replace(`/accelerator/analytics?tab=${t}`, { scroll: false });
    },
    [router]
  );

  // ── Server aggregates: whole-pool truth, one request ─────────────────────
  const summaryQuery = useQuery({
    queryKey: qk.screeningSummary(pid),
    queryFn: () => acceleratorApi.getScreeningSummary(pid ?? undefined),
    enabled: pid !== null,
  });
  const summary = summaryQuery.isSuccess ? summaryQuery.data : undefined;

  // ── Row sample: only for explicitly-labelled sample diagnostics ──────────
  const sampleKey = React.useMemo(() => [...qk.applications(pid), 'sample'] as const, [pid]);
  const sampleQuery = useQuery({
    queryKey: sampleKey,
    queryFn: () => acceleratorApi.getApplicationsPaged(pid ?? undefined, { page_size: 100 }),
    enabled: pid !== null,
  });
  const sample: ApplicationItem[] = React.useMemo(() => sampleQuery.data?.results ?? [], [sampleQuery.data]);
  const serverRowCount = sampleQuery.data?.count ?? summary?.total ?? 0;
  const sampleBasis =
    sample.length > 0
      ? `Sampled from the ${sample.length} most recently updated of ${serverRowCount} applications`
      : 'No application rows loaded yet';
  const sampleError = sampleQuery.isError
    ? apiErrMessage(sampleQuery.error, 'Could not load application rows, so sample metrics are unavailable.')
    : undefined;

  // ── Non-core endpoints: never blank the page ────────────────────────────
  const calibrationQuery = useQuery({
    queryKey: ['reviewer-calibration', pid],
    queryFn: () => acceleratorApi.getReviewerCalibration(pid ?? 0).catch(() => null),
    enabled: pid !== null,
  });
  const outcomesQuery = useQuery({
    queryKey: ['program-outcomes', pid],
    queryFn: () => acceleratorApi.osList<Record<string, any>>('outcomes', pid ?? undefined).catch(() => null),
    enabled: pid !== null,
  });
  const memoryQuery = useQuery({
    queryKey: ['program-memory', pid],
    queryFn: () =>
      acceleratorApi.osList<Record<string, any>>('program-memory', pid ?? undefined).catch(() => null),
    enabled: pid !== null,
  });

  const calibration = calibrationQuery.data ?? null;
  const outcomes: Record<string, any>[] = React.useMemo(() => outcomesQuery.data ?? [], [outcomesQuery.data]);
  const memory: Record<string, any>[] = React.useMemo(() => memoryQuery.data ?? [], [memoryQuery.data]);

  // ── Server funnel + conversion math ───────────────────────────────────────
  const funnel = React.useMemo(() => summary?.funnel ?? [], [summary]);
  const funnelBase = funnel[0]?.count ?? 0;

  const conversion = React.useMemo(() => {
    const rows = funnel.slice(1).map((to, i) => {
      const from = funnel[i];
      return {
        from: from.label,
        to: to.label,
        fromCount: from.count,
        count: to.count,
        retained: pct(to.count, from.count),
      };
    });
    const scored = rows
      .map((r, i) => ({ i, v: r.retained }))
      .filter((x): x is { i: number; v: number } => x.v !== null);
    const worstIdx = scored.length
      ? scored.reduce((worst, cur) => (cur.v < scored[worst].v ? cur.i : worst), 0)
      : -1;
    return { rows, worstIdx };
  }, [funnel]);

  // ── Overview KPIs — all server counters ───────────────────────────────────
  const overview = React.useMemo(() => {
    if (!summary) return null;
    const rated = ['A', 'B', 'C', 'D'].reduce((n, k) => n + (summary.tiers[k] ?? 0), 0);
    const weekDiff = summary.week_new - summary.prev_week_new;
    return {
      total: summary.total,
      processed: summary.processed,
      processedPct: pct(summary.processed, summary.total),
      reviewQueue: summary.review_queue,
      reviewQueuePct: pct(summary.review_queue, summary.total),
      accepted: summary.by_status.ACCEPTED ?? 0,
      rated,
      ratedPct: pct(rated, summary.total),
      weekNew: summary.week_new,
      weekDiff,
    };
  }, [summary]);

  // ── Screening diagnostics ─────────────────────────────────────────────────
  const screening = React.useMemo(() => {
    const advanced = sample.filter((a) => (STATUS_REACHED_RANK[a.status] ?? 0) >= HUMAN_ADVANCED_RANK);
    const surfaced = advanced.filter((a) => PRIORITY_TIERS.has(a.automated_screening_tier ?? ''));
    const recall = pct(surfaced.length, advanced.length);
    const withClaims = sample.filter((a) => (a.total_claims ?? 0) > 0);
    const claims = withClaims.reduce((s, a) => s + (a.total_claims ?? 0), 0);
    const verified = withClaims.reduce((s, a) => s + (a.verified_claims ?? 0), 0);
    return {
      advanced: advanced.length,
      recall,
      falseNegative: recall === null ? null : 100 - recall,
      claims,
      evidenceAccuracy: pct(verified, claims),
      reviewCoverage: pct(sample.filter((a) => (a.reviewer_count ?? 0) > 0).length, sample.length),
    };
  }, [sample]);

  const attentionLanes = React.useMemo(
    () =>
      summary
        ? [
            { label: 'Priority (tier A)', count: summary.attention.priority, color: 'bg-indigo-500' },
            { label: 'Uncertain (thin evidence)', count: summary.attention.uncertain, color: 'bg-amber-500' },
            { label: 'Contradictory signals', count: summary.attention.contradictory, color: 'bg-rose-500' },
            {
              label: 'Missing evidence (3+ unverified)',
              count: summary.attention.missing_evidence,
              color: 'bg-sky-500',
            },
            { label: 'Reviewer holds', count: summary.attention.holds, color: 'bg-orange-500' },
          ]
        : [],
    [summary]
  );

  // ── Cohort-over-cohort deltas (server-computed vs the previous program) ───
  const prevProgram = summary?.cohort_deltas?.previous_program ?? null;
  const deltaFor = (key: CohortDeltaKey): number | null | undefined => {
    const metrics = summary?.cohort_deltas?.metrics;
    if (!metrics) return undefined; // no baseline at all → render nothing, not 0%
    return metrics[key] ?? null; // baseline existed but this metric had no denominator → null → —
  };

  // ── Distributions (server) ────────────────────────────────────────────────
  const tierDist: NameCount[] = React.useMemo(
    () =>
      summary
        ? (['A', 'B', 'C', 'D', 'UNRATED'] as const)
            .map((k) => ({ name: k === 'UNRATED' ? 'Unscreened' : `Tier ${k}`, count: summary.tiers[k] ?? 0 }))
            .filter((t) => t.count > 0)
        : [],
    [summary]
  );

  // ── Outcomes aggregates ───────────────────────────────────────────────────
  const outcomeAgg = React.useMemo(() => {
    let fundingSum = 0;
    let fundingCount = 0;
    let revenueCount = 0;
    let survivedCount = 0;
    for (const r of outcomes) {
      const f = toNum(r.funding_raised);
      if (f !== null) {
        fundingSum += f;
        fundingCount += 1;
      }
      const rev = toNum(r.revenue);
      if (rev !== null && rev > 0) revenueCount += 1;
      const surv = r.survived ?? r.status;
      if (surv === true || String(surv ?? '').toLowerCase().match(/surviv|active|alive/)) survivedCount += 1;
    }
    return { fundingSum, fundingCount, revenueCount, survivedCount };
  }, [outcomes]);

  // ── CSV export of the current tab's underlying (real) data ────────────────
  const downloadReport = React.useCallback(() => {
    const prog = (activeProgram?.name ?? 'program').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `pitchmic-analytics-${tab}-${prog}-${stamp}.csv`;

    if (tab === 'overview') {
      downloadCsv(
        name,
        ['Metric', 'Value', 'Basis'],
        [
          ['Total applications', summary?.total ?? '—', 'Server screening summary'],
          ['ML-screened (excludes draft & submitted)', summary?.processed ?? '—', 'Server screening summary'],
          ['In active review queue', summary?.review_queue ?? '—', 'Server screening summary'],
          ['Selected by humans', summary?.by_status?.ACCEPTED ?? '—', 'Server status counts'],
          ['New this week', summary?.week_new ?? '—', 'Server week counter'],
          ['New prior week', summary?.prev_week_new ?? '—', 'Server week counter'],
          [],
          ...(summary?.cohort_deltas?.previous_program
            ? [
                ['Cohort baseline', summary.cohort_deltas.previous_program, 'Server cohort-over-cohort deltas'],
                ...(['total', 'processed', 'review_queue', 'selected'] as CohortDeltaKey[]).map((k) => [
                  `vs last cohort: ${k}`,
                  summary.cohort_deltas?.metrics?.[k] ?? '—',
                  '% change vs previous program',
                ]),
              ]
            : []),
          [],
          ...(summary?.strengths ?? []).map((s) => [
            `Top strength: ${s.label}`,
            s.avg_score,
            `mean across ${s.scored_count} scored applications`,
          ]),
          [],
          ...funnel.map((f) => [`Funnel: ${f.label}`, f.count, 'Cumulative reached-at-least']),
          [],
          ...(summary?.sectors ?? []).map((s) => [`Sector: ${s.name}`, s.count, 'Server value counts']),
        ]
      );
      return;
    }

    if (tab === 'screening') {
      downloadCsv(
        name,
        ['Metric', 'Value', 'Basis'],
        [
          ['Review throughput %', pctText(pct(summary?.processed ?? 0, summary?.total ?? 0)), 'Server totals'],
          ['ML screening coverage %', pctText(overview?.ratedPct ?? null), 'Tier assigned / pool'],
          ['Screening recall %', pctText(screening.recall), sampleBasis],
          ['False-negative rate %', pctText(screening.falseNegative), sampleBasis],
          ['Evidence accuracy %', pctText(screening.evidenceAccuracy), `${screening.claims} claims in sample`],
          ['Human review coverage %', pctText(screening.reviewCoverage), sampleBasis],
          [
            'Reviewer agreement %',
            calibration?.inter_reviewer_agreement_pct != null
              ? Math.round(calibration.inter_reviewer_agreement_pct)
              : 'Not enough review data',
            `${calibration?.total_scorecards ?? 0} scorecards`,
          ],
          ['Reviewer override rate', 'Not enough data yet', 'Needs model recommendation stored per final decision'],
          ['Reviewer time saved', 'Not enough data yet', 'Needs per-status transition timestamps'],
          [],
          ...attentionLanes.map((l) => [`Attention lane: ${l.label}`, l.count, 'Server attention buckets']),
        ]
      );
      return;
    }

    if (tab === 'diversity') {
      const blocks: Array<[string, NameCount[]]> = [
        ['Sector', summary?.sectors ?? []],
        ['Declared stage', summary?.declared_stages ?? []],
        ['Country', summary?.countries ?? []],
        ['Screening tier', tierDist],
      ];
      downloadCsv(
        name,
        ['Field', 'Value', 'Applications', '% of pool'],
        blocks.flatMap(([title, dist]) =>
          dist.map((d) => [title, d.name, d.count, pctText(pct(d.count, summary?.total ?? 0))])
        )
      );
      return;
    }

    if (tab === 'conversion') {
      downloadCsv(
        name,
        ['From', 'To', 'Reached', '% retained'],
        conversion.rows.map((r) => [r.from, r.to, r.count, pctText(r.retained)])
      );
      return;
    }

    downloadCsv(
      name,
      ['Company', 'Status', 'Funding raised', 'Revenue', 'Hired', 'Survived', 'Recorded'],
      outcomes.length === 0
        ? [['No cohort outcomes recorded yet', '', '', '', '', '', '']]
        : outcomes.map((r) => [
            display(r.company_name ?? r.application ?? 'Outcome record'),
            display(r.status),
            display(r.funding_raised),
            display(r.revenue),
            display(r.hired),
            display(r.survived),
            formatDateTime(r.created_at),
          ])
    );
  }, [
    tab,
    activeProgram?.name,
    summary,
    funnel,
    overview?.ratedPct,
    screening,
    calibration,
    attentionLanes,
    tierDist,
    conversion.rows,
    outcomes,
    sampleBasis,
  ]);

  const loading = (q: { isLoading: boolean }) => q.isLoading && pid !== null;
  const summaryBlocked =
    pid !== null && (summaryQuery.isLoading || summaryQuery.isError) ? (
      summaryQuery.isLoading ? (
        <LoadingCard label="Loading program aggregates from the screening summary endpoint…" />
      ) : (
        <ErrorCard
          label={apiErrMessage(summaryQuery.error, 'Could not load the screening summary.')}
          onRetry={() => summaryQuery.refetch()}
        />
      )
    ) : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl lg:text-3xl font-black tracking-tight">Analytics &amp; Reports</h1>
            {activeProgram?.name && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-600/10 text-indigo-700 border border-indigo-500/20">
                {activeProgram.name}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            How the selection pipeline is performing — attention spent, evidence quality, and
            stage-to-stage conversion. Pool-wide figures are computed on the server across every
            application; anything sampled from loaded rows is labelled with its basis.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={downloadReport}
          disabled={pid === null || !summary}
          className="bg-white text-indigo-600 border-indigo-500/30 hover:bg-indigo-50 w-fit"
          leftIcon={<Download className="h-3.5 w-3.5" />}
        >
          Download Report
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={cn(
              'relative px-4 py-2 text-sm font-bold whitespace-nowrap transition-colors rounded-t-lg',
              tab === t.key ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            )}
          >
            {t.label}
            {tab === t.key && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-indigo-600" />
            )}
          </button>
        ))}
      </div>

      {pid === null ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-sm text-slate-500">
          No active program selected. Choose a program to view its analytics.
        </div>
      ) : (
        <>
          {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
          {tab === 'overview' && (
            <section className="space-y-6">
              {summaryBlocked ??
                (summary && (
                  <>
                    {summary.total === 0 ? (
                      <EmptyCard label="No applications in this program yet — analytics populate as the pool arrives." />
                    ) : (
                      <>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                          <KpiCard
                            icon={<Layers className="h-4 w-4 text-indigo-600" />}
                            label="Total Applications"
                            value={summary.total.toLocaleString()}
                            delta={deltaFor('total')}
                            prevName={prevProgram}
                            sub={`${overview?.weekNew ?? 0} new this week (${
                              (overview?.weekDiff ?? 0) >= 0 ? '+' : ''
                            }${overview?.weekDiff ?? 0} vs prior week)`}
                          />
                          <KpiCard
                            icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                            label="ML-Screened"
                            value={pctText(overview?.processedPct ?? null)}
                            delta={deltaFor('processed')}
                            prevName={prevProgram}
                            sub={`${overview?.processed ?? 0} of ${summary.total} past submission (drafts & submissions excluded)`}
                          />
                          <KpiCard
                            icon={<Eye className="h-4 w-4 text-sky-600" />}
                            label="Awaiting Human Review"
                            value={(overview?.reviewQueue ?? 0).toLocaleString()}
                            delta={deltaFor('review_queue')}
                            prevName={prevProgram}
                            sub={`${pctText(overview?.reviewQueuePct ?? null)} of the pool is still in the active funnel`}
                          />
                          <KpiCard
                            icon={<ShieldAlert className="h-4 w-4 text-amber-600" />}
                            label="Selected (by reviewers)"
                            value={(overview?.accepted ?? 0).toLocaleString()}
                            delta={deltaFor('selected')}
                            prevName={prevProgram}
                            sub={
                              activeProgram?.target_cohort_size
                                ? `Human decisions only · ${activeProgram.target_cohort_size} seats targeted`
                                : 'Every acceptance is a recorded human decision'
                            }
                          />
                        </div>

                        {/* Conversion funnel */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                          <div className="flex items-center gap-2 mb-4">
                            <ArrowUpDown className="h-4 w-4 text-indigo-600" />
                            <h2 className="text-sm font-black uppercase tracking-wider text-slate-700">
                              Pipeline Funnel
                            </h2>
                            <span className="ml-auto px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500">
                              server counts · reached ≥ step
                            </span>
                          </div>
                          <div className="space-y-2.5">
                            {funnel.map((f, i) => (
                              <div key={f.key} className="flex items-center gap-3">
                                <div className="w-40 shrink-0 text-xs font-bold text-slate-600">{f.label}</div>
                                <div className="flex-1 h-6 rounded-md bg-slate-100 overflow-hidden">
                                  <div
                                    className={cn(
                                      'h-full rounded-md transition-all',
                                      i === funnel.length - 1 ? 'bg-emerald-500' : 'bg-indigo-500'
                                    )}
                                    style={{ width: `${Math.max(0, pct(f.count, funnelBase) ?? 0)}%` }}
                                  />
                                </div>
                                <div className="w-12 shrink-0 text-right text-sm font-black tabular-nums">{f.count}</div>
                                <div className="w-16 shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-400">
                                  {i === 0 ? '—' : pctText(pct(f.count, funnel[i - 1].count))}
                                </div>
                              </div>
                            ))}
                          </div>
                          <p className="mt-3 text-[11px] text-slate-400">
                            Step-to-step percentages show retention from the previous stage; counts are cumulative,
                            so an application at a later stage is also counted at every earlier one. A dash means
                            the prior stage had no arrivals yet.
                          </p>
                        </div>

                        {/* Top Strengths — pool mean per Selection Framework dimension */}
                        <StrengthsCard strengths={summary.strengths ?? []} screened={overview?.processed ?? 0} />

                        {/* Sectors donut + reading guide */}
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                          <DonutCard
                            title="Top Sectors"
                            dist={summary.sectors}
                            poolTotal={summary.total}
                            icon={<PieChart className="h-4 w-4 text-indigo-600" />}
                          />
                          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-4">
                              <BarChart3 className="h-4 w-4 text-indigo-600" />
                              <h2 className="text-sm font-black uppercase tracking-wider text-slate-700">
                                Reading This View
                              </h2>
                            </div>
                            <p className="text-sm text-slate-600 leading-relaxed">
                              Pool-wide aggregates come from the server screening summary, which sees every
                              application — the database is the source of truth, not a page of rows. Slice
                              percentages describe only the applications that carry a value for that field.
                              Metrics here measure the <span className="font-semibold text-slate-800">pipeline</span>,
                              never individual candidates, and nothing here decides admission.
                            </p>
                            <div className="mt-4 grid grid-cols-2 gap-3">
                              <MiniStat label="ML screening coverage" value={pctText(overview?.ratedPct ?? null)} />
                              <MiniStat label="Applied to a program pool" value={`${summary.total}`} />
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                ))}
            </section>
          )}

          {/* ── SCREENING ────────────────────────────────────────────────────── */}
          {tab === 'screening' && (
            <section className="space-y-6">
              {summaryBlocked ??
                (summary && (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <MetricCard
                        icon={<Gauge className="h-4 w-4 text-indigo-600" />}
                        label="Review Throughput"
                        value={pctText(overview?.processedPct ?? null)}
                        note={`${summary.processed} of ${summary.total} applications have moved past submission into screening or beyond.`}
                        basis="Server pool counts"
                      />
                      <MetricCard
                        icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                        label="ML Screening Coverage"
                        value={pctText(overview?.ratedPct ?? null)}
                        note={`${overview?.rated ?? 0} applications carry a screening tier; ${
                          summary.tiers.UNRATED ?? 0
                        } are still unscreened.`}
                        basis="Server tier counts"
                      />
                      <MetricCard
                        icon={<Eye className="h-4 w-4 text-sky-600" />}
                        label="Screening Recall"
                        value={pctText(screening.recall)}
                        note={
                          screening.recall === null
                            ? 'Not enough data yet — no application in the sample has been advanced to shortlist or beyond by a reviewer.'
                            : `Of ${screening.advanced} sample applications a human advanced to shortlist or beyond, this share had already been surfaced in a priority lane (tier A/B).`
                        }
                        basis={sampleBasis}
                        error={sampleError}
                        loading={loading(sampleQuery)}
                      />
                      <MetricCard
                        icon={<TrendingDown className="h-4 w-4 text-rose-600" />}
                        label="False-Negative Rate"
                        value={pctText(screening.falseNegative)}
                        note={
                          screening.falseNegative === null
                            ? 'Not enough data yet — needs human-advanced applications in the sample to compare against model lanes.'
                            : `Share of human-advanced sample applications the model did NOT place in a priority lane. Lower is better; each miss is attention the pipeline nearly lost.`
                        }
                        basis={sampleBasis}
                        error={sampleError}
                        loading={loading(sampleQuery)}
                      />
                      <MetricCard
                        icon={<ShieldAlert className="h-4 w-4 text-amber-600" />}
                        label="Evidence Accuracy"
                        value={pctText(screening.evidenceAccuracy)}
                        note={
                          screening.evidenceAccuracy === null
                            ? 'Not enough data yet — no extracted claims in the sample to measure verification against.'
                            : `Share of ${screening.claims} extracted claims in the sample that carry verified evidence.`
                        }
                        basis={sampleBasis}
                        error={sampleError}
                        loading={loading(sampleQuery)}
                      />
                      <MetricCard
                        icon={<Users className="h-4 w-4 text-emerald-600" />}
                        label="Human Review Coverage"
                        value={pctText(screening.reviewCoverage)}
                        note={
                          screening.reviewCoverage === null
                            ? 'Not enough data yet — no application rows loaded.'
                            : 'Sample applications with at least one reviewer. Anything below 100% is a decision resting on automation alone.'
                        }
                        basis={sampleBasis}
                        error={sampleError}
                        loading={loading(sampleQuery)}
                      />
                      <MetricCard
                        icon={<BarChart3 className="h-4 w-4 text-violet-600" />}
                        label="Reviewer Agreement"
                        value={
                          calibration?.inter_reviewer_agreement_pct != null
                            ? `${Math.round(calibration.inter_reviewer_agreement_pct)}%`
                            : '—'
                        }
                        note={
                          calibration?.inter_reviewer_agreement_pct != null
                            ? `Inter-reviewer agreement across ${calibration?.total_scorecards ?? '—'} reviews — read alongside the base rate; agreement on few reviews is not a reliable signal.`
                            : 'Not enough review data to compute agreement honestly.'
                        }
                        basis="Reviewer calibration endpoint"
                        loading={loading(calibrationQuery)}
                      />
                      <MetricCard
                        icon={<ArrowRight className="h-4 w-4 text-slate-500" />}
                        label="Reviewer Override Rate"
                        value="—"
                        note="Not enough data yet. This needs the model's recommendation stored alongside each final human decision; the applications feed exposes one without the other."
                        basis="Not computable from current endpoints"
                      />
                      <MetricCard
                        icon={<Clock className="h-4 w-4 text-slate-500" />}
                        label="Reviewer Time Saved"
                        value="—"
                        note="Not enough data yet. Time in status is not recorded — the application feed carries only submission and update timestamps, so any hours-saved figure would be invented."
                        basis="Not computable from current endpoints"
                      />
                    </div>

                    {/* Attention lane composition */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-4">
                        <Layers className="h-4 w-4 text-indigo-600" />
                        <h2 className="text-sm font-black uppercase tracking-wider text-slate-700">
                          Where Attention Is Being Directed
                        </h2>
                        <span className="ml-auto px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500">
                          {summary.review_queue} in the review queue
                        </span>
                      </div>
                      <div className="space-y-2.5">
                        {attentionLanes.map((l) => (
                          <QueueBucket
                            key={l.label}
                            label={l.label}
                            count={l.count}
                            total={summary.review_queue}
                            color={l.color}
                          />
                        ))}
                      </div>
                      <p className="mt-3 text-[11px] text-slate-400">
                        Lanes use the same server-side predicates the review queue routes on, and an application can
                        appear in more than one — so the bars do not sum to the queue size. They describe where the
                        model asked for human attention, not who gets in.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-indigo-500/20 bg-indigo-50/50 p-5 shadow-sm">
                      <p className="text-sm text-slate-600 leading-relaxed">
                        <span className="font-semibold text-slate-800">
                          Metrics describe the pipeline; they never score candidates.
                        </span>{' '}
                        Sample-based metrics are labelled with how many rows they actually used, because the
                        applications feed is paginated — a number derived from loaded rows is never presented as a
                        pool-wide fact.
                      </p>
                    </div>
                  </>
                ))}
            </section>
          )}

          {/* ── DIVERSITY ────────────────────────────────────────────────────── */}
          {tab === 'diversity' && (
            <section className="space-y-6">
              {summaryBlocked ??
                (summary &&
                  (summary.total === 0 ? (
                    <EmptyCard label="No applications yet — distributions need at least one record." />
                  ) : (
                    <>
                      <p className="text-sm text-slate-500">
                        Whole-pool distributions from the server summary: sector tags, founder-declared stage,
                        incorporation country and the screening lane assigned to each application. Fields are counted
                        only where a value exists — the percentages describe tagged applications, not the pool.
                      </p>
                      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <DistBars
                          title="By Sector"
                          dist={summary.sectors}
                          total={summary.total}
                          color="bg-indigo-500"
                          icon={<PieChart className="h-4 w-4 text-indigo-600" />}
                        />
                        <DistBars
                          title="By Declared Stage"
                          dist={summary.declared_stages}
                          total={summary.total}
                          color="bg-emerald-500"
                          icon={<Layers className="h-4 w-4 text-emerald-600" />}
                        />
                        <DistBars
                          title="By Country"
                          dist={summary.countries}
                          total={summary.total}
                          color="bg-sky-500"
                          icon={<Users className="h-4 w-4 text-sky-600" />}
                        />
                        <DistBars
                          title="By ML Screening Lane"
                          dist={tierDist}
                          total={summary.total}
                          color="bg-amber-500"
                          icon={<ShieldAlert className="h-4 w-4 text-amber-600" />}
                        />
                      </div>
                    </>
                  )))}
            </section>
          )}

          {/* ── CONVERSION ───────────────────────────────────────────────────── */}
          {tab === 'conversion' && (
            <section className="space-y-6">
              {summaryBlocked ??
                (summary &&
                  (funnel.length < 2 ? (
                    <EmptyCard label="No funnel data yet — conversion needs at least two stages with applications in them." />
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                      <div className="flex items-center gap-2 px-5 pt-5 pb-3">
                        <TrendingUp className="h-4 w-4 text-indigo-600" />
                        <h2 className="text-sm font-black uppercase tracking-wider text-slate-700">
                          Step-to-Step Conversion
                        </h2>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-t border-slate-200 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                              <th className="px-5 py-2.5">Step</th>
                              <th className="px-5 py-2.5">Reached</th>
                              <th className="px-5 py-2.5">% Retained</th>
                              <th className="px-5 py-2.5">Note</th>
                            </tr>
                          </thead>
                          <tbody>
                            {conversion.rows.map((r, i) => {
                              const worst = i === conversion.worstIdx && r.retained !== null && r.retained < 100;
                              return (
                                <tr
                                  key={`${r.from}-${r.to}`}
                                  className={cn('border-t border-slate-100', worst ? 'bg-amber-50/70' : 'hover:bg-slate-50/60')}
                                >
                                  <td className="px-5 py-3 font-bold text-slate-900">
                                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                                      {r.from}
                                      <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                                      {r.to}
                                    </span>
                                  </td>
                                  <td className="px-5 py-3 tabular-nums text-slate-600">
                                    {r.count}
                                    <span className="text-slate-400"> / {r.fromCount}</span>
                                  </td>
                                  <td className="px-5 py-3">
                                    <span
                                      className={cn(
                                        'px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums',
                                        r.retained === null
                                          ? 'bg-slate-100 text-slate-400 border border-slate-200'
                                          : worst
                                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                            : r.retained >= 75
                                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                                      )}
                                    >
                                      {pctText(r.retained)}
                                    </span>
                                  </td>
                                  <td className="px-5 py-3 text-xs">
                                    {worst ? (
                                      <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                                        <TrendingDown className="h-3.5 w-3.5" /> Biggest drop-off
                                      </span>
                                    ) : r.retained === null ? (
                                      <span className="text-slate-400">Prior stage empty</span>
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="px-5 py-3 text-[11px] text-slate-400 border-t border-slate-100">
                        Computed server-side from cumulative funnel counts: a stage&apos;s total includes every
                        application that reached at least that stage. A dash means the prior stage had zero arrivals,
                        so a rate would be meaningless.
                      </p>
                    </div>
                  )))}
            </section>
          )}

          {/* ── OUTCOMES ─────────────────────────────────────────────────────── */}
          {tab === 'outcomes' && (
            <section className="space-y-6">
              {loading(outcomesQuery) ? (
                <LoadingCard label="Loading cohort outcomes…" />
              ) : outcomesQuery.isError ? (
                <ErrorCard
                  label={apiErrMessage(outcomesQuery.error, 'Could not load cohort outcomes.')}
                  onRetry={() => outcomesQuery.refetch()}
                />
              ) : outcomes.length === 0 ? (
                <EmptyCard label="No cohort outcomes recorded yet. Outcome records appear after companies complete the program." />
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Funding Reported</div>
                      <div className="mt-2 text-2xl font-black tracking-tight text-emerald-600">
                        {outcomeAgg.fundingCount > 0 ? `$${Math.round(outcomeAgg.fundingSum).toLocaleString()}` : '—'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Across {outcomeAgg.fundingCount} of {outcomes.length} outcome records.
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Revenue-Generating</div>
                      <div className="mt-2 text-2xl font-black tracking-tight">{outcomeAgg.revenueCount}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Records reporting revenue above zero ({outcomes.length} total).
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Surviving</div>
                      <div className="mt-2 text-2xl font-black tracking-tight">{outcomeAgg.survivedCount}</div>
                      <div className="mt-1 text-xs text-slate-500">Marked survived / active in outcome records.</div>
                    </div>
                  </div>

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
                                {missing(r.funding_raised) ? '—' : display(r.funding_raised)}
                              </td>
                              <td className="px-5 py-3 tabular-nums text-slate-600">
                                {missing(r.revenue) ? '—' : display(r.revenue)}
                              </td>
                              <td className="px-5 py-3 text-slate-600">{display(r.hired)}</td>
                              <td className="px-5 py-3 text-slate-600">
                                {missing(r.survived) ? '—' : r.survived ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Yes
                                  </span>
                                ) : (
                                  <span className="font-bold text-rose-600">No</span>
                                )}
                              </td>
                              <td className="px-5 py-3 text-slate-400 text-xs font-semibold">
                                {formatDateTime(r.created_at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* Program memory */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <History className="h-4 w-4 text-indigo-600" />
                  Institutional screening memory recorded by the program.
                </div>
                {loading(memoryQuery) ? (
                  <LoadingCard label="Loading program memory…" />
                ) : memoryQuery.isError ? (
                  <ErrorCard
                    label={apiErrMessage(memoryQuery.error, 'Could not load program memory.')}
                    onRetry={() => memoryQuery.refetch()}
                  />
                ) : memory.length === 0 ? (
                  <EmptyCard label="No memory entries recorded yet for this program." />
                ) : (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {memory.map((item, idx) => {
                      const body = display(item.summary ?? item.content ?? '');
                      return (
                        <div key={item.id ?? idx} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="text-sm font-black tracking-tight">
                              {display(item.title ?? item.entry_type ?? 'Memory entry')}
                            </h3>
                            <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-600/10 text-indigo-700 border border-indigo-500/20">
                              {display(item.signal_type ?? item.entry_type ?? 'note')}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                            {body === '—' ? 'No description recorded.' : body}
                          </p>
                          <div className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            {formatDateTime(item.created_at)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <Link
                href="/accelerator/outcomes"
                className="group flex items-center gap-4 rounded-2xl border border-indigo-500/20 bg-indigo-50/50 p-5 shadow-sm hover:bg-indigo-50 transition-colors"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600/10">
                  <Link2 className="h-5 w-5 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-black text-indigo-900">Full Outcomes &amp; Learning Loop Diagnostics</div>
                  <div className="text-xs text-slate-600">
                    Review coverage, uncertainty watchlist and the complete learning loop on the dedicated page.
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-indigo-400 transition-transform group-hover:translate-x-1" />
              </Link>
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ── Presentational helpers ────────────────────────────────────────────────────

/** Cohort-over-cohort chip. `undefined` = no baseline program at all, so the
 *  chip is omitted; `null` = a baseline exists but this metric had no prior
 *  denominator, so it renders as — and never as 0%. */
function DeltaBadge({ delta, prevName }: { delta?: number | null; prevName?: string | null }) {
  if (delta === undefined) return null;
  const title = prevName ? `vs “${prevName}” (previous program)` : 'No previous cohort baseline';
  if (delta === null) {
    return (
      <span className="text-[11px] font-semibold text-slate-400 tabular-nums" title={title}>
        — vs last cohort
      </span>
    );
  }
  const up = delta > 0;
  const flat = delta === 0;
  return (
    <span
      className={cn('text-[11px] font-bold tabular-nums', flat ? 'text-slate-400' : up ? 'text-emerald-600' : 'text-rose-500')}
      title={title}
    >
      {flat ? '→' : up ? '↑' : '↓'}
      {Math.abs(delta)}% <span className="font-medium text-slate-400">vs last cohort</span>
    </span>
  );
}

/** Pool "Top Strengths": each Selection Framework dimension the ML engine
 *  scored, ranked by the pool's mean stored score. Rendered as evidence levels,
 *  never as a bare number; an unscored dimension simply does not appear. */
function StrengthsCard({ strengths, screened }: { strengths: StrengthRow[]; screened: number }) {
  const top = strengths.slice(0, 6);
  const maxAvg = top[0]?.avg_score ?? 0;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-4 w-4 text-indigo-600" />
        <h2 className="text-sm font-black uppercase tracking-wider text-slate-700">Top Strengths Across The Pool</h2>
        <span className="ml-auto px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500">
          mean per scored dimension
        </span>
      </div>
      {top.length === 0 ? (
        <p className="text-sm text-slate-500">
          Not enough data yet — no Selection Framework dimension has been scored by ML screening across this pool
          yet, so there is nothing honest to rank.
        </p>
      ) : (
        <div className="space-y-2">
          {top.map((s) => {
            const lvl = evidenceLevel(s.avg_score);
            return (
              <div key={s.key} className="flex items-center gap-3">
                <div className="w-40 shrink-0 text-xs font-bold text-slate-600 truncate" title={s.label}>
                  {s.label}
                </div>
                <div className="flex-1 h-5 rounded-md bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-md bg-indigo-500"
                    style={{ width: `${maxAvg > 0 ? Math.round((s.avg_score / maxAvg) * 100) : 0}%` }}
                  />
                </div>
                <span
                  className={cn(
                    'shrink-0 w-24 text-right rounded-md border px-2 py-0.5 text-[11px] font-bold',
                    lvl ? 'text-slate-600 border-slate-200' : 'text-slate-400 border-slate-100'
                  )}
                  title={`Mean stored score ${s.avg_score}/100 across ${s.scored_count} scored applications`}
                >
                  {lvl ? lvl.label : `${s.avg_score}`}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-400">
        Ranked on the server from stored assessment dimension scores across the {screened} ML-screened applications —
        a dimension no application was scored on is left out rather than shown as zero. This describes the pool,
        never an individual candidate, and never an admission verdict.
      </p>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  delta,
  prevName,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  delta?: number | null;
  prevName?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-3 text-3xl font-black tracking-tight tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-slate-500 leading-snug">{sub}</div>
      {(delta !== undefined || prevName) && (
        <div className="mt-1.5">
          <DeltaBadge delta={delta} prevName={prevName} />
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  note,
  basis,
  error,
  loading: busy,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  basis?: string;
  error?: string;
  loading?: boolean;
}) {
  const missingValue = value === '—';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className={cn('mt-3 text-3xl font-black tracking-tight tabular-nums', missingValue && 'text-slate-300')}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-slate-300" /> : value}
      </div>
      <div className={cn('mt-1 text-xs leading-snug', error ? 'text-rose-700 font-semibold' : 'text-slate-500')}>
        {busy ? 'Loading sample rows…' : error ?? note}
      </div>
      {basis && !busy && (
        <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{basis}</div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-lg font-black tracking-tight tabular-nums">{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  );
}

function QueueBucket({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const share = pct(count, total) ?? 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-64 shrink-0 text-xs font-bold text-slate-600">{label}</div>
      <div className="flex-1 h-5 rounded-md bg-slate-100 overflow-hidden">
        <div className={cn('h-full rounded-md', color)} style={{ width: `${share}%` }} />
      </div>
      <div className="w-10 shrink-0 text-right text-sm font-black tabular-nums">{count}</div>
      <div className="w-12 shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-400">{share}%</div>
    </div>
  );
}

function DistBars({
  title,
  dist,
  total,
  color,
  icon,
}: {
  title: string;
  dist: NameCount[];
  total: number;
  color: string;
  icon: React.ReactNode;
}) {
  const largest = dist[0]?.count ?? 0;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-sm font-black uppercase tracking-wider text-slate-700">{title}</h2>
        {dist.length === 0 && (
          <span className="ml-auto text-[11px] font-semibold text-slate-400">No values recorded yet</span>
        )}
      </div>
      <div className="space-y-2">
        {dist.map((d) => (
          <div key={d.name} className="flex items-center gap-3">
            <div className="w-36 shrink-0 text-xs font-bold text-slate-600 truncate" title={d.name}>
              {d.name}
            </div>
            <div className="flex-1 h-5 rounded-md bg-slate-100 overflow-hidden">
              <div
                className={cn('h-full rounded-md', color)}
                style={{ width: `${(pct(d.count, largest) ?? 0)}%` }}
              />
            </div>
            <div className="w-10 shrink-0 text-right text-sm font-black tabular-nums">{d.count}</div>
            <div className="w-14 shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-400">
              {pctText(pct(d.count, total))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutCard({
  title,
  dist,
  poolTotal,
  icon,
}: {
  title: string;
  dist: NameCount[];
  poolTotal: number;
  icon: React.ReactNode;
}) {
  const { segments, sum } = React.useMemo(() => toSegments(dist), [dist]);
  const gradient = segments.length
    ? `conic-gradient(${segments.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(', ')})`
    : 'conic-gradient(#e2e8f0 0% 100%)';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-sm font-black uppercase tracking-wider text-slate-700">{title}</h2>
        <span className="ml-auto text-[11px] font-semibold text-slate-400">shares sum to 100%</span>
      </div>
      <div className="flex items-center gap-6">
        <div className="relative h-36 w-36 shrink-0">
          <div className="h-36 w-36 rounded-full" style={{ background: gradient }} />
          <div className="absolute inset-[22%] rounded-full bg-white flex flex-col items-center justify-center shadow-inner">
            <div className="text-xl font-black tracking-tight tabular-nums">{sum}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">tagged</div>
          </div>
        </div>
        <ul className="flex-1 space-y-1.5 min-w-0">
          {segments.length === 0 ? (
            <li className="text-xs text-slate-400">No values recorded for this field yet.</li>
          ) : (
            segments.map((s) => (
              <li key={s.label} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="font-bold text-slate-600 truncate" title={s.label}>
                  {s.label}
                </span>
                <span className="ml-auto shrink-0 tabular-nums font-bold text-slate-400">
                  {s.share}% · {s.count}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        Shares are computed over the {sum} pool applications carrying this field (of {poolTotal} total), with the
        final slice absorbing rounding so the ring closes at exactly 100%.
      </p>
    </div>
  );
}

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
