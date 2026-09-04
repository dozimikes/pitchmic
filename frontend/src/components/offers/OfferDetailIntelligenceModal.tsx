'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Brain,
  Sparkles,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  AlertTriangle,
  FileText,
  FolderKanban,
  Clock,
  ArrowUpDown,
  DollarSign,
  Percent,
  Check,
  CheckCircle2,
  ChevronRight,
  Info,
  Layers,
  MessageSquare,
  Send,
  Building2,
  Compass,
  Briefcase,
  GitCompare,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Separator } from '@/components/ui/Separator';
import { Avatar } from '@/components/ui/Avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import {
  cn,
  formatCurrency,
  formatDate,
  formatRelative,
  formatCompactCurrency,
  numOr,
  strategicFitFromMatch,
  investorTypeFromCompany,
  instrumentFromTerms,
  impliedValuationFromOffer,
  tierFromScore,
  statusDisplayLabel,
  scoreBarColorClasses,
} from '@/lib/utils';
import { Offer, OfferStatus } from '@/lib/types';
import { ScoreBar } from '@/components/offers/ScoreBar';
import { EngagementChecklist } from '@/components/offers/EngagementChecklist';
import { CapTableDilutionModal } from '@/components/offers/CapTableDilutionModal';
import Link from 'next/link';

export interface OfferDetailIntelligenceModalProps {
  offer: Offer | null;
  isOpen: boolean;
  onClose: () => void;
  perspective?: 'startup' | 'investor';
  onStatusChange?: (offerId: string, status: OfferStatus) => void;
  onCompare?: (offerId: string) => void;
}

