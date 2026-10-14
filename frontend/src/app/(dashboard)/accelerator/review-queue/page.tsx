'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList,
  ShieldAlert,
  PauseCircle,
  Sparkles,
  ArrowRight,
  HelpCircle,
  Inbox,
  Loader2,
  AlertTriangle,
  LayoutGrid,
  CheckSquare,
  Square,
  Download,
  FileCheck,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { useActiveProgram } from '../ProgramContext';
import { acceleratorApi, type ApplicationItem } from '@/lib/acceleratorApi';
import { AssignmentChips, AssignReviewerDialog } from '@/components/accelerator/ReviewerAssignments';
import {
  STATUS_LABELS,
  evidenceLevel,
  downloadCsv,
  apiErrMessage,
  qk,
  type EvidenceLevel,
  type QueueBucket,
  type RiskLevel,
} from '@/lib/screening';
/** Lanes are named and routed by the server (apps.accelerator.queue_routing).
 *  This page never decides which lane a row belongs to. */
type Bucket = QueueBucket;
type TabId = Bucket | 'all';

const BUCKET_ORDER: Bucket[] = ['priority', 'investigate', 'needs_evidence', 'hold', 'wildcard'];

// The four lanes attention is priced against; wildcard stays a tab so nothing
// is hidden, but it is not a headline counter.
const COUNTER_BUCKETS: Bucket[] = ['priority', 'investigate', 'needs_evidence', 'hold'];

interface BucketMeta {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  desc: string;
}

// Presentation only — label, icon, colour and the sentence that explains the
// lane. Routing itself is the server's job, so a card, a tab badge and the rows
// under it always describe the same predicate.
const BUCKET_META: Record<Bucket, BucketMeta> = {
  priority: {
    label: 'High Priority',
    icon: ClipboardList,
    tone: 'text-indigo-600 bg-indigo-50 border-indigo-200',
    desc: 'Tier A on the record — strong evidence and fit. These deserve human attention first.',
  },
  investigate: {
    label: 'Investigate',
    icon: ShieldAlert,
    tone: 'text-rose-600 bg-rose-50 border-rose-200',
    desc: 'Something on the application contradicts something else — a declared stage that the metrics do not support, or a claim the evidence disputes. A human settles it.',
  },
  needs_evidence: {
    label: 'Needs Evidence',
    icon: FileCheck,
    tone: 'text-sky-600 bg-sky-50 border-sky-200',
    desc: 'Nothing contradicts, but the claims are unverified or the evidence base is thin. The founder can move this forward by supplying proof.',
  },
  hold: {
    label: 'On Hold',
    icon: PauseCircle,
    tone: 'text-amber-600 bg-amber-50 border-amber-200',
    desc: 'Deferred, waitlisted, or too little submitted to assess reliably. Held, not rejected — there is simply not enough on file.',
  },
  wildcard: {
    label: 'Potential Wildcard',
    icon: Sparkles,
    tone: 'text-violet-600 bg-violet-50 border-violet-200',
    desc: 'Screened and internally consistent, but outside the lanes above — worth a look when the louder signals are clear.',
  },
};

// The router needs every in-funnel row to render a lane, so the working set is
// requested at the API's max page size. Above that the counters (server-side)
// stay correct and the caption says so.
const WORKING_SET_PAGE_SIZE = 200;

