'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, ChevronRight, Zap, MapPin, Building2,
  GitBranch, TrendingUp, Clock, ArrowRight, Plus, X, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InvestmentCaseList, IngestDealPayload, StartupOption } from '@/lib/investorApi';
import { Button } from '@/components/ui/Button';

interface DealFlowKanbanProps {
  deals: InvestmentCaseList[];
  selectedDealId: number | null;
  selectedFundId?: number | null;
  startups?: StartupOption[];
  onSelectDeal: (id: number) => void;
  onAdvanceStatus: (id: number, status: string) => void;
  onIngestDeal?: (payload: IngestDealPayload) => void;
}

const LANES = [
  { id: 'INBOX', label: 'Inbox', color: 'from-blue-600/20 to-blue-500/10', border: 'border-blue-700/40', badge: 'bg-blue-600', dot: 'bg-blue-500' },
  { id: 'SCREENING', label: 'Screening', color: 'from-amber-600/20 to-amber-500/10', border: 'border-amber-700/40', badge: 'bg-amber-600', dot: 'bg-amber-500' },
  { id: 'UNDERWRITING', label: 'Underwriting', color: 'from-violet-600/20 to-violet-500/10', border: 'border-violet-700/40', badge: 'bg-violet-600', dot: 'bg-violet-500' },
  { id: 'IC_REVIEW', label: 'IC Review', color: 'from-fuchsia-600/20 to-fuchsia-500/10', border: 'border-fuchsia-700/40', badge: 'bg-fuchsia-600', dot: 'bg-fuchsia-500' },
  { id: 'TERM_SHEET', label: 'Term Sheet', color: 'from-emerald-600/20 to-emerald-500/10', border: 'border-emerald-700/40', badge: 'bg-emerald-600', dot: 'bg-emerald-500' },
  { id: 'NEGOTIATION', label: 'Negotiation', color: 'from-teal-600/20 to-teal-500/10', border: 'border-teal-700/40', badge: 'bg-teal-600', dot: 'bg-teal-500' },
  { id: 'PORTFOLIO', label: 'Portfolio', color: 'from-green-600/20 to-green-500/10', border: 'border-green-700/40', badge: 'bg-green-600', dot: 'bg-green-500' },
  { id: 'WATCHLIST', label: 'Watchlist', color: 'from-slate-600/20 to-slate-500/10', border: 'border-slate-700/40', badge: 'bg-slate-600', dot: 'bg-slate-500' },
  { id: 'PASSED', label: 'Passed', color: 'from-red-900/20 to-red-900/10', border: 'border-red-900/40', badge: 'bg-red-900', dot: 'bg-red-700' },
];

const NEXT_STATUS: Record<string, string | null> = {
  INBOX: 'SCREENING',
  SCREENING: 'UNDERWRITING',
  UNDERWRITING: 'IC_REVIEW',
  IC_REVIEW: 'TERM_SHEET',
  TERM_SHEET: 'NEGOTIATION',
  NEGOTIATION: 'CLOSING',
  CLOSING: 'PORTFOLIO',
};

function fitBadge(score: number) {
  const color = score >= 85 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-600/30'
    : score >= 70 ? 'bg-amber-500/20 text-amber-400 border-amber-600/30'
    : 'bg-red-500/20 text-red-400 border-red-600/30';
  return <span className={cn('text-xs px-1.5 py-0.5 rounded border font-mono font-medium', color)}>{score.toFixed(0)}%</span>;
}

