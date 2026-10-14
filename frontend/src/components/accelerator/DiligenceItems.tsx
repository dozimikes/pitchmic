'use client';

/**
 * Due diligence questions a program is chasing — who owns each one, and by when.
 *
 * An item is an ownership record, not a verdict. Closing one writes down that a
 * human checked something and what they found; the committee still decides. And
 * an application with no items written down is not a clean bill of health — it
 * means nobody has looked yet, which is why "uncovered" is never rendered as
 * "needs nothing".
 *
 * Every number here comes from the server: per-row tallies from the `diligence`
 * dict on an application row, program totals from /diligence-items/rollup/, and
 * the overdue flag from the model's single rule. Nothing is re-derived,
 * re-tallied or re-ranked in the browser.
 */

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Loader2,
  PlusCircle,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import {
  acceleratorApi,
  type ApplicationDiligence,
  type AssignmentCandidate,
  type AssignmentCandidatePage,
  type DiligenceItemRow,
  type DiligenceRollup,
  type DiligenceStatus,
} from '@/lib/acceleratorApi';
import { apiErrMessage, formatDateTime, qk, relativeTime } from '@/lib/screening';

/** The largest page the server will hand out for one person list. A `<select>`
 *  has no search box of its own, so this picker asks for the widest page it
 *  allows and says so when even that is not everyone. */
const CANDIDATE_PAGE_LIMIT = 200;

const STATUS_LABEL: Record<DiligenceStatus, string> = {
  open: 'Open',
  in_progress: 'Being checked',
  resolved: 'Resolved',
  blocked: 'Blocked',
};

/** The statuses still owed. Mirrors the model's OPEN_STATUSES — a blocked item
 *  is still outstanding, and a resolved one is not ever "overdue". */
const STILL_OWED: DiligenceStatus[] = ['open', 'in_progress', 'blocked'];

/** A date input wants YYYY-MM-DD; the API stores end of that day. */
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

function owed(row: DiligenceItemRow) {
  return STILL_OWED.includes(row.status);
}

// ── Per-application tally, as rendered on a table row ────────────────────────

export function DiligenceSummary({
  diligence,
  className,
}: {
  /** Null means the server does not show diligence ownership to this reader —
   *  which must never render as "this company has no open questions". */
  diligence?: ApplicationDiligence | null;
  className?: string;
}) {
  if (!diligence) return null;
  if (diligence.items === 0) {
    return (
      <span
        className={cn('text-[11px] text-slate-400', className)}
        title="No diligence question has been written down for this application. That is not the same as it needing none."
      >
        no questions written down
      </span>
    );
  }
  const parts: string[] = [`${diligence.open} open`];
  if (diligence.overdue > 0) parts.push(`${diligence.overdue} past due`);
  if (diligence.unowned > 0) parts.push(`${diligence.unowned} with no owner`);
  if (diligence.blocked > 0) parts.push(`${diligence.blocked} blocked`);
  if (diligence.resolved > 0) parts.push(`${diligence.resolved} closed`);
  const title = [
    parts.join(' · '),
    // An absent deadline is reported as absent, never as today or as overdue.
    diligence.next_due_at ? `next deadline ${formatDateTime(diligence.next_due_at)}` : 'no deadline set on any open question',
  ].join(' — ');
  return (
    <span
      className={cn(
        'inline-flex flex-wrap items-center gap-1 text-[10px] font-semibold leading-none',
        className
      )}
      title={title}
    >
      <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-600">
        {diligence.open} open
      </span>
      {diligence.overdue > 0 && (
        <span className="rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-rose-700">
          {diligence.overdue} past due
        </span>
      )}
      {diligence.unowned > 0 && (
        <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-amber-700">
          {diligence.unowned} no owner
        </span>
      )}
      {diligence.blocked > 0 && (
        <span className="rounded-full border border-slate-300 bg-white px-1.5 py-0.5 text-slate-500">
          {diligence.blocked} blocked
        </span>
      )}
      {diligence.resolved > 0 && (
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
          {diligence.resolved} closed
        </span>
      )}
    </span>
  );
}

// ── Program-level rollup strip ───────────────────────────────────────────────

