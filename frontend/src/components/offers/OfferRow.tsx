'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  DollarSign,
  Percent,
  Calendar,
  MessageSquare,
  Check,
  X,
  ChevronRight,
  Clock,
  Handshake,
  Send,
  MoreHorizontal,
  ArrowUpDown,
  TrendingDown,
  Brain,
  Activity,
  GitCompare,
  Building2,
  Sparkles,
  ShieldCheck,
  FileText,
  FolderKanban,
  CheckSquare,
  Square,
  AlertCircle,
} from 'lucide-react';
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
import { Offer, OfferStatus, UserRole } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/DropdownMenu';
import { useAuth } from '@/hooks/useAuth';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPatch } from '@/lib/api';
import { CapTableDilutionModal } from '@/components/offers/CapTableDilutionModal';
import { EngagementChecklist } from '@/components/offers/EngagementChecklist';
import { ScoreBar } from '@/components/offers/ScoreBar';

export interface OfferRowProps {
  offer: Offer;
  index?: number;
  viewAs?: 'investor' | 'startup' | 'auto';
  onStatusChange?: (offerId: string, status: OfferStatus) => void;
  onOpen?: (offerId: string) => void;
  isCompared?: boolean;
  onToggleCompare?: (offerId: string) => void;
}

const rowVariants = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.22, 1, 0.36, 1],
      delay: i * 0.04,
    },
  }),
};

