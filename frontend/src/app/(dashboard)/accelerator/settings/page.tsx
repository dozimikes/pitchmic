'use client';

import * as React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Settings,
  Building2,
  X,
  Check,
  Loader2,
  ArrowRight,
  Eye,
  PanelLeft,
  Save,
  Rocket,
} from 'lucide-react';

import { SettingsSidebar, SettingsSectionKey } from '@/components/accelerator/settings/SettingsSidebar';
import { SettingsOverview } from '@/components/accelerator/settings/SettingsOverview';
import { GeneralSettings } from '@/components/accelerator/settings/GeneralSettings';
import { ProfileSettings } from '@/components/accelerator/settings/ProfileSettings';
import { BrandingSettings } from '@/components/accelerator/settings/BrandingSettings';
import { ProgramsSettings } from '@/components/accelerator/settings/ProgramsSettings';
import { CyclesSettings } from '@/components/accelerator/settings/CyclesSettings';
import { IntakeSettings } from '@/components/accelerator/settings/IntakeSettings';
import { EligibilitySettings } from '@/components/accelerator/settings/EligibilitySettings';
import { ApplicationDefaultsSettings } from '@/components/accelerator/settings/ApplicationDefaultsSettings';
import { EvaluationSettings } from '@/components/accelerator/settings/EvaluationSettings';
import { WorkflowSettings } from '@/components/accelerator/settings/WorkflowSettings';
import { InterviewDecisionSettings } from '@/components/accelerator/settings/InterviewDecisionSettings';
import { MembersSettings } from '@/components/accelerator/settings/MembersSettings';
import { RolesSettings } from '@/components/accelerator/settings/RolesSettings';
import { IntelligenceSettings } from '@/components/accelerator/settings/IntelligenceSettings';
import { CommunicationsSettings } from '@/components/accelerator/settings/CommunicationsSettings';
import { IntegrationsSettings } from '@/components/accelerator/settings/IntegrationsSettings';
import { DataPrivacySettings } from '@/components/accelerator/settings/DataPrivacySettings';
import { SecuritySettings } from '@/components/accelerator/settings/SecuritySettings';
import { AuditSettings } from '@/components/accelerator/settings/AuditSettings';
import { DangerZoneSettings } from '@/components/accelerator/settings/DangerZoneSettings';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import { acceleratorApi } from '@/lib/acceleratorApi';
import { apiErrMessage } from '@/lib/screening';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

// The organization name is real server data — read from the active program
// (organization_name on the program record). There is intentionally NO
// hard-coded fallback org: a fabricated name would violate the DB-is-truth
// guardrail on this screen.

function SectionContent({
  section,
  onNavigate,
  orgName,
  onUpdateOrgName,
  focus,
}: {
  section: SettingsSectionKey;
  onNavigate: (s: SettingsSectionKey) => void;
  orgName: string;
  onUpdateOrgName: (name: string) => void;
  focus: StepFocus | null;
}) {
  switch (section) {
    case 'overview':
      return <SettingsOverview onNavigate={onNavigate} orgName={orgName} />;
    case 'eligibility':
      return <EligibilitySettings />;
    case 'evaluation':
      return <EvaluationSettings />;
    case 'screening':
      return <ApplicationDefaultsSettings />;
    case 'intelligence':
      return <IntelligenceSettings />;
    case 'workflow':
      return <WorkflowSettings />;
    case 'interview-decision':
      return <InterviewDecisionSettings focus={focus ?? 'interview'} />;
    case 'general':
      return <GeneralSettings orgName={orgName} onUpdateOrgName={onUpdateOrgName} />;
    case 'profile':
      return <ProfileSettings />;
    case 'branding':
      return <BrandingSettings />;
    case 'programs':
      return <ProgramsSettings />;
    case 'cycles':
      return <CyclesSettings />;
    case 'intake':
      return <IntakeSettings />;
    case 'members':
      return <MembersSettings />;
    case 'roles':
      return <RolesSettings />;
    case 'communications':
      return <CommunicationsSettings />;
    case 'integrations':
      return <IntegrationsSettings />;
    case 'data-privacy':
      return <DataPrivacySettings />;
    case 'security':
      return <SecuritySettings />;
    case 'audit':
      return <AuditSettings />;
    case 'danger-zone':
      return <DangerZoneSettings />;
    default:
      return <SettingsOverview onNavigate={onNavigate} orgName={orgName} />;
  }
}