function RollupCard({
  label,
  value,
  hint,
  cls,
  muted,
}: {
  label: string;
  value: number;
  hint: string;
  cls: string;
  muted?: boolean;
}) {
  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-white p-4 shadow-sm', muted && 'border-dashed bg-slate-50/60')}>
      <p className={cn('text-2xl font-black tabular-nums', cls)}>{value}</p>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-[11px] text-slate-400">{hint}</p>
    </div>
  );
}

export function DiligenceRollupStrip({ programId }: { programId: number | null }) {
  const { data, isPending, isError, error } = useQuery<DiligenceRollup>({
    queryKey: qk.diligenceRollup(programId),
    queryFn: () => acceleratorApi.getDiligenceRollup({ programId: Number(programId) }),
    enabled: programId != null,
    staleTime: 15_000,
  });

  if (programId == null) return null;
  if (isPending) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Counting open diligence questions…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 text-xs text-rose-700">
        {apiErrMessage(error, 'Could not load the diligence numbers.')}
      </div>
    );
  }

  const coveredApps = data.applications_covered + data.applications_uncovered;
  const holders = data.by_owner.filter((o) => o.owner_id != null).slice(0, 3);
  const unowned = data.by_owner.find((o) => o.owner_id == null);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <RollupCard
          label="Open questions"
          value={data.open}
          hint={`${data.items} written down in total`}
          cls="text-indigo-600"
        />
        <RollupCard
          label="Past due"
          value={data.overdue}
          hint={
            data.oldest_overdue_days == null
              ? 'nothing has slipped'
              : `oldest is ${data.oldest_overdue_days} day${data.oldest_overdue_days === 1 ? '' : 's'} past its date`
          }
          cls={data.overdue > 0 ? 'text-rose-600' : 'text-slate-900'}
          muted={data.overdue === 0}
        />
        <RollupCard
          label="With no owner"
          value={data.unowned_open}
          hint="nobody is answerable for these yet"
          cls={data.unowned_open > 0 ? 'text-amber-600' : 'text-slate-900'}
          muted={data.unowned_open === 0}
        />
        <RollupCard
          label="No deadline set"
          value={data.undated_open}
          hint="open, but nobody wrote down when"
          cls="text-slate-900"
          muted={data.undated_open === 0}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <b className="tabular-nums">{data.resolved}</b> closed with a note
          </span>
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-slate-400" />
            <b className="tabular-nums">{data.blocked}</b> blocked, still owed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 text-indigo-600" />
            {data.next_due_at ? (
              <>next deadline <b>{formatDateTime(data.next_due_at)}</b></>
            ) : (
              'no open question has a deadline'
            )}
          </span>
          <span className="text-slate-400">as of {formatDateTime(data.as_of)}</span>
        </div>

        {/* Coverage, not a gate. An uncovered application is one nobody has
            written a question against — it is not a pass. */}
        <p className="text-xs text-slate-500">
          {coveredApps === 0 ? (
            'No applications are under review in this program yet, so there is nothing to cover.'
          ) : (
            <>
              <b className="text-slate-700">{data.applications_covered}</b> of{' '}
              <b className="text-slate-700">{coveredApps}</b> applications under review have a diligence
              question written down.{' '}
              {data.applications_uncovered > 0 ? (
                <span className="text-amber-700">
                  {data.applications_uncovered} have none — that means nobody has looked yet, not that
                  they need nothing.
                </span>
              ) : (
                'Every application in scope has at least one.'
              )}
            </>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <Users className="h-3.5 w-3.5" /> On whose desk
          </span>
          {holders.length === 0 && !unowned ? (
            <span className="text-[11px] text-slate-400">nothing is outstanding</span>
          ) : (
            <>
              {holders.map((o) => (
                <span
                  key={`owner-${o.owner_id}`}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                    o.overdue > 0
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  )}
                  title={`${o.owner_name}: ${o.open} open${o.overdue > 0 ? `, ${o.overdue} past due` : ''}`}
                >
                  {o.owner_name} · {o.open} open{o.overdue > 0 ? ` · ${o.overdue} late` : ''}
                </span>
              ))}
              {unowned && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                  title={`${unowned.open} open questions have no owner. Nobody is answerable for them yet.`}
                >
                  unowned · {unowned.open} open
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Owner picker (shared by the dialog and each row) ─────────────────────────

function OwnerSelect({
  candidates,
  totalMatching,
  loading,
  disabled,
  value,
  onChange,
  ariaLabel,
  currentOwnerName,
}: {
  candidates: AssignmentCandidate[];
  /** How many people the server matched, which may be more than the page it
   *  sent. A short list is a page, not the whole team, and says so. */
  totalMatching: number;
  loading: boolean;
  disabled: boolean;
  value: number | null;
  onChange: (next: number | null) => void;
  ariaLabel: string;
  /** Name to show when the current owner is not in the candidate list (an
   *  inactive teammate, or the list still loading) — so the row never looks
   *  unowned when it is owned. */
  currentOwnerName?: string | null;
}) {
  const listed = value != null && candidates.some((c) => c.id === value);
  const truncated = totalMatching > candidates.length;
  return (
    <select
      aria-label={ariaLabel}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 outline-none focus:border-indigo-300 disabled:bg-slate-50 disabled:text-slate-400"
    >
      <option value="">
        {loading ? 'Loading eligible people…' : 'Nobody yet — unowned'}
      </option>
      {truncated && (
        <option disabled>
          — first {candidates.length} of {totalMatching} eligible, alphabetically;
          the rest are not listed here —
        </option>
      )}
      {value != null && !listed && (
        <option value={value}>
          {currentOwnerName ?? 'owner not in the list'}
          {loading ? ' (loading…)' : ' · not listed'}
        </option>
      )}
      {candidates.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} — {c.open_diligence} open{c.role ? ` · ${c.role}` : ''}
        </option>
      ))}
    </select>
  );
}

