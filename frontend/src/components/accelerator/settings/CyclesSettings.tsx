'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import {
  acceleratorApi,
  type ApplicationCycleEdit,
  type ApplicationCycleItem,
} from '@/lib/acceleratorApi';
import { cn } from '@/lib/utils';

const RESOURCE = 'application-cycles';

const inputCls =
  'w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-xs text-white ' +
  'placeholder-white/30 focus:outline-none focus:border-indigo-500/60 transition';

const STATUSES = [
  { value: 'DRAFT', label: 'Draft — not open yet' },
  { value: 'OPEN', label: 'Open for applications' },
  { value: 'REVIEWING', label: 'Under review' },
  { value: 'INTERVIEWING', label: 'Interviews active' },
  { value: 'DECISION', label: 'Committee deciding' },
  { value: 'ACTIVE_COHORT', label: 'Cohort in session' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const INTAKE_TYPES = [
  { value: 'batch', label: 'Fixed batch' },
  { value: 'rolling', label: 'Rolling window' },
];

const WINDOW_COPY: Record<ApplicationCycleItem['scheduled_window']['state'], string> = {
  unscheduled: 'No dates set',
  not_yet_open: 'Opens later',
  inside_window: 'Within its window',
  past_deadline: 'Past deadline',
};

function statusLabel(value: string) {
  return STATUSES.find((s) => s.value === value)?.label ?? value;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** datetime-local ↔ ISO. An empty input sends null: clearing a date is an
 *  answer, not the string "". */
function toLocalInput(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function toLocalDay(value?: string | null) {
  return value ? value.slice(0, 10) : '';
}

function runtimeText(c: ApplicationCycleItem) {
  const r = c.cohort_runtime;
  if (r.phase === 'unscheduled') return 'No cohort dates';
  if (r.phase === 'upcoming') return `Starts ${formatDate(c.cohort_start_date)}`;
  if (r.phase === 'ended') return 'Cohort finished';
  return r.total_weeks == null
    ? `Week ${r.week ?? '—'} · no end date`
    : `Week ${r.week} of ${r.total_weeks}`;
}

function serverMessage(err: unknown, fallback: string) {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data) return fallback;
  if (typeof data.detail === 'string') return data.detail;
  if (typeof data.error === 'string') return data.error;
  const field = Object.values(data).find(
    (v): v is string[] => Array.isArray(v) && typeof v[0] === 'string',
  );
  return field ? field[0] : fallback;
}

interface Draft {
  id: number | null;
  name: string;
  cycle_code: string;
  status: string;
  intake_type: string;
  open_date: string;
  deadline: string;
  cohort_start_date: string;
  cohort_end_date: string;
  target_cohort_size: string;
}

const blankDraft = (): Draft => ({
  id: null,
  name: '',
  cycle_code: '',
  status: 'OPEN',
  intake_type: 'batch',
  open_date: '',
  deadline: '',
  cohort_start_date: '',
  cohort_end_date: '',
  target_cohort_size: '',
});

const draftFrom = (c: ApplicationCycleItem): Draft => ({
  id: c.id,
  name: c.name,
  cycle_code: c.cycle_code ?? '',
  status: c.status,
  intake_type: c.intake_type,
  open_date: toLocalInput(c.open_date),
  deadline: toLocalInput(c.deadline),
  cohort_start_date: toLocalDay(c.cohort_start_date),
  cohort_end_date: toLocalDay(c.cohort_end_date),
  target_cohort_size: String(c.target_cohort_size),
});

export function CyclesSettings() {
  const { activeProgramId } = useActiveProgram();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const pid = activeProgramId ?? null;
  const cyclesKey = ['accelerator-cycles', pid] as const;

  const {
    data: cycles = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: cyclesKey,
    queryFn: () => acceleratorApi.osList<ApplicationCycleItem>(RESOURCE, pid as number),
    enabled: pid != null,
  });

  const [draft, setDraft] = React.useState<Draft | null>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const size = Number(draft?.target_cohort_size ?? '');
  const sizeMissing = !draft || draft.target_cohort_size.trim() === '';
  const sizeBad = sizeMissing || !Number.isInteger(size) || size <= 0;
  const windowInverted =
    !!draft?.open_date && !!draft?.deadline && draft.deadline <= draft.open_date;
  const cohortInverted =
    !!draft?.cohort_start_date && !!draft?.cohort_end_date
    && draft.cohort_end_date < draft.cohort_start_date;

  const saveCycle = useMutation({
    mutationFn: (vars: { id: number | null; body: ApplicationCycleEdit; programId: number }) =>
      vars.id == null
        ? acceleratorApi.osCreate<ApplicationCycleItem>(RESOURCE, {
            ...vars.body, program_id: vars.programId,
          })
        : acceleratorApi.osUpdate<ApplicationCycleItem>(RESOURCE, vars.id, vars.body),
    onSuccess: (saved, vars) => {
      queryClient.invalidateQueries({ queryKey: cyclesKey });
      setDraft(null);
      toast({
        title: vars.id == null ? 'Cycle created' : 'Cycle updated',
        description: `${saved.name} — ${statusLabel(saved.status)}.`,
        variant: 'success',
      });
    },
    onError: (err) => {
      toast({
        title: 'The server did not accept that cycle',
        description: serverMessage(err, 'Could not save the intake cycle.'),
        variant: 'error',
      });
    },
  });

  const removeCycle = useMutation({
    mutationFn: (id: number) => acceleratorApi.osDelete(RESOURCE, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cyclesKey });
      toast({ title: 'Cycle deleted', variant: 'success' });
    },
    onError: (err) => {
      // A cycle with applications is refused rather than silently unlinked, so
      // the reason has to reach the reader instead of a "deleted" toast.
      toast({
        title: 'That cycle is still in use',
        description: serverMessage(err, 'Could not delete the cycle.'),
        variant: 'error',
      });
    },
  });

  const submitDraft = () => {
    if (!draft || pid == null) return;
    const body: ApplicationCycleEdit = {
      name: draft.name.trim(),
      cycle_code: draft.cycle_code.trim(),
      status: draft.status,
      intake_type: draft.intake_type,
      open_date: fromLocalInput(draft.open_date),
      deadline: fromLocalInput(draft.deadline),
      cohort_start_date: draft.cohort_start_date || null,
      cohort_end_date: draft.cohort_end_date || null,
      target_cohort_size: size,
    };
    saveCycle.mutate({ id: draft.id, body, programId: pid });
  };

  if (pid == null) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-xs text-white/60">
        Pick a program in the top bar first — intake cycles belong to one
        program, and nothing here is global.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            <CalendarRange className="h-4 w-4 text-indigo-400" />
            Intake Cycles
          </h3>
          <p className="mt-1 max-w-2xl text-xs text-white/50">
            The windows this program receives founders in. A cycle is what an
            application is filed under, and what the deadline, cohort dates and
            target size all attach to.
          </p>
        </div>
        {!draft && (
          <Button size="sm" onClick={() => setDraft(blankDraft())}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New cycle
          </Button>
        )}
      </div>

      {/* The schedule is not a receiving door. Say so where the dates are. */}
      <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-white/50">
        These dates describe a window; they do not open one. A founder applying
        through Pitchmic is filed under the single cycle this program has open —
        and into no cycle when two windows overlap, because choosing between them
        would be a guess about which door they walked through. Your own form can
        only post into a cycle once someone issues its intake key, which happens
        on Intake &amp; Import, along with the queue of rows that arrived.
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-white/40">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          Loading cycles…
        </div>
      )}

      {isError && !isLoading && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          Cycles could not be loaded. An empty list would look like a program
          with no windows, which is a different fact.
        </div>
      )}

      {!draft && !isLoading && !isError && cycles.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-xs text-white/50">
          No cycles yet. Until one exists, applications to this program are
          filed with no cycle, so nothing can be counted per intake window.
        </div>
      )}

      {!isLoading && !isError && cycles.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-white/40">
              <tr>
                {['Cycle', 'State', 'Application window', 'Cohort', 'Filled', ''].map((h, i) => (
                  <th key={`${h}-${i}`} className="px-3 py-2.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {cycles.map((c) => (
                <tr key={c.id} className="align-top hover:bg-white/[0.03]">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-white">{c.name}</div>
                    <div className="font-mono text-[10px] text-white/35">
                      {c.cycle_code || 'no code'} · {c.intake_type === 'rolling' ? 'rolling' : 'batch'}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                      {statusLabel(c.status)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-white/60">
                    <div>{WINDOW_COPY[c.scheduled_window.state]}</div>
                    <div className="text-[10px] text-white/35">
                      {formatDate(c.open_date)} → {formatDate(c.deadline)}
                    </div>
                    {c.days_until_deadline != null && (
                      <div className="text-[10px] text-white/35">
                        {c.days_until_deadline} days left on the deadline
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-white/60">{runtimeText(c)}</td>
                  <td className="px-3 py-3">
                    <div
                      className="text-white/70"
                      title="Submissions filed under this cycle. Applications filed before cycles existed are not here."
                    >
                      {c.application_count} applied
                    </div>
                    <div className="text-[10px] text-white/35">
                      {c.accepted_count} of {c.target_cohort_size} accepted
                    </div>
                    {/* Staged rows are not applications and are not counted with
                        them anywhere. They are work waiting on a decision. */}
                    {c.staged_count > 0 && (
                      <div className="text-[10px] text-amber-200/70"
                        title="Submissions received from outside the dashboard that nobody has accepted or dismissed yet. These are not applications.">
                        {c.staged_count} waiting to be decided
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setDraft(draftFrom(c))}
                        className="rounded-lg p-1.5 text-white/40 hover:bg-white/5 hover:text-white"
                        title="Edit this cycle"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => removeCycle.mutate(c.id)}
                        disabled={removeCycle.isPending}
                        className="rounded-lg p-1.5 text-rose-400/70 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40"
                        title="Delete this cycle"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draft && (
        <div className="space-y-4 rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-white">
              {draft.id == null ? 'New intake cycle' : `Editing: ${draft.name}`}
            </h4>
            <button onClick={() => setDraft(null)} className="text-white/40 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-white/40">Name</span>
              <input className={inputCls} value={draft.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Q4 2026 — Fintech" />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-white/40">Cycle code</span>
              <input className={inputCls} value={draft.cycle_code}
                onChange={(e) => set('cycle_code', e.target.value)}
                placeholder="2026-Q4" />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-white/40">State</span>
              <select className={inputCls} value={draft.status}
                onChange={(e) => set('status', e.target.value)}>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-white/40">Intake</span>
              <select className={inputCls} value={draft.intake_type}
                onChange={(e) => set('intake_type', e.target.value)}>
                {INTAKE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-white/40">Applications open</span>
              <input type="datetime-local" className={inputCls} value={draft.open_date}
                onChange={(e) => set('open_date', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-white/40">Deadline</span>
              <input type="datetime-local" className={inputCls} value={draft.deadline}
                onChange={(e) => set('deadline', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-white/40">Cohort starts</span>
              <input type="date" className={inputCls} value={draft.cohort_start_date}
                onChange={(e) => set('cohort_start_date', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-white/40">Cohort ends</span>
              <input type="date" className={inputCls} value={draft.cohort_end_date}
                onChange={(e) => set('cohort_end_date', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-white/40">
                Target cohort size
              </span>
              <input type="number" min={1} className={inputCls} value={draft.target_cohort_size}
                onChange={(e) => set('target_cohort_size', e.target.value)}
                placeholder="How many startups this window is built to take" />
            </label>
          </div>

          <p className="text-[10px] leading-relaxed text-white/35">
            Every field here can stay empty and will read as unknown rather than
            zero. The size is the one exception: a cycle nobody sized is not a
            15-startup cycle.
          </p>

          {(windowInverted || cohortInverted || sizeBad) && (
            <ul className="space-y-0.5 text-[11px] text-amber-300/80">
              {windowInverted && <li>The deadline has to fall after the window opens.</li>}
              {cohortInverted && <li>The cohort cannot end before it starts.</li>}
              {sizeBad && <li>State how many startups this cycle is built to take.</li>}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={submitDraft}
              disabled={saveCycle.isPending || sizeBad || windowInverted || cohortInverted
                || !draft.name.trim()}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {draft.id == null ? 'Create cycle' : 'Save changes'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            <span className={cn('text-[10px]', saveCycle.isPending ? 'text-white/50' : 'text-transparent')}>
              Saving…
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
