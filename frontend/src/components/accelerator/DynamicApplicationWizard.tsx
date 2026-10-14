'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  FileText,
  Sparkles,
  Brain,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { acceleratorApi, AcceleratorProgram } from '@/lib/acceleratorApi';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface DynamicApplicationWizardProps {
  program: AcceleratorProgram;
  onClose: () => void;
  onSuccess: () => void;
}

// ── Empty defaults — no demo data ─────────────────────────────────────────────
const EMPTY_FOUNDER = {
  fullName: '',
  country: '',
  location: '',
  linkedin: '',
  fullTime: false,
  technicalScore: 5,
  businessScore: 5,
  previousCompanies: '',
  cofounders: '',
};

const EMPTY_STARTUP = {
  companyName: '',
  website: 'https://',
  industry: '',
  businessModel: 'b2b_saas',
  geography: '',
  declaredStage: 'pre_seed',
  productStage: 'mvp',
  hasLiveProduct: false,
  incorporated: false,
  incorporationCountry: '',
  employeeCount: 1,
};

const EMPTY_REVENUE = {
  mrr: 0,
  last3MonthsRevenue: 0,
  payingCustomers: 0,
  avgRevenuePerCustomer: 0,
  grossMargin: 0,
};

const EMPTY_PRE_REVENUE = {
  whyNoRevenue: '',
  loiCount: 0,
  pilotCount: 0,
  userInterviews: 0,
  demandEvidence: '',
};

