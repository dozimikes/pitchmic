'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Layers,
  Brain,
  ShieldCheck,
  Rocket,
  Compass,
  BarChart3,
  Sparkles,
  RefreshCw,
  X,
  HelpCircle,
  ChevronDown,
  Check,
  Users,
  FileText,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import {
  acceleratorApi,
  AcceleratorProgram,
  ApplicationItem,
} from '@/lib/acceleratorApi';

import { AdmissionsOverview } from '@/components/accelerator/AdmissionsOverview';
import { PipelineKanban } from '@/components/accelerator/PipelineKanban';
import { ReviewerWorkspace } from '@/components/accelerator/ReviewerWorkspace';
import { CommitteeWorkspace } from '@/components/accelerator/CommitteeWorkspace';
import { CohortTracker } from '@/components/accelerator/CohortTracker';
import { EligibilitySimulator } from '@/components/accelerator/EligibilitySimulator';
import { DynamicApplicationWizard } from '@/components/accelerator/DynamicApplicationWizard';

// ── Tab type & hash map ───────────────────────────────────────────────────────
type TabType = 'overview' | 'pipeline' | 'reviewer' | 'committee' | 'cohort' | 'marketplace' | 'sync';

// Hash fragment → tab ID (these become real URLs: /accelerator#triage, #rubric, etc.)
// IA-correct mappings: rubric lives in ReviewerWorkspace, triage = PipelineKanban screening,
// voting = Committee IC decisions, sync = CRM & Ingestion Sync header controls.
const HASH_TO_TAB: Record<string, TabType> = {
  overview: 'overview',
  pipeline: 'pipeline',
  triage: 'pipeline',         // #triage → Pipeline Kanban (initial screening stage)
  reviewer: 'reviewer',
  rubric: 'reviewer',         // #rubric → Reviewer Workspace (8→7-Pillar scorecard inputs)
  committee: 'committee',
  ic: 'committee',
  voting: 'committee',        // #voting → Selection Committee IC tab
  cohort: 'cohort',
  marketplace: 'marketplace',
  apply: 'marketplace',
  sync: 'sync',               // #sync → CRM & Ingestion Sync panel
};

const TAB_TO_HASH: Record<TabType, string> = {
  overview: 'overview',
  pipeline: 'pipeline',
  reviewer: 'rubric',         // Reviewer tab defaults to the rubric anchor URL
  committee: 'voting',        // Committee tab defaults to the voting anchor URL
  cohort: 'cohort',
  marketplace: 'marketplace',
  sync: 'sync',
};

function getTabFromHash(hash: string): TabType | null {
  const key = hash.replace('#', '').toLowerCase();
  return HASH_TO_TAB[key] ?? null;
}