const SECTION_LABELS: Record<SettingsSectionKey, string> = {
  overview: 'Configuration Hub',
  eligibility: 'Eligibility',
  evaluation: 'Selection Framework',
  screening: 'Application & Intake Defaults',
  intelligence: 'ML Governance',
  workflow: 'Review Workflow',
  'interview-decision': 'Interview & Decision',
  general: 'General',
  profile: 'Account & Session Context',
  branding: 'Branding',
  programs: 'Programs',
  cycles: 'Intake Cycles',
  intake: 'Intake & Import',
  members: 'Members',
  roles: 'Team & Permissions',
  communications: 'Notifications',
  integrations: 'Integrations',
  'data-privacy': 'Data & Privacy',
  security: 'Security & Sessions',
  audit: 'Audit Log',
  'danger-zone': 'Danger Zone',
};

// ── Mockup screen 10: the program configuration flow ───────────────────────
// Each step maps onto a section key already wired in SectionContent (so
// SettingsSidebar deep links keep resolving). The last three steps all live in
// the Interview & Decision section (backed by workflow_config.interview_decision
// via updateProgram) and are distinguished by the ?focus= URL param, which
// InterviewDecisionSettings honors by scrolling to the matching config block.
type StepFocus = 'interview' | 'due-diligence' | 'decision-rules';

interface ConfigStep {
  label: string;
  section: SettingsSectionKey;
  focus?: StepFocus;
  hint: string;
}

const CONFIG_STEPS: ConfigStep[] = [
  { label: 'General Information', section: 'general', hint: 'Name, season, identity' },
  { label: 'Selection Framework', section: 'evaluation', hint: 'Evidence dimensions & weights' },
  { label: 'Eligibility Rules', section: 'eligibility', hint: 'Hard gates' },
  { label: 'Review Workflow', section: 'workflow', hint: 'Stages & routing' },
  { label: 'Interview Process', section: 'interview-decision', focus: 'interview', hint: 'Reviewers & rounds' },
  { label: 'Due Diligence', section: 'interview-decision', focus: 'due-diligence', hint: 'Verification inputs' },
  { label: 'Decision Rules', section: 'interview-decision', focus: 'decision-rules', hint: 'Quorum & mode' },
];

function nonEmpty(obj: unknown): boolean {
  return !!obj && typeof obj === 'object' && Object.keys(obj as Record<string, any>).length > 0;
}

interface RubricWeight {
  key: string;
  name: string;
  weight: number;
}

function humanizeKey(k: string): string {
  return k
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** scoring_rubric_config arrives either as {dimensions:[{name,label,key,weight}]}
 *  (EvaluationSettings format) or as a flat {founder:20, market:15} object
 *  (documented model format). Normalise both to weight rows. */
function parseRubricWeights(cfg: Record<string, any> | undefined | null): RubricWeight[] {
  if (!cfg || typeof cfg !== 'object') return [];
  if (Array.isArray(cfg.dimensions)) {
    return cfg.dimensions
      .map((d: any, i: number) => ({
        key: String(d?.key ?? d?.name ?? `dim_${i}`),
        name: String(d?.name ?? d?.label ?? humanizeKey(String(d?.key ?? `Dimension ${i + 1}`))),
        weight: Number(d?.weight) || 0,
      }));
  }
  const META = new Set(['dimensions', 'version', 'status', 'effective_date']);
  return Object.entries(cfg)
    .filter(([k, v]) => !META.has(k) && typeof v === 'number')
    .map(([k, v]) => ({ key: k, name: humanizeKey(k), weight: Number(v) || 0 }));
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return `$${n}`;
}

const PROGRAM_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  setup: 'Setup in progress',
  published: 'Published',
  accepting: 'Accepting applications',
  reviewing: 'Under review',
  cohort_active: 'Cohort active',
  completed: 'Completed',
  archived: 'Archived',
};

