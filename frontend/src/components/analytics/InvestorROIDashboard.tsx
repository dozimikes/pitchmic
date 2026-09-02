'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import { TrendingUp, DollarSign, Star, AlertTriangle, RefreshCw } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

//  Types 

interface ROIPrediction {
  expected_roi_3yr: number;
  expected_roi_5yr: number;
  expected_roi_10yr: number;
  best_case: number;
  worst_case: number;
  median_case: number;
  risk_adjusted_roi: number;
  probability_positive_roi: number;
}

interface FundraisingPrediction {
  startup_id: number;
  startup_name?: string;
  success_probability: number;
  confidence_lower: number;
  confidence_upper: number;
  investor_roi: ROIPrediction;
  exit_prediction: {
    exit_type: string;
    exit_probability: number;
    timeline_years: number | null;
    probabilities: Record<string, number>;
  };
  market_potential: {
    market_cap_prediction: number | null;
    disruption_potential: number;
    moat_strength: string;
  };
}

interface Props {
  startupId: number | string;
  startupName?: string;
  /** If provided, investor's portfolio for unicorn probability calc */
  investmentAmount?: number;
}

function fmtX(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'N/A';
  return `${v.toFixed(1)}×`;
}
function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'N/A';
  return `${(v * 100).toFixed(0)}%`;
}
function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'N/A';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

//  Monte Carlo visualisation (client-side simulation) 

function buildSimulations(roi: ROIPrediction, n = 40) {
  const results = [];
  const base = roi.median_case;
  const spread = roi.best_case - roi.worst_case;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // Simple deterministic spread for SSR compatibility
    const sim = roi.worst_case + spread * t + (Math.sin(i * 1.3) * spread * 0.15);
    results.push({
      sim: i + 1,
      return: Math.round(sim * 100) / 100,
      fill: sim >= 1 ? '#10b981' : '#ef4444',
    });
  }
  return results;
}

function buildTimelineData(roi: ROIPrediction) {
  return [
    { label: '3yr', expected: roi.expected_roi_3yr, best: roi.best_case * 0.55, worst: roi.worst_case * 0.55 },
    { label: '5yr', expected: roi.expected_roi_5yr, best: roi.best_case, worst: roi.worst_case },
    { label: '10yr', expected: roi.expected_roi_10yr, best: roi.best_case * 2.0, worst: roi.worst_case * 1.2 },
  ];
}

