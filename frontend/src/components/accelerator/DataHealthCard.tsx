'use client';

import * as React from 'react';
import { Activity, AlertTriangle, CheckCircle2, HelpCircle, XCircle, Database, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { useIntelligence } from '@/app/(dashboard)/accelerator/IntelligenceContext';

type ProvenanceTier = 'LIVE' | 'DEGRADED' | 'FETCH_FAILED' | 'BASELINE';

interface DataHealthItem {
  label: string;
  tier: ProvenanceTier;
  freshness: string;
}

interface DataHealthCardProps {
  className?: string;
  title?: string;
  subtitle?: string;
  items?: DataHealthItem[];
  showExplanationTrigger?: boolean;
}

const TIER_STYLE: Record<ProvenanceTier, { text: string; bg: string; border: string; icon: React.ComponentType<{ className?: string }> }> = {
  LIVE:        { text: 'text-emerald-700',   bg: 'bg-emerald-50',   border: 'border-emerald-200',   icon: Zap },
  DEGRADED:    { text: 'text-amber-700',    bg: 'bg-amber-50',     border: 'border-amber-200',     icon: AlertTriangle },
  FETCH_FAILED:{ text: 'text-rose-700',     bg: 'bg-rose-50',      border: 'border-rose-200',      icon: XCircle },
  BASELINE:    { text: 'text-slate-600',    bg: 'bg-slate-100',    border: 'border-slate-200',     icon: HelpCircle },
};

const DEFAULT_ITEMS: DataHealthItem[] = [
  { label: 'Applications Register',  tier: 'LIVE',     freshness: 'Live · Synced' },
  { label: 'Reviewer Scorecards',    tier: 'LIVE',     freshness: 'Live · Synced' },
  { label: 'Evidence Vault',         tier: 'LIVE',     freshness: 'Live · Synced' },
  { label: 'Interview Calendar',     tier: 'BASELINE', freshness: 'Baseline · Pending connection' },
  { label: 'ML Signal Engine',       tier: 'BASELINE', freshness: 'Baseline · Awaiting configuration' },
  { label: 'CRM Ingestion',          tier: 'BASELINE', freshness: 'Baseline · Pending connection' },
  { label: 'Patent / Public Data',   tier: 'BASELINE', freshness: 'Baseline · Manual seed' },
];

export function DataHealthCard({
  className,
  title = 'Data Health & Provenance',
  subtitle = 'Per-source provenance tier — click any row for explanation',
  items = DEFAULT_ITEMS,
  showExplanationTrigger = true,
}: DataHealthCardProps) {
  const { openIntelligenceDrawer } = useIntelligence();

  const counts = React.useMemo(() => {
    const c: Record<ProvenanceTier, number> = { LIVE: 0, DEGRADED: 0, FETCH_FAILED: 0, BASELINE: 0 };
    items.forEach((i) => { c[i.tier] += 1; });
    return c;
  }, [items]);

  const overall =
    counts.FETCH_FAILED > 0 ? 'DEGRADED' :
    counts.DEGRADED > 2 ? 'DEGRADED' :
    counts.BASELINE >= 3 ? 'BASELINE' : 'LIVE';
  const overallStyle = TIER_STYLE[overall];

  return (
    <Card className={cn('bg-white border-slate-200 shadow-xs overflow-hidden', className)}>
      <CardContent className="p-5 space-y-4">
        {/* Header with overall status */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-600 shrink-0" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                {title}
              </h3>
            </div>
            <p className="text-xs text-slate-500 pl-6">{subtitle}</p>
          </div>
          <div className={cn('shrink-0 rounded-xl border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5', overallStyle.bg, overallStyle.border, overallStyle.text)}>
            <Activity className="w-3 h-3" />
            Overall: {overall}
          </div>
        </div>

        {/* Summary counts row */}
        <div className="grid grid-cols-4 gap-2 text-[11px]">
          {(['LIVE', 'DEGRADED', 'FETCH_FAILED', 'BASELINE'] as ProvenanceTier[]).map((tier) => {
            const s = TIER_STYLE[tier];
            const Icon = s.icon;
            return (
              <div
                key={tier}
                className={cn('rounded-lg border p-2 text-center', s.bg, s.border)}
              >
                <div className={cn('flex items-center justify-center gap-1 text-[9px] font-bold uppercase', s.text)}>
                  <Icon className="w-2.5 h-2.5" />
                  {tier.replace('_', ' ')}
                </div>
                <div className={cn('text-lg font-black mt-0.5 tabular-nums', s.text)}>{counts[tier]}</div>
              </div>
            );
          })}
        </div>

        {/* Source list */}
        <div className="space-y-1.5 pt-1">
          {items.map((item) => {
            const s = TIER_STYLE[item.tier];
            const Icon = s.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() =>
                  showExplanationTrigger &&
                  openIntelligenceDrawer({
                    title: `${item.label} — Provenance Tier`,
                    category: 'Data Health',
                    severity:
                      item.tier === 'FETCH_FAILED' ? 'HIGH' :
                      item.tier === 'DEGRADED' ? 'MEDIUM' :
                      item.tier === 'BASELINE' ? 'INFO' : 'LOW',
                    confidence: 0,
                    detectedAt: item.freshness,
                    evidence: [
                      `Provenance tier: ${item.tier}`,
                      item.tier === 'LIVE'
                        ? 'This source is currently reading from the live database.'
                        : item.tier === 'DEGRADED'
                          ? 'This source partially failed — some fields may be missing or delayed.'
                          : item.tier === 'FETCH_FAILED'
                            ? 'This source could not be reached. Values shown may be outdated.'
                            : 'Baseline state: this source has not been connected yet.',
                      `Freshness label: ${item.freshness}`,
                    ],
                    sources: [item.label],
                    model: 'Data health checks',
                    policy: 'Provenance Tier SLA Policy',
                  })
                }
                className={cn(
                  'w-full flex items-center justify-between gap-3 rounded-lg border border-transparent px-2.5 py-2 hover:border-slate-200 hover:bg-slate-50 transition text-left group',
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn('w-6 h-6 rounded flex items-center justify-center shrink-0 border', s.bg, s.border)}>
                    <Icon className={cn('w-3 h-3', s.text)} />
                  </span>
                  <span className="text-xs font-medium text-slate-800 truncate">{item.label}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold uppercase border', s.bg, s.border, s.text)}>
                    {item.tier.replace('_', ' ')}
                  </span>
                  <span className="text-[10px] text-slate-500 hidden sm:inline">{item.freshness}</span>
                  <CheckCircle2 className="w-3 h-3 text-slate-300 group-hover:text-indigo-600 transition" />
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
