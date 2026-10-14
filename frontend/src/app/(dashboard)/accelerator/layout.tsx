'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Building2,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileSearch,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  LogOut,
  Network,
  Plus,
  Search,
  Settings,
  Sliders,
  Sparkles,
  Target,
  User,
  Users2,
  Vote,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { acceleratorApi, type AcceleratorProgram } from '@/lib/acceleratorApi';
import { ProgramProvider, useActiveProgram } from './ProgramContext';
import {
  IntelligenceProvider,
  useIntelligence,
} from './IntelligenceContext';
import { IntelligenceDrawer } from '@/components/accelerator/drawers/IntelligenceDrawer';
import { EvidenceDrawer } from '@/components/accelerator/drawers/EvidenceDrawer';
import { InterventionModal } from '@/components/accelerator/drawers/InterventionModal';
import { TaskCenterPopover } from '@/components/accelerator/shell/TaskCenterPopover';
import { AcceleratorCommandPalette } from '@/components/accelerator/shell/AcceleratorCommandPalette';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { useToast } from '@/components/ui/Toast';

interface NavGroup {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  // When true the item is only active on an exact path match (no prefix
  // matching). Used for root-level items like the Command Center.
  exact?: boolean;
  // When true the item lives in the collapsed "Program Operations" group
  // (de-scoped, non-MVP screens) rather than the primary selection lifecycle.
  secondary?: boolean;
  subItems?: { label: string; href: string; badge?: string }[];
}

const NAV_GROUPS: NavGroup[] = [
  // ── Primary: Startup Selection Intelligence lifecycle ────────────────────
  {
    label: 'Overview',
    href: '/accelerator',
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: 'Applications',
    href: '/accelerator/applications',
    icon: Inbox,
    subItems: [
      { label: 'All Applications', href: '/accelerator/applications' },
      { label: 'Eligibility & Triage', href: '/accelerator/applications?tab=eligibility' },
      { label: 'Reviewer Consensus', href: '/accelerator/applications?tab=reviews' },
    ],
  },
  {
    label: 'Review Queue',
    href: '/accelerator/review-queue',
    icon: ClipboardList,
  },
  {
    label: 'Interviews',
    href: '/accelerator/interviews',
    icon: Calendar,
  },
  {
    label: 'Due Diligence',
    href: '/accelerator/due-diligence',
    icon: FileSearch,
  },
  {
    label: 'Decisions',
    href: '/accelerator/decision-room',
    icon: Vote,
    badge: 'IC',
  },
  {
    label: 'Intelligence',
    href: '/accelerator/intelligence',
    icon: Network,
    subItems: [
      { label: 'Evidence Graph', href: '/accelerator/intelligence?tab=evidence' },
      { label: 'Contradictions', href: '/accelerator/intelligence?tab=contradictions' },
      { label: 'Founder Signals', href: '/accelerator/intelligence?tab=founder' },
      { label: 'Company Signals', href: '/accelerator/intelligence?tab=company' },
    ],
  },
  {
    label: 'Analytics & Reports',
    href: '/accelerator/analytics',
    icon: BarChart3,
    exact: true,
  },
  {
    label: 'Outcomes',
    href: '/accelerator/outcomes',
    icon: Target,
    subItems: [
      { label: 'Screening Recall', href: '/accelerator/outcomes?tab=recall' },
      { label: 'Program Screening Memory', href: '/accelerator/outcomes?tab=memory' },
    ],
  },
  {
    label: 'Program Configuration',
    href: '/accelerator/settings',
    icon: Sliders,
    exact: true,
  },

  // ── Secondary: everything that happens after the selection is made ────────
  // One entry per real destination. The cohort sub-items that used to live here
  // (`?tab=milestones`, `?tab=kpis`, `?tab=interventions`, `?tab=mentors`,
  // `?tab=curriculum`) were dead links: the cohorts page reads no query
  // parameter, so six nav entries rendered the same screen.
  {
    label: 'Cohorts',
    href: '/accelerator/cohorts',
    icon: Users2,
    secondary: true,
  },
];

/** Where the active cohort actually is in time, from the server's own reading of
 *  its start/end dates. ``program_duration_weeks`` is never the denominator — it
 *  defaults to 12 when a program is created, so "Wk 7 / 12" was a product of a
 *  model default rather than a schedule anyone recorded. */
