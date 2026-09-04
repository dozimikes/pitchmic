'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Rocket, RefreshCw, DollarSign, Building2, PieChart,
  ArrowUpRight, Bell, Clock, AlertCircle, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PortfolioCompany, FundExposure } from '@/lib/investorApi';
import { Button } from '@/components/ui/Button';

interface PortfolioIntelligenceProps {
  portfolio: PortfolioCompany[];
  exposure: FundExposure | undefined;
  onResolveAlert: (companyId: number, alertId: number) => void;
  onRefresh: () => void;
}

const ALERT_ICON: Record<string, { icon: React.ElementType; color: string; border: string; bg: string }> = {
  RUNWAY_RISK:       { icon: AlertCircle, color: 'text-red-400', border: 'border-red-700/40', bg: 'bg-red-950/20' },
  GROWTH_SLOWDOWN:   { icon: AlertTriangle, color: 'text-orange-400', border: 'border-orange-700/40', bg: 'bg-orange-950/20' },
  FOLLOW_ON_TRIGGER: { icon: TrendingUp, color: 'text-emerald-400', border: 'border-emerald-700/40', bg: 'bg-emerald-950/20' },
  SERIES_A_READY:    { icon: ArrowUpRight, color: 'text-blue-400', border: 'border-blue-700/40', bg: 'bg-blue-950/20' },
  KEY_HIRE:          { icon: Users, color: 'text-violet-400', border: 'border-violet-700/40', bg: 'bg-violet-950/20' },
};

const FOLLOW_ON_CONFIG: Record<string, { label: string; color: string; dotColor: string }> = {
  INVEST_MORE:   { label: 'Invest More', color: 'text-emerald-400 bg-emerald-900/30 border-emerald-700/30', dotColor: 'bg-emerald-500' },
  MAINTAIN:      { label: 'Maintain', color: 'text-blue-400 bg-blue-900/30 border-blue-700/30', dotColor: 'bg-blue-500' },
  DO_NOT_FOLLOW: { label: 'Do Not Follow', color: 'text-red-400 bg-red-900/30 border-red-700/30', dotColor: 'bg-red-500' },
  MONITOR:       { label: 'Monitor', color: 'text-amber-400 bg-amber-900/30 border-amber-700/30', dotColor: 'bg-amber-500' },
};

function ExposureBar({ items, title }: { items: FundExposure['geography']; title: string }) {
  const COLORS = [
    'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
    'bg-amber-500', 'bg-fuchsia-500', 'bg-rose-500', 'bg-teal-500',
  ];
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest">{title}</h4>
      {items.slice(0, 6).map((item, i) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="text-xs text-neutral-400 w-24 truncate">{item.label}</span>
          <div className="flex-1 h-2 rounded-full bg-neutral-800 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${item.pct}%` }}
              transition={{ duration: 0.8, delay: i * 0.05 }}
              className={cn('h-full rounded-full', COLORS[i % COLORS.length])}
            />
          </div>
          <span className="text-xs font-mono text-neutral-400 w-10 text-right">{item.pct.toFixed(0)}%</span>
        </div>
      ))}
    </div>
  );
}

