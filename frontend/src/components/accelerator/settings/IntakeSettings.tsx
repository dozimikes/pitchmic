'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Inbox,
  KeyRound,
  Link2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import {
  acceleratorApi,
  type ApplicationCycleItem,
  type IntakeImportPreview,
  type IntakeIssue,
  type IntakeKeyResponse,
  type IntakeSubmissionRow,
} from '@/lib/acceleratorApi';
import { apiErrMessage } from '@/lib/screening';
import { cn } from '@/lib/utils';

const CYCLES_RESOURCE = 'application-cycles';
const QUEUE_FILTERS = [
  { value: 'staged', label: 'Waiting for a decision' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'dismissed', label: 'Dismissed' },
] as const;

/** Where a program's own form posts. The key is the only credential in the body. */
const INGEST_PATH = '/accelerator/intake/ingest/';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1';

const inputCls =
  'w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-xs text-white ' +
  'placeholder-white/30 focus:outline-none focus:border-indigo-500/60 transition';

const SOURCE_LABEL: Record<string, string> = {
  website: 'Their form',
  spreadsheet: 'Imported',
  api: 'Direct post',
};

function dash(value?: string | null) {
  return value && value.trim() ? value : '—';
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function IssueList({ issues }: { issues: IntakeIssue[] }) {
  if (!issues.length) {
    return <span className="text-[10px] text-emerald-300/70">Arrived complete</span>;
  }
  return (
    <ul className="space-y-0.5">
      {issues.map((issue) => (
        <li key={issue.code} className="flex items-start gap-1.5 text-[10px] text-amber-200/80">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/70" />
          <span>{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}

/** The row of gaps a person has to read before deciding. Empty means empty, not
 *  "fine": the server says which rows cannot be accepted. */
function canAccept(row: IntakeSubmissionRow) {
  return row.status === 'staged' && row.can_accept;
}

export function IntakeSettings() {
  const { activeProgramId } = useActiveProgram();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const pid = activeProgramId ?? null;
  const cyclesKey = ['accelerator-cycles', pid] as const;
  const queueKey = ['accelerator-intake-queue', pid] as const;

  const [filter, setFilter] = React.useState<(typeof QUEUE_FILTERS)[number]['value']>('staged');

  const { data: cycles = [], isLoading: cyclesLoading } = useQuery({
    queryKey: cyclesKey,
    queryFn: () => acceleratorApi.osList<ApplicationCycleItem>(CYCLES_RESOURCE, pid as number),
    enabled: pid != null,
  });

  const {
    data: queue = [],
    isLoading: queueLoading,
    isError: queueIsError,
  } = useQuery({
    queryKey: [...queueKey, filter],
    queryFn: () => acceleratorApi.listIntakeSubmissions({ program_id: pid, status: filter }),
    enabled: pid != null,
  });

  const refreshQueue = () => {
    queryClient.invalidateQueries({ queryKey: ['accelerator-intake-queue'] });
    queryClient.invalidateQueries({ queryKey: cyclesKey });
  };

  if (pid == null) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-xs text-white/60">
        Pick a program in the top bar first. Intake belongs to one program's
        cycle, and nothing here is global.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-white">
          <Inbox className="h-4 w-4 text-indigo-400" />
          Intake &amp; Import
        </h3>
        <p className="mt-1 max-w-2xl text-xs text-white/50">
          Founders reach this program from outside the dashboard in two ways:
          your own form posts to a cycle's intake key, or you upload the
          spreadsheet you already have. Both land in the queue below — never in
          the funnel. A row becomes an application when a person accepts it, and
          that person is recorded.
        </p>
      </div>

      {cyclesLoading ? (
        <div className="flex items-center gap-2 text-xs text-white/40">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          Loading cycles…
        </div>
      ) : (
        <ReceivingDoors cycles={cycles} onChanged={refreshQueue} />
      )}

      <ImportPanel
        cycles={cycles}
        programId={pid}
        onCommitted={() => {
          refreshQueue();
          setFilter('staged');
        }}
      />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-white/50">
            The queue — {QUEUE_FILTERS.find((f) => f.value === filter)?.label.toLowerCase()}
          </h4>
          <div className="flex items-center gap-1">
            {QUEUE_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-[11px] font-medium transition',
                  filter === f.value
                    ? 'bg-white/10 text-white'
                    : 'text-white/45 hover:bg-white/5 hover:text-white/80',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {queueIsError && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            The queue could not be read. An empty list here would look like
            nobody had applied, which is a different fact.
          </div>
        )}

        {!queueIsError && queueLoading && (
          <div className="flex items-center gap-2 text-xs text-white/40">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            Loading submissions…
          </div>
        )}

        {!queueIsError && !queueLoading && queue.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-xs text-white/50">
            Nothing {filter === 'staged' ? 'is waiting for a decision' : `has been ${filter}`} in
            this program. A cycle whose key nobody has issued cannot receive
            anything, so an empty queue is often a shut door rather than a quiet
            one.
          </div>
        )}

        {!queueIsError && !queueLoading && queue.length > 0 && (
          <div className="space-y-2">
            {queue.map((row) => (
              <QueueRow
                key={row.id}
                row={row}
                onChanged={refreshQueue}
                onDecidedError={(message) => toast({
                  title: 'The server refused that decision',
                  description: message,
                  variant: 'error',
                })}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── The receiving door, per cycle ────────────────────────────────────────────

function ReceivingDoors({
  cycles,
  onChanged,
}: {
  cycles: ApplicationCycleItem[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  // The plaintext key exists in exactly one response. Held here so it can be
  // shown until the panel is dismissed, and nowhere it could be stored.
  const [issued, setIssued] = React.useState<{ cycleId: number; key: string } | null>(null);
  const [openRow, setOpenRow] = React.useState<number | null>(null);

  const keyMutation = useMutation({
    mutationFn: (vars: { cycleId: number; action: 'issue' | 'rotate' | 'seal' }) =>
      acceleratorApi.setCycleIntakeKey(vars.cycleId, vars.action),
    onSuccess: (res: IntakeKeyResponse, vars) => {
      onChanged();
      if (res.intake_key) setIssued({ cycleId: vars.cycleId, key: res.intake_key });
      else setIssued((current) => (current?.cycleId === vars.cycleId ? null : current));
      toast({
        title: vars.action === 'seal' ? 'This cycle no longer receives' : 'Intake key is live',
        description: vars.action === 'rotate'
          ? 'The previous key stopped working the moment this one was issued.'
          : res.detail,
        variant: vars.action === 'seal' ? 'info' : 'success',
      });
    },
    onError: (err) => {
      toast({
        title: 'The key was not changed',
        description: apiErrMessage(err, 'Could not change the intake key.'),
        variant: 'error',
      });
    },
  });

  if (!cycles.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5 text-xs text-white/50">
        This program has no cycles yet, so there is no window to open. Create one
        under Intake Cycles first — an intake key belongs to a cycle, not to a
        program, because a founder has to land in a specific window.
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <h4 className="text-xs font-bold uppercase tracking-wider text-white/50">
        Receiving door, per cycle
      </h4>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-white/40">
            <tr>
              {['Cycle', 'Door', 'Key', 'Issued', ''].map((h, i) => (
                <th key={`${h}-${i}`} className="px-3 py-2.5 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {cycles.map((c) => {
              const state = c.intake_key;
              const isPending = keyMutation.isPending && keyMutation.variables?.cycleId === c.id;
              return (
                <tr key={c.id} className="align-top hover:bg-white/[0.03]">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-white">{c.name}</div>
                    <div className="text-[10px] text-white/35">
                      {c.cycle_code || 'no code'} · {c.status.toLowerCase()}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {c.intake_open ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                        Receiving
                      </span>
                    ) : (
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/55">
                        Sealed
                      </span>
                    )}
                    {(c.status === 'ARCHIVED' || c.status === 'COMPLETED') && c.intake_open && (
                      <div className="mt-1 text-[10px] text-amber-200/70">
                        Key is live, but a closed window refuses posts.
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 font-mono text-[10px] text-white/55">
                    {state?.hint ? `${state.hint}…` : '—'}
                    <div className="font-sans text-[10px] text-white/30">
                      shown once, stored hashed
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[10px] text-white/45">
                    {state?.issued_by ? dash(state.issued_by.email) : '—'}
                    <div className="text-white/30">{formatDateTime(state?.issued_at)}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {!c.intake_open && (
                        <Button size="sm" disabled={isPending}
                          onClick={() => keyMutation.mutate({ cycleId: c.id, action: 'issue' })}>
                          <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Issue key
                        </Button>
                      )}
                      {c.intake_open && (
                        <>
                          <button
                            onClick={() => setOpenRow(openRow === c.id ? null : c.id)}
                            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-white/45 hover:bg-white/5 hover:text-white"
                          >
                            <Link2 className="h-3.5 w-3.5" /> Where to post
                            <ChevronDown className={cn('h-3 w-3 transition', openRow === c.id && 'rotate-180')} />
                          </button>
                          <Button size="sm" variant="secondary" disabled={isPending}
                            onClick={() => keyMutation.mutate({ cycleId: c.id, action: 'rotate' })}>
                            Rotate
                          </Button>
                          <Button size="sm" variant="ghost" disabled={isPending}
                            onClick={() => keyMutation.mutate({ cycleId: c.id, action: 'seal' })}>
                            Seal
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {cycles.some((c) => c.intake_open) && (
        <div className={cn(
          'rounded-xl border border-white/10 bg-white/5 p-4 text-[11px] leading-relaxed text-white/55',
          openRow == null && 'hidden',
        )}>
          {openRow != null && (
            <>
              <p className="font-semibold text-white/75">
                Point this cycle's form at your own backend, then have it post:
              </p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-[10px] text-white/70">
{`POST ${API_BASE}${INGEST_PATH}
{
  "intake_key": "the key shown when it was issued",
  "founder_email": "ada@labshq.io",
  "founder_name": "Ada Okonkwo",
  "company_name": "Ada Labs",
  "external_id": "form-1042",
  "payload": { "How did you hear about us?": "Newsletter" }
}`}
              </pre>
              <p className="mt-2">
                The program and cycle come from the key, never from the body, so
                a sender cannot aim its submission at another organisation's
                queue. Whatever the form sends beyond those four fields is kept
                under the headings it arrived with. The answer is a receipt —
                this endpoint cannot tell a founder anything about the funnel.
              </p>
              <p className="mt-1 text-white/40">
                It is one unauthenticated write, so it belongs behind your
                edge's rate limiting. Rotating the key stops a leaked one at
                once; sealing it stops receiving entirely.
              </p>
            </>
          )}
        </div>
      )}

      {issued && (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-bold text-white">
                <KeyRound className="h-4 w-4 text-indigo-300" />
                Copy this key now — it is shown once
              </p>
              <p className="mt-1 text-[11px] text-white/60">
                Only its hash is stored, so Pitchmic cannot show it again. If it
                is mislaid, rotate it and update the form.
              </p>
              <p className="mt-2 break-all rounded-lg bg-black/40 px-3 py-2 font-mono text-[11px] text-white/85">
                {issued.key}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <Button size="sm" variant="secondary"
                onClick={() => {
                  void navigator.clipboard?.writeText(issued.key);
                  toast({ title: 'Key copied', variant: 'success' });
                }}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>
                <X className="mr-1.5 h-3.5 w-3.5" /> Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Spreadsheet / JSON import: preview first, then stage ──────────────────────

function ImportPanel({
  cycles,
  programId,
  onCommitted,
}: {
  cycles: ApplicationCycleItem[];
  programId: number;
  onCommitted: () => void;
}) {
  const { toast } = useToast();
  const [file, setFile] = React.useState<File | null>(null);
  const [cycleId, setCycleId] = React.useState<number | null>(null);
  const [preview, setPreview] = React.useState<IntakeImportPreview | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const openCycles = cycles.filter((c) => c.status === 'OPEN' || c.intake_open);
  const target = cycles.find((c) => c.id === cycleId) ?? null;

  const previewMutation = useMutation({
    mutationFn: () => acceleratorApi.importIntakeFile({
      file: file as File, programId, cycleId, commit: false,
    }),
    onSuccess: (res) => {
      if (res.committed) {
        setPreview(null);
        return;
      }
      setPreview(res);
      if (!res.counts.rows) {
        toast({
          title: 'Nothing to import',
          description: 'The file was read, but it had no rows.',
          variant: 'info',
        });
      }
    },
    onError: (err) => {
      setPreview(null);
      toast({
        title: 'That file could not be read',
        description: apiErrMessage(err, 'Could not read the upload.'),
        variant: 'error',
      });
    },
  });

  const commitMutation = useMutation({
    mutationFn: () => acceleratorApi.importIntakeFile({
      file: file as File, programId, cycleId,
      mapping: preview?.mapping, commit: true,
    }),
    onSuccess: (res) => {
      if (!res.committed) return;
      const skipped = res.counts.already_staged ?? 0;
      toast({
        title: `${res.counts.stored} row${res.counts.stored === 1 ? '' : 's'} staged`,
        description: skipped
          ? `${skipped} already waiting in this queue were left as they were.`
          : 'Nothing became an application. The queue is where a person decides.',
        variant: 'success',
      });
      setPreview(null);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      onCommitted();
    },
    onError: (err) => {
      toast({
        title: 'The import was refused',
        description: apiErrMessage(err, 'Could not stage these rows.'),
        variant: 'error',
      });
    },
  });

  return (
    <section className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
      <div>
        <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/50">
          <Upload className="h-3.5 w-3.5" /> Import a file you already have
        </h4>
        <p className="mt-1 text-[11px] text-white/45">
          CSV, TSV, XLSX, XLSM or a JSON array. The preview writes nothing: it
          shows which heading was mapped onto which field, and what each row is
          missing, before a single row is staged.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[240px] flex-1 space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-white/40">File</span>
          <input ref={fileInput} type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xlsm,.json"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
            }}
            className={cn(inputCls, 'file:mr-3 file:rounded file:border-0 file:bg-white/10 '
              + 'file:px-2 file:py-1 file:text-[10px] file:text-white/70')} />
        </label>
        <label className="w-56 space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-white/40">Stage into cycle</span>
          <select className={inputCls} value={cycleId ?? ''}
            onChange={(e) => {
              setCycleId(e.target.value ? Number(e.target.value) : null);
              setPreview(null);
            }}>
            <option value="">— No cycle —</option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.intake_open ? ' · receiving' : ''}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" disabled={!file || previewMutation.isPending}
          onClick={() => previewMutation.mutate()}>
          {previewMutation.isPending ? 'Reading…' : 'Preview'}
        </Button>
      </div>

      {cycleId == null && (
        <p className="text-[10px] text-white/35">
          Rows staged without a cycle cannot be counted per intake window.
          {openCycles.length > 0 && ' Pick one of the open cycles unless these applications predate them.'}
        </p>
      )}

      {preview && (
        <div className="space-y-3 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/60">
            <span>{preview.counts.rows} rows read</span>
            <span>{preview.counts.can_accept} ready to accept</span>
            <span>{preview.counts.rows - preview.counts.can_accept} with gaps</span>
            {!!preview.counts.already_in_queue && (
              <span className="text-amber-200/80">
                {preview.counts.already_in_queue} already waiting in this queue — they will be skipped
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {Object.entries(preview.mapping).length === 0 && (
              <span className="text-[10px] text-rose-200/80">
                No column matched a field. Nothing can be filed without a founder
                email and a company name.
              </span>
            )}
            {Object.entries(preview.mapping).map(([field, header]) => (
              <span key={field}
                className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-200">
                {field} ← “{header}”
              </span>
            ))}
            {preview.unmapped_headers.map((h) => (
              <span key={h} className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-white/45">
                “{h}” kept as extra
              </span>
            ))}
          </div>

          {preview.rows_truncated && (
            <p className="text-[10px] text-white/40">
              Showing the first {preview.rows.length} of {preview.counts.rows} rows.
              The counts above are the whole file.
            </p>
          )}

          <div className="max-h-80 overflow-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[560px] text-left text-[11px]">
              <thead className="sticky top-0 bg-white/5 text-[10px] uppercase tracking-wider text-white/40">
                <tr>
                  {['Row', 'Founder', 'Company', 'Arrived with', 'To read'].map((h) => (
                    <th key={h} className="px-2.5 py-2 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {preview.rows.map((row) => (
                  <tr key={row.row_number} className="align-top">
                    <td className="px-2.5 py-2 font-mono text-[10px] text-white/35">
                      {row.row_number}
                    </td>
                    <td className="px-2.5 py-2 text-white/70">
                      {dash(row.founder_name)}
                      <div className="text-[10px] text-white/40">{dash(row.founder_email)}</div>
                    </td>
                    <td className="px-2.5 py-2 text-white/70">{dash(row.company_name)}</td>
                    <td className="px-2.5 py-2 text-[10px] text-white/40">
                      {Object.keys(row.payload).length
                        ? `${Object.keys(row.payload).length} extra field(s)`
                        : '—'}
                    </td>
                    <td className="px-2.5 py-2"><IssueList issues={row.issues} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" disabled={commitMutation.isPending || !preview.counts.rows}
              onClick={() => commitMutation.mutate()}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              {commitMutation.isPending ? 'Staging…' : `Stage ${preview.counts.rows} row(s)`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Discard</Button>
            <span className="text-[10px] text-white/35">
              Staging keeps the file's rows as they arrived. Accept is still a
              decision, one row at a time.
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

// ── One queued row, and the two decisions over it ────────────────────────────

function QueueRow({
  row,
  onChanged,
  onDecidedError,
}: {
  row: IntakeSubmissionRow;
  onChanged: () => void;
  onDecidedError: (message: string) => void;
}) {
  const [showPayload, setShowPayload] = React.useState(false);
  const [dismissing, setDismissing] = React.useState(false);
  const [note, setNote] = React.useState('');

  const { toast } = useToast();
  const accept = useMutation({
    mutationFn: () => acceleratorApi.acceptIntakeSubmission(row.id),
    onSuccess: (res) => {
      onChanged();
      // The account question is the part a reader would otherwise miss: someone
      // now exists in the roster who cannot sign in until they claim the address.
      toast({
        title: `Filed as application #${res.application_id}`,
        description: res.founder_account_created
          ? 'A founder account was opened for that email, unable to sign in: no password, not verified. They claim it through the ordinary verification path.'
          : 'Filed under the account this email already belongs to.',
        variant: 'success',
      });
    },
    onError: (err) => onDecidedError(apiErrMessage(err, 'Could not accept this submission.')),
  });

  const dismiss = useMutation({
    mutationFn: () => acceleratorApi.dismissIntakeSubmission(row.id, note.trim()),
    onSuccess: () => {
      setDismissing(false);
      setNote('');
      onChanged();
    },
    onError: (err) => onDecidedError(apiErrMessage(err, 'Could not dismiss this submission.')),
  });

  const payloadEntries = Object.entries(row.payload ?? {});
  const decided = row.status !== 'staged';

  return (
    <article className="rounded-xl border border-white/10 bg-white/5 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-white">{dash(row.company_name)}</span>
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/50">
              {SOURCE_LABEL[row.source] ?? row.source}
            </span>
            {decided && (
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
                row.status === 'accepted'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-rose-500/15 text-rose-300',
              )}>
                {row.status}
                {row.decided_by ? ` · ${row.decided_by.email}` : ''}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11px] text-white/50">
            {dash(row.founder_name)} · {dash(row.founder_email)}
          </div>
          <div className="mt-0.5 text-[10px] text-white/35">
            {formatDateTime(row.created_at)} · cycle {row.cycle_name ?? '—'}
            {row.external_id ? ` · their ref ${row.external_id}` : ''}
            {row.batch_ref ? ` · batch ${row.batch_ref.slice(0, 8)}` : ''}
          </div>
          {row.application_id != null && (
            <div className="mt-1 text-[10px] text-emerald-300/80">
              Filed as application #{row.application_id}.
            </div>
          )}
          {row.note && (
            <div className="mt-1 text-[10px] text-white/45">Note: {row.note}</div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {!decided && (
            <>
              <Button size="sm" disabled={!canAccept(row) || accept.isPending}
                onClick={() => accept.mutate()}>
                <Check className="mr-1.5 h-3.5 w-3.5" />
                {accept.isPending ? 'Filing…' : 'Accept'}
              </Button>
              <Button size="sm" variant="ghost" disabled={dismiss.isPending}
                onClick={() => setDismissing((v) => !v)}>
                <X className="mr-1.5 h-3.5 w-3.5" /> Dismiss
              </Button>
            </>
          )}
          {payloadEntries.length > 0 && (
            <button
              onClick={() => setShowPayload((v) => !v)}
              className="text-[10px] text-white/40 underline-offset-2 hover:text-white/70 hover:underline">
              {showPayload ? 'Hide' : 'Show'} {payloadEntries.length} answer(s) as sent
            </button>
          )}
        </div>
      </div>

      {!decided && row.blocking_gaps.length > 0 && (
        <p className="mt-2 text-[10px] leading-relaxed text-amber-200/75">
          Cannot be accepted yet: {row.blocking_gaps.join(' ')}
        </p>
      )}
      {/* With no gap in the way, whatever is left to read is a flag — the second
          copy in one file, or a repeat of something already queued. */}
      {!decided && !row.blocking_gaps.length && row.issues.length > 0 && (
        <div className="mt-2">
          <IssueList issues={row.issues} />
        </div>
      )}

      {dismissing && (
        <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-black/25 p-3">
          <textarea className={cn(inputCls, 'min-h-[56px]')} value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why this is being set aside — kept with the row. Dismissing is not deleting." />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="destructive" disabled={dismiss.isPending}
              onClick={() => dismiss.mutate()}>
              {dismiss.isPending ? 'Dismissing…' : 'Confirm dismiss'}
            </Button>
            <Button size="sm" variant="ghost"
              onClick={() => { setDismissing(false); setNote(''); }}>Cancel</Button>
          </div>
        </div>
      )}

      {showPayload && payloadEntries.length > 0 && (
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 rounded-lg bg-black/25 p-3 sm:grid-cols-2">
          {payloadEntries.map(([heading, value]) => (
            <div key={heading} className="min-w-0">
              <dt className="truncate text-[10px] uppercase tracking-wider text-white/35"
                title={heading}>
                {heading}
              </dt>
              <dd className="whitespace-pre-wrap break-words text-[11px] text-white/65">
                {dash(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}

/** The accept path has to be said out loud: an account now exists that cannot
 *  sign in, and a founder claims it through verification. */
function onAccepted(founderCreated: boolean, applicationId: number) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('pitchmic:intake-accepted', {
    detail: { founderCreated, applicationId },
  }));
}
