'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  FileText,
  Palette,
  Layers,
  Sliders,
  Brain,
  Workflow,
  Users,
  ShieldCheck,
  Mail,
  Share2,
  Database,
  Lock,
  History,
  ArrowRight,
  ScanSearch,
  Target,
  CalendarClock,
} from 'lucide-react';
import { acceleratorApi } from '@/lib/acceleratorApi';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import { SettingsSectionKey } from './SettingsSidebar';

interface SettingsOverviewProps {
  onNavigate: (section: SettingsSectionKey) => void;
  orgName: string;
}

const dash = (n: number | undefined | null) => (n == null ? '—' : n.toLocaleString());

export function SettingsOverview({ onNavigate, orgName }: SettingsOverviewProps) {
  const { activeProgramId } = useActiveProgram();
  const pid = activeProgramId ?? null;

  const { data: allPrograms } = useQuery({
    queryKey: ['accelerator-programs'],
    queryFn: acceleratorApi.getPrograms,
  });
  const { data: stages } = useQuery({
    queryKey: ['accelerator-os-list', 'stages', pid],
    queryFn: () => acceleratorApi.osList<any>('stages', pid as number),
    enabled: pid != null,
  });
  const { data: memberships } = useQuery({
    queryKey: ['accelerator-os-list', 'memberships', pid],
    queryFn: () => acceleratorApi.osList<any>('memberships', pid as number),
    enabled: pid != null,
  });
  const { data: roles } = useQuery({
    queryKey: ['accelerator-os-list', 'program-roles', pid],
    queryFn: () => acceleratorApi.osList<any>('program-roles', pid as number),
    enabled: pid != null,
  });
  const { data: templates } = useQuery({
    queryKey: ['accelerator-os-list', 'notification-templates', pid],
    queryFn: () => acceleratorApi.osList<any>('notification-templates', pid as number),
    enabled: pid != null,
  });
  const { data: events } = useQuery({
    queryKey: ['accelerator-os-list', 'events', pid],
    queryFn: () => acceleratorApi.osList<any>('events', pid as number),
    enabled: pid != null,
  });
  const { data: program } = useQuery({
    queryKey: ['accelerator-settings-program', pid],
    queryFn: () => acceleratorApi.getProgram(pid as number),
    enabled: pid != null,
  });
  // The stored Selection Framework versions live in their own model. A program
  // with none has no methodology on record, which is exactly what the card
  // should say rather than implying a default exists.
  const { data: policies } = useQuery({
    queryKey: ['accelerator-policies', pid],
    queryFn: () => acceleratorApi.getPolicies(pid ?? undefined),
    enabled: pid != null,
  });

  const activeProgramCount = allPrograms?.filter((p) => p.is_active).length;
  const stageCount = pid == null ? undefined : stages?.length;
  const memberCount = pid == null ? undefined : memberships?.length;
  const roleCount = pid == null ? undefined : roles?.length;
  const templateCount = pid == null ? undefined : templates?.length;
  const eventCount = pid == null ? undefined : events?.length;

  const moduleCfg: Record<string, any> = (program as any)?.module_config ?? {};
  const connectedCount = program
    ? Object.values((moduleCfg.integrations ?? {}) as Record<string, any>).filter((i) => i?.enabled).length
    : undefined;
  const mfaPolicy = (moduleCfg.security?.mfa_policy) as string | undefined;
  const mfaMeta =
    mfaPolicy === 'required_all'
      ? 'MFA Enforced for All'
      : mfaPolicy === 'optional'
        ? 'MFA Optional'
        : program
          ? 'No MFA policy set'
          : '—';

  // What each card's second line says is what the server holds for that section.
  // These used to be fixed strings — "Rolling Mode · 3 Reviewers", "Africa/Lagos ·
  // NGN", "Encrypted at Rest" — which read back as settings nobody had chosen.
  const intakeDefaults = ((program as any)?.question_config?.intake_defaults ?? {}) as Record<string, any>;
  const INTAKE_MODE_LABELS: Record<string, string> = {
    fixed: 'Fixed intake',
    rolling: 'Rolling intake',
    rolling_cohort: 'Rolling · cohort',
    rolling_monthly: 'Rolling · monthly',
  };
  const screeningMeta = !program
    ? '—'
    : `${INTAKE_MODE_LABELS[String(intakeDefaults.mode)] ?? 'No intake mode set'}` +
      `${intakeDefaults.min_reviewers != null ? ` · ${intakeDefaults.min_reviewers} reviewers` : ''}`;
  const retentionDays = (moduleCfg.data_privacy?.data_retention_days ?? null) as number | null;
  const privacyMeta = retentionDays
    ? `${Math.max(1, Math.round(retentionDays / 365))}-year retention`
    : 'No retention period set';
  const customDomain = ((program as any)?.branding_config?.custom_domain ?? '') as string;
  const brandingMeta = program
    ? customDomain.trim() ? `Domain ${customDomain.trim()}` : 'No custom domain set'
    : '—';
  const geographyMeta = program ? ((program as any).geography_focus || 'No geography set') : '—';
  const sectorMeta = program ? ((program as any).sector_focus || 'No sectors set') : '—';

  // Hard gates the eligibility engine actually enforces — counted from the
  // stored rule set, so an unconfigured program reads "0 hard gates in force"
  // instead of implying a rule exists.
  const eligibilityRules = ((program as any)?.eligibility_rules ?? {}) as Record<string, any>;
  const gateCount = [
    Array.isArray(eligibilityRules.geography_whitelist) && eligibilityRules.geography_whitelist.length > 0,
    Array.isArray(eligibilityRules.sector_whitelist) && eligibilityRules.sector_whitelist.length > 0,
    eligibilityRules.incorporated_required === true,
    eligibilityRules.full_time_required === true,
    Number(eligibilityRules.previous_funding_max_usd) > 0,
    Number(eligibilityRules.min_team_size) > 0,
  ].filter(Boolean).length;
  const eligibilityMeta = !program
    ? '—'
    : `${gateCount} hard gate${gateCount === 1 ? '' : 's'} in force`;

  const activePolicy = policies?.find((p) => p.is_active) ?? policies?.[0] ?? null;
  const policyMeta =
    pid == null
      ? '—'
      : !policies
        ? '—'
        : activePolicy
          ? `Version ${activePolicy.version} · ${activePolicy.scoring_dimensions?.length ?? 0} dimensions`
          : 'No policy recorded';

  const interviewDecision = ((program as any)?.workflow_config?.interview_decision ?? {}) as Record<string, any>;
  const decisionMeta = !program
    ? '—'
    : [
        interviewDecision.min_reviewers_required != null
          ? `${interviewDecision.min_reviewers_required} reviewers`
          : null,
        interviewDecision.ic_quorum != null ? `quorum ${interviewDecision.ic_quorum}` : null,
        interviewDecision.decision_mode
          ? String(interviewDecision.decision_mode).replace(/_/g, ' ')
          : null,
      ].filter(Boolean).join(' · ') || 'No decision rules saved';

  const sections = [
    {
      group: 'SELECTION METHODOLOGY',
      cards: [
        {
          key: 'eligibility' as SettingsSectionKey,
          title: 'Eligibility',
          description: 'Hard gates applied before scoring: geography, sector, stage, funding caps',
          meta: eligibilityMeta,
          icon: ScanSearch,
          tag: 'Gate',
        },
        {
          key: 'evaluation' as SettingsSectionKey,
          title: 'Selection Framework',
          description: 'Evidence dimensions & weight rebalancer with policy versioning',
          meta: policyMeta,
          icon: Target,
          tag: 'Dimensions',
        },
        {
          key: 'intelligence' as SettingsSectionKey,
          title: 'ML Governance',
          description: 'What the model may assess — advisory only, never auto-decides admissions',
          meta: 'Human-in-the-loop',
          icon: Brain,
          tag: 'Guardrails',
        },
      ],
    },
    {
      group: 'REVIEW & DECISION',
      cards: [
        {
          key: 'workflow' as SettingsSectionKey,
          title: 'Review Workflow',
          description: 'Triage, reviewer conflict checks and committee stages',
          meta: stageCount == null ? '—' : `${stageCount}-Stage Pipeline`,
          icon: Workflow,
          tag: 'Lifecycle',
        },
        {
          key: 'interview-decision' as SettingsSectionKey,
          title: 'Interview & Decision',
          description: 'Reviewer thresholds, dual-interview, quorum and decision mode',
          meta: decisionMeta,
          icon: CalendarClock,
          tag: 'Decision',
        },
      ],
    },
    {
      group: 'PROGRAM OPERATIONS',
      cards: [
        {
          key: 'programs' as SettingsSectionKey,
          title: 'Programs Administration',
          description: 'Manage active, draft and archived cohort programs',
          meta: `${dash(activeProgramCount)} active programs`,
          icon: Layers,
          tag: `${dash(activeProgramCount)} Active`,
        },
        {
          key: 'general' as SettingsSectionKey,
          title: 'General Settings',
          description: 'Name, tagline, program type, sector, geography and visibility',
          meta: geographyMeta,
          icon: Building2,
          tag: 'Core Config',
        },
        {
          key: 'profile' as SettingsSectionKey,
          title: 'Account & Session Context',
          description: 'Your signed-in identity and the organization behind the active program',
          meta: sectorMeta,
          icon: FileText,
          tag: 'Read Only',
        },
        {
          key: 'branding' as SettingsSectionKey,
          title: 'White-Label & Branding',
          description: 'Logo, colors, fonts and the custom domain recorded for this program',
          meta: brandingMeta,
          icon: Palette,
          tag: 'White-Label',
        },
        {
          key: 'screening' as SettingsSectionKey,
          title: 'Application & Intake Defaults',
          description: 'Intake mode, review rounds, reviewer minimum and retention windows',
          meta: screeningMeta,
          icon: Sliders,
          tag: 'Defaults',
        },
      ],
    },
    {
      group: 'PEOPLE & ACCESS CONTROL',
      cards: [
        {
          key: 'members' as SettingsSectionKey,
          title: 'Organization Members',
          description: 'Reviewers, directors, mentors and staff invitations',
          meta: `${dash(memberCount)} members active`,
          icon: Users,
          tag: `${dash(memberCount)} Members`,
        },
        {
          key: 'roles' as SettingsSectionKey,
          title: 'Roles & Permissions',
          description: 'Granular RBAC: Director, Reviewer, Committee, Mentor',
          meta: `${dash(roleCount)} Role Profiles`,
          icon: ShieldCheck,
          tag: 'RBAC',
        },
      ],
    },
    {
      group: 'GOVERNANCE & AUDIT',
      cards: [
        {
          key: 'audit' as SettingsSectionKey,
          title: 'Audit Log & Provenance',
          description: 'Append-only event ledger and policy version history',
          meta: `${dash(eventCount)} events logged`,
          icon: History,
          tag: 'Immutable',
        },
        {
          key: 'data-privacy' as SettingsSectionKey,
          title: 'Data & Privacy',
          description: 'Retention window, evidence snapshotting and source-metadata policies',
          meta: privacyMeta,
          icon: Database,
          tag: 'Compliance',
        },
      ],
    },
    {
      group: 'COMMUNICATIONS & INTEGRATIONS',
      cards: [
        {
          key: 'communications' as SettingsSectionKey,
          title: 'Email & Notifications',
          description: 'Sender identity, founder and reviewer trigger preferences & templates',
          meta: `${dash(templateCount)} Templates saved`,
          icon: Mail,
          tag: 'Stored config',
        },
        {
          key: 'integrations' as SettingsSectionKey,
          title: 'Integration Preferences',
          description: 'Which external tools this program is recorded as working with',
          meta: `${dash(connectedCount)} marked in use`,
          icon: Share2,
          tag: 'Preferences',
        },
        {
          key: 'security' as SettingsSectionKey,
          title: 'Security & Sessions',
          description: 'MFA enforcement, SSO authentication and active sessions',
          meta: mfaMeta,
          icon: Lock,
          tag: 'Secure',
        },
      ],
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Banner — everything stated here is read from the server, including the
          absence of an organization name. */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-950/40 via-[#0F1623] to-[#0B0F17] p-6 sm:p-8 space-y-3 relative overflow-hidden shadow-2xl">
        <div className="absolute right-0 top-0 h-64 w-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            Program Configuration
          </span>
          <span className="text-xs text-white/40 font-mono">
            {pid == null ? 'No program selected' : `Program #${pid}`}
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
          {orgName || 'Unnamed organization'} — Governance &amp; Configuration
        </h2>
        <p className="text-xs sm:text-sm text-white/60 max-w-2xl leading-relaxed">
          These settings describe how the selected program screens, reviews and selects. They are
          saved on the program record, and they constrain the process — the admission decision stays
          with the reviewers and the committee.
        </p>

        <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-white/70">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-white/40" />
            <span>{mfaMeta}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <History className="h-4 w-4 text-white/40" />
            <span>
              {eventCount == null ? 'No audit ledger loaded' : `${dash(eventCount)} audit events recorded`}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-white/40" />
            <span>{dash(activeProgramCount)} programs on record</span>
          </div>
        </div>
      </div>

      {/* Categories Grid */}
      <div className="space-y-8">
        {sections.map((sec) => (
          <div key={sec.group} className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-white/40 px-1">
              {sec.group}
            </h3>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {sec.cards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.key}
                    onClick={() => onNavigate(card.key)}
                    className="group rounded-xl border border-white/10 bg-[#0F1623] p-4 text-left transition-all hover:border-indigo-500/50 hover:bg-white/[0.03] hover:shadow-lg flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-indigo-400 group-hover:scale-105 group-hover:bg-indigo-500/20 transition">
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/5 text-white/60 border border-white/5 group-hover:border-indigo-500/30 group-hover:text-indigo-300 transition">
                          {card.tag}
                        </span>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white group-hover:text-indigo-300 transition flex items-center justify-between">
                          <span>{card.title}</span>
                          <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition text-indigo-400" />
                        </h4>
                        <p className="text-xs text-white/50 mt-1 line-clamp-2 leading-relaxed">
                          {card.description}
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-white/5 pt-2.5 flex items-center justify-between text-[11px] text-white/40 font-mono">
                      <span>{card.meta}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
