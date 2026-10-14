'use client';

/**
 * Eligibility & Triage — a thin renderer over the server's
 * /applications/eligibility-report/ payload. Every bucket, gate-failure count
 * and requirement verdict is computed by apps.accelerator.eligibility (the
 * same engine behind the founder self-check), so this file derives nothing
 * about an application's standing locally. ML surfaces evidence; the human
 * buttons here (Request Evidence, Director Override) are the only decisions.
 */

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  FileQuestion,
  Gavel,
  Loader2,
  RefreshCw,
  Scale,
  ShieldAlert,
  ShieldQuestion,
  UserX,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import {
  acceleratorApi,
  type EligibilityReport,
  type EligibilityReportRow,
  type EligibilityBucket,
  type EligibilityRequirement,
} from '@/lib/acceleratorApi';
import { apiErrMessage, qk, relativeTime, STATUS_LABELS } from '@/lib/screening';
import { cn } from '@/lib/utils';

interface EligibilityTriageViewProps {
  programId?: number;
}

const VERDICT_LABELS: Record<string, string> = {
  highly_eligible: 'Meets program rules',
  review_needed: 'Needs human review',
  ineligible: 'Fails a hard rule',
};

const BUCKET_META: Record<EligibilityBucket, { label: string; tone: string; hint: string }> = {
  eligible: {
    label: 'Cleared for review',
    tone: 'emerald',
    hint: 'Every program rule passed',
  },
  needs_verification: {
    label: 'Needs verification',
    tone: 'amber',
    hint: 'Uncertain rules, open claims, thin data',
  },
  disqualified: {
    label: 'Fails a hard rule',
    tone: 'rose',
    hint: 'A program policy rule failed',
  },
  rejected: {
    label: 'Human-rejected',
    tone: 'slate',
    hint: 'Already decided by a reviewer',
  },
};

