'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  BarChart3,
  FileSearch,
  Sparkles,
  Users,
  Building2,
  CheckCircle2,
  Lock,
  ChevronRight,
  TrendingUp,
  Eye,
  FileText,
  Clock,
  Check,
  X,
  ArrowUpRight,
  FolderLock,
  DollarSign,
  AlertTriangle,
  Award,
  Layers,
  Radar,
  Activity,
  Flame,
  ChevronDown,
  Globe2,
  Brain,
  AlertCircle,
  Landmark,
  Banknote,
  Truck,
  Sun,
  Mic,
  Target,
  Cpu,
  Network,
  PieChart,
  GitMerge,
  Star,
  Play,
  FileSpreadsheet,
  UploadCloud,
  CheckCheck,
} from 'lucide-react';
import { MarketingShell } from '@/components/layout/MarketingShell';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

/* ─────────────────────────────────────────────
   Animation Variants
───────────────────────────────────────────── */
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

function RocketIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

/* ─────────────────────────────────────────────
   Data: 3 Hero Persona Workflows
───────────────────────────────────────────── */
interface HeroPersona {
  id: string;
  tabLabel: string;
  tag: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  badgeBg: string;
  borderActive: string;
  headline: string;
  subtitle: string;
  primaryCta: string;
  primaryHref: string;
  secondaryCta: string;
  secondaryHref: string;
  consoleType: 'founder' | 'vc' | 'accelerator';
}

const HERO_PERSONAS: HeroPersona[] = [
  {
    id: 'founders',
    tabLabel: 'Founders',
    tag: 'For Startup Founders',
    icon: RocketIcon,
    accentColor: 'text-brand-orange-600',
    badgeBg: 'bg-brand-orange-50 text-brand-orange-700 border-brand-orange-200',
    borderActive: 'border-brand-orange-500',
    headline: 'Know your fundability before you pitch.',
    subtitle: 'Pre-audit your pitch deck against the same 8-pillar rubric institutional VCs use. Fix math gaps, pass forensic stress-tests, and walk into investor rooms with data-backed conviction.',
    primaryCta: 'Audit My Pitch Free',
    primaryHref: '/sign-up/startup',
    secondaryCta: 'Explore Sample Scorecard',
    secondaryHref: '/fundability',
    consoleType: 'founder',
  },
  {
    id: 'vcs',
    tabLabel: 'VC Funds',
    tag: 'For Venture Capital & Seed Funds',
    icon: Brain,
    accentColor: 'text-indigo-600',
    badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    borderActive: 'border-indigo-500',
    headline: 'AI deal flow - from inbound to IC memo in minutes.',
    subtitle: 'Automate first-pass triage, verify multi-currency unit economics (USD/NGN/KES/ZAR), audit Delaware TopCo governance, and generate 1-click Investment Committee memos at institutional speed.',
    primaryCta: 'Request VC Diligence Access',
    primaryHref: '/sign-up/investor',
    secondaryCta: 'Explore IC Memo Radar',
    secondaryHref: '#ic-memo',
    consoleType: 'vc',
  },
  {
    id: 'accelerators',
    tabLabel: 'Accelerators',
    tag: 'For Accelerators & DFIs',
    icon: Network,
    accentColor: 'text-emerald-600',
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    borderActive: 'border-emerald-500',
    headline: 'Manage 3,000 applications. Surface the top 1%.',
    subtitle: 'Batch-upload cohorts, sync bi-directionally with accelerator hubs and CRMs, configure custom underwriting rubrics, and route shortlisted startups automatically with white-label diligence reporting.',
    primaryCta: 'Book Accelerator Demo',
    primaryHref: '/sign-up/investor',
    secondaryCta: 'View Enterprise Pricing',
    secondaryHref: '#pricing',
    consoleType: 'accelerator',
  },
];

/* ─────────────────────────────────────────────
   Data: 5-Stage Linear Workflow
───────────────────────────────────────────── */
const WORKFLOW_STEPS = [
  {
    num: '01',
    icon: FileSearch,
    phase: 'Ingest',
    title: 'Upload or Connect Deal Flow',
    desc: 'Founders upload pitch decks. VCs connect inbound CRMs. Accelerators batch-upload entire cohort applications.',
  },
  {
    num: '02',
    icon: Cpu,
    phase: 'Forensics',
    title: 'AI Multi-Agent Audit',
    desc: 'Validates math consistency, FX-adjusted unit economics, Delaware TopCo structure, and mobile money payment rails.',
  },
  {
    num: '03',
    icon: BarChart3,
    phase: 'Scoring',
    title: 'Fundability Score & Deciles',
    desc: 'Every deal receives an institutional 0–100 score with stage-calibrated decile rankings across African venture benchmarks.',
  },
  {
    num: '04',
    icon: FolderLock,
    phase: 'Deal Room',
    title: 'Tracked Data Room & Telemetry',
    desc: 'Watermarked data rooms with per-slide view duration heatmaps. Control viewer permissions and link expiry.',
  },
  {
    num: '05',
    icon: Brain,
    phase: 'IC Memo',
    title: '1-Click IC Memo & Memory',
    desc: 'Auto-generate LP-ready Investment Committee memos with Bull/Bear debates and Bayesian Series A follow-on intervals.',
  },
];

