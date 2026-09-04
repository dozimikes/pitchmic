'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, CheckCircle2, Clock, XCircle, ChevronRight,
  DollarSign, Percent, Calendar, Shield, ArrowRight, Layers, Plus, RefreshCw, Sparkles, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InvestmentCaseList, InvestmentCaseDetail, TermSheetRevision, CounterOfferPayload } from '@/lib/investorApi';
import { Button } from '@/components/ui/Button';

interface TermSheetWorkspaceProps {
  deals: InvestmentCaseList[];
  selectedDealId: number | null;
  dealDetail: InvestmentCaseDetail | null;
  onSelectDeal: (id: number) => void;
  onAcceptAndClose: (termSheetId: number) => void;
  onProposeCounterOffer?: (termSheetId: number, payload: CounterOfferPayload) => void;
}

const CHECKLIST_ICON: Record<string, { Icon: any; color: string }> = {
  verified: { Icon: CheckCircle2, color: 'text-emerald-400' },
  pending: { Icon: Clock, color: 'text-amber-400' },
  required: { Icon: XCircle, color: 'text-red-400' },
};

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-neutral-800 text-neutral-400 border-neutral-700',
  proposed: 'bg-blue-900/30 text-blue-400 border-blue-700/40',
  negotiating: 'bg-amber-900/30 text-amber-400 border-amber-700/40',
  accepted: 'bg-emerald-900/30 text-emerald-400 border-emerald-700/40',
  superseded: 'bg-neutral-800 text-neutral-500 border-neutral-700 line-through',
  rejected: 'bg-red-900/30 text-red-400 border-red-700/40',
};

