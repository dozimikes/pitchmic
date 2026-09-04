'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldAlert, ChevronDown, ChevronUp, CheckCircle2,
  XCircle, AlertCircle, Brain, Target, TrendingUp,
  Zap, DollarSign, BarChart3, ArrowUpRight, RefreshCw, Network, Sparkles, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InvestmentCaseList, InvestmentCaseDetail } from '@/lib/investorApi';
import { Button } from '@/components/ui/Button';

interface UnderwritingWorkspaceProps {
  deals: InvestmentCaseList[];
  selectedDealId: number | null;
  dealDetail: InvestmentCaseDetail | null;
  onSelectDeal: (id: number) => void;
  onChallengeScore: (payload: { dimension: string; new_score: number; evidence_justification: string }) => void;
  onGenerateMemo: () => void;
  onAdvanceToIC: () => void;
  onRecalculateFit?: () => void;
  onExtractClaims?: () => void;
}

function VerificationBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string; Icon: any }> = {
    verified: { label: 'Verified', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-600/30', Icon: CheckCircle2 },
    partially_verified: { label: 'Partial', color: 'text-amber-400 bg-amber-500/10 border-amber-600/30', Icon: AlertCircle },
    unverified: { label: 'Unverified', color: 'text-red-400 bg-red-500/10 border-red-600/30', Icon: XCircle },
    contradicted: { label: 'Contradicted', color: 'text-red-500 bg-red-500/15 border-red-500/40', Icon: ShieldAlert },
  };
  const c = cfg[status] || cfg.unverified;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium', c.color)}>
      <c.Icon className="w-2.5 h-2.5" /> {c.label}
    </span>
  );
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-neutral-400 w-32 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-neutral-800 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={cn('h-full rounded-full', color)}
        />
      </div>
      <span className="text-xs font-mono text-white w-10 text-right">{value.toFixed(0)}%</span>
    </div>
  );
}

function ChallengeModeModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (p: { dimension: string; new_score: number; evidence_justification: string }) => void;
}) {
  const [dim, setDim] = React.useState('');
  const [score, setScore] = React.useState(75);
  const [justification, setJustification] = React.useState('');

  const DIMENSIONS = [
    'Commercial Traction', 'Market Timing', 'Founder Quality', 'Technical Moat',
    'Unit Economics', 'Regulatory Pathway', 'Product Defensibility', 'Capital Efficiency',
  ];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-neutral-900 border border-violet-700/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <Brain className="w-5 h-5 text-violet-400" /> Investor Challenge Mode
            </h3>
            <p className="text-xs text-neutral-400 mt-1">
              Supply new verified diligence evidence to recalibrate the AI assessment score.
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-neutral-400 font-medium block mb-1.5">Assessment Dimension</label>
            <select
              value={dim}
              onChange={(e) => setDim(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            >
              <option value="">Select dimension…</option>
              {DIMENSIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-neutral-400 font-medium block mb-1.5">
              New Score: <span className="text-violet-400 font-mono">{score}</span>
            </label>
            <input
              type="range" min={0} max={100} value={score}
              onChange={(e) => setScore(Number(e.target.value))}
              className="w-full accent-violet-500"
            />
            <div className="flex justify-between text-[10px] text-neutral-600 mt-0.5">
              <span>0</span><span>50</span><span>100</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-400 font-medium block mb-1.5">Evidence Justification</label>
            <textarea
              rows={3}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="e.g. Reviewed 5 new signed MSAs totalling $180k ARR. Customer cohort data confirms 92% 90-day retention."
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white resize-none focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">Cancel</Button>
          <Button
            size="sm"
            disabled={!dim || !justification.trim()}
            onClick={() => { onSubmit({ dimension: dim, new_score: score, evidence_justification: justification }); onClose(); }}
            className="text-xs bg-violet-600 hover:bg-violet-500 text-white"
          >
            <Zap className="w-3.5 h-3.5 mr-1.5" /> Recalibrate Score
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

export function UnderwritingWorkspace({
  deals, selectedDealId, dealDetail, onSelectDeal, onChallengeScore, onGenerateMemo, onAdvanceToIC,
  onRecalculateFit, onExtractClaims,
}: UnderwritingWorkspaceProps) {
  const [showChallenge, setShowChallenge] = React.useState(false);
  const [expandedClaim, setExpandedClaim] = React.useState<number | null>(null);

  const d = dealDetail;
  const breakdown = d?.thesis_fit_breakdown ?? {};

  const breakdownEntries = [
    { label: 'Geography Fit', key: 'geography_fit' },
    { label: 'Sector Fit', key: 'sector_fit' },
    { label: 'Stage Fit', key: 'stage_fit' },
    { label: 'Check Size Fit', key: 'check_size_fit' },
    { label: 'Business Model', key: 'business_model_fit' },
    { label: 'Founder Profile', key: 'founder_fit' },
  ];

  const fm = d?.financial_model;
  const mrrDiscrepancy = fm && fm.discrepancy_detected;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-5 min-h-[600px]">
      {/* Deal Selector List */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden">
        <div className="p-4 border-b border-neutral-800">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest">Deal Queue</h3>
        </div>
        <div className="overflow-y-auto max-h-[680px]">
          {deals.length === 0 && (
            <p className="text-center text-neutral-600 text-xs py-8 px-4">No deals in pipeline. Seed defaults to demo the workspace.</p>
          )}
          {deals.map((deal) => (
            <button
              key={deal.id}
              onClick={() => onSelectDeal(deal.id)}
              className={cn(
                'w-full text-left px-4 py-3.5 border-b border-neutral-800/50 transition-colors cursor-pointer',
                selectedDealId === deal.id ? 'bg-violet-900/30 border-l-2 border-l-violet-500' : 'hover:bg-neutral-800/40'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white truncate">{deal.company_name}</span>
                <span className={cn(
                  'text-xs font-mono px-1.5 py-0.5 rounded',
                  deal.thesis_fit_score >= 80 ? 'text-emerald-400 bg-emerald-900/30' : 'text-amber-400 bg-amber-900/30'
                )}>
                  {deal.thesis_fit_score.toFixed(0)}%
                </span>
              </div>
              <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-2">
                <span>{deal.industry}</span>
                <span>·</span>
                <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 uppercase text-[10px] font-medium">
                  {deal.status.replace('_', ' ')}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right Panel: Underwriting Detail */}
      <div className="space-y-5">
        {!d ? (
          <div className="flex items-center justify-center h-64 rounded-2xl border border-dashed border-neutral-800 text-neutral-600 text-sm">
            Select a deal from the queue to open the underwriting workspace.
          </div>
        ) : (
          <>
            {/* Company Header */}
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700 uppercase font-medium">
                      {d.inferred_stage.replace('_', '-')}
                    </span>
                    {d.stage_conflict_detected && (
                      <span className="text-xs px-2 py-0.5 rounded bg-red-900/30 text-red-400 border border-red-800/40 flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" /> Stage Conflict
                      </span>
                    )}
                    {d.portfolio_conflict_detected && (
                      <span className="text-xs px-2 py-0.5 rounded bg-orange-900/30 text-orange-400 border border-orange-800/40">
                        Portfolio Conflict
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl font-bold text-white">{d.company_name}</h2>
                  <p className="text-sm text-neutral-400 mt-1">
                    {d.industry} · {d.geography} · Ask:{' '}
                    <span className="text-white font-mono">${(parseFloat(d.target_ask_usd) / 1000).toFixed(0)}k</span>
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  {onRecalculateFit && (
                    <Button size="sm" variant="outline" onClick={onRecalculateFit} className="text-xs border-emerald-700/50 text-emerald-400 hover:bg-emerald-900/30">
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Recalculate Fit
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setShowChallenge(true)} className="text-xs border-violet-700/50 text-violet-400 hover:bg-violet-900/30">
                    <Brain className="w-3.5 h-3.5 mr-1.5" /> Challenge Score
                  </Button>
                  <Button size="sm" onClick={onGenerateMemo} className="text-xs bg-violet-600 hover:bg-violet-500 text-white">
                    <Target className="w-3.5 h-3.5 mr-1.5" /> Generate IC Memo
                  </Button>
                  <Button size="sm" onClick={onAdvanceToIC} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white">
                    → Advance to IC
                  </Button>
                </div>
              </div>

              {/* Score overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                {[
                  { label: 'Thesis Fit', val: d.thesis_fit_score, color: 'text-violet-400' },
                  { label: 'Underwriting', val: d.underwriting_score, color: 'text-blue-400' },
                  { label: 'Evidence Conf.', val: d.evidence_confidence_score, color: 'text-amber-400' },
                  { label: 'Readiness', val: d.overall_readiness_score, color: 'text-emerald-400' },
                ].map((s) => (
                  <div key={s.label} className="text-center p-3 rounded-xl bg-neutral-800/50 border border-neutral-700">
                    <div className={cn('text-2xl font-bold tabular-nums', s.color)}>{s.val.toFixed(0)}</div>
                    <div className="text-neutral-500 text-xs mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Warm Relationship Paths (Affinity Network Intelligence) */}
            {d.warm_paths && d.warm_paths.length > 0 && (
              <div className="rounded-2xl border border-violet-800/40 bg-gradient-to-br from-violet-950/20 to-neutral-900/60 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Network className="w-4 h-4 text-violet-400" /> Relationship Intelligence (Warm Paths)
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-900/30 text-violet-300 border border-violet-700/40 font-mono">
                    {d.warm_paths.length} path{d.warm_paths.length !== 1 ? 's' : ''} detected
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {d.warm_paths.map((p: any, i: number) => (
                    <div key={i} className="p-3 rounded-xl bg-neutral-900/80 border border-violet-900/30 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">{p.member_name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-300 font-mono">
                          {p.warmth_pct}% warmth
                        </span>
                      </div>
                      <div className="text-[11px] text-violet-400/90 font-medium">
                        → {p.target_person} ({p.connection_type})
                      </div>
                      <p className="text-[11px] text-neutral-400 italic">
                        "{p.context}"
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Thesis Fit Breakdown */}
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Target className="w-4 h-4 text-violet-400" /> Thesis Fit Engine
              </h3>
              {breakdownEntries.map(({ label, key }) => {
                const val = (breakdown[key] as number) ?? 0;
                const color = val >= 85 ? 'bg-emerald-500' : val >= 65 ? 'bg-amber-500' : 'bg-red-500';
                return <ScoreBar key={key} label={label} value={val} color={color} />;
              })}
            </div>

            {/* Evidence Graph / Claims */}
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" /> Evidence Graph
                  <span className="text-xs text-neutral-500 font-normal">({d.claims.length} claims)</span>
                </h3>
                {onExtractClaims && (
                  <Button size="sm" variant="outline" onClick={onExtractClaims} className="text-[11px] border-amber-700/50 text-amber-400 hover:bg-amber-900/20 py-1 h-7">
                    <Sparkles className="w-3 h-3 mr-1" /> Auto-Extract from Deck
                  </Button>
                )}
              </div>
                <div className="space-y-2">
                  {d.claims.map((claim) => (
                    <div key={claim.id} className="rounded-xl border border-neutral-700/50 overflow-hidden">
                      <button
                        onClick={() => setExpandedClaim(expandedClaim === claim.id ? null : claim.id)}
                        className="w-full flex items-center justify-between p-3 text-left hover:bg-neutral-800/40 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-mono text-neutral-500 shrink-0">{claim.claim_id}</span>
                          <span className="text-xs text-white truncate">{claim.claim_text}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <VerificationBadge status={claim.verification_status} />
                          <span className={cn('text-xs px-1.5 py-0.5 rounded border', {
                            'text-red-400 bg-red-900/20 border-red-800/40': claim.materiality === 'critical',
                            'text-amber-400 bg-amber-900/20 border-amber-800/40': claim.materiality === 'high',
                            'text-neutral-400 bg-neutral-800 border-neutral-700': claim.materiality === 'medium',
                          })}>
                            {claim.materiality}
                          </span>
                          {expandedClaim === claim.id ? <ChevronUp className="w-4 h-4 text-neutral-500" /> : <ChevronDown className="w-4 h-4 text-neutral-500" />}
                        </div>
                      </button>
                      <AnimatePresence>
                        {expandedClaim === claim.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-neutral-700/50 bg-neutral-950/40 px-4 py-3 text-xs space-y-2"
                          >
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <span className="text-neutral-500">Source:</span>{' '}
                                <span className="text-neutral-300">{claim.source}</span>
                              </div>
                              <div>
                                <span className="text-neutral-500">Category:</span>{' '}
                                <span className="text-neutral-300">{claim.category.replace(/_/g, ' ')}</span>
                              </div>
                            </div>
                            {claim.evidence_audit && (
                              <div className="grid grid-cols-3 gap-3 p-2 rounded-lg bg-neutral-900 border border-neutral-800">
                                <div><span className="text-neutral-500">Claimed:</span><br /><span className="text-white">{claim.evidence_audit.claimed_value}</span></div>
                                <div><span className="text-neutral-500">Audited:</span><br /><span className="text-emerald-400">{claim.evidence_audit.audited_value}</span></div>
                                <div><span className="text-neutral-500">Confidence:</span><br /><span className="text-amber-400 font-mono">{(claim.evidence_audit.confidence * 100).toFixed(0)}%</span></div>
                              </div>
                            )}
                            {claim.discrepancy_notes && (
                              <p className="text-amber-400/80 italic border-l-2 border-amber-600/40 pl-2">{claim.discrepancy_notes}</p>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
              </div>
            </div>

            {/* Financial Forensics */}
            {fm && (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-400" /> Financial Forensics
                </h3>
                {mrrDiscrepancy && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-red-950/30 border border-red-700/30 text-xs">
                    <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span className="text-red-300">
                      <strong>Discrepancy Detected:</strong> {fm.discrepancy_explanation}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Declared MRR', val: `$${(parseFloat(fm.declared_mrr_usd)).toLocaleString()}`, accent: mrrDiscrepancy ? 'text-red-400' : 'text-white' },
                    { label: 'Audited MRR', val: `$${(parseFloat(fm.audited_mrr_usd)).toLocaleString()}`, accent: 'text-emerald-400' },
                    { label: 'Monthly Burn', val: `$${(parseFloat(fm.monthly_burn_usd) / 1000).toFixed(0)}k`, accent: 'text-amber-400' },
                    { label: 'Runway', val: `${fm.runway_months}mo`, accent: fm.runway_months <= 6 ? 'text-red-400' : 'text-emerald-400' },
                    { label: 'Gross Margin', val: `${fm.gross_margin_pct.toFixed(0)}%`, accent: 'text-blue-400' },
                    { label: 'CAC', val: `$${parseFloat(fm.cac_usd).toLocaleString()}`, accent: 'text-white' },
                    { label: 'LTV', val: `$${parseFloat(fm.ltv_usd).toLocaleString()}`, accent: 'text-violet-400' },
                    { label: 'LTV/CAC', val: `${(parseFloat(fm.ltv_usd) / parseFloat(fm.cac_usd)).toFixed(1)}x`, accent: 'text-emerald-400' },
                  ].map((m) => (
                    <div key={m.label} className="p-3 rounded-xl bg-neutral-800/50 border border-neutral-700">
                      <div className="text-neutral-500 text-[10px] uppercase tracking-wide">{m.label}</div>
                      <div className={cn('text-lg font-bold font-mono mt-0.5', m.accent)}>{m.val}</div>
                    </div>
                  ))}
                </div>

                {/* Scenario Models */}
                {fm.scenario_models && Object.keys(fm.scenario_models).length > 0 && (
                  <div>
                    <h4 className="text-xs text-neutral-400 font-medium mb-2 uppercase tracking-wide">Stress-Test Scenarios</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Object.entries(fm.scenario_models).map(([key, val]: [string, any]) => (
                        <div key={key} className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 text-xs">
                          <div className="text-neutral-400 font-medium capitalize mb-1">{key.replace(/_/g, ' ')}</div>
                          <div className="grid grid-cols-2 gap-2">
                            {Object.entries(val).map(([k, v]) => (
                              <div key={k}>
                                <span className="text-neutral-600">{k.replace(/_/g, ' ')}: </span>
                                <span className="text-white font-mono">{String(v)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Challenge Mode Modal */}
      <AnimatePresence>
        {showChallenge && (
          <ChallengeModeModal
            onClose={() => setShowChallenge(false)}
            onSubmit={(p) => { onChallengeScore(p); setShowChallenge(false); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