export function DynamicApplicationWizard({
  program,
  onClose,
  onSuccess,
}: DynamicApplicationWizardProps) {
  const { toast } = useToast();

  const [currentStep, setCurrentStep] = React.useState(1);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = React.useState(true);
  const [profileLoadError, setProfileLoadError] = React.useState<string | null>(null);

  // Form state — starts empty, populated from API on mount
  const [founderData, setFounderData] = React.useState(EMPTY_FOUNDER);
  const [startupData, setStartupData] = React.useState(EMPTY_STARTUP);
  const [hasRevenue, setHasRevenue] = React.useState(false);
  const [revenueData, setRevenueData] = React.useState(EMPTY_REVENUE);
  const [preRevenueData, setPreRevenueData] = React.useState(EMPTY_PRE_REVENUE);
  const [problemNarrative, setProblemNarrative] = React.useState('');
  const [teamAdvantage, setTeamAdvantage] = React.useState('');
  const [uploadedDocs] = React.useState<Array<{ name: string; type: string; status: string }>>([]);

  // ── Load existing founder profile from API on open ─────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      setIsLoadingProfile(true);
      try {
        const profileRes = await api.get('/accelerator/founder-profile/');
        const p = profileRes.data;
        if (!cancelled && p) {
          setFounderData({
            fullName: p.full_name ?? '',
            country: p.country ?? '',
            location: p.location ?? '',
            linkedin: p.linkedin ?? '',
            fullTime: p.full_time_status ?? false,
            technicalScore: p.technical_capability_score ?? 5,
            businessScore: p.business_capability_score ?? 5,
            previousCompanies: p.previous_companies ?? '',
            cofounders: p.cofounders ?? '',
          });
        }

        const startupRes = await api.get('/accelerator/startup-profiles/');
        const profiles = Array.isArray(startupRes.data)
          ? startupRes.data
          : startupRes.data?.results ?? [];
        const s = profiles[0];
        if (!cancelled && s) {
          setStartupData({
            companyName: s.company_name ?? '',
            website: s.website ?? 'https://',
            industry: s.industry ?? '',
            businessModel: s.business_model ?? 'b2b_saas',
            geography: s.geography ?? '',
            declaredStage: s.declared_stage ?? 'pre_seed',
            productStage: s.product_stage ?? 'mvp',
            hasLiveProduct: s.has_live_product ?? false,
            incorporated: s.incorporated ?? false,
            incorporationCountry: s.incorporation_country ?? '',
            employeeCount: s.employee_count ?? 1,
          });
          if (s.revenue_status && s.revenue_status !== 'pre_revenue') {
            setHasRevenue(true);
            setRevenueData({
              mrr: s.mrr_usd ?? 0,
              last3MonthsRevenue: 0,
              payingCustomers: s.customer_count ?? 0,
              avgRevenuePerCustomer: 0,
              grossMargin: 0,
            });
          } else {
            setPreRevenueData((prev) => ({
              ...prev,
              loiCount: s.loi_count ?? 0,
              pilotCount: s.pilot_count ?? 0,
            }));
          }
        }
      } catch (err: any) {
        // 404 means the profile doesn't exist yet — blank form is correct, no noise needed.
        // Any other error (401, 500, network) means the load genuinely failed and the
        // founder should know their saved profile wasn't pre-populated.
        const status = err?.response?.status;
        if (status && status !== 404) {
          setProfileLoadError(
            'Could not load your saved profile. You can still fill in the form — your data will be saved on submission.'
          );
        }
        // 404 → silently stay on blank form
      } finally {
        if (!cancelled) setIsLoadingProfile(false);
      }
    }
    loadProfile();
    return () => { cancelled = true; };
  }, []);

  // ── Stage conflict detection — all meaningful mismatches ──────────────────
  const inferredStage = React.useMemo(() => {
    if (hasRevenue && revenueData.mrr >= 15000) return 'seed';
    if (
      (startupData.productStage === 'idea' || startupData.productStage === 'prototype') &&
      !hasRevenue
    ) return 'idea';
    return 'pre_seed';
  }, [hasRevenue, revenueData.mrr, startupData.productStage]);

  // Mismatch: declared stage is higher than what current metrics support.
  // series_a vs anything-not-series_a covers all series_a sub-cases.
  const stageMismatch =
    (startupData.declaredStage === 'seed' &&
      (inferredStage === 'pre_seed' || inferredStage === 'idea')) ||
    (startupData.declaredStage === 'series_a' && (inferredStage as string) !== 'series_a');

  const wordCount = problemNarrative.trim().split(/\s+/).filter(Boolean).length;

  const handleNext = () => setCurrentStep((s) => Math.min(s + 1, 5));
  const handleBack = () => setCurrentStep((s) => Math.max(s - 1, 1));

  // ── Submission — errors surface to the user, no silent swallowing ─────────
  const handleSubmit = async () => {
    if (!startupData.companyName.trim()) {
      toast({ title: 'Company name required', description: 'Please fill in your company name before submitting.', variant: 'warning' });
      setCurrentStep(2);
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Save/update founder profile
      await api.put('/accelerator/founder-profile/', {
        full_name: founderData.fullName,
        country: founderData.country,
        location: founderData.location,
        linkedin: founderData.linkedin,
        full_time_status: founderData.fullTime,
        technical_capability_score: founderData.technicalScore,
        business_capability_score: founderData.businessScore,
        previous_companies: founderData.previousCompanies,
        cofounders: founderData.cofounders,
      });

      // 2. Create or reuse startup profile
      const profRes = await api.get('/accelerator/startup-profiles/');
      const existingProfiles = Array.isArray(profRes.data)
        ? profRes.data
        : profRes.data?.results ?? [];
      let startupProfileId: number | null = existingProfiles[0]?.id ?? null;

      const profilePayload = {
        company_name: startupData.companyName,
        website: startupData.website,
        industry: startupData.industry,
        business_model: startupData.businessModel,
        geography: startupData.geography,
        declared_stage: startupData.declaredStage,
        product_stage: startupData.productStage,
        has_live_product: startupData.hasLiveProduct,
        incorporated: startupData.incorporated,
        incorporation_country: startupData.incorporationCountry,
        employee_count: startupData.employeeCount,
        revenue_status: hasRevenue ? 'early_revenue' : 'pre_revenue',
        mrr_usd: hasRevenue ? revenueData.mrr : 0,
        customer_count: hasRevenue ? revenueData.payingCustomers : 0,
        loi_count: !hasRevenue ? preRevenueData.loiCount : 0,
        pilot_count: !hasRevenue ? preRevenueData.pilotCount : 0,
      };

      if (startupProfileId) {
        await api.patch(`/accelerator/startup-profiles/${startupProfileId}/`, profilePayload);
      } else {
        const createRes = await api.post('/accelerator/startup-profiles/', profilePayload);
        startupProfileId = createRes.data.id;
      }

      if (!startupProfileId) {
        throw new Error('Failed to create startup profile. Please try again.');
      }

      // 3. Create application
      const appRes = await api.post('/accelerator/applications/', {
        program: program.id,
        startup_profile: startupProfileId,
      });
      const appId = appRes.data.id;

      // 4. Submit for admissions forensics
      await acceleratorApi.submitApplication(appId);

      toast({
        title: 'Application submitted',
        description: `Your application to ${program.name} has been submitted and is now in the admissions pipeline.`,
        variant: 'success',
        duration: 6000,
      });
      onSuccess();
    } catch (err: any) {
      // Surface the real error — no silent fallback to success
      const message =
        err?.response?.data?.detail ??
        err?.response?.data?.non_field_errors?.[0] ??
        err?.message ??
        'Submission failed. Please check your details and try again.';
      toast({ title: 'Submission failed', description: message, variant: 'error', duration: 8000 });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingProfile) {
    return (
      <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-neutral-300">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
          <p className="text-sm">Loading your profile…</p>
        </div>
      </div>
    );
  }

  const STEP_LABELS = [
    'Founder Canonical Profile',
    'Company Snapshot',
    'Adaptive Question Intelligence',
    'Document Upload & Claim Extraction',
    'Admissions Forensics & Review',
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Dynamic Application Engine
              </span>
              <span className="text-xs text-neutral-400">
                {program.name} ({program.program_cycle})
              </span>
            </div>
            <h2 className="text-lg font-bold text-white mt-1">
              Step {currentStep} of 5: {STEP_LABELS[currentStep - 1]}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            aria-label="Close application wizard"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step progress bar */}
        <div className="grid grid-cols-5 h-1 bg-neutral-800">
          {[1, 2, 3, 4, 5].map((step) => (
            <div
              key={step}
              className={cn(
                'h-full transition-all duration-300',
                step <= currentStep ? 'bg-emerald-500' : 'bg-transparent'
              )}
            />
          ))}
        </div>

        {/* Profile load warning — shown when a non-404 error occurred */}
        {profileLoadError && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-amber-950/20 border border-amber-500/30 flex items-start gap-2 text-xs text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{profileLoadError}</span>
          </div>
        )}

        {/* Step body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs text-neutral-300">

          {/* ── STEP 1: FOUNDER PROFILE ─────────────────────────────────── */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1">
                <p className="font-semibold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  "Apply Once, Reuse Everywhere" Canonical Record
                </p>
                <p className="text-neutral-400">
                  This founder profile is stored permanently. Pitchmic carries this forward to
                  any future programs or investor syndicates.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-neutral-400 block mb-1">Full Legal Name *</label>
                  <Input
                    value={founderData.fullName}
                    onChange={(e) => setFounderData({ ...founderData, fullName: e.target.value })}
                    placeholder="e.g. Ada Okonkwo"
                    className="bg-neutral-950 border-neutral-800 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">Location &amp; Hub</label>
                  <Input
                    value={founderData.location}
                    onChange={(e) => setFounderData({ ...founderData, location: e.target.value })}
                    placeholder="e.g. Lagos, Nigeria"
                    className="bg-neutral-950 border-neutral-800 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-neutral-400 block mb-1">LinkedIn URL</label>
                  <Input
                    value={founderData.linkedin}
                    onChange={(e) => setFounderData({ ...founderData, linkedin: e.target.value })}
                    placeholder="https://linkedin.com/in/yourname"
                    className="bg-neutral-950 border-neutral-800 text-xs text-white"
                  />
                </div>
                <div className="flex items-center gap-3 pt-5">
                  <label className="flex items-center gap-2 cursor-pointer text-white font-medium select-none">
                    <input
                      type="checkbox"
                      checked={founderData.fullTime}
                      onChange={(e) =>
                        setFounderData({ ...founderData, fullTime: e.target.checked })
                      }
                      className="accent-emerald-500 rounded"
                    />
                    <span>100% Full-Time Committed to this venture</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-neutral-400 block mb-1">
                    Technical Execution Capability:{' '}
                    <span className="text-emerald-400 font-mono font-bold">
                      {founderData.technicalScore}/10
                    </span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="0.5"
                    value={founderData.technicalScore}
                    onChange={(e) =>
                      setFounderData({ ...founderData, technicalScore: Number(e.target.value) })
                    }
                    className="w-full accent-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">
                    Commercial &amp; Domain Insight:{' '}
                    <span className="text-emerald-400 font-mono font-bold">
                      {founderData.businessScore}/10
                    </span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="0.5"
                    value={founderData.businessScore}
                    onChange={(e) =>
                      setFounderData({ ...founderData, businessScore: Number(e.target.value) })
                    }
                    className="w-full accent-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">
                  Previous Entrepreneurial Ventures &amp; Exits
                </label>
                <Input
                  value={founderData.previousCompanies}
                  onChange={(e) =>
                    setFounderData({ ...founderData, previousCompanies: e.target.value })
                  }
                  placeholder="e.g. Company Name (Role, Year / Outcome)"
                  className="bg-neutral-950 border-neutral-800 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">
                  Co-Founders &amp; Core Leadership
                </label>
                <Input
                  value={founderData.cofounders}
                  onChange={(e) =>
                    setFounderData({ ...founderData, cofounders: e.target.value })
                  }
                  placeholder="e.g. Jane Doe (Chief Commercial Officer, 30% equity)"
                  className="bg-neutral-950 border-neutral-800 text-xs text-white"
                />
              </div>
            </div>
          )}

          {/* ── STEP 2: COMPANY SNAPSHOT ────────────────────────────────── */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-neutral-400 block mb-1">Company Name *</label>
                  <Input
                    value={startupData.companyName}
                    onChange={(e) =>
                      setStartupData({ ...startupData, companyName: e.target.value })
                    }
                    placeholder="e.g. Freight.io"
                    className="bg-neutral-950 border-neutral-800 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">Company Website</label>
                  <Input
                    value={startupData.website}
                    onChange={(e) =>
                      setStartupData({ ...startupData, website: e.target.value })
                    }
                    placeholder="https://yourcompany.com"
                    className="bg-neutral-950 border-neutral-800 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-neutral-400 block mb-1">Industry / Sector</label>
                  <Input
                    value={startupData.industry}
                    onChange={(e) =>
                      setStartupData({ ...startupData, industry: e.target.value })
                    }
                    placeholder="e.g. Logistics / Fintech"
                    className="bg-neutral-950 border-neutral-800 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">Business Model</label>
                  <select
                    value={startupData.businessModel}
                    onChange={(e) =>
                      setStartupData({ ...startupData, businessModel: e.target.value })
                    }
                    className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-white text-xs focus:border-emerald-500 outline-none"
                  >
                    <option value="b2b_saas">B2B SaaS</option>
                    <option value="marketplace">Marketplace</option>
                    <option value="fintech">Fintech</option>
                    <option value="deeptech">Deep Tech / AI</option>
                    <option value="consumer">Consumer</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">Operating Geography</label>
                  <Input
                    value={startupData.geography}
                    onChange={(e) =>
                      setStartupData({ ...startupData, geography: e.target.value })
                    }
                    placeholder="e.g. Nigeria, Kenya"
                    className="bg-neutral-950 border-neutral-800 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-neutral-400 block mb-1">Declared Funding Stage</label>
                  <select
                    value={startupData.declaredStage}
                    onChange={(e) =>
                      setStartupData({ ...startupData, declaredStage: e.target.value })
                    }
                    className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-white text-xs focus:border-emerald-500 outline-none"
                  >
                    <option value="idea">Idea</option>
                    <option value="pre_seed">Pre-Seed</option>
                    <option value="seed">Seed</option>
                    <option value="series_a">Series A</option>
                  </select>
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">Product Stage</label>
                  <select
                    value={startupData.productStage}
                    onChange={(e) =>
                      setStartupData({ ...startupData, productStage: e.target.value })
                    }
                    className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-white text-xs focus:border-emerald-500 outline-none"
                  >
                    <option value="idea">Idea / Concept</option>
                    <option value="prototype">Prototype</option>
                    <option value="mvp">Working MVP</option>
                    <option value="pilot">Pilot-Ready / In Pilot</option>
                    <option value="live">Live in Production</option>
                    <option value="scaling">Scaling</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-neutral-400 block mb-1">Full-Time Employee Count</label>
                  <Input
                    type="number"
                    min="1"
                    value={startupData.employeeCount}
                    onChange={(e) =>
                      setStartupData({ ...startupData, employeeCount: Number(e.target.value) })
                    }
                    className="bg-neutral-950 border-neutral-800 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">
                    Incorporation Country (if incorporated)
                  </label>
                  <Input
                    value={startupData.incorporationCountry}
                    onChange={(e) =>
                      setStartupData({ ...startupData, incorporationCountry: e.target.value })
                    }
                    placeholder="e.g. Delaware / Nigeria"
                    className="bg-neutral-950 border-neutral-800 text-xs text-white"
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">Incorporated Legal Entity</p>
                  <p className="text-neutral-400 text-[11px]">
                    Registered entity in primary jurisdiction
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={startupData.incorporated}
                  onChange={(e) =>
                    setStartupData({ ...startupData, incorporated: e.target.checked })
                  }
                  className="accent-emerald-500 w-4 h-4"
                />
              </div>
            </div>
          )}

          {/* ── STEP 3: ADAPTIVE QUESTION ENGINE ───────────────────────── */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800">
                <p className="font-semibold text-white">Adaptive Question Branching</p>
                <p className="text-neutral-400 text-[11px]">
                  Pitchmic never asks irrelevant Series A questions to pre-revenue teams. Answers
                  adapt dynamically to avoid false negative penalties.
                </p>
              </div>

              {/* Problem narrative */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-neutral-400 font-medium">
                    What urgent problem are you solving? *
                  </label>
                  <span
                    className={cn(
                      'text-[11px] font-mono',
                      wordCount === 0
                        ? 'text-neutral-600'
                        : wordCount < 25
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    )}
                  >
                    {wordCount} words (target: 25–150)
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={problemNarrative}
                  onChange={(e) => setProblemNarrative(e.target.value)}
                  placeholder="Describe the specific, urgent problem your startup solves and for whom."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-white text-xs focus:border-emerald-500 outline-none resize-none"
                />
              </div>

              {/* Revenue gate */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-white text-sm">
                      Do you currently have paying customers or revenue?
                    </p>
                    <p className="text-neutral-400 text-[11px]">
                      Selecting "No" evaluates commercial traction through LOIs, pilots, and
                      customer validation.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setHasRevenue(true)}
                      className={cn(
                        'px-3 py-1 rounded text-xs font-bold transition-all',
                        hasRevenue ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-400'
                      )}
                    >
                      Yes, We Have Revenue
                    </button>
                    <button
                      type="button"
                      onClick={() => setHasRevenue(false)}
                      className={cn(
                        'px-3 py-1 rounded text-xs font-bold transition-all',
                        !hasRevenue ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-400'
                      )}
                    >
                      Pre-Revenue / Pilot Stage
                    </button>
                  </div>
                </div>

                {/* Branch A: Revenue */}
                {hasRevenue ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-neutral-800">
                    <div>
                      <label className="text-neutral-400 block mb-1">MRR ($)</label>
                      <Input
                        type="number"
                        value={revenueData.mrr || ''}
                        onChange={(e) =>
                          setRevenueData({ ...revenueData, mrr: Number(e.target.value) })
                        }
                        placeholder="e.g. 15000"
                        className="bg-neutral-900 border-neutral-800 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-neutral-400 block mb-1">Paying Customers</label>
                      <Input
                        type="number"
                        value={revenueData.payingCustomers || ''}
                        onChange={(e) =>
                          setRevenueData({
                            ...revenueData,
                            payingCustomers: Number(e.target.value),
                          })
                        }
                        className="bg-neutral-900 border-neutral-800 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-neutral-400 block mb-1">Gross Margin (%)</label>
                      <Input
                        type="number"
                        value={revenueData.grossMargin || ''}
                        onChange={(e) =>
                          setRevenueData({ ...revenueData, grossMargin: Number(e.target.value) })
                        }
                        className="bg-neutral-900 border-neutral-800 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-neutral-400 block mb-1">Last 3mo Revenue ($)</label>
                      <Input
                        type="number"
                        value={revenueData.last3MonthsRevenue || ''}
                        onChange={(e) =>
                          setRevenueData({
                            ...revenueData,
                            last3MonthsRevenue: Number(e.target.value),
                          })
                        }
                        className="bg-neutral-900 border-neutral-800 text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                ) : (
                  /* Branch B: Pre-revenue */
                  <div className="space-y-3 pt-3 border-t border-neutral-800">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-neutral-400 block mb-1">Signed LOIs</label>
                        <Input
                          type="number"
                          value={preRevenueData.loiCount || ''}
                          onChange={(e) =>
                            setPreRevenueData({
                              ...preRevenueData,
                              loiCount: Number(e.target.value),
                            })
                          }
                          className="bg-neutral-900 border-neutral-800 text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-neutral-400 block mb-1">Active Pilots</label>
                        <Input
                          type="number"
                          value={preRevenueData.pilotCount || ''}
                          onChange={(e) =>
                            setPreRevenueData({
                              ...preRevenueData,
                              pilotCount: Number(e.target.value),
                            })
                          }
                          className="bg-neutral-900 border-neutral-800 text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-neutral-400 block mb-1">Customer Interviews</label>
                        <Input
                          type="number"
                          value={preRevenueData.userInterviews || ''}
                          onChange={(e) =>
                            setPreRevenueData({
                              ...preRevenueData,
                              userInterviews: Number(e.target.value),
                            })
                          }
                          className="bg-neutral-900 border-neutral-800 text-xs text-white font-mono"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-neutral-400 block mb-1">
                        What concrete evidence of demand exists?
                      </label>
                      <textarea
                        rows={2}
                        value={preRevenueData.demandEvidence}
                        onChange={(e) =>
                          setPreRevenueData({
                            ...preRevenueData,
                            demandEvidence: e.target.value,
                          })
                        }
                        placeholder="Describe signed agreements, user research, waitlists, or pilot outcomes."
                        className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-white focus:border-emerald-500 outline-none resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Team advantage */}
              <div>
                <label className="text-neutral-400 block mb-1">
                  Why is this founding team uniquely suited to win? *
                </label>
                <textarea
                  rows={2}
                  value={teamAdvantage}
                  onChange={(e) => setTeamAdvantage(e.target.value)}
                  placeholder="Domain expertise, operator experience, unfair distribution advantage…"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-xs text-white focus:border-emerald-500 outline-none resize-none"
                />
              </div>
            </div>
          )}

          {/* ── STEP 4: DOCUMENT UPLOAD ─────────────────────────────────── */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">Automated Claim Extraction Engine</p>
                  <p className="text-neutral-400 text-[11px]">
                    Uploaded documents are parsed into auditable claim objects with quantitative
                    counterparty verification.
                  </p>
                </div>
                <Badge className="bg-emerald-500/20 text-emerald-400 text-xs font-mono">
                  {uploadedDocs.length} Documents Attached
                </Badge>
              </div>

              {uploadedDocs.length === 0 ? (
                <div className="p-8 rounded-xl border border-dashed border-neutral-700 bg-neutral-950/40 text-center space-y-2">
                  <FileText className="w-8 h-8 text-neutral-600 mx-auto" />
                  <p className="text-sm text-neutral-500">
                    Document upload is available after submission via the Reviewer Workspace.
                  </p>
                  <p className="text-xs text-neutral-600">
                    You can submit now and upload supporting documents (LOIs, pitch deck,
                    financials) from the evidence panel.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {uploadedDocs.map((doc, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-4 h-4 text-blue-400" />
                        <div>
                          <p className="font-semibold text-white">{doc.name}</p>
                          <p className="text-[10px] text-neutral-400 uppercase font-mono">
                            {doc.type.replace(/_/g, ' ')}
                          </p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {doc.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 5: PRE-FLIGHT & SUBMIT ─────────────────────────────── */}
          {currentStep === 5 && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
                <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                  <Brain className="w-4 h-4 text-emerald-400" />
                  Admissions Pre-Flight Evaluation
                </h3>
                <p className="text-neutral-400 text-[11px]">
                  Pitchmic will execute full forensic checks, cross-source discrepancy analysis,
                  and assign an initial Screening Tier upon submission.
                </p>
              </div>

              {/* Stage overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                  <p className="text-neutral-400 text-[10px]">Declared Stage</p>
                  <p className="text-base font-bold font-mono text-white uppercase">
                    {startupData.declaredStage}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                  <p className="text-neutral-400 text-[10px]">Inferred Stage</p>
                  <p className="text-base font-bold font-mono text-emerald-400 uppercase">
                    {inferredStage}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                  <p className="text-neutral-400 text-[10px]">Revenue Status</p>
                  <p className="text-base font-bold font-mono text-purple-400">
                    {hasRevenue ? 'Revenue' : 'Pre-Revenue'}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                  <p className="text-neutral-400 text-[10px]">Traction Signal</p>
                  <p className="text-base font-bold font-mono text-blue-400">
                    {hasRevenue
                      ? `$${revenueData.mrr.toLocaleString()} MRR`
                      : `${preRevenueData.loiCount} LOIs`}
                  </p>
                </div>
              </div>

              {/* Stage mismatch warning — all conflict cases */}
              {stageMismatch && (
                <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/30 flex items-start gap-2 text-amber-300 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Stage divergence detected: You declared{' '}
                    <strong className="text-amber-200 uppercase">
                      {startupData.declaredStage}
                    </strong>{' '}
                    but operational metrics align with{' '}
                    <strong className="text-emerald-300 uppercase">{inferredStage}</strong>.
                    The forensic engine will flag this — consider aligning your declared stage
                    with actual metrics to avoid a screening tier penalty.
                  </span>
                </div>
              )}

              {/* Validation warning: missing company name */}
              {!startupData.companyName.trim() && (
                <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/30 flex items-center gap-2 text-rose-300 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Company name is required. Go back to Step 2 to fill it in.
                </div>
              )}

              {/* Summary */}
              <div className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs space-y-1">
                <p className="text-white font-semibold">Application Summary:</p>
                <p className="text-neutral-400">
                  • Startup:{' '}
                  <span className="text-neutral-200">
                    {startupData.companyName || '(not set)'}
                  </span>
                </p>
                <p className="text-neutral-400">
                  • Program:{' '}
                  <span className="text-neutral-200">
                    {program.name} ({program.organization_name})
                  </span>
                </p>
                <p className="text-neutral-400">
                  • Founder:{' '}
                  <span className="text-neutral-200">
                    {founderData.fullName || '(not set)'}
                  </span>
                </p>
                <p className="text-neutral-400">
                  • Traction:{' '}
                  <span className="text-neutral-200">
                    {hasRevenue
                      ? `$${revenueData.mrr.toLocaleString()} MRR · ${revenueData.payingCustomers} customers`
                      : `${preRevenueData.loiCount} LOIs · ${preRevenueData.pilotCount} pilots`}
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="p-4 border-t border-neutral-800 flex items-center justify-between bg-neutral-950/80">
          <Button
            variant="outline"
            size="sm"
            onClick={currentStep === 1 ? onClose : handleBack}
            className="text-xs border-neutral-800 text-neutral-300"
          >
            {currentStep === 1 ? (
              'Cancel'
            ) : (
              <>
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
              </>
            )}
          </Button>

          {currentStep < 5 ? (
            <Button
              size="sm"
              onClick={handleNext}
              className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
            >
              Continue <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting || !startupData.companyName.trim()}
              className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  Submit Application
                </>
              )}
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