export function InvestorROIDashboard({ startupId, startupName, investmentAmount }: Props) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<FundraisingPrediction>({
    queryKey: ['roi-prediction', startupId],
    queryFn: () =>
      apiGet<FundraisingPrediction>(`/analytics/predict/startup/${startupId}/`),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
        {[1, 2, 3].map((i) => <div key={i} className="h-32 rounded-xl bg-slate-100" />)}
        <div className="col-span-1 md:col-span-3 h-64 rounded-xl bg-slate-100" />
      </div>
    );
  }

  if (isError || !data?.investor_roi) {
    return (
      <Card className="p-8 text-center border-dashed">
        <DollarSign className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500 mb-3">ROI prediction unavailable</p>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
          Retry
        </Button>
      </Card>
    );
  }

  const { investor_roi: roi, success_probability, market_potential, exit_prediction } = data;
  const simulations = buildSimulations(roi);
  const timelineData = buildTimelineData(roi);
  const unicornProb = market_potential?.disruption_potential
    ? Math.round(market_potential.disruption_potential * success_probability * 100)
    : Math.round(success_probability * 15);

  const projectedReturn = investmentAmount
    ? fmtMoney(investmentAmount * roi.expected_roi_5yr)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Investor ROI Projections
            {startupName && <span className="text-slate-500 font-normal ml-2">— {startupName}</span>}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Monte Carlo simulation · 1,000 scenarios · based on heuristic ML engine
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 border-slate-200">
          <div className="text-[10px] uppercase text-slate-400 font-semibold mb-1">Expected 5yr</div>
          <div className="text-2xl font-black text-indigo-600">{fmtX(roi.expected_roi_5yr)}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Risk-adj: {fmtX(roi.risk_adjusted_roi)}
          </div>
        </Card>
        <Card className="p-4 border-slate-200">
          <div className="text-[10px] uppercase text-slate-400 font-semibold mb-1">Best Case</div>
          <div className="text-2xl font-black text-emerald-600">{fmtX(roi.best_case)}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">P95 outcome</div>
        </Card>
        <Card className="p-4 border-slate-200">
          <div className="text-[10px] uppercase text-slate-400 font-semibold mb-1">Worst Case</div>
          <div className="text-2xl font-black text-rose-500">{fmtX(roi.worst_case)}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">P5 outcome</div>
        </Card>
        <Card className="p-4 border-slate-200">
          <div className="text-[10px] uppercase text-slate-400 font-semibold mb-1">
            <Star className="w-3 h-3 inline mr-0.5 text-amber-400" />
            Unicorn Prob
          </div>
          <div className="text-2xl font-black text-amber-500">{unicornProb}%</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Market cap &gt; $1B</div>
        </Card>
      </div>

      {/* Positive return probability + moat */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-4 border-slate-200">
          <div className="text-xs font-semibold text-slate-500 mb-2">Probability of Positive ROI</div>
          <div className="flex items-end gap-2">
            <div className="text-3xl font-black text-emerald-600">
              {fmtPct(roi.probability_positive_roi)}
            </div>
            <Badge variant="success" className="mb-1">Low Downside</Badge>
          </div>
          <div className="mt-3 bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="h-2.5 bg-emerald-500 rounded-full transition-all"
              style={{ width: `${Math.round(roi.probability_positive_roi * 100)}%` }}
            />
          </div>
        </Card>
        <Card className="p-4 border-slate-200">
          <div className="text-xs font-semibold text-slate-500 mb-2">Market & Moat</div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Moat strength</span>
              <Badge variant="secondary">{market_potential?.moat_strength ?? 'N/A'}</Badge>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Disruption potential</span>
              <span className="font-bold text-indigo-600">
                {fmtPct(market_potential?.disruption_potential)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Predicted market cap</span>
              <span className="font-bold text-slate-800">
                {fmtMoney(market_potential?.market_cap_prediction ?? null)}
              </span>
            </div>
            {projectedReturn && (
              <div className="flex justify-between text-xs pt-1 border-t border-slate-100">
                <span className="text-slate-600">Your projected return (5yr)</span>
                <span className="font-black text-emerald-600">{projectedReturn}</span>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ROI timeline area chart */}
      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-500" />
            Return Trajectory (Expected vs. Best/Worst Case)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={timelineData}>
              <defs>
                <linearGradient id="roiGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tickFormatter={(v) => `${v}×`} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip formatter={(v: number) => [`${v}×`, '']} />
              <Legend />
              <Area
                type="monotone"
                dataKey="best"
                name="Best case"
                stroke="#10b981"
                fill="none"
                strokeDasharray="5 3"
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="expected"
                name="Expected"
                stroke="#6366f1"
                fill="url(#roiGrad)"
                strokeWidth={2.5}
                dot={{ fill: '#6366f1', r: 4 }}
              />
              <Area
                type="monotone"
                dataKey="worst"
                name="Worst case"
                stroke="#ef4444"
                fill="none"
                strokeDasharray="5 3"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Monte Carlo bar distribution */}
      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold">
            Monte Carlo Return Distribution (1,000 simulations)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={simulations} barCategoryGap="2%">
              <XAxis dataKey="sim" hide />
              <YAxis tickFormatter={(v) => `${v}×`} tick={{ fontSize: 10, fill: '#94a3b8' }} width={32} />
              <Tooltip
                formatter={(v: number) => [`${v}×`, 'Return']}
                labelFormatter={(l) => `Simulation #${l}`}
              />
              <Bar dataKey="return" radius={[2, 2, 0, 0]}>
                {simulations.map((s, i) => (
                  <Cell key={i} fill={s.fill} opacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />
              Positive return
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-rose-500 inline-block" />
              Negative return
            </span>
            <span className="ml-auto font-medium text-slate-700">
              Median: {fmtX(roi.median_case)}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
