'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, UserPlus, Download, Check, X, Shield, Search, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import { acceleratorApi } from '@/lib/acceleratorApi';

/**
 * Program roster row returned by `/accelerator/memberships/`
 * (ProgramMembershipSerializer). `role`, `email` and `status` are read
 * opportunistically: the membership model only guarantees the cohort/onboarding
 * fields, so anything missing renders as an em dash instead of a fake value.
 */
interface MembershipRow {
  id: number;
  program?: number;
  application?: number | null;
  role?: string;
  email?: string;
  status?: string;
  member_name?: string;
  company_name?: string;
  onboarding_status?: string;
  is_active?: boolean;
  enrolled_at?: string;
  joined_at?: string;
  agreement_signed?: boolean;
  baseline_completed?: boolean;
}

interface ProgramRoleRow {
  id: number;
  name: string;
  slug: string;
  permissions?: string[];
}

interface MemberItem {
  id: number;
  name: string;
  email: string;
  role: string;
  orgRole: string;
  programs: string[];
  status: string;
  permissions: {
    allowed: string[];
    denied: string[];
  };
}

const ONBOARDING_LABELS: Record<string, string> = {
  pending: 'Onboarding pending',
  in_progress: 'Onboarding in progress',
  complete: 'Onboarding complete',
};

