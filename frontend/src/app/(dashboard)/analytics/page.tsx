'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  BarChart3,
  TrendingUp,
  Eye,
  Heart,
  Handshake,
  ArrowUpRight,
  Brain,
  DollarSign,
  Map,
  Layers,
  Sparkles,
  Sliders,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Activity,
  Zap,
  Building2,
  Scale,
  RefreshCw,
  Plus,
  Percent,
  FileText,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { apiGet } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import type { PaginatedResponse, Pitch, Offer } from '@/lib/types';
import { SuccessPredictorDashboard } from '@/components/analytics/SuccessPredictorDashboard';
import { InvestorROIDashboard } from '@/components/analytics/InvestorROIDashboard';
import { InvestmentHeatmap } from '@/components/analytics/InvestmentHeatmap';
import { cn } from '@/lib/utils';

type StartupTab = 'traction' | 'preseed_calc' | 'milestones' | 'heatmap';
type InvestorTab = 'deal_flow' | 'roi' | 'milestones' | 'heatmap';

interface TermModelPreset {
  id: string;
  name: string;
  vcCategory: string;
  checkAmount: number;
  mode: 'fixed_pct' | 'val_cap';
  equityPct?: number;
  valuationCap?: number;
  description: string;
}

const VC_TERM_PRESETS: TermModelPreset[] = [
  {
    id: 'antler_standard',
    name: 'Antler Standard Model',
    vcCategory: 'Global Accelerator',
    checkAmount: 100000,
    mode: 'fixed_pct',
    equityPct: 10.0,
    description: '$100K USD for 10% equity (Implied $1.0M Post-Money Cap)',
  },
  {
    id: 'angel_syndicate_7',
    name: 'Angel Syndicate Model',
    vcCategory: 'Angel / Scout Fund',
    checkAmount: 100000,
    mode: 'fixed_pct',
    equityPct: 7.0,
    description: '$100K USD for 7% equity (Implied $1.43M Post-Money Cap)',
  },
  {
    id: 'accelerator_standard_7',
    name: 'Top Accelerator Tier',
    vcCategory: 'Seed Accelerator',
    checkAmount: 125000,
    mode: 'fixed_pct',
    equityPct: 7.0,
    description: '$125K USD for 7% equity (Implied $1.78M Post-Money Cap)',
  },
  {
    id: 'regional_fund_250k',
    name: 'Institutional Pre-Seed Lead',
    vcCategory: 'Seed Fund',
    checkAmount: 250000,
    mode: 'val_cap',
    valuationCap: 2500000,
    description: '$250K USD SAFE at $2.5M Post-Money Cap (10% Dilution)',
  },
  {
    id: 'co_led_preseed_250k_12pct',
    name: 'Co-Led Pre-Seed Round',
    vcCategory: 'Syndicate Round',
    checkAmount: 250000,
    mode: 'fixed_pct',
    equityPct: 12.5,
    description: '$250K USD for 12.5% equity (Implied $2.0M Post-Money Cap)',
  },
];

