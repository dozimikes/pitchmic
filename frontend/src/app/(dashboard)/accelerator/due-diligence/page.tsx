'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  FileSearch,
  Inbox,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveProgram } from '../ProgramContext';
import {
  acceleratorApi,
  type ApplicationItem,
  type EvidenceGraph,
  type EvidenceGraphClaim,
} from '@/lib/acceleratorApi';
import {
  evidenceLevel,
  type EvidenceLevel,
  STATUS_LABELS,
  qk,
} from '@/lib/screening';
import { DiligenceRollupStrip, DiligenceSummary, DiligenceItemPanel } from '@/components/accelerator/DiligenceItems';

// Portfolio shown on the DD board: committee/diligence stage + completed (accepted) rows.
const DD_POPULATION = ['COMMITTEE_REVIEW', 'EVIDENCE_REQUESTED', 'ACCEPTED'];

// Tailwind tone tokens per evidence level. The ladder itself (score → level)
// lives in @/lib/screening so this page can never drift from the rest of the
// dashboard. Characterized as reviewer evidence — never a black-box verdict.
const TONE_CLS: Record<EvidenceLevel['tone'], string> = {
  strong: 'text-emerald-700 bg-emerald-600/10 border-emerald-500/20',
  moderate: 'text-sky-700 bg-sky-600/10 border-sky-500/20',
  limited: 'text-amber-700 bg-amber-600/10 border-amber-500/20',
  gap: 'text-rose-700 bg-rose-600/10 border-rose-500/20',
};
const NO_DATA_CLS = 'text-slate-500 bg-slate-500/10 border-slate-500/20';

