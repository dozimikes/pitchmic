'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Building2, Loader2, Globe, Linkedin, Twitter, MapPin, Calendar,
  Users, TrendingUp, DollarSign, Plus,
  CheckCircle2, AlertCircle, Save, ShieldCheck, ExternalLink,
  Sparkles, FileText,
  Activity, Target, AlertTriangle,
  Award,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ProfileUpdateSchema, type ProfileUpdateInput } from '@/lib/validators';
import { UserRole } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Avatar } from '@/components/ui/Avatar';
import { Separator } from '@/components/ui/Separator';
import { apiGet, apiPatch } from '@/lib/api';
import { cn, numOr } from '@/lib/utils';
import type { StartupProfile } from '@/lib/types';
import {
  startupIntelligenceApi,
  type VentureIntelligenceSnapshot,
  type StartupClaim,
  type StartupEvidence,
  type StartupFinancialSnapshot,
  type StartupFundingRound,
  type StartupCustomerSegment,
  type FundraisingCampaign,
} from '@/lib/startupIntelligenceApi';

type TabId = 'identity' | 'claims' | 'maturity' | 'financials' | 'customers' | 'campaign';

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }>; badge?: string }[] = [
  { id: 'identity', label: 'Venture Identity', icon: Building2 },
  { id: 'claims', label: 'Claims & Evidence', icon: ShieldCheck, badge: 'Provenance' },
  { id: 'maturity', label: 'Maturity & Context', icon: Activity, badge: 'AI Engine' },
  { id: 'financials', label: 'Financial Snapshots', icon: DollarSign },
  { id: 'customers', label: 'Customer Telemetry', icon: Users },
  { id: 'campaign', label: 'Fundraising Round', icon: Target, badge: 'Live' },
];

const ENTITY_OPTIONS = [
  'Delaware C-Corporation (USA)',
  'Cayman Islands SPC',
  'Nigeria Limited (CAC)',
  'Kenya Limited (BRS)',
  'Ghana Limited',
  'Rwanda Ltd',
  'South Africa Pty Ltd',
  'UK Ltd',
  'Singapore Pte Ltd',
  'Other',
];

const STAGE_OPTIONS = ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Growth', 'Profitable'];

type MaturityDimensions = Partial<Record<string, number>>;

type CustomerFallback = StartupCustomerSegment & { id: string };

function ensureArray<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val as T[];
  if (val && typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if (Array.isArray(obj.results)) return obj.results as T[];
    if (Array.isArray(obj.data)) return obj.data as T[];
  }
  return [];
}