// ── Add-a-question dialog ────────────────────────────────────────────────────

export function AddDiligenceItemDialog({
  open,
  onOpenChange,
  applicationId,
  applicationLabel,
  programId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: number;
  applicationLabel: string;
  programId?: number | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [question, setQuestion] = React.useState('');
  const [area, setArea] = React.useState('');
  const [owner, setOwner] = React.useState<number | null>(null);
  const [dueDate, setDueDate] = React.useState('');

  // The same server-counted people list the review-assignment picker uses, so
  // one load picture per person rather than two competing ones.
  const candidatesQuery = useQuery<AssignmentCandidatePage>({
    queryKey: qk.assignmentCandidates(programId, undefined, CANDIDATE_PAGE_LIMIT),
    queryFn: () =>
      acceleratorApi.reviewAssignmentCandidates({
        programId: Number(programId),
        limit: CANDIDATE_PAGE_LIMIT,
      }),
    enabled: open && programId != null,
    staleTime: 15_000,
  });

  React.useEffect(() => {
    if (!open) {
      setQuestion('');
      setArea('');
      setOwner(null);
      setDueDate('');
    }
  }, [open]);

  const invalidate = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.diligenceItemsAll() });
    queryClient.invalidateQueries({ queryKey: qk.diligenceRollup(programId) });
    queryClient.invalidateQueries({ queryKey: qk.applications(programId) });
    queryClient.invalidateQueries({ queryKey: qk.assignmentCandidatesAll() });
  }, [programId, queryClient]);

  const add = useMutation({
    mutationFn: () =>
      acceleratorApi.createDiligenceItem({
        application: applicationId,
        question: question.trim(),
        area: area.trim(),
        owner,
        due_date: dueDate || null,
      }),
    onSuccess: (row) => {
      invalidate();
      toast({
        title: 'Diligence question opened',
        description: row.owner_name
          ? `${row.owner_name} is answerable for it${row.due_at ? `, due ${formatDateTime(row.due_at)}` : ''}.`
          : 'No owner yet — it stays on the unowned pile until someone takes it.',
        variant: 'success',
      });
      onOpenChange(false);
    },
    onError: (err) =>
      toast({
        title: 'Could not open that question',
        description: apiErrMessage(err, 'Saving failed.'),
        variant: 'error',
        duration: 8000,
      }),
  });

  const trimmed = question.trim();
  const page = candidatesQuery.data;
  const people = page?.candidates ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={() => onOpenChange(false)} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add a diligence question"
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-black tracking-tight text-slate-900">Add a diligence question</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {applicationLabel} — write what must be proved or disproved, and who answers for
              clearing it. This assigns attention; it decides nothing about the candidate.
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-slate-400 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
            What must be verified
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              autoFocus
              placeholder="e.g. Churn in the deck counts logins, not revenue — confirm against Stripe."
              className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm normal-case tracking-normal font-medium outline-none focus:border-indigo-300 focus:bg-white"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Area (optional)
              <input
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="finance, legal, references…"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm normal-case tracking-normal font-medium outline-none focus:border-indigo-300 focus:bg-white"
              />
            </label>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Deadline (optional)
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm normal-case tracking-normal font-medium outline-none focus:border-indigo-300 focus:bg-white"
              />
            </label>
          </div>

          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Who answers for it (optional)
            <span className="mt-1.5 block">
              <OwnerSelect
                ariaLabel="Owner"
                candidates={people}
                totalMatching={page?.total_matching ?? 0}
                loading={candidatesQuery.isPending && programId != null}
                disabled={programId == null}
                value={owner}
                onChange={setOwner}
              />
            </span>
          </label>
          <p className="-mt-2 text-[11px] text-slate-500">
            {programId == null
              ? 'Select a program to pick an owner. You can still open the question unowned.'
              : owner == null
                ? 'Left unowned it sits on the unowned pile — visible as a gap, not as someone else’s problem.'
                : `Named: ${people.find((c) => c.id === owner)?.name ?? '—'}.`}
          </p>
          <p className="text-[11px] text-slate-400">
            Area is a free-text label, not a scorecard dimension — the program picks its own words.
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-4">
          <p className="text-[11px] text-slate-500">
            {trimmed ? `${trimmed.length} characters` : 'A question has to be a question.'}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="text-slate-500" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-indigo-600 text-white hover:bg-indigo-500"
              loading={add.isPending}
              disabled={!trimmed || add.isPending}
              onClick={() => add.mutate()}
            >
              Open the question
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Per-application question list ────────────────────────────────────────────