// evidenceLevel() returns null for missing data (MISSING IS NOT ZERO) — render
// "No data" rather than implying a "Requires validation" verdict on the applicant.
function level(score: number | null | undefined): { label: string; cls: string } {
  const lvl = evidenceLevel(score);
  if (!lvl) return { label: 'No data', cls: NO_DATA_CLS };
  return { label: lvl.label, cls: TONE_CLS[lvl.tone] };
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
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Status chip resolves the shared lifecycle labels first; falls back to a
// prettified raw value for any status not in the canonical list.
function statusLabel(status: string): string {
  return (STATUS_LABELS as Record<string, string>)[status] ?? prettify(status);
}

// Priority is derived from the screening tier assigned during intake — a triage
// signal reviewers can override, not an automated verdict.
function priorityFromTier(tier?: string | null): { label: string; cls: string } {
  switch (tier) {
    case 'A':
      return { label: 'High', cls: 'bg-indigo-600/10 text-indigo-700 border-indigo-500/20' };
    case 'B':
      return { label: 'Medium', cls: 'bg-sky-600/10 text-sky-700 border-sky-500/20' };
    default:
      return { label: 'Standard', cls: 'bg-slate-500/10 text-slate-600 border-slate-500/20' };
  }
}

// Honest diligence progress: verified claims over total claims, with
// CONTRADICTED claims explicitly EXCLUDED from "verified". Previously this was
// derived as (total - unverified), which silently counted contradicted claims as
// done — inflating the progress of the candidates that need the most scrutiny.
interface DDProgress {
  pct: number;
  verified: number;
  contradicted: number;
  unverified: number;
  pending: number;
  total: number;
}
function progressOf(app: ApplicationItem): DDProgress | null {
  const total = app.total_claims ?? 0;
  if (!total) return null;
  const verified = Math.max(0, Math.min(total, app.verified_claims ?? 0));
  const contradicted = Math.max(0, Math.min(total, app.contradicted_claims ?? 0));
  const unverified = Math.max(0, Math.min(total, app.unverified_claims ?? 0));
  const pending = Math.max(0, total - verified - contradicted - unverified);
  return { pct: Math.round((verified / total) * 100), verified, contradicted, unverified, pending, total };
}

const linkBase =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors whitespace-nowrap';
const linkPrimary = cn(linkBase, 'h-8 px-3 text-xs bg-indigo-600 hover:bg-indigo-500 text-white');
const linkOutline = cn(linkBase, 'h-8 px-3 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-900');

export default function DueDiligencePage() {
  const { activeProgram, activeProgramId } = useActiveProgram();
  const pid = activeProgramId ?? null;

  // Dossier quick-view drawer (evidence graph is fetched only while it is open —
  // one request per opened candidate, never one per table row).
  const [dossierId, setDossierId] = React.useState<number | null>(null);

  const { data: appsPage, isLoading } = useQuery({
    // Paged fetch so `count` is available: without it a 200-row working set
    // would be presented as the entire portfolio.
    queryKey: [...qk.applications(pid), 'portfolio'],
    queryFn: () => acceleratorApi.getApplicationsPaged(pid ?? undefined, { page_size: 200 }),
    enabled: pid != null,
  });
  const applications: ApplicationItem[] = appsPage?.results ?? [];
  const totalInProgram = appsPage?.count ?? 0;
  const partialLoad =
    totalInProgram > 0 && applications.length < totalInProgram
      ? `This table loaded ${applications.length} of ${totalInProgram} applications in this program (the API caps one request at 200) — counts below describe the loaded rows only.`
      : null;

  const portfolio = React.useMemo(
    () => applications.filter((a) => DD_POPULATION.includes(a.status)),
    [applications]
  );

  // Page-level DD counters come from the server aggregate (screening summary),
  // NOT from counting a single page of table rows — the list endpoint paginates
  // at 25/page so a row-count would silently under-report the real funnel.
  const { data: summary } = useQuery({
    queryKey: qk.screeningSummary(pid),
    queryFn: () => acceleratorApi.getScreeningSummary(pid ?? undefined),
    enabled: pid != null,
    staleTime: 30_000,
  });
  const byStatus = summary?.by_status ?? {};
  const sum = (...keys: string[]) => keys.reduce((acc, k) => acc + (Number(byStatus[k]) || 0), 0);
  const stats = {
    inProcess: sum('SCREENING', 'SHORTLISTED'),
    inDd: sum('COMMITTEE_REVIEW'),
    completed: sum('ACCEPTED'),
    pending: sum('EVIDENCE_REQUESTED'),
  };

  // Human review context (committee decisions + reviewer scores).
  const { data: committeeRows = [] } = useQuery({
    queryKey: ['accelerator-dd-committee', pid],
    queryFn: () => acceleratorApi.osList<any>('committee', pid ?? undefined).catch(() => []),
    enabled: pid != null,
  });
  const { data: reviewRows = [] } = useQuery({
    queryKey: qk.reviews(pid),
    queryFn: () => acceleratorApi.osList<any>('reviews', pid ?? undefined).catch(() => []),
    enabled: pid != null,
  });

  const reviewerNamesByApp = React.useMemo(() => {
    const map = new Map<number, string[]>();
    (Array.isArray(reviewRows) ? reviewRows : []).forEach((r: any) => {
      const appId = Number(r?.application_id ?? r?.application);
      if (!Number.isFinite(appId)) return;
      const name = String(r?.reviewer_name ?? r?.reviewer_email ?? '').trim();
      if (!name) return;
      const list = map.get(appId) ?? [];
      if (!list.includes(name)) list.push(name);
      map.set(appId, list);
    });
    return map;
  }, [reviewRows]);

  const dossierApp = portfolio.find((a) => a.id === dossierId) ?? null;

  const { data: graph, isFetching: graphLoading } = useQuery({
    queryKey: qk.evidenceGraph(dossierId ?? -1),
    queryFn: () =>
      acceleratorApi
        .getEvidenceGraph(dossierId as number)
        .catch(() => null) as Promise<EvidenceGraph | null>,
    enabled: dossierId != null,
    staleTime: 5 * 60_000,
  });

  const appCommittee = React.useMemo(
    () =>
      (Array.isArray(committeeRows) ? committeeRows : []).filter((d: any) => {
        const appId = d?.application_id ?? d?.application;
        return Number(appId) === dossierId;
      }),
    [committeeRows, dossierId]
  );
  const appReviews = React.useMemo(
    () =>
      (Array.isArray(reviewRows) ? reviewRows : []).filter((r: any) => {
        const appId = r?.application_id ?? r?.application;
        return Number(appId) === dossierId;
      }),
    [reviewRows, dossierId]
  );

  const claims: EvidenceGraphClaim[] = graph?.claims ?? [];
  const contradicted = claims.filter((c) => c.verification_status === 'contradicted');
  const graphSummary = graph?.summary;

  if (pid == null) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 p-4 lg:p-8 space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-sm text-slate-500">
          Select an active program to view its due diligence queue.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 lg:p-8 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight">Due Diligence</h1>
          <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-indigo-600/10 text-indigo-700 border border-indigo-500/20">
            Deep Verification
          </span>
        </div>
        <p className="text-sm text-slate-500 max-w-2xl">
          The diligence stage for {activeProgram?.name ?? 'the active program'}. Pitchmic assembles the
          evidence graph per candidate so reviewers verify claims themselves — decisions stay human.
        </p>
      </div>

      {/* DD process counter strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'In Process', hint: 'Screening / shortlist', value: stats.inProcess, cls: 'text-slate-900' },
          { label: 'In Due Diligence', hint: 'Committee review', value: stats.inDd, cls: 'text-indigo-600' },
          { label: 'Completed', hint: 'Accepted', value: stats.completed, cls: 'text-emerald-600' },
          { label: 'Pending', hint: 'Evidence requested', value: stats.pending, cls: 'text-amber-600' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className={cn('text-2xl font-black', s.cls)}>{s.value}</p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{s.label}</p>
            <p className="text-[11px] text-slate-400">{s.hint}</p>
          </div>
        ))}
      </div>

      {/* Diligence questions the program is actually chasing: counts come from
          /diligence-items/rollup/, never tallied from these table rows. */}
      <DiligenceRollupStrip programId={pid} />

      {/* Portfolio table */}
      {partialLoad && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
          {partialLoad}
        </div>
      )}
      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
          Loading candidates…
        </div>
      ) : portfolio.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Inbox className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-semibold">No candidates in diligence yet</p>
            <p className="text-xs text-slate-500 max-w-sm">
              Applications appear here once they reach committee review, evidence request, or acceptance.
            </p>
            <Link href="/accelerator/applications" className={cn(linkOutline, 'mt-2')}>
              View all applications
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-700">
              Diligence Portfolio · {portfolio.length}
            </h2>
            <p className="text-[11px] text-slate-400">
              Progress from claim verification; “Questions owed” from the diligence list a human wrote
              down. Two different records, deliberately kept apart.
            </p>
          </div>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="px-3 py-2 font-bold">Company</th>
                  <th className="px-3 py-2 font-bold">Stage</th>
                  <th className="px-3 py-2 font-bold">DD Progress</th>
                  <th
                    className="px-3 py-2 font-bold"
                    title="Diligence questions a human wrote down for this candidate, and who owns them. Counted by the server on the application row — separate from claim verification above. Empty means no question has been written down yet, not that none is needed."
                  >
                    Questions owed
                  </th>
                  <th className="px-3 py-2 font-bold">Priority</th>
                  <th
                    className="px-3 py-2 font-bold"
                    title="Who has actually filed a scorecard here, most recent first. Being asked to review is a separate record — see the application's Reviews tab."
                  >
                    Scored by
                  </th>
                  <th className="px-3 py-2 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {portfolio.map((a) => {
                  const prog = progressOf(a);
                  const prio = priorityFromTier(a.automated_screening_tier);
                  const reviewers = reviewerNamesByApp.get(a.id) ?? [];
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-3 py-2.5">
                        <span className="block font-bold text-slate-900 truncate max-w-[220px]">{a.company_name}</span>
                        <span className="text-[11px] text-slate-400">Tier {a.automated_screening_tier ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold border border-slate-500/20 bg-slate-500/10 text-slate-600 whitespace-nowrap">
                          {statusLabel(a.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {prog ? (
                          <div className="min-w-[150px]">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-24 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className={cn(
                                    'h-full rounded-full',
                                    prog.pct >= 70 ? 'bg-emerald-500' : prog.pct >= 40 ? 'bg-amber-500' : 'bg-rose-500'
                                  )}
                                  style={{ width: `${prog.pct}%` }}
                                />
                              </div>
                              <span className="text-[11px] text-slate-500 whitespace-nowrap">
                                {prog.verified}/{prog.total} verified
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] whitespace-nowrap">
                              <span className="text-emerald-600">{prog.verified} verified</span>
                              {prog.contradicted > 0 && (
                                <span className="text-rose-600">{prog.contradicted} contradicted</span>
                              )}
                              <span className="text-slate-500">{prog.unverified} unverified</span>
                              {prog.pending > 0 && <span className="text-slate-400">{prog.pending} pending</span>}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400" title="No claims extracted yet">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <DiligenceSummary diligence={a.diligence} />
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap', prio.cls)}>
                          {prio.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {reviewers.length > 0 ? (
                          <span className="text-xs text-slate-700" title={reviewers.join(', ')}>
                            {reviewers.slice(0, 2).join(', ')}
                            {reviewers.length > 2 ? ` +${reviewers.length - 2}` : ''}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400" title="No reviewer has filed a scorecard for this application yet">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setDossierId(a.id)}
                            className={linkOutline}
                          >
                            <FileSearch className="h-3.5 w-3.5" />
                            Dossier
                          </button>
                          <Link href={`/accelerator/applications/${a.id}`} className={linkPrimary}>
                            Open 360
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Dossier drawer (quick view) ─────────────────────────────────────── */}
      {dossierApp && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Close dossier"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setDossierId(null)}
          />
          <aside className="relative h-full w-full max-w-2xl overflow-y-auto bg-slate-50 border-l border-slate-200 shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
              <div className="flex items-center gap-2 min-w-0">
                <FileSearch className="h-4 w-4 shrink-0 text-indigo-600" />
                <h2 className="text-sm font-black tracking-tight truncate">{dossierApp.company_name}</h2>
                <span className="shrink-0 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-indigo-600/10 text-indigo-700 border border-indigo-500/20">
                  {statusLabel(dossierApp.status)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDossierId(null)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-6">
              {/* Dossier header */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-slate-500/10 text-slate-600 border border-slate-500/20">
                    Tier {dossierApp.automated_screening_tier ?? '—'}
                  </span>
                  <span className="text-slate-500">Evidence confidence:</span>
                  <span className={cn('px-2 py-0.5 rounded border font-bold', level(dossierApp.evidence_confidence_score ?? null).cls)}>
                    {level(dossierApp.evidence_confidence_score ?? null).label}
                  </span>
                  <span className="text-slate-400">
                    {dossierApp.evidence_confidence_score != null
                      ? `${dossierApp.evidence_confidence_score}/100 — reviewer-facing signal, not a verdict.`
                      : 'Not yet screened — no ML evidence recorded.'}
                  </span>
                </div>
                <div className="flex justify-end">
                  <Link href={`/accelerator/applications/${dossierApp.id}`} className={linkPrimary}>
                    Open full analysis
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>

              {/* Mounted above the graph, not inside it: a candidate with no
                  extracted claims is precisely when a written-down question
                  matters, so this must not disappear with the evidence block. */}
              <DiligenceItemPanel
                applicationId={dossierApp.id}
                programId={pid}
                applicationLabel={dossierApp.company_name}
              />

              {graphLoading ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-3 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                  Assembling evidence graph…
                </div>
              ) : !graph || claims.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <ShieldAlert className="h-8 w-8 text-slate-300" />
                    <p className="text-sm font-semibold">No evidence extracted yet</p>
                    <p className="text-xs text-slate-500 max-w-sm">
                      Run screening analysis to populate this candidate&apos;s evidence graph.
                    </p>
                    <Link href={`/accelerator/applications/${dossierApp.id}`} className={cn(linkOutline, 'mt-2')}>
                      Go to analysis
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  {/* Verification summary counters */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-indigo-600" />
                      <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">
                        Verification summary
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        { label: 'Claims', value: graphSummary?.total ?? claims.length, cls: 'text-slate-900' },
                        { label: 'Verified', value: graphSummary?.verified ?? 0, cls: 'text-emerald-600' },
                        { label: 'Contradicted', value: graphSummary?.contradicted ?? 0, cls: 'text-rose-600' },
                        { label: 'Unverified', value: graphSummary?.unverified ?? 0, cls: 'text-slate-500' },
                      ].map((s) => (
                        <div key={s.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                          <p className={cn('text-2xl font-black', s.cls)}>{s.value}</p>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Modular evidence checklist — rendered from the graph */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                      <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">
                        Evidence checklist
                      </h3>
                      <span className="text-[11px] text-slate-400">— generated from extracted claims</span>
                    </div>
                    <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                      {claims.map((claim) => (
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
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                            <span>Category: <span className="font-semibold text-slate-700">{prettify(claim.category)}</span></span>
                            <span>Materiality: <span className="font-semibold text-slate-700">{prettify(claim.materiality)}</span></span>
                            {claim.value && <span>Value: <span className="font-semibold text-slate-700">{claim.value}</span></span>}
                            {claim.evidence?.length > 0 && (
                              <span>{claim.evidence.length} evidence item{claim.evidence.length === 1 ? '' : 's'}</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Contradiction panel */}
                  {contradicted.length > 0 && (
                    <div className="rounded-2xl border border-rose-500/30 bg-white p-5 shadow-sm space-y-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-rose-600" />
                        <h3 className="text-sm font-black uppercase tracking-wider text-rose-700">
                          Contradictions · {contradicted.length}
                        </h3>
                      </div>
                      <ul className="space-y-2">
                        {contradicted.map((claim) => (
                          <li
                            key={`contra-${claim.claim_id ?? claim.id}`}
                            className="rounded-xl border border-rose-500/20 bg-rose-600/5 p-3.5"
                          >
                            <p className="text-sm font-semibold">{claim.statement || '(contradicted claim)'}</p>
                            <p className="mt-1 text-xs text-slate-600">
                              {claim.discrepancy_notes?.trim()
                                ? claim.discrepancy_notes
                                : 'No discrepancy notes recorded — requires human follow-up.'}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Human review context */}
                  {(appCommittee.length > 0 || appReviews.length > 0) && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-indigo-600" />
                        <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">
                          Human review context
                        </h3>
                      </div>
                      {appCommittee.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            Committee decisions
                          </p>
                          {appCommittee.map((d: any, i: number) => (
                            <div key={d?.id ?? `com-${i}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold">{d?.reviewer_name ?? d?.member_name ?? d?.decided_by ?? 'Committee member'}</span>
                                <span className="px-1.5 py-0.5 rounded border border-slate-500/20 bg-white text-slate-600 font-semibold uppercase">
                                  {prettify(d?.decision ?? d?.vote ?? '')}
                                </span>
                              </div>
                              {(d?.rationale ?? d?.notes) && (
                                <p className="mt-1 text-slate-500">{String(d?.rationale ?? d?.notes ?? '')}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {appReviews.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            Reviewer scores
                          </p>
                          {appReviews.map((r: any, i: number) => (
                            <div key={r?.id ?? `rev-${i}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold">{r?.reviewer_name ?? r?.reviewer ?? 'Reviewer'}</span>
                                {r?.recommendation != null && (
                                  <span className="px-1.5 py-0.5 rounded border border-slate-500/20 bg-white text-slate-600 font-semibold uppercase">
                                    {prettify(String(r?.recommendation ?? ''))}
                                  </span>
                                )}
                                {r?.overall_conviction != null && (
                                  <span className="text-slate-500">Conviction: <span className="font-semibold text-slate-700">{String(r?.overall_conviction ?? '')}</span></span>
                                )}
                              </div>
                              {r?.notes && <p className="mt-1 text-slate-500">{String(r?.notes ?? '')}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
