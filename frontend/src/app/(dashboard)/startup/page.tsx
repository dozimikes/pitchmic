'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import {
  Pencil,
  Building2,
  Users,
  Target,
  Globe2,
  TrendingUp,
  BarChart2,
  DollarSign,
  Rocket,
  ArrowRight,
  Clock,
  ChevronRight,
  ShieldCheck,
  HelpCircle,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  FolderLock,
  FileCheck,
  FileText,
  Activity,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import {
  fundabilityApi,
  getScoreBarColor,
  getScoreColor,
  type FounderProfile,
  type ProductProfile,
  type MarketProfile,
  type BusinessModelProfile,
  type TractionMetric,
} from '@/lib/fundabilityApi';
import { apiGet } from '@/lib/api';
import { JsonLd } from '@/components/seo/JsonLd';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StartupProfileData {
  company_name: string;
  tagline?: string;
  industry?: string;
  location?: string;
  funding_stage?: string;
  logo_url?: string;
  website?: string;
  description?: string;
}

type SectionStatus = 'complete' | 'partial' | 'weak' | 'missing' | 'not_started';

// ---------------------------------------------------------------------------
// Completeness helpers
// ---------------------------------------------------------------------------

function countFilled(obj: Record<string, unknown>, keys: string[]): number {
  return keys.reduce((n, k) => {
    const v = obj[k];
    if (v === null || v === undefined) return n;
    if (typeof v === 'string' && v.trim() === '') return n;
    if (typeof v === 'number' && v === 0) return n;
    return n + 1;
  }, 0);
}

function ratioToStatus(filled: number, total: number): SectionStatus {
  if (total === 0) return 'not_started';
  const r = filled / total;
  if (r >= 0.75) return 'complete';
  if (r >= 0.40) return 'partial';
  if (r >= 0.10) return 'weak';
  if (r > 0) return 'missing';
  return 'not_started';
}

function identityCompletion(p?: StartupProfileData) {
  const keys = ['company_name', 'tagline', 'industry', 'location', 'website', 'description'];
  return { filled: p ? countFilled(p as unknown as Record<string, unknown>, keys) : 0, total: keys.length };
}

function foundersCompletion(list?: FounderProfile[]) {
  const keys = ['full_name', 'role', 'linkedin_url', 'education_summary', 'founder_market_fit_description'];
  if (!list?.length) return { filled: 0, total: keys.length };
  const primary = list.find((f) => f.is_primary) ?? list[0];
  return { filled: countFilled(primary as unknown as Record<string, unknown>, keys), total: keys.length };
}

function productCompletion(p?: ProductProfile) {
  const keys = ['problem_statement', 'solution_description', 'target_customer_description', 'product_status', 'differentiator_description', 'moat_description'];
  return { filled: p ? countFilled(p as unknown as Record<string, unknown>, keys) : 0, total: keys.length };
}

function marketCompletion(m?: MarketProfile) {
  const keys = ['tam_usd', 'sam_usd', 'som_usd', 'primary_geography', 'direct_competitors', 'competitive_advantage'];
  return { filled: m ? countFilled(m as unknown as Record<string, unknown>, keys) : 0, total: keys.length };
}

function tractionCompletion(metrics?: TractionMetric[]) {
  return { filled: Math.min(metrics?.length ?? 0, 4), total: 4 };
}

function bizModelCompletion(bm?: BusinessModelProfile) {
  const keys = ['revenue_model', 'customer_type', 'sales_model', 'pricing_model', 'path_to_profitability'];
  const base = bm ? countFilled(bm as unknown as Record<string, unknown>, keys) : 0;
  const bonus = bm?.unit_economics_are_modelled ? 1 : 0;
  return { filled: base + bonus, total: keys.length + 1 };
}

function completionToStatus(c: { filled: number; total: number }): SectionStatus {
  return ratioToStatus(c.filled, c.total);
}