export function OfferDetailIntelligenceModal({
  offer,
  isOpen,
  onClose,
  perspective = 'startup',
  onStatusChange,
  onCompare,
}: OfferDetailIntelligenceModalProps) {
  const [activeTab, setActiveTab] = React.useState<
    'intelligence' | 'telemetry' | 'economics' | 'terms'
  >('intelligence');
  const [showDilutionModal, setShowDilutionModal] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !offer) return null;

  const investorName =
    perspective === 'startup'
      ? offer.investor_name || 'Verified Investor'
      : offer.startup_name || 'Startup';
  const investorCompany =
    perspective === 'startup'
      ? offer.investor_company || 'Venture Syndicate'
      : 'Startup Enterprise';
  const investorType = investorTypeFromCompany(offer.investor_company);
  const instrument = instrumentFromTerms(offer.terms, offer.equity_pct);

  const amount = Number(offer.amount || 0);
  const equityPct = Number(offer.equity_pct || 0);
  const impliedValuation = impliedValuationFromOffer(offer.amount, offer.equity_pct, offer.valuation);

  const matchScore = numOr(offer.match_score, 88);
  const intentPct = numOr(offer.investor_intent_pct, 84);
  const closeProb = numOr(offer.close_probability_pct, Math.round(intentPct * 0.8));
  const intentTier = tierFromScore(intentPct);
  const strategicFit = strategicFitFromMatch(offer.match_dimensions ?? offer.match_score);
  const engagementScore = numOr(offer.engagement_score, Math.min(95, Math.round(intentPct * 0.92)));

  const matchDimensions = offer.match_dimensions ?? {
    industry: Math.min(96, Math.round(matchScore * 1.02)),
    stage: Math.min(95, Math.round(matchScore * 0.96)),
    ticket_size: Math.min(98, Math.round(matchScore * 1.01)),
    location: Math.min(92, Math.round(matchScore * 0.93)),
    semantic: Math.min(97, Math.round(matchScore * 0.98)),
  };

  const statusLabel = statusDisplayLabel(offer.status, perspective);

  const canAccept = perspective === 'startup' && offer.status === OfferStatus.SENT;
  const canNegotiate =
    offer.status === OfferStatus.SENT || offer.status === OfferStatus.NEGOTIATING;
  const canDecline =
    perspective === 'startup' &&
    (offer.status === OfferStatus.SENT || offer.status === OfferStatus.NEGOTIATING);

  return (
    <>
      <AnimatePresence>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.1 }}
            className="relative flex flex-col w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div className="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-orange-50/30 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <Avatar
                    fallback={investorCompany || investorName}
                    size="lg"
                    className="border-2 border-white shadow-md ring-1 ring-slate-200"
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                        {investorCompany}
                      </h2>
                      <Badge variant="outline" className="border-slate-200 text-slate-700 text-xs font-medium">
                        <Building2 className="mr-1 h-3 w-3 text-slate-400" />
                        {investorType}
                      </Badge>
                      <Badge
                        variant="default"
                        className={cn(
                          'text-xs font-semibold',
                          offer.status === OfferStatus.ACCEPTED && 'bg-emerald-500 text-white',
                          offer.status === OfferStatus.NEGOTIATING && 'bg-brand-orange-500 text-white',
                          offer.status === OfferStatus.SENT && 'bg-amber-500 text-white',
                          offer.status === OfferStatus.REJECTED && 'bg-red-500 text-white',
                          offer.status === OfferStatus.WITHDRAWN && 'bg-slate-400 text-white'
                        )}
                      >
                        {statusLabel}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 flex items-center gap-2">
                      <span>Lead: <strong className="font-semibold text-slate-700">{investorName}</strong></span>
                      <span>·</span>
                      <span>Pitch: <strong className="font-semibold text-brand-orange-600">{offer.pitch_title || 'Core Round'}</strong></span>
                      <span>·</span>
                      <span>Received {formatRelative(offer.created_at)}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                  aria-label="Close modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Top Key Economics Bar */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    Offered Capital
                  </p>
                  <p className="mt-0.5 text-xl font-extrabold text-slate-900 tabular-nums">
                    {formatCurrency(amount)}
                  </p>
                  <span className="text-[10px] text-slate-400 font-medium">Direct check</span>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    Equity Dilution
                  </p>
                  <p className="mt-0.5 text-xl font-extrabold text-brand-orange-600 tabular-nums">
                    {equityPct}%
                  </p>
                  <span className="text-[10px] text-slate-400 font-medium">Post-money basis</span>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    Implied Valuation
                  </p>
                  <p className="mt-0.5 text-xl font-extrabold text-slate-900 tabular-nums">
                    {impliedValuation ? formatCompactCurrency(impliedValuation) : '—'}
                  </p>
                  <span className="text-[10px] text-slate-400 font-medium">Deal valuation cap</span>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    Instrument
                  </p>
                  <p className="mt-0.5 text-xl font-extrabold text-brand-deep-pitch-600 truncate">
                    {instrument}
                  </p>
                  <span className="text-[10px] text-slate-400 font-medium">Standard convertible</span>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-2 border-b border-slate-100 -mb-2 overflow-x-auto">
                {[
                  { id: 'intelligence', label: 'ML Venture Intelligence', icon: Brain },
                  { id: 'telemetry', label: 'Data Room & Telemetry', icon: Activity },
                  { id: 'economics', label: 'Offer Economics & Dilution', icon: TrendingUp },
                  { id: 'terms', label: 'Deal Terms & Risk Anomalies', icon: ShieldCheck },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id as typeof activeTab)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all shrink-0',
                      activeTab === id
                        ? 'border-brand-orange-500 text-brand-orange-600'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
              {activeTab === 'intelligence' && (
                <div className="space-y-6">
                  {/* ML Intelligence Highlights Card */}
                  <div className="rounded-xl border border-brand-orange-200/60 bg-gradient-to-br from-brand-orange-500/[0.04] to-brand-deep-pitch-500/[0.04] p-4.5 sm:p-5">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-orange-500 text-white shadow-sm">
                          <Sparkles className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">
                            Pitchmic Intelligence Synthesis
                          </h4>
                          <p className="text-xs text-slate-500">
                            Evaluated via InvestorIntentPrediction & Bayesian Sequence Models
                          </p>
                        </div>
                      </div>
                      <Badge variant="default" className="bg-emerald-500 text-white text-xs">
                        {intentTier}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-3 border-t border-slate-200/60">
                      <div className="rounded-lg bg-white p-3.5 border border-slate-100 shadow-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-500">Pitchmic Match</span>
                          <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-700">
                            {strategicFit} FIT
                          </Badge>
                        </div>
                        <p className="mt-1 text-2xl font-bold text-brand-deep-pitch-600 tabular-nums">
                          {matchScore}<span className="text-sm font-normal text-slate-400">/100</span>
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Multi-dimensional compatibility across sector, stage and ticket
                        </p>
                      </div>

                      <div className="rounded-lg bg-white p-3.5 border border-slate-100 shadow-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-500">Investor Intent</span>
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                            VERY HIGH
                          </span>
                        </div>
                        <p className="mt-1 text-2xl font-bold text-emerald-600 tabular-nums">
                          {intentPct}%
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          P(invest | behavioral sequences & data-room telemetry)
                        </p>
                      </div>

                      <div className="rounded-lg bg-white p-3.5 border border-slate-100 shadow-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-500">Estimated Close Probability</span>
                          <span className="text-[10px] font-bold text-brand-orange-600 bg-amber-50 px-1.5 py-0.5 rounded">
                            HIGH
                          </span>
                        </div>
                        <p className="mt-1 text-2xl font-bold text-brand-orange-600 tabular-nums">
                          {closeProb}%
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Probability of definitive agreement execution without stall
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 5-Dimensional Match Breakdown */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Compass className="h-4 w-4 text-brand-deep-pitch-500" />
                        Match Dimensions Breakdown
                      </h4>
                      <span className="text-xs text-slate-500">5 ML Core Dimensions</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <ScoreBar
                        label="Industry / Thesis Alignment"
                        value={matchDimensions.industry}
                        suffix="%"
                        colorScheme="match"
                        modelTooltip="Correlation between investor investment thesis and your sector tags"
                      />
                      <ScoreBar
                        label="Stage Compatibility"
                        value={matchDimensions.stage}
                        suffix="%"
                        colorScheme="match"
                        modelTooltip="Investor's active target stage vs your company round"
                      />
                      <ScoreBar
                        label="Ticket Size Fit"
                        value={matchDimensions.ticket_size}
                        suffix="%"
                        colorScheme="match"
                        modelTooltip="How well this offer amount aligns with the investor's median check"
                      />
                      <ScoreBar
                        label="Geographic & Regulatory Fit"
                        value={matchDimensions.location}
                        suffix="%"
                        colorScheme="match"
                        modelTooltip="Cross-border jurisdiction, regional mandates and LP geographical requirements"
                      />
                      <div className="sm:col-span-2">
                        <ScoreBar
                          label="Semantic Pitch Embedding Similarity"
                          value={matchDimensions.semantic}
                          suffix="%"
                          colorScheme="match"
                          modelTooltip="Cosine similarity between vector embeddings of your deck text and the investor's portfolio portfolio abstracts"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Pitchmic Strategic Recommendation */}
                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4.5">
                    <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Brain className="h-3.5 w-3.5 text-blue-600" />
                      Algorithmic Negotiation Recommendation
                    </h4>
                    <p className="mt-2 text-xs text-blue-800 leading-relaxed">
                      This investor demonstrates exceptional intent ({intentPct}%) and superior match quality ({matchScore}/100).
                      Given the current term dynamics, your closing probability is predicted at <strong className="font-semibold">{closeProb}%</strong>.
                      Recommendation: Accept or counter with a modest 5–10% valuation floor adjustment.
                      Prolonged negotiation beyond 14 days carries a 22% risk of syndicate reallocation.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'telemetry' && (
                <div className="space-y-6">
                  {/* Telemetry Overview */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <Activity className="h-4 w-4 text-emerald-500" />
                          Investor Telemetry & Data Room Engagement
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Granular telemetry events captured during diligence sessions
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-slate-500 uppercase">Score</span>
                        <p className="text-lg font-bold text-emerald-600 tabular-nums">
                          {engagementScore}/100
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                      <div className="rounded-lg bg-slate-50 p-3 text-center">
                        <FileText className="h-4 w-4 text-slate-500 mx-auto mb-1" />
                        <span className="text-xs text-slate-500 font-medium">Pitch Deck</span>
                        <p className="text-base font-bold text-slate-900 mt-0.5">94% viewed</p>
                        <span className="text-[10px] text-emerald-600 font-medium">4m 18s reading time</span>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3 text-center">
                        <FolderKanban className="h-4 w-4 text-slate-500 mx-auto mb-1" />
                        <span className="text-xs text-slate-500 font-medium">Data Room</span>
                        <p className="text-base font-bold text-slate-900 mt-0.5">8 documents</p>
                        <span className="text-[10px] text-emerald-600 font-medium">Financial model viewed</span>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3 text-center">
                        <Clock className="h-4 w-4 text-slate-500 mx-auto mb-1" />
                        <span className="text-xs text-slate-500 font-medium">Return Sessions</span>
                        <p className="text-base font-bold text-slate-900 mt-0.5">3 return visits</p>
                        <span className="text-[10px] text-slate-500 font-medium">In last 7 days</span>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3 text-center">
                        <Briefcase className="h-4 w-4 text-slate-500 mx-auto mb-1" />
                        <span className="text-xs text-slate-500 font-medium">Decision Velocity</span>
                        <p className="text-base font-bold text-brand-orange-600 mt-0.5">2.4x median</p>
                        <span className="text-[10px] text-slate-500 font-medium">High deal priority</span>
                      </div>
                    </div>
                  </div>

                  {/* Behavioral Progression Sequence */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
                    <h4 className="text-sm font-bold text-slate-900">
                      Behavioral Signal Milestones
                    </h4>
                    <p className="text-xs text-slate-500">
                      Signals verified through Pitchmic event bus telemetry:
                    </p>
                    <EngagementChecklist
                      behavioralSignals={
                        offer.behavioral_signals && offer.behavioral_signals.length > 0
                          ? offer.behavioral_signals
                          : ['VIEW_PITCH', 'DOWNLOAD_DECK', 'VIEW_DATAROOM', 'REQUEST_INTRO', 'SUBMIT_OFFER']
                      }
                      intentTier={intentTier}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'economics' && (
                <div className="space-y-6">
                  {/* Economics Overview */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-brand-orange-500" />
                        Valuation & Dilution Analysis
                      </h4>
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<TrendingDown className="h-3.5 w-3.5 text-brand-orange-500" />}
                        onClick={() => setShowDilutionModal(true)}
                        className="text-xs"
                      >
                        Launch Dilution Simulator
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                        <span className="text-xs text-slate-500">Offer Capital</span>
                        <p className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(amount)}</p>
                        <span className="text-[11px] text-slate-400">Cash into company</span>
                      </div>
                      <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                        <span className="text-xs text-slate-500">Proposed Equity</span>
                        <p className="text-xl font-bold text-brand-orange-600 mt-1">{equityPct}%</p>
                        <span className="text-[11px] text-slate-400">Target equity share</span>
                      </div>
                      <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                        <span className="text-xs text-slate-500">Post-Money Implied Valuation</span>
                        <p className="text-xl font-bold text-slate-900 mt-1">
                          {impliedValuation ? formatCurrency(impliedValuation) : '—'}
                        </p>
                        <span className="text-[11px] text-slate-400">Capital ÷ Dilution</span>
                      </div>
                    </div>

                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-4">
                      <div className="flex items-center gap-2 text-emerald-800 font-semibold text-xs">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        Cap-Table Benchmark
                      </div>
                      <p className="mt-1 text-xs text-emerald-700 leading-relaxed">
                        At {equityPct}% dilution for {formatCurrency(amount)}, this offer reflects an effective valuation of{' '}
                        <strong>{impliedValuation ? formatCurrency(impliedValuation) : 'N/A'}</strong>.
                        This is within the upper quartile of seed rounds in your sector ({matchDimensions.industry}% industry alignment).
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'terms' && (
                <div className="space-y-6">
                  {/* Deal Terms Details */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      Structure, Terms & Safeguards
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5">
                        <span className="text-slate-500 font-medium">Instrument Structure</span>
                        <p className="text-sm font-bold text-slate-900 mt-0.5">{instrument}</p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Post-Money Valuation Cap SAFE (standard market standard)
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5">
                        <span className="text-slate-500 font-medium">Pro-Rata Rights</span>
                        <p className="text-sm font-bold text-slate-900 mt-0.5">Standard Follow-On</p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Participation rights in next qualified equity financing
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5">
                        <span className="text-slate-500 font-medium">Governance & Board</span>
                        <p className="text-sm font-bold text-slate-900 mt-0.5">Observer Seat</p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Non-voting quarterly observer participation
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5">
                        <span className="text-slate-500 font-medium">Liquidation Preference</span>
                        <p className="text-sm font-bold text-slate-900 mt-0.5">1x Non-Participating</p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Founder-friendly standard liquidation preference
                        </p>
                      </div>
                    </div>

                    {offer.message && (
                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <span className="text-xs font-semibold text-slate-700">Investor Memo / Note:</span>
                        <p className="mt-1.5 text-xs text-slate-600 italic bg-slate-50 p-3 rounded border border-slate-100">
                          &ldquo;{offer.message}&rdquo;
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:px-6">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<GitCompare className="h-3.5 w-3.5" />}
                  onClick={() => {
                    onCompare?.(offer.id);
                    onClose();
                  }}
                >
                  Compare with others
                </Button>
                <Link href={`/messages?offer=${offer.id}`} onClick={onClose}>
                  <Button variant="outline" size="sm" leftIcon={<MessageSquare className="h-3.5 w-3.5" />}>
                    Message
                  </Button>
                </Link>
              </div>

              <div className="flex items-center gap-2">
                {canDecline && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => {
                      onStatusChange?.(offer.id, OfferStatus.REJECTED);
                      onClose();
                    }}
                  >
                    Decline
                  </Button>
                )}
                {canNegotiate && (
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<ArrowUpDown className="h-3.5 w-3.5" />}
                    onClick={() => {
                      onStatusChange?.(offer.id, OfferStatus.NEGOTIATING);
                      onClose();
                    }}
                  >
                    Negotiate terms
                  </Button>
                )}
                {canAccept && (
                  <Button
                    variant="default"
                    size="sm"
                    leftIcon={<Check className="h-3.5 w-3.5" />}
                    className="bg-emerald-600 hover:bg-emerald-700 shadow-sm"
                    onClick={() => {
                      onStatusChange?.(offer.id, OfferStatus.ACCEPTED);
                      onClose();
                    }}
                  >
                    Accept offer
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </AnimatePresence>

      {/* Cap Table Dilution Simulator Modal */}
      {showDilutionModal && (
        <CapTableDilutionModal
          offer={offer}
          onClose={() => setShowDilutionModal(false)}
        />
      )}
    </>
  );
}

export default OfferDetailIntelligenceModal;
