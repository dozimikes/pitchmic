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
  Lightbulb,
  Rocket,
} from 'lucide-react';
import { MarketingShell } from '@/components/layout/MarketingShell';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { getRecurringPlanAmount, getYearlySavingsAmount, getEffectiveMonthlyAmount } from '@/lib/pricing';

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
    subtitle: 'Build your evidence-rich startup profile across 8 institutional dimensions: team, traction, market, financials, and more. Get a live Fundability Score and fix gaps before you walk into any investor room.',
    primaryCta: 'Build My Startup Profile',
    primaryHref: '/sign-up/startup',
    secondaryCta: 'View My Fundability Score',
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
    icon: Building2,
    phase: 'Profile',
    title: 'Build Your Startup Profile',
    desc: 'Complete 7 evidence-rich sections: Company Identity, Founders & Team, Product, Market, Traction, Financials, and Fundraising Round.',
  },
  {
    num: '02',
    icon: FileSearch,
    phase: 'Forensics',
    title: 'AI Multi-Dimension Audit',
    desc: 'The engine validates your data across 8 institutional dimensions: math consistency, FX-adjusted unit economics, governance, and payment rail redundancy.',
  },
  {
    num: '03',
    icon: BarChart3,
    phase: 'Scoring',
    title: 'Live Fundability Score',
    desc: 'Get a 0–100 Fundability Score with stage-calibrated decile rankings, gap analysis, and prioritised improvement actions.',
  },
  {
    num: '04',
    icon: FolderLock,
    phase: 'Evidence',
    title: 'Evidence Vault & Data Room',
    desc: 'Upload supporting documents to the Evidence Vault. Share watermarked data rooms with per-slide engagement telemetry.',
  },
  {
    num: '05',
    icon: Brain,
    phase: 'Pitch',
    title: 'Pitch Deck & Investor Match',
    desc: 'Generate a data-backed pitch deck, auto-match to aligned investors, and track every interaction with real-time engagement analytics.',
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

interface PricingPlan {
  slug: string;
  name: string;
  badge: string;
  price: string;
  period: string;
  yearly?: string;
  desc: string;
  popular: boolean;
  cta: string;
  href: string;
  header?: string;
  features: string[];
}

const FOUNDER_PRICING_PLANS: PricingPlan[] = [
  {
    slug: 'free',
    name: 'Free',
    badge: 'Free',
    price: '$0',
    period: 'forever',
    desc: 'For founders who want to understand where they stand.',
    popular: false,
    cta: 'Start for free',
    href: '/sign-up/startup',
    features: [
      'Startup profile',
      'Basic fundability assessment',
      '8-dimension fundability overview',
      'Startup stage assessment',
      'Evidence checklist',
      'Top 3 fundability gaps',
      'Basic pitch deck review',
      'Limited funding opportunity discovery',
    ],
  },
  {
    slug: 'founder-pro',
    name: 'Founder Pro',
    badge: 'Pro',
    price: '$9',
    period: '/month',
    desc: 'For founders actively preparing for investors, accelerators, grants, or a fundraising round.',
    popular: true,
    cta: 'Get Founder Pro',
    href: '/sign-up/startup',
    header: 'Everything in Free, plus:',
    features: [
      'Full fundability assessment',
      'Detailed 8-dimension analysis',
      'Complete evidence gap analysis',
      'Evidence vault',
      'Claim and evidence tracking',
      'Pitch deck forensic analysis',
      'Deck-to-profile consistency checks',
      'Data room readiness assessment',
      'Fundability improvement roadmap',
      'Program-specific readiness assessments',
      'Funding opportunity matching',
      'Application readiness analysis',
      'Application Intelligence engine',
      'Fundraising pipeline tracker',
      'AI-powered founder preparation tools',
      'Unlimited startup profile updates',
      'Fundability reassessment as your startup improves',
    ],
  },
  {
    slug: 'raise-pass',
    name: 'Raise Pass',
    badge: 'Raise Pass',
    price: '$25',
    period: '/ 30 days',
    desc: 'For founders preparing for a specific fundraising round, accelerator, grant, or investor application.',
    popular: false,
    cta: 'Get Raise Pass',
    href: '/sign-up/startup',
    header: 'Get full access to Founder Pro for 30 days, including:',
    features: [
      'Full startup assessment',
      'Full fundability analysis',
      'Pitch deck forensic review',
      'Evidence gap analysis',
      'Data room readiness',
      'Program and application assessment',
      'Application Intelligence engine',
      'Fundraising pipeline tracker',
      'Application red-team review',
      'Priority improvement roadmap',
      'Reassessment after you make improvements',
    ],
  },
];

/* ─────────────────────────────────────────────
   Data: FAQs
───────────────────────────────────────────── */
const FAQS = [
  {
    q: 'Who is PitchMic built for?',
    a: 'PitchMic is built for founders who want a clearer read on their startup readiness before fundraising. It helps you understand your strengths, identify weak signals, and prioritize the improvements that matter most to investors.',
  },
  {
    q: 'How does the Fundability Score work?',
    a: 'Your 0–100 Fundability Score is based on the signals that matter most in fundraising: traction, team strength, clarity of market, business model, evidence quality, and how ready your startup is for the next stage of capital.',
  },
  {
    q: 'What do I need to do to improve my score?',
    a: 'Start by completing the startup profile sections and reviewing the engine’s gaps. The platform tells you exactly which part of your readiness is weak and which actions will move your score fastest.',
  },
  {
    q: 'Does this replace my pitch deck?',
    a: 'No. It helps you prepare for a stronger pitch. You still need your story, product, and market narrative, but the score shows you where your evidence is thin and what to strengthen before outreach.',
  },
  {
    q: 'Is my startup data secure?',
    a: 'Yes. PitchMic is built with the same care you would expect for sensitive fundraising data, with secure handling and a focus on data privacy in the startup-building process.',
  },
];

export default function LandingPage() {
  const [openFaq, setOpenFaq] = React.useState<number | null>(null);

  return (
    <MarketingShell>
      <section className="relative overflow-hidden pt-8 pb-16 sm:pt-14 sm:pb-20">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 left-1/2 h-[600px] w-[700px] -translate-x-1/2 rounded-full bg-brand-orange-500/10 blur-[140px]" />
          <div className="absolute top-60 right-0 h-[400px] w-[400px] rounded-full bg-orange-500/8 blur-[120px]" />
        </div>

        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="text-center max-w-4xl mx-auto"
          >
            <motion.div variants={fadeUp} className="flex justify-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/90 px-4 py-1.5 text-xs font-semibold text-slate-700 shadow-xs backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Founder-first fundability engine</span>
              </div>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="mt-6 text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-900 leading-[1.05]"
            >
              Know your startup&apos;s{' '}
              <span className="gradient-text">readiness before you raise.</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mt-5 text-base sm:text-xl text-slate-600 leading-relaxed max-w-3xl mx-auto"
            >
              PitchMic turns your startup profile into a live fundability score with clear evidence, gaps, and next actions so you can fix what investors actually care about.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/sign-up/startup">
                <Button
                  size="lg"
                  className="h-12 px-7 text-sm font-semibold shadow-lg shadow-slate-900/10 gap-2 bg-slate-900 hover:bg-slate-800 text-white"
                >
                  <span>Start free as founder</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/fundability">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 px-6 text-sm font-semibold border-slate-300 text-slate-700 hover:bg-slate-50 gap-2"
                >
                  <span>See my fundability</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="mt-8 flex flex-wrap justify-center gap-2.5 sm:gap-3 text-xs text-slate-600 font-medium"
            >
              {[
                { icon: CheckCircle2, text: 'Free to assess & start', color: 'text-emerald-500' },
                { icon: ShieldCheck,  text: 'Evidence-calibrated 0–100 score', color: 'text-brand-orange-500' },
                { icon: Target,       text: 'Actionable gap roadmap', color: 'text-blue-500' },
                { icon: Lock,         text: 'Zero equity or commission', color: 'text-slate-500' },
              ].map(({ icon: Icon, text, color }) => (
                <span
                  key={text}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/90 px-3.5 py-1.5 shadow-2xs backdrop-blur-xs transition-colors hover:border-slate-300"
                >
                  <Icon className={cn('h-3.5 w-3.5 shrink-0', color)} />
                  <span>{text}</span>
                </span>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section id="fundability" className="border-y border-slate-200/80 bg-white py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 text-center"
          >
            {[
              { value: '8', label: 'Fundability dimensions' },
              { value: '7', label: 'Profile sections' },
              { value: '0–100', label: 'Live score' },
              { value: 'Top 10%', label: 'Fundability readiness' },
              { value: 'Next action', label: 'At every step' },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">{s.value}</div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{s.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      <section id="founder-path" className="py-16 sm:py-20 bg-white border-b border-slate-200/80">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <Badge variant="secondary" className="bg-brand-orange-50 text-brand-orange-700 border-brand-orange-200 mb-3">
              For founders
            </Badge>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
              Build your startup profile in{' '}
              <span className="gradient-text">7 evidence-rich sections.</span>
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-500 max-w-2xl mx-auto">
              Every section strengthens the fundability engine and tells you exactly what to fix before you pitch.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: 'Company identity',   icon: Building2,  num: '01', desc: 'Stage, model, geography, legal setup' },
              { label: 'Founders & team',    icon: Users,      num: '02', desc: 'Roles, capability, commitment' },
              { label: 'Product',            icon: Lightbulb,  num: '03', desc: 'Problem, product, differentiation' },
              { label: 'Market',             icon: Globe2,     num: '04', desc: 'Sectors, TAM, expansion scope' },
              { label: 'Traction',           icon: TrendingUp, num: '05', desc: 'MRR, customers, growth signals' },
              { label: 'Financials',         icon: DollarSign, num: '06', desc: 'Unit economics, runway, burn' },
              { label: 'Fundraising',        icon: Rocket,     num: '07', desc: 'Round strategy and financing plan' },
            ].map((section, i) => {
              const Icon = section.icon;
              return (
                <motion.div key={section.num} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06, duration: 0.4 }}>
                  <div className="flex flex-col items-center text-center p-4 rounded-2xl border border-slate-200 bg-slate-50/60 shadow-2xs">
                    <span className="text-[10px] font-black text-slate-300 tracking-widest mb-2">{section.num}</span>
                    <div className="h-10 w-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center mb-3 shadow-xs">
                      <Icon className="h-5 w-5 text-slate-500" />
                    </div>
                    <p className="text-xs font-bold text-slate-800 leading-tight mb-1">{section.label}</p>
                    <p className="text-[10px] text-slate-400 leading-snug hidden sm:block">{section.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.3, duration: 0.4 }} className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/sign-up/startup">
              <Button size="lg" className="h-11 px-7 font-semibold gap-2 bg-slate-900 hover:bg-slate-800 text-white shadow-md">
                Start building my profile
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/fundability">
              <Button size="lg" variant="outline" className="h-11 px-6 font-semibold border-slate-300 text-slate-700 hover:bg-slate-50 gap-2">
                <ShieldCheck className="h-4 w-4 text-brand-orange-500" />
                View fundability score
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      <section id="how-it-works" className="py-20 sm:py-28 bg-slate-50/60 border-b border-slate-200/80">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-center mb-14">
            <Badge variant="secondary" className="bg-slate-100 text-slate-700 border-slate-200 mb-3">Founder path</Badge>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900">
              From profile to{' '}
              <span className="gradient-text">fundable in 5 steps.</span>
            </h2>
          </motion.div>

          <div className="relative">
            <div className="hidden lg:block absolute top-7 left-[calc(10%+28px)] right-[calc(10%+28px)] h-px bg-slate-200 z-0" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 relative z-10">
              {WORKFLOW_STEPS.map((step, i) => (
                <motion.div key={step.num} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.45 }} className="flex flex-col items-center text-center">
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

      <section className="py-20 sm:py-28 bg-white border-b border-slate-200/80">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-center mb-12">
            <Badge variant="secondary" className="bg-slate-100 text-slate-700 border-slate-200 mb-3">What improves</Badge>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900">
              The engine shows you what matters most{' '}
              <span className="gradient-text">before fundraising.</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { icon: TrendingUp, title: 'Traction signals', text: 'See which traction metrics are weak and where early evidence can move the score.' },
              { icon: ShieldCheck, title: 'Evidence quality', text: 'Match claims to clear documentary support and avoid investor doubt on credibility.' },
              { icon: Rocket, title: 'Actionable next steps', text: 'Get a simple plan to improve your readiness instead of vague startup advice.' },
            ].map((item, i) => (
              <motion.div key={item.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.45 }} className="group flex flex-col rounded-3xl border border-slate-200 bg-white p-7 shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-orange-500 text-white mb-5 shadow-md shadow-slate-200">
                  <item.icon className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed flex-1">{item.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-20 sm:py-28 bg-white border-b border-slate-200/80">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-center mb-14">
            <Badge variant="secondary" className="bg-slate-100 text-slate-700 border-slate-200 mb-3">Founder Pricing</Badge>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900">
              Start free. Understand your fundability.{' '}
              <span className="gradient-text">Prepare with confidence.</span>
            </h2>
            <p className="mt-4 text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Build your startup profile, understand the evidence investors are likely to examine, and know what to improve before you apply.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {FOUNDER_PRICING_PLANS.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.45 }}
                className={`relative flex flex-col rounded-3xl border p-8 shadow-sm transition-all duration-300 ${
                  plan.popular
                    ? 'border-brand-orange-400 bg-white shadow-xl shadow-brand-orange-500/10 ring-2 ring-brand-orange-400/20 lg:-my-4 lg:py-10'
                    : 'border-slate-200 bg-slate-50 hover:shadow-md hover:border-slate-300'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <div className="inline-flex items-center rounded-full bg-brand-orange-500 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-md shadow-brand-orange-500/30">
                      Most popular
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                  </div>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-5xl font-black tracking-tight text-slate-900">{plan.price}</span>
                    <span className="text-sm font-semibold text-slate-500">{plan.period}</span>
                  </div>
                  {plan.yearly && (
                    <div className="mt-1.5 text-xs font-semibold text-brand-orange-600">{plan.yearly}</div>
                  )}
                  <p className="mt-4 text-sm text-slate-600 leading-relaxed">{plan.desc}</p>
                </div>

                <div className="mt-6">
                  {plan.header && (
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">{plan.header}</p>
                  )}
                  <ul className="space-y-2.5 text-sm text-slate-700">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500" />
                        <span className="leading-snug">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link href={plan.href} className="mt-8 pt-6 border-t border-slate-200/80 mt-auto">
                  <Button
                    size="lg"
                    className={`w-full h-12 font-semibold gap-2 ${
                      plan.popular
                        ? 'bg-brand-orange-500 hover:bg-brand-orange-400 text-white shadow-lg shadow-brand-orange-500/25'
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

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-20 rounded-3xl border border-slate-200 bg-gradient-to-br from-brand-orange-50 via-white to-emerald-50 p-8 sm:p-12"
          >
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 items-start">
              <div className="lg:col-span-2">
                <Badge variant="secondary" className="bg-brand-orange-100 text-brand-orange-700 border-brand-orange-200 mb-4">
                  Built for African founders
                </Badge>
                <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 leading-tight">
                  Start free. Pay when you&apos;re ready to prepare seriously.
                </h3>
                <p className="mt-4 text-sm sm:text-base text-slate-600 leading-relaxed">
                  Pitchmic is designed to make fundraising intelligence more accessible to founders across Africa.
                </p>
              </div>
              <div className="lg:col-span-3 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { icon: DollarSign, label: 'No commission on funding.' },
                    { icon: Award, label: 'No equity taken.' },
                    { icon: Clock, label: 'No long-term contract.' },
                    { icon: ShieldCheck, label: 'Cancel anytime.' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-3 rounded-2xl bg-white border border-slate-200/70 p-4 shadow-xs">
                      <div className="h-9 w-9 shrink-0 rounded-xl bg-brand-orange-50 border border-brand-orange-100 flex items-center justify-center">
                        <item.icon className="h-4 w-4 text-brand-orange-600" />
                      </div>
                      <p className="text-sm font-semibold text-slate-800 leading-snug pt-1">{item.label}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl bg-white border border-slate-200/70 p-5 sm:p-6 shadow-xs">
                  <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
                    Your startup owns its story. Pitchmic helps you{' '}
                    <span className="font-semibold text-slate-900">understand it</span>,{' '}
                    <span className="font-semibold text-slate-900">strengthen it</span>, and{' '}
                    <span className="font-semibold text-slate-900">prepare it</span> for the right opportunities.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-20 sm:py-28 bg-slate-50/60 border-b border-slate-200/80">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-center mb-12">
            <Badge variant="secondary" className="bg-slate-100 text-slate-700 border-slate-200 mb-3">FAQ</Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">Common founder questions</h2>
          </motion.div>

          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06, duration: 0.4 }} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)} className="flex w-full items-center justify-between px-6 py-4 text-left gap-4">
                  <span className="text-sm font-semibold text-slate-900">{faq.q}</span>
                  <ChevronDown className={`h-4 w-4 text-slate-500 shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                      <div className="px-6 pb-5 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-4">{faq.a}</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 sm:py-32 bg-slate-900">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold text-white/80 mb-8">
              <Sparkles className="h-3.5 w-3.5 text-brand-orange-400" />
              <span>Founder-first startup intelligence</span>
            </div>
            <h2 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
              Build a stronger case to{' '}
              <span className="text-brand-orange-400">raise with confidence.</span>
            </h2>
            <p className="mt-6 text-lg text-white/60 max-w-2xl mx-auto leading-relaxed">
              PitchMic helps founders understand their readiness, fix weak signals early, and prepare the evidence investors actually want to see.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/sign-up/startup">
                <Button size="lg" variant="outline" className="h-13 px-8 font-semibold border-white/25 text-white hover:bg-white/10 gap-2">
                  <RocketIcon className="h-4 w-4" />
                  <span>Start free</span>
                </Button>
              </Link>
              <Link href="/fundability">
                <Button size="lg" className="h-13 px-8 font-semibold gap-2 bg-brand-orange-500 hover:bg-brand-orange-400 text-white shadow-lg shadow-brand-orange-500/30">
                  <span>See fundability score</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </MarketingShell>
  );
}
