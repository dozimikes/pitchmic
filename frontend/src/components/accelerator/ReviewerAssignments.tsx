'use client';

/**
 * Who a program asked to review an application.
 *
 * An assignment routes attention and records ownership. It is not a gate — any
 * eligible reviewer may still file a scorecard without being asked — and it is
 * not a decision. Throughout this file "asked" and "actually filed one" stay
 * separate facts: collapsing them is how a queue starts believing it is covered
 * when it is not.
 *
 * Everything shown here comes from the server (`assignments` on an application
 * row, or /review-assignments/). Nothing is ranked, tallied or re-derived in
 * the browser — including the two facts a browser would most easily get wrong:
 * whether a deadline has passed (`is_overdue`, the server's clock) and whether
 * this account may take a seat off (`may_remove`, the rule DELETE enforces).
 */

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldAlert, UserPlus, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import {
  acceleratorApi,
  type AssignmentCandidate,
  type AssignmentCandidatePage,
  type ReviewAssignmentDetail,
  type ReviewAssignmentRow,
} from '@/lib/acceleratorApi';
import { apiErrMessage, formatDateTime, qk, relativeTime } from '@/lib/screening';

const firstName = (full: string) => (full || '').trim().split(/\s+/)[0] || '—';

const sameId = (a: unknown, b: number | null | undefined) =>
  a != null && b != null && Number(a) === b;

/** Pauses a text box before it becomes a request, so the picker can search on
 *  the server (one page of matches) without fetching on every keystroke. */
function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function seatTitle(a: ReviewAssignmentRow) {
  const parts = [
    a.reviewer_name,
    a.round_id,
    a.scorecard_filed ? 'scorecard filed' : 'asked, no scorecard yet',
  ];
  if (a.conflict_status === 'recused') parts.push('recused');
  else if (a.conflict_status === 'potential') parts.push('conflict flagged');
  // No due date is "nobody set one", never "it was due today".
  parts.push(a.due_at ? `due ${formatDateTime(a.due_at)}` : 'no deadline set');
  if (a.is_overdue) parts.push('past its deadline with no scorecard');
  return parts.join(' · ');
}

// ── Row chips ────────────────────────────────────────────────────────────────

export function AssignmentChips({
  assignments,
  className,
}: {
  /** Null means the server does not show reviewer identity to this reader. */
  assignments?: ReviewAssignmentRow[] | null;
  className?: string;
}) {
  // Silent when hidden: an empty chip row would read as "nobody was asked",
  // which is a claim about the program, not about what this reader may see.
  if (!assignments) return null;
  if (assignments.length === 0) {
    return (
      <span
        className={cn('text-[11px] text-slate-400', className)}
        title="No reviewer has been asked about this application yet. Anyone on the program team can still file a scorecard."
      >
        nobody asked
      </span>
    );
  }
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {assignments.map((a) => {
        const late = a.is_overdue;
        return (
          <span
            key={a.id}
            title={seatTitle(a)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none',
              a.conflict_status === 'recused'
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : a.scorecard_filed
                  ? 'border-indigo-100 bg-indigo-50 text-indigo-700'
                  : 'border-dashed border-slate-200 bg-white text-slate-500',
              late && 'border-rose-200 bg-rose-50 text-rose-700'
            )}
          >
            {a.conflict_status === 'recused' && <ShieldAlert className="h-2.5 w-2.5" aria-hidden />}
            {late && <span aria-hidden>!</span>}
            {firstName(a.reviewer_name)}
          </span>
        );
      })}
    </span>
  );
}

// ── Ask-a-reviewer dialog ────────────────────────────────────────────────────

/** How many people the picker asks the server for at once. The pool is the
 *  platform's program-team eligibility rule and can be hundreds of accounts, so
 *  the search runs there and this box only ever renders one page of it. */
const CANDIDATE_PAGE_LIMIT = 50;