function overallProfilePct(completions: Array<{ filled: number; total: number }>): number {
  const totalFilled = completions.reduce((s, c) => s + c.filled, 0);
  const totalPossible = completions.reduce((s, c) => s + c.total, 0);
  return totalPossible === 0 ? 0 : Math.round((totalFilled / totalPossible) * 100);
}

function daysAgo(dateStr?: string): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Static maps
// ---------------------------------------------------------------------------

const STAGE_LABELS: Record<string, string> = {
  idea: 'Idea / Concept',
  pre_seed: 'Pre-Seed',
  seed: 'Seed',
  series_a: 'Series A',
  series_b: 'Series B',
  series_b_plus: 'Series B+',
  series_c: 'Series C',
  growth: 'Growth',
};

const DIMENSION_DISPLAY: Record<string, string> = {
  problem: 'Problem',
  solution: 'Product',
  market: 'Market',
  team: 'Team',
  traction: 'Traction',
  business_model: 'Business Model',
  defensibility: 'Defensibility',
  fundraising: 'Fundraising',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: SectionStatus }) {
  const map: Record<SectionStatus, { label: string; badgeClass: string; icon: React.ComponentType<{ className?: string }> }> = {
    complete:    { label: 'Complete',    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
    partial:     { label: 'In Progress', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',     icon: AlertTriangle },
    weak:        { label: 'Needs Proof', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',         icon: AlertTriangle },
    missing:     { label: 'Missing',     badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',         icon: AlertTriangle },
    not_started: { label: 'Not Started', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',     icon: Clock },
  };
  const { label, badgeClass, icon: Icon } = map[status];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', badgeClass)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function ScoreBar({ score, height = 'h-1.5' }: { score: number; height?: string }) {
  return (
    <div className={cn('w-full rounded-full bg-slate-100', height)}>
      <div
        className={cn('h-full rounded-full transition-all', getScoreBarColor(score))}
        style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
      />
    </div>
  );
}

function FundabilityGauge({ score }: { score: number }) {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, score)) / 100;
  const dashOffset = circumference * (1 - pct);

  const strokeColor =
    score >= 75 ? '#10b981' :
    score >= 55 ? '#f59e0b' :
    '#ef4444';

  return (
    <div className="relative flex items-center justify-center w-32 h-32">
      <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
        <circle
          cx="60" cy="60" r={radius}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth="10"
        />
        <circle
          cx="60" cy="60" r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-2xl font-black tabular-nums leading-none', getScoreColor(score))}>
          {score.toFixed(0)}
        </span>
        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-1">/ 100 Score</span>
      </div>
    </div>
  );
}

function DimensionGrid({ assessmentId }: { assessmentId?: string }) {
  const { data: assessment, isLoading } = useQuery({
    queryKey: ['fundability', 'assessment', assessmentId],
    queryFn: () => fundabilityApi.getAssessment(assessmentId!),
    enabled: !!assessmentId,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const dims = assessment?.dimensions ?? [];
  if (!dims.length) return null;

  const ordered = Object.keys(DIMENSION_DISPLAY)
    .map((key) => dims.find((d) => d.dimension_key === key))
    .filter(Boolean) as typeof dims;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      {ordered.map((d) => (
        <div key={d.dimension_key} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-600 truncate">{DIMENSION_DISPLAY[d.dimension_key] ?? d.dimension_key}</span>
            <span className={cn('font-bold tabular-nums', getScoreColor(d.raw_score))}>
              {d.raw_score.toFixed(0)}
            </span>
          </div>
          <ScoreBar score={d.raw_score} height="h-1" />
        </div>
      ))}
    </div>
  );
}

function EvidenceStat({
  value,
  label,
  accent,
}: {
  value: number;
  label: string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col items-center text-center p-3.5 rounded-xl bg-slate-50 border border-slate-100/80">
      <span className={cn('text-2xl font-black tabular-nums', accent ?? 'text-slate-900')}>{value}</span>
      <span className="text-[11px] text-slate-500 mt-1 leading-tight font-medium">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function StartupOverviewPage() {
  React.useEffect(() => {
    document.title = 'Startup Profile & Diligence Hub | Pitchmic';
  }, []);

  const { isAuthenticated } = useAuth();

  // ── Data queries ───────────────────────────────────────────────────────────
  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ['me-startup-profile'],
    queryFn: () => apiGet<StartupProfileData>('/me/startup-profile/'),
    enabled: isAuthenticated,
  });

  const { data: current, isLoading: loadingCurrent } = useQuery({
    queryKey: ['fundability', 'current'],
    queryFn: fundabilityApi.getCurrent,
    enabled: isAuthenticated,
  });

  const { data: evidenceSummary, isLoading: loadingEvidence } = useQuery({
    queryKey: ['fundability', 'evidence-summary'],
    queryFn: fundabilityApi.getEvidenceSummary,
    enabled: isAuthenticated,
  });

  const { data: founders } = useQuery({ queryKey: ['startups', 'founders'],       queryFn: fundabilityApi.getFounders,       enabled: isAuthenticated });
  const { data: product }  = useQuery({ queryKey: ['startups', 'product-profile'], queryFn: fundabilityApi.getProductProfile, enabled: isAuthenticated });
  const { data: market }   = useQuery({ queryKey: ['startups', 'market-profile'],  queryFn: fundabilityApi.getMarketProfile,  enabled: isAuthenticated });
  const { data: bizModel } = useQuery({ queryKey: ['startups', 'business-model'],  queryFn: fundabilityApi.getBusinessModel,    enabled: isAuthenticated });
  const { data: traction } = useQuery({ queryKey: ['startups', 'traction'],        queryFn: () => fundabilityApi.getTractionMetrics(), enabled: isAuthenticated });

  // ── Derived values ────────────────────────────────────────────────────────
  const companyName   = profile?.company_name ?? current?.company_name ?? 'Your Startup';
  const tagline       = profile?.tagline;
  const industry      = profile?.industry;
  const location      = profile?.location;
  const fundingStage  = profile?.funding_stage ?? null;
  const convictionDisplay = current?.conviction_display ?? 'Evaluating Readiness';

  const score             = current?.overall_score ?? 0;
  const stageDisplay      = current?.inferred_stage_display ?? (fundingStage ? (STAGE_LABELS[fundingStage] || fundingStage) : 'Pre-Seed Stage');
  const assessedAt        = current?.assessed_at;
  const assessmentId      = (current as { id?: string } | undefined)?.id;
  const hasAssessment     = !!(current as { has_assessment?: boolean } | undefined)?.has_assessment;
  const nextAction        = current?.next_best_action ?? null;
  const criticalGaps      = current?.critical_gaps_count ?? 0;
  const contradictions    = current?.deck_contradictions?.length ?? 0;

  const evidencePct      = evidenceSummary?.completeness_pct ?? current?.evidence_completeness_pct ?? 0;
  const evidenceTotal    = evidenceSummary?.total_items ?? 0;
  const evidenceVerified = evidenceSummary?.verified_items ?? 0;
  const needVerification = Math.max(0, evidenceTotal - evidenceVerified - contradictions - criticalGaps);

  // Completeness calculations
  const idC = identityCompletion(profile);
  const fdC = foundersCompletion(founders);
  const pdC = productCompletion(product);
  const mkC = marketCompletion(market);
  const trC = tractionCompletion(traction);
  const bmC = bizModelCompletion(bizModel);

  const profilePct = overallProfilePct([idC, fdC, pdC, mkC, trC, bmC]);
  const fundraisingStatus: SectionStatus = profile?.funding_stage ? 'partial' : 'not_started';

  // 8 Canonical Sections with verified destination URLs
  const SECTIONS = [
    {
      num: '01',
      name: 'Identity',
      href: '/startup/profile',
      icon: Building2,
      desc: 'Company legal setup, location, founded year, and positioning summary',
      status: completionToStatus(idC),
      filled: idC.filled,
      total: idC.total,
    },
    {
      num: '02',
      name: 'Founders & Team',
      href: '/startup/founders',
      icon: Users,
      desc: 'Founding roster, equity commitment, executive roles, and market fit',
      status: completionToStatus(fdC),
      filled: fdC.filled,
      total: fdC.total,
    },
    {
      num: '03',
      name: 'Product',
      href: '/startup/product',
      icon: Target,
      desc: 'Specific problem statement, concrete solution, development status, and moat',
      status: completionToStatus(pdC),
      filled: pdC.filled,
      total: pdC.total,
    },
    {
      num: '04',
      name: 'Market',
      href: '/startup/market',
      icon: Globe2,
      desc: 'Documented TAM/SAM/SOM, primary geography, and competitor positioning',
      status: completionToStatus(mkC),
      filled: mkC.filled,
      total: mkC.total,
    },
    {
      num: '05',
      name: 'Traction',
      href: '/startup/traction',
      icon: TrendingUp,
      desc: 'Customer accounts, recurring revenue signals, and verified growth telemetry',
      status: completionToStatus(trC),
      filled: trC.filled,
      total: trC.total,
    },
    {
      num: '06',
      name: 'Business Model',
      href: '/startup/business-model',
      icon: BarChart2,
      desc: 'Revenue streams, sales model, pricing tiers, and path to profitability',
      status: completionToStatus(bmC),
      filled: bmC.filled,
      total: bmC.total,
    },
    {
      num: '07',
      name: 'Financials',
      href: '/startup/financials',
      icon: DollarSign,
      desc: 'Runway projections, monthly burn rate, and historical audit statements',
      status: 'missing' as SectionStatus,
      filled: 0,
      total: 3,
    },
    {
      num: '08',
      name: 'Fundraising',
      href: '/startup/fundraising',
      icon: Rocket,
      desc: 'Target raise amount, investment instrument (SAFE/Equity), and cap table plan',
      status: fundraisingStatus,
      filled: profile?.funding_stage ? 1 : 0,
      total: 3,
    },
  ];

  const metaParts = [industry, location, stageDisplay].filter(Boolean);
  const initials  = companyName !== 'Your Startup' && companyName !== '--' ? companyName.charAt(0).toUpperCase() : 'S';
  const updatedDays = daysAgo(assessedAt);

  const profileStatusLabel =
    profilePct >= 75 ? 'Complete' :
    profilePct >= 40 ? 'In Progress' :
    profilePct > 0  ? 'Getting Started' :
    'Not Started';

  const evidenceStatusLabel =
    evidencePct >= 75 ? 'Strong Evidence' :
    evidencePct >= 40 ? 'Needs Additional Proof' :
    'Early Evidence';

  const loading = loadingProfile || loadingCurrent;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <JsonLd id="startup-hub-schema" data={{
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'BreadcrumbList', itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
            { '@type': 'ListItem', position: 2, name: 'Startup Profile', item: '/startup' },
          ]},
        ],
      }} />

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Startup Command Center
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Hub
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Build your evidence-backed diligence profile, resolve fatal gaps, and calibrate for institutional capital.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href="/startup/apply">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs font-medium border-indigo-200 text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50">
              <Building2 className="h-3.5 w-3.5 text-indigo-500" />
              Accelerator Programs
            </Button>
          </Link>
          <Link href="/fundability">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs font-medium border-slate-300">
              <Activity className="h-3.5 w-3.5 text-brand-orange-500" />
              Full Assessment
            </Button>
          </Link>
          <Link href="/startup/profile">
            <Button size="sm" className="gap-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white">
              <Pencil className="h-3.5 w-3.5" />
              Edit Identity
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Identity Hero Card ───────────────────────────────────────────── */}
      <Card className="border-slate-200 shadow-xs overflow-hidden">
        <CardContent className="p-6 sm:p-7">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start sm:items-center gap-5">
              {/* Logo / Avatar */}
              <div className="h-16 w-16 sm:h-20 sm:w-20 shrink-0 rounded-2xl bg-gradient-to-br from-brand-orange-500 to-brand-orange-700 flex items-center justify-center overflow-hidden shadow-sm ring-1 ring-black/5">
                {profile?.logo_url ? (
                  <img src={profile.logo_url} alt={companyName} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-3xl font-black text-white">{initials}</span>
                )}
              </div>

              {/* Title & Metadata */}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                    {loading ? <span className="inline-block h-7 w-40 bg-slate-100 rounded animate-pulse" /> : companyName}
                  </h2>
                  <Badge variant="outline" className="text-xs bg-slate-50 border-slate-200 text-slate-700">
                    {stageDisplay}
                  </Badge>
                </div>

                {metaParts.length > 0 && (
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    {metaParts.join(' · ')}
                  </p>
                )}

                {tagline ? (
                  <p className="text-xs sm:text-sm text-slate-600 mt-1.5 italic">
                    &ldquo;{tagline}&rdquo;
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 mt-1.5">
                    No tagline set. Add your core 1-liner in Company Identity.
                  </p>
                )}
              </div>
            </div>

            {/* Quick Status Chips */}
            <div className="flex flex-wrap md:flex-col items-start md:items-end gap-2 shrink-0 border-t md:border-t-0 pt-4 md:pt-0 border-slate-100">
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                <FolderLock className="h-3.5 w-3.5 text-brand-orange-500" />
                Diligence Vault: <strong className="text-slate-900">{evidenceVerified}/{evidenceTotal} Verified</strong>
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                Diligence Tier: <strong className="text-slate-900">{convictionDisplay}</strong>
              </span>
              {updatedDays !== null && (
                <span className="text-[11px] text-slate-400">
                  Evaluated {updatedDays === 0 ? 'today' : updatedDays === 1 ? 'yesterday' : `${updatedDays} days ago`}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Executive Diagnostics: Score Overview & Next Move (12-Col Grid) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        
        {/* Fundability Diagnostic Card (7 cols) */}
        <Card className="lg:col-span-7 border-slate-200 shadow-xs">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Readiness & Diligence Score</p>
                <h3 className="text-base font-bold text-slate-900">Fundability Diagnostic Overview</h3>
              </div>
              <Link href="/fundability" className="text-xs font-semibold text-brand-orange-600 hover:text-brand-orange-700 flex items-center gap-0.5">
                Full Breakdown <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-6 mb-6">
              <FundabilityGauge score={score} />
              <div className="flex-1 w-full space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-700">Profile Completeness</span>
                    <span className="font-bold tabular-nums text-slate-900">{profilePct}% ({profileStatusLabel})</span>
                  </div>
                  <ScoreBar score={profilePct} height="h-2" />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-700">Evidence Documentation</span>
                    <span className="font-bold tabular-nums text-slate-900">{evidencePct}% ({evidenceStatusLabel})</span>
                  </div>
                  <ScoreBar score={evidencePct} height="h-2" />
                </div>
                <div className="pt-1 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Critical Gaps: <strong className="text-rose-600 font-bold">{criticalGaps}</strong></span>
                  <span>Contradictions: <strong className="text-amber-600 font-bold">{contradictions}</strong></span>
                  <span>Primary Constraint: <strong className="text-slate-800">{criticalGaps > 0 ? 'Evidence Depth' : 'Initial Trajectory'}</strong></span>
                </div>
              </div>
            </div>

            {/* 8-Dimension Mini Breakdown */}
            <div className="border-t border-slate-100 pt-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                8-Dimension Calibrated Indicators
              </p>
              {hasAssessment ? (
                <DimensionGrid assessmentId={assessmentId} />
              ) : (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-4 text-center">
                  <p className="text-xs text-slate-500">
                    Complete your sections below to unlock calibrated dimension telemetry.
                  </p>
                  <Link href="/fundability" className="mt-2 inline-block">
                    <Button variant="outline" size="sm" className="text-xs h-8">
                      Run Diagnostic Assessment
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Next Best Move (5 cols) */}
        <Card className="lg:col-span-5 border-slate-200 shadow-xs bg-gradient-to-br from-slate-50/80 to-white flex flex-col justify-between">
          <CardContent className="p-6 flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Priority Action Engine
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-orange-50 px-2.5 py-0.5 text-[10px] font-bold text-brand-orange-700 border border-brand-orange-200">
                  <Zap className="h-3 w-3 text-brand-orange-500" />
                  High Impact
                </span>
              </div>

              {loadingCurrent ? (
                <div className="py-12 flex items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-orange-500" />
                </div>
              ) : nextAction ? (
                <div className="space-y-4">
                  <h4 className="text-base font-bold text-slate-900 leading-snug">
                    {nextAction.title}
                  </h4>

                  <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 text-xs text-slate-600 leading-relaxed shadow-2xs">
                    <p className="font-semibold text-slate-800 text-[11px] uppercase tracking-wider mb-1">
                      Why Investors Care
                    </p>
                    Your {DIMENSION_DISPLAY[nextAction.dimension_key] ?? nextAction.dimension_key} evidence represents your largest current variance. Providing verified proofs directly strengthens institutional underwriting.
                  </div>

                  <div className="flex items-center justify-between text-xs py-1">
                    <span className="text-slate-500">Target Dimension:</span>
                    <strong className="text-slate-900">
                      {DIMENSION_DISPLAY[nextAction.dimension_key] ?? nextAction.dimension_key}
                    </strong>
                  </div>

                  <div className="flex items-center justify-between text-xs py-1 border-t border-slate-100">
                    <span className="text-slate-500">Readiness Impact:</span>
                    <span className="font-semibold text-emerald-600">+4 to +10 Score Potential</span>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center space-y-2">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
                  <p className="text-sm font-bold text-slate-800">No Critical Gaps Flagged</p>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    Your baseline profile has strong coverage across primary diligence categories.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-6 mt-4 border-t border-slate-100">
              <Link href="/fundability?tab=plan" className="w-full block">
                <Button className="w-full h-10 bg-brand-orange-600 hover:bg-brand-orange-700 text-white font-semibold text-xs shadow-xs gap-1.5">
                  Execute Recommendation
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 8 Profile Sections (Unified Command Center Grid) ───────────────── */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Startup Diligence Profile (8 Sections)
            </h3>
            <p className="text-xs text-slate-500">
              Complete each section to provide verified evidence and pass institutional investor review.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-600">
            {profilePct}% Total Completed
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <Link
                key={section.name}
                href={section.href}
                className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs hover:border-brand-orange-300 hover:shadow-md transition-all duration-200 relative overflow-hidden"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-black text-slate-300 tracking-widest">
                      {section.num}
                    </span>
                    <StatusBadge status={section.status} />
                  </div>

                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="h-8 w-8 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-brand-orange-50 group-hover:text-brand-orange-600 flex items-center justify-center transition-colors shrink-0">
                      <Icon className="h-4 w-4" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 group-hover:text-brand-orange-600 transition-colors">
                      {section.name}
                    </h4>
                  </div>

                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-4">
                    {section.desc}
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-xs text-slate-500">
                  <span className="text-[11px] font-medium text-slate-600">
                    {section.filled}/{section.total} fields
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-brand-orange-600 text-xs group-hover:translate-x-0.5 transition-transform">
                    Edit <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Evidence Vault Telemetry Strip ─────────────────────────────────── */}
      <Card className="border-slate-200 shadow-xs">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Evidence Documentation Health
              </p>
              <h3 className="text-base font-bold text-slate-900">
                Diligence Proofs & Verifications
              </h3>
            </div>
            <Link href="/evidence">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs font-semibold border-slate-300">
                <FolderLock className="h-3.5 w-3.5 text-brand-orange-500" />
                Open Evidence Vault
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <EvidenceStat
              value={evidenceTotal}
              label="Claims Identified"
              accent="text-slate-900"
            />
            <EvidenceStat
              value={evidenceVerified}
              label="Supported Proofs"
              accent="text-emerald-600"
            />
            <EvidenceStat
              value={criticalGaps}
              label="Missing Documentation"
              accent="text-rose-600"
            />
            <EvidenceStat
              value={contradictions}
              label="Contradictions Flagged"
              accent="text-amber-600"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