export function DiligenceItemPanel({
  applicationId,
  programId,
  applicationLabel,
}: {
  applicationId: number;
  programId?: number | null;
  applicationLabel: string;
}) {
  const { user, isAccelerator, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  /** Item id whose closure still needs a note written first. */
  const [closing, setClosing] = React.useState<number | null>(null);
  const [closeNote, setCloseNote] = React.useState('');

  const itemsQuery = useQuery<DiligenceItemRow[]>({
    queryKey: qk.diligenceItems(applicationId),
    queryFn: () => acceleratorApi.listDiligenceItems({ applicationId }),
    staleTime: 10_000,
  });

  const candidatesQuery = useQuery<AssignmentCandidatePage>({
    queryKey: qk.assignmentCandidates(programId, undefined, CANDIDATE_PAGE_LIMIT),
    queryFn: () =>
      acceleratorApi.reviewAssignmentCandidates({
        programId: Number(programId),
        limit: CANDIDATE_PAGE_LIMIT,
      }),
    enabled: programId != null,
    staleTime: 15_000,
  });

  const invalidate = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.diligenceItemsAll() });
    queryClient.invalidateQueries({ queryKey: qk.diligenceRollup(programId) });
    queryClient.invalidateQueries({ queryKey: qk.applications(programId) });
    queryClient.invalidateQueries({ queryKey: qk.assignmentCandidatesAll() });
  }, [programId, queryClient]);

  const patch = useMutation({
    mutationFn: (input: { id: number } & Parameters<typeof acceleratorApi.updateDiligenceItem>[1]) => {
      const { id, ...body } = input;
      return acceleratorApi.updateDiligenceItem(id, body);
    },
    onSuccess: (row, input) => {
      invalidate();
      const statusWasChanged = 'status' in input;
      if (statusWasChanged && row.status === 'resolved') {
        toast({
          title: 'Question closed',
          description: row.resolution_note
            ? 'What you found is recorded on the item and in the audit trail. The committee still decides.'
            : 'Closed without a note — the next reader will not know what was checked.',
          variant: 'success',
        });
      } else if (statusWasChanged) {
        toast({ title: `Marked ${STATUS_LABEL[row.status].toLowerCase()}`, description: row.question, variant: 'success' });
      }
      // Functional update: `closing` in this closure is whatever it was when
      // the mutation was created, so ask the current state instead.
      setClosing((cur) => (cur === row.id ? null : cur));
    },
    onError: (err) =>
      toast({
        title: 'Could not update that question',
        description: apiErrMessage(err),
        variant: 'error',
        duration: 8000,
      }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => acceleratorApi.deleteDiligenceItem(id),
    onSuccess: () => {
      invalidate();
      toast({
        title: 'Question removed',
        description: 'The removal is in the application audit trail.',
        variant: 'success',
      });
    },
    onError: (err) =>
      toast({ title: 'Not allowed to remove that', description: apiErrMessage(err), variant: 'error', duration: 8000 }),
  });

  const items = itemsQuery.data ?? [];
  const staffView = isAccelerator || isAdmin || Boolean(user?.is_staff);
  const openCount = items.filter(owed).length;
  const overdueCount = items.filter((i) => i.is_overdue).length;

  const setStatus = (item: DiligenceItemRow, next: DiligenceStatus) => {
    if (next === item.status) return;
    if (next === 'resolved' && !item.resolution_note.trim()) {
      setClosing(item.id);
      setCloseNote('');
      return;
    }
    patch.mutate({ id: item.id, status: next });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-slate-700">
            <ClipboardList className="h-3.5 w-3.5" /> Diligence questions
          </h3>
          <p className="mt-1 text-[11px] text-slate-500">
            {items.length === 0
              ? 'Nothing has been written down to verify yet. That is not a pass — it means nobody has looked.'
              : `${items.length} written down · ${openCount} still owed${overdueCount > 0 ? ` · ${overdueCount} past due` : ''}`}
          </p>
        </div>
        {staffView && (
          <Button
            size="sm"
            variant="outline"
            leftIcon={<PlusCircle className="h-3.5 w-3.5" />}
            onClick={() => setDialogOpen(true)}
          >
            Add a question
          </Button>
        )}
      </div>

      <div className="mt-3">
        {itemsQuery.isPending ? (
          <p className="flex items-center gap-2 py-2 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading diligence questions…
          </p>
        ) : itemsQuery.isError ? (
          <p className="py-2 text-xs text-rose-600">
            {apiErrMessage(itemsQuery.error, 'Could not load diligence questions.')}
          </p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500">
            No question has been written down for this application. The evidence
            graph is what the ML assembled; this list is what a human decided
            still has to be proved — and nobody has written one yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const isClosing = closing === item.id;
              const busy = patch.isPending && patch.variables?.id === item.id;
              return (
                <li
                  key={item.id}
                  className={cn(
                    'rounded-xl border px-3 py-2.5',
                    item.status === 'resolved'
                      ? 'border-emerald-200 bg-emerald-50/50'
                      : item.is_overdue
                        ? 'border-rose-200 bg-rose-50/50'
                        : item.status === 'blocked'
                          ? 'border-slate-300 bg-slate-50'
                          : 'border-slate-200 bg-white'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={cn('text-sm font-semibold text-slate-900', item.status === 'resolved' && 'line-through decoration-slate-400')}>
                        {item.question}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                        {item.area ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-semibold text-slate-600">
                            {item.area}
                          </span>
                        ) : (
                          <span className="italic text-slate-400">no area labelled</span>
                        )}
                        <span
                          className={cn(
                            'rounded-full border px-1.5 py-0.5 font-semibold',
                            item.is_overdue
                              ? 'border-rose-200 bg-rose-50 text-rose-700'
                              : item.status === 'resolved'
                                ? 'border-emerald-200 bg-white text-emerald-700'
                                : 'border-slate-200 bg-white text-slate-600'
                          )}
                        >
                          {STATUS_LABEL[item.status]}
                        </span>
                        <span className={cn('inline-flex items-center gap-1', item.owner_id == null && 'font-semibold text-amber-700')}>
                          <UserRound className="h-3 w-3" />
                          {item.owner_name ?? 'unowned'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" />
                          {item.due_at ? (
                            <span className={item.is_overdue ? 'font-semibold text-rose-700' : undefined}>
                              due {formatDateTime(item.due_at)}
                            </span>
                          ) : (
                            'no deadline set'
                          )}
                        </span>
                        <span className="text-slate-400">
                          {item.created_by_name
                            ? `opened by ${item.created_by_name} ${relativeTime(item.created_at)}`
                            : `opened ${relativeTime(item.created_at)} — who opened it was not recorded`}
                        </span>
                        {item.status === 'resolved' && item.resolved_at && (
                          <span>closed {relativeTime(item.resolved_at)}</span>
                        )}
                      </p>
                      {item.resolution_note && (
                        <p className="mt-1.5 whitespace-pre-line rounded-lg border border-emerald-200/70 bg-white px-2.5 py-1.5 text-[11px] text-slate-700">
                          <b className="uppercase tracking-wide text-emerald-700">What was found: </b>
                          {item.resolution_note}
                        </p>
                      )}
                    </div>
                    {staffView && (
                      <button
                        type="button"
                        aria-label={`Remove the question: ${item.question}`}
                        className="shrink-0 rounded-md p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-700"
                        onClick={() => remove.mutate(item.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {staffView && (
                    isClosing ? (
                      <div className="mt-2.5 space-y-2 rounded-xl border border-emerald-200 bg-white p-2.5">
                        <label className="block text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                          What did you find?
                          <textarea
                            value={closeNote}
                            onChange={(e) => setCloseNote(e.target.value)}
                            rows={2}
                            autoFocus
                            placeholder="Written for the committee: the source you checked and what it said. Closing without this leaves the next reader guessing."
                            className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2 text-xs normal-case tracking-normal font-medium text-slate-800 outline-none focus:border-indigo-300 focus:bg-white"
                          />
                        </label>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-slate-500"
                            onClick={() => {
                              setClosing(null);
                              setCloseNote('');
                            }}
                          >
                            Keep it open
                          </Button>
                          <Button
                            size="sm"
                            className="bg-emerald-600 text-white hover:bg-emerald-500"
                            loading={busy}
                            onClick={() =>
                              patch.mutate({
                                id: item.id,
                                status: 'resolved',
                                resolution_note: closeNote.trim(),
                              })
                            }
                          >
                            Record it and close
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2.5 grid gap-2 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_minmax(0,8.5rem)_auto] sm:items-end">
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          Status
                          <select
                            aria-label={`Status for: ${item.question}`}
                            value={item.status}
                            disabled={busy}
                            onChange={(e) => setStatus(item, e.target.value as DiligenceStatus)}
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 outline-none focus:border-indigo-300 disabled:bg-slate-50"
                          >
                            {(Object.keys(STATUS_LABEL) as DiligenceStatus[]).map((code) => (
                              <option key={code} value={code}>
                                {STATUS_LABEL[code]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          Owner
                          <span className="mt-1 block">
                            <OwnerSelect
                              ariaLabel={`Owner for: ${item.question}`}
                              candidates={candidatesQuery.data?.candidates ?? []}
                              totalMatching={candidatesQuery.data?.total_matching ?? 0}
                              loading={candidatesQuery.isPending && programId != null}
                              disabled={programId == null || busy}
                              value={item.owner_id}
                              currentOwnerName={item.owner_name}
                              onChange={(next) => {
                                if (next === item.owner_id) return;
                                patch.mutate({ id: item.id, owner: next });
                              }}
                            />
                          </span>
                        </label>
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          Deadline
                          <input
                            type="date"
                            aria-label={`Deadline for: ${item.question}`}
                            value={toDateInput(item.due_at)}
                            disabled={busy}
                            onChange={(e) =>
                              patch.mutate({ id: item.id, due_date: e.target.value || null })
                            }
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 outline-none focus:border-indigo-300 disabled:bg-slate-50"
                          />
                        </label>
                        <div className="flex items-center justify-end gap-2 sm:pb-1">
                          {item.due_at && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-slate-400 hover:bg-slate-100"
                              loading={busy}
                              onClick={() => patch.mutate({ id: item.id, due_date: null })}
                            >
                              Clear date
                            </Button>
                          )}
                          {item.status === 'resolved' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-slate-600 hover:bg-slate-100"
                              loading={busy}
                              onClick={() => patch.mutate({ id: item.id, status: 'open' })}
                            >
                              Reopen
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AddDiligenceItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        applicationId={applicationId}
        programId={programId}
        applicationLabel={applicationLabel}
      />
    </div>
  );
}
