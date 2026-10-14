'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus, ExternalLink, Clock, CheckCircle2, Archive, Loader2, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import { acceleratorApi, type AcceleratorProgram } from '@/lib/acceleratorApi';
import Link from 'next/link';

/**
 * `program_status` is exposed by the program detail serializer; the list
 * serializer may omit it, so it is treated as optional and the badge falls back
 * to `is_active` when absent. `created_by_name` is likewise only present on some
 * payloads — the organization is used as the lead fallback.
 */
interface ProgramListRow extends AcceleratorProgram {
  program_status?: string;
  created_by_name?: string;
}

interface MembershipRow {
  id: number;
  program?: number;
  is_active?: boolean;
}

type StatusTone = 'active' | 'draft' | 'archived';

interface ProgramItem {
  id: number;
  name: string;
  slug: string;
  cycle: string;
  status: string;
  tone: StatusTone;
  statusCode: string | null;
  applicationsCount: number;
  acceptedCount: number | null;
  nextDeadline: string;
  manager: string;
  cohortStart: string | null;
  cohortEnd: string | null;
}

const STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  draft: { label: 'Draft', tone: 'draft' },
  setup: { label: 'Setup', tone: 'draft' },
  published: { label: 'Published', tone: 'active' },
  accepting: { label: 'Accepting', tone: 'active' },
  reviewing: { label: 'Under Review', tone: 'active' },
  cohort_active: { label: 'Cohort Active', tone: 'active' },
  completed: { label: 'Completed', tone: 'archived' },
  archived: { label: 'Archived', tone: 'archived' },
};

function statusOf(row: ProgramListRow): { label: string; tone: StatusTone; code: string | null } {
  const code = row.program_status ?? null;
  if (code && STATUS_META[code]) return { ...STATUS_META[code], code };
  return row.is_active === false
    ? { label: 'Archived', tone: 'archived', code }
    : { label: 'Active', tone: 'active', code };
}