function reqChipClass(status: EligibilityRequirement['status']): string {
  switch (status) {
    case 'satisfied':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'failed':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'uncertain':
    case 'requires_evidence':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
}

function ReqChip({ req }: { req: EligibilityRequirement }) {
  const Icon =
    req.status === 'satisfied'
      ? CheckCircle2
      : req.status === 'failed'
      ? XCircle
      : req.status === 'requires_evidence'
      ? FileQuestion
      : ShieldQuestion;
  return (
    <span
      title={`${req.rule} — founder stated: ${req.user_value}`}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
        reqChipClass(req.status)
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {req.title}
    </span>
  );
}

const TONE_CLASSES: Record<string, { border: string; bg: string; text: string; sub: string }> = {
  emerald: { border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-700', sub: 'text-emerald-600/70' },
  amber: { border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700', sub: 'text-amber-600/70' },
  rose: { border: 'border-rose-200', bg: 'bg-rose-50', text: 'text-rose-700', sub: 'text-rose-600/70' },
  slate: { border: 'border-slate-200', bg: 'bg-slate-50', text: 'text-slate-700', sub: 'text-slate-500' },
};

function BucketCard({ bucket, count, scope }: { bucket: EligibilityBucket; count: number; scope: number }) {
  const meta = BUCKET_META[bucket];
  const tone = TONE_CLASSES[meta.tone];
  return (
    <div className={cn('rounded-2xl border p-4 shadow-sm', tone.border, tone.bg)}>
      <div className="text-[11px] font-bold uppercase tracking-wider" >
        <span className={tone.text}>{meta.label}</span>
      </div>
      <div className={cn('mt-1 text-3xl font-black tabular-nums', tone.text)}>{count}</div>
      <div className={cn('mt-0.5 text-[11px]', tone.sub)}>
        {scope > 0 ? `${Math.round((count / scope) * 100)}% of triage scope · ` : ''}
        {meta.hint}
      </div>
    </div>
  );
}

export function EligibilityTriageView({ programId }: EligibilityTriageViewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [bucketFilter, setBucketFilter] = React.useState<EligibilityBucket | 'all'>('all');
  const [overrideRow, setOverrideRow] = React.useState<EligibilityReportRow | null>(null);
  const [overrideReason, setOverrideReason] = React.useState('');

  const reportQuery = useQuery({
    queryKey: qk.eligibilityReport(programId ?? null),
    queryFn: () => acceleratorApi.getEligibilityReport(programId),
    enabled: programId != null,
  });
  const report: EligibilityReport | undefined = reportQuery.data;

  const invalidateReport = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.eligibilityReport(programId ?? null) });
    queryClient.invalidateQueries({ queryKey: qk.applications(programId ?? null) });
    queryClient.invalidateQueries({ queryKey: ['accelerator-screening-summary', programId ?? null] });
  }, [queryClient, programId]);

  const persistMutation = useMutation({
    mutationFn: () => acceleratorApi.evaluateEligibility(programId),
    onSuccess: (data) => {
      toast({
        title: 'Eligibility persisted to application records',
        description: `${data.evaluated} application(s) scored against the program's rules — the funnel, decision dossiers and eligibility automations now read stored truth.`,
        variant: 'success',
      });
      invalidateReport();
    },
    onError: (err) => {
      toast({ title: 'Eligibility run failed', description: apiErrMessage(err, 'Could not run eligibility checks.'), variant: 'error' });
    },
  });

  const evidenceMutation = useMutation({
    mutationFn: (row: EligibilityReportRow) => {
      const items = [
        ...(row.signals.unverified_claims > 0
          ? [{ type: 'custom', description: `${row.signals.unverified_claims} unverified founder claim(s) need supporting documents` }]
          : []),
        ...row.signals.pending_dimensions.map((d) => ({ type: 'custom', description: `Evidence needed: ${d}` })),
      ];
      const message = `Your application needs a few more details before our team can review it: ${items
        .map((i) => i.description)
        .join('; ')}.`;
      return acceleratorApi.requestEvidence(row.application_id, items, message);
    },
    onSuccess: (_data, row) => {
      toast({
        title: `Evidence requested from ${row.company_name}`,
        description: 'The founder is asked to supply the pending items; the application stays out of the review lane until then.',
        variant: 'success',
      });
      invalidateReport();
    },
    onError: (err) => {
      toast({ title: 'Evidence request failed', description: apiErrMessage(err, 'Could not request evidence.'), variant: 'error' });
    },
  });

  const overrideMutation = useMutation({
    mutationFn: ({ row, reason }: { row: EligibilityReportRow; reason: string }) =>
      acceleratorApi.advanceApplicationStage(row.application_id, 'SCREENING', reason, true),
    onSuccess: (_data, { row }) => {
      toast({
        title: 'Override recorded in the audit ledger',
        description: `${row.company_name} was promoted to Screening by an explicit, justified human decision.`,
        variant: 'success',
      });
      setOverrideRow(null);
      setOverrideReason('');
      invalidateReport();
    },
    onError: (err, { row }) => {
      toast({
        title: `Override refused for ${row.company_name}`,
        description: apiErrMessage(err, 'Only staff or this program’s owner can override, with a written justification.'),
        variant: 'error',
      });
    },
  });

  if (programId == null) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
        Select a program to evaluate its applications against the program's eligibility rules.
      </div>
    );
  }

  if (reportQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-12 text-sm text-slate-500 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
        Evaluating applications against this program's rules…
      </div>
    );
  }

  if (reportQuery.isError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
        <div className="text-sm font-bold text-rose-800">Eligibility report failed</div>
        <p className="mt-1 text-xs text-rose-700">
          {apiErrMessage(reportQuery.error, 'The eligibility report request failed.')}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3 border-rose-300 bg-white text-rose-700 hover:bg-rose-100"
          onClick={() => reportQuery.refetch()}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  if (!report) return null;

  const scope = report.scope.triage_scope;
  const rows = bucketFilter === 'all' ? report.rows : report.rows.filter((r) => r.bucket === bucketFilter);
  const disqTotal = report.buckets.disqualified;

  return (
    <div className="space-y-6">
      {/* ── Header + persist action ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500 max-w-2xl">
          Every application is scored against <strong className="text-slate-700">this program's own rules</strong> by the
          same engine founders use at intake. Buckets are exclusive and sum to the {scope}-application triage scope
          {report.scope.excluded.length > 0 && (
            <> ({report.scope.excluded.map((e) => `${e.count} ${STATUS_LABELS[e.status as keyof typeof STATUS_LABELS] ?? e.status.toLowerCase()}`).join(', ')} excluded)</>
          )}
          . Hard-rule failures never auto-reject — they wait for a human.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          disabled={persistMutation.isPending}
          onClick={() => persistMutation.mutate()}
        >
          {persistMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          Persist scores
        </Button>
      </div>

      {report.scope.truncated && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
          Triage scope holds {scope} applications but only the first {report.scope.evaluated} were evaluated for this
          view — counts below cover the evaluated set, not the whole program.
        </div>
      )}

      {/* ── Bucket cards (exclusive lanes) ──────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(['eligible', 'needs_verification', 'disqualified', 'rejected'] as EligibilityBucket[]).map((b) => (
          <button key={b} type="button" onClick={() => setBucketFilter(bucketFilter === b ? 'all' : b)} className="text-left">
            <BucketCard bucket={b} count={report.buckets[b]} scope={report.scope.evaluated} />
          </button>
        ))}
      </div>

      {/* ── Ranked hard-rule failures (Pareto) ──────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
          <Scale className="h-4 w-4 text-indigo-600" /> Which rules founders actually fail
        </h2>
        <p className="text-xs text-slate-500 mt-0.5 mb-4">
          Ranked by frequency across the {disqTotal} application(s) failing a hard rule — counts and cumulative share
          computed server-side.
        </p>
        {report.gate_failures.length === 0 ? (
          <p className="text-xs text-slate-400">No application currently fails a hard rule under this program's policy.</p>
        ) : (
          <ul className="space-y-2.5">
            {report.gate_failures.map((g) => (
              <li key={g.dimension}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-semibold text-slate-700">{g.title}</span>
                  <span className="text-slate-500 tabular-nums">
                    {g.count} · {g.pct_of_disqualified}% <span className="text-slate-400">(cum {g.cumulative_pct}%)</span>
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-rose-400" style={{ width: `${Math.min(100, g.pct_of_disqualified)}%` }} />
                </div>
                <p className="mt-0.5 text-[10px] text-slate-400">{g.rule}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Flagged queue ───────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-rose-600" />
            {bucketFilter === 'all' ? 'All applications' : BUCKET_META[bucketFilter].label}
            <span className="font-semibold text-xs text-slate-400">({rows.length})</span>
          </h2>
          {bucketFilter !== 'all' && (
            <Button size="sm" variant="ghost" className="text-xs text-slate-500" onClick={() => setBucketFilter('all')}>
              Clear filter
            </Button>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-400 shadow-sm">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400/70 mb-2" />
            Nothing in this lane. Applications move here only when the server's rule engine says so.
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 shadow-sm overflow-hidden">
            {rows.map((row) => (
              <div key={row.application_id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={`/accelerator/applications/${row.application_id}`}
                    className="text-sm font-bold text-slate-900 hover:text-indigo-700 inline-flex items-center gap-1"
                  >
                    {row.company_name}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    {STATUS_LABELS[row.status as keyof typeof STATUS_LABELS] ?? row.status}
                  </span>
                  <span
                    className="text-[10px] font-bold uppercase tracking-wide text-slate-400"
                    title={VERDICT_LABELS[row.eligibility.verdict] ?? row.eligibility.verdict}
                  >
                    {row.eligibility.satisfied + row.eligibility.failed + row.eligibility.uncertain + row.eligibility.evidence_needed === 0
                      ? 'No rules configured'
                      : `${row.eligibility.satisfied}/${row.eligibility.total} rules passed`}
                  </span>
                  {row.tier && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400" title="ML screening lane — attention routing, not a verdict">
                      Lane {row.tier}
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-2">
                    {(row.bucket === 'needs_verification' || row.bucket === 'disqualified') && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs"
                        disabled={evidenceMutation.isPending && evidenceMutation.variables?.application_id === row.application_id}
                        onClick={() => evidenceMutation.mutate(row)}
                      >
                        Request Evidence
                      </Button>
                    )}
                    {row.bucket === 'disqualified' && (
                      <Button
                        size="sm"
                        className="bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                        disabled={row.status === 'SCREENING'}
                        onClick={() => {
                          setOverrideRow(row);
                          setOverrideReason('');
                        }}
                      >
                        <Gavel className="h-3.5 w-3.5 mr-1.5" /> Director Override
                      </Button>
                    )}
                  </span>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {row.requirements.map((req) => (
                    <ReqChip key={req.dimension} req={req} />
                  ))}
                </div>

                {(row.signals.stage_conflict || row.signals.unverified_claims > 0 || row.completeness < 40) && (
                  <p className="mt-2 text-[11px] text-slate-500">
                    {[
                      row.signals.stage_conflict && 'Declared stage conflicts with reported metrics',
                      row.signals.unverified_claims > 0 && `${row.signals.unverified_claims} claim(s) still unverified`,
                      row.completeness < 40 && `Application ${Math.round(row.completeness)}% complete`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Recent overrides (accountability) ───────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-3">
          <UserX className="h-4 w-4 text-slate-500" /> Recent director overrides
        </h2>
        {report.recent_overrides.length === 0 ? (
          <p className="text-xs text-slate-400">
            No gate overrides recorded for this program yet. Every override needs a justification and is stamped in the
            immutable audit ledger with the evidence snapshot of its moment.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {report.recent_overrides.map((o, i) => (
              <li key={`${o.application_id}-${o.timestamp}-${i}`} className="flex items-start justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <span className="font-bold text-slate-800">{o.company_name}</span>
                  <span className="text-slate-500">
                    {' '}· {o.from_stage} → {o.to_stage} by {o.actor}
                  </span>
                  <p className="text-slate-400 truncate" title={o.reason}>{o.reason}</p>
                </div>
                <span className="shrink-0 text-[10px] text-slate-400">{relativeTime(o.timestamp)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Override modal ──────────────────────────────────────────────── */}
      {overrideRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Record director override"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Gavel className="h-4 w-4 text-indigo-600" /> Record director override
              </h3>
              <button onClick={() => setOverrideRow(null)} className="text-slate-400 hover:text-slate-700" aria-label="Close">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              <strong className="text-slate-800">{overrideRow.company_name}</strong> currently fails:{' '}
              {overrideRow.signals.failed_dimensions.join(', ') || 'a hard rule'}. Promoting it to Screening is a human
              decision reserved for staff or this program's owner — your written justification is stamped in the
              immutable audit ledger alongside an evidence snapshot.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!overrideReason.trim()) return;
                overrideMutation.mutate({ row: overrideRow, reason: overrideReason.trim() });
              }}
              className="space-y-4"
            >
              <div>
                <label htmlFor="override-reason" className="block text-xs font-bold text-slate-700 mb-1.5">
                  Justification (required)
                </label>
                <textarea
                  id="override-reason"
                  rows={3}
                  required
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                  placeholder="Why does this application deserve review despite the failed rule?"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" className="border-slate-200 text-slate-600" onClick={() => setOverrideRow(null)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!overrideReason.trim() || overrideMutation.isPending} className="bg-indigo-600 text-white hover:bg-indigo-700">
                  {overrideMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Confirm override & promote
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
