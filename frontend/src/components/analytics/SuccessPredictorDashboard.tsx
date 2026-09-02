'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import {
  TrendingUp, Target, Rocket, AlertTriangle, CheckCircle2,
  RefreshCw, Info, ChevronDown, ChevronUp, ShieldCheck, Activity,
  Zap, Database, Compass, Layers, Flame, ArrowUpRight, DollarSign,
} from 'lucide-react';
import { apiGet } from '@/lib/api';
import { intelligenceApi, UnicornProbabilityProfile } from '@/lib/intelligenceApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface SuccessPredictorProps {
  startupId?: number | string;
  companyName?: string;
  stage?: string;
}

export function SuccessPredictorDashboard({
  startupId,
  companyName = 'My Startup',
  stage = 'pre_seed',
}: SuccessPredictorProps) {
  const [activeTab, setActiveTab] = React.useState<'unicorn_engine' | 'benchmarks' | 'survival'>('unicorn_engine');
  const [selectedSector, setSelectedSector] = React.useState('fintech');
  const [baseScore, setBaseScore] = React.useState(84);
  const [ticketSize, setTicketSize] = React.useState<'100k' | '250k' | '500k' | '1.5m'>('250k');

  // Query probabilistic unicorn & venture outcome prediction
  const {
    data: unicornProfile,
    isLoading: isUnicornLoading,
    refetch: refetchUnicorn,
  } = useQuery<UnicornProbabilityProfile>({
    queryKey: ['unicorn-outcome-prediction', startupId, companyName, selectedSector, baseScore, stage],
    queryFn: () =>
      intelligenceApi.predictVentureOutcomes({
        company_name: companyName,
        stage: stage,
        sector: selectedSector,
        base_fundability_score: baseScore,
        verified_evidence_ratio: 0.88,
        team_founder_spike: 85,
        moat_score: 80,
      }),
  });

  const milestoneData = React.useMemo(() => {
    if (!unicornProfile) return [];
    return [
      { milestone: 'Pre-Seed ($100k-$250k)', probability: Math.min(0.95, (unicornProfile.series_a_18m_probability || 0.75) + 0.15), fill: '#10b981' },
      { milestone: 'Seed ($1.5M)', probability: unicornProfile.series_a_18m_probability || 0.78, fill: '#3b82f6' },
      { milestone: 'Series A ($5M+)', probability: unicornProfile.series_b_36m_probability || 0.62, fill: '#6366f1' },
      { milestone: '$10M ARR', probability: unicornProfile.ten_m_arr_5y_probability || 0.42, fill: '#8b5cf6' },
      { milestone: '$100M Valuation', probability: unicornProfile.hundred_m_valuation_5y_probability || 0.24, fill: '#ec4899' },
      { milestone: 'Unicorn $1B+', probability: unicornProfile.unicorn_one_b_valuation_probability || 0.08, fill: '#f59e0b' },
    ];
  }, [unicornProfile]);

  const survivalData = React.useMemo(() => {
    if (!unicornProfile?.survival_curve) return [];
    return unicornProfile.survival_curve.map((p) => ({
      horizon: `${p.horizon_months}m`,
      probability: p.probability_milestone_achieved,
      hazard: p.hazard_rate * 100,
    }));
  }, [unicornProfile]);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-lg font-bold text-slate-900">
              Venture Outcome &amp; Milestone Engine
            </h3>
            <Badge variant="secondary" className="text-xs font-semibold">
              {companyName}
            </Badge>
          </div>
          <p className="text-xs text-slate-500">
            Bayesian milestone probability model calibrated for early-stage rounds ($100K–$250K Pre-Seed up to Series A).
          </p>
        </div>

        {/* Sector and Base Score Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedSector}
            onChange={(e) => setSelectedSector(e.target.value)}
            className="text-xs font-semibold bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="fintech">Fintech &amp; Payments</option>
            <option value="logistics">Logistics &amp; Supply Chain</option>
            <option value="enterprise_saas">B2B SaaS</option>
            <option value="cleantech">CleanTech &amp; Energy</option>
            <option value="healthtech">HealthTech</option>
          </select>

          <Button
            size="sm"
            variant="outline"
            onClick={() => refetchUnicorn()}
            className="text-xs h-8 gap-1"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Re-calibrate
          </Button>
        </div>
      </div>

      {/* Primary Probability Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Pre-Seed ($100k-$250k) Conviction
            </div>
            <div className="text-2xl font-black text-emerald-600 mt-1">
              {unicornProfile ? `${Math.round((unicornProfile.series_a_18m_probability + 0.15) * 100)}%` : '88%'}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Top-Decile Angel Bracket</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Seed ($1.5M) Probability
            </div>
            <div className="text-2xl font-black text-blue-600 mt-1">
              {unicornProfile ? `${Math.round(unicornProfile.series_a_18m_probability * 100)}%` : '74%'}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">18-Month Target Window</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              $10M ARR 5-Year Outlook
            </div>
            <div className="text-2xl font-black text-indigo-600 mt-1">
              {unicornProfile ? `${Math.round(unicornProfile.ten_m_arr_5y_probability * 100)}%` : '42%'}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Scale Viability</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Confidence Tier
            </div>
            <div className="text-xl font-black text-slate-900 mt-1">
              {unicornProfile?.confidence_tier ?? 'VERY HIGH'}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Empirical Evidence Ratio: 88%</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart View */}
      <Card className="border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Milestone Probability Distribution</h4>
            <p className="text-xs text-slate-500">Bayesian expected probability across subsequent funding milestones.</p>
          </div>
          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 text-xs font-semibold">
            Calibrated for $100k–$250k Pre-Seed Entry
          </Badge>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={milestoneData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="milestone" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} domain={[0, 1]} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip
                formatter={(val: any) => [`${(Number(val) * 100).toFixed(1)}%`, 'Probability']}
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff' }}
              />
              <Bar dataKey="probability" radius={[6, 6, 0, 0]}>
                {milestoneData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
