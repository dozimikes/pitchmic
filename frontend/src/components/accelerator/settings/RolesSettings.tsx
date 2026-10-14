'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Check, X, Lock, Sliders, Save, Plus, Trash2, Loader2, Users, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import {
  acceleratorApi,
  type AssignmentCandidate,
  type ProgramRoleItem,
  type ProgramStaffSeat,
  type StaffRoleOption,
} from '@/lib/acceleratorApi';

/** `/accelerator/program-roles/` rows (ProgramRoleSerializer). */
interface RoleRow extends Omit<ProgramRoleItem, 'id'> {
  id: number;
}

interface RoleDefinition {
  id: number;
  name: string;
  slug: string;
  description: string;
  membersCount: number | null;
  isSystemRole: boolean;
  permissions: string[];
}

interface PermissionRow {
  id: string;
  label: string;
  granted: boolean;
}

interface PermissionSection {
  title: string;
  permissions: PermissionRow[];
}

/** A DRF field error, whichever key carried it. The server answers a refusal
 *  with the field it choked on, so the screen repeats that rather than
 *  reporting a generic failure over a rule the caller could have avoided. */
function seatErrorText(err: any): string {
  const data = err?.response?.data;
  if (!data) return 'Could not change the team.';
  const first = (value: any) =>
    Array.isArray(value) ? String(value[0]) : typeof value === 'string' ? value : null;
  return (
    first(data.user) || first(data.role) || first(data.program_id)
    || first(data.non_field_errors) || first(data.detail)
    || (typeof data.detail === 'string' ? data.detail : null)
    || 'Could not change the team.'
  );
}

function seatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function humanize(value: string): string {
  const spaced = value.replace(/[._-]+/g, ' ').trim();
  if (!spaced) return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/** Group a dotted/underscored permission code into a readable section bucket. */
function groupOf(code: string): string {
  if (code.includes('.')) return code.split('.')[0];
  const parts = code.split(/[_-]/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : 'general';
}

/** The server leaves `member_count` null when a role's slug is not one the
 *  staff roster can carry, so nobody can be counted against it. That is
 *  unknown, not zero. */
const UNKNOWN_MEMBERS =
  'This role is not a code the staff roster records, so its members cannot be counted. Unknown — not zero.';

export function RolesSettings() {
  const { activeProgram, activeContext } = useActiveProgram();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const pid = activeProgram?.id ?? null;
  const rolesKey = ['accelerator-program-roles', pid] as const;

  const { data: roleRows = [], isLoading } = useQuery({
    queryKey: rolesKey,
    queryFn: () => acceleratorApi.osList<RoleRow>('program-roles', pid as number),
    enabled: pid != null,
  });

  const roles = React.useMemo<RoleDefinition[]>(() => {
    return roleRows.map((row) => {
      return {
        id: row.id,
        name: row.name,
        slug: row.slug ?? '',
        description: row.description || 'No description provided for this role.',
        membersCount: row.member_count ?? null,
        isSystemRole: !!row.is_system,
        permissions: (row.permissions ?? []).filter((p): p is string => typeof p === 'string'),
      };
    });
  }, [roleRows]);

  const [selectedRoleId, setSelectedRoleId] = React.useState<number | null>(null);
  const activeRole = roles.find((r) => r.id === selectedRoleId) ?? roles[0];

  // Editable copy of the selected role's permission codes (reset on role switch).
  const [draft, setDraft] = React.useState<string[]>([]);
  const [customCodes, setCustomCodes] = React.useState<string[]>([]);
  const [newPermission, setNewPermission] = React.useState('');
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [newRoleName, setNewRoleName] = React.useState('');
  const [newRoleSlug, setNewRoleSlug] = React.useState('');
  const [newRoleDescription, setNewRoleDescription] = React.useState('');
  const seededFor = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!activeRole) return;
    if (seededFor.current === activeRole.id) return; // don't clobber in-progress edits
    setDraft([...activeRole.permissions]);
    setCustomCodes([]);
    setNewPermission('');
    seededFor.current = activeRole.id;
  }, [activeRole]);

  React.useEffect(() => {
    if (selectedRoleId != null && !roles.some((r) => r.id === selectedRoleId)) setSelectedRoleId(null);
  }, [roles, selectedRoleId]);

  /** Every code known to the tenant, so un-granted codes stay toggleable. */
  const catalogue = React.useMemo(() => {
    const codes = new Set<string>([...draft, ...customCodes]);
    roles.forEach((r) => r.permissions.forEach((p) => codes.add(p)));
    return Array.from(codes).sort();
  }, [roles, draft, customCodes]);

  const sections = React.useMemo<PermissionSection[]>(() => {
    const grouped = new Map<string, PermissionRow[]>();
    catalogue.forEach((code) => {
      const title = humanize(groupOf(code)) || 'General';
      const rows = grouped.get(title) ?? [];
      rows.push({ id: code, label: humanize(code), granted: draft.includes(code) });
      grouped.set(title, rows);
    });
    return Array.from(grouped.entries()).map(([title, permissions]) => ({ title, permissions }));
  }, [catalogue, draft]);

  const invalidateRoles = () => queryClient.invalidateQueries({ queryKey: rolesKey });

  const savePermissions = useMutation({
    mutationFn: (vars: { id: number; permissions: string[] }) =>
      acceleratorApi.osUpdate<RoleRow>('program-roles', vars.id, { permissions: vars.permissions }),
    onSuccess: () => {
      invalidateRoles();
      toast({
        title: 'Permissions Matrix Saved',
        description: `Updated access policy for role ${activeRole?.name ?? ''}.`,
        variant: 'success',
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Save failed',
        description: err?.response?.data?.error || 'Could not save the role permission set.',
        variant: 'error',
      });
    },
  });

  const createRole = useMutation({
    mutationFn: (data: Record<string, any>) => acceleratorApi.osCreate<RoleRow>('program-roles', data),
    onSuccess: (created) => {
      invalidateRoles();
      if (created?.id != null) setSelectedRoleId(created.id);
      toast({ title: 'Role created', description: 'Custom role added to this program.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({
        title: 'Create failed',
        description:
          err?.response?.data?.slug?.[0] ||
          err?.response?.data?.name?.[0] ||
          err?.response?.data?.non_field_errors?.[0] ||
          'Could not create the role.',
        variant: 'error',
      });
    },
  });

  const deleteRole = useMutation({
    mutationFn: (id: number) => acceleratorApi.osDelete('program-roles', id),
    onSuccess: () => {
      setSelectedRoleId(null);
      invalidateRoles();
      toast({ title: 'Role deleted', variant: 'success' });
    },
    onError: () => toast({ title: 'Delete failed', description: 'System roles cannot be deleted.', variant: 'error' }),
  });

  // ── The program's own team ──────────────────────────────────────────────
  // A different table from the roles above. `ProgramRole` is a permission set
  // this screen edits; a seat here is the record that actually grants a person
  // reach over the pipeline, and it is the only honest way to hand a second
  // account access to a program. Editing one does not touch the other.
  const staffKey = ['accelerator-program-staff', pid] as const;
  const { data: seats = [], isLoading: seatsLoading } = useQuery({
    queryKey: staffKey,
    queryFn: () => acceleratorApi.listProgramStaff(pid as number),
    enabled: pid != null,
  });
  // The picker's options come from the server's field choices, so this screen
  // cannot offer a title the database would refuse.
  const { data: staffRoles = [] } = useQuery({
    queryKey: ['accelerator-staff-role-options'],
    queryFn: () => acceleratorApi.programStaffRoleOptions(),
    staleTime: Infinity,
  });

  const [showSeatForm, setShowSeatForm] = React.useState(false);
  const [seatQuery, setSeatQuery] = React.useState('');
  const [seatRole, setSeatRole] = React.useState('');
  const { data: candidatePage, isFetching: candidatesLoading } = useQuery({
    queryKey: ['accelerator-staff-candidates', pid, seatQuery.trim()],
    queryFn: () =>
      acceleratorApi.reviewAssignmentCandidates({
        programId: pid as number,
        q: seatQuery.trim() || undefined,
        limit: 8,
      }),
    enabled: pid != null && showSeatForm,
  });
  // Derived, not stored: the picker's default is whatever the server's own role
  // list says comes first, so the code never sits in state waiting to drift.
  const chosenRole = seatRole || (staffRoles[0]?.value ?? '');

  const invalidateTeam = () => {
    queryClient.invalidateQueries({ queryKey: staffKey });
    // `member_count` on the role cards counts this same table, so seating a
    // person changes what the roles above report too.
    invalidateRoles();
  };

  const seatPerson = useMutation({
    mutationFn: (vars: { user: number; role: string }) =>
      acceleratorApi.seatProgramStaff({ program_id: pid as number, user: vars.user, role: vars.role }),
    onSuccess: (row) => {
      invalidateTeam();
      setShowSeatForm(false);
      setSeatQuery('');
      toast({
        title: 'Seat given',
        description: `${row.user_name || row.user_email} now holds a ${row.role_label} seat.`,
        variant: 'success',
      });
    },
    onError: (err: any) =>
      toast({ title: 'Could not seat that person', description: seatErrorText(err), variant: 'error' }),
  });

  // Deactivating is the reversible shape of leaving: the seat stays on the
  // record and stops granting reach. Removing the row is the irreversible one,
  // so the two get different buttons rather than one "delete".
  const setSeatActive = useMutation({
    mutationFn: (vars: { id: number; is_active: boolean }) =>
      acceleratorApi.setProgramStaffSeatActive(vars.id, vars.is_active),
    onSuccess: (row) => {
      invalidateTeam();
      toast({
        title: row.is_active ? 'Seat restored' : 'Seat deactivated',
        description: `${row.user_name || row.user_email} · ${row.role_label}`,
        variant: 'success',
      });
    },
    onError: (err: any) =>
      toast({ title: 'Could not change that seat', description: seatErrorText(err), variant: 'error' }),
  });

  const unseat = useMutation({
    mutationFn: (id: number) => acceleratorApi.removeProgramStaffSeat(id),
    onSuccess: () => {
      invalidateTeam();
      toast({ title: 'Seat removed', description: 'The roster row is gone; the event ledger keeps who sat there.', variant: 'success' });
    },
    onError: (err: any) =>
      toast({ title: 'Could not remove that seat', description: seatErrorText(err), variant: 'error' }),
  });

  // The server tells us which seats in this program are ours, by membership id,
  // so "you" here is a readout rather than a guess from the email.
  const mySeatIds = new Set((activeContext?.program_roles ?? []).map((r) => r.membership_id));
  const maySeat = activeContext?.can_configure_program === true;
  const activeSeats = seats.filter((s) => s.is_active).length;

  const handleSeat = (candidate: AssignmentCandidate) => {
    if (!chosenRole) return;
    seatPerson.mutate({ user: candidate.id, role: chosenRole });
  };

  const handleTogglePermission = (permId: string) => {
    if (activeRole?.isSystemRole) return;
    setDraft((prev) => (prev.includes(permId) ? prev.filter((p) => p !== permId) : [...prev, permId]));
  };

  const handleAddPermission = () => {
    const code = newPermission.trim();
    if (!code) return;
    setCustomCodes((prev) => (prev.includes(code) ? prev : [...prev, code]));
    setDraft((prev) => (prev.includes(code) ? prev : [...prev, code]));
    setNewPermission('');
  };

  const handleSave = () => {
    if (!activeRole) return;
    if (activeRole.isSystemRole) {
      toast({ title: 'System role is read-only', description: 'Platform roles cannot be edited here.', variant: 'warning' });
      return;
    }
    savePermissions.mutate({ id: activeRole.id, permissions: draft });
  };

  const handleCreateRole = () => {
    const name = newRoleName.trim();
    if (!name || pid == null) return;
    createRole.mutate({
      program_id: pid,
      name,
      slug: slugify(newRoleSlug) || slugify(name),
      description: newRoleDescription.trim(),
      permissions: [],
      is_system: false,
    });
    setNewRoleName('');
    setNewRoleSlug('');
    setNewRoleDescription('');
    setShowCreateForm(false);
  };

  if (pid == null) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-8 text-center">
        <p className="text-sm text-white/60">Select a program to manage its roles and permissions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-white/10 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            People · RBAC Governance
          </span>
        </div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-indigo-400" />
          Roles &amp; Granular Permissions Engine
        </h2>
        <p className="text-xs text-white/50 mt-1">
          Fine-tune resource access across candidate intake, scoring, intelligence execution, and decision committee voting.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Role List Selector */}
        <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-4 space-y-2 shadow-xl h-fit">
          <div className="flex items-center justify-between px-2 mb-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-white/40">
              Configured Roles ({roles.length})
            </h4>
            <button
              onClick={() => setShowCreateForm((v) => !v)}
              title="Create custom role"
              className="p-1 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {showCreateForm && (
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3 space-y-2">
              <input
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="Role name"
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:outline-none"
              />
              <input
                value={newRoleSlug}
                onChange={(e) => setNewRoleSlug(e.target.value)}
                placeholder="slug (optional)"
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white font-mono focus:outline-none"
              />
              <textarea
                value={newRoleDescription}
                onChange={(e) => setNewRoleDescription(e.target.value)}
                placeholder="What may this role do?"
                rows={2}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:outline-none resize-none"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowCreateForm(false)} className="text-xs text-white/60">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateRole}
                  disabled={createRole.isPending}
                  className="bg-indigo-600 text-white text-xs font-bold"
                >
                  {createRole.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                  Create
                </Button>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="flex items-center gap-2 px-2 py-4 text-xs text-white/50">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading roles…
            </div>
          )}
          {!isLoading && roles.length === 0 && (
            <p className="px-2 py-4 text-[11px] text-white/40 italic">
              No roles configured yet. Create one to grant program access.
            </p>
          )}
          {roles.map((r) => {
            const isSelected = r.id === activeRole?.id;
            return (
              <button
                key={r.id}
                onClick={() => setSelectedRoleId(r.id)}
                className={`w-full text-left p-3 rounded-xl transition flex items-center justify-between ${
                  isSelected
                    ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-500/20'
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
              >
                <div>
                  <div className="text-xs font-bold">{r.name}</div>
                  <div
                    className={`text-[10px] ${isSelected ? 'text-indigo-200' : 'text-white/40'}`}
                    title={r.membersCount === null ? UNKNOWN_MEMBERS : undefined}
                  >
                    {r.membersCount === null ? 'Members unknown' : `${r.membersCount} Members assigned`}
                  </div>
                </div>
                {r.isSystemRole && (
                  <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-mono ${isSelected ? 'bg-white/20 text-white' : 'bg-white/5 text-white/40'}`}>
                    System
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Permissions Matrix Detail */}
        <div className="md:col-span-2 rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-6 shadow-xl">
          {activeRole ? (
            <>
              <div className="border-b border-white/10 pb-4 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">{activeRole.name} Permissions</h3>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono"
                      title={activeRole.membersCount === null ? UNKNOWN_MEMBERS : undefined}
                    >
                      {activeRole.membersCount === null ? '— members' : `${activeRole.membersCount} Active`}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/50 font-mono">
                      {activeRole.slug}
                    </span>
                  </div>
                  <p className="text-xs text-white/50 mt-1 max-w-xl">{activeRole.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {activeRole.isSystemRole ? (
                    <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40 font-bold">
                      <Lock className="h-3.5 w-3.5" /> Read only
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={deleteRole.isPending}
                      onClick={() => deleteRole.mutate(activeRole.id)}
                      className="text-rose-300 text-xs hover:text-rose-200"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={savePermissions.isPending || activeRole.isSystemRole}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                  >
                    {savePermissions.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                    Save
                  </Button>
                </div>
              </div>

              <div className="space-y-5">
                {sections.length === 0 && (
                  <p className="text-[11px] text-white/40 italic">
                    No permission codes exist yet. Add one below to grant this role access.
                  </p>
                )}
                {sections.map((section) => (
                  <div key={section.title} className="space-y-2.5">
                    <h5 className="text-[11px] font-bold text-white/40 uppercase tracking-wider">
                      {section.title}
                    </h5>
                    <div className="rounded-xl border border-white/10 bg-black/20 divide-y divide-white/5 overflow-hidden">
                      {section.permissions.map((perm) => (
                        <div
                          key={perm.id}
                          className="p-3 flex items-center justify-between text-xs hover:bg-white/[0.02] transition"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className={perm.granted ? 'text-emerald-400 font-bold' : 'text-rose-400/80'}>
                              {perm.granted ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                            </span>
                            <span className={perm.granted ? 'text-white' : 'text-white/40'}>
                              {perm.label}
                            </span>
                          </div>

                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={perm.granted}
                              disabled={activeRole.isSystemRole}
                              onChange={() => handleTogglePermission(perm.id)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {!activeRole.isSystemRole && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
                    <Sliders className="h-3.5 w-3.5 text-white/40" />
                    <input
                      value={newPermission}
                      onChange={(e) => setNewPermission(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddPermission();
                      }}
                      placeholder="permission code, e.g. application.review"
                      className="flex-1 min-w-[12rem] rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white font-mono placeholder-white/30 focus:outline-none focus:border-indigo-500/60 transition"
                    />
                    <Button
                      onClick={handleAddPermission}
                      size="sm"
                      variant="secondary"
                      className="bg-white/10 hover:bg-white/15 text-white text-xs"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add code
                    </Button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-16 space-y-2 text-white/40">
              <ShieldCheck className="h-8 w-8 mx-auto opacity-40 text-indigo-400" />
              <p className="text-xs font-semibold">
                {isLoading ? 'Loading roles…' : 'No roles configured for this program'}
              </p>
              <p className="text-[11px] max-w-xs mx-auto">
                Create a custom role to define which candidates, decisions, and intelligence modules a member can execute.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── The program's own team (ProgramStaffMembership) ───────────────── */}
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-4 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-400" />
              Program team
            </h3>
            <p className="text-xs text-white/50 mt-1 max-w-2xl">
              The accounts this program has seated on its own staff roster. A seat is what
              grants a second account reach over the pipeline — its applications, review
              queues, scorecards and interviews — and it does not grant the configuration on
              this screen, which stays with the account that runs the program. The roles above
              are permission sets nothing can be counted against on its own; this table is the
              people holding one.
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-white/40">Seated</div>
            <div className="text-sm font-bold text-white">
              {seatsLoading ? '—' : `${activeSeats} of ${seats.length}`}
            </div>
          </div>
        </div>

        {seatsLoading ? (
          <div className="flex items-center gap-2 text-xs text-white/50 py-4">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the roster…
          </div>
        ) : seats.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-6 text-center">
            <p className="text-xs font-semibold text-white/70">
              Nobody is seated yet — this program is one account wide.
            </p>
            <p className="text-[11px] text-white/40 mt-1 max-w-lg mx-auto">
              Everything in it is reached by the single account that made it. Seating someone
              is how a second reviewer gets a queue of their own.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/20 divide-y divide-white/5 overflow-hidden">
            {seats.map((s: ProgramStaffSeat) => {
              const id = s.id;
              const mine = id != null && mySeatIds.has(id);
              return (
                <div
                  key={id ?? `${s.user}-${s.role}`}
                  className={`px-4 py-3 flex items-center gap-3 ${s.is_active ? '' : 'opacity-55'}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <span className="truncate">{s.user_name || 'Unnamed account'}</span>
                      {mine && (
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 shrink-0">
                          You
                        </span>
                      )}
                      {!s.is_active && (
                        <span
                          className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-white/40 shrink-0"
                          title="A deactivated seat stays on the record and grants nothing. Reach is per seat, so a person with a second live seat keeps working."
                        >
                          Deactivated
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-white/40 truncate">{s.user_email || '—'}</div>
                  </div>
                  <div className="text-[11px] text-white/60 shrink-0 w-40 truncate" title={s.role}>
                    {s.role_label || humanize(s.role)}
                  </div>
                  <div
                    className="text-[11px] text-white/40 shrink-0 w-24 text-right"
                    title="When this seat was written. The roster carries no actor column, so who seated a person lives in the event ledger, not on this row."
                  >
                    {seatDate(s.member_since)}
                  </div>
                  {maySeat && id != null && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={setSeatActive.isPending}
                        onClick={() => setSeatActive.mutate({ id, is_active: !s.is_active })}
                        className="text-white/60 text-[11px] hover:text-white"
                      >
                        {s.is_active ? 'Deactivate' : 'Restore'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={unseat.isPending}
                        onClick={() => {
                          if (window.confirm(`Remove ${s.user_name || s.user_email}'s ${s.role_label} seat? The row goes; the event ledger keeps it.`)) {
                            unseat.mutate(id);
                          }
                        }}
                        className="text-rose-300 text-[11px] hover:text-rose-200"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {maySeat ? (
          showSeatForm ? (
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  autoFocus
                  value={seatQuery}
                  onChange={(e) => setSeatQuery(e.target.value)}
                  placeholder="Search by name or email"
                  className="flex-1 min-w-[12rem] rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/60"
                />
                <select
                  value={chosenRole}
                  onChange={(e) => setSeatRole(e.target.value)}
                  className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:outline-none"
                >
                  {staffRoles.length === 0 && <option value="">Loading roles…</option>}
                  {staffRoles.map((r: StaffRoleOption) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <Button size="sm" variant="ghost" className="text-xs text-white/60"
                  onClick={() => { setShowSeatForm(false); setSeatQuery(''); }}>
                  Cancel
                </Button>
              </div>
              {candidatesLoading && !candidatePage ? (
                <div className="flex items-center gap-2 text-[11px] text-white/50">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking for accounts…
                </div>
              ) : (candidatePage?.candidates ?? []).length === 0 ? (
                <p className="text-[11px] text-white/40 italic">
                  No operating-side account matches. A founder cannot be seated here — the
                  server refuses it, because a seated founder would read the whole record
                  layer of the program.
                </p>
              ) : (
                <div className="rounded-lg border border-white/10 divide-y divide-white/5 overflow-hidden">
                  {(candidatePage?.candidates ?? []).map((c) => {
                    const label = staffRoles.find((r) => r.value === seatRole)?.label ?? 'this seat';
                    return (
                      <div key={c.id} className="px-3 py-2 flex items-center gap-3 text-xs">
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-semibold truncate">{c.name}</div>
                          <div className="text-[11px] text-white/40 truncate">{c.email}</div>
                        </div>
                        {c.on_program_team && (
                          <span
                            className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-white/50 shrink-0"
                            title="Already holds a seat in this program. A second, differently-titled seat is allowed; a duplicate of the same title is refused."
                          >
                            Seated
                          </span>
                        )}
                        <Button
                          size="sm"
                          disabled={!seatRole || seatPerson.isPending}
                          onClick={() => handleSeat(c)}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold shrink-0"
                        >
                          <UserPlus className="h-3.5 w-3.5 mr-1" /> Seat as {label}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              {(candidatePage?.total_matching ?? 0) > (candidatePage?.returned ?? 0) && (
                <p className="text-[10px] text-white/40">
                  Showing {candidatePage?.returned} of {candidatePage?.total_matching} matching
                  accounts — narrow the search to see the rest.
                </p>
              )}
            </div>
          ) : (
            <div>
              <Button
                size="sm"
                onClick={() => setShowSeatForm(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
              >
                <UserPlus className="h-3.5 w-3.5 mr-1" /> Seat someone
              </Button>
            </div>
          )
        ) : (
          <p className="text-[11px] text-white/45">
            {activeContext == null
              ? 'The server has not told this session whether it runs the active program, so no seat is offered or removed here.'
              : 'Only the account that runs this program — or platform staff — may seat people. A seat cannot be claimed from the side it grants access to, so this list is read-only for you.'}
          </p>
        )}
      </div>
    </div>
  );
}
