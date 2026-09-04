'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Clock,
  Briefcase, Target, Zap, ArrowUpRight, Building2,
  Inbox, Search, Microscope, Gavel, FileText, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardSummary, InvestmentFund } from '@/lib/investorApi';

interface InvestorDashboardProps {
  summary: DashboardSummary | undefined;
  funds: InvestmentFund[];
  selectedFundId: number | null;
  onNavigateTab: (tab: string) => void;
}

const PIPELINE_STAGES = [
  { key: 'new_inbox', label: 'Inbox', color: 'from-blue-600 to-blue-500', icon: Inbox, tab: 'dealflow' },
  { key: 'screening', label: 'Screening', color: 'from-amber-600 to-amber-500', icon: Search, tab: 'dealflow' },
  { key: 'diligence', label: 'Underwriting', color: 'from-violet-600 to-violet-500', icon: Microscope, tab: 'underwriting' },
  { key: 'awaiting_ic', label: 'IC Review', color: 'from-fuchsia-600 to-fuchsia-500', icon: Gavel, tab: 'ic' },
  { key: 'term_sheets', label: 'Term Sheets', color: 'from-emerald-600 to-emerald-500', icon: FileText, tab: 'termsheets' },
];

function MetricCard({
  label, value, sublabel, color, icon, onClick, urgent,
}: {
  label: string; value: string | number; sublabel?: string;
  color: string; icon: React.ReactNode; onClick?: () => void; urgent?: boolean;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, translateY: -2 }}
      onClick={onClick}
      className={cn(
        'relative rounded-2xl p-5 border cursor-pointer transition-shadow overflow-hidden',
        urgent
          ? 'border-red-500/40 bg-red-950/30'
          : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700',
        'shadow-lg'
      )}
    >
      <div className={cn('absolute inset-0 opacity-5 bg-gradient-to-br', color)} />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-bold text-white mt-1 tabular-nums">{value}</p>
          {sublabel && <p className="text-xs text-neutral-500 mt-1">{sublabel}</p>}
        </div>
        <div className={cn('p-2.5 rounded-xl bg-gradient-to-br text-white', color)}>
          {icon}
        </div>
      </div>
      {urgent && (
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      )}
    </motion.div>
  );
}

function ThesisGauge({ pct }: { pct: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} fill="none" stroke="#1f2937" strokeWidth="12" />
        <circle
          cx="65" cy="65" r={r} fill="none"
          stroke={color} strokeWidth="12"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 65 65)"
          style={{ transition: 'stroke-dasharray 1.2s ease' }}
        />
        <text x="65" y="60" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold">
          {pct.toFixed(0)}%
        </text>
        <text x="65" y="78" textAnchor="middle" fill="#6b7280" fontSize="9">
          THESIS FIT
        </text>
      </svg>
    </div>
  );
}