export function AssignReviewerDialog({
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
  /** The person picked is kept as the row they were picked from rather than
   *  looked up in the current page — narrowing the search afterwards must not
   *  erase who was chosen. */
  const [chosen, setChosen] = React.useState<AssignmentCandidate | null>(null);
  const [round, setRound] = React.useState('round-1');
  const [dueDate, setDueDate] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [search, setSearch] = React.useState('');
  const query = useDebounced(search.trim());
  // The server requires a round label. An empty box is shown as what it is
  // instead of quietly filing the ask under `round-1`.
  const roundLabel = round.trim();

  const candidatesQuery = useQuery<AssignmentCandidatePage>({
    queryKey: qk.assignmentCandidates(programId, query || undefined, CANDIDATE_PAGE_LIMIT),
    queryFn: () =>
      acceleratorApi.reviewAssignmentCandidates({
        programId: Number(programId),
        applicationId,
        q: query || undefined,
        limit: CANDIDATE_PAGE_LIMIT,
      }),
    enabled: open && programId != null,
    staleTime: 15_000,
  });

  React.useEffect(() => {
    if (!open) {
      setChosen(null);
      setRound('round-1');
      setDueDate('');
      setNotes('');
      setSearch('');
    }
  }, [open]);

  const invalidate = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.reviewAssignmentsAll() });
    queryClient.invalidateQueries({ queryKey: qk.applications(programId) });
    queryClient.invalidateQueries({ queryKey: qk.reviewerConsensus(programId) });
    queryClient.invalidateQueries({ queryKey: qk.assignmentCandidatesAll() });
  }, [programId, queryClient]);

  const assign = useMutation({
    mutationFn: () =>
      acceleratorApi.createReviewAssignment({
        application: applicationId,
        reviewer: Number(chosen?.id),
        round_id: roundLabel,
        due_date: dueDate || null,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (row) => {
      invalidate();
      toast({
        title: `${row.reviewer_name} was asked`,
        description: row.due_at
          ? `Deadline ${formatDateTime(row.due_at)}. Their scorecard is what will mark this reviewed.`
          : 'No deadline set. Their scorecard is what will mark this reviewed.',
        variant: 'success',
      });
      onOpenChange(false);
    },
    onError: (err) =>
      toast({
        title: 'Could not record that ask',
        description: apiErrMessage(err, 'Assignment failed.'),
        variant: 'error',
        duration: 8000,
      }),
  });

  const page = candidatesQuery.data;
  const people = page?.candidates ?? [];
  const beyondPage = page ? Math.max(0, page.total_matching - page.returned) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-100 px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-sm font-black tracking-tight text-slate-900">
            Ask a reviewer
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-xs text-slate-500">
            {applicationLabel} — this records who the program asked. It does not stop anyone
            else on the team from reviewing, and it decides nothing.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 px-5 pt-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email"
            aria-label="Search eligible reviewers"
            className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:bg-white"
          />
          <label className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Round
            <input
              value={round}
              onChange={(e) => setRound(e.target.value)}
              aria-invalid={roundLabel === ''}
              className={cn(
                'w-24 rounded-lg border bg-slate-50/60 px-2 py-2 text-xs font-medium normal-case tracking-normal outline-none focus:bg-white',
                roundLabel === '' ? 'border-rose-300' : 'border-slate-200 focus:border-indigo-300'
              )}
            />
          </label>
        </div>
        {roundLabel === '' && (
          <p className="px-5 pt-1.5 text-[11px] font-semibold text-rose-700">
            A round label is required — the server files the seat under it, so it is not left
            blank and not invented here either.
          </p>
        )}

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-5">
          {programId == null ? (
            <p className="py-6 text-center text-xs text-slate-500">
              Reviewers are listed per program. Select a program first.
            </p>
          ) : candidatesQuery.isPending ? (
            <p className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading eligible reviewers…
            </p>
          ) : candidatesQuery.isError ? (
            <p className="py-6 text-center text-xs text-rose-600">
              {apiErrMessage(candidatesQuery.error, 'Could not load candidates.')}
            </p>
          ) : people.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              {query
                ? `No eligible reviewer matches “${query}”.`
                : 'No account on the platform is eligible to review yet. The pool is every account with a program role, a staff seat or an active reviewer profile.'}
            </p>
          ) : (
            <>
              <ul className="space-y-1.5 pb-2">
                {people.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setChosen(c)}
                      aria-pressed={chosen?.id === c.id}
                      className={cn(
                        'flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
                        chosen?.id === c.id
                          ? 'border-indigo-300 bg-indigo-50/70'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-900">
                          {c.name}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">{c.email}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          {/* The eligibility pool is the platform's rule, so "holds
                              a staff seat in this program" is said separately. */}
                          {c.on_program_team && (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                              on this program
                            </span>
                          )}
                          {c.already_asked && (
                            <span className="rounded-full border border-dashed border-indigo-200 bg-indigo-50/60 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                              already asked on this application
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        {/* Load is counted by the server, never estimated here. */}
                        <span className="block text-[11px] font-semibold text-slate-600">
                          {c.open_assignments} open · {c.scorecards_filed} filed
                        </span>
                        {/* Capacity is a workload signal the picker shows. Asking
                            anyway is allowed, and saying so is what keeps the
                            amber chip from reading as a refusal. */}
                        <span
                          className={cn(
                            'block text-[10px]',
                            c.at_capacity ? 'font-semibold text-amber-700' : 'text-slate-400'
                          )}
                        >
                          {c.max_active_reviews == null
                            ? 'no stated limit'
                            : c.at_capacity
                              ? `past their ${c.max_active_reviews}-review limit — asking still allowed`
                              : `stated limit ${c.max_active_reviews}`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {beyondPage > 0 && (
                <p className="pb-2 text-[11px] text-slate-400">
                  This page shows {people.length} of {page?.total_matching} who match
                  {query ? ` “${query}”` : ''}; {beyondPage} more are not listed. Keep typing to
                  narrow rather than assume the list is complete.
                </p>
              )}
            </>
          )}
        </div>

        <div className="space-y-3 border-t border-slate-100 px-5 py-4">
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Deadline (optional)
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm font-medium normal-case tracking-normal outline-none focus:border-indigo-300 focus:bg-white"
            />
          </label>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Why this reviewer (optional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Recorded on the seat so the next coordinator knows the reasoning."
              className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm font-medium normal-case tracking-normal outline-none focus:border-indigo-300 focus:bg-white"
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500">
              {chosen
                ? `Asking ${chosen.name}${chosen.already_asked ? ' again, in a new round' : ''}. Filed scorecards are what move this out of “awaiting review”.`
                : 'Pick who to ask.'}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" className="text-slate-500" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-indigo-600 text-white hover:bg-indigo-500"
                loading={assign.isPending}
                disabled={chosen == null || roundLabel === '' || assign.isPending}
                onClick={() => assign.mutate()}
              >
                Ask to review
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Per-application seat list ────────────────────────────────────────────────

export function ReviewerAssignmentPanel({
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

  const seatsQuery = useQuery<ReviewAssignmentDetail[]>({
    queryKey: qk.reviewAssignments(applicationId),
    queryFn: () => acceleratorApi.listReviewAssignments({ applicationId }),
    staleTime: 10_000,
  });

  const invalidate = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.reviewAssignmentsAll() });
    queryClient.invalidateQueries({ queryKey: qk.applications(programId) });
    queryClient.invalidateQueries({ queryKey: qk.reviewerConsensus(programId) });
    queryClient.invalidateQueries({ queryKey: qk.assignmentCandidatesAll() });
  }, [programId, queryClient]);

  const recuse = useMutation({
    mutationFn: (id: number) => acceleratorApi.updateReviewAssignment(id, { conflict_status: 'recused' }),
    onSuccess: () => {
      invalidate();
      toast({
        title: 'Recusal recorded',
        description: 'The ask stays on the application with your name against it, and it is in the audit trail.',
        variant: 'success',
      });
    },
    onError: (err) =>
      toast({ title: 'Could not record the recusal', description: apiErrMessage(err), variant: 'error' }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => acceleratorApi.deleteReviewAssignment(id),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Ask removed', description: 'The removal is in the application audit trail.', variant: 'success' });
    },
    // Who may remove is the server's rule (assigner, the reviewer, program
    // owner or staff), so a refusal is surfaced as what it is.
    onError: (err) =>
      toast({ title: 'Not allowed to remove that', description: apiErrMessage(err), variant: 'error', duration: 8000 }),
  });

  const seats = seatsQuery.data ?? [];
  const staffView = isAccelerator || isAdmin || Boolean(user?.is_staff);
  const filedCount = seats.filter((s) => s.scorecard_filed).length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-slate-700">
            <Users className="h-3.5 w-3.5" /> Who was asked
          </h3>
          <p className="mt-1 text-[11px] text-slate-500">
            {seats.length === 0
              ? 'Nobody has been asked yet. Any reviewer can still file a scorecard.'
              : `${seats.length} asked · ${filedCount} with a scorecard filed`}
          </p>
        </div>
        {staffView && (
          <Button
            size="sm"
            variant="outline"
            leftIcon={<UserPlus className="h-3.5 w-3.5" />}
            onClick={() => setDialogOpen(true)}
          >
            Ask a reviewer
          </Button>
        )}
      </div>

      <div className="mt-3">
        {seatsQuery.isPending ? (
          <p className="flex items-center gap-2 py-2 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading assignments…
          </p>
        ) : seatsQuery.isError ? (
          <p className="py-2 text-xs text-rose-600">
            {apiErrMessage(seatsQuery.error, 'Could not load assignments.')}
          </p>
        ) : seats.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500">
            No reviewer has been pointed at this application. That is not the same as it being
            unreviewed — check the scorecards.
          </p>
        ) : (
          <ul className="space-y-2">
            {seats.map((s) => {
              const mine = sameId(user?.id, s.reviewer_id);
              const late = s.is_overdue;
              // The server answers this question (same rule DELETE applies), so
              // the button cannot outlive the permission. Null means it did not
              // say, which hides the button rather than offering a refusal.
              const mayRemove = s.may_remove === true;
              return (
                <li
                  key={s.id}
                  className={cn(
                    'rounded-xl border px-3 py-2',
                    s.conflict_status === 'recused'
                      ? 'border-amber-200 bg-amber-50/60'
                      : late
                        ? 'border-rose-200 bg-rose-50/50'
                        : 'border-slate-200 bg-slate-50/40'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {s.reviewer_name}
                        {mine && <span className="ml-1.5 text-[10px] font-semibold text-indigo-600">you</span>}
                      </p>
                      {/* Two people can share a display name; the address is
                          what distinguishes them on the ledger. */}
                      <p className="truncate text-[10px] text-slate-400">{s.reviewer_email}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {s.round_id} · {s.scorecard_filed ? 'scorecard filed' : 'no scorecard yet'} ·{' '}
                        {s.due_at ? (
                          <span className={late ? 'font-semibold text-rose-700' : undefined}>
                            due {formatDateTime(s.due_at)}
                          </span>
                        ) : (
                          'no deadline set'
                        )}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {s.assigned_by_name
                          ? `asked by ${s.assigned_by_name} ${relativeTime(s.assigned_at)}`
                          : `asked ${relativeTime(s.assigned_at)} — who asked was not recorded`}
                        {s.conflict_status === 'recused' && ' · recused'}
                        {s.conflict_status === 'potential' && ' · conflict flagged'}
                      </p>
                      {s.notes && (
                        <p className="mt-1 whitespace-pre-line text-[11px] text-slate-600">{s.notes}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {mine && s.conflict_status !== 'recused' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-amber-700 hover:bg-amber-50"
                          loading={recuse.isPending && recuse.variables === s.id}
                          onClick={() => recuse.mutate(s.id)}
                        >
                          Recuse
                        </Button>
                      )}
                      {mayRemove && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                          aria-label={`Remove the ask for ${s.reviewer_name}`}
                          onClick={() => remove.mutate(s.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AssignReviewerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        applicationId={applicationId}
        programId={programId}
        applicationLabel={applicationLabel}
      />
    </div>
  );
}