function cohortReadout(program: AcceleratorProgram | null): {
  label: string;
  chip: string;
  scheduled: boolean;
  title: string;
} {
  const label = program?.program_cycle?.trim() || 'Cohort';
  const rt = program?.cohort_runtime;
  if (!rt || rt.phase === 'unscheduled') {
    return {
      label,
      chip: 'No dates set',
      scheduled: false,
      title: 'This program has no cohort start date, so there is no week to report.',
    };
  }
  if (rt.phase === 'upcoming') {
    return {
      label,
      chip: 'Upcoming',
      scheduled: true,
      title: `The cohort starts on ${program?.cohort_start_date ?? 'a date that was never saved'}.`,
    };
  }
  if (rt.phase === 'ended') {
    return {
      label,
      chip: 'Completed',
      scheduled: true,
      title: `The cohort ended on ${program?.cohort_end_date ?? 'a date that was never saved'}.`,
    };
  }
  return {
    label,
    chip: rt.total_weeks != null ? `Wk ${rt.week} / ${rt.total_weeks}` : `Wk ${rt.week}`,
    scheduled: true,
    title:
      rt.total_weeks != null
        ? `Week ${rt.week} of ${rt.total_weeks}, counted from the cohort's own start and end dates.`
        : `Week ${rt.week} since the cohort started. There is no end date, so the total is unknown — not 12.`,
  };
}

function AcceleratorShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const {
    programs,
    activeProgram,
    setActiveProgramId,
    activeOrganization,
    contextError,
    clearContextError,
    activeContext,
    isLoading,
  } = useActiveProgram();
  const {
    setCommandPaletteOpen,
    openIntelligenceDrawer,
  } = useIntelligence();
  const { user, logout } = useAuth();

  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [opsOpen, setOpsOpen] = React.useState(false);
  const [taskPopoverOpen, setTaskPopoverOpen] = React.useState(false);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const userMenuRef = React.useRef<HTMLDivElement | null>(null);
  const workInboxTriggerRef = React.useRef<HTMLButtonElement | null>(null);

  // My Work is a read of the server's inbox report, not a client-side list.
  // Keyed on the program so switching programs refetches instead of reusing
  // another program's numbers.
  const activeProgramId = activeProgram?.id ?? null;
  const {
    data: workInbox,
    isLoading: workInboxLoading,
    isError: workInboxFailed,
  } = useQuery({
    queryKey: ['accelerator', 'work-inbox', activeProgramId],
    queryFn: () => acceleratorApi.getWorkInbox(activeProgramId as number),
    enabled: activeProgramId !== null,
  });
  const openWorkCount = workInbox?.total_open ?? 0;

  // Close user menu on outside click
  React.useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  // Derive display name and initials from auth
  const displayName = user
    ? (user.first_name && user.last_name
        ? `${user.first_name} ${user.last_name}`
        : user.first_name || user.email || 'Accelerator')
    : 'Accelerator';
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? '')
    .join('');
  // The server reads this off the user record. Null is a real answer — the
  // account carries a role the accelerator workspace doesn't recognise — and
  // an em dash is the honest display for it, not "Program Director".
  const roleLabel = activeContext?.role ?? '—';
  const cohort = cohortReadout(activeProgram);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans antialiased selection:bg-indigo-500 selection:text-white">
      
      {/* ── Left Sidebar Navigation (Section 0 & 36) ────────────────────── */}
      <aside
        className={cn(
          'sticky top-0 z-30 flex h-screen flex-col border-r border-white/10 bg-[#0B0F17] transition-all duration-200 shrink-0',
          sidebarCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <Link href="/accelerator" className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 shadow-md shadow-indigo-500/20 shrink-0">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <span className="text-sm font-black tracking-tight text-white block truncate">
                  PITCHMIC
                </span>
                <span className="text-[10px] font-semibold text-indigo-400 block -mt-0.5 tracking-wider uppercase">
                  Selection Intelligence
                </span>
              </div>
            )}
          </Link>

          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="rounded-lg p-1 text-white/40 hover:bg-white/5 hover:text-white transition"
            title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Cohort & Program Indicator in Sidebar */}
        {!sidebarCollapsed && (
          <div className="border-b border-white/5 p-3.5 bg-white/[0.02]" title={cohort.title}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1">
              Active Cohort
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white truncate">{cohort.label}</span>
              <span
                className={`rounded border px-1.5 py-0.2 text-[9px] font-bold whitespace-nowrap ${
                  cohort.scheduled
                    ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                    : 'bg-white/5 border-white/10 text-white/40'
                }`}
              >
                {cohort.chip}
              </span>
            </div>
          </div>
        )}

        {/* Nav Items */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5 scrollbar-thin scrollbar-thumb-white/10">
          {(() => {
            const pathBase = (pathname ?? '').split('?')[0].split('#')[0];
            const isActiveFor = (g: NavGroup) => {
              const base = g.href.split('?')[0].split('#')[0];
              if (g.exact) return pathBase === base;
              if (base === '/accelerator') return false;
              return pathBase === base || pathBase.startsWith(base + '/');
            };
            const renderItem = (group: NavGroup) => {
              const Icon = group.icon;
              const isActive = isActiveFor(group);
              return (
                <div key={`${group.href}#${group.label}`} className="space-y-1">
                  <Link
                    href={group.href}
                    className={cn(
                      'group flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all',
                      isActive
                        ? 'bg-indigo-600/20 text-white border border-indigo-500/30 shadow-xs'
                        : 'text-white/60 hover:bg-white/5 hover:text-white'
                    )}
                    title={sidebarCollapsed ? group.label : undefined}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0 transition-colors',
                          isActive ? 'text-indigo-400' : 'text-white/40 group-hover:text-white/80'
                        )}
                      />
                      {!sidebarCollapsed && <span className="truncate">{group.label}</span>}
                    </div>

                    {!sidebarCollapsed && group.badge && (
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider',
                          isActive ? 'bg-indigo-500 text-white' : 'bg-white/10 text-white/60'
                        )}
                      >
                        {group.badge}
                      </span>
                    )}
                  </Link>

                  {!sidebarCollapsed && group.subItems && isActive && (
                    <div className="ml-7 pl-2 border-l border-white/10 space-y-1 pt-1">
                      {group.subItems.map((sub) => {
                        const isSubActive = pathBase === sub.href.split('?')[0].split('#')[0];
                        return (
                          <Link
                            key={sub.label}
                            href={sub.href}
                            className={cn(
                              'flex items-center justify-between rounded-lg px-2.5 py-1 text-[11px] font-medium transition',
                              isSubActive
                                ? 'text-indigo-300 font-semibold'
                                : 'text-white/50 hover:text-white'
                            )}
                          >
                            <span className="truncate">{sub.label}</span>
                            {sub.badge && (
                              <span className="text-[9px] font-bold text-indigo-400">
                                {sub.badge}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            };

            const primary = NAV_GROUPS.filter((g) => !g.secondary);
            const secondary = NAV_GROUPS.filter((g) => g.secondary);
            const secondaryActive = secondary.some(isActiveFor);

            return (
              <>
                {primary.map(renderItem)}

                {/* Secondary: what happens after a cohort is selected */}
                <div className="pt-3 mt-3 border-t border-white/10">
                  {!sidebarCollapsed && (
                    <button
                      onClick={() => setOpsOpen((v) => !v)}
                      className="mb-1 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/40 hover:text-white/70 transition"
                    >
                      <span>Post-Selection</span>
                      {opsOpen || secondaryActive ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                  {(sidebarCollapsed || opsOpen || secondaryActive) && (
                    <div className="space-y-1.5">{secondary.map(renderItem)}</div>
                  )}
                </div>
              </>
            );
          })()}
        </div>

        {/* Bottom: User Account */}
        <div className="border-t border-white/10 p-3 bg-black/20" ref={userMenuRef}>
          {!sidebarCollapsed ? (
            <div className="space-y-2">
              {/* Account role, as the server reads it. Not a switch: there is no
                  user-to-program role table, so choosing "Reviewer" here would
                  have been a label the browser wrote for itself. */}
              <div className="flex items-center justify-between text-[11px] text-white/40">
                <span>Role:</span>
                <span
                  className="text-indigo-300 font-bold truncate max-w-[130px]"
                  title={
                    activeContext?.role
                      ? `Reported by the server for this account (${activeContext.role_code}).`
                      : 'This account carries a role the workspace does not recognise, so no role is claimed.'
                  }
                >
                  {roleLabel}
                </span>
              </div>

              {/* User identity row */}
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="w-full flex items-center gap-2.5 rounded-xl bg-white/5 hover:bg-white/10 px-2.5 py-2 transition text-left group"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-[11px] font-bold text-white shrink-0">
                    {initials || 'A'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-white truncate">{displayName}</div>
                    <div className="text-[9px] text-white/40 truncate">{user?.email ?? 'Accelerator Manager'}</div>
                  </div>
                  <ChevronDown className={cn('h-3 w-3 text-white/40 transition-transform shrink-0', userMenuOpen && 'rotate-180')} />
                </button>

                {userMenuOpen && (
                  <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-white/10 bg-[#0F1623] shadow-2xl overflow-hidden z-50">
                    <div className="px-3 py-2.5 border-b border-white/10">
                      <div className="text-[10px] font-semibold text-white truncate">{displayName}</div>
                      <div className="text-[9px] text-white/40 truncate mt-0.5">{user?.email}</div>
                    </div>
                    <div className="py-1">
                      <Link
                        href="/accelerator/settings"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-[11px] text-white/70 hover:bg-white/5 hover:text-white transition"
                      >
                        <Settings className="h-3.5 w-3.5 text-white/40" />
                        Organization Settings
                      </Link>
                      <Link
                        href="/profile/edit"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-[11px] text-white/70 hover:bg-white/5 hover:text-white transition"
                      >
                        <User className="h-3.5 w-3.5 text-white/40" />
                        My Profile
                      </Link>
                      <button
                        onClick={() => { setUserMenuOpen(false); logout(); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-rose-400 hover:bg-rose-500/10 transition"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-[11px] font-bold text-white hover:ring-2 hover:ring-indigo-400/40 transition"
                title={`${displayName} — click for account options`}
              >
                {initials || 'A'}
              </button>
              {userMenuOpen && (
                <div className="absolute bottom-16 left-16 z-50 w-48 rounded-xl border border-white/10 bg-[#0F1623] shadow-2xl overflow-hidden">
                  <div className="px-3 py-2.5 border-b border-white/10">
                    <div className="text-[10px] font-semibold text-white truncate">{displayName}</div>
                    <div className="text-[9px] text-white/40 truncate mt-0.5">{user?.email}</div>
                  </div>
                  <div className="py-1">
                    <Link
                      href="/accelerator/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-[11px] text-white/70 hover:bg-white/5 hover:text-white transition"
                    >
                      <Settings className="h-3.5 w-3.5 text-white/40" />
                      Settings
                    </Link>
                    <Link
                      href="/profile/edit"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-[11px] text-white/70 hover:bg-white/5 hover:text-white transition"
                    >
                      <User className="h-3.5 w-3.5 text-white/40" />
                      My Profile
                    </Link>
                    <button
                      onClick={() => { setUserMenuOpen(false); logout(); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-rose-400 hover:bg-rose-500/10 transition"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ── Main Content Area with Sticky Top Header ────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Header Shell */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 md:px-6 backdrop-blur-md overflow-hidden">
          
          {/* Left: Enterprise Workspace & Program Switcher */}
          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
            {/* Workspace switcher pill — collapses gracefully on small viewports */}
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs min-w-0 max-w-[min(100%,520px)]">
              <Building2 className="h-3.5 w-3.5 text-indigo-600 shrink-0" />

              {/* Organization the active program belongs to. It is a label, not a
                  switch: selecting a program already selects its organization, and
                  nothing in the database grants this account a set of tenants. */}
              {isLoading ? (
                <span className="h-3 w-24 animate-pulse rounded bg-slate-200" />
              ) : (
                <span
                  className="font-bold text-slate-900 max-w-[100px] md:max-w-[150px] truncate"
                  title={
                    activeOrganization
                      ? activeOrganization.linked
                        ? `${activeOrganization.name} — an organization record in the database`
                        : `${activeOrganization.name} — the free-text organization name stored on this program, not an organization record yet`
                      : 'No program is confirmed, so no organization is claimed.'
                  }
                >
                  {activeOrganization?.name || '—'}
                </span>
              )}

              {/* Program selector — hidden on xs, shown from sm+ */}
              {programs.length > 0 && (
                <>
                  <ChevronRight className="hidden sm:inline h-3 w-3 text-slate-400 shrink-0" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="hidden sm:flex items-center gap-1.5 font-semibold text-indigo-600 max-w-[120px] md:max-w-[180px] truncate hover:text-indigo-700 transition outline-none cursor-pointer">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span className="truncate">{activeProgram?.name || 'Program'}</span>
                        <ChevronDown className="h-3 w-3 text-indigo-500/60 shrink-0" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56 rounded-xl border border-slate-200 bg-white p-1 text-xs text-slate-800 shadow-xl z-50">
                      {programs.map((p) => (
                        <DropdownMenuItem
                          key={p.id}
                          onClick={() => setActiveProgramId(p.id)}
                          className={cn(
                            "rounded-lg px-3 py-2 font-medium cursor-pointer hover:bg-slate-100 focus:bg-slate-100",
                            p.id === activeProgram?.id && "text-indigo-600 font-semibold bg-indigo-50"
                          )}
                        >
                          {p.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}

              {/* The cohort the active program runs, read from that program's own
                  dates. The old dropdown only ever offered the one string it was
                  already showing, so there was nothing to switch. */}
              {activeProgram && (
                <div className="hidden lg:flex items-center gap-1.5 min-w-0" title={cohort.title}>
                  <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
                  <span className="truncate font-medium text-slate-600 max-w-[120px]">{cohort.label}</span>
                  <span
                    className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
                      cohort.scheduled
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}
                  >
                    {cohort.chip}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Global Create Action Dropdown */}
          <div className="hidden md:block">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 shadow-xs px-3.5 py-1.5 text-xs font-semibold text-white transition">
                  <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                  Create
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-56 rounded-xl border border-slate-200 bg-white p-1 text-xs text-slate-800 shadow-xl z-50"
              >
                <DropdownMenuItem
                  onClick={() => {
                    toast({ title: 'Application Cycle creation coming soon', variant: 'info' });
                  }}
                  className="rounded-lg px-3 py-2 font-medium cursor-pointer hover:bg-slate-100 focus:bg-slate-100 text-slate-700"
                >
                  Application Cycle
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    router.push('/accelerator/cohorts');
                  }}
                  className="rounded-lg px-3 py-2 font-medium cursor-pointer hover:bg-slate-100 focus:bg-slate-100 text-slate-700"
                >
                  Cohort
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    toast({ title: 'Event creation coming soon', variant: 'info' });
                  }}
                  className="rounded-lg px-3 py-2 font-medium cursor-pointer hover:bg-slate-100 focus:bg-slate-100 text-slate-700"
                >
                  Event
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    toast({ title: 'Review Round creation coming soon', variant: 'info' });
                  }}
                  className="rounded-lg px-3 py-2 font-medium cursor-pointer hover:bg-slate-100 focus:bg-slate-100 text-slate-700"
                >
                  Review Round
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    router.push('/accelerator/applications?tab=interviews');
                  }}
                  className="rounded-lg px-3 py-2 font-medium cursor-pointer hover:bg-slate-100 focus:bg-slate-100 text-slate-700"
                >
                  Interview
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Center: Command Palette Trigger */}
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="hidden md:flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-800 transition min-w-[140px] flex-1 max-w-sm justify-between shadow-2xs"
          >
            <span className="flex items-center gap-2 truncate">
              <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="truncate">Search intelligence, startups...</span>
            </span>
            <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-mono text-slate-400 shrink-0">
              ⌘K
            </kbd>
          </button>

          {/* Right: Quick Task Center, Notifications, Help & Profile */}
          <div className="flex items-center gap-3 relative">
            
            {/* Task Center Button */}
            <div className="relative">
              <button
                ref={workInboxTriggerRef}
                onClick={() => setTaskPopoverOpen(!taskPopoverOpen)}
                aria-label="My open work in this program"
                className="relative flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs transition"
              >
                <ClipboardList className="h-3.5 w-3.5 text-indigo-600" />
                <span className="hidden sm:inline font-semibold">My Work</span>
                {workInboxLoading ? (
                  <span
                    className="h-2 w-2 rounded-full bg-slate-300 animate-pulse"
                    title="Counting the rows that carry your name…"
                  />
                ) : workInboxFailed ? (
                  <span
                    className="h-2 w-2 rounded-full bg-amber-500"
                    title="The work inbox could not be loaded. The count is unknown, not zero."
                  />
                ) : openWorkCount > 0 ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                    {openWorkCount}
                  </span>
                ) : null}
              </button>

              <TaskCenterPopover
                isOpen={taskPopoverOpen}
                onClose={() => setTaskPopoverOpen(false)}
                anchorRef={workInboxTriggerRef}
                report={workInbox ?? null}
                isLoading={workInboxLoading}
                isError={workInboxFailed}
                programName={activeProgram?.name ?? null}
              />
            </div>

            {/* Contextual Help */}
            <button
              onClick={() => {
                openIntelligenceDrawer({
                  title: 'Closed-Loop Accelerator Architecture Guide',
                  category: 'Operating Guide',
                  severity: 'INFO',
                  confidence: 0,
                  detectedAt: 'Product documentation',
                  evidence: [
                    'Every page shows the stored rows behind its numbers rather than a summary someone typed in.',
                    'Clicking a metric or risk badge opens the Intelligence Drawer for that signal.',
                    'An intervention brief is text you copy out — selection records no intervention rows.',
                  ],
                  sources: ['Pitchmic product guide'],
                  model: 'Product help',
                });
              }}
              title="Intelligence OS Help & Explanations"
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800 shadow-2xs transition"
            >
              <HelpCircle className="h-4 w-4" />
            </button>

            {/* Profile Pill with Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white pl-2.5 pr-2.5 py-1 text-xs hover:bg-slate-50 shadow-2xs transition cursor-pointer outline-none">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-[11px] font-bold text-white shrink-0">
                    {initials || 'A'}
                  </div>
                  <div className="hidden sm:block text-left">
                    <div className="text-xs font-semibold text-slate-900 leading-none truncate max-w-[120px]">
                      {displayName}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-tight">
                      {roleLabel}
                    </div>
                  </div>
                  <ChevronDown className="h-3 w-3 text-slate-400 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48 rounded-xl border border-slate-200 bg-white p-1 text-xs text-slate-800 shadow-xl z-50"
              >
                <div className="px-3 py-2 border-b border-slate-100">
                  <div className="text-xs font-semibold text-slate-900 truncate">{displayName}</div>
                  <div className="text-[10px] text-slate-500 truncate mt-0.5">{user?.email}</div>
                </div>
                <div className="py-1">
                  <DropdownMenuItem
                    onClick={() => router.push('/accelerator/settings')}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium cursor-pointer hover:bg-slate-100 focus:bg-slate-100 text-slate-700"
                  >
                    <Settings className="h-3.5 w-3.5 text-slate-400" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => router.push('/profile/edit')}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium cursor-pointer hover:bg-slate-100 focus:bg-slate-100 text-slate-700"
                  >
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    My Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => logout()}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium cursor-pointer hover:bg-rose-50 focus:bg-rose-50 text-rose-600"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign Out
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* A refused context switch is shown, not hidden. Before this, the
            header kept displaying the program the server had just rejected. */}
        {contextError && (
          <div className="flex items-start justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 md:px-6 py-2.5">
            <p className="text-xs text-amber-800">
              <span className="font-semibold">That program was not selected.</span>{' '}
              {contextError} This view is showing{' '}
              <span className="font-semibold">{activeProgram?.name || 'no confirmed program'}</span>.
            </p>
            <button
              onClick={clearContextError}
              className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Page Content Viewport */}
        <main className="flex-1 p-6 sm:p-8 max-w-[1600px] w-full mx-auto bg-slate-50">
          {children}
        </main>
      </div>

      {/* ── Universal Drawers & Modals (Mounted globally) ──────────────── */}
      <IntelligenceDrawer />
      <EvidenceDrawer />
      <InterventionModal />
      <AcceleratorCommandPalette />
    </div>
  );
}

export default function AcceleratorLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProgramProvider>
      <IntelligenceProvider>
        <AcceleratorShellInner>{children}</AcceleratorShellInner>
      </IntelligenceProvider>
    </ProgramProvider>
  );
}