/* ─────────────────────────────────────────────
   Data: 6 Platform Capabilities
───────────────────────────────────────────── */
const CAPABILITIES = [
  {
    icon: FileSearch,
    color: 'bg-brand-orange-500',
    title: 'Forensic Deck Stress-Test',
    persona: 'Founders & VCs',
    desc: '4-state evidence verification engine: mathematical consistency checks, CAC/LTV deflators, cap table integrity, and market SAM validation.',
    stats: '80% triage time saved vs. manual review',
  },
  {
    icon: BarChart3,
    color: 'bg-indigo-600',
    title: 'Pan-African 8-Pillar Underwriting',
    persona: 'VC Funds & Angels',
    desc: 'Engineered for African reality: FX & inflation volatility, Delaware/Mauritius TopCo governance, M-Pesa/NIBSS rail failovers, and regulatory moats.',
    stats: '54 African jurisdictions covered',
  },
  {
    icon: Mic,
    color: 'bg-purple-600',
    title: 'Autonomous Voice Screener',
    persona: 'VC Funds & Accelerators',
    desc: 'AI voice agent calls founders, conducts structured 15-minute qualification interviews, and generates verbatim screening reports.',
    stats: '15-min qualification, 0 partner hours',
  },
  {
    icon: Brain,
    color: 'bg-emerald-600',
    title: 'Digital Brain Institutional Memory',
    persona: 'VC Funds',
    desc: 'Knowledge graph indexing past deals, co-investors, and IC debates to surface pattern matches when evaluating incoming startups.',
    stats: 'Continuous fund knowledge graph',
  },
  {
    icon: Radar,
    color: 'bg-rose-500',
    title: 'Stealth Founder Radar',
    persona: 'VCs & Accelerators',
    desc: 'Proactively tracks stealth founder signal velocity across GitHub commits, registry changes, and talent migrations before decks are circulated.',
    stats: 'Pre-pitch sourcing intelligence',
  },
  {
    icon: Network,
    color: 'bg-cyan-600',
    title: 'B2B API & CRM Webhooks',
    persona: 'Accelerators & Enterprise',
    desc: 'Deep integration with external accelerator hubs, internal CRMs, and custom deal flow pipelines with automated scoring webhooks.',
    stats: 'Real-time bi-directional sync',
  },
];

/* ─────────────────────────────────────────────
   Data: IC Memo Sector Demos
───────────────────────────────────────────── */
const IC_MEMO_SECTORS = [
  {
    id: 'fintech',
    icon: Banknote,
    sector: 'Fintech & Agency Banking',
    company: 'Kipawa Agency FinTech',
    ask: '$1.5M Seed • Lead Syndicate',
    memoId: 'IC-2026-AF-04',
    score: 88.4,
    verdict: 'High Conviction',
    verdictColor: 'bg-emerald-600',
    bull: 'Dominates informal merchant liquidity corridors with 99.4% mobile money settlement uptime and deep agency moats.',
    bear: 'Cross-border expansion into Francophone West Africa requires separate regional payment aggregator licensing.',
    followOn: '78%',
  },
  {
    id: 'logistics',
    icon: Truck,
    sector: 'B2B Trade & Freight',
    company: 'Zeno Freight Corridors',
    ask: '$2.0M Seed • Co-Investment',
    memoId: 'IC-2026-AF-09',
    score: 84.1,
    verdict: 'Conditional',
    verdictColor: 'bg-amber-500',
    bull: 'Exclusive carrier contracts along Northern Corridor with negative working capital cash cycle.',
    bear: 'Diesel price inflation and border tariff changes represent variable cost volatility.',
    followOn: '82%',
  },
  {
    id: 'cleantech',
    icon: Sun,
    sector: 'Solar & E-Mobility',
    company: 'SunVolt Clean Grid',
    ask: '$1.8M Pre-A • Debt + Equity',
    memoId: 'IC-2026-AF-12',
    score: 79.6,
    verdict: 'Conditional',
    verdictColor: 'bg-amber-500',
    bull: 'Operating cost per km is 42% lower than petrol competitors, driving 100% rider retention.',
    bear: 'High initial CapEx battery financing requires a local currency debt facility not yet finalized.',
    followOn: '74%',
  },
];