function DealCard({
  deal,
  isSelected,
  onSelect,
  onAdvance,
}: {
  deal: InvestmentCaseList;
  isSelected: boolean;
  onSelect: () => void;
  onAdvance: (status: string) => void;
}) {
  const nextStatus = NEXT_STATUS[deal.status];
  const hasConflict = deal.stage_conflict_detected || deal.portfolio_conflict_detected;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ scale: 1.015 }}
      onClick={onSelect}
      className={cn(
        'rounded-xl border p-3.5 cursor-pointer transition-all group',
        isSelected
          ? 'border-violet-500/60 bg-violet-900/20 shadow-lg shadow-violet-900/20'
          : 'border-neutral-700/50 bg-neutral-900/80 hover:border-neutral-600',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-white text-sm truncate">{deal.company_name}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-xs text-neutral-400 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {deal.geography || '-'}
            </span>
            <span className="text-neutral-600">·</span>
            <span className="text-xs text-neutral-400">{deal.industry}</span>
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          {fitBadge(deal.thesis_fit_score)}
          {deal.priority_tier === 'HIGH' && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-600/20 font-medium">
              HIGH
            </span>
          )}
        </div>
      </div>

      {/* Scores */}
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {[
          { label: 'Thesis', val: deal.thesis_fit_score },
          { label: 'Diligence', val: deal.underwriting_score },
          { label: 'Confidence', val: deal.evidence_confidence_score },
        ].map((s) => (
          <div key={s.label} className="flex flex-col">
            <span className="text-neutral-500 text-[10px]">{s.label}</span>
            <div className="mt-0.5 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  s.val >= 80 ? 'bg-emerald-500' : s.val >= 60 ? 'bg-amber-500' : 'bg-red-500'
                )}
                style={{ width: `${s.val}%` }}
              />
            </div>
            <span className="text-[10px] text-neutral-400 mt-0.5 font-mono">{s.val.toFixed(0)}</span>
          </div>
        ))}
      </div>

      {/* Flags */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700 uppercase tracking-wide">
          {deal.inferred_stage.replace('_', '-')}
        </span>
        {deal.sourcing_channel && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
            {deal.sourcing_channel.replace('_', ' ')}
          </span>
        )}
        {hasConflict && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 border border-red-800/50 flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5" /> Conflict
          </span>
        )}
        {deal.claims_count > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-900/30 text-violet-400 border border-violet-800/40">
            {deal.claims_count} claims
          </span>
        )}
      </div>

      {/* Ask */}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-neutral-500">
          Ask: <span className="text-white font-mono">${(parseFloat(deal.target_ask_usd) / 1000).toFixed(0)}k</span>
        </span>
        {nextStatus && (
          <button
            onClick={(e) => { e.stopPropagation(); onAdvance(nextStatus); }}
            className="text-[10px] px-2 py-1 rounded bg-neutral-800 hover:bg-violet-900/50 hover:text-violet-300 text-neutral-400 border border-neutral-700 hover:border-violet-700/50 transition-colors flex items-center gap-1 cursor-pointer"
          >
            → {nextStatus.replace('_', ' ')}
          </button>
        )}
      </div>
    </motion.div>
  );
}