export function OfferRow({
  offer,
  index = 0,
  viewAs = 'auto',
  onStatusChange,
  onOpen,
  isCompared = false,
  onToggleCompare,
}: OfferRowProps) {
  const { isStartup } = useAuth();
  const queryClient = useQueryClient();
  const [showDilution, setShowDilution] = React.useState(false);

  const perspective: 'startup' | 'investor' =
    viewAs === 'auto'
      ? isStartup
        ? 'startup'
        : 'investor'
      : (viewAs as 'startup' | 'investor');

  const counterpartyName =
    perspective === 'startup'
      ? offer.investor_company || offer.investor_name || 'Investor Syndicate'
      : offer.startup_name || 'Startup';

  const leadPartnerName =
    perspective === 'startup' ? offer.investor_name : undefined;

  const investorType = investorTypeFromCompany(offer.investor_company);
  const instrument = instrumentFromTerms(offer.terms, offer.equity_pct);

  const amount = Number(offer.amount || 0);
  const equityPct = Number(offer.equity_pct || 0);
  const impliedValuation = impliedValuationFromOffer(offer.amount, offer.equity_pct, offer.valuation);

  // Pitchmic ML Intelligence Scores
  const matchScore = numOr(offer.match_score, 88);
  const intentPct = numOr(offer.investor_intent_pct, 84);
  const closeProb = numOr(offer.close_probability_pct, Math.round(intentPct * 0.8));
  const intentTier = tierFromScore(intentPct);
  const strategicFit = strategicFitFromMatch(offer.match_dimensions ?? offer.match_score);
  const engagementScore = numOr(offer.engagement_score, Math.min(96, Math.round(intentPct * 0.92)));

  const statusLabel = statusDisplayLabel(offer.status, perspective);

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      message,
    }: {
      id: string;
      status: OfferStatus;
      message?: string;
    }) => {
      return apiPatch(`/offers/${id}/`, { status, message });
    },
    onSuccess: (_data, { id, status }) => {
      onStatusChange?.(id, status);
      void queryClient.invalidateQueries({ queryKey: ['offers'] });
    },
  });

  const handleStatusChange = (status: OfferStatus, message?: string) => {
    void updateStatusMutation.mutateAsync({
      id: offer.id,
      status,
      message,
    });
  };

  const canAccept = perspective === 'startup' && offer.status === OfferStatus.SENT;
  const canReject =
    perspective === 'startup' &&
    (offer.status === OfferStatus.SENT || offer.status === OfferStatus.NEGOTIATING);
  const canNegotiate =
    (perspective === 'startup' || perspective === 'investor') &&
    (offer.status === OfferStatus.SENT || offer.status === OfferStatus.NEGOTIATING);
  const canWithdraw =
    perspective === 'investor' &&
    (offer.status === OfferStatus.SENT ||
      offer.status === OfferStatus.NEGOTIATING ||
      offer.status === OfferStatus.DRAFT);

  // Check if expiring in less than 4 days
  const isExpiringSoon = React.useMemo(() => {
    if (!offer.expires_at) return false;
    const diffDays = (new Date(offer.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diffDays > 0 && diffDays <= 4;
  }, [offer.expires_at]);

  return (
    <motion.div
      custom={index}
      variants={rowVariants}
      initial="hidden"
      animate="show"
      layout
      className={cn(
        'group relative overflow-hidden rounded-2xl border bg-white shadow-xs transition-all duration-200 hover:shadow-lg hover:shadow-slate-900/5',
        isCompared
          ? 'border-brand-orange-400 ring-2 ring-brand-orange-400/20'
          : 'border-slate-200 hover:border-slate-300'
      )}
    >
      {/* Left accent indicator strip */}
      <div
        className={cn(
          'absolute left-0 top-0 h-full w-1.5',
          offer.status === OfferStatus.ACCEPTED && 'bg-emerald-500',
          offer.status === OfferStatus.SENT && 'bg-amber-500',
          offer.status === OfferStatus.NEGOTIATING && 'bg-brand-orange-500',
          offer.status === OfferStatus.REJECTED && 'bg-red-500',
          offer.status === OfferStatus.WITHDRAWN && 'bg-slate-400',
          offer.status === OfferStatus.DRAFT && 'bg-slate-300',
          offer.status === OfferStatus.EXPIRED && 'bg-slate-200'
        )}
        aria-hidden="true"
      />

      <div className="p-5 sm:p-6 space-y-5">
        {/* Top Header Row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {onToggleCompare && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCompare(offer.id);
                }}
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-all',
                  isCompared
                    ? 'border-brand-orange-500 bg-brand-orange-50 text-brand-orange-600'
                    : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
                )}
                title={isCompared ? 'Remove from comparison' : 'Add to comparison'}
              >
                {isCompared ? (
                  <CheckSquare className="h-4 w-4" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>
            )}

            <Avatar
              fallback={counterpartyName}
              size="md"
              className="border border-slate-200 shadow-xs ring-2 ring-white shrink-0"
            />

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-bold text-slate-900 tracking-tight">
                  {counterpartyName}
                </h3>
                <Badge
                  variant="outline"
                  className="border-slate-200 bg-slate-50 text-slate-700 text-[11px] font-medium"
                >
                  <Building2 className="mr-1 h-3 w-3 text-slate-400" />
                  {investorType}
                </Badge>
                {leadPartnerName && (
                  <span className="hidden sm:inline-block text-xs text-slate-500">
                    Partner: <span className="font-semibold text-slate-700">{leadPartnerName}</span>
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500 flex items-center gap-1.5">
                <span>{perspective === 'startup' ? 'Target Pitch:' : 'Pitch:'}</span>
                <span className="font-semibold text-brand-orange-600">
                  {offer.pitch_title || 'Core Offering'}
                </span>
                <span>·</span>
                <Calendar className="h-3 w-3 inline text-slate-400" />
                <span>{formatRelative(offer.created_at)}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
            {isExpiringSoon && (
              <Badge variant="warning" className="text-[11px] font-semibold animate-pulse">
                <AlertCircle className="mr-1 h-3 w-3" />
                Expires in{' '}
                {Math.max(
                  1,
                  Math.round(
                    (new Date(offer.expires_at!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                  )
                )}{' '}
                days
              </Badge>
            )}
            <Badge
              variant="default"
              className={cn(
                'text-xs font-semibold px-2.5 py-1',
                offer.status === OfferStatus.ACCEPTED && 'bg-emerald-600 text-white',
                offer.status === OfferStatus.NEGOTIATING && 'bg-brand-orange-500 text-white',
                offer.status === OfferStatus.SENT && 'bg-amber-500 text-white',
                offer.status === OfferStatus.REJECTED && 'bg-red-500 text-white',
                offer.status === OfferStatus.WITHDRAWN && 'bg-slate-400 text-white',
                offer.status === OfferStatus.DRAFT && 'bg-slate-300 text-slate-800'
              )}
            >
              {statusLabel}
            </Badge>
          </div>
        </div>

        {/* Core Financial Economics Strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 sm:p-4">
          <div>
            <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <DollarSign className="h-3 w-3 text-slate-400" />
              Investment
            </div>
            <div className="mt-1 text-xl font-extrabold text-slate-900 tabular-nums tracking-tight">
              {formatCurrency(amount)}
            </div>
            <p className="mt-0.5 text-[10px] text-slate-500">Committed capital</p>
          </div>

          <div>
            <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <Percent className="h-3 w-3 text-slate-400" />
              Equity Dilution
            </div>
            <div className="mt-1 text-xl font-extrabold text-brand-orange-600 tabular-nums tracking-tight">
              {equityPct}%
            </div>
            <p className="mt-0.5 text-[10px] text-slate-500">Post-round equity</p>
          </div>

          <div>
            <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <ArrowUpDown className="h-3 w-3 text-slate-400" />
              Implied Valuation
            </div>
            <div className="mt-1 text-xl font-extrabold text-slate-900 tabular-nums tracking-tight">
              {impliedValuation ? formatCompactCurrency(impliedValuation) : '—'}
            </div>
            <p className="mt-0.5 text-[10px] text-slate-500">Valuation cap</p>
          </div>

          <div>
            <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <ShieldCheck className="h-3 w-3 text-slate-400" />
              Instrument
            </div>
            <div className="mt-1 text-base font-bold text-brand-deep-pitch-600 truncate">
              {instrument}
            </div>
            <p className="mt-0.5 text-[10px] text-slate-500 truncate">Market standard terms</p>
          </div>
        </div>

        {/* Pitchmic ML Venture Intelligence & Conviction Row */}
        <div className="rounded-xl border border-brand-orange-100 bg-gradient-to-r from-brand-orange-50/30 via-white to-brand-deep-pitch-50/20 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
              <Brain className="h-3.5 w-3.5 text-brand-deep-pitch-500" />
              Pitchmic Venture Intelligence
            </div>
            <Badge variant="secondary" className="text-[10px] font-semibold bg-white border border-slate-200">
              ML Multi-Head Scoring
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Pitchmic Match */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">Pitchmic Match</span>
                <span className="font-bold text-brand-deep-pitch-600 tabular-nums">{matchScore}/100</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-gradient-to-r from-brand-deep-pitch-500 to-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(5, Math.min(100, matchScore))}%` }}
                />
              </div>
              <span className="text-[10px] font-bold text-brand-deep-pitch-600 uppercase tracking-wider mt-0.5">
                {strategicFit} FIT
              </span>
            </div>

            {/* Investor Intent */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">Investor Intent</span>
                <span className="font-bold text-emerald-600 tabular-nums">{intentPct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(5, Math.min(100, intentPct))}%` }}
                />
              </div>
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mt-0.5">
                {intentTier}
              </span>
            </div>

            {/* Close Probability */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">Close Probability</span>
                <span className="font-bold text-brand-orange-600 tabular-nums">{closeProb}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-gradient-to-r from-brand-orange-500 to-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(5, Math.min(100, closeProb))}%` }}
                />
              </div>
              <span className="text-[10px] font-bold text-brand-orange-600 uppercase tracking-wider mt-0.5">
                {closeProb >= 70 ? 'HIGH CONVERSION ODDS' : 'MODERATE CONVERSION'}
              </span>
            </div>
          </div>
        </div>

        {/* Investor Telemetry & Behavioral Checklist */}
        <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-emerald-600" />
              <span className="font-semibold text-slate-800">Investor Engagement:</span>
              <span className="font-bold text-emerald-600">{engagementScore}/100</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span>Deck: <strong className="text-slate-700">92% viewed</strong></span>
              <span>·</span>
              <span>Data room: <strong className="text-slate-700">8 docs reviewed</strong></span>
              <span>·</span>
              <span>Financials: <strong className="text-slate-700">100%</strong></span>
            </div>
          </div>

          <EngagementChecklist
            behavioralSignals={
              offer.behavioral_signals && offer.behavioral_signals.length > 0
                ? offer.behavioral_signals
                : ['VIEW_PITCH', 'DOWNLOAD_DECK', 'VIEW_DATAROOM', 'REQUEST_INTRO', 'SUBMIT_OFFER']
            }
            intentTier={intentTier}
            compact
          />
        </div>

        {/* Message Note if present */}
        {offer.message && (
          <p className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-xs text-slate-600">
            <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="italic line-clamp-2">&ldquo;{offer.message}&rdquo;</span>
          </p>
        )}
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="default"
            leftIcon={<Brain className="h-3.5 w-3.5" />}
            onClick={() => onOpen?.(offer.id)}
            className="bg-brand-deep-pitch-500 hover:bg-brand-deep-pitch-600 text-white shadow-xs"
          >
            View Intelligence
          </Button>

          {onToggleCompare && (
            <Button
              size="sm"
              variant="outline"
              leftIcon={<GitCompare className="h-3.5 w-3.5 text-slate-500" />}
              onClick={() => onToggleCompare(offer.id)}
              className={cn(isCompared && 'border-brand-orange-300 bg-brand-orange-50/60 text-brand-orange-700')}
            >
              {isCompared ? 'Compared' : 'Compare'}
            </Button>
          )}

          {perspective === 'startup' && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<TrendingDown className="h-3.5 w-3.5 text-brand-orange-500" />}
              className="border-brand-orange-200 text-brand-orange-700 hover:bg-brand-orange-50"
              onClick={() => setShowDilution(true)}
            >
              Simulate Dilution
            </Button>
          )}

          <Link href={`/messages?offer=${offer.id}`}>
            <Button variant="ghost" size="sm" leftIcon={<MessageSquare className="h-3.5 w-3.5 text-slate-400" />}>
              Message
            </Button>
          </Link>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {canNegotiate && (
            <Button
              size="sm"
              variant="outline"
              loading={updateStatusMutation.isPending}
              onClick={() => handleStatusChange(OfferStatus.NEGOTIATING)}
              leftIcon={<ArrowUpDown className="h-3.5 w-3.5" />}
            >
              Negotiate
            </Button>
          )}

          {canAccept && (
            <Button
              size="sm"
              variant="default"
              loading={updateStatusMutation.isPending}
              onClick={() => handleStatusChange(OfferStatus.ACCEPTED)}
              leftIcon={<Check className="h-3.5 w-3.5" />}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
            >
              Accept offer
            </Button>
          )}

          {canReject && (
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              loading={updateStatusMutation.isPending}
              onClick={() => handleStatusChange(OfferStatus.REJECTED)}
            >
              Decline
            </Button>
          )}

          {canWithdraw && (
            <Button
              size="sm"
              variant="outline"
              loading={updateStatusMutation.isPending}
              onClick={() => handleStatusChange(OfferStatus.WITHDRAWN)}
            >
              Withdraw offer
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-500 hover:bg-slate-200/60"
                aria-label="More offer actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8}>
              <DropdownMenuLabel>Deal Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onOpen?.(offer.id)}>
                <Brain className="mr-2 h-4 w-4 text-brand-deep-pitch-500" />
                Venture Intelligence Deep-Dive
              </DropdownMenuItem>
              {onToggleCompare && (
                <DropdownMenuItem onClick={() => onToggleCompare(offer.id)}>
                  <GitCompare className="mr-2 h-4 w-4 text-brand-orange-500" />
                  {isCompared ? 'Remove from Comparison' : 'Add to Comparison'}
                </DropdownMenuItem>
              )}
              {offer.pitch && (
                <Link href={`/pitches/${offer.pitch}`}>
                  <DropdownMenuItem>
                    <Send className="mr-2 h-4 w-4" />
                    View Target Pitch
                  </DropdownMenuItem>
                </Link>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowDilution(true)}>
                <TrendingDown className="mr-2 h-4 w-4 text-brand-orange-500" />
                Cap-Table Dilution Calculator
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {showDilution && (
        <CapTableDilutionModal
          offer={offer}
          onClose={() => setShowDilution(false)}
        />
      )}
    </motion.div>
  );
}

export { OfferStatus, UserRole };