function CompanyCard({
  company, onResolveAlert,
}: {
  company: PortfolioCompany;
  onResolveAlert: (alertId: number) => void;
}) {
  const [expanded, setExpanded] = React.useState(company.active_alerts_count > 0);
  const moicColor = company.holding_multiple >= 3 ? 'text-emerald-400'
    : company.holding_multiple >= 1.5 ? 'text-blue-400'
    : 'text-amber-400';
  const foCfg = FOLLOW_ON_CONFIG[company.follow_on_status] || FOLLOW_ON_CONFIG.MONITOR;

  return (
    <motion.div
      layout
      className={cn(
        'rounded-2xl border overflow-hidden transition-all',
        company.active_alerts_count > 0 && company.alerts.some((a) => a.alert_type === 'RUNWAY_RISK' && !a.is_resolved)
          ? 'border-red-700/40 bg-red-950/10'
          : 'border-neutral-700/50 bg-neutral-900/60'
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-neutral-800/20 transition-colors text-left"
      >
        {/* Company Name + Follow-On Status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white truncate">{company.company_name}</span>
            {company.active_alerts_count > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/40 text-red-400 border border-red-800/40">
                <Bell className="w-2.5 h-2.5" /> {company.active_alerts_count}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', foCfg.color)}>
              <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-1', foCfg.dotColor)} />
              {foCfg.label}
            </span>
            <span className="text-neutral-500 text-xs">
              Since {new Date(company.onboarded_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>

        {/* MOIC, Ownership, Value */}
        <div className="flex gap-4 shrink-0">
          <div className="text-center">
            <div className={cn('text-xl font-bold font-mono', moicColor)}>{company.holding_multiple.toFixed(1)}x</div>
            <div className="text-[10px] text-neutral-500">MOIC</div>
          </div>
          <div className="text-center hidden sm:block">
            <div className="text-sm font-bold text-white">
              ${(parseFloat(company.current_fair_value_usd) / 1_000_000).toFixed(1)}M
            </div>
            <div className="text-[10px] text-neutral-500">Fair Value</div>
          </div>
          <div className="text-center hidden md:block">
            <div className="text-sm font-bold text-neutral-400">
              {company.ownership_pct.toFixed(1)}%
            </div>
            <div className="text-[10px] text-neutral-500">Ownership</div>
          </div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-neutral-800/50"
          >
            <div className="px-5 py-4 space-y-3">
              {/* Metrics Row */}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Invested', val: `$${(parseFloat(company.invested_capital_usd) / 1000).toFixed(0)}k` },
                  { label: 'Entry Val.', val: `$${(parseFloat(company.entry_valuation_usd) / 1_000_000).toFixed(1)}M` },
                  { label: 'Current Val.', val: `$${(parseFloat(company.current_fair_value_usd) / 1_000_000).toFixed(1)}M` },
                  { label: 'Active Alerts', val: company.active_alerts_count.toString() },
                ].map((m) => (
                  <div key={m.label} className="p-2.5 rounded-xl bg-neutral-800/40 border border-neutral-700 text-center">
                    <div className="text-sm font-bold text-white font-mono">{m.val}</div>
                    <div className="text-[10px] text-neutral-500 mt-0.5">{m.label}</div>
                  </div>
                ))}
              </div>

              {/* Alerts */}
              {company.alerts.filter((a) => !a.is_resolved).length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Active Alerts</h4>
                  {company.alerts.filter((a) => !a.is_resolved).map((alert) => {
                    const cfg = ALERT_ICON[alert.alert_type] || ALERT_ICON.RUNWAY_RISK;
                    return (
                      <div key={alert.id} className={cn('flex items-start gap-3 p-3 rounded-xl border text-xs', cfg.bg, cfg.border)}>
                        <cfg.icon className={cn('w-4 h-4 shrink-0 mt-0.5', cfg.color)} />
                        <div className="flex-1 min-w-0">
                          <div className={cn('font-semibold', cfg.color)}>{alert.title}</div>
                          <div className="text-neutral-400 mt-0.5">{alert.description}</div>
                          {alert.metric_delta && (
                            <div className="text-neutral-500 text-[10px] mt-1 font-mono">{alert.metric_delta}</div>
                          )}
                        </div>
                        <button
                          onClick={() => onResolveAlert(alert.id)}
                          className="shrink-0 text-[10px] px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 border border-neutral-700 cursor-pointer transition-colors"
                        >
                          Resolve
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function PortfolioIntelligence({ portfolio, exposure, onResolveAlert, onRefresh }: PortfolioIntelligenceProps) {
  const [filter, setFilter] = React.useState<'all' | 'alerts' | 'follow_on'>('all');

  const totalInvested = portfolio.reduce((s, c) => s + parseFloat(c.invested_capital_usd), 0);
  const totalValue = portfolio.reduce((s, c) => s + parseFloat(c.current_fair_value_usd), 0);
  const avgMoic = portfolio.length > 0 ? portfolio.reduce((s, c) => s + c.holding_multiple, 0) / portfolio.length : 0;
  const totalAlerts = portfolio.reduce((s, c) => s + c.active_alerts_count, 0);

  const filtered = portfolio.filter((c) => {
    if (filter === 'alerts') return c.active_alerts_count > 0;
    if (filter === 'follow_on') return c.follow_on_status === 'INVEST_MORE';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Portfolio Summary Header */}
      <div className="relative rounded-3xl overflow-hidden border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950 p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(16,185,129,0.1),_transparent_70%)]" />
        <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Portfolio Companies', val: portfolio.length.toString(), color: 'text-white', sub: 'active investments' },
            { label: 'Total Invested', val: `$${(totalInvested / 1_000_000).toFixed(1)}M`, color: 'text-blue-400', sub: 'deployed capital' },
            { label: 'Current Value', val: `$${(totalValue / 1_000_000).toFixed(1)}M`, color: 'text-emerald-400', sub: 'estimated fair value' },
            { label: 'Avg. MOIC', val: `${avgMoic.toFixed(1)}x`, color: avgMoic >= 2 ? 'text-emerald-400' : 'text-amber-400', sub: 'multiple on capital' },
          ].map((m) => (
            <div key={m.label}>
              <div className={cn('text-3xl font-bold tabular-nums', m.color)}>{m.val}</div>
              <div className="text-neutral-400 text-xs mt-0.5 font-medium">{m.label}</div>
              <div className="text-neutral-600 text-[10px]">{m.sub}</div>
            </div>
          ))}
        </div>
        {totalAlerts > 0 && (
          <div className="relative mt-4 flex items-center gap-2 text-xs text-amber-300 bg-amber-900/20 border border-amber-700/30 rounded-xl px-4 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <strong>{totalAlerts} active alert{totalAlerts !== 1 ? 's' : ''}</strong> across {portfolio.filter((c) => c.active_alerts_count > 0).length} portfolio companies require attention.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-6">
        {/* Company List */}
        <div className="space-y-4">
          {/* Filter + Refresh */}
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="flex gap-1.5">
              {[
                { id: 'all', label: 'All Companies' },
                { id: 'alerts', label: `Active Alerts (${totalAlerts})` },
                { id: 'follow_on', label: 'Follow-On Candidates' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id as any)}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-lg border transition-colors cursor-pointer',
                    filter === f.id ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-neutral-600'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={onRefresh} className="text-xs border-neutral-700 text-neutral-400">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
            </Button>
          </div>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-neutral-800 text-center space-y-2">
              <Building2 className="w-8 h-8 text-neutral-700" />
              <p className="text-neutral-500 text-sm">No portfolio companies yet.</p>
              <p className="text-neutral-600 text-xs">Close a deal to enroll the first company.</p>
            </div>
          )}

          <div className="space-y-3">
            {filtered.map((company) => (
              <CompanyCard
                key={company.id}
                company={company}
                onResolveAlert={(alertId) => onResolveAlert(company.id, alertId)}
              />
            ))}
          </div>
        </div>

        {/* Fund Exposure Map */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <PieChart className="w-4 h-4 text-violet-400" /> Fund Exposure
            </h3>
            {exposure && (
              <span className="text-xs text-neutral-500">
                ${(exposure.total_invested_usd / 1_000_000).toFixed(1)}M deployed
              </span>
            )}
          </div>

          {!exposure || exposure.total_invested_usd === 0 ? (
            <p className="text-neutral-600 text-xs text-center py-8">
              No exposure data available. Close deals to see portfolio composition.
            </p>
          ) : (
            <div className="space-y-6">
              <ExposureBar items={exposure.geography} title="Geography" />
              <ExposureBar items={exposure.sector} title="Sector" />
              <ExposureBar items={exposure.stage} title="Stage" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