const RISK_TONE: Record<RiskLevel, string> = {
  High: 'bg-rose-50 text-rose-700 border-rose-200',
  Medium: 'bg-amber-50 text-amber-700 border-amber-200',
  Low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const LEVEL_CHIP: Record<EvidenceLevel['tone'], string> = {
  strong: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  moderate: 'text-sky-600 bg-sky-50 border-sky-200',
  limited: 'text-amber-600 bg-amber-50 border-amber-200',
  gap: 'text-rose-600 bg-rose-50 border-rose-200',
};

const statusLabel = (s: string) =>
  (STATUS_LABELS as Record<string, string>)[s] ?? s.replace(/_/g, ' ').toLowerCase();

export default function ReviewQueuePage() {
  return (
    <React.Suspense fallback={null}>
      <ReviewQueueInner />
    </React.Suspense>
  );
}

function ReviewQueueInner() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { activeProgram, activeProgramId } = useActiveProgram();
  const pid = activeProgramId ?? null;

  const initialBucket: Bucket = (() => {
    const b = searchParams.get('bucket') as Bucket | null;
    return b && BUCKET_ORDER.includes(b) ? b : 'priority';
  })();
  const [active, setActive] = React.useState<TabId>(initialBucket);
  React.useEffect(() => setActive(initialBucket), [initialBucket]);

  // Rows carry the lane the server assigned, so filtering this table and
  // counting the tabs are lookups — never a second implementation of the rules.
  const {
    data: workingSet = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: [...qk.applications(pid), 'queue'],
    queryFn: () => acceleratorApi.getApplications(pid ?? undefined, { page_size: WORKING_SET_PAGE_SIZE }),
    enabled: pid != null,
  });
  const applications: ApplicationItem[] = Array.isArray(workingSet)
    ? workingSet
    : (workingSet as any)?.results ?? [];

  // Server aggregate drives the page-level counters (never applications.filter()).length.
  const { data: summary } = useQuery({
    queryKey: qk.screeningSummary(pid),
    queryFn: () => acceleratorApi.getScreeningSummary(pid ?? undefined),
    enabled: pid != null,
  });
  const queues = summary?.queues;

  // Review population = the rows the server gave a lane to. A decided or
  // never-submitted application has none, so it is not waiting for attention.
  const reviewPopulation = React.useMemo(
    () => applications.filter((a) => a.queue_bucket != null),
    [applications]
  );

  // null = the server has not answered yet. Rendered as —, never as 0.
  const tabCounts: Record<TabId, number | null> = {
    all: summary ? summary.review_queue : null,
    priority: queues?.priority ?? null,
    investigate: queues?.investigate ?? null,
    needs_evidence: queues?.needs_evidence ?? null,
    hold: queues?.hold ?? null,
    wildcard: queues?.wildcard ?? null,
  };

  const rows = React.useMemo(() => {
    const list =
      active === 'all'
        ? reviewPopulation
        : reviewPopulation.filter((a) => a.queue_bucket === active);
    // Display order over two stored scores — a sort of existing fields, not a
    // new judgement about the applicant.
    return [...list].sort((a, b) => {
      const av = Number(a.program_fit_score) + Number(a.startup_strength_score);
      const bv = Number(b.program_fit_score) + Number(b.startup_strength_score);
      // Guard NaN: an unknown field must never throw or corrupt the ordering.
      if (Number.isNaN(av) || Number.isNaN(bv)) return 0;
      return bv - av;
    });
  }, [reviewPopulation, active]);

  const activeDef = active === 'all' ? null : BUCKET_META[active];

  // Selection + bulk actions. Requests go out with allSettled so one failing
  // founder never aborts the rest of the selection.
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
  const allPageSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const toggleRow = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePage = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });

  // Evidence-request modal. Target captured before any await so the success
  // toast never reads a post-mutation, possibly-stale variable.
  const [evidenceModal, setEvidenceModal] = React.useState<{ ids: number[]; label: string } | null>(null);
  const [evidenceText, setEvidenceText] = React.useState<string>('');
  const evidenceRef = React.useRef<HTMLTextAreaElement>(null);

  // Who the program asked to review each row comes from the server too
  // (`app.assignments`); this dialog only writes it. One mounted dialog,
  // parameterised by the row that opened it.
  const [assignFor, setAssignFor] = React.useState<ApplicationItem | null>(null);

  const evidenceMutation = useMutation({
    mutationFn: async ({ ids, description }: { ids: number[]; description: string }) => {
      const settled = await Promise.allSettled(
        ids.map((id) => acceleratorApi.requestEvidence(id, [{ type: 'custom', description }], description))
      );
      const failures: { id: number; msg: string }[] = [];
      settled.forEach((r, i) => {
        if (r.status === 'rejected') failures.push({ id: ids[i], msg: apiErrMessage(r.reason, 'request failed') });
      });
      return { ok: ids.length - failures.length, attempted: ids.length, failures };
    },
    onSuccess: ({ ok, attempted, failures }) => {
      if (failures.length === 0) {
        toast({
          title: 'Evidence request dispatched',
          description:
            ok === 1
              ? 'The founder has been asked for supporting evidence.'
              : `${ok} founders have been asked for supporting evidence.`,
          variant: 'success',
        });
      } else {
        toast({
          title: `Dispatched ${ok} of ${attempted}`,
          description: failures.map((f) => `#${f.id}: ${f.msg}`).join('; '),
          variant: 'error',
        });
      }
      queryClient.invalidateQueries({ queryKey: qk.applications(pid) });
      queryClient.invalidateQueries({ queryKey: qk.screeningSummary(pid) });
      setEvidenceModal(null);
      setEvidenceText('');
    },
  });

  // Digest of whatever is currently selected — the reviewer's working list, not
  // an export of the whole program.
  const exportDigest = () => {
    const picked = (selectedIds.size > 0 ? rows.filter((r) => selectedIds.has(r.id)) : rows).map((app) => [
      app.company_name,
      (BUCKET_META as Record<string, BucketMeta>)[app.queue_bucket ?? '']?.label ?? app.queue_bucket ?? '—',
      statusLabel(app.status),
      app.declared_stage ? statusLabel(app.declared_stage) : '',
      app.automated_screening_tier ? `Tier ${app.automated_screening_tier}` : 'Unrated',
      app.risk_level ?? 'Not screened',
      (app.risk_reasons ?? []).join('; '),
      evidenceLevel(app.program_fit_score)?.label ?? 'No data',
      evidenceLevel(app.evidence_confidence_score)?.label ?? 'No data',
      `${app.unverified_claims} of ${app.total_claims} claims unverified`,
      app.aging_days ?? '',
      // "asked" is who the program pointed at; "scorecards filed" is who did it.
      app.assignments
        ? `${app.assignments.map((a) => a.reviewer_name).join('; ') || 'nobody'} (${app.assignments.filter((a) => a.scorecard_filed).length} filed)`
        : '',
    ]);
    downloadCsv(
      `review-queue-${pid ?? 'program'}-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Company', 'Queue lane', 'Status', 'Declared stage', 'Screening tier', 'Screening risk', 'Risk reasons', 'Selection Framework fit', 'Evidence', 'Claim ledger', 'Days waiting', 'Reviewers asked'],
      picked
    );
  };

  // Modal a11y: focus in on open, restore on close, Escape to dismiss.
  React.useEffect(() => {
    if (!evidenceModal) return;
    const restore = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => evidenceRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEvidenceModal(null);
        setEvidenceText('');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      restore?.focus?.();
    };
  }, [evidenceModal]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 lg:p-8 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-indigo-600/10 text-indigo-700 border border-indigo-500/20">
            Review Queue
          </span>
          <span className="text-xs text-slate-400">{activeProgram?.name ?? '—'}</span>
        </div>
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight">Where should human attention go?</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-2xl">
          Applications are routed into queues by evidence signal — not ranked by a single score.
          Pitchmic surfaces the evidence; reviewers make the call.
        </p>
      </div>

      {/* Lane counters — values come from getScreeningSummary().queues, the same
          router that assigns each row's queue_bucket. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {COUNTER_BUCKETS.map((b) => (
          <CounterCard
            key={b}
            icon={BUCKET_META[b].icon}
            tone={BUCKET_META[b].tone}
            label={BUCKET_META[b].label}
            value={tabCounts[b]}
            onClick={() => setActive(b)}
          />
        ))}
      </div>

      {/* Tabs: All + every server-routed lane */}
      <div role="tablist" aria-label="Review queues" className="flex flex-wrap gap-2 border-b border-slate-200 pb-px text-xs font-semibold">
        <QueueTab selected={active === 'all'} onClick={() => setActive('all')} icon={LayoutGrid} label="All" count={tabCounts.all} />
        {BUCKET_ORDER.map((b) => (
          <QueueTab
            key={b}
            selected={active === b}
            onClick={() => setActive(b)}
            icon={BUCKET_META[b].icon}
            iconTone={BUCKET_META[b].tone.split(' ')[0]}
            label={BUCKET_META[b].label}
            count={tabCounts[b]}
          />
        ))}
      </div>

      {/* Active tab description */}
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <HelpCircle className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
        <p className="text-xs text-slate-500">
          {activeDef
            ? activeDef.desc
            : 'Everything still in review — no final disposition yet. Queues route attention by evidence signal, not by a single score.'}
        </p>
      </div>

      {/* Loading / error / empty / rows */}
      {isLoading ? (
        <QueueSkeleton />
      ) : isError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-rose-400 mb-2" />
          <p className="text-sm font-semibold text-rose-700">{apiErrMessage(error, 'Could not load the review queue.')}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3 border-rose-300 bg-white text-rose-700 hover:bg-rose-100">
            Retry
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-white">
          <Inbox className="h-8 w-8 mb-2 text-slate-300" />
          <p className="text-sm font-medium">Nothing in this queue right now.</p>
          <p className="text-xs">Run ML screening from the Command Center to route new applications.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Bulk bar — evidence requests + digest export only, no status changes */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-2.5">
              <span className="text-xs font-bold text-indigo-700">{selectedIds.size} selected</span>
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-500 text-white"
                onClick={() => {
                  const ids = Array.from(selectedIds);
                  setEvidenceModal({
                    ids,
                    label: ids.length === 1 ? 'the selected application' : `${ids.length} selected applications`,
                  });
                  setEvidenceText('');
                }}
              >
                <FileCheck className="h-3.5 w-3.5 mr-1.5" />
                Request evidence
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-100"
                onClick={exportDigest}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Queue digest (CSV)
              </Button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="ml-auto text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <button onClick={togglePage} aria-label="Select all rows on this page" className="text-slate-400 hover:text-indigo-600">
                        {allPageSelected ? <CheckSquare className="h-4 w-4 text-indigo-600" /> : <Square className="h-4 w-4" />}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-semibold">Applicant</th>
                    <th className="px-4 py-3 font-semibold">Stage</th>
                    <th className="px-4 py-3 font-semibold">Selection Framework</th>
                    <th className="px-4 py-3 font-semibold">Evidence</th>
                    <th className="px-4 py-3 font-semibold">Risk</th>
                    <th className="px-4 py-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((app) => {
                    // Both come straight off the serializer, routed by
                    // queue_routing.py. An unscreened row has no level at all —
                    // it never defaults to "Low", because missing is not zero.
                    const riskLevel = app.risk_level ?? null;
                    const riskReasons = app.risk_reasons ?? [];
                    const isSelected = selectedIds.has(app.id);
                    const lane = (BUCKET_META as Record<string, BucketMeta>)[app.queue_bucket ?? ''];
                    return (
                      <tr key={app.id} className={cn('border-b border-slate-100 hover:bg-slate-50 transition last:border-b-0', isSelected && 'bg-indigo-50/40')}>
                        {/* Checkbox */}
                        <td className="px-4 py-3 align-middle">
                          <button onClick={() => toggleRow(app.id)} aria-label={`Select ${app.company_name}`} className="text-slate-400 hover:text-indigo-600">
                            {isSelected ? <CheckSquare className="h-4 w-4 text-indigo-600" /> : <Square className="h-4 w-4" />}
                          </button>
                        </td>
                        {/* Applicant */}
                        <td className="px-4 py-3 min-w-[180px]">
                          <Link href={`/accelerator/applications/${app.id}?tab=evidence`} className="font-bold text-slate-900 hover:text-indigo-600 transition">
                            {app.company_name}
                          </Link>
                          <div className="mt-0.5 flex items-center gap-1.5 flex-wrap text-[10px] text-slate-500">
                            {app.sector && <span className="rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5">{app.sector}</span>}
                            <span className="rounded bg-slate-800 text-white font-bold px-1.5 py-0.5">
                              {app.automated_screening_tier ? `Tier ${app.automated_screening_tier}` : 'Unrated'}
                            </span>
                            {active === 'all' && lane && (
                              <span className={cn('rounded border px-1.5 py-0.5 font-semibold', lane.tone)}>{lane.label}</span>
                            )}
                          </div>
                          {/* aging_days is the server's own figure (submitted_at,
                              falling back to created_at). A dash means no
                              timestamp exists — missing is not "0 days". */}
                          <div className="mt-1 text-[10px] font-semibold">
                            {app.aging_days == null ? (
                              <span
                                className="text-slate-400"
                                title="This record has no submission or creation timestamp, so its waiting time is unknown rather than zero."
                              >
                                —
                              </span>
                            ) : (
                              <span className={cn(app.aging_days >= 14 ? 'text-amber-700' : 'text-slate-400')}>
                                {app.aging_days}d waiting
                              </span>
                            )}
                          </div>
                          {/* Who the program has asked. Deliberately separate
                              from the lane counters: an ask is not a filed
                              scorecard, and neither is a decision. Rendered
                              only where the server exposes reviewer identity. */}
                          {app.assignments && (
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <AssignmentChips assignments={app.assignments} />
                              <button
                                onClick={() => setAssignFor(app)}
                                className="text-[10px] font-semibold text-slate-400 hover:text-indigo-600"
                                title="Ask someone on the program team to review this. Any reviewer can also file a scorecard without being asked."
                              >
                                + ask
                              </button>
                            </div>
                          )}
                        </td>
                        {/* Stage */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div>{app.declared_stage ? statusLabel(app.declared_stage) : '—'}</div>
                          <div className="text-[10px] text-slate-400">{statusLabel(app.status)}</div>
                        </td>
                        {/* Fit + strength as secondary signal (evidence levels, never bare scores) */}
                        <td className="px-4 py-3">
                          <LevelChip label="Fit" score={app.program_fit_score} />
                          <div className="mt-1">
                            <LevelChip label="Strength" score={app.startup_strength_score} />
                          </div>
                        </td>
                        {/* Evidence */}
                        <td className="px-4 py-3">
                          <LevelChip label="Evidence" score={app.evidence_confidence_score} />
                        </td>
                        {/* Risk */}
                        <td className="px-4 py-3">
                          {riskLevel ? (
                            <span className={cn('inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold', RISK_TONE[riskLevel])} title={riskReasons.length ? riskReasons.join(' · ') : 'No contradiction or verification flags'}>
                              {riskLevel}
                            </span>
                          ) : (
                            <span className="inline-block rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-400" title="ML screening has not recorded a risk level">
                              Risk: —
                            </span>
                          )}
                          {riskReasons.length > 0 && (
                            <div className="mt-1 flex items-center gap-1 flex-wrap">
                              {riskReasons.slice(0, 2).map((f) => (
                                <span key={f} className="inline-flex items-center gap-1 text-[10px] text-rose-600">
                                  <ShieldAlert className="h-3 w-3" /> {f}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        {/* Action */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <Link href={`/accelerator/applications/${app.id}?tab=evidence`}>
                              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white">
                                Open full analysis <ArrowRight className="h-3.5 w-3.5 ml-1" />
                              </Button>
                            </Link>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEvidenceModal({ ids: [app.id], label: app.company_name });
                                setEvidenceText('');
                              }}
                              className="border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                            >
                              Request evidence
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Honest truncation: the working set is capped by the request, the
                server counters are not. */}
            {summary != null && (
              <p className="px-4 py-2.5 border-t border-slate-100 text-[11px] text-slate-400">
                {applications.length >= WORKING_SET_PAGE_SIZE
                  ? `Working set capped at ${WORKING_SET_PAGE_SIZE} applications — this list may be partial, so trust the lane counters above, which are computed over the whole program.`
                  : `Every application in this program is in the working set (${applications.length} loaded, ${reviewPopulation.length} routed into lanes).`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Ask-a-reviewer dialog: writes who the program asked. One instance,
          parameterised by the row that opened it. */}
      <AssignReviewerDialog
        open={assignFor != null}
        onOpenChange={(open) => !open && setAssignFor(null)}
        applicationId={assignFor?.id ?? 0}
        applicationLabel={assignFor?.company_name ?? ''}
        programId={pid}
      />

      {/* Evidence-request modal */}
      {evidenceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setEvidenceModal(null)} />
          <div role="dialog" aria-modal="true" aria-label="Request evidence" className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Request evidence</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Ask {evidenceModal.label} for the specific documents or data points that are missing or unverified.
                </p>
              </div>
              <button onClick={() => setEvidenceModal(null)} aria-label="Close" className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              ref={evidenceRef}
              value={evidenceText}
              onChange={(e) => setEvidenceText(e.target.value)}
              rows={4}
              placeholder="e.g. Please provide bank statements or an API export verifying the reported MRR figure."
              className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEvidenceModal(null)} className="border-slate-300 bg-white text-slate-600 hover:bg-slate-100">
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!evidenceText.trim() || evidenceMutation.isPending}
                onClick={() => evidenceMutation.mutate({ ids: evidenceModal.ids, description: evidenceText.trim() })}
                className="bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                {evidenceMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />}
                {evidenceMutation.isPending ? 'Sending…' : 'Send request'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QueueTab({
  selected,
  onClick,
  icon: Icon,
  iconTone,
  label,
  count,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  iconTone?: string;
  label: string;
  /** null = the server has not answered yet. A badge never shows 0 for unknown. */
  count: number | null;
}) {
  return (
    <button
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 border-b-2 -mb-px transition whitespace-nowrap rounded-t-lg',
        selected ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-900'
      )}
    >
      <Icon className={cn('h-4 w-4', selected ? 'text-indigo-600' : iconTone)} />
      <span>{label}</span>
      <span
        className={cn(
          'rounded-full border px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
          selected ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-slate-50 text-slate-500'
        )}
      >
        {count ?? '—'}
      </span>
    </button>
  );
}

function CounterCard({
  icon: Icon,
  tone,
  label,
  value,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  label: string;
  /** null = not yet computed by the server. Rendered as —, never as 0. */
  value: number | null;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm text-left w-full hover:border-indigo-300 hover:bg-indigo-50/30 transition"
    >
      <span className={cn('flex h-9 w-9 items-center justify-center rounded-full border shrink-0', tone)}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <span className="block text-xl font-black leading-none text-slate-900 tabular-nums">{value ?? '—'}</span>
      </span>
    </button>
  );
}

function LevelChip({ label, score }: { label: string; score: number | null | undefined }) {
  const lvl = evidenceLevel(score);
  if (!lvl) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-400">
        <span className="text-slate-500">{label}:</span>
        <span className="font-bold">No data</span>
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium', LEVEL_CHIP[lvl.tone])}>
      <span className="text-slate-500">{label}:</span>
      <span className="font-bold">{lvl.label}</span>
    </span>
  );
}

function QueueSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="h-4 flex-1 rounded bg-slate-100 animate-pulse" />
          <div className="h-4 w-20 rounded bg-slate-100 animate-pulse" />
          <div className="h-4 w-16 rounded bg-slate-100 animate-pulse" />
        </div>
      ))}
    </div>
  );
}