/* ─────────────────────────────────────────────
   Data: Pricing Plans
───────────────────────────────────────────── */
const PRICING_PLANS = [
  {
    name: 'Founder Free',
    badge: 'For Startups',
    price: 0,
    period: 'forever',
    desc: 'Audit your pitch deck, calculate your fundability score, and host a watermarked data room.',
    popular: false,
    cta: 'Start Free as Founder',
    href: '/sign-up/startup',
    features: [
      '3 Pitch Deck Forensic Audits / month',
      'Fundability Score (0–100) & 8-Pillar Breakdown',
      'Unit Economics Math Validator',
      'Watermarked Data Room with Per-Slide Telemetry',
      'Standard Investor Match Sourcing',
    ],
  },
  {
    name: 'Institutional VC Pro',
    badge: 'Most Popular for Funds',
    price: 349,
    period: 'per month',
    desc: 'Multi-agent due diligence, automated deal screening, and 1-click IC memos for active venture teams.',
    popular: true,
    cta: 'Start VC Pro Trial',
    href: '/sign-up/investor',
    features: [
      'Unlimited Automated Deal Screening',
      'Pan-African 8-Pillar Forensic Underwriting',
      '1-Click IC Memo Generator (PDF, Markdown)',
      'Autonomous Voice Screener (15-min calls)',
      'Digital Brain Institutional Memory Graph',
      'Multi-Partner Consensus Voting & Annotation',
      'Per-Slide Data Room Engagement Telemetry',
      'Real-Time CRM & Email Webhooks',
    ],
  },
  {
    name: 'Accelerator & DFI',
    badge: 'Enterprise & Cohorts',
    price: 'Custom',
    period: 'billed annually',
    desc: 'Multi-cohort management, batch scoring pipelines, and Antler Hub deep integration.',
    popular: false,
    cta: 'Book Accelerator Demo',
    href: '/sign-up/investor',
    features: [
      'Everything in Institutional VC Pro',
      'Cohort Batch Upload & Scoring Dashboard',
      'Multi-Accelerator & CRM Bi-Directional Integration',
      'Dedicated B2B API Keys & Ingestion Webhooks',
      'Custom Rubric & White-Label Diligence Reports',
      'Multi-Tenant Enterprise Isolation & DFI Reports',
      'Dedicated Venture Diligence Support Partner',
    ],
  },
];

/* ─────────────────────────────────────────────
   Data: FAQs
───────────────────────────────────────────── */
const FAQS = [
  {
    q: 'Who is PitchMic built for?',
    a: 'PitchMic is purpose-built for three key groups: (1) Founders pre-auditing their decks to know their fundability score before pitching. (2) VC funds automating inbound deal screening, forensic unit economics, and 1-click IC memos. (3) Accelerators and DFIs managing high-volume cohort applications with batch scoring and CRM integration.',
  },
  {
    q: 'How does the Fundability Score work for founders?',
    a: 'The 0–100 Fundability Score analyzes your pitch deck across 8 institutional venture pillars: FX-adjusted unit economics, Delaware/Mauritius TopCo governance, payment rail redundancy, cross-border SAM, regulatory moats, founder ground velocity, market narrative, and financial coherence.',
  },
  {
    q: 'How does PitchMic integrate with accelerator hubs and CRMs?',
    a: 'PitchMic provides bi-directional sync with any accelerator hub (Y Combinator, Techstars, Flat6Labs, Norrsken, Antler) and cohort application management tools. Accelerators can batch-upload thousands of applicant decks, run automated 8-pillar scoring, filter the top 5% decile, and generate white-label diligence memos for investment committees.',
  },
  {
    q: 'How does the Autonomous Voice Screener work?',
    a: 'An AI venture associate calls founders on behalf of your fund, conducts a structured 15-minute qualification interview, cross-references founder responses against the deck, and generates a structured screening debrief - saving hundreds of partner hours.',
  },
  {
    q: 'Is data confidential and compliant across African jurisdictions?',
    a: 'Yes. All decks, financials, and IC memos are encrypted in transit and at rest with strict multi-tenant isolation. PitchMic complies with GDPR, NDPR (Nigeria), and POPIA (South Africa) standards.',
  },
];