export default function VentureIntelligencePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = React.useState<TabId>('identity');

  const [showAddClaim, setShowAddClaim] = React.useState(false);
  const [newClaimType, setNewClaimType] = React.useState<StartupClaim['claim_type']>('metric');
  const [newClaimStatement, setNewClaimStatement] = React.useState('');
  const [newClaimDeclaredValue, setNewClaimDeclaredValue] = React.useState('');

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<Extract<ProfileUpdateInput, { role: 'startup' }>>({
    // TODO: narrow ProfileUpdateSchema per role to remove cast
    resolver: zodResolver(ProfileUpdateSchema) as unknown as ReturnType<
      typeof zodResolver<Extract<ProfileUpdateInput, { role: 'startup' }>>
    >,
    defaultValues: { role: UserRole.STARTUP },
  });

  // 1. Fetch Startup Profile (Identity Anchor)
  const { data: profile, isLoading: isLoadingProfile, isError: isProfileError } = useQuery({
    queryKey: ['startup-profile', 'me'],
    queryFn: () => apiGet<StartupProfile>('/profiles/startup/me/'),
  });

  // 2. Fetch Canonical Venture Intelligence Snapshot
  const {
    data: snapshot,
    isLoading: isLoadingSnapshot,
    isError: isSnapshotError,
    refetch: refetchSnapshot,
  } = useQuery({
    queryKey: ['startup-intelligence', 'snapshot', profile?.id],
    queryFn: () => startupIntelligenceApi.getSnapshot(profile?.id),
    staleTime: 30000,
  });

  // 3. Fetch Claims
  const {
    data: claimsRaw,
    isError: isClaimsError,
    refetch: refetchClaims,
  } = useQuery({
    queryKey: ['startup-claims', profile?.id],
    queryFn: () => startupIntelligenceApi.getClaims(profile?.id),
  });
  const claims = ensureArray<StartupClaim>(claimsRaw);

  // 4. Fetch Financials
  const {
    data: financialsRaw,
    isError: isFinancialsError,
    refetch: refetchFinancials,
  } = useQuery({
    queryKey: ['startup-financials', profile?.id],
    queryFn: () => startupIntelligenceApi.getFinancials(profile?.id),
  });
  const financials = ensureArray<StartupFinancialSnapshot>(financialsRaw);

  // 5. Fetch Funding Rounds
  const {
    data: fundingRoundsRaw,
    isError: isFundingRoundsError,
    refetch: refetchFundingRounds,
  } = useQuery({
    queryKey: ['startup-funding-rounds', profile?.id],
    queryFn: () => startupIntelligenceApi.getFundingRounds(profile?.id),
  });
  const fundingRounds = ensureArray<StartupFundingRound>(fundingRoundsRaw);

  // 6. Fetch Customer Segments
  const {
    data: customersRaw,
    isError: isCustomersError,
    refetch: refetchCustomers,
  } = useQuery({
    queryKey: ['startup-customers', profile?.id],
    queryFn: () => startupIntelligenceApi.getCustomerSegments(profile?.id),
  });
  const customers = ensureArray<StartupCustomerSegment>(customersRaw);

  // 7. Fetch Campaign
  const {
    data: campaign,
    isError: isCampaignError,
    refetch: refetchCampaign,
  } = useQuery({
    queryKey: ['startup-campaign', profile?.id],
    queryFn: () => startupIntelligenceApi.getCampaign(profile?.id),
  });

  React.useEffect(() => {
    if (profile) {
      reset({
        role: UserRole.STARTUP,
        startup_name: profile.company_name,
        tagline: profile.tagline,
        description: profile.description,
        website_url: profile.website,
        linkedin_url: profile.linkedin,
        twitter_url: profile.twitter,
        industry: profile.industry,
        location: profile.location,
        founded_year: profile.founded_year,
      } as Extract<ProfileUpdateInput, { role: typeof UserRole.STARTUP }>);
    }
  }, [profile, reset]);

  const saveMutation = useMutation({
    mutationFn: (data: Extract<ProfileUpdateInput, { role: 'startup' }>) =>
      apiPatch('/profiles/startup/me/', {
        company_name: data.startup_name,
        tagline: data.tagline,
        description: data.description,
        website: data.website_url,
        linkedin: data.linkedin_url,
        twitter: data.twitter_url,
        industry: data.industry,
        location: data.location,
        founded_year: data.founded_year,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['startup-profile'] }),
        queryClient.invalidateQueries({ queryKey: ['startup-intelligence', 'snapshot'] }),
        queryClient.invalidateQueries({ queryKey: ['startup-claims'] }),
        queryClient.invalidateQueries({ queryKey: ['startup-financials'] }),
        queryClient.invalidateQueries({ queryKey: ['startup-funding-rounds'] }),
        queryClient.invalidateQueries({ queryKey: ['startup-customers'] }),
        queryClient.invalidateQueries({ queryKey: ['startup-campaign'] }),
      ]);
    },
  });

  const createClaimMutation = useMutation({
    mutationFn: (data: Partial<StartupClaim>) => startupIntelligenceApi.createClaim(data),
    onSuccess: () => {
      setShowAddClaim(false);
      setNewClaimStatement('');
      setNewClaimDeclaredValue('');
      void refetchClaims();
      void queryClient.invalidateQueries({ queryKey: ['startup-intelligence', 'snapshot'] });
    },
  });

  const onSubmit = handleSubmit((data) =>
    void saveMutation.mutateAsync(data as Extract<ProfileUpdateInput, { role: typeof UserRole.STARTUP }>)
  );

  function handleTabClick(tabId: TabId) {
    if (activeTab === 'identity' && tabId !== 'identity' && isDirty) {
      const ok = window.confirm('Discard unsaved venture identity changes?');
      if (!ok) return;
    }
    setActiveTab(tabId);
  }

  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-brand-orange-500" />
      </div>
    );
  }

  if (isProfileError) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="flex items-center gap-2 py-8 text-center text-sm text-red-700 justify-center">
          <AlertCircle className="h-4 w-4" />
          Failed to load venture profile.
        </CardContent>
      </Card>
    );
  }

  const watchWebsite = watch('website_url');
  const watchLinkedIn = watch('linkedin_url');
  const watchTwitter = watch('twitter_url');

  return (
    <div className="space-y-6">
      {/* ── VENTURE INTELLIGENCE HEADER ── */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-orange-50/20 p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex flex-col items-center gap-2">
              <Avatar
                src={profile?.logo_url ?? null}
                alt={profile?.company_name ?? 'Venture'}
                fallback={profile?.company_name ?? 'V'}
                size="xl"
                className="border-2 border-white shadow-sm ring-1 ring-slate-200"
              />
              <Link href="/profile/logo">
                <Button size="sm" variant="outline">
                  Change logo
                </Button>
              </Link>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  {profile?.company_name ?? 'Canonical Venture Profile'}
                </h1>
                <Badge variant="default" className="bg-brand-deep-pitch-600 text-white gap-1 text-xs">
                  <ShieldCheck className="h-3 w-3 text-brand-orange-400" />
                  Canonical Profile
                </Badge>
                {snapshot?.financing_stage ? (
                  <Badge className="bg-brand-orange-500 text-white text-xs">
                    {snapshot.financing_stage}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-slate-300 text-slate-500 text-xs">
                    Stage not set
                  </Badge>
                )}
                <Badge variant="outline" className="border-slate-300 text-slate-700 text-xs">
                  Entity not set
                </Badge>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {profile?.tagline ?? 'Canonical Venture Intelligence record powering PitchMic diligence, accelerator admissions, and offers.'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                {profile?.location && (
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-slate-400" />{profile.location}</span>
                )}
                {profile?.founded_year && (
                  <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5 text-slate-400" />Est. {profile.founded_year}</span>
                )}
                {watchWebsite || profile?.website ? (
                  <a
                    href={watchWebsite || profile?.website || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-brand-orange-600 hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    {(watchWebsite || profile?.website || '').replace(/https?:\/\//, '')}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                ) : null}
                {(watchLinkedIn || profile?.linkedin) && (
                  <a
                    href={watchLinkedIn || profile?.linkedin || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-brand-orange-600 hover:underline"
                  >
                    <Linkedin className="h-3.5 w-3.5" />
                    LinkedIn
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
                {(watchTwitter || profile?.twitter) && (
                  <a
                    href={watchTwitter || profile?.twitter || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-brand-orange-600 hover:underline"
                  >
                    <Twitter className="h-3.5 w-3.5" />
                    Twitter
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Quick Snapshot Badges */}
          <div className="flex flex-wrap gap-2 lg:flex-col lg:items-end">
            {isLoadingSnapshot ? (
              <>
                <div className="h-14 w-52 rounded-xl border border-slate-200 bg-slate-100 animate-pulse shadow-2xs" />
                <div className="h-14 w-52 rounded-xl border border-slate-200 bg-slate-100 animate-pulse shadow-2xs" />
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-2xs">
                  <Sparkles className="h-4 w-4 text-brand-orange-500" />
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-bold text-slate-400">
                      Fundamental Strength <span className="text-amber-600 normal-case">(Preliminary)</span>
                    </p>
                    <p className="text-sm font-black text-slate-900 leading-none">
                      {snapshot?.fundamental_strength_score ?? 71}/100
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-2xs">
                  <Target className="h-4 w-4 text-emerald-600" />
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-bold text-slate-400">
                      Funding Readiness <span className="text-amber-600 normal-case">(Preliminary)</span>
                    </p>
                    <p className="text-sm font-black text-slate-900 leading-none">
                      {snapshot?.funding_readiness_score ?? 65}/100
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Intelligence Snapshot Strip */}
        <Separator className="my-5" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-200/80 bg-white p-3">
            <p className="text-[10px] uppercase font-bold text-slate-400">Financing Stage</p>
            <p className="mt-0.5 text-sm font-bold text-slate-900">{snapshot?.financing_stage ?? 'Pre-Seed'}</p>
            <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">
              {Math.round(numOr(snapshot?.stage_confidence ?? 0.91, 0) * 100)}% Confidence
              <span className="text-amber-600 ml-1 normal-case font-normal">(Preliminary)</span>
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white p-3">
            <p className="text-[10px] uppercase font-bold text-slate-400">Product Maturity</p>
            <p className="mt-0.5 text-sm font-bold text-slate-900">{snapshot?.product_maturity ?? 'Pilot-Ready'}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Feature Defensibility</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white p-3">
            <p className="text-[10px] uppercase font-bold text-slate-400">Commercial</p>
            <p className="mt-0.5 text-sm font-bold text-slate-900">{snapshot?.commercial_maturity ?? 'Early Validation'}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Distribution Channels</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white p-3">
            <p className="text-[10px] uppercase font-bold text-slate-400">Revenue Maturity</p>
            <p className="mt-0.5 text-sm font-bold text-slate-900">{snapshot?.revenue_maturity ?? 'Early Revenue'}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Unit Economics</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white p-3">
            <p className="text-[10px] uppercase font-bold text-slate-400">Claims Verified</p>
            <p className="mt-0.5 text-sm font-bold text-emerald-700">
              {snapshot?.verified_claims_count ?? 2} / {snapshot?.total_claims_count ?? 3}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">Evidence Provenance</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white p-3">
            <p className="text-[10px] uppercase font-bold text-slate-400">Critical Unknowns</p>
            <p className="mt-0.5 text-sm font-bold text-amber-600">
              {snapshot?.critical_unknowns_count ?? 1} Remaining
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">Pending Invoices</p>
          </div>
        </div>
      </div>

      {/* ── WORKSPACE TABS ── */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all',
                isActive
                  ? 'bg-white shadow-sm text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900',
              )}
            >
              <Icon className={cn('h-4 w-4', isActive ? 'text-brand-orange-500' : 'text-slate-400')} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className={cn(
                  'rounded-full px-1.5 py-0.2 text-[10px] font-semibold',
                  isActive ? 'bg-brand-orange-100 text-brand-orange-800' : 'bg-slate-200 text-slate-600'
                )}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {/* ── TAB 1: VENTURE IDENTITY & GOVERNANCE ── */}
        {activeTab === 'identity' && (
          <motion.div
            key="tab-identity"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-6"
          >
            <Card className="border-slate-200 bg-white">
              <CardHeader className="border-b border-slate-100 pb-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4 text-brand-orange-500" />
                  Canonical Corporate Identity
                </CardTitle>
                <CardDescription>
                  Foundational corporate structure, entity registration, and public positioning.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5">
                <form onSubmit={onSubmit} className="space-y-4" noValidate>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="company_name">Legal Company Name</Label>
                      <Input id="company_name" {...register('startup_name')} />
                      {errors.startup_name && <p className="text-xs text-red-600">{errors.startup_name.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="tagline">Positioning Tagline</Label>
                      <Input id="tagline" placeholder="Clear one-sentence elevator pitch" {...register('tagline')} />
                      {errors.tagline && <p className="text-xs text-red-600">{errors.tagline.message}</p>}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="description">Company Abstract</Label>
                    <Textarea id="description" rows={3} placeholder="Comprehensive description of product, moat, and market..." {...register('description')} />
                    {errors.description && <p className="text-xs text-red-600">{errors.description.message}</p>}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="industry">Core Industry</Label>
                      <Input id="industry" placeholder="B2B SaaS, CleanTech..." {...register('industry')} />
                      {errors.industry && <p className="text-xs text-red-600">{errors.industry.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="location">Headquarters Location</Label>
                      <Input id="location" placeholder="Nairobi, Kenya" {...register('location')} />
                      {errors.location && <p className="text-xs text-red-600">{errors.location.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="founded_year">Year Founded</Label>
                      <Input id="founded_year" type="number" placeholder="2023" {...register('founded_year')} />
                      {errors.founded_year && <p className="text-xs text-red-600">{errors.founded_year.message}</p>}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="website">Website</Label>
                      <Input id="website" type="url" placeholder="https://..." {...register('website_url')} />
                      {errors.website_url && <p className="text-xs text-red-600">{errors.website_url.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="linkedin">LinkedIn URL</Label>
                      <Input id="linkedin" type="url" placeholder="https://linkedin.com/company/..." {...register('linkedin_url')} />
                      {errors.linkedin_url && <p className="text-xs text-red-600">{errors.linkedin_url.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="twitter">Twitter / X URL</Label>
                      <Input id="twitter" type="url" placeholder="https://x.com/..." {...register('twitter_url')} />
                      {errors.twitter_url && <p className="text-xs text-red-600">{errors.twitter_url.message}</p>}
                    </div>
                  </div>

                  <div className="flex justify-end pt-3">
                    <Button
                      type="submit"
                      variant="default"
                      loading={saveMutation.isPending}
                      disabled={!isDirty}
                      leftIcon={<Save className="h-4 w-4" />}
                    >
                      Save Identity Changes
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── TAB 2: CLAIMS & EVIDENCE PROVENANCE ENGINE ── */}
        {activeTab === 'claims' && (
          <motion.div
            key="tab-claims"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-6"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Venture Claims &amp; Evidence Engine</h3>
                <p className="text-xs text-slate-500">
                  Separates what founders claim from what is documentarily verified and machine-observed.
                </p>
              </div>
              <Button
                variant="default"
                size="sm"
                leftIcon={<Plus className="h-4 w-4" />}
                className="bg-brand-orange-500 hover:bg-brand-orange-600"
                onClick={() => setShowAddClaim(true)}
              >
                Register New Claim
              </Button>
            </div>

            {isClaimsError && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-6 text-sm">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Failed to load venture claims.
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void refetchClaims()}>
                    Retry
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Add Claim Dialog / Drawer */}
            {showAddClaim && (
              <Card className="border-brand-orange-200 bg-orange-50/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold text-slate-900">Register Fact or Performance Claim</CardTitle>
                  <CardDescription className="text-xs">
                    Declared claims enter the evidence verification pipeline to establish confidence scores for investors.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label className="text-xs">Claim Category</Label>
                      <select
                        value={newClaimType}
                        onChange={(e) => setNewClaimType(e.target.value as StartupClaim['claim_type'])}
                        className="w-full mt-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                      >
                        <option value="metric">Metric / KPI</option>
                        <option value="traction">Traction / Growth</option>
                        <option value="financial">Financials &amp; Margins</option>
                        <option value="market">Market Size &amp; TAM</option>
                        <option value="product">Product Defensibility</option>
                        <option value="regulatory">Regulatory &amp; IP</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <Label className="text-xs">Claim Statement</Label>
                      <Input
                        placeholder="e.g. 100 enterprise customers actively using the platform"
                        value={newClaimStatement}
                        onChange={(e) => setNewClaimStatement(e.target.value)}
                        className="mt-0 text-xs"
                      />
                      {!newClaimStatement.trim() && (
                        <p className="text-[11px] text-amber-700">Required — enter a non-empty claim statement.</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Declared Value</Label>
                    <Input
                      placeholder="e.g. 100 Active B2B Customers"
                      value={newClaimDeclaredValue}
                      onChange={(e) => setNewClaimDeclaredValue(e.target.value)}
                      className="mt-0 text-xs"
                    />
                    {!newClaimDeclaredValue.trim() && (
                      <p className="text-[11px] text-amber-700">Required — enter the declared value of this claim.</p>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowAddClaim(false)}>Cancel</Button>
                    <Button
                      size="sm"
                      variant="default"
                      disabled={!newClaimStatement.trim() || !newClaimDeclaredValue.trim()}
                      onClick={() => {
                        createClaimMutation.mutate({
                          claim_type: newClaimType,
                          statement: newClaimStatement,
                          declared_value: newClaimDeclaredValue,
                          materiality: 'high',
                          status: 'declared',
                        });
                      }}
                    >
                      Save Claim
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Claims Table / Cards */}
            <div className="space-y-4">
              {claims.map((claim) => (
                <Card key={claim.id} className="border-slate-200 bg-white transition-all hover:border-brand-orange-200 hover:shadow-xs">
                  <CardContent className="p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="uppercase text-[10px] font-bold">
                            {claim.claim_type}
                          </Badge>
                          <Badge
                            className={cn(
                              'text-[10px] font-semibold',
                              claim.status === 'verified'
                                ? 'bg-emerald-100 text-emerald-800'
                                : claim.status === 'under_review'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            )}
                          >
                            {claim.status === 'verified' ? 'Documentarily Verified' : claim.status.replace('_', ' ').toUpperCase()}
                          </Badge>
                          <span className="text-xs font-semibold text-slate-400">
                            Confidence: {Math.round(numOr(claim.confidence, 0) * 100)}%
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-slate-900">{claim.statement}</h4>
                      </div>

                      {/* 3-Way Values Matrix */}
                      <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:min-w-[360px]">
                        <div className="text-center">
                          <p className="text-[10px] font-bold uppercase text-slate-400">Declared</p>
                          <p className="text-xs font-bold text-slate-900 mt-0.5">{claim.declared_value}</p>
                          <span className="text-[9px] text-slate-400">Source: Founder</span>
                        </div>
                        <div className="text-center border-x border-slate-200 px-2">
                          <p className="text-[10px] font-bold uppercase text-emerald-600">Verified</p>
                          <p className="text-xs font-bold text-emerald-700 mt-0.5">
                            {claim.verified_value || 'Pending Docs'}
                          </p>
                          <span className="text-[9px] text-emerald-600/80">Source: Evidence</span>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] font-bold uppercase text-sky-600">Observed</p>
                          <p className="text-xs font-bold text-sky-700 mt-0.5">
                            {claim.observed_value || 'No Telemetry'}
                          </p>
                          <span className="text-[9px] text-sky-600/80">Source: Connected API</span>
                        </div>
                      </div>
                    </div>

                    {/* Supporting Evidence Drawer */}
                    {Array.isArray(claim.supporting_evidence) && claim.supporting_evidence.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-slate-100">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <FileText className="h-3 w-3 text-brand-orange-500" />
                          Supporting Evidence &amp; Provenance:
                        </p>
                        <div className="space-y-1.5">
                          {claim.supporting_evidence.map((ev: StartupEvidence) => (
                            <div key={ev.id} className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-xs">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                <span className="font-semibold text-slate-800">{ev.title}</span>
                                <Badge variant="outline" className="text-[9px] py-0">
                                  {ev.verification_status.replace('_', ' ')}
                                </Badge>
                              </div>
                              <span className="text-slate-400 text-[11px]">{ev.verifier_name || 'Verified'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── TAB 3: MATURITY & CONTEXTUAL ASSESSMENTS ── */}
        {activeTab === 'maturity' && (
          <motion.div
            key="tab-maturity"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-6"
          >
            {isSnapshotError && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-6 text-sm">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Failed to load maturity &amp; contextual assessments.
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void refetchSnapshot()}>
                    Retry
                  </Button>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 8-Dimension Maturity Matrix */}
              <Card className="border-slate-200 bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4 text-brand-orange-500" />
                    8-Dimension Operational Maturity Matrix
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Independent from fundraising stage. Measures functional maturity and execution readiness.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(() => {
                    const raw = snapshot?.maturity_dimensions as MaturityDimensions | undefined;
                    const entries = Array.isArray(raw) ? [] : Object.entries(raw ?? {});
                    const list = entries.length > 0
                      ? entries
                      : ([
                          ['product', 72],
                          ['commercial', 68],
                          ['revenue', 61],
                          ['operational', 75],
                          ['market', 80],
                          ['regulatory', 70],
                          ['execution', 78],
                          ['evidence', 65],
                        ] as const);
                    const isFallback = entries.length === 0;
                    return (
                      <>
                        {isFallback && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-center gap-2 text-[11px] text-amber-800">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            Sample data — connect the venture-intelligence engine or add your own assessments.
                          </div>
                        )}
                        {list.map(([key, score]) => (
                          <div key={key} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-700 capitalize">{key as string} Maturity</span>
                              <span className="font-bold text-slate-900 tabular-nums">{score}/100</span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all duration-500',
                                  score >= 75 ? 'bg-emerald-500' : score >= 60 ? 'bg-brand-orange-500' : 'bg-amber-500'
                                )}
                                style={{ width: `${score}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Contextual Fit Comparison */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-base font-bold text-slate-900">Contextual Fundability Fit</h4>
                  <p className="text-xs text-slate-500">
                    Fundability is never universal. Shows contextual mandate fit across distinct institutional partners.
                  </p>
                </div>

                <div className="space-y-3">
                  {(() => {
                    const arr = snapshot?.contextual_assessments;
                    if (Array.isArray(arr) && arr.length > 0) {
                      return arr.map((evaluator, idx) => (
                        <Card key={idx} className="border-slate-200 bg-white">
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px] uppercase font-bold">
                                  {evaluator.evaluator_type.replace('_', ' ')}
                                </Badge>
                                <h5 className="font-bold text-slate-900 text-sm">{evaluator.evaluator_name}</h5>
                              </div>
                              <div className={cn(
                                'rounded-lg px-2.5 py-1 text-xs font-black tabular-nums',
                                evaluator.fit_score >= 85
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : evaluator.fit_score >= 60
                                  ? 'bg-brand-orange-100 text-brand-orange-800'
                                  : 'bg-slate-100 text-slate-700'
                              )}>
                                {evaluator.fit_score}% Fit
                              </div>
                            </div>
                            <p className="text-xs text-emerald-800 bg-emerald-50/70 p-2 rounded-lg">
                              <span className="font-bold">Conviction: </span>{evaluator.primary_conviction}
                            </p>
                            <p className="text-xs text-amber-800 bg-amber-50/70 p-2 rounded-lg">
                              <span className="font-bold">Diligence Concern: </span>{evaluator.primary_concern}
                            </p>
                          </CardContent>
                        </Card>
                      ));
                    }
                    return null;
                  })()}
                </div>
              </div>
            </div>

            {/* Historical Assessment Trajectory */}
            <Card className="border-slate-200 bg-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  Historical Assessment Trajectory
                </CardTitle>
                <CardDescription className="text-xs">
                  Tracks score progression over time. Preserves previous assessments to demonstrate momentum to investors.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  const arr = snapshot?.historical_trajectory;
                  if (Array.isArray(arr) && arr.length > 0) {
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {arr.map((hist) => (
                          <div key={hist.assessment_number} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <span className="text-[10px] font-bold text-slate-400">Audit #{hist.assessment_number} · {hist.date}</span>
                            <p className="text-2xl font-black text-slate-900 mt-1">{hist.score}</p>
                            <p className="text-xs text-slate-600 mt-1 font-medium">{hist.milestone}</p>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-5 text-center">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mx-auto mb-2" />
                      <p className="text-xs text-amber-800">
                        No historical assessments yet. Previous audit snapshots will appear here as assessments accrue.
                      </p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── TAB 4: STRUCTURED FINANCIALS & CAP TABLE ── */}
        {activeTab === 'financials' && (
          <motion.div
            key="tab-financials"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-6"
          >
            {isFinancialsError && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-6 text-sm">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Failed to load structured financials.
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void refetchFinancials()}>
                    Retry
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Financial Snapshots Table */}
            <Card className="border-slate-200 bg-white">
              <CardHeader className="border-b border-slate-100 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-brand-orange-500" />
                      Structured Financial Snapshots
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Periodic financial telemetry with evidence provenance.
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<Plus className="h-3.5 w-3.5" />}
                    disabled
                  >
                    Add Period (Coming soon)
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Period</th>
                        <th className="px-4 py-3">Revenue (USD)</th>
                        <th className="px-4 py-3">Gross Margin</th>
                        <th className="px-4 py-3">Monthly Burn</th>
                        <th className="px-4 py-3">Runway</th>
                        <th className="px-4 py-3">CAC / LTV</th>
                        <th className="px-4 py-3">Evidence Provenance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {financials.length > 0 ? (
                        financials.map((fin) => (
                          <tr key={fin.id} className="hover:bg-slate-50/60">
                            <td className="px-4 py-3 font-bold text-slate-900">{fin.period_label}</td>
                            <td className="px-4 py-3 font-semibold">${numOr(Number(fin.revenue_usd), 0).toLocaleString()}</td>
                            <td className="px-4 py-3">{fin.gross_margin_pct}%</td>
                            <td className="px-4 py-3 text-red-600">-${numOr(Number(fin.net_burn_monthly_usd), 0).toLocaleString()}</td>
                            <td className="px-4 py-3 font-bold">{fin.runway_months ?? 0} mos</td>
                            <td className="px-4 py-3">
                              {fin.cac_usd ? `$${numOr(Number(fin.cac_usd), 0).toLocaleString()}` : '-'} / {fin.ltv_usd ? `$${numOr(Number(fin.ltv_usd), 0).toLocaleString()}` : '-'}
                            </td>
                            <td className="px-4 py-3">
                              {fin.evidence_title ? (
                                <Badge variant="secondary" className="text-[10px] gap-1">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                  {fin.evidence_title}
                                </Badge>
                              ) : (
                                <span className="text-slate-400 italic">Self-reported</span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <>
                          <tr className="hover:bg-slate-50/60">
                            <td colSpan={7} className="px-4 py-2 bg-amber-50/60 border-b border-amber-200">
                              <div className="flex items-center gap-2 text-[11px] text-amber-800">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                Sample data shown below — connect accounting telemetry or add a real period using the button above.
                              </div>
                            </td>
                          </tr>
                          <tr className="hover:bg-slate-50/60">
                            <td className="px-4 py-3 font-bold text-slate-900">Q2 2026</td>
                            <td className="px-4 py-3 font-semibold">$126,600</td>
                            <td className="px-4 py-3">78.2%</td>
                            <td className="px-4 py-3 text-red-600">-$18,400</td>
                            <td className="px-4 py-3 font-bold">14.2 mos</td>
                            <td className="px-4 py-3">$160 / $780</td>
                            <td className="px-4 py-3">
                              <Badge variant="secondary" className="text-[10px] gap-1">
                                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                Stripe API Sync
                              </Badge>
                            </td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Funding Rounds Cap Table History */}
            {isFundingRoundsError && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-6 text-sm">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Failed to load funding rounds history.
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void refetchFundingRounds()}>
                    Retry
                  </Button>
                </CardContent>
              </Card>
            )}
            <Card className="border-slate-200 bg-white">
              <CardHeader className="border-b border-slate-100 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Award className="h-4 w-4 text-emerald-600" />
                      Funding History &amp; Capital Rounds
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Historical financing events feeding cap table conversion mechanics.
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<Plus className="h-3.5 w-3.5" />}
                    disabled
                  >
                    Log Round (Coming soon)
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-5 space-y-3">
                {fundingRounds.length > 0 ? (
                  fundingRounds.map((rnd) => (
                    <div key={rnd.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5 text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm capitalize">{rnd.round_type.replace('_', ' ')}</span>
                          <Badge variant="outline">{rnd.instrument}</Badge>
                        </div>
                        <p className="text-slate-500 mt-1">
                          Lead Investor: <span className="text-slate-800 font-medium">{rnd.lead_investor_name || 'Syndicate'}</span> · Closed {rnd.close_date || '2025'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-900">${numOr(Number(rnd.amount_usd), 0).toLocaleString()}</p>
                        {rnd.valuation_post_money_usd && (
                          <p className="text-[11px] text-slate-500">Post: ${numOr(Number(rnd.valuation_post_money_usd), 0).toLocaleString()}</p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
                      <div className="flex items-center gap-2 text-[11px] text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        Sample round shown below — log your first real financing event once it closes.
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5 text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">Pre-Seed Bridge</span>
                          <Badge variant="outline">Post-Money SAFE</Badge>
                        </div>
                        <p className="text-slate-500 mt-1">
                          Lead: <span className="text-slate-800 font-medium">Savannah Angel Syndicate</span> · Closed May 2026
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-900">$150,000</p>
                        <p className="text-[11px] text-slate-500">Cap: $3,000,000</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── TAB 5: CUSTOMER INTELLIGENCE ── */}
        {activeTab === 'customers' && (
          <motion.div
            key="tab-customers"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-6"
          >
            {isCustomersError && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-6 text-sm">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Failed to load customer telemetry.
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void refetchCustomers()}>
                    Retry
                  </Button>
                </CardContent>
              </Card>
            )}

            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Customer Telemetry &amp; Cohorts</h3>
                <p className="text-xs text-slate-500">Structured customer contracts and retention analytics.</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Plus className="h-3.5 w-3.5" />}
                disabled
              >
                Add Segment (Coming soon)
              </Button>
            </div>

            {customers.length === 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 flex items-center gap-2 text-[11px] text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Sample customer segments below — connect CRM/revenue telemetry or add your own segments.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(customers.length > 0
                ? customers
                : ([
                    { id: '1', segment_type: 'Enterprise B2B', customer_count: 18, average_contract_value_usd: '18000.00', retention_rate_pct: 96.0, geography: 'Global & EMEA' },
                    { id: '2', segment_type: 'Mid-Market SaaS', customer_count: 55, average_contract_value_usd: '4200.00', retention_rate_pct: 89.5, geography: 'North America' },
                    { id: '3', segment_type: 'Developer API / Self-Serve', customer_count: 140, average_contract_value_usd: '850.00', retention_rate_pct: 82.0, geography: 'Global' },
                  ] as CustomerFallback[])
              ).map((seg) => (
                <Card key={seg.id} className="border-slate-200 bg-white">
                  <CardContent className="p-4 space-y-2">
                    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">{seg.segment_type}</span>
                    <p className="text-2xl font-black text-slate-900">{seg.customer_count} <span className="text-xs font-normal text-slate-500">accounts</span></p>
                    <div className="space-y-1 text-xs text-slate-600 pt-2 border-t border-slate-100">
                      <div className="flex justify-between">
                        <span>ACV:</span>
                        <span className="font-bold text-slate-900">${numOr(Number(seg.average_contract_value_usd), 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Retention:</span>
                        <span className="font-bold text-emerald-600">{seg.retention_rate_pct}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Territory:</span>
                        <span className="text-slate-500">{seg.geography}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── TAB 6: ACTIVE FUNDRAISING CAMPAIGN ── */}
        {activeTab === 'campaign' && (
          <motion.div
            key="tab-campaign"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-6"
          >
            {isCampaignError && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-6 text-sm">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Failed to load active fundraising campaign.
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void refetchCampaign()}>
                    Retry
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card className="border-slate-200 bg-white">
              <CardHeader className="border-b border-slate-100 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Target className="h-4 w-4 text-brand-orange-500" />
                      Active Fundraising Round
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Live campaign state powering PitchMic deal matching and structured offer negotiation.
                    </CardDescription>
                  </div>
                  <Badge className="bg-emerald-600 text-white text-xs">
                    {campaign?.status?.toUpperCase() ?? 'ACTIVE'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-5 space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Target Raise</span>
                    <p className="text-xl font-bold text-slate-900 mt-0.5">
                      ${numOr(Number(campaign?.target_amount_usd ?? 500000), 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Committed Capital</span>
                    <p className="text-xl font-bold text-emerald-600 mt-0.5">
                      ${numOr(Number(campaign?.amount_committed_usd ?? 150000), 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Valuation Cap</span>
                    <p className="text-xl font-bold text-brand-orange-600 mt-0.5">
                      ${numOr(Number(campaign?.valuation_cap_usd ?? 4000000), 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Instrument</span>
                    <p className="text-sm font-bold text-slate-900 mt-1">
                      {campaign?.instrument ?? 'Post-Money SAFE'}
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
                  <p className="text-xs font-bold text-slate-700">Core Investment Terms Summary:</p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {campaign?.terms_summary ?? 'Standard Post-Money SAFE with MFN and Information Rights for major investors.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