export default function AcceleratorSettingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeProgram } = useActiveProgram();
  const pid = activeProgram?.id ?? null;

  // Local override only while an editor session is mid-edit; the authoritative
  // name always comes from the server program record below.
  const [orgNameOverride, setOrgNameOverride] = React.useState<string | null>(null);

  const sectionFromUrl = (searchParams.get('section') as SettingsSectionKey) || 'overview';
  const focusFromUrl = (searchParams.get('focus') as StepFocus | null) ?? null;
  const [activeSection, setActiveSection] = React.useState<SettingsSectionKey>(sectionFromUrl);
  const [activeFocus, setActiveFocus] = React.useState<StepFocus | null>(focusFromUrl);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);

  const handleSelectSection = React.useCallback(
    (key: SettingsSectionKey) => {
      setActiveSection(key);
      setActiveFocus(null);
      setMobileSidebarOpen(false);
      // Sync to URL without full navigation
      const params = new URLSearchParams(searchParams.toString());
      params.set('section', key);
      params.delete('focus');
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const handleSelectStep = React.useCallback(
    (step: ConfigStep) => {
      setActiveSection(step.section);
      setActiveFocus(step.focus ?? null);
      setMobileSidebarOpen(false);
      const params = new URLSearchParams(searchParams.toString());
      params.set('section', step.section);
      if (step.focus) params.set('focus', step.focus);
      else params.delete('focus');
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // Sync URL → state when user hits back/forward
  React.useEffect(() => {
    const s = searchParams.get('section') as SettingsSectionKey;
    if (s && s !== activeSection) setActiveSection(s);
    const f = (searchParams.get('focus') as StepFocus | null) ?? null;
    setActiveFocus(f);
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Real program data for the step-completion checks + Program Preview ────
  // Same query key the section components use — shared cache, no double fetch.
  const { data: program, isLoading: programLoading } = useQuery({
    queryKey: ['accelerator-program-detail', pid],
    queryFn: () => acceleratorApi.getProgram(pid as number),
    enabled: pid != null,
  });
  const { data: workflowDef } = useQuery({
    queryKey: ['accelerator-workflow', pid],
    queryFn: () => acceleratorApi.getWorkflow(pid as number),
    enabled: pid != null,
  });

  // Organization name comes from the server program record — never a mock.
  React.useEffect(() => {
    setOrgNameOverride(null);
  }, [pid]);
  const orgName =
    orgNameOverride ??
    program?.organization_name?.trim() ??
    activeProgram?.organization_name?.trim() ??
    '';

  const eligibilityRules = (program?.eligibility_rules ?? {}) as Record<string, any>;
  const workflowConfig = (program?.workflow_config ?? {}) as Record<string, any>;
  const moduleConfig = (program?.module_config ?? {}) as Record<string, any>;
  const interviewDecision = (workflowConfig.interview_decision ?? {}) as Record<string, any>;
  const rubricWeights = React.useMemo(
    () => parseRubricWeights(program?.scoring_rubric_config as Record<string, any> | undefined),
    [program?.scoring_rubric_config]
  );

  // Step completion derives from persisted config, not local edit state.
  const stepCompleted = React.useMemo<boolean[]>(() => {
    if (!program) return CONFIG_STEPS.map(() => false);
    return [
      Boolean(program.name && program.program_cycle),
      rubricWeights.some((w) => w.weight > 0),
      nonEmpty(program.eligibility_rules),
      Boolean(workflowDef && workflowDef.stages && workflowDef.stages.length > 0),
      interviewDecision.min_reviewers_required != null || interviewDecision.require_dual_interview != null,
      interviewDecision.allow_ai_recommendations != null || nonEmpty(moduleConfig.due_diligence),
      interviewDecision.decision_mode != null || interviewDecision.ic_quorum != null,
    ];
  }, [program, rubricWeights, moduleConfig, workflowDef, interviewDecision]);

  const completedCount = stepCompleted.filter(Boolean).length;
  const completenessPct = Math.round((completedCount / CONFIG_STEPS.length) * 100);

  // Which step (if any) the current section+focus resolves to
  const activeStepIndex = CONFIG_STEPS.findIndex((s) => {
    if (s.section !== activeSection) return false;
    if (s.section !== 'interview-decision') return true;
    const currentFocus: StepFocus = activeFocus ?? 'interview';
    return (s.focus ?? 'interview') === currentFocus;
  });
  const isDanger = activeSection === 'danger-zone';

  // ── Publish: real field on the model — AcceleratorProgram.program_status
  //    has a 'published' choice and is writable through the detail serializer.
  //    The backend guards publish: with an empty Selection Framework it
  //    returns 400 "Publish blocked: configure the Selection Framework…" —
  //    that reason is surfaced verbatim so the admin knows what to fix.
  const programStatus = String(program?.program_status ?? 'draft');
  const alreadyPublished = programStatus === 'published' || programStatus === 'accepting';
  const publishMutation = useMutation({
    mutationFn: () => acceleratorApi.updateProgram(pid as number, { program_status: 'published' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accelerator-program-detail', pid] });
      queryClient.invalidateQueries({ queryKey: ['accelerator-programs'] });
      toast({
        title: 'Configuration published',
        description: 'Program status set to Published — Pitchmic now applies these policies to new intake.',
        variant: 'success',
      });
    },
    onError: (err: unknown) => {
      toast({
        title: 'Publish blocked',
        description: apiErrMessage(err, 'Could not publish this program configuration.'),
        variant: 'error',
      });
    },
  });

  const geographyList = Array.isArray(eligibilityRules.geography_whitelist)
    ? (eligibilityRules.geography_whitelist as unknown[]).map(String)
    : [];
  const sectorList = Array.isArray(eligibilityRules.sector_whitelist)
    ? (eligibilityRules.sector_whitelist as unknown[]).map(String)
    : [];
  const fundingCap = Number(eligibilityRules.previous_funding_max_usd) || 0;

  return (
    <div className="min-h-screen bg-[#090E18] text-white">
      <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
        {/* ── Top Bar ─────────────────────────────────────────────────── */}
        <div className="sticky top-0 z-30 border-b border-white/10 bg-[#090E18]/95 backdrop-blur-md py-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex items-center gap-2.5 shrink-0 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center shrink-0">
                <Settings className="h-[18px] w-[18px] text-indigo-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-white leading-tight">Program Configuration</p>
                <p className="text-[10px] text-white/40 font-medium leading-tight truncate">
                  Define how this program screens, reviews and selects — Pitchmic applies it, humans decide.
                </p>
              </div>
            </div>

            {/* Breadcrumb for sections outside the configuration flow */}
            {activeStepIndex === -1 && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-white/40">
                <span>/</span>
                <button
                  onClick={() => handleSelectSection('overview')}
                  className="hover:text-white transition"
                >
                  Overview
                </button>
                <span>/</span>
                <span className={isDanger ? 'text-rose-400' : 'text-white/70'}>
                  {SECTION_LABELS[activeSection]}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2.5 ml-auto shrink-0">
              {/* Save: sections persist themselves — honest guidance, no dead button */}
              <div
                className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] text-white/45"
                title="Each configuration section saves directly to the program policy."
              >
                <Save className="h-3.5 w-3.5 text-emerald-400/80" />
                <span>
                  Sections <span className="text-emerald-400/90 font-semibold">auto-save</span> when you hit save inside each one
                </span>
              </div>

              <button
                onClick={() => handleSelectSection('overview')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white/70 hover:text-white transition"
              >
                <Eye className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Hub</span>
              </button>

              {pid != null ? (
                alreadyPublished ? (
                  <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-emerald-300">
                    <Check className="h-3.5 w-3.5" />
                    {PROGRAM_STATUS_LABELS[programStatus] ?? 'Published'}
                  </div>
                ) : (
                  <button
                    onClick={() => publishMutation.mutate()}
                    disabled={publishMutation.isPending || programLoading || !program}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/40 text-xs font-bold text-white transition disabled:opacity-50"
                  >
                    {publishMutation.isPending || programLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Rocket className="h-3.5 w-3.5" />
                    )}
                    Publish configuration
                  </button>
                )
              ) : (
                <span className="text-[11px] text-white/35 px-2">Select a program to publish</span>
              )}
            </div>

            {/* Search (filters the full-sections drawer) */}
            <div className="relative w-full sm:w-56 order-last sm:order-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
              <input
                type="text"
                placeholder="Search all sections..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Body: steps │ active section │ program preview ────────────── */}
        <div className="flex gap-6 py-8 items-start">
          {/* ── LEFT: numbered configuration flow ───────────────────────── */}
          <aside className="hidden md:block w-60 shrink-0 sticky top-24">
            <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40">
                  Configuration Flow
                </h3>
                <span className="text-[10px] font-mono text-indigo-400">
                  {completedCount}/{CONFIG_STEPS.length}
                </span>
              </div>
              <ol className="space-y-0.5">
                {CONFIG_STEPS.map((step, i) => {
                  const isActive = activeStepIndex === i;
                  const isComplete = stepCompleted[i];
                  return (
                    <li key={`${step.section}:${step.focus ?? '-'}`}>
                      <button
                        onClick={() => handleSelectStep(step)}
                        className={cn(
                          'w-full flex items-start gap-2.5 px-2 py-2 rounded-lg text-left transition',
                          isActive ? 'bg-indigo-600/20 border border-indigo-500/40' : 'border border-transparent hover:bg-white/5'
                        )}
                      >
                        <span
                          className={cn(
                            'h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5 border transition',
                            isComplete && !isActive
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                              : isActive
                              ? 'bg-indigo-500 border-indigo-400 text-white'
                              : 'bg-white/5 border-white/15 text-white/50'
                          )}
                        >
                          {isComplete && !isActive ? <Check className="h-3 w-3" /> : i + 1}
                        </span>
                        <span className="min-w-0">
                          <span
                            className={cn(
                              'block text-xs font-semibold leading-tight truncate',
                              isActive ? 'text-white' : 'text-white/70'
                            )}
                          >
                            {step.label}
                          </span>
                          <span className="block text-[10px] text-white/35 leading-tight mt-0.5 truncate">
                            {step.hint}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              {activeStepIndex === -1 && (
                <div className="mt-3 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-3 py-2">
                  <p className="text-[10px] text-indigo-200 leading-snug">
                    Viewing <span className="font-bold">{SECTION_LABELS[activeSection]}</span> — outside the configuration flow.
                  </p>
                  <button
                    onClick={() => handleSelectStep(CONFIG_STEPS[0])}
                    className="mt-1 text-[10px] font-bold text-indigo-300 hover:text-white transition flex items-center gap-1"
                  >
                    Back to configuration <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              )}

              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="mt-4 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] font-semibold text-white/60 hover:text-white transition"
              >
                <PanelLeft className="h-3.5 w-3.5" />
                All settings sections
              </button>
            </div>
          </aside>

          {/* ── All-sections drawer (SettingsSidebar deep links stay live) ── */}
          {mobileSidebarOpen && (
            <div className="fixed inset-0 z-40">
              <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={() => setMobileSidebarOpen(false)}
              />
              <div className="absolute left-0 top-0 bottom-0 w-72 bg-[#0B1120] border-r border-white/10 p-4 overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-bold text-white/60 uppercase tracking-widest">All Settings</p>
                  <button
                    onClick={() => setMobileSidebarOpen(false)}
                    className="text-white/40 hover:text-white transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <SettingsSidebar
                  activeSection={activeSection}
                  onSelectSection={handleSelectSection}
                  searchQuery={searchQuery}
                />
              </div>
            </div>
          )}

          {/* Mobile step strip */}
          <div className="md:hidden fixed bottom-4 left-4 right-4 z-30">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#0F1623]/95 border border-white/15 text-xs font-bold text-white/80 shadow-xl"
            >
              <Building2 className="h-3.5 w-3.5 text-indigo-400" />
              {activeStepIndex >= 0
                ? `Step ${activeStepIndex + 1} · ${CONFIG_STEPS[activeStepIndex].label}`
                : SECTION_LABELS[activeSection]}
              <span className="ml-auto text-[10px] font-mono text-indigo-400">{completedCount}/{CONFIG_STEPS.length} done</span>
            </button>
          </div>

          {/* ── CENTER: active section component (unchanged behavior) ───── */}
          <main className="flex-1 min-w-0">
            {isDanger && (
              <div className="mb-4 flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-950/30 px-4 py-3">
                <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                <p className="text-xs font-semibold text-rose-300">
                  You are in the Danger Zone. All actions here are permanent and may be irreversible.
                </p>
              </div>
            )}

            <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
              <SectionContent
                section={activeSection}
                onNavigate={handleSelectSection}
                orgName={orgName}
                onUpdateOrgName={setOrgNameOverride}
                focus={activeFocus}
              />
            </div>
          </main>

          {/* ── RIGHT: Program Preview (xl+, sticky, real data only) ─────── */}
          <aside className="hidden xl:block w-80 shrink-0 sticky top-24">
            <div className="rounded-2xl border border-white/10 bg-[#0F1623] overflow-hidden shadow-xl">
              <div className="px-5 py-4 border-b border-white/10 bg-black/20 flex items-center gap-2">
                <Eye className="h-4 w-4 text-indigo-400" />
                <h3 className="text-xs font-black text-white tracking-wide">Program Preview</h3>
                <span className="ml-auto text-[9px] font-mono uppercase tracking-wider text-white/35">Live data</span>
              </div>

              {pid == null ? (
                <div className="p-5 text-center">
                  <p className="text-xs text-white/50">Select a program to preview its configuration.</p>
                </div>
              ) : !program ? (
                <div className="p-5 space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-3 rounded bg-white/5 animate-pulse" style={{ width: `${90 - i * 12}%` }} />
                  ))}
                </div>
              ) : (
                <div className="p-5 space-y-5">
                  {/* Identity */}
                  <div>
                    <p className="text-sm font-black text-white leading-tight">{program.name || 'Unnamed program'}</p>
                    <p className="text-[11px] text-white/45 mt-0.5">
                      {program.program_cycle || 'No season set'}
                      {program.application_deadline
                        ? ` · closes ${new Date(program.application_deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
                        : ''}
                    </p>
                    <span
                      className={cn(
                        'inline-block mt-2 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border',
                        alreadyPublished
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                          : 'bg-amber-500/10 border-amber-500/25 text-amber-300'
                      )}
                    >
                      {PROGRAM_STATUS_LABELS[programStatus] ?? programStatus}
                    </span>
                  </div>

                  {/* Eligibility summary */}
                  <div className="border-t border-white/10 pt-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Eligibility</p>
                    <dl className="space-y-1.5 text-[11px]">
                      <div className="flex justify-between gap-2">
                        <dt className="text-white/45">Geographies</dt>
                        <dd className="text-white/85 font-semibold text-right">
                          {geographyList.length > 0 ? `${geographyList.length} whitelisted (${geographyList.slice(0, 3).join(', ')}${geographyList.length > 3 ? '…' : ''})` : 'Open'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-white/45">Sectors</dt>
                        <dd className="text-white/85 font-semibold text-right">
                          {sectorList.length > 0 ? `${sectorList.length} whitelisted` : 'Any sector'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-white/45">Incorporation</dt>
                        <dd className={cn('font-semibold', eligibilityRules.incorporated_required ? 'text-white/85' : 'text-white/50')}>
                          {eligibilityRules.incorporated_required ? 'Required' : 'Not required'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-white/45">Funding cap</dt>
                        <dd className="text-white/85 font-semibold">
                          {fundingCap > 0 ? formatUsd(fundingCap) : 'No cap'}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {/* Selection framework weights */}
                  <div className="border-t border-white/10 pt-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Selection Framework</p>
                    {rubricWeights.length > 0 ? (
                      <div className="space-y-2">
                        {rubricWeights.map((w) => (
                          <div key={w.key}>
                            <div className="flex justify-between text-[11px] mb-1">
                              <span className="text-white/70 font-medium truncate">{w.name}</span>
                              <span className="text-indigo-300 font-bold font-mono">{w.weight}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                                style={{ width: `${Math.max(0, Math.min(100, w.weight))}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-center">
                        <p className="text-[11px] text-white/50">No framework configured yet.</p>
                        <button
                          onClick={() => handleSelectStep(CONFIG_STEPS[1])}
                          className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-300 hover:text-white transition"
                        >
                          Configure weights <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Review thresholds */}
                  {(interviewDecision.min_reviewers_required != null ||
                    interviewDecision.ic_quorum != null ||
                    interviewDecision.decision_mode != null) && (
                    <div className="border-t border-white/10 pt-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Review Thresholds</p>
                      <dl className="space-y-1.5 text-[11px]">
                        {interviewDecision.min_reviewers_required != null && (
                          <div className="flex justify-between">
                            <dt className="text-white/45">Min reviewers</dt>
                            <dd className="text-white/85 font-mono font-bold">{Number(interviewDecision.min_reviewers_required)}</dd>
                          </div>
                        )}
                        {interviewDecision.ic_quorum != null && (
                          <div className="flex justify-between">
                            <dt className="text-white/45">IC quorum</dt>
                            <dd className="text-white/85 font-mono font-bold">{Number(interviewDecision.ic_quorum)}</dd>
                          </div>
                        )}
                        {interviewDecision.decision_mode != null && (
                          <div className="flex justify-between">
                            <dt className="text-white/45">Decision mode</dt>
                            <dd className="text-white/85 font-semibold">{humanizeKey(String(interviewDecision.decision_mode))}</dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  )}

                  {/* Completeness meter */}
                  <div className="border-t border-white/10 pt-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Configuration Complete</p>
                      <p className="text-[11px] font-mono font-bold text-indigo-300">{completenessPct}%</p>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          completenessPct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'
                        )}
                        style={{ width: `${completenessPct}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] text-white/40">
                      {completedCount} of {CONFIG_STEPS.length} steps have saved configuration.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