function humanize(value: string): string {
  const spaced = value.replace(/[._-]+/g, ' ').trim();
  if (!spaced) return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function MembersSettings() {
  const { activeProgram, programs } = useActiveProgram();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const pid = activeProgram?.id ?? null;
  const rosterKey = ['accelerator-memberships', pid] as const;
  const rolesKey = ['accelerator-program-roles', pid] as const;

  const { data: roster = [], isLoading } = useQuery({
    queryKey: rosterKey,
    queryFn: () => acceleratorApi.osList<MembershipRow>('memberships', pid as number),
    enabled: pid != null,
  });

  // Used to resolve the permission set attached to a member's assigned role.
  const { data: roleDefs = [] } = useQuery({
    queryKey: rolesKey,
    queryFn: () => acceleratorApi.osList<ProgramRoleRow>('program-roles', pid as number),
    enabled: pid != null,
  });

  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedMember, setSelectedMember] = React.useState<MemberItem | null>(null);
  const [isInviteOpen, setIsInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviteRole, setInviteRole] = React.useState('Reviewer');

  const members = React.useMemo<MemberItem[]>(() => {
    return roster.map((row) => {
      const roleCode = row.role ?? '';
      const roleDef = roleCode
        ? roleDefs.find(
            (d) =>
              d.slug.toLowerCase() === roleCode.toLowerCase() ||
              d.name.toLowerCase() === roleCode.toLowerCase()
          )
        : undefined;

      const allowed: string[] = (roleDef?.permissions ?? []).map((p) => humanize(p));
      const denied: string[] = [];
      if (row.agreement_signed) allowed.push('Program agreement signed');
      else denied.push('Program agreement signed');
      if (row.baseline_completed) allowed.push('Baseline metrics submitted');
      else denied.push('Baseline metrics submitted');
      if (row.onboarding_status === 'complete') allowed.push('Cohort onboarding complete');

      let status = 'Active';
      if (row.is_active === false) status = 'Suspended';
      else if (row.status && /invit/i.test(row.status)) status = 'Invited';
      else if (row.onboarding_status === 'pending') status = 'Invited';

      const programName =
        programs.find((p) => p.id === row.program)?.name ??
        (row.program === pid ? activeProgram?.name : undefined) ??
        (row.program != null ? `Program #${row.program}` : '—');

      return {
        id: row.id,
        name: row.company_name || row.member_name || `Membership #${row.id}`,
        email: row.email || '—',
        role: roleCode ? humanize(roleCode) : '—',
        orgRole: ONBOARDING_LABELS[row.onboarding_status ?? ''] ?? 'Cohort membership',
        programs: [programName],
        status,
        permissions: { allowed, denied },
      };
    });
  }, [roster, roleDefs, programs, pid, activeProgram]);

  const invalidateRoster = () => {
    queryClient.invalidateQueries({ queryKey: ['accelerator-memberships'] });
    queryClient.invalidateQueries({ queryKey: ['accelerator-programs'] });
  };

  const inviteMember = useMutation({
    mutationFn: (data: Record<string, any>) =>
      acceleratorApi.osCreate<MembershipRow>('memberships', data),
    onSuccess: () => {
      invalidateRoster();
      toast({
        title: 'Invitation Dispatched',
        description: 'Membership record created for this program roster.',
        variant: 'success',
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Invitation failed',
        description:
          err?.response?.data?.application?.[0] ||
          err?.response?.data?.program?.[0] ||
          err?.response?.data?.detail ||
          err?.response?.data?.error ||
          'Could not add the member to this program.',
        variant: 'error',
      });
    },
  });

  const updateMember = useMutation({
    mutationFn: (vars: { id: number; data: Record<string, any> }) =>
      acceleratorApi.osUpdate<MembershipRow>('memberships', vars.id, vars.data),
    onSuccess: () => {
      invalidateRoster();
      toast({ title: 'Membership updated', variant: 'success' });
    },
    onError: (err: any) => {
      toast({
        title: 'Update failed',
        description:
          err?.response?.data?.detail || err?.response?.data?.error || 'Could not update this membership.',
        variant: 'error',
      });
    },
  });

  const removeMember = useMutation({
    mutationFn: (id: number) => acceleratorApi.osDelete('memberships', id),
    onSuccess: () => {
      setSelectedMember(null);
      invalidateRoster();
      toast({ title: 'Member removed', description: 'Membership deleted from the roster.', variant: 'success' });
    },
    onError: () => toast({ title: 'Delete failed', variant: 'error' }),
  });

  const handleSendInvite = () => {
    const email = inviteEmail.trim();
    if (!email || pid == null) return;
    inviteMember.mutate({
      program: pid,
      email,
      role: inviteRole.toLowerCase().replace(/\s+/g, '_'),
      status: 'invited',
      is_active: true,
    });
    setInviteEmail('');
    setIsInviteOpen(false);
  };

  const handleExportRoster = () => {
    const header = ['id', 'member', 'email', 'role', 'status', 'onboarding', 'joined'];
    const rows = roster.map((r) =>
      [
        r.id,
        r.company_name || r.member_name || '',
        r.email || '',
        r.role || '',
        r.is_active === false ? 'suspended' : r.status || 'active',
        r.onboarding_status || '',
        r.joined_at || r.enrolled_at || '',
      ]
        .map(csvCell)
        .join(',')
    );
    const csv = [header.map(csvCell).join(','), ...rows].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `members-program-${pid}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({
      title: 'Exporting Members',
      description: `Generated member roster CSV (${rows.length} rows).`,
      variant: 'info',
    });
  };

  const selectedRow = selectedMember ? roster.find((r) => r.id === selectedMember.id) : undefined;

  const filteredMembers = members.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (pid == null) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-8 text-center">
        <p className="text-sm text-white/60">Select a program to view its member roster.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              People · Team Management
            </span>
          </div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-400" />
            Organization Members &amp; Access Control
          </h2>
          <p className="text-xs text-white/50 mt-1">
            Manage accelerator directors, reviewers, selection committee members, and mentors across all scoped programs.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportRoster}
            disabled={roster.length === 0}
            className="border-white/15 bg-white/5 text-white text-xs hover:bg-white/10 flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5 text-white/50" />
            <span>Export Roster</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setIsInviteOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3.5 py-2 flex items-center gap-1.5"
          >
            <UserPlus className="h-4 w-4" />
            <span>Invite Member</span>
          </Button>
        </div>
      </div>

      {/* Invite Modal */}
      {isInviteOpen && (
        <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-5 space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white">Invite New Organization Member</h4>
            <button onClick={() => setIsInviteOpen(false)} className="text-xs text-white/40 hover:text-white">
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-white/70">Work Email Address</label>
              <input
                type="email"
                placeholder="colleague@accelerator.org"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-white/70">Assigned Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:outline-none"
              >
                <option value="Reviewer">Reviewer (Scores &amp; Rationale)</option>
                <option value="Program Manager">Program Manager (Workflow &amp; Cohort)</option>
                <option value="Selection Committee">Selection Committee (IC Voting)</option>
                <option value="Mentor">Mentor (Advisor)</option>
                <option value="Director">Program Director (Full Program Admin)</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="ghost" onClick={() => setIsInviteOpen(false)} className="text-xs text-white/60">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSendInvite}
              disabled={inviteMember.isPending}
              className="bg-indigo-600 text-white text-xs font-bold"
            >
              {inviteMember.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              Send Invitation
            </Button>
          </div>
        </div>
      )}

      {/* Main Members Grid & Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Members Table */}
        <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-[#0F1623] overflow-hidden shadow-xl">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-white/40" />
              <input
                type="text"
                placeholder="Search member name, email or role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/30 pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none"
              />
            </div>
            <span className="text-xs text-white/40 font-mono">
              {isLoading ? 'Loading…' : `${filteredMembers.length} Members`}
            </span>
          </div>

          <div className="divide-y divide-white/5">
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-16 text-xs text-white/50">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading roster…
              </div>
            )}
            {!isLoading && filteredMembers.length === 0 && (
              <div className="py-16 text-center">
                <Users className="h-10 w-10 text-white/20 mx-auto mb-3" />
                <p className="text-sm font-semibold text-white/70">No members yet</p>
                <p className="text-xs text-white/40 mt-1 max-w-xs mx-auto">
                  Invite colleagues by clicking &quot;Invite Member&quot; above. Team members will appear here once they accept.
                </p>
              </div>
            )}
            {filteredMembers.map((m) => {
              const isSelected = selectedMember?.id === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedMember(m)}
                  className={`p-4 flex items-center justify-between cursor-pointer transition ${
                    isSelected ? 'bg-indigo-500/10 border-l-2 border-indigo-500' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-indigo-600/20 text-indigo-300 font-bold text-xs flex items-center justify-center border border-indigo-500/30">
                      {m.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{m.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/60 border border-white/10">
                          {m.role}
                        </span>
                      </div>
                      <p className="text-[11px] text-white/40">{m.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-white/70">{m.programs.join(', ')}</p>
                      <span className="text-[10px] text-emerald-400 font-semibold">{m.status}</span>
                    </div>
                    <ChevronRight className={`h-4 w-4 transition ${isSelected ? 'text-indigo-400 rotate-90' : 'text-white/30'}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Member Permissions Deep-Dive Inspector */}
        <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-5 space-y-5 shadow-xl">
          {selectedMember ? (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="border-b border-white/10 pb-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                    {selectedMember.orgRole}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                    {selectedMember.status}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mt-1">{selectedMember.name}</h3>
                <p className="text-xs text-white/40">{selectedMember.email}</p>
                <div className="mt-2 text-xs text-white/60 font-mono">
                  Program Access: <span className="text-indigo-300">{selectedMember.programs.join(', ')}</span>
                </div>
              </div>

              {/* Allowed Permissions */}
              <div className="space-y-2">
                <h5 className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" /> Allowed Actions
                </h5>
                <div className="space-y-1.5">
                  {selectedMember.permissions.allowed.map((perm, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-white/80 bg-white/[0.02] p-2 rounded-lg border border-white/5">
                      <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{perm}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Denied Permissions */}
              {selectedMember.permissions.denied.length > 0 && (
                <div className="space-y-2 border-t border-white/10 pt-3">
                  <h5 className="text-[11px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                    <X className="h-3.5 w-3.5" /> Restricted Scope
                  </h5>
                  <div className="space-y-1.5">
                    {selectedMember.permissions.denied.map((perm, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-white/40 bg-white/[0.01] p-2 rounded-lg border border-white/5">
                        <X className="h-3.5 w-3.5 text-rose-400/60 shrink-0 mt-0.5" />
                        <span>{perm}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Membership record actions */}
              <div className="space-y-2 border-t border-white/10 pt-3">
                <h5 className="text-[11px] font-bold text-white/40 uppercase tracking-wider">Roster Record</h5>
                <p className="text-[11px] text-white/40">
                  Enrolled: {formatDate(selectedRow?.joined_at || selectedRow?.enrolled_at)}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={updateMember.isPending}
                    onClick={() =>
                      updateMember.mutate({
                        id: selectedMember.id,
                        data: { is_active: !(selectedRow?.is_active ?? true) },
                      })
                    }
                    className="border-white/15 bg-white/5 text-white text-xs hover:bg-white/10"
                  >
                    {(selectedRow?.is_active ?? true) ? 'Suspend' : 'Reactivate'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={removeMember.isPending}
                    onClick={() => removeMember.mutate(selectedMember.id)}
                    className="text-rose-300 text-xs hover:text-rose-200"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 space-y-2 text-white/40">
              <Shield className="h-8 w-8 mx-auto opacity-40 text-indigo-400" />
              <p className="text-xs font-semibold">Select a member to inspect resource permissions</p>
              <p className="text-[11px] max-w-xs mx-auto">
                Role-based access control defines what candidates, decisions, and intelligence modules this user can execute.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