export function InvestorDashboard({ summary, funds, selectedFundId, onNavigateTab }: InvestorDashboardProps) {
  const fund = funds.find((f) => f.id === selectedFundId);
  const df = summary?.deal_flow;
  const pf = summary?.portfolio;
  const th = summary?.thesis;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <div className="space-y-8">
      {/* Morning Header */}
      <div className="relative rounded-3xl overflow-hidden border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950 p-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(120,119,198,0.15),_transparent_60%)]" />
        <div className="relative">
          <p className="text-neutral-400 text-sm font-medium">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h2 className="text-3xl font-bold text-white mt-1">{greeting}</h2>
          {fund && (
            <p className="text-neutral-400 text-sm mt-1 flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5" />
              {fund.firm_name} · {fund.name} ·{' '}
              <span className="text-emerald-400 font-semibold">
                ${(parseFloat(fund.deployed_capital_usd) / 1_000_000).toFixed(1)}M deployed
              </span>{' '}
              of ${(parseFloat(fund.fund_size_usd) / 1_000_000).toFixed(0)}M
            </p>
          )}
        </div>

        {/* Quick stats bar */}
        <div className="relative mt-6 flex flex-wrap gap-4">
          {[
            { label: 'New Deals', val: df?.new_inbox ?? 0, accent: 'text-blue-400' },
            { label: 'Thesis-Aligned', val: df?.thesis_aligned ?? 0, accent: 'text-violet-400' },
            { label: 'Priority', val: df?.priority ?? 0, accent: 'text-amber-400' },
            { label: 'Awaiting IC', val: df?.awaiting_ic ?? 0, accent: 'text-fuchsia-400' },
            { label: 'Portfolio Alerts', val: pf?.active_alerts ?? 0, accent: 'text-red-400' },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center px-5 py-3 rounded-xl bg-neutral-800/50 border border-neutral-700/50 min-w-[90px]">
              <span className={cn('text-2xl font-bold tabular-nums', s.accent)}>{s.val}</span>
              <span className="text-neutral-500 text-xs mt-0.5 text-center">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline Funnel Cards */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">Deal Pipeline</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {PIPELINE_STAGES.map((stage) => {
            const val = df ? (df as any)[stage.key] ?? 0 : 0;
            return (
              <motion.button
                key={stage.key}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onNavigateTab(stage.tab)}
                className="rounded-2xl p-4 border border-neutral-800 bg-neutral-900/80 hover:border-neutral-700 text-left cursor-pointer transition-all"
              >
                <stage.icon className="w-6 h-6 mb-2 text-neutral-300" />
                <div className={cn('text-2xl font-bold tabular-nums bg-gradient-to-br bg-clip-text text-transparent', stage.color)}>
                  {val}
                </div>
                <div className="text-neutral-400 text-xs mt-1">{stage.label}</div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Bottom grid: Portfolio + Thesis + AI Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Portfolio Snapshot */}
        <div className="lg:col-span-2 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-emerald-400" /> Portfolio Intelligence
            </h3>
            <button
              onClick={() => onNavigateTab('portfolio')}
              className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
            >
              View All <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Companies', val: pf?.companies ?? 0, icon: <Building2 className="w-4 h-4" />, color: 'text-blue-400' },
              { label: 'Active Alerts', val: pf?.active_alerts ?? 0, icon: <AlertTriangle className="w-4 h-4" />, color: pf && pf.active_alerts > 0 ? 'text-red-400' : 'text-neutral-400', urgent: pf && pf.active_alerts > 0 },
              { label: 'Follow-On Candidates', val: pf?.follow_on_candidates ?? 0, icon: <TrendingUp className="w-4 h-4" />, color: 'text-emerald-400' },
            ].map((m) => (
              <div key={m.label} className={cn('rounded-xl p-4 border', m.urgent ? 'border-red-500/30 bg-red-950/20' : 'border-neutral-700 bg-neutral-800/50')}>
                <div className={cn('mb-2', m.color)}>{m.icon}</div>
                <div className={cn('text-2xl font-bold', m.color)}>{m.val}</div>
                <div className="text-neutral-500 text-xs mt-0.5">{m.label}</div>
              </div>
            ))}
          </div>
          {/* Watchlist triggered */}
          {th && th.watchlist_triggered > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-950/30 border border-emerald-700/30 text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-emerald-300">
                <strong>{th.watchlist_triggered}</strong> watchlist companies now meet your original investment criteria - time to re-engage.
              </span>
            </div>
          )}
        </div>

        {/* Thesis Gauge + AI Insights */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 flex flex-col gap-5">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Target className="w-4 h-4 text-violet-400" /> Thesis Alignment
          </h3>
          <div className="flex justify-center">
            <ThesisGauge pct={th?.avg_fit_pct ?? 0} />
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3 flex items-center gap-2">
              <Zap className="w-3 h-3 text-amber-400" /> AI Insights
            </h4>
            <ul className="space-y-2">
              {(summary?.ai_insights ?? []).length === 0 && (
                <li className="text-neutral-600 text-xs italic">Seed some investor data to surface insights.</li>
              )}
              {(summary?.ai_insights ?? []).map((insight, i) => (
                <li key={i} className="text-xs text-neutral-300 flex items-start gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                  {insight}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
