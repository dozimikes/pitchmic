'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, TrendingDown, AlertTriangle, CheckCircle2, DollarSign,
  Percent, Info, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Separator } from '@/components/ui/Separator';
import { cn } from '@/lib/utils';
import type { Offer } from '@/lib/types';

interface OwnershipBreakdown {
  label: string;
  prePercent: number;
  postPercent: number;
  color: string;
}

interface CapTableDilutionModalProps {
  offer: Offer;
  onClose: () => void;
  /** Current total pre-money SAFE stack dilution (percentage points already given away), default 0 */
  existingSafeDilution?: number;
  /** Founder pre-round ownership %, default 80 */
  founderOwnership?: number;
  /** ESOP pool %, default 10 */
  esopPool?: number;
}

function formatPct(n: number) {
  return `${n.toFixed(2)}%`;
}

function formatUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function CapTableDilutionModal({
  offer,
  onClose,
  existingSafeDilution = 0,
  founderOwnership = 80,
  esopPool = 10,
}: CapTableDilutionModalProps) {
  // valuation field from the backend is post-money valuation cap (as string)
  const [valCap, setValCap] = React.useState(
    offer.valuation ? Number(offer.valuation) : 3_000_000,
  );
  const [discountPct, setDiscountPct] = React.useState(
    offer.equity_pct ? Number(offer.equity_pct) : 20,
  );
  const investAmount = Number(offer.amount ?? 0);

  // Post-money calculations
  const investorPostPct = valCap > 0 ? (investAmount / valCap) * 100 : 0;
  const cumulativeSafeDilution = existingSafeDilution + investorPostPct;
  const effectiveDiscount = discountPct > 0 ? `${discountPct}% discount at next priced round` : 'None';

  // Post-round founder ownership
  const founderPost = founderOwnership - investorPostPct;
  const esopPost = esopPool; // unchanged

  const isOverDiluted = cumulativeSafeDilution > 20;
  const isVeryDiluted = cumulativeSafeDilution > 30;

  const breakdown: OwnershipBreakdown[] = [
    {
      label: 'Founders',
      prePercent: founderOwnership,
      postPercent: Math.max(0, founderPost),
      color: 'bg-brand-orange-500',
    },
    {
      label: 'ESOP / Option Pool',
      prePercent: esopPool,
      postPercent: esopPost,
      color: 'bg-brand-deep-pitch-500',
    },
    {
      label: 'Existing SAFE holders',
      prePercent: existingSafeDilution,
      postPercent: existingSafeDilution,
      color: 'bg-slate-400',
    },
    {
      label: `This Investor (${offer.investor_name ?? 'Investor'})`,
      prePercent: 0,
      postPercent: investorPostPct,
      color: 'bg-emerald-500',
    },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-orange-500/10 to-brand-deep-pitch-500/10">
                <TrendingDown className="h-4.5 w-4.5 text-brand-orange-500" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Cap Table Dilution Simulator</h2>
                <p className="text-xs text-slate-500">Post-money SAFE impact on your ownership</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
            {/* Offer summary */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Investment Amount', value: formatUSD(investAmount), icon: DollarSign, color: 'text-emerald-600' },
                { label: 'Valuation Cap', value: formatUSD(valCap), icon: TrendingDown, color: 'text-brand-orange-500' },
                { label: 'Discount at Priced Round', value: `${discountPct}%`, icon: Percent, color: 'text-sky-600' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                    <Icon className={cn('mx-auto h-4 w-4 mb-1', item.color)} />
                    <p className="text-lg font-bold text-slate-900 tabular-nums">{item.value}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{item.label}</p>
                  </div>
                );
              })}
            </div>

            <Separator />

            {/* Adjustable valuation cap */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-slate-700">Simulate Valuation Cap</label>
                <span className="text-sm font-bold text-brand-orange-500 tabular-nums">{formatUSD(valCap)}</span>
              </div>
              <input
                type="range"
                min={500_000}
                max={20_000_000}
                step={100_000}
                value={valCap}
                onChange={(e) => setValCap(Number(e.target.value))}
                className="w-full accent-brand-orange-500"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>$500K</span>
                <span>$20M</span>
              </div>
            </div>

            {/* Results */}
            <div>
              <p className="mb-3 text-sm font-semibold text-slate-700">Ownership After This SAFE</p>
              <div className="space-y-3">
                {breakdown.map((row) => (
                  <div key={row.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium text-slate-700">
                        <span className={cn('h-2.5 w-2.5 rounded-sm', row.color)} />
                        {row.label}
                      </span>
                      <div className="flex items-center gap-3 tabular-nums">
                        <span className="text-slate-400">{formatPct(row.prePercent)} before</span>
                        <span className="font-bold text-slate-900">{formatPct(row.postPercent)} after</span>
                      </div>
                    </div>
                    {/* Bar */}
                    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(row.postPercent, 100)}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        className={cn('h-full rounded-full', row.color)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stacked ownership bar */}
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Combined Cap Table (Post-SAFE)</p>
              <div className="flex h-7 w-full overflow-hidden rounded-full">
                {breakdown.filter((r) => r.postPercent > 0).map((row) => (
                  <motion.div
                    key={row.label}
                    initial={{ flex: 0 }}
                    animate={{ flex: row.postPercent }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className={cn('h-full', row.color)}
                    title={`${row.label}: ${formatPct(row.postPercent)}`}
                  />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {breakdown.filter((r) => r.postPercent > 0).map((row) => (
                  <span key={row.label} className="flex items-center gap-1 text-xs text-slate-600">
                    <span className={cn('h-2 w-2 rounded-sm', row.color)} />
                    {row.label}: {formatPct(row.postPercent)}
                  </span>
                ))}
              </div>
            </div>

            {/* Key metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500 font-medium">Investor Ownership</p>
                <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{formatPct(investorPostPct)}</p>
                <p className="mt-0.5 text-xs text-slate-500">on {formatUSD(valCap)} cap</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500 font-medium">Your Remaining Ownership</p>
                <p className={cn(
                  'mt-1 text-2xl font-bold tabular-nums',
                  founderPost < 50 ? 'text-red-600' : founderPost < 65 ? 'text-amber-600' : 'text-emerald-600',
                )}>
                  {formatPct(Math.max(0, founderPost))}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">down from {formatPct(founderOwnership)}</p>
              </div>
            </div>

            {/* SAFE stacking warning */}
            {isOverDiluted && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-4',
                  isVeryDiluted
                    ? 'border-red-200 bg-red-50'
                    : 'border-amber-200 bg-amber-50',
                )}
              >
                <AlertTriangle className={cn('h-4 w-4 shrink-0 mt-0.5', isVeryDiluted ? 'text-red-600' : 'text-amber-600')} />
                <div>
                  <p className={cn('text-sm font-semibold', isVeryDiluted ? 'text-red-900' : 'text-amber-900')}>
                    {isVeryDiluted ? 'Critical: Excessive SAFE Dilution' : 'SAFE Stacking Alert'}
                  </p>
                  <p className={cn('mt-0.5 text-xs', isVeryDiluted ? 'text-red-800' : 'text-amber-800')}>
                    Cumulative SAFE dilution of {formatPct(cumulativeSafeDilution)} is
                    {isVeryDiluted
                      ? ' critically high. Series A investors may require a SAFE cleanup at punitive conversion terms. Consult your cap table lawyer.'
                      : ' above the standard 20% pre-seed threshold. Consider negotiating a higher valuation cap before accepting.'}
                  </p>
                </div>
              </motion.div>
            )}

            {!isOverDiluted && (
              <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
                <div>
                  <p className="text-sm font-semibold text-emerald-900">Healthy Dilution Range</p>
                  <p className="mt-0.5 text-xs text-emerald-800">
                    Cumulative SAFE dilution of {formatPct(cumulativeSafeDilution)} is within the standard
                    pre-seed range. Founders typically retain {formatPct(Math.max(0, founderPost))} after this round.
                  </p>
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
              <p className="text-xs text-slate-400">
                This simulation is for illustrative purposes only. Actual dilution depends on your final cap table, conversion mechanics, and legal documentation. Consult a qualified attorney before signing any term sheet.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button
              variant="default"
              className="bg-brand-orange-500 hover:bg-brand-orange-600"
              onClick={onClose}
            >
              Got it
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