function formatDate(value?: string | null): string {
  if (!value) return 'TBD';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/** The cohort's own schedule, spelled out. A missing end date is said rather
 *  than filled in with `program_duration_weeks`, which is a creation default. */
function cohortLine(start: string | null, end: string | null): string {
  if (!start) return 'No dates set';
  if (!end) return `${formatDate(start)} → no end date`;
  return `${formatDate(start)} → ${formatDate(end)}`;
}

export function ProgramsSettings() {
  const { activeProgram, activeOrganization } = useActiveProgram();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Shared with ProgramContext so the switcher stays in sync after a mutation.
  const programsKey = ['accelerator-programs'] as const;
  const membershipsKey = ['accelerator-memberships'] as const;

  const { data: programRows = [], isLoading } = useQuery({
    queryKey: programsKey,
    queryFn: () => acceleratorApi.getPrograms(),
  });

  // Cohort member counts come from the real membership roster, grouped per program.
  const { data: membershipRows = [], isError: membershipsFailed } = useQuery({
    queryKey: membershipsKey,
    queryFn: () => acceleratorApi.osList<MembershipRow>('memberships'),
  });

  const programs = React.useMemo<ProgramItem[]>(() => {
    const cohortCounts = new Map<number, number>();
    membershipRows.forEach((m) => {
      if (m.program == null) return;
      cohortCounts.set(m.program, (cohortCounts.get(m.program) ?? 0) + 1);
    });

    return programRows.map((row) => {
      const status = statusOf(row);
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        cycle: row.program_cycle || '—',
        status: status.label,
        tone: status.tone,
        statusCode: status.code,
        applicationsCount: row.total_applications ?? 0,
        acceptedCount: membershipsFailed ? null : cohortCounts.get(row.id) ?? 0,
        nextDeadline: formatDate(row.application_deadline),
        manager: row.created_by_name || row.organization_name || '—',
        cohortStart: row.cohort_start_date ?? null,
        cohortEnd: row.cohort_end_date ?? null,
      };
    });
  }, [programRows, membershipRows, membershipsFailed]);

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [newProgramName, setNewProgramName] = React.useState('');
  const [newProgramCycle, setNewProgramCycle] = React.useState('2026 Cohort 1');

  const createProgram = useMutation({
    mutationFn: (data: Record<string, any>) =>
      acceleratorApi.osCreate<ProgramListRow>('programs', data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: programsKey });
      toast({
        title: 'Program Created',
        description: `${created?.name ?? 'Program'} scoped under organization. Configure its evaluation policy in program settings.`,
        variant: 'success',
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Create failed',
        description:
          err?.response?.data?.name?.[0] ||
          err?.response?.data?.slug?.[0] ||
          err?.response?.data?.error ||
          'Could not create the program.',
        variant: 'error',
      });
    },
  });

  const setStatus = useMutation({
    mutationFn: (vars: { id: number; program_status: string; is_active?: boolean }) => {
      const { id, ...body } = vars;
      return acceleratorApi.updateProgram(id, body);
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: programsKey });
      toast({
        title: vars.program_status === 'archived' ? 'Program archived' : 'Program status updated',
        description: `Lifecycle state set to ${vars.program_status.replace('_', ' ')}.`,
        variant: 'success',
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Update failed',
        description: err?.response?.data?.error || 'Could not update program status.',
        variant: 'error',
      });
    },
  });

  // The cohort's two schedule dates are what the sidebar week number is counted
  // from, so they need a place to be set. An empty input sends null — clearing a
  // date is a real answer, not the string "".
  const [scheduleFor, setScheduleFor] = React.useState<number | null>(null);
  const [draftStart, setDraftStart] = React.useState('');
  const [draftEnd, setDraftEnd] = React.useState('');

  const saveSchedule = useMutation({
    mutationFn: (vars: { id: number; cohort_start_date: string | null; cohort_end_date: string | null }) =>
      acceleratorApi.updateProgram(vars.id, {
        cohort_start_date: vars.cohort_start_date,
        cohort_end_date: vars.cohort_end_date,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: programsKey });
      setScheduleFor(null);
      toast({
        title: 'Cohort schedule saved',
        description: 'The sidebar week count is derived from these dates.',
        variant: 'success',
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Could not save the schedule',
        description:
          err?.response?.data?.cohort_start_date?.[0] ||
          err?.response?.data?.cohort_end_date?.[0] ||
          err?.response?.data?.detail ||
          err?.response?.data?.error ||
          'The server did not accept those dates.',
        variant: 'error',
      });
    },
  });

  const handleCreateProgram = () => {
    const name = newProgramName.trim();
    if (!name) return;
    const organizationName =
      activeOrganization?.name || activeProgram?.organization_name || '';
    if (!organizationName) {
      toast({
        title: 'Organization required',
        description: 'Select an organization context before creating a program.',
        variant: 'warning',
      });
      return;
    }
    createProgram.mutate({
      name,
      slug: slugify(name),
      organization_name: organizationName,
      program_cycle: newProgramCycle.trim() || 'Rolling',
      program_status: 'draft',
    });
    setNewProgramName('');
    setIsCreateOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              Organization · Program Administration
            </span>
          </div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Layers className="h-5 w-5 text-indigo-400" />
            Programs Scoped Under Accelerator
          </h2>
          <p className="text-xs text-white/50 mt-1">
            Organization settings establish global defaults. Detailed scoring rules, intake forms, and cohort milestones are managed in each program&apos;s isolated settings.
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => setIsCreateOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3.5 py-2 flex items-center gap-1.5 shrink-0"
        >
          <Plus className="h-4 w-4" /> Create New Program
        </Button>
      </div>

      {/* Program Creation Modal */}
      {isCreateOpen && (
        <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-5 space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white">Create New Accelerator Program</h4>
            <button onClick={() => setIsCreateOpen(false)} className="text-xs text-white/40 hover:text-white">
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-white/70">Program Name</label>
              <input
                type="text"
                placeholder="e.g. AI & DeepTech Accelerator 2027"
                value={newProgramName}
                onChange={(e) => setNewProgramName(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-white/70">Initial Intake Batch / Cycle</label>
              <input
                type="text"
                value={newProgramCycle}
                onChange={(e) => setNewProgramCycle(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="ghost" onClick={() => setIsCreateOpen(false)} className="text-xs text-white/60">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateProgram}
              disabled={createProgram.isPending}
              className="bg-indigo-600 text-white text-xs font-bold"
            >
              {createProgram.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              Initialize Program
            </Button>
          </div>
        </div>
      )}

      {/* Programs List */}
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] divide-y divide-white/5 overflow-hidden shadow-xl">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-white/50 px-5 py-12">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading programs…
          </div>
        ) : programs.length === 0 ? (
          <p className="px-5 py-12 text-center text-xs text-white/40">
            No programs scoped under this organization yet. Create one to begin configuring intake.
          </p>
        ) : (
          programs.map((prog) => {
            const isActive = prog.tone === 'active';
            const isDraft = prog.tone === 'draft';
            // ISO dates compare correctly as strings, which is what these inputs give.
            const badOrder = draftStart !== '' && draftEnd !== '' && draftEnd < draftStart;
            const endWithoutStart = draftEnd !== '' && draftStart === '';

            return (
              <div key={prog.id} className="hover:bg-white/[0.02] transition">
                <div className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <h4 className="text-sm font-bold text-white">{prog.name}</h4>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        isActive
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : isDraft
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : 'bg-white/10 text-white/40 border-white/10'
                      }`}
                    >
                      {prog.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-white/50">
                    <span className="font-mono text-indigo-300">{prog.cycle}</span>
                    <span>•</span>
                    <span>{prog.applicationsCount} Applications</span>
                    <span>•</span>
                    <span>{prog.acceptedCount ?? '—'} Cohort Members</span>
                    <span>•</span>
                    <span>Lead: {prog.manager}</span>
                    <span>•</span>
                    <span>Deadline: {prog.nextDeadline}</span>
                    <span>•</span>
                    <span title="The sidebar's week number is counted from these two dates, not from the program's duration field.">
                      Cohort: {cohortLine(prog.cohortStart, prog.cohortEnd)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => {
                      setScheduleFor(scheduleFor === prog.id ? null : prog.id);
                      setDraftStart(prog.cohortStart ?? '');
                      setDraftEnd(prog.cohortEnd ?? '');
                    }}
                    className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white transition flex items-center gap-1.5"
                  >
                    <CalendarDays className="h-3.5 w-3.5 text-white/50" />
                    Cohort dates
                  </button>
                  <Link
                    href={`/accelerator?program=${prog.id}`}
                    className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 transition flex items-center gap-1.5"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-white/50" />
                    <span>Program Cockpit</span>
                  </Link>
                  <Link
                    href={`/accelerator/settings?program=${prog.id}&tab=dna`}
                    className="rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 px-3 py-1.5 text-xs font-bold hover:bg-indigo-600/30 transition"
                  >
                    Manage Policy
                  </Link>

                  {(prog.statusCode === 'draft' || prog.statusCode === 'setup') && (
                    <button
                      onClick={() => setStatus.mutate({ id: prog.id, program_status: 'published' })}
                      disabled={setStatus.isPending}
                      title="Publish program (visible for intake)"
                      className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-300 hover:bg-emerald-500/20 transition disabled:opacity-40"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {prog.statusCode === 'published' && (
                    <button
                      onClick={() => setStatus.mutate({ id: prog.id, program_status: 'accepting' })}
                      disabled={setStatus.isPending}
                      title="Open intake (accepting applications)"
                      className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-2 text-indigo-300 hover:bg-indigo-500/20 transition disabled:opacity-40"
                    >
                      <Clock className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {prog.tone !== 'archived' && (
                    <button
                      onClick={() =>
                        setStatus.mutate({ id: prog.id, program_status: 'archived', is_active: false })
                      }
                      disabled={setStatus.isPending}
                      title="Archive program"
                      className="rounded-lg border border-white/15 bg-white/5 p-2 text-white/60 hover:text-white hover:bg-white/10 transition disabled:opacity-40"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                </div>

                {scheduleFor === prog.id && (
                  <div className="px-5 pb-5">
                    <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4 space-y-3">
                      <div className="text-xs font-bold text-white">Cohort schedule</div>
                      <p className="text-[11px] text-white/50 leading-relaxed">
                        The week number shown in the sidebar is counted from these two dates. With no start
                        date it reads “No dates set” — the program&apos;s duration field is a creation
                        default, so it is never used as the total.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="space-y-1 block">
                          <span className="text-xs font-semibold text-white/70">Cohort starts</span>
                          <input
                            type="date"
                            value={draftStart}
                            onChange={(e) => setDraftStart(e.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:outline-none"
                          />
                        </label>
                        <label className="space-y-1 block">
                          <span className="text-xs font-semibold text-white/70">Cohort ends</span>
                          <input
                            type="date"
                            value={draftEnd}
                            onChange={(e) => setDraftEnd(e.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:outline-none"
                          />
                        </label>
                      </div>
                      {badOrder && (
                        <p className="text-[11px] text-amber-300">
                          The end date falls before the start date, so no week span can be derived from them.
                        </p>
                      )}
                      {endWithoutStart && !badOrder && (
                        <p className="text-[11px] text-amber-300">
                          Without a start date nothing is counted: saving this leaves the cohort unscheduled.
                        </p>
                      )}
                      <div className="flex justify-end gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setScheduleFor(null)}
                          className="text-xs text-white/60"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          disabled={badOrder || saveSchedule.isPending}
                          onClick={() =>
                            saveSchedule.mutate({
                              id: prog.id,
                              cohort_start_date: draftStart || null,
                              cohort_end_date: draftEnd || null,
                            })
                          }
                          className="bg-indigo-600 text-white text-xs font-bold"
                        >
                          {saveSchedule.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                          Save schedule
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