export function DealFlowKanban({
  deals, selectedDealId, selectedFundId, startups = [], onSelectDeal, onAdvanceStatus, onIngestDeal,
}: DealFlowKanbanProps) {
  const [filterStatus, setFilterStatus] = React.useState<string | null>(null);
  const [showIngestModal, setShowIngestModal] = React.useState(false);
  const [selectedStartupId, setSelectedStartupId] = React.useState<number | null>(null);
  const [askAmount, setAskAmount] = React.useState(500000);
  const [sourcingChannel, setSourcingChannel] = React.useState('marketplace');
  const [ingestNotes, setIngestNotes] = React.useState('');

  const grouped = React.useMemo(() => {
    const map: Record<string, InvestmentCaseList[]> = {};
    LANES.forEach((l) => { map[l.id] = []; });
    deals.forEach((d) => {
      if (map[d.status]) map[d.status].push(d);
      else map['INBOX'].push(d);
    });
    return map;
  }, [deals]);

  const visibleLanes = filterStatus ? LANES.filter((l) => l.id === filterStatus) : LANES;

  const handleIngest = () => {
    if (!selectedStartupId || !selectedFundId || !onIngestDeal) return;
    onIngestDeal({
      startup_id: selectedStartupId,
      fund_id: selectedFundId,
      target_ask_usd: askAmount,
      sourcing_channel: sourcingChannel,
      notes: ingestNotes,
    });
    setShowIngestModal(false);
    setSelectedStartupId(null);
    setIngestNotes('');
  };

  return (
    <div className="space-y-5">
      {/* Filter Tabs + Inbound Sourcing Button */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setFilterStatus(null)}
            className={cn(
              'text-xs px-3 py-1.5 rounded-lg border transition-colors cursor-pointer',
              !filterStatus ? 'bg-violet-600 border-violet-500 text-white' : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-neutral-600'
            )}
          >
            All Stages
          </button>
          {LANES.map((l) => {
            const count = grouped[l.id]?.length ?? 0;
            return (
              <button
                key={l.id}
                onClick={() => setFilterStatus(l.id === filterStatus ? null : l.id)}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-lg border transition-colors cursor-pointer flex items-center gap-1.5',
                  filterStatus === l.id ? 'bg-violet-600 border-violet-500 text-white' : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-neutral-600'
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full', l.dot)} />
                {l.label}
                {count > 0 && <span className="text-neutral-500">({count})</span>}
              </button>
            );
          })}
        </div>

        {onIngestDeal && (
          <Button
            size="sm"
            onClick={() => setShowIngestModal(true)}
            className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Source New Deal
          </Button>
        )}
      </div>

      {/* Sourcing / Ingestion Modal */}
      <AnimatePresence>
        {showIngestModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-emerald-700/40 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" /> Inbound Deal Ingestion & Sourcing
                </h3>
                <button onClick={() => setShowIngestModal(false)} className="text-neutral-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-neutral-400 block mb-1">Select Startup / Opportunity</label>
                  <select
                    value={selectedStartupId || ''}
                    onChange={(e) => setSelectedStartupId(Number(e.target.value))}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Select startup to ingest...</option>
                    {startups.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.company_name} - {s.industry} ({s.location}) [{s.funding_stage.toUpperCase()}]
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-neutral-400 block mb-1">Target Ask (USD)</label>
                    <input
                      type="number"
                      value={askAmount}
                      onChange={(e) => setAskAmount(Number(e.target.value))}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-neutral-400 block mb-1">Sourcing Channel</label>
                    <select
                      value={sourcingChannel}
                      onChange={(e) => setSourcingChannel(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="marketplace">Pitchmic Marketplace</option>
                      <option value="founder_referral">Portfolio Founder Referral</option>
                      <option value="scout">Venture Scout</option>
                      <option value="warm_intro">Warm Relationship Path</option>
                      <option value="co_investor">Co-Investor Syndicate</option>
                      <option value="direct_application">Direct Application</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-neutral-400 block mb-1">Sourcing Context & Rationale (Optional)</label>
                  <textarea
                    rows={2}
                    value={ingestNotes}
                    onChange={(e) => setIngestNotes(e.target.value)}
                    placeholder="e.g. Sourced via scout network in Lagos; founder exited CTO role last month."
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-2.5 text-white text-xs resize-none focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
                <Button variant="outline" size="sm" onClick={() => setShowIngestModal(false)} className="text-xs">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!selectedStartupId}
                  onClick={handleIngest}
                  className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  Run Fit Engine & Ingest Deal
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Kanban lanes */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {visibleLanes.map((lane) => {
          const laneDeal = grouped[lane.id] ?? [];
          return (
            <div
              key={lane.id}
              className={cn(
                'shrink-0 w-72 rounded-2xl border bg-gradient-to-b p-3',
                lane.border, lane.color
              )}
            >
              {/* Lane Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full', lane.dot)} />
                  <span className="text-xs font-semibold text-white">{lane.label}</span>
                </div>
                <span className={cn('text-xs px-2 py-0.5 rounded-full text-white font-mono', lane.badge)}>
                  {laneDeal.length}
                </span>
              </div>

              {/* Deal Cards */}
              <div className="space-y-2.5 min-h-[80px]">
                <AnimatePresence>
                  {laneDeal.length === 0 && (
                    <motion.div
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="text-center text-neutral-700 text-xs py-6 rounded-xl border border-dashed border-neutral-800"
                    >
                      No deals here
                    </motion.div>
                  )}
                  {laneDeal.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      isSelected={deal.id === selectedDealId}
                      onSelect={() => onSelectDeal(deal.id)}
                      onAdvance={(s) => onAdvanceStatus(deal.id, s)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