// ── Page component ────────────────────────────────────────────────────────────
export default function AcceleratorOperatingSystemPage() {
  const { isStartup, isAccelerator, isAdmin, isSuperUser, initialized } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const pathname = usePathname();

  const canManage = isAccelerator || isAdmin || isSuperUser;

  // ── Tab state — initialised from URL hash ─────────────────────────────────
  // Use a stable fallback ('overview') for SSR / before auth resolves.
  // Auth-dependent default ('marketplace' for startups) is applied once
  // auth initialises via the effect below, avoiding a hydration flicker.
  const [activeTab, setActiveTab] = React.useState<TabType>(() => {
    if (typeof window !== 'undefined') {
      const fromHash = getTabFromHash(window.location.hash);
      if (fromHash) return fromHash;
    }
    return 'overview';
  });

  // Push hash to URL whenever active tab changes. Also scrolls to top of tab
  // content (Minor #12) so that hash-fragment deep-links don't leave users
  // scrolled halfway down the page from a previous section.
  const navigateTab = React.useCallback(
    (tab: TabType) => {
      setActiveTab(tab);
      const hash = TAB_TO_HASH[tab];
      // Use replaceState to avoid polluting browser history on every tab click
      window.history.replaceState(null, '', `${pathname}#${hash}`);
      // Scroll to top of content area for consistent UX on tab switch
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      // If the user landed on #sync, additionally scroll the Sync Intake
      // header controls into view so the sidebar link takes users somewhere
      // concrete (Critical #1).
      if (tab === 'sync') {
        requestAnimationFrame(() => {
          const el = document.getElementById('sync-header-controls');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
    },
    [pathname]
  );

  // On mount: sync to hash if the page was loaded with one (e.g. direct link).
  // Also applies the auth-dependent default once auth is resolved (no hash present).
  React.useEffect(() => {
    if (!initialized) return;

    const fromHash = getTabFromHash(window.location.hash);
    if (fromHash) {
      setActiveTab(fromHash);
      // Match the scroll behaviour: for sync tab, also scroll header controls.
      if (fromHash === 'sync') {
        requestAnimationFrame(() => {
          const el = document.getElementById('sync-header-controls');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      } else {
        window.scrollTo({ top: 0 });
      }
    } else if (isStartup) {
      // Only switch to marketplace when auth is confirmed and no hash overrides
      setActiveTab('marketplace');
    }

    // Listen for browser back/forward hash changes
    const onHashChange = () => {
      const t = getTabFromHash(window.location.hash);
      if (t) setActiveTab(t);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized]);

  // ── Other state ───────────────────────────────────────────────────────────
  const [selectedProgramId, setSelectedProgramId] = React.useState<number | null>(null);
  const [selectedAppId, setSelectedAppId] = React.useState<number | null>(null);
  const [showEvidenceModal, setShowEvidenceModal] = React.useState(false);
  const [showApplyWizard, setShowApplyWizard] = React.useState(false);
  // Major #7 — custom program selector dropdown (replaces native <select>)
  const [programSelectorOpen, setProgramSelectorOpen] = React.useState(false);
  const programSelectorRef = React.useRef<HTMLDivElement | null>(null);
  // Close the custom program selector on outside clicks
  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (
        programSelectorOpen &&
        programSelectorRef.current &&
        !programSelectorRef.current.contains(e.target as Node)
      ) {
        setProgramSelectorOpen(false);
      }
    };
    if (programSelectorOpen) {
      document.addEventListener('mousedown', onDocClick);
    }
    return () => {
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [programSelectorOpen]);
  const [evidenceRequestText, setEvidenceRequestText] = React.useState('');
  // Major #10 — structured evidence checklist items instead of one free-form
  // narrative blob. Each item toggled on is sent as a separate row to the API,
  // which lets PitchMic auto-verify individual artifacts on upload.
  const EVIDENCE_CHECKLIST = [
    { id: 'incorporation', label: 'Certificate of Incorporation / CAC registration' },
    { id: 'bank_statements', label: 'Latest 3 months of bank statements' },
    { id: 'loi_contracts', label: 'Signed LOIs / customer contracts (3+)' },
    { id: 'financials', label: 'Audited / management P&L and cash position' },
    { id: 'cofounder_agreements', label: 'Founder / co-founder equity agreements' },
    { id: 'pitch_deck', label: 'Latest investor pitch deck (PDF)' },
    { id: 'cap_table', label: 'Capitalization table (post-money)' },
    { id: 'retention_analytics', label: '30/60/90-day cohort retention analytics' },
    { id: 'custom', label: 'Custom / additional evidence request (enter below)' },
  ] as const;
  type EvidenceItemId = typeof EVIDENCE_CHECKLIST[number]['id'];
  const [evidenceSelectedItems, setEvidenceSelectedItems] = React.useState<Record<EvidenceItemId, boolean>>({
    incorporation: false,
    bank_statements: false,
    loi_contracts: false,
    financials: false,
    cofounder_agreements: false,
    pitch_deck: false,
    cap_table: false,
    retention_analytics: false,
    custom: false,
  });
  const resetEvidenceForm = () => {
    setEvidenceRequestText('');
    setEvidenceSelectedItems({
      incorporation: false,
      bank_statements: false,
      loi_contracts: false,
      financials: false,
      cofounder_agreements: false,
      pitch_deck: false,
      cap_table: false,
      retention_analytics: false,
      custom: false,
    });
  };
  // Track whether the reviewer scorecard has unsaved changes so that navigating
  // away from an app via PipelineKanban (which bypasses ReviewerWorkspace's internal
  // guard) can also be blocked at the page level.
  const [reviewerScoresDirty, setReviewerScoresDirty] = React.useState(false);
  const [eligibilityForm, setEligibilityForm] = React.useState({
    country: 'NG',
    sector: 'fintech, logistics',
    stage: 'pre_seed',
    incorporated: true,
    full_time: true,
    total_funding_raised_usd: 150000,
    revenue_usd: 0,
  });

  // ── Data queries ──────────────────────────────────────────────────────────
  const { data: rawPrograms = [] } = useQuery({
    queryKey: ['accelerator-programs'],
    queryFn: acceleratorApi.getPrograms,
  });
  const programs: AcceleratorProgram[] = Array.isArray(rawPrograms)
    ? rawPrograms
    : (rawPrograms as any)?.results ?? [];

  React.useEffect(() => {
    if (programs.length > 0 && !selectedProgramId) {
      setSelectedProgramId(programs[0].id);
    }
  }, [programs, selectedProgramId]);

  const activeProgram = programs.find((p) => p.id === selectedProgramId) ?? programs[0];

  const { data: pipelineData, refetch: refetchPipeline } = useQuery({
    queryKey: ['accelerator-pipeline', activeProgram?.id],
    queryFn: () => (activeProgram?.id ? acceleratorApi.getPipeline(activeProgram.id) : null),
    enabled: !!activeProgram?.id,
  });

  // Major #9 — scope queryKey by activeProgram?.id so switching programs via
  // the header selector produces a per-program cache entry, matching the
  // CohortTracker pattern. Also derives a filtered `programApplications`
  // list client-side to prevent cross-program data bleed.
  const { data: rawApplications = [], refetch: refetchApplications } = useQuery({
    queryKey: ['accelerator-applications', activeProgram?.id],
    queryFn: acceleratorApi.getApplications,
  });
  const applications: ApplicationItem[] = Array.isArray(rawApplications)
    ? rawApplications
    : (rawApplications as any)?.results ?? [];

  // Filtered view — only applications that belong to the currently selected
  // program. All consumer components (kanban, reviewer, admissions, etc.)
  // should use `programApplications` so that switching the program selector
  // narrows the dataset accordingly.
  const programApplications = React.useMemo(() => {
    if (!activeProgram?.id) return applications;
    return applications.filter((a) => {
      const pid = (a as any).program_id;
      return pid === undefined || pid === null || pid === activeProgram.id;
    });
  }, [applications, activeProgram?.id]);

  // Minor #13 — active pipeline count for the tab badge: only applications
  // that are still in the forward disposition stages, not the final/rejected
  // disposition columns. Users reading "Pipeline: 24" expect 24 actively
  // being triaged, not 24 including every rejected/waitlisted/accepted record.
  const activePipelineCount = React.useMemo(() => {
    const DISPOSITION_STATUSES = new Set([
      'REJECTED',
      'WITHDRAWN',
      'DEFERRED_WAITLIST',
      'ACCEPTED',
    ]);
    return programApplications.filter((a) => !DISPOSITION_STATUSES.has(a.status)).length;
  }, [programApplications]);

  // Auto-pick the first app when data arrives and nothing is selected
  React.useEffect(() => {
    if (programApplications.length > 0 && !selectedAppId) {
      setSelectedAppId(programApplications[0].id);
    }
  }, [programApplications, selectedAppId]);

  // Minor #17 — when the active program changes, reset the selected app to
  // the first application of the new program so reviewers don't see stale
  // App A's detail card while the sidebar/selector says Program B.
  React.useEffect(() => {
    if (!selectedProgramId) return;
    if (programApplications.length > 0 && programApplications[0].id !== selectedAppId) {
      setSelectedAppId(programApplications[0].id);
    } else if (programApplications.length === 0 && selectedAppId != null) {
      setSelectedAppId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProgramId, programApplications]);

  const { data: applicationDetail, refetch: refetchAppDetail } = useQuery({
    queryKey: ['accelerator-app-detail', selectedAppId],
    queryFn: () => (selectedAppId ? acceleratorApi.getApplicationDetail(selectedAppId) : null),
    enabled: !!selectedAppId,
  });

  const { data: cohortData } = useQuery({
    queryKey: ['accelerator-cohort', activeProgram?.id],
    queryFn: () => (activeProgram?.id ? acceleratorApi.getCohort(activeProgram.id) : null),
    enabled: !!activeProgram?.id && activeTab === 'cohort',
  });

  const { data: eligibilityResult, refetch: checkEligibility } = useQuery({
    queryKey: ['eligibility-check', activeProgram?.id, eligibilityForm],
    queryFn: () =>
      activeProgram?.id
        ? acceleratorApi.checkEligibility(activeProgram.id, eligibilityForm)
        : null,
    enabled: !!activeProgram?.id && activeTab === 'marketplace',
  });

  // ── Mutations — all errors surfaced via toast, no alert() ─────────────────
  const transitionMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      acceleratorApi.transitionStatus(id, status),
    onSuccess: () => {
      refetchPipeline();
      refetchApplications();
      refetchAppDetail();
      toast({ title: 'Status updated', variant: 'success' });
    },
    onError: (err: any) => {
      toast({
        title: 'Transition failed',
        description:
          err?.response?.data?.detail ??
          err?.response?.data?.error ??
          'Only accelerator managers and committee members can change application status.',
        variant: 'error',
      });
    },
  });

  const reviewerScoreMutation = useMutation({
    mutationFn: (data: any) => acceleratorApi.submitReview(data),
    onSuccess: () => {
      refetchAppDetail();
      toast({ title: 'Reviewer scorecard submitted', variant: 'success' });
    },
    onError: (err: any) => {
      toast({
        title: 'Review submission failed',
        description:
          err?.response?.data?.detail ?? 'Review scoring is restricted to evaluators.',
        variant: 'error',
      });
    },
  });

  const committeeVoteMutation = useMutation({
    mutationFn: (data: any) => acceleratorApi.castCommitteeVote(data),
    onSuccess: () => {
      refetchAppDetail();
      toast({ title: 'Committee vote recorded', variant: 'success' });
    },
    onError: (err: any) => {
      toast({
        title: 'Vote failed',
        description:
          err?.response?.data?.detail ?? 'Committee voting is restricted to IC partners.',
        variant: 'error',
      });
    },
  });

  const finalizeDecisionMutation = useMutation({
    mutationFn: (data: any) => acceleratorApi.finalizeDecision(data),
    onSuccess: () => {
      refetchPipeline();
      refetchApplications();
      refetchAppDetail();
      toast({ title: 'Investment committee decision executed', variant: 'success', duration: 6000 });
    },
    onError: (err: any) => {
      toast({
        title: 'Decision failed',
        description:
          err?.response?.data?.detail ?? 'Decision execution is restricted to IC partners.',
        variant: 'error',
      });
    },
  });

  const requestEvidenceMutation = useMutation({
    mutationFn: (data: any) =>
      acceleratorApi.requestEvidence(data.applicationId, data.items, data.message),
    onSuccess: () => {
      setShowEvidenceModal(false);
      resetEvidenceForm();
      refetchAppDetail();
      refetchPipeline();
      toast({ title: 'Evidence request loop initiated', variant: 'success' });
    },
    onError: (err: any) => {
      toast({
        title: 'Evidence request failed',
        description:
          err?.response?.data?.detail ?? 'Evidence requests are restricted to evaluators.',
        variant: 'error',
      });
    },
  });

  const seedDefaultsMutation = useMutation({
    mutationFn: acceleratorApi.seedDefaults,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accelerator-programs'] });
      queryClient.invalidateQueries({ queryKey: ['accelerator-applications'] });
      // Also invalidate any program-specific application caches from Major #9
      programs.forEach((p) =>
        queryClient.invalidateQueries({ queryKey: ['accelerator-applications', p.id] })
      );
      toast({
        title: 'Programs seeded',
        description: 'Configurable accelerator programs and rubric templates are ready.',
        variant: 'success',
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Seed failed',
        description: err?.response?.data?.detail ?? 'Could not seed default programs.',
        variant: 'error',
      });
    },
  });

  // ── Tab config ────────────────────────────────────────────────────────────
  // Critical #4 — filter tabs by role. A startup founder landing on
  // /accelerator should not see Reviewer/Committee/Overview tabs since those
  // are accelerator-staff-only surfaces. They get the marketplace (to browse
  // and apply) and cohort tracker (to see their accepted milestones).
  const allTabs: Array<{
    id: TabType;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'overview', label: 'Admissions Overview', icon: BarChart3 },
    { id: 'pipeline', label: 'Pipeline Kanban', icon: Layers, badge: activePipelineCount },
    { id: 'reviewer', label: 'Reviewer Workspace & Forensics', icon: Brain },
    { id: 'committee', label: 'Selection Committee (IC)', icon: ShieldCheck },
    { id: 'cohort', label: 'Active Cohort & Milestones', icon: Rocket },
    { id: 'marketplace', label: 'Founder Discovery & Eligibility', icon: Compass },
    { id: 'sync', label: 'CRM & Ingestion Sync', icon: RefreshCw },
  ];
  const tabs = React.useMemo(() => {
    if (isStartup) {
      return allTabs.filter((t) => t.id === 'marketplace' || t.id === 'cohort');
    }
    return allTabs;
  }, [isStartup, activePipelineCount]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 lg:p-8 space-y-8">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-neutral-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="px-2 py-0.5 rounded text-xs font-semibold tracking-wide uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Venture Admissions &amp; Investment OS
            </span>
            {/* Minor #18 — workflow_style drives actual UI chrome: the pipeline
                header chip now reflects the real active program workflow, and
                PipelineKanban accepts a style prop to adjust column density. */}
            <span
              className={cn(
                'px-2 py-0.5 rounded text-xs font-mono border',
                activeProgram?.workflow_style === 'yc_style'
                  ? 'bg-orange-500/10 text-orange-300 border-orange-500/30'
                  : 'bg-neutral-900 text-neutral-400 border-neutral-800'
              )}
            >
              {activeProgram?.workflow_style === 'yc_style'
                ? 'YC Rapid (Submit → IC in 14 days)'
                : 'Techstars Multi-Stage (6 gates)'}
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>{activeProgram?.organization_name ?? 'Pan-African Network'}</span>
            <span className="text-neutral-600 font-light">/</span>
            <span className="text-neutral-300">
              {activeProgram?.name ?? 'Admissions Pipeline'}
            </span>
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            End-to-end investment admissions: Eligibility Engine → Structured Claims →
            Forensics → Reviewer Workspace → Selection Committee → Continuous Cohort Evolution.
          </p>
        </div>

        {/* Critical #1: this action band is the scroll target for /accelerator#sync */}
        <div id="sync-header-controls" className="flex flex-wrap items-center gap-2">
          {/* Major #7 — custom program selector (styled, searchable-feeling, with
              workflow badges) instead of the native <select> element. */}
          <div ref={programSelectorRef} className="relative">
            <button
              type="button"
              onClick={() => setProgramSelectorOpen((v) => !v)}
              className="flex items-center gap-2 bg-neutral-900 text-neutral-200 text-xs rounded-lg px-3 py-2 border border-neutral-800 hover:border-neutral-700 focus:outline-none focus:border-emerald-500 cursor-pointer min-w-[220px] text-left transition-colors"
            >
              <span className="flex-1 truncate">
                {activeProgram
                  ? `${activeProgram.name} (${activeProgram.program_cycle ?? '—'})`
                  : 'Select program…'}
              </span>
              {activeProgram && (
                <span
                  className={cn(
                    'shrink-0 px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold',
                    activeProgram.workflow_style === 'yc_style'
                      ? 'bg-orange-500/20 text-orange-300'
                      : 'bg-blue-500/20 text-blue-300'
                  )}
                >
                  {activeProgram.workflow_style === 'yc_style' ? 'YC' : 'TS'}
                </span>
              )}
              <ChevronDown
                className={cn(
                  'w-3.5 h-3.5 text-neutral-500 transition-transform shrink-0',
                  programSelectorOpen && 'rotate-180'
                )}
              />
            </button>
            {programSelectorOpen && (
              <div className="absolute right-0 mt-2 w-[320px] max-h-72 overflow-y-auto z-40 rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl py-1">
                {programs.length === 0 && (
                  <div className="px-3 py-4 text-xs text-neutral-500 text-center">
                    No programs yet — click Seed Programs to create defaults.
                  </div>
                )}
                {programs.map((p) => {
                  const isSelected = p.id === selectedProgramId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedProgramId(p.id);
                        setProgramSelectorOpen(false);
                      }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-xs flex items-start gap-2.5 transition-colors cursor-pointer',
                        isSelected
                          ? 'bg-emerald-500/10 text-white'
                          : 'text-neutral-300 hover:bg-neutral-800/80'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 w-3.5 h-3.5 shrink-0 flex items-center justify-center rounded border',
                          isSelected
                            ? 'border-emerald-500 bg-emerald-500 text-neutral-950'
                            : 'border-neutral-600 text-transparent'
                        )}
                      >
                        <Check className="w-3 h-3" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="font-medium block truncate">
                          {p.name}
                          <span className="text-neutral-500 font-normal">
                            {' '}
                            · {p.program_cycle ?? '—'}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[10px] text-neutral-500 truncate">
                          {p.workflow_style === 'yc_style'
                            ? `YC Rapid · Target cohort ${p.target_cohort_size ?? '—'}`
                            : `Techstars Multi-Stage · Target cohort ${p.target_cohort_size ?? '—'}`}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {canManage && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => seedDefaultsMutation.mutate()}
              disabled={seedDefaultsMutation.isPending}
              className="text-xs bg-neutral-900 border-neutral-800 hover:bg-neutral-800 text-neutral-300"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
              {seedDefaultsMutation.isPending ? 'Seeding…' : 'Seed Programs'}
            </Button>
          )}

          <Button
            size="sm"
            onClick={() => {
              refetchPipeline();
              refetchApplications();
              refetchAppDetail();
            }}
            className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Sync Intake
          </Button>
        </div>
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1 border-b border-neutral-800">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => navigateTab(tab.id)}
              aria-selected={isActive}
              role="tab"
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors relative cursor-pointer',
                isActive
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
              )}
            >
              <Icon
                className={cn(
                  'w-4 h-4',
                  isActive ? 'text-emerald-400' : 'text-neutral-500'
                )}
              />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded-full text-xs font-mono',
                    isActive
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-neutral-800 text-neutral-400'
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <AdmissionsOverview
          program={activeProgram}
          pipelineData={pipelineData ?? undefined}
          applications={programApplications}
          selectedAppId={selectedAppId}
          onSelectApp={(id) => setSelectedAppId(id)}
          onNavigateTab={navigateTab}
        />
      )}

      {activeTab === 'pipeline' && (
        <PipelineKanban
          applications={programApplications}
          selectedAppId={selectedAppId}
          workflowStyle={activeProgram?.workflow_style}
          onSelectApp={(id) => {
            // Warn if the reviewer scorecard has unsaved changes before navigating
            if (reviewerScoresDirty && id !== selectedAppId) {
              if (!window.confirm('You have unsaved reviewer scores. Switch application and discard them?')) {
                return;
              }
              setReviewerScoresDirty(false);
            }
            setSelectedAppId(id);
            navigateTab('reviewer');
          }}
          onTransitionStatus={(id, status) => transitionMutation.mutate({ id, status })}
        />
      )}

      {activeTab === 'reviewer' && (
        <ReviewerWorkspace
          applications={programApplications}
          selectedAppId={selectedAppId}
          applicationDetail={applicationDetail}
          onSelectApp={(id) => setSelectedAppId(id)}
          onScoresDirtyChange={setReviewerScoresDirty}
          onRequestEvidence={() => setShowEvidenceModal(true)}
          onAdvanceToIC={() =>
            transitionMutation.mutate({ id: selectedAppId!, status: 'SHORTLISTED' })
          }
          onSubmitReview={(scores) =>
            reviewerScoreMutation.mutate({
              application: selectedAppId!,
              founder_score: scores.founder,
              market_score: scores.market,
              product_score: scores.product,
              team_score: scores.team,
              traction_score: scores.traction,
              overall_conviction: scores.conviction,
              recommendation: scores.recommendation,
              notes: scores.notes,
            })
          }
          onQueryCopilot={async (query) => {
            const res = await acceleratorApi.queryCopilot(selectedAppId!, query);
            return res.answer;
          }}
        />
      )}

      {activeTab === 'committee' && (
        <CommitteeWorkspace
          selectedAppId={selectedAppId}
          applicationDetail={applicationDetail}
          onCastVote={(vote, conviction, notes) =>
            committeeVoteMutation.mutate({
              application_id: selectedAppId!,
              vote,
              conviction_score: conviction,
              notes,
            })
          }
          onFinalizeDecision={(decision, notes) =>
            finalizeDecisionMutation.mutate({
              application_id: selectedAppId!,
              decision,
              rationale: notes,
            })
          }
          onRequestEvidence={() => setShowEvidenceModal(true)}
        />
      )}

      {activeTab === 'cohort' && <CohortTracker cohortData={cohortData} />}

      {activeTab === 'marketplace' && (
        <EligibilitySimulator
          program={activeProgram}
          eligibilityResult={eligibilityResult ?? undefined}
          eligibilityForm={eligibilityForm}
          setEligibilityForm={setEligibilityForm}
          onRecalculate={() => checkEligibility()}
          onLaunchApply={() => setShowApplyWizard(true)}
        />
      )}

      {/* Critical #1 — Sync / CRM Ingestion panel: dedicated tab surface that
          the sidebar /accelerator#sync link lands on. Aggregates all refresh
          actions, provenance signals, and intake diagnostics in one place. */}
      {activeTab === 'sync' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-emerald-400" />
                    CRM &amp; Ingestion Sync Console
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1">
                    Force-refresh pipeline, applications, and detail caches from
                    the upstream CRM ingestion engine.
                  </p>
                </div>
                <Button
                  onClick={() => {
                    refetchPipeline();
                    refetchApplications();
                    refetchAppDetail();
                  }}
                  size="sm"
                  className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Sync Intake Now
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Total programs', val: programs.length },
                  { label: 'Program apps', val: programApplications.length },
                  { label: 'Pipeline summary', val: pipelineData?.total_applications ?? '—' },
                  { label: 'Current app detail', val: applicationDetail ? 'Loaded' : '—' },
                ].map((k) => (
                  <div key={k.label} className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                    <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                      {k.label}
                    </p>
                    <p className="text-lg font-bold text-white mt-1">{k.val}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-5 space-y-3">
              <h4 className="text-sm font-semibold text-white">Granular Refetch</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchPipeline()}
                  className="justify-start text-xs bg-neutral-900 border-neutral-800 hover:bg-neutral-800 text-neutral-200"
                >
                  <Layers className="w-3.5 h-3.5 mr-2 text-purple-400" />
                  Refetch Pipeline
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchApplications()}
                  className="justify-start text-xs bg-neutral-900 border-neutral-800 hover:bg-neutral-800 text-neutral-200"
                >
                  <Users className="w-3.5 h-3.5 mr-2 text-blue-400" />
                  Refetch Applications
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchAppDetail()}
                  disabled={!selectedAppId}
                  className="justify-start text-xs bg-neutral-900 border-neutral-800 hover:bg-neutral-800 text-neutral-200 disabled:opacity-40"
                >
                  <FileText className="w-3.5 h-3.5 mr-2 text-amber-400" />
                  Refetch Selected App
                </Button>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-3">
              <h4 className="text-sm font-semibold text-white">Provenance Tier (ingestion)</h4>
              <div className="space-y-2 text-xs">
                {[
                  { t: 'LIVE', c: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', d: 'Fresh HTTP 200 response, full verified payload.' },
                  { t: 'DEGRADED', c: 'text-amber-400 bg-amber-500/10 border-amber-500/30', d: 'Partial payload / fallback CDN snapshot used.' },
                  { t: 'FETCH_FAILED', c: 'text-rose-400 bg-rose-500/10 border-rose-500/30', d: 'Network error; prior cached value shown.' },
                  { t: 'BASELINE', c: 'text-neutral-400 bg-neutral-800 border-neutral-700', d: 'Seed / fixture record; never reached live source.' },
                ].map((t) => (
                  <div key={t.t} className="flex items-start gap-2.5">
                    <span className={`mt-0.5 px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold border ${t.c}`}>
                      {t.t}
                    </span>
                    <span className="text-neutral-400">{t.d}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Evidence request modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {showEvidenceModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <div>
                  <h3 className="font-bold text-white text-base">
                    Request Additional Evidence from Founder
                  </h3>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    PitchMic will automatically recalculate the readiness delta
                    for each verified artifact on upload.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowEvidenceModal(false);
                    resetEvidenceForm();
                  }}
                  className="text-neutral-400 hover:text-white cursor-pointer p-1 rounded transition-colors"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Major #10 — structured evidence checklist. Each toggled item is
                  sent as a separate structured row to the API with its own
                  type string, enabling auto-verification. Free-form text is
                  only used for the "custom" item and an optional accompanying
                  message. */}
              <div className="space-y-3 text-xs">
                <p className="text-neutral-300 font-medium">
                  Select missing or unverified evidence items:
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {EVIDENCE_CHECKLIST.map((item) => {
                    const checked = evidenceSelectedItems[item.id];
                    return (
                      <label
                        key={item.id}
                        className={cn(
                          'flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors',
                          checked
                            ? 'bg-emerald-500/5 border-emerald-500/40'
                            : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 w-4 h-4 shrink-0 rounded-[4px] border flex items-center justify-center transition-colors',
                            checked
                              ? 'bg-emerald-500 border-emerald-500 text-neutral-950'
                              : 'border-neutral-600 bg-neutral-900 text-transparent'
                          )}
                        >
                          <Check className="w-3 h-3" />
                        </span>
                        <span className="text-neutral-300 select-none flex-1">
                          {item.label}
                        </span>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={(e) =>
                            setEvidenceSelectedItems((prev) => ({
                              ...prev,
                              [item.id]: e.target.checked,
                            }))
                          }
                        />
                      </label>
                    );
                  })}
                </div>

                <label className="block space-y-1.5 pt-2">
                  <span className="text-neutral-300 font-medium">
                    Accompanying message to founder <span className="text-neutral-500">(optional)</span>
                  </span>
                  <textarea
                    rows={3}
                    value={evidenceRequestText}
                    onChange={(e) => setEvidenceRequestText(e.target.value)}
                    placeholder="Add any context, deadlines, or custom evidence requests here…"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-white text-xs focus:border-emerald-500 outline-none resize-none"
                  />
                </label>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-neutral-800">
                <p className="text-[10px] text-neutral-500">
                  {Object.values(evidenceSelectedItems).filter(Boolean).length} item(s) selected
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowEvidenceModal(false);
                      resetEvidenceForm();
                    }}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={
                      (Object.values(evidenceSelectedItems).filter(Boolean).length === 0 &&
                        !evidenceRequestText.trim()) ||
                      requestEvidenceMutation.isPending
                    }
                    onClick={() => {
                      // Build structured items[] from the checklist plus one
                      // custom entry for the free-form text if present.
                      const structuredItems: Array<{ type: string; description: string }> = [];
                      EVIDENCE_CHECKLIST.forEach((it) => {
                        if (evidenceSelectedItems[it.id] && it.id !== 'custom') {
                          structuredItems.push({ type: it.id, description: it.label });
                        }
                      });
                      if (evidenceRequestText.trim()) {
                        structuredItems.push({
                          type: evidenceSelectedItems.custom ? 'custom' : 'message',
                          description: evidenceRequestText.trim(),
                        });
                      }
                      requestEvidenceMutation.mutate({
                        applicationId: selectedAppId!,
                        items: structuredItems,
                        message: evidenceRequestText.trim(),
                      });
                    }}
                    className="text-xs bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-40"
                  >
                    <HelpCircle className="w-3.5 h-3.5 mr-1" />
                    {requestEvidenceMutation.isPending ? 'Dispatching…' : 'Dispatch Request Loop'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Application wizard modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showApplyWizard && activeProgram && (
          <DynamicApplicationWizard
            program={activeProgram}
            onClose={() => setShowApplyWizard(false)}
            onSuccess={() => {
              setShowApplyWizard(false);
              refetchApplications();
              refetchPipeline();
              navigateTab('pipeline');
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
