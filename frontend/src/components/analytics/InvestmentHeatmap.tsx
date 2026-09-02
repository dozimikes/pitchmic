'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, ResponsiveContainer, Cell,
} from 'recharts';
import { BarChart3, MapPin, TrendingUp, RefreshCw } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

//  Types 

interface IndustryRow {
  startup__industry: string;
  count: number;
  avg_offers?: number;
}

interface RegionRow {
  location: string;
  count: number;
}

interface MonthRow {
  month: string;
  count: number;
}

interface HeatmapData {
  by_industry: IndustryRow[];
  by_region: RegionRow[];
  by_month: MonthRow[];
}

//  Colour scale for industry bars 

const INDUSTRY_COLORS = [
  '#6366f1', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#f97316', '#ef4444', '#ec4899',
  '#84cc16', '#14b8a6',
];

function getBarColor(idx: number) {
  return INDUSTRY_COLORS[idx % INDUSTRY_COLORS.length];
}

//  Sub-components 

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-64 rounded-xl bg-slate-100" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-48 rounded-xl bg-slate-100" />
        <div className="h-48 rounded-xl bg-slate-100" />
      </div>
    </div>
  );
}

function RegionBubble({ location, count, max }: { location: string; count: number; max: number }) {
  const pct = Math.max(5, Math.round((count / max) * 100));
  const size = 20 + Math.round(pct * 0.8);
  const colorIdx = location.toLowerCase().includes('nigeria') ? 0
    : location.toLowerCase().includes('kenya') ? 1
    : location.toLowerCase().includes('south africa') ? 2
    : location.toLowerCase().includes('ghana') ? 3
    : location.toLowerCase().includes('cairo') ? 4 : 5;

  return (
    <div className="flex items-center gap-3">
      <div
        className="rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-[10px]"
        style={{
          width: size,
          height: size,
          background: INDUSTRY_COLORS[colorIdx],
          fontSize: Math.max(8, size * 0.35),
        }}
      >
        {count}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-800 truncate">{location || 'Unknown'}</div>
        <div className="mt-0.5 bg-slate-200 rounded-full h-1.5 overflow-hidden" style={{ width: 100 }}>
          <div
            className="h-1.5 rounded-full"
            style={{ width: `${pct}%`, background: INDUSTRY_COLORS[colorIdx] }}
          />
        </div>
      </div>
    </div>
  );
}

//  Main Component 

export function InvestmentHeatmap() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<HeatmapData>({
    queryKey: ['analytics-heatmap'],
    queryFn: () => apiGet<HeatmapData>('/analytics/heatmap/'),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) return <Skeleton />;

  if (isError || !data) {
    return (
      <Card className="p-8 text-center border-dashed">
        <BarChart3 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500 mb-3">Heatmap data unavailable</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
        </Button>
      </Card>
    );
  }

  const industryData = (data.by_industry ?? [])
    .filter((r) => r.startup__industry)
    .slice(0, 12)
    .map((r) => ({ name: r.startup__industry || 'Other', count: r.count }));

  const regionData = data.by_region ?? [];
  const maxRegion = Math.max(1, ...regionData.map((r) => r.count));

  const monthData = (data.by_month ?? [])
    .slice(-12)
    .map((r) => ({
      month: r.month ? r.month.slice(0, 7) : 'N/A',
      offers: r.count,
    }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Investment Activity Heatmap</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Live aggregation of startup density, investor interest, and deal flow
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Industry bar chart */}
      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-500" />
            Startup Density by Industry
          </CardTitle>
        </CardHeader>
        <CardContent>
          {industryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={industryData} layout="vertical" barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  width={90}
                />
                <Tooltip formatter={(v: number) => [v, 'Startups']} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {industryData.map((_, idx) => (
                    <Cell key={idx} fill={getBarColor(idx)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-400 text-xs">
              No industry data available yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* Region bubbles + Monthly deal flow */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Region density */}
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-500" />
              Geographic Density
            </CardTitle>
          </CardHeader>
          <CardContent>
            {regionData.length > 0 ? (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {regionData.slice(0, 15).map((r, i) => (
                  <RegionBubble
                    key={i}
                    location={r.location}
                    count={r.count}
                    max={maxRegion}
                  />
                ))}
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-slate-400 text-xs">
                No geographic data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly offer volume */}
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              Monthly Deal Flow (Offers)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 9, fill: '#94a3b8' }}
                    tickFormatter={(v) => v.slice(5)}
                  />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip formatter={(v: number) => [v, 'Offers']} />
                  <Line
                    type="monotone"
                    dataKey="offers"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    dot={{ fill: '#2563eb', r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-40 flex items-center justify-center text-slate-400 text-xs">
                No monthly data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top 5 hot industries badges */}
      {industryData.length > 0 && (
        <Card className="p-4 border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
             Hottest Sectors Right Now
          </div>
          <div className="flex flex-wrap gap-2">
            {industryData.slice(0, 5).map((d, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white"
                style={{ background: getBarColor(i) }}
              >
                {d.name}
                <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-[10px]">
                  {d.count}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