function CapTableCalculator({ amount, valCap }: { amount: number; valCap: number }) {
  const [customAmt, setCustomAmt] = React.useState(amount);
  const [customCap, setCustomCap] = React.useState(valCap);
  const ownership = customCap > 0 ? ((customAmt / customCap) * 100) : 0;
  const founderDilution = ownership;
  const postMoney = customCap;

  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-800/30 p-4 space-y-4">
      <h4 className="text-xs font-semibold text-white uppercase tracking-widest">Live Cap Table Calculator</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-neutral-400 block mb-1">Investment Amount (USD)</label>
          <input
            type="number"
            value={customAmt}
            onChange={(e) => setCustomAmt(Number(e.target.value))}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="text-xs text-neutral-400 block mb-1">Valuation Cap (USD)</label>
          <input
            type="number"
            value={customCap}
            onChange={(e) => setCustomCap(Number(e.target.value))}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Investor Ownership', val: `${ownership.toFixed(2)}%`, color: 'text-violet-400' },
          { label: 'Founder Dilution', val: `${founderDilution.toFixed(2)}%`, color: 'text-amber-400' },
          { label: 'Post-Money Cap', val: `$${(postMoney / 1_000_000).toFixed(2)}M`, color: 'text-emerald-400' },
        ].map((m) => (
          <div key={m.label} className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 text-center">
            <div className={cn('text-xl font-bold font-mono', m.color)}>{m.val}</div>
            <div className="text-neutral-500 text-[10px] mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TermSheetCard({
  ts,
  onAccept,
  onOpenCounter,
}: {
  ts: TermSheetRevision;
  onAccept: () => void;
  onOpenCounter?: () => void;
}) {
  const [expanded, setExpanded] = React.useState(ts.status === 'proposed' || ts.status === 'negotiating');
  const checklist = ts.closing_checklist ?? [];
  const allVerified = checklist.length > 0 && checklist.every((c) => c.status === 'verified');

  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden transition-all',
      ts.status === 'accepted' ? 'border-emerald-700/40 bg-emerald-950/20' : 'border-neutral-700/50 bg-neutral-900/60'
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-neutral-800/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-xs font-bold text-white font-mono">
            v{ts.version_number}
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-white">
              {ts.instrument} · ${(parseFloat(ts.investment_amount_usd) / 1000).toFixed(0)}k @ ${(parseFloat(ts.valuation_cap_usd) / 1_000_000).toFixed(1)}M cap
            </div>
            <div className="text-xs text-neutral-500 mt-0.5">
              {new Date(ts.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('text-xs px-2 py-0.5 rounded border font-medium', STATUS_BADGE[ts.status] || STATUS_BADGE.draft)}>
            {ts.status}
          </span>
          <ChevronRight className={cn('w-4 h-4 text-neutral-600 transition-transform', expanded && 'rotate-90')} />
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-neutral-800/50">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
            {[
              { label: 'Instrument', val: ts.instrument, icon: FileText },
              { label: 'Discount', val: `${ts.discount_pct}%`, icon: Percent },
              { label: 'Target Ownership', val: `${ts.target_ownership_pct}%`, icon: Layers },
              { label: 'Board Rights', val: ts.board_rights, icon: Shield },
            ].map(({ label, val, icon: Icon }) => (
              <div key={label} className="p-3 rounded-xl bg-neutral-800/50 border border-neutral-700">
                <Icon className="w-3.5 h-3.5 text-neutral-500 mb-1" />
                <div className="text-xs text-neutral-500">{label}</div>
                <div className="text-sm font-semibold text-white mt-0.5">{val}</div>
              </div>
            ))}
          </div>

          {/* Cap Table Calculator */}
          <CapTableCalculator
            amount={parseFloat(ts.investment_amount_usd)}
            valCap={parseFloat(ts.valuation_cap_usd)}
          />

          {/* Closing Checklist */}
          {checklist.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2">Closing Checklist</h4>
              <div className="space-y-2">
                {checklist.map((item, i) => {
                  const cfg = CHECKLIST_ICON[item.status] || CHECKLIST_ICON.required;
                  return (
                    <div key={i} className="flex items-center gap-2.5 text-xs p-2.5 rounded-lg bg-neutral-800/40 border border-neutral-700/50">
                      <cfg.Icon className={cn('w-4 h-4 shrink-0', cfg.color)} />
                      <span className="text-neutral-300 flex-1">{item.item}</span>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', {
                        'bg-emerald-900/30 text-emerald-400': item.status === 'verified',
                        'bg-amber-900/30 text-amber-400': item.status === 'pending',
                        'bg-red-900/30 text-red-400': item.status === 'required',
                      })}>
                        {item.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Accept & Close button and Counter-Offer revision */}
          {['proposed', 'negotiating'].includes(ts.status) && (
            <div className="space-y-2">
              <Button
                onClick={onAccept}
                disabled={checklist.length > 0 && !allVerified}
                className={cn(
                  'w-full font-semibold text-sm',
                  allVerified || checklist.length === 0
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
                )}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {allVerified || checklist.length === 0
                  ? 'Accept & Close → Enroll in Portfolio'
                  : `Complete checklist first (${checklist.filter((c) => c.status !== 'verified').length} pending)`}
              </Button>
              {onOpenCounter && (
                <Button
                  variant="outline"
                  onClick={onOpenCounter}
                  className="w-full text-xs border-violet-700/50 text-violet-400 hover:bg-violet-900/20"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Propose Counter-Offer / Revision v{ts.version_number + 1}
                </Button>
              )}
            </div>
          )}
          {ts.status === 'accepted' && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-900/30 border border-emerald-700/30 text-sm text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Term sheet accepted and synchronized with founder portal.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TermSheetWorkspace({
  deals, selectedDealId, dealDetail, onSelectDeal, onAcceptAndClose, onProposeCounterOffer,
}: TermSheetWorkspaceProps) {
  const [showCounterModal, setShowCounterModal] = React.useState(false);
  const [activeTsId, setActiveTsId] = React.useState<number | null>(null);
  const [counterAmt, setCounterAmt] = React.useState(250000);
  const [counterCap, setCounterCap] = React.useState(5000000);
  const [counterDiscount, setCounterDiscount] = React.useState(20);
  const [counterOwnership, setCounterOwnership] = React.useState(5);
  const [counterInstrument, setCounterInstrument] = React.useState('SAFE');
  const [counterBoard, setCounterBoard] = React.useState('Observer Seat');

  const tsDeals = deals.filter((d) => ['TERM_SHEET', 'NEGOTIATION', 'CLOSING', 'PORTFOLIO', 'IC_REVIEW'].includes(d.status));

  const handleOpenCounter = (ts: TermSheetRevision) => {
    setActiveTsId(ts.id);
    setCounterAmt(parseFloat(ts.investment_amount_usd));
    setCounterCap(parseFloat(ts.valuation_cap_usd));
    setCounterDiscount(ts.discount_pct);
    setCounterOwnership(ts.target_ownership_pct);
    setCounterInstrument(ts.instrument);
    setCounterBoard(ts.board_rights);
    setShowCounterModal(true);
  };

  const handleSubmitCounter = () => {
    if (!activeTsId || !onProposeCounterOffer) return;
    onProposeCounterOffer(activeTsId, {
      investment_amount_usd: counterAmt,
      valuation_cap_usd: counterCap,
      discount_pct: counterDiscount,
      target_ownership_pct: counterOwnership,
      instrument: counterInstrument,
      board_rights: counterBoard,
      pro_rata_rights: true,
      information_rights: true,
    });
    setShowCounterModal(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-5 min-h-[600px]">
      {/* Deal Selector */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden">
        <div className="p-4 border-b border-neutral-800">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest">Eligible Deals</h3>
        </div>
        <div className="overflow-y-auto max-h-[680px]">
          {[...tsDeals, ...deals.filter((d) => !tsDeals.find((t) => t.id === d.id))].map((deal) => (
            <button
              key={deal.id}
              onClick={() => onSelectDeal(deal.id)}
              className={cn(
                'w-full text-left px-4 py-3.5 border-b border-neutral-800/50 transition-colors cursor-pointer',
                selectedDealId === deal.id ? 'bg-emerald-900/25 border-l-2 border-l-emerald-500' : 'hover:bg-neutral-800/40'
              )}
            >
              <div className="text-sm font-medium text-white">{deal.company_name}</div>
              <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1.5">
                <span className={cn('px-1 py-0.5 rounded text-[10px]', {
                  'bg-emerald-900/30 text-emerald-400': deal.status === 'TERM_SHEET',
                  'bg-amber-900/30 text-amber-400': deal.status === 'NEGOTIATION',
                  'bg-green-900/30 text-green-400': deal.status === 'PORTFOLIO',
                  'bg-neutral-800 text-neutral-500': !['TERM_SHEET', 'NEGOTIATION', 'PORTFOLIO'].includes(deal.status),
                })}>
                  {deal.status.replace('_', ' ')}
                </span>
                <span>{deal.industry}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Term Sheet Detail */}
      <div className="space-y-5">
        {!dealDetail ? (
          <div className="flex items-center justify-center h-64 rounded-2xl border border-dashed border-neutral-800 text-neutral-600 text-sm">
            Select a deal to view and manage term sheets.
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">{dealDetail.company_name}</h2>
                  <p className="text-sm text-neutral-400 mt-0.5">
                    {dealDetail.industry} · {dealDetail.geography}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-white font-mono">
                    ${(parseFloat(dealDetail.proposed_check_usd) / 1000).toFixed(0)}k
                  </div>
                  <div className="text-xs text-neutral-500">Proposed check</div>
                </div>
              </div>
            </div>

            {dealDetail.term_sheets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-neutral-800 text-center space-y-2">
                <FileText className="w-8 h-8 text-neutral-700" />
                <p className="text-neutral-500 text-sm">No term sheets issued yet for this deal.</p>
                <p className="text-neutral-600 text-xs">Term sheets are created once the IC approves investment.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-400" /> Term Sheet History
                  </h3>
                  <span className="text-xs text-neutral-500">{dealDetail.term_sheets.length} version{dealDetail.term_sheets.length !== 1 ? 's' : ''}</span>
                </div>
                {dealDetail.term_sheets.map((ts) => (
                  <TermSheetCard
                    key={ts.id}
                    ts={ts}
                    onAccept={() => onAcceptAndClose(ts.id)}
                    onOpenCounter={() => handleOpenCounter(ts)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Counter-Offer Revision Modal */}
      <AnimatePresence>
        {showCounterModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-violet-700/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-400" /> Propose Counter-Offer / Revision
                </h3>
                <button onClick={() => setShowCounterModal(false)} className="text-neutral-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-neutral-400 block mb-1">Investment Amount (USD)</label>
                    <input
                      type="number"
                      value={counterAmt}
                      onChange={(e) => setCounterAmt(Number(e.target.value))}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-neutral-400 block mb-1">Valuation Cap (USD)</label>
                    <input
                      type="number"
                      value={counterCap}
                      onChange={(e) => setCounterCap(Number(e.target.value))}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-neutral-400 block mb-1">Discount %</label>
                    <input
                      type="number"
                      value={counterDiscount}
                      onChange={(e) => setCounterDiscount(Number(e.target.value))}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-neutral-400 block mb-1">Target Ownership %</label>
                    <input
                      type="number"
                      value={counterOwnership}
                      onChange={(e) => setCounterOwnership(Number(e.target.value))}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-neutral-400 block mb-1">Instrument</label>
                    <select
                      value={counterInstrument}
                      onChange={(e) => setCounterInstrument(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="SAFE">Y Combinator Post-Money SAFE</option>
                      <option value="CONVERTIBLE_NOTE">Convertible Promissory Note</option>
                      <option value="PRICED_ROUND">Priced Preferred Equity</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-neutral-400 block mb-1">Board Representation</label>
                    <select
                      value={counterBoard}
                      onChange={(e) => setCounterBoard(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="Observer Seat">Observer Seat</option>
                      <option value="Full Board Seat">Full Board Seat</option>
                      <option value="None">None</option>
                    </select>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-violet-950/20 border border-violet-800/30 text-[11px] text-violet-300">
                  Submitting will draft the next version, mark the previous as superseded, and synchronize the terms with the founder portal.
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
                <Button variant="outline" size="sm" onClick={() => setShowCounterModal(false)} className="text-xs">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmitCounter}
                  className="text-xs bg-violet-600 hover:bg-violet-500 text-white"
                >
                  Publish Revision & Sync with Founder
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