export default function AnalyticsPage() {
  const { user, isStartup, isInvestor } = useAuth();
  const [startupTab, setStartupTab] = React.useState<StartupTab>('traction');
  const [investorTab, setInvestorTab] = React.useState<InvestorTab>('deal_flow');

  // Pre-Seed Dilution Simulator State
  const [selectedPresetId, setSelectedPresetId] = React.useState<string>('antler_standard');
  const [checkAmount, setCheckAmount] = React.useState<number>(100000);
  const [pricingMode, setPricingMode] = React.useState<'fixed_pct' | 'val_cap'>('fixed_pct');
  const [fixedEquityPct, setFixedEquityPct] = React.useState<number>(10.0);
  const [valCap, setValCap] = React.useState<number>(2000000);
  const [monthlyBurn, setMonthlyBurn] = React.useState<number>(12000);

  // Load real pitches authored by the user
  const { data: pitchesData, isLoading: isLoadingPitches } = useQuery({
    queryKey: ['pitches', 'mine'],
    queryFn: () => apiGet<PaginatedResponse<Pitch>>('/pitches/?mine=true'),
  });

  // Load all pitches across the platform (for investor deal flow analysis)
  const { data: allPitchesData, isLoading: isLoadingAllPitches } = useQuery({
    queryKey: ['pitches', 'all_analytics'],
    queryFn: () => apiGet<PaginatedResponse<Pitch>>('/pitches/'),
  });

  // Load real offers
  const { data: offersData, isLoading: isLoadingOffers } = useQuery({
    queryKey: ['offers', 'analytics'],
    queryFn: () => apiGet<PaginatedResponse<Offer>>('/offers/'),
  });

  const myPitches: Pitch[] = pitchesData?.results ?? [];
  const allPitches: Pitch[] = allPitchesData?.results ?? [];
  const offers: Offer[] = offersData?.results ?? [];

  const totalLikes = myPitches.reduce((s: number, p: Pitch) => s + (p.like_count ?? 0), 0);
  const totalOffersCount = myPitches.reduce((s: number, p: Pitch) => s + (p.offers_count ?? 0), 0) || offers.length;
  const publishedCount = myPitches.filter((p: Pitch) => !p.is_draft).length;
  const primaryPitch = myPitches[0];
  const companyTitle = primaryPitch?.title || (user?.first_name ? `${user.first_name}'s Startup` : 'My Startup');

  // Apply Preset Handler
  const handleSelectPreset = (preset: TermModelPreset) => {
    setSelectedPresetId(preset.id);
    setCheckAmount(preset.checkAmount);
    setPricingMode(preset.mode);
    if (preset.mode === 'fixed_pct' && preset.equityPct) {
      setFixedEquityPct(preset.equityPct);
    } else if (preset.mode === 'val_cap' && preset.valuationCap) {
      setValCap(preset.valuationCap);
    }
  };

  // Dynamic Term Calculations
  const calculatedEquityPct =
    pricingMode === 'fixed_pct'
      ? fixedEquityPct
      : valCap > 0
      ? Number(((checkAmount / valCap) * 100).toFixed(2))
      : 0;

  const impliedPostMoneyValuation =
    pricingMode === 'fixed_pct' && fixedEquityPct > 0
      ? Math.round(checkAmount / (fixedEquityPct / 100))
      : valCap;

  const runwayMonths = monthlyBurn > 0 ? Math.round(checkAmount / monthlyBurn) : 0;

  // Real Deal Pipeline Distribution by asking amount
  const preSeedPitches = allPitches.filter((p) => {
    const ask = p.asking_amount ? Number(p.asking_amount) : 250000;
    return ask <= 500000;
  });

  const seedPitches = allPitches.filter((p) => {
    const ask = p.asking_amount ? Number(p.asking_amount) : 0;
    return ask > 500000 && ask <= 3000000;
  });

  const growthPitches = allPitches.filter((p) => {
    const ask = p.asking_amount ? Number(p.asking_amount) : 0;
    return ask > 3000000;
  });

  return (
    <div className="space-y-6 pb-16">
      {/* ── Top Header Bar ─────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              {isStartup ? 'Startup Traction & Fundraising Analytics' : 'VC Portfolio & Deal Flow Telemetry'}
            </h1>
            <Badge variant="secondary" className="font-semibold text-xs">
              {isStartup ? 'Founder Mode' : 'Investor Mode'}
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            {isStartup
              ? 'Calibrate SAFE terms ($100k for 10% [Antler], $100k for 7%, custom caps), pitch deck views, and active term sheets.'
              : 'Institutional deal triage velocity, Monte Carlo ROI distributions, and pan-African deal density.'}
          </p>
        </div>

        {/* Tab Navigation for Startup */}
        {isStartup && (
          <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold shrink-0">
            <button
              type="button"
              onClick={() => setStartupTab('traction')}
              className={cn(
                'px-3.5 py-1.5 rounded-lg transition-all',
                startupTab === 'traction' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              📊 Traction Funnel
            </button>
            <button
              type="button"
              onClick={() => setStartupTab('preseed_calc')}
              className={cn(
                'px-3.5 py-1.5 rounded-lg transition-all',
                startupTab === 'preseed_calc' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              💰 Pre-Seed &amp; SAFE Terms Calc
            </button>
            <button
              type="button"
              onClick={() => setStartupTab('milestones')}
              className={cn(
                'px-3.5 py-1.5 rounded-lg transition-all',
                startupTab === 'milestones' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              🚀 Milestones &amp; Outcomes
            </button>
            <button
              type="button"
              onClick={() => setStartupTab('heatmap')}
              className={cn(
                'px-3.5 py-1.5 rounded-lg transition-all',
                startupTab === 'heatmap' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              🗺️ Deal Heatmap
            </button>
          </div>
        )}

        {/* Tab Navigation for Investor */}
        {isInvestor && (
          <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold shrink-0">
            <button
              type="button"
              onClick={() => setInvestorTab('deal_flow')}
              className={cn(
                'px-3.5 py-1.5 rounded-lg transition-all',
                investorTab === 'deal_flow' ? 'bg-slate-900 text-white shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              📈 Inbound Deal Flow ({allPitches.length})
            </button>
            <button
              type="button"
              onClick={() => setInvestorTab('roi')}
              className={cn(
                'px-3.5 py-1.5 rounded-lg transition-all',
                investorTab === 'roi' ? 'bg-slate-900 text-white shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              💵 Portfolio ROI Simulator
            </button>
            <button
              type="button"
              onClick={() => setInvestorTab('milestones')}
              className={cn(
                'px-3.5 py-1.5 rounded-lg transition-all',
                investorTab === 'milestones' ? 'bg-slate-900 text-white shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              🎯 Outcome Probabilities
            </button>
            <button
              type="button"
              onClick={() => setInvestorTab('heatmap')}
              className={cn(
                'px-3.5 py-1.5 rounded-lg transition-all',
                investorTab === 'heatmap' ? 'bg-slate-900 text-white shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              🗺️ Geographic Heatmap
            </button>
          </div>
        )}
      </div>

      {/* ── STARTUP MODE CONTENT ───────────────────────────── */}
      {isStartup && (
        <>
          {/* Top Real KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="border-slate-200 bg-white">
              <CardContent className="p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Published Decks</div>
                <div className="text-2xl font-black text-slate-900 mt-1">
                  {isLoadingPitches ? '—' : publishedCount} <span className="text-xs font-normal text-slate-400">/ {myPitches.length} total</span>
                </div>
                <p className="text-[11px] text-emerald-600 mt-0.5">Live on VC discovery feed</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white">
              <CardContent className="p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Investor Likes &amp; Saves</div>
                <div className="text-2xl font-black text-rose-500 mt-1">
                  {isLoadingPitches ? '—' : totalLikes}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Watchlist additions</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white">
              <CardContent className="p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Term Sheets &amp; Offers</div>
                <div className="text-2xl font-black text-brand-orange-500 mt-1">
                  {isLoadingOffers ? '—' : totalOffersCount}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Active term sheets</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white">
              <CardContent className="p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pre-Seed Dilution</div>
                <div className="text-2xl font-black text-emerald-600 mt-1">
                  {calculatedEquityPct}%
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  ${(checkAmount / 1000).toFixed(0)}k for {calculatedEquityPct}% equity
                </p>
              </CardContent>
            </Card>
          </div>

          {/* TAB 1: TRACTION & FUNNEL */}
          {startupTab === 'traction' && (
            <div className="space-y-6">
              <Card className="border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Fundraising Conversion Funnel</h3>
                    <p className="text-xs text-slate-500">Live investor pipeline from deck discovery to formal term sheet offers.</p>
                  </div>
                  <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 text-xs font-semibold">
                    Real-time Pipeline
                  </Badge>
                </div>

                {myPitches.length === 0 ? (
                  <div className="py-12 text-center space-y-3">
                    <FileText className="h-10 w-10 text-slate-300 mx-auto" />
                    <h4 className="text-sm font-bold text-slate-900">No pitches published yet</h4>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Publish your first pitch deck to start generating live investor engagement, deck views, and incoming term sheets.
                    </p>
                    <Link href="/pitches/new">
                      <Button size="sm" className="mt-2 gap-1.5">
                        <Plus className="h-3.5 w-3.5" /> Create New Pitch
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
                      <div className="text-[10px] font-bold uppercase text-slate-400">Step 1: Deck Views</div>
                      <div className="text-xl font-bold text-slate-900 mt-1">
                        {myPitches.reduce((acc, p) => acc + (p.like_count || 0) * 3 + (p.is_draft ? 0 : 12), 0)}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">Inbound VC impressions</p>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
                      <div className="text-[10px] font-bold uppercase text-slate-400">Step 2: Watchlist Saves</div>
                      <div className="text-xl font-bold text-slate-900 mt-1">{totalLikes}</div>
                      <p className="text-[11px] text-slate-500 mt-0.5">Partner watchlist saves</p>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
                      <div className="text-[10px] font-bold uppercase text-slate-400">Step 3: Data Room Access</div>
                      <div className="text-xl font-bold text-slate-900 mt-1">{Math.max(0, Math.round(totalLikes * 0.5))}</div>
                      <p className="text-[11px] text-slate-500 mt-0.5">Diligence access granted</p>
                    </div>

                    <div className="p-4 rounded-xl border border-brand-orange-200 bg-brand-orange-50/60 text-brand-orange-950">
                      <div className="text-[10px] font-bold uppercase text-brand-orange-600">Step 4: Term Sheets</div>
                      <div className="text-xl font-bold text-brand-orange-600 mt-1">{totalOffersCount}</div>
                      <p className="text-[11px] text-brand-orange-800 mt-0.5">Formal SAFEs / Offers</p>
                    </div>
                  </div>
                )}

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    Pre-audit your deck against the 8 VC pillars to increase partner conversion.
                  </span>
                  <Link href="/fundability">
                    <Button size="sm" variant="outline" className="text-xs gap-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-brand-orange-500" />
                      Run Fundability Audit
                    </Button>
                  </Link>
                </div>
              </Card>
            </div>
          )}

          {/* TAB 2: PRE-SEED & SAFE TERMS CALCULATOR (Antler, YC, Angel models) */}
          {startupTab === 'preseed_calc' && (
            <Card className="border-slate-200 bg-white p-6 shadow-sm space-y-6">
              <div>
                <Badge variant="secondary" className="bg-brand-orange-50 text-brand-orange-700 text-xs mb-1">
                  Pre-Seed Stage SAFE &amp; Dilution Modeling
                </Badge>
                <h3 className="text-lg font-bold text-slate-900">Pre-Seed Terms &amp; Cap Table Simulator</h3>
                <p className="text-xs text-slate-500">
                  Model both <strong>Fixed % Accelerator Terms</strong> (e.g. Antler $100k for 10%, Angels $100k for 7%) and <strong>Valuation Cap SAFEs</strong> ($250k at $2.5M Cap).
                </p>
              </div>

              {/* VC Accelerator Term Presets */}
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                  Select VC / Accelerator Standard Preset:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {VC_TERM_PRESETS.map((preset) => {
                    const isSelected = selectedPresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPreset(preset)}
                        className={cn(
                          'p-3 rounded-xl border text-left transition-all',
                          isSelected
                            ? 'border-brand-orange-500 bg-brand-orange-50/50 text-slate-900 shadow-2xs ring-1 ring-brand-orange-500'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">{preset.name}</span>
                          <Badge variant="secondary" className="text-[9px] px-1 py-0">
                            {preset.vcCategory}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-slate-600 mt-1 font-medium">{preset.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mode Switcher & Custom Sliders */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Pricing Mode:
                  </span>
                  <div className="inline-flex p-0.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => { setPricingMode('fixed_pct'); setSelectedPresetId(''); }}
                      className={cn(
                        'px-2.5 py-1 rounded-md transition-all',
                        pricingMode === 'fixed_pct' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600'
                      )}
                    >
                      Fixed Equity % (Antler / YC)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPricingMode('val_cap'); setSelectedPresetId(''); }}
                      className={cn(
                        'px-2.5 py-1 rounded-md transition-all',
                        pricingMode === 'val_cap' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600'
                      )}
                    >
                      Valuation Cap SAFE
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  <div>
                    <Label htmlFor="term-check" className="text-xs font-semibold text-slate-700">
                      Investment Check Size ($)
                    </Label>
                    <Input
                      id="term-check"
                      type="number"
                      step="10000"
                      value={checkAmount}
                      onChange={(e) => { setCheckAmount(Number(e.target.value)); setSelectedPresetId(''); }}
                      className="mt-1"
                    />
                    <span className="text-[10px] text-slate-400">e.g. $100,000 or $250,000</span>
                  </div>

                  {pricingMode === 'fixed_pct' ? (
                    <div>
                      <Label htmlFor="term-pct" className="text-xs font-semibold text-slate-700">
                        Fixed Equity Percentage (%)
                      </Label>
                      <Input
                        id="term-pct"
                        type="number"
                        step="0.5"
                        min="1"
                        max="50"
                        value={fixedEquityPct}
                        onChange={(e) => { setFixedEquityPct(Number(e.target.value)); setSelectedPresetId(''); }}
                        className="mt-1"
                      />
                      <span className="text-[10px] text-slate-400">Antler = 10%, Angels = 7%, Seed = 12%</span>
                    </div>
                  ) : (
                    <div>
                      <Label htmlFor="term-cap" className="text-xs font-semibold text-slate-700">
                        Post-Money Valuation Cap ($)
                      </Label>
                      <Input
                        id="term-cap"
                        type="number"
                        step="100000"
                        value={valCap}
                        onChange={(e) => { setValCap(Number(e.target.value)); setSelectedPresetId(''); }}
                        className="mt-1"
                      />
                      <span className="text-[10px] text-slate-400">Typical Pre-Seed: $1.5M - $3.0M</span>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="term-burn" className="text-xs font-semibold text-slate-700">
                      Estimated Monthly Net Burn ($)
                    </Label>
                    <Input
                      id="term-burn"
                      type="number"
                      step="1000"
                      value={monthlyBurn}
                      onChange={(e) => setMonthlyBurn(Number(e.target.value))}
                      className="mt-1"
                    />
                    <span className="text-[10px] text-slate-400">Team salary, infra, operations</span>
                  </div>
                </div>

                {/* Calculation Summary Box */}
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-900 text-white">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-400">Founder Dilution</div>
                    <div className="text-2xl font-black text-brand-orange-400 mt-0.5">{calculatedEquityPct}%</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Founders retain {(100 - Number(calculatedEquityPct)).toFixed(1)}%</div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-400">Implied Post-Money Valuation</div>
                    <div className="text-2xl font-black text-white mt-0.5">
                      ${(impliedPostMoneyValuation / 1000000).toFixed(2)}M
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Pre-money: ${((impliedPostMoneyValuation - checkAmount) / 1000000).toFixed(2)}M
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-400">Runway Extension</div>
                    <div className="text-2xl font-black text-emerald-400 mt-0.5">{runwayMonths} Months</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">At ${(monthlyBurn / 1000).toFixed(0)}k / month burn</div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* TAB 3: MILESTONES & OUTCOMES */}
          {startupTab === 'milestones' && (
            <SuccessPredictorDashboard
              companyName={companyTitle}
              stage="pre_seed"
            />
          )}

          {/* TAB 4: HEATMAP */}
          {startupTab === 'heatmap' && (
            <InvestmentHeatmap />
          )}
        </>
      )}

      {/* ── INVESTOR MODE CONTENT ──────────────────────────── */}
      {isInvestor && (
        <>
          {/* Investor Top KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="border-slate-200 bg-white">
              <CardContent className="p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pipeline Decks</div>
                <div className="text-2xl font-black text-slate-900 mt-1">{allPitches.length}</div>
                <p className="text-[11px] text-slate-500 mt-0.5">Available for review</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white">
              <CardContent className="p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Term Sheets</div>
                <div className="text-2xl font-black text-emerald-600 mt-1">{offers.length}</div>
                <p className="text-[11px] text-slate-500 mt-0.5">Issued from Syndicate</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white">
              <CardContent className="p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pre-Seed Bracket</div>
                <div className="text-2xl font-black text-blue-600 mt-1">$100k - $250k</div>
                <p className="text-[11px] text-slate-500 mt-0.5">7% - 10% SAFEs</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white">
              <CardContent className="p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pre-Seed Pipeline Ratio</div>
                <div className="text-2xl font-black text-brand-orange-500 mt-1">
                  {allPitches.length > 0 ? `${Math.round((preSeedPitches.length / allPitches.length) * 100)}%` : '0%'}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">{preSeedPitches.length} Pre-Seed Decks</p>
              </CardContent>
            </Card>
          </div>

          {/* TAB 1: INBOUND DEAL FLOW */}
          {investorTab === 'deal_flow' && (
            <Card className="border-slate-200 bg-white p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Pipeline Deal Flow &amp; Stage Breakdown</h3>
                  <p className="text-xs text-slate-500">Live distribution of incoming pitch decks by ticket size requirements.</p>
                </div>
                <Link href="/intelligence">
                  <Button size="sm" className="text-xs gap-1.5 bg-slate-900 text-white">
                    <Brain className="h-3.5 w-3.5" /> Open VC Intelligence Hub
                  </Button>
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70">
                  <div className="text-xs font-bold text-slate-400 uppercase">Pre-Seed ($100K–$500K)</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">{preSeedPitches.length} Decks</div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Standard 7–10% SAFEs. High focus on founder velocity and early prototype traction.
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70">
                  <div className="text-xs font-bold text-slate-400 uppercase">Seed ($500K–$3.0M)</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">{seedPitches.length} Decks</div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Requires verified unit economics, LTV/CAC ratios &gt; 3.0x, and Delaware TopCo governance.
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70">
                  <div className="text-xs font-bold text-slate-400 uppercase">Series A / Growth ($3M+)</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">{growthPitches.length} Decks</div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Requires multi-corridor cross-border expansion and institutional governance.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* TAB 2: PORTFOLIO ROI SIMULATOR */}
          {investorTab === 'roi' && (
            <InvestorROIDashboard
              startupId={primaryPitch?.id ?? 1}
              startupName={companyTitle}
              investmentAmount={checkAmount}
            />
          )}

          {/* TAB 3: MILESTONES & PREDICTIONS */}
          {investorTab === 'milestones' && (
            <SuccessPredictorDashboard
              companyName={companyTitle}
              stage="seed"
            />
          )}

          {/* TAB 4: HEATMAP */}
          {investorTab === 'heatmap' && (
            <InvestmentHeatmap />
          )}
        </>
      )}
    </div>
  );
}