export default function LandingPage() {
  const [activePersonaIdx, setActivePersonaIdx] = React.useState(0);
  const [activeMemoIdx, setActiveMemoIdx] = React.useState(0);
  const [billingAnnual, setBillingAnnual] = React.useState(true);
  const [openFaq, setOpenFaq] = React.useState<number | null>(null);

  const activePersona = HERO_PERSONAS[activePersonaIdx];
  const PersonaIcon = activePersona.icon;

  return (
    <MarketingShell>

      {/* ══════════════════════════════════════════════════════════════════════
          HERO SECTION - Unified Persona Engine Above the Fold
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden pt-8 pb-20 sm:pt-14 sm:pb-28">
        {/* Ambient Glows */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 left-1/2 h-[600px] w-[700px] -translate-x-1/2 rounded-full bg-brand-orange-500/10 blur-[140px]" />
          <div className="absolute top-60 right-0 h-[400px] w-[400px] rounded-full bg-indigo-500/10 blur-[120px]" />
          <div className="absolute bottom-0 left-0 h-[300px] w-[300px] rounded-full bg-emerald-500/8 blur-[100px]" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="text-center max-w-5xl mx-auto"
          >
            {/* Top Engine Pill */}
            <motion.div variants={fadeUp} className="flex justify-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/90 px-4 py-1.5 text-xs font-semibold text-slate-700 shadow-xs backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Pan-African Venture Diligence Engine</span>
                <span className="text-slate-300">|</span>
                <span className="text-brand-orange-600 font-bold">Founders · VCs · Accelerators</span>
              </div>
            </motion.div>

            {/* Master Headline */}
            <motion.h1
              variants={fadeUp}
              className="mt-6 text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-900 leading-[1.05]"
            >
              The AI Due Diligence &amp;{' '}
              <br className="hidden sm:block" />
              <span className="gradient-text">Fundability Platform</span>
              <br className="hidden sm:block" />
              built for African Venture.
            </motion.h1>

            {/* Framing & Interactive Persona Switcher */}
            <motion.div variants={fadeUp} className="mt-8 flex flex-col items-center">
              <p className="text-sm sm:text-base font-semibold text-slate-500 uppercase tracking-wider mb-3">
                One platform. Three purpose-built workflows:
              </p>

              {/* Persona Segmented Control */}
              <div className="inline-flex items-center rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm gap-1.5">
                {HERO_PERSONAS.map((p, idx) => {
                  const Icon = p.icon;
                  const isSelected = activePersonaIdx === idx;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setActivePersonaIdx(idx)}
                      className={`flex items-center gap-2 px-4 sm:px-6 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                        isSelected
                          ? 'bg-slate-900 text-white shadow-sm scale-[1.02]'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${isSelected ? 'text-brand-orange-400' : p.accentColor}`} />
                      <span>{p.tabLabel}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>

            {/* Dynamic Narrative Box (Changes per Persona) */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activePersona.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="mt-6 max-w-3xl mx-auto"
              >
                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border mb-3 ${activePersona.badgeBg}`}>
                  <PersonaIcon className="h-3.5 w-3.5" />
                  <span>{activePersona.tag}</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {activePersona.headline}
                </h2>
                <p className="mt-3 text-base text-slate-600 leading-relaxed">
                  {activePersona.subtitle}
                </p>

                {/* Primary Persona Actions */}
                <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Link href={activePersona.primaryHref}>
                    <Button
                      size="lg"
                      className="h-12 px-7 text-sm font-semibold shadow-lg shadow-slate-900/10 gap-2 bg-slate-900 hover:bg-slate-800 text-white"
                    >
                      <span>{activePersona.primaryCta}</span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href={activePersona.secondaryHref}>
                    <Button
                      size="lg"
                      variant="outline"
                      className="h-12 px-6 text-sm font-semibold border-slate-300 text-slate-700 hover:bg-slate-50 gap-2"
                    >
                      <span>{activePersona.secondaryCta}</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Trust Badges */}
            <motion.div
              variants={fadeUp}
              className="mt-8 flex flex-wrap justify-center gap-4 sm:gap-6 text-xs text-slate-500 font-medium"
            >
              {[
                'Free for Founders',
                '8-Pillar Pan-African Rubric',
                'Antler Hub Integration',
                'GDPR · NDPR · POPIA Compliant',
                'No credit card required',
              ].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  {t}
                </span>
              ))}
            </motion.div>
          </motion.div>

          {/* ── DYNAMIC INTERACTIVE CONSOLE (Changes per Persona) ── */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-12 max-w-4xl mx-auto"
          >
            <div className="rounded-3xl border border-slate-200/90 bg-white shadow-2xl shadow-slate-900/8 overflow-hidden">
              {/* Console Top Window Bar */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/80">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                    <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 ml-2">
                    pitchmic.ai / {activePersona.id === 'founders' ? 'founder-fundability-studio' : activePersona.id === 'vcs' ? 'vc-diligence-console' : 'accelerator-cohort-pipeline'}
                  </span>
                </div>
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                  <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                  Live Engine Active
                </Badge>
              </div>

              {/* Console Body: Rendered per persona */}
              <AnimatePresence mode="wait">
                {activePersona.id === 'founders' && (
                  <motion.div
                    key="founder-console"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="p-5 sm:p-7"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-100">
                      <div className="flex items-center gap-3.5">
                        <div className="h-12 w-12 rounded-2xl bg-brand-orange-500 text-white font-black text-sm flex items-center justify-center shadow-sm">
                          FS
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-slate-900 text-base">Your Startup Fundability Audit</h3>
                            <Badge className="bg-brand-orange-50 text-brand-orange-700 border-brand-orange-200 text-[10px] font-bold">
                              Pre-Pitch Audit
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">8-Pillar Underwriting Forensics • SAFE Term Calibrator</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="relative h-13 w-13">
                          <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                            <path className="text-slate-100" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                            <path className="text-brand-orange-500" strokeDasharray="88.4, 100" strokeWidth="3.5" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center font-black text-xs text-slate-900">88.4</span>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Fundability Score</div>
                          <Badge variant="default" className="bg-emerald-600 text-white font-bold text-xs mt-0.5">Top 5% Decile</Badge>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                      <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/60 text-emerald-900 flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span><strong>FX Unit Economics:</strong> USD margin model verified at 84% gross profit despite NGN/KES inflation.</span>
                      </div>
                      <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/60 text-emerald-900 flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span><strong>Governance Clean:</strong> Delaware TopCo flip + Kenya CMA compliance verified for VC investment.</span>
                      </div>
                      <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/60 text-amber-900 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <span><strong>Missing Slide Alert:</strong> Slide 7 missing clear CAC payback timeline. Added recommendation.</span>
                      </div>
                      <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200/60 text-indigo-900 flex items-start gap-2">
                        <DollarSign className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                        <span><strong>Standard Accelerator Term:</strong> $100k for 10% equity SAFE modeled with 18-month runway projection.</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activePersona.id === 'vcs' && (
                  <motion.div
                    key="vc-console"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="p-5 sm:p-7"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-100">
                      <div className="flex items-center gap-3.5">
                        <div className="h-12 w-12 rounded-2xl bg-slate-900 text-white font-black text-sm flex items-center justify-center">
                          KL
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-slate-900 text-base">Kipawa Logistics &amp; Agency FinTech</h3>
                            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">Top 5% Decile</Badge>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">Nairobi, Kenya • Lagos, Nigeria • $1.5M Seed • $12M Cap</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="relative h-13 w-13">
                          <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                            <path className="text-slate-100" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                            <path className="text-brand-orange-500" strokeDasharray="88.4, 100" strokeWidth="3.5" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center font-black text-xs text-slate-900">88.4</span>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Verdict</div>
                          <Badge variant="default" className="bg-emerald-600 text-white font-bold text-xs mt-0.5">High Conviction</Badge>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/60 text-emerald-900 flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>USD-denominated B2B revenue grew 3.2x YoY ($720k ARR)</span>
                      </div>
                      <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/60 text-emerald-900 flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>Clean Delaware TopCo + Kenya OpCo + Nigeria CAC incorporation</span>
                      </div>
                      <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/60 text-amber-900 flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span>CAC payback stretched to 5.2 months in Nigeria due to NGN FX float</span>
                      </div>
                      <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200/60 text-rose-900 flex items-start gap-2">
                        <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0 mt-0.5" />
                        <span>Slide 8 claims unverified CMA sandbox exemption - requires partner clarification</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activePersona.id === 'accelerators' && (
                  <motion.div
                    key="accelerator-console"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="p-5 sm:p-7"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-100">
                      <div className="flex items-center gap-3.5">
                        <div className="h-12 w-12 rounded-2xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center">
                          PA
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-slate-900 text-base">Pan-African Accelerator Cohort 1</h3>
                            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">1,420 Applications</Badge>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">Bi-Directional Hub &amp; CRM Sync • Batch 8-Pillar Scoring Active</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Top Decile Shortlist</div>
                          <div className="text-lg font-black text-emerald-600">71 Startups (5%)</div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2 text-xs">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-slate-900">1. Kipawa FinTech</span>
                          <span className="text-slate-400">Nairobi &bull; Seed</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-emerald-600">88.4 / 100</span>
                          <Badge className="bg-emerald-600 text-white text-[10px]">Shortlisted</Badge>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-slate-900">2. Zeno Freight Logistics</span>
                          <span className="text-slate-400">Lagos &bull; Pre-Seed</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-emerald-600">84.1 / 100</span>
                          <Badge className="bg-indigo-600 text-white text-[10px]">IC Review</Badge>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-slate-900">3. SunVolt Clean Grid</span>
                          <span className="text-slate-400">Cairo &bull; Seed</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-amber-600">79.6 / 100</span>
                          <Badge className="bg-slate-200 text-slate-700 text-[10px]">Screening</Badge>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          STATS BAR
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="border-y border-slate-200/80 bg-white py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 text-center"
          >
            {[
              { value: '54', label: 'African Jurisdictions' },
              { value: '8 Pillars', label: 'Forensic Rubric', color: 'text-brand-orange-600' },
              { value: '<60s', label: 'First-Pass Triage' },
              { value: '3 Personas', label: 'Founders · VCs · Accels', color: 'text-emerald-600' },
              { value: '1-Click', label: 'IC Memo Generation', color: 'text-indigo-600' },
            ].map((s) => (
              <div key={s.label}>
                <div className={`text-3xl sm:text-4xl font-black tracking-tight ${s.color ?? 'text-slate-900'}`}>{s.value}</div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{s.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          5-STEP VENTURE WORKFLOW
      ══════════════════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="py-20 sm:py-28 bg-slate-50/60 border-b border-slate-200/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-14"
          >
            <Badge variant="secondary" className="bg-slate-100 text-slate-700 border-slate-200 mb-3">5-Stage Linear Pipeline</Badge>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900">
              From first pitch to{' '}
              <span className="gradient-text">closed deal in 5 steps.</span>
            </h2>
          </motion.div>

          <div className="relative">
            {/* Horizontal connection line for desktop */}
            <div className="hidden lg:block absolute top-7 left-[calc(10%+28px)] right-[calc(10%+28px)] h-px bg-slate-200 z-0" />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 relative z-10">
              {WORKFLOW_STEPS.map((step, i) => (
                <motion.div
                  key={step.num}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.45 }}
                  className="flex flex-col items-center text-center"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg mb-5">
                    <step.icon className="h-6 w-6" />
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-brand-orange-500 mb-1">Step {step.num} - {step.phase}</div>
                  <h3 className="text-sm font-bold text-slate-900 mb-2">{step.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          CAPABILITIES - 6 Feature Deep-Dives
      ══════════════════════════════════════════════════════════════════════ */}
      <section id="features" className="py-20 sm:py-28 bg-white border-b border-slate-200/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-14"
          >
            <Badge variant="secondary" className="bg-slate-100 text-slate-700 border-slate-200 mb-3">Platform Capabilities</Badge>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900">
              Every tool you need.{' '}
              <span className="gradient-text">Nothing you don&apos;t.</span>
            </h2>
            <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto">
              Six integrated intelligence modules covering the entire venture lifecycle - from pre-pitch to portfolio management.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {CAPABILITIES.map((cap, i) => (
              <motion.div
                key={cap.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.45 }}
                className="group flex flex-col rounded-3xl border border-slate-200 bg-white p-7 shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${cap.color} text-white mb-5 shadow-md shadow-slate-200`}>
                  <cap.icon className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-1">{cap.title}</h3>
                <div className="mb-3">
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    {cap.persona}
                  </span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed flex-1">{cap.desc}</p>
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <span className="text-xs font-bold text-brand-orange-600">{cap.stats}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          1-CLICK IC MEMO STUDIO
      ══════════════════════════════════════════════════════════════════════ */}
      <section id="ic-memo" className="py-20 sm:py-28 bg-slate-50/60 border-b border-slate-200/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            {/* Left Narrative */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <Badge variant="secondary" className="bg-brand-orange-50 text-brand-orange-700 border-brand-orange-200 mb-3">
                Investment Committee Intelligence
              </Badge>
              <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
                Turn hours of review into{' '}
                <span className="gradient-text">LP-ready IC Memos in 1 click.</span>
              </h2>
              <p className="mt-5 text-base sm:text-lg text-slate-600 leading-relaxed">
                Auto-generate comprehensive memos with bull/bear thesis debates, Bayesian Series A follow-on probability, multi-partner consensus voting, and LP-ready citations - in seconds.
              </p>

              {/* Sector selector chips */}
              <div className="mt-7 flex flex-wrap gap-2">
                {IC_MEMO_SECTORS.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setActiveMemoIdx(i)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      activeMemoIdx === i
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <m.icon className="h-3.5 w-3.5" />
                    <span>{m.sector}</span>
                  </button>
                ))}
              </div>

              <ul className="mt-8 space-y-3.5 text-sm text-slate-700">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-brand-orange-500 shrink-0 mt-0.5" />
                  <span><strong>Automated Bull vs. Bear Debate:</strong> Synthesizes counter-arguments on currency float, regulatory pushback, and corridor expansion friction.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-brand-orange-500 shrink-0 mt-0.5" />
                  <span><strong>Multi-Partner Consensus Voting:</strong> Track Partner, Principal, and Scout conviction with structured memo annotations.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-brand-orange-500 shrink-0 mt-0.5" />
                  <span><strong>Institutional Memory Graph:</strong> Matches incoming startups against your fund&apos;s historical deals and co-investor syndicates.</span>
                </li>
              </ul>

              <div className="mt-8">
                <Link href="/sign-up/investor">
                  <Button size="lg" className="h-12 px-7 font-semibold gap-2 shadow-md shadow-brand-orange-500/20 bg-slate-900 hover:bg-slate-800 text-white">
                    Generate Sample IC Memo
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </motion.div>

            {/* Right: Memo Preview Card */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeMemoIdx}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.22 }}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5"
              >
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs">IC</div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">{IC_MEMO_SECTORS[activeMemoIdx].memoId}</div>
                      <div className="text-xs text-slate-400">{IC_MEMO_SECTORS[activeMemoIdx].ask}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-400 mb-0.5">Score</div>
                    <div className="text-xl font-black text-brand-orange-600">{IC_MEMO_SECTORS[activeMemoIdx].score}</div>
                  </div>
                </div>

                <div className="my-5 space-y-3.5 text-xs">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                      <Brain className="h-3.5 w-3.5 text-indigo-600" /> {IC_MEMO_SECTORS[activeMemoIdx].company}
                    </div>
                    <p className="text-slate-600 leading-relaxed text-[11px]">
                      Validated multi-currency unit economics, Delaware TopCo governance, and mobile money payment rail redundancy.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200/60 text-emerald-900">
                      <div className="font-bold mb-1 flex items-center gap-1">
                        <Check className="h-3 w-3 text-emerald-600" /> Bull Thesis
                      </div>
                      <p className="text-[11px] leading-relaxed">{IC_MEMO_SECTORS[activeMemoIdx].bull}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/60 text-amber-900">
                      <div className="font-bold mb-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-amber-600" /> Bear Thesis
                      </div>
                      <p className="text-[11px] leading-relaxed">{IC_MEMO_SECTORS[activeMemoIdx].bear}</p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-indigo-50/80 border border-indigo-200/60 text-indigo-900 flex items-center justify-between">
                    <span className="font-semibold">Series A Follow-On Probability:</span>
                    <span className="font-black text-sm text-indigo-700">{IC_MEMO_SECTORS[activeMemoIdx].followOn}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>Export: PDF · Markdown · Notion</span>
                  <Badge variant="default" className={`${IC_MEMO_SECTORS[activeMemoIdx].verdictColor} text-white text-[10px] font-bold`}>
                    {IC_MEMO_SECTORS[activeMemoIdx].verdict}
                  </Badge>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          ACCELERATOR & DFI SECTION (Dark Contrast Panel)
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="relative py-20 sm:py-28 bg-slate-950 overflow-hidden border-b border-slate-800">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 right-0 h-[400px] w-[500px] rounded-full blur-3xl opacity-15 bg-emerald-500" />
          <div className="absolute bottom-0 left-0 h-[300px] w-[400px] rounded-full blur-3xl opacity-10 bg-brand-orange-500" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">For Accelerators &amp; DFIs</span>
              <h2 className="mt-4 text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
                Manage 3,000 applications.{' '}
                <span className="text-emerald-400">Surface the top 1%.</span>
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-white/60">
                Accelerators and seed programs receive thousands of pitch decks per cohort. PitchMic cuts first-pass triage time by 80%, integrates directly with any accelerator hub or CRM, and provides batch scoring with configurable rubrics.
              </p>

              <div className="mt-8 space-y-4">
                {[
                  { icon: Activity, title: 'Batch Upload & Score Entire Cohorts', body: 'Upload thousands of applications at once. Every deck gets scored, ranked, and routed automatically.' },
                  { icon: GitMerge, title: 'Multi-Accelerator & CRM Integration', body: 'Bi-directional sync with any accelerator’s application pipeline. Shortlists, scores, and IC memos flow directly into your workflow.' },
                  { icon: Target, title: 'Custom Rubric & White-Label Reports', body: 'Configure your own underwriting criteria and generate white-label branded diligence reports for your LPs.' },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-emerald-400">
                      <item.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">{item.title}</div>
                      <div className="text-xs text-white/50 mt-0.5 leading-relaxed">{item.body}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/sign-up/investor">
                  <Button size="lg" className="h-12 px-7 font-semibold gap-2 bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20">
                    Book Accelerator Demo
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/#pricing">
                  <Button size="lg" variant="outline" className="h-12 px-7 font-semibold border-white/20 text-white/80 hover:bg-white/10 hover:text-white">
                    View Enterprise Pricing
                  </Button>
                </Link>
              </div>
            </motion.div>

            {/* Stats panel */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="grid grid-cols-2 gap-4"
            >
              {[
                { value: '80%', label: 'Triage Time Saved', color: 'text-emerald-400' },
                { value: '<60s', label: 'Per Deck Analysis', color: 'text-brand-orange-400' },
                { value: '54', label: 'Jurisdictions Covered', color: 'text-white' },
                { value: '8', label: 'Forensic Pillars', color: 'text-indigo-400' },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
                  <div className={`text-4xl font-black tracking-tight ${s.color}`}>{s.value}</div>
                  <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-white/40">{s.label}</div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          PRICING
      ══════════════════════════════════════════════════════════════════════ */}
      <section id="pricing" className="py-20 sm:py-28 bg-white border-b border-slate-200/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <Badge variant="secondary" className="bg-slate-100 text-slate-700 border-slate-200 mb-3">Pricing &amp; API</Badge>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900">
              Simple, transparent pricing.
            </h2>
            <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto">
              Founders are always free. VCs and accelerators pay for intelligence.
            </p>

            {/* Billing cycle toggle */}
            <div className="mt-6 inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1">
              <button
                type="button"
                onClick={() => setBillingAnnual(false)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${!billingAnnual ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingAnnual(true)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${billingAnnual ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Annual <span className="text-emerald-600 font-bold ml-1">Save 20%</span>
              </button>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PRICING_PLANS.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.45 }}
                className={`relative flex flex-col rounded-3xl border p-7 ${
                  plan.popular
                    ? 'border-slate-900 bg-slate-900 text-white shadow-2xl shadow-slate-900/20 scale-[1.02]'
                    : 'border-slate-200 bg-white shadow-xs'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-orange-500 px-3 py-1 text-[11px] font-bold text-white shadow-xs">
                      <Star className="h-3 w-3" /> Most Popular
                    </span>
                  </div>
                )}

                <div className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider w-fit mb-4 ${
                  plan.popular ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {plan.badge}
                </div>

                <h3 className={`text-xl font-bold mb-2 ${plan.popular ? 'text-white' : 'text-slate-900'}`}>{plan.name}</h3>
                <p className={`text-xs leading-relaxed mb-6 ${plan.popular ? 'text-white/60' : 'text-slate-500'}`}>{plan.desc}</p>

                <div className="mb-7">
                  {typeof plan.price === 'number' ? (
                    <div className="flex items-baseline gap-1">
                      <span className={`text-4xl font-black ${plan.popular ? 'text-white' : 'text-slate-900'}`}>
                        {plan.price === 0 ? 'Free' : `$${billingAnnual ? Math.round(plan.price * 0.8) : plan.price}`}
                      </span>
                      {plan.price > 0 && (
                        <span className={`text-xs ${plan.popular ? 'text-white/50' : 'text-slate-400'}`}>/{plan.period}</span>
                      )}
                    </div>
                  ) : (
                    <div className={`text-4xl font-black ${plan.popular ? 'text-white' : 'text-slate-900'}`}>Custom</div>
                  )}
                </div>

                <ul className="space-y-2.5 flex-1 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-xs">
                      <CheckCircle2 className={`h-4 w-4 shrink-0 mt-0.5 ${plan.popular ? 'text-brand-orange-400' : 'text-emerald-500'}`} />
                      <span className={plan.popular ? 'text-white/80' : 'text-slate-600'}>{f}</span>
                    </li>
                  ))}
                </ul>

                <Link href={plan.href}>
                  <Button
                    size="lg"
                    className={`w-full h-12 font-semibold gap-2 ${
                      plan.popular
                        ? 'bg-brand-orange-500 hover:bg-brand-orange-400 text-white shadow-lg shadow-brand-orange-500/30'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    <span>{plan.cta}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          FAQ SECTION
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-28 bg-slate-50/60 border-b border-slate-200/80">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <Badge variant="secondary" className="bg-slate-100 text-slate-700 border-slate-200 mb-3">FAQ</Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">Common questions</h2>
          </motion.div>

          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.4 }}
                className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-center justify-between px-6 py-4 text-left gap-4"
                >
                  <span className="text-sm font-semibold text-slate-900">{faq.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-500 shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`}
                  />
                </button>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22 }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 pb-5 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-4">
                        {faq.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          FINAL CALL TO ACTION
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="py-24 sm:py-32 bg-slate-900">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold text-white/80 mb-8">
              <Sparkles className="h-3.5 w-3.5 text-brand-orange-400" />
              <span>Pan-African Venture Intelligence · Live</span>
            </div>
            <h2 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
              The smarter way to{' '}
              <span className="text-brand-orange-400">pitch, diligence,</span>
              <br />
              and invest in Africa.
            </h2>
            <p className="mt-6 text-lg text-white/60 max-w-2xl mx-auto leading-relaxed">
              Founders get funded faster. VCs close deals with confidence. Accelerators find their top decile in minutes.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/sign-up/startup">
                <Button size="lg" variant="outline" className="h-13 px-8 font-semibold border-white/25 text-white hover:bg-white/10 gap-2">
                  <RocketIcon className="h-4 w-4" />
                  <span>Founders - Start Free</span>
                </Button>
              </Link>
              <Link href="/sign-up/investor">
                <Button size="lg" className="h-13 px-8 font-semibold gap-2 bg-brand-orange-500 hover:bg-brand-orange-400 text-white shadow-lg shadow-brand-orange-500/30">
                  <span>VCs &amp; Accelerators - Request Access</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>

            <p className="mt-6 text-xs text-white/30">
              No credit card required for founders · Enterprise SLA available · GDPR · NDPR · POPIA compliant
            </p>
          </motion.div>
        </div>
      </section>

    </MarketingShell>
  );
}
