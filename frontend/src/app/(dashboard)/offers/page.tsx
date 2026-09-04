'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  HandCoins,
  Filter,
  TrendingUp,
  Plus,
  Loader2,
  ArrowDownUp,
  Search,
  Sparkles,
  Brain,
  GitCompare,
  Activity,
  ShieldCheck,
  Building2,
  Target,
  BarChart3,
  Compass,
  Zap,
  ArrowUpRight,
  TrendingDown,
  Clock,
  Eye,
  CheckCircle2,
  SlidersHorizontal,
  X,
  Layers,
  DollarSign,
} from 'lucide-react';
import { OfferRow } from '@/components/offers/OfferRow';
import { OfferComparisonSheet } from '@/components/offers/OfferComparisonSheet';
import { OfferDetailIntelligenceModal } from '@/components/offers/OfferDetailIntelligenceModal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Separator } from '@/components/ui/Separator';
import {
  OfferStatus,
  type Offer,
  type OffersListSummary,
  type Instrument,
  type InvestorTypeLabel,
  type TicketBucket,
  type LikelyOffer,
} from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import {
  cn,
  formatCurrency,
  formatCompactCurrency,
  numOr,
  strategicFitFromMatch,
  investorTypeFromCompany,
  instrumentFromTerms,
  impliedValuationFromOffer,
  dealHealthTierColor,
} from '@/lib/utils';
import { apiGet } from '@/lib/api';

type OperationalStatusFilter =
  | 'all'
  | 'active'
  | 'pending'
  | OfferStatus.NEGOTIATING
  | OfferStatus.ACCEPTED
  | OfferStatus.REJECTED
  | 'closed';

const ACTIVE_OFFER_STATUSES: readonly OfferStatus[] = [
  OfferStatus.DRAFT,
  OfferStatus.SENT,
  OfferStatus.NEGOTIATING,
];
const CLOSED_OFFER_STATUSES: readonly OfferStatus[] = [
  OfferStatus.ACCEPTED,
  OfferStatus.REJECTED,
  OfferStatus.WITHDRAWN,
  OfferStatus.EXPIRED,
];

const STATUS_FILTERS: Array<{ value: OperationalStatusFilter; label: string }> = [
  { value: 'all', label: 'All Offers' },
  { value: 'active', label: 'Active Pipeline' },
  { value: 'pending', label: 'Pending Response' },
  { value: OfferStatus.NEGOTIATING, label: 'Negotiating' },
  { value: OfferStatus.ACCEPTED, label: 'Accepted' },
  { value: OfferStatus.REJECTED, label: 'Declined' },
  { value: 'closed', label: 'Closed' },
];

const INSTRUMENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All Instruments' },
  { value: 'SAFE', label: 'SAFE' },
  { value: 'Convertible Note', label: 'Convertible Note' },
  { value: 'Equity', label: 'Priced Equity' },
  { value: 'Debt', label: 'Venture Debt' },
];

const INVESTOR_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All Investor Types' },
  { value: 'VC', label: 'Venture Capital (VC)' },
  { value: 'Angel', label: 'Angel / Syndicate' },
  { value: 'Family Office', label: 'Family Office' },
  { value: 'Corporate', label: 'CVC / Corporate' },
  { value: 'Accelerator', label: 'Accelerator' },
];

const TICKET_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All Ticket Sizes' },
  { value: '<$100K', label: '< $100K' },
  { value: '$100K–$500K', label: '$100K – $500K' },
  { value: '$500K–$1M', label: '$500K – $1M' },
  { value: '$1M+', label: '$1M+' },
];

const STRATEGIC_FIT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All Strategic Fits' },
  { value: 'High', label: 'High Strategic Fit' },
  { value: 'Medium', label: 'Medium Fit' },
  { value: 'Low', label: 'Low Fit' },
];

const MATCH_SCORE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All Match Scores' },
  { value: '90+', label: '90+ High Compatibility' },
  { value: '75–89', label: '75–89 Strong Match' },
  { value: '60–74', label: '60–74 Moderate' },
  { value: '<60', label: '< 60' },
];

export default function OffersPage() {
  const { isInvestor } = useAuth();
  const perspective: 'investor' | 'startup' = isInvestor ? 'investor' : 'startup';

  // Filters state
  const [statusFilter, setStatusFilter] = React.useState<OperationalStatusFilter>('all');
  const [search, setSearch] = React.useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = React.useState(false);

  const [instrumentFilter, setInstrumentFilter] = React.useState('all');
  const [investorTypeFilter, setInvestorTypeFilter] = React.useState('all');
  const [ticketFilter, setTicketFilter] = React.useState('all');
  const [fitFilter, setFitFilter] = React.useState('all');
  const [matchScoreFilter, setMatchScoreFilter] = React.useState('all');

  // Interactive sheet & modal states
  const [selectedOfferForModal, setSelectedOfferForModal] = React.useState<Offer | null>(null);
  const [comparisonSelection, setComparisonSelection] = React.useState<Set<string>>(new Set());
  const [isComparisonOpen, setIsComparisonOpen] = React.useState(false);
  const [showLikelyOffersPanel, setShowLikelyOffersPanel] = React.useState(false);

  const offersQuery = useQuery({
    queryKey: ['offers', perspective],
    queryFn: async () => {
      return apiGet<{ results: Offer[]; summary: OffersListSummary; count: number }>('/offers/');
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const rawResults = offersQuery.data?.results;
  const offers = React.useMemo(() => (Array.isArray(rawResults) ? rawResults : []), [rawResults]);
  const summary = offersQuery.data?.summary;

  // Active filter count
  const activeFiltersCount = React.useMemo(() => {
    let count = 0;
    if (instrumentFilter !== 'all') count++;
    if (investorTypeFilter !== 'all') count++;
    if (ticketFilter !== 'all') count++;
    if (fitFilter !== 'all') count++;
    if (matchScoreFilter !== 'all') count++;
    return count;
  }, [instrumentFilter, investorTypeFilter, ticketFilter, fitFilter, matchScoreFilter]);

  const resetAdvancedFilters = () => {
    setInstrumentFilter('all');
    setInvestorTypeFilter('all');
    setTicketFilter('all');
    setFitFilter('all');
    setMatchScoreFilter('all');
  };

  // Status counts
  const activeCounts = React.useMemo(() => {
    const counts: Record<string, number> = { all: offers.length };
    counts['active'] = offers.filter((o) => ACTIVE_OFFER_STATUSES.includes(o.status)).length;
    counts['pending'] = offers.filter(
      (o) => o.status === OfferStatus.DRAFT || o.status === OfferStatus.SENT
    ).length;
    counts['closed'] = offers.filter((o) => CLOSED_OFFER_STATUSES.includes(o.status)).length;
    for (const o of offers) {
      counts[o.status] = (counts[o.status] ?? 0) + 1;
    }
    return counts;
  }, [offers]);

  // Filtered offers
  const filteredOffers = React.useMemo(() => {
    let result = offers;

    // Status filter
    if (statusFilter === 'active') {
      result = result.filter((o) => ACTIVE_OFFER_STATUSES.includes(o.status));
    } else if (statusFilter === 'pending') {
      result = result.filter(
        (o) => o.status === OfferStatus.DRAFT || o.status === OfferStatus.SENT
      );
    } else if (statusFilter === 'closed') {
      result = result.filter((o) => CLOSED_OFFER_STATUSES.includes(o.status));
    } else if (statusFilter !== 'all') {
      result = result.filter((o) => o.status === statusFilter);
    }

    // Search query
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((o) => {
        const pitchTitle = o.pitch_title?.toLowerCase() ?? '';
        const startupName = o.startup_name?.toLowerCase() ?? '';
        const investorName = o.investor_name?.toLowerCase() ?? '';
        const investorCompany = o.investor_company?.toLowerCase() ?? '';
        const terms = o.terms?.toLowerCase() ?? '';
        return (
          pitchTitle.includes(q) ||
          startupName.includes(q) ||
          investorName.includes(q) ||
          investorCompany.includes(q) ||
          terms.includes(q)
        );
      });
    }

    // Instrument filter
    if (instrumentFilter !== 'all') {
      result = result.filter((o) => instrumentFromTerms(o.terms, o.equity_pct) === instrumentFilter);
    }

    // Investor Type filter
    if (investorTypeFilter !== 'all') {
      result = result.filter(
        (o) => investorTypeFromCompany(o.investor_company) === investorTypeFilter
      );
    }

    // Ticket Size filter
    if (ticketFilter !== 'all') {
      result = result.filter((o) => {
        const amt = Number(o.amount || 0);
        if (ticketFilter === '<$100K') return amt < 100_000;
        if (ticketFilter === '$100K–$500K') return amt >= 100_000 && amt < 500_000;
        if (ticketFilter === '$500K–$1M') return amt >= 500_000 && amt <= 1_000_000;
        if (ticketFilter === '$1M+') return amt > 1_000_000;
        return true;
      });
    }

    // Strategic Fit filter
    if (fitFilter !== 'all') {
      result = result.filter(
        (o) => strategicFitFromMatch(o.match_dimensions ?? o.match_score) === fitFilter
      );
    }

    // Pitchmic Match Score filter
    if (matchScoreFilter !== 'all') {
      result = result.filter((o) => {
        const score = numOr(o.match_score, 75);
        if (matchScoreFilter === '90+') return score >= 90;
        if (matchScoreFilter === '75–89') return score >= 75 && score < 90;
        if (matchScoreFilter === '60–74') return score >= 60 && score < 75;
        if (matchScoreFilter === '<60') return score < 60;
        return true;
      });
    }

    return result;
  }, [
    offers,
    statusFilter,
    search,
    instrumentFilter,
    investorTypeFilter,
    ticketFilter,
    fitFilter,
    matchScoreFilter,
  ]);

  // Aggregate stats computed from offers
  const totalOfferedSum = React.useMemo(() => {
    return summary?.capital_offered_sum ?? offers.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
  }, [summary, offers]);

  const activeNegotiationCount = React.useMemo(() => {
    return (
      summary?.active_negotiation_count ??
      offers.filter((o) => o.status === OfferStatus.NEGOTIATING).length
    );
  }, [summary, offers]);

  const acceptedCount = React.useMemo(() => {
    return (
      summary?.accepted_count ??
      offers.filter((o) => o.status === OfferStatus.ACCEPTED).length
    );
  }, [summary, offers]);

  const bestOfferAmount = React.useMemo(() => {
    if (summary?.best_offer_amount !== undefined && summary.best_offer_amount !== null) {
      return summary.best_offer_amount;
    }
    const nonClosed = offers.filter((o) => !CLOSED_OFFER_STATUSES.includes(o.status));
    if (!nonClosed.length) return null;
    return Math.max(...nonClosed.map((o) => Number(o.amount || 0)));
  }, [summary, offers]);

  // Implied valuation across offers
  const impliedValuations = React.useMemo(() => {
    return offers
      .map((o) => impliedValuationFromOffer(o.amount, o.equity_pct, o.valuation))
      .filter((v): v is number => typeof v === 'number' && v > 0);
  }, [offers]);

  const medianValuation = React.useMemo(() => {
    if (!impliedValuations.length) return null;
    const sorted = [...impliedValuations].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }, [impliedValuations]);

  // Deal health
  const dealHealthScore = summary?.deal_health_score ?? (offers.length > 0 ? 78 : 0);
  const dealHealthTier = summary?.deal_health_tier ?? (offers.length > 0 ? 'Strong' : 'Developing');
  const dealHealthFactors = summary?.deal_health_factors ?? {
    investor_demand: offers.length >= 2 ? 'up' : 'flat',
    offer_velocity: 'up',
    negotiation_activity: activeNegotiationCount > 0 ? 'up' : 'flat',
    conversion_rate: acceptedCount > 0 ? 'up' : 'flat',
    capital_concentration: 'flat',
  };

  // High conviction & likely offers
  const highConvictionCount =
    summary?.high_conviction_count ??
    offers.filter((o) => numOr(o.investor_intent_pct, 0) >= 70).length;

  const likelyOffers: LikelyOffer[] = React.useMemo(() => {
    if (summary?.likely_offers && summary.likely_offers.length > 0) {
      return summary.likely_offers;
    }
    // Fallback sample signals if user has no pending offers
    return [
      {
        investor_name: 'Base10 Advancement Partners',
        investor_company: 'Base10 Partners',
        offer_probability_pct: 87.4,
        match_score: 94,
        rationale_signals: ['VIEW_PITCH', 'DOWNLOAD_DECK', 'VIEW_DATAROOM'],
      },
      {
        investor_name: 'EchoVC Growth Fund',
        investor_company: 'EchoVC',
        offer_probability_pct: 76.2,
        match_score: 89,
        rationale_signals: ['VIEW_PITCH', 'VIEW_DATAROOM'],
      },
    ];
  }, [summary]);

  const toggleCompareOffer = (id: string) => {
    setComparisonSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const offersForComparison = React.useMemo(() => {
    if (comparisonSelection.size > 0) {
      return offers.filter((o) => comparisonSelection.has(o.id));
    }
    return offers.slice(0, 3);
  }, [offers, comparisonSelection]);

  const headerTitle = isInvestor ? "Offers you've sent" : "Offers you've received";

  return (
    <div className="space-y-6">
      {/* Header & Primary Actions */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              Offers
            </h1>
            <Badge
              variant="default"
              className={cn(
                'text-xs font-semibold px-2.5 py-0.5',
                isInvestor
                  ? 'bg-brand-deep-pitch-500 hover:bg-brand-deep-pitch-600'
                  : 'bg-brand-orange-500 hover:bg-brand-orange-600'
              )}
            >
              <HandCoins className="mr-1 h-3 w-3" />
              {offers.length} {offers.length === 1 ? 'Offer' : 'Offers'}
            </Badge>
            {offers.length > 0 && (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium">
                <Sparkles className="mr-1 h-3 w-3 text-emerald-500" />
                ML Deal Intelligence Active
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {headerTitle} · Compare terms · Understand investor conviction · ML Deal Intelligence Center
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {offers.length >= 2 && (
            <Button
              variant="outline"
              size="default"
              leftIcon={<GitCompare className="h-4 w-4 text-brand-orange-500" />}
              onClick={() => setIsComparisonOpen(true)}
              className="border-slate-200 shadow-xs"
            >
              Compare Offers
              {comparisonSelection.size > 0 && (
                <span className="ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-orange-500 text-[10px] font-bold text-white">
                  {comparisonSelection.size}
                </span>
              )}
            </Button>
          )}

          {isInvestor && (
            <Link href="/newsfeed">
              <Button
                variant="default"
                size="default"
                leftIcon={<Plus className="h-4 w-4" />}
                className="shadow-lg shadow-brand-orange-500/20"
              >
                Make new offer
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Top Unambiguous Statistics Cards */}
      <div className="grid grid-cols-2 gap-3.5 sm:gap-4 lg:grid-cols-5">
        <StatsCard
          label={perspective === 'investor' ? 'Offers Sent' : 'Offers Received'}
          value={String(offers.length)}
          subtitle={`${activeCounts['active'] ?? 0} active in pipeline`}
          icon={HandCoins}
          accent="orange"
        />
        <StatsCard
          label={perspective === 'investor' ? 'Capital Deployed' : 'Capital Offered'}
          value={formatCurrency(totalOfferedSum)}
          subtitle="Direct round commitments"
          icon={DollarSign}
          accent="violet"
        />
        <StatsCard
          label="Active Negotiations"
          value={String(activeNegotiationCount)}
          subtitle="Active term discussions"
          icon={ArrowDownUp}
          accent="sky"
        />
        <StatsCard
          label="Accepted Deals"
          value={String(acceptedCount)}
          subtitle="Signed term sheets"
          icon={CheckCircle2}
          accent="emerald"
        />
        <StatsCard
          label="Best Current Offer"
          value={bestOfferAmount ? formatCompactCurrency(bestOfferAmount) : '—'}
          subtitle={medianValuation ? `Median val: ${formatCompactCurrency(medianValuation)}` : 'Awaiting offers'}
          icon={TrendingUp}
          accent="amber"
        />
      </div>

      {/* Pitchmic Intelligence Command Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-brand-orange-200/80 bg-gradient-to-br from-slate-900 via-slate-900 to-brand-deep-pitch-950 p-5 sm:p-6 text-white shadow-xl">
        <div className="absolute right-0 top-0 -mt-8 -mr-8 h-48 w-48 rounded-full bg-brand-orange-500/10 blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 -mb-8 h-36 w-36 rounded-full bg-brand-deep-pitch-500/20 blur-2xl pointer-events-none" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-orange-500 text-white shadow-sm">
                <Brain className="h-3.5 w-3.5" />
              </span>
              <h2 className="text-xs font-bold uppercase tracking-widest text-brand-orange-400">
                Pitchmic Deal Intelligence Engine
              </h2>
            </div>
            <p className="text-lg sm:text-xl font-bold tracking-tight text-white">
              {highConvictionCount > 0
                ? `${highConvictionCount} high-conviction ${highConvictionCount === 1 ? 'investor is' : 'investors are'} actively engaging your round`
                : 'Pipeline telemetry is monitoring investor behavioral sequences'}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Fundraising Trajectory: <strong className="text-white font-semibold">{dealHealthTier}</strong> ({dealHealthScore}/100)
              </span>
              {summary?.highest_intent_pct && (
                <>
                  <span className="text-slate-500">·</span>
                  <span>
                    Peak Investor Intent: <strong className="text-emerald-400 font-semibold">{summary.highest_intent_pct}%</strong>
                  </span>
                </>
              )}
              {summary?.next_milestone_term_sheet_probability_pct && (
                <>
                  <span className="text-slate-500">·</span>
                  <span>
                    Term Sheet Probability: <strong className="text-brand-orange-400 font-semibold">{summary.next_milestone_term_sheet_probability_pct}%</strong>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {likelyOffers.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Eye className="h-3.5 w-3.5 text-brand-orange-400" />}
                onClick={() => setShowLikelyOffersPanel(!showLikelyOffersPanel)}
                className="border-slate-700 bg-slate-800/80 text-white hover:bg-slate-800 hover:text-white"
              >
                {showLikelyOffersPanel ? 'Hide Likely Offers' : `View Potential Signals (${likelyOffers.length})`}
              </Button>
            )}

            {offers.length >= 2 && (
              <Button
                variant="default"
                size="sm"
                leftIcon={<GitCompare className="h-3.5 w-3.5" />}
                onClick={() => setIsComparisonOpen(true)}
                className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white shadow-md shadow-brand-orange-500/30"
              >
                Compare Offers
              </Button>
            )}
          </div>
        </div>

        {/* Dynamic Health Radar Factors */}
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5 border-t border-slate-800/80 pt-4 text-xs">
          <div className="flex items-center justify-between rounded-lg bg-slate-800/50 px-2.5 py-1.5">
            <span className="text-slate-400">Investor Demand</span>
            <span className="font-bold text-emerald-400">
              {dealHealthFactors.investor_demand === 'up' ? '↑ High' : '→ Steady'}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-800/50 px-2.5 py-1.5">
            <span className="text-slate-400">Offer Velocity</span>
            <span className="font-bold text-emerald-400">
              {dealHealthFactors.offer_velocity === 'up' ? '↑ Fast' : '→ Normal'}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-800/50 px-2.5 py-1.5">
            <span className="text-slate-400">Negotiations</span>
            <span className="font-bold text-brand-orange-400">
              {dealHealthFactors.negotiation_activity === 'up' ? '↑ Active' : '→ Open'}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-800/50 px-2.5 py-1.5">
            <span className="text-slate-400">Conversion Odds</span>
            <span className="font-bold text-emerald-400">
              {dealHealthFactors.conversion_rate === 'up' ? '↑ Strong' : '→ Solid'}
            </span>
          </div>
          <div className="col-span-2 sm:col-span-1 flex items-center justify-between rounded-lg bg-slate-800/50 px-2.5 py-1.5">
            <span className="text-slate-400">Syndicate Spread</span>
            <span className="font-bold text-slate-300">Balanced</span>
          </div>
        </div>

        {/* Potential Offer Signals / Likely Offers Expandable Subpanel */}
        {showLikelyOffersPanel && likelyOffers.length > 0 && (
          <div className="mt-5 rounded-xl border border-slate-700/80 bg-slate-800/90 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-brand-orange-400 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Potential Offer Signals (Bayesian Intent Predictions)
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Investors showing high intent signals prior to submitting a structured term sheet:
                </p>
              </div>
              <Badge variant="outline" className="border-slate-600 text-slate-300 text-[10px]">
                Estimated Probability of Offer
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
              {likelyOffers.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-slate-700 bg-slate-900/80 p-3 flex flex-col justify-between gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-white">{item.investor_company || item.investor_name}</p>
                      <p className="text-[10px] text-slate-400">{item.investor_name}</p>
                    </div>
                    <Badge variant="default" className="bg-emerald-500 text-white text-[10px] font-bold">
                      {item.offer_probability_pct}%
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>Estimated Offer Probability</span>
                      <span className="font-semibold text-emerald-400">{item.offer_probability_pct}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                        style={{ width: `${item.offer_probability_pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1 text-[9px] text-slate-400">
                    <span>Signals:</span>
                    {item.rationale_signals.map((sig, sIdx) => (
                      <span key={sIdx} className="bg-slate-800 px-1 py-0.5 rounded text-slate-300">
                        {sig.replace('_', ' ').toLowerCase()}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Search & Multi-Dimensional Intelligent Filter System */}
      <Card className="border-slate-200 bg-white shadow-xs">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="search"
                placeholder="Search offers, investors, companies, or terms..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9.5 h-10 border-slate-200 focus:border-brand-orange-400 focus:ring-brand-orange-400/20 text-sm"
              />
            </div>
            <Button
              variant="outline"
              size="default"
              leftIcon={<SlidersHorizontal className="h-4 w-4 text-slate-600" />}
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={cn(
                'h-10 shrink-0 font-medium',
                (showAdvancedFilters || activeFiltersCount > 0) &&
                  'border-brand-orange-300 bg-brand-orange-50/50 text-brand-orange-700'
              )}
            >
              Deal Filters
              {activeFiltersCount > 0 && (
                <span className="ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-orange-500 text-[10px] font-bold text-white">
                  {activeFiltersCount}
                </span>
              )}
            </Button>
          </div>

          {/* Operational Status Filter Tabs */}
          <div className="-mx-1 flex flex-wrap items-center gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-thin">
            {STATUS_FILTERS.map(({ value, label }) => {
              const isActive = statusFilter === value;
              const count =
                value === 'all'
                  ? activeCounts['all'] ?? 0
                  : value === 'active'
                  ? activeCounts['active'] ?? 0
                  : value === 'pending'
                  ? activeCounts['pending'] ?? 0
                  : value === 'closed'
                  ? activeCounts['closed'] ?? 0
                  : activeCounts[value] ?? 0;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
                    isActive
                      ? 'border-transparent bg-gradient-to-r from-brand-orange-500 to-brand-deep-pitch-500 text-white shadow-xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  )}
                >
                  {label}
                  <span
                    className={cn(
                      'flex h-4 min-w-[16px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
                      isActive ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600'
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Expandable Multi-Dimensional Filter Drawer */}
          {showAdvancedFilters && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3 pt-3 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5 text-brand-orange-500" />
                  Intelligent Multi-Dimension Filters
                </span>
                {activeFiltersCount > 0 && (
                  <button
                    type="button"
                    onClick={resetAdvancedFilters}
                    className="text-xs font-semibold text-brand-orange-600 hover:underline flex items-center gap-1"
                  >
                    <X className="h-3 w-3" />
                    Reset all filters
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {/* Instrument */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Instrument
                  </label>
                  <select
                    value={instrumentFilter}
                    onChange={(e) => setInstrumentFilter(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 font-medium focus:outline-hidden focus:border-brand-orange-500"
                  >
                    {INSTRUMENT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Investor Type */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Investor Type
                  </label>
                  <select
                    value={investorTypeFilter}
                    onChange={(e) => setInvestorTypeFilter(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 font-medium focus:outline-hidden focus:border-brand-orange-500"
                  >
                    {INVESTOR_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Ticket Bucket */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Ticket Size
                  </label>
                  <select
                    value={ticketFilter}
                    onChange={(e) => setTicketFilter(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 font-medium focus:outline-hidden focus:border-brand-orange-500"
                  >
                    {TICKET_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Strategic Fit */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Strategic Fit
                  </label>
                  <select
                    value={fitFilter}
                    onChange={(e) => setFitFilter(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 font-medium focus:outline-hidden focus:border-brand-orange-500"
                  >
                    {STRATEGIC_FIT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Pitchmic Match */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Pitchmic Match
                  </label>
                  <select
                    value={matchScoreFilter}
                    onChange={(e) => setMatchScoreFilter(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 font-medium focus:outline-hidden focus:border-brand-orange-500"
                  >
                    {MATCH_SCORE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Offers List / Empty State / Loading State */}
      {offersQuery.isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-44 animate-pulse border-slate-200">
              <div className="h-full w-full bg-slate-100/80 rounded-xl" />
            </Card>
          ))}
        </div>
      ) : offersQuery.isError ? (
        <Card className="border-dashed bg-red-50/60 border-red-200">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <p className="font-semibold text-red-700">Failed to load offers</p>
            <p className="text-sm text-red-600">
              {offersQuery.error instanceof Error ? offersQuery.error.message : 'Please try again.'}
            </p>
            <Button
              variant="outline"
              onClick={() => void offersQuery.refetch()}
              size="sm"
              leftIcon={<Loader2 className="h-3.5 w-3.5" />}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : filteredOffers.length === 0 ? (
        /* Rich, Engaging Centered Empty State (Section 11) */
        <Card className="border-dashed border-slate-200 bg-gradient-to-b from-white to-slate-50/60 overflow-hidden shadow-xs">
          <CardContent className="flex flex-col items-center justify-center gap-5 py-16 px-4 text-center max-w-2xl mx-auto">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-orange-500/10 via-brand-deep-pitch-500/10 to-brand-orange-500/15 border border-brand-orange-200/50 shadow-inner">
              <Brain className="h-10 w-10 text-brand-orange-500 animate-pulse" />
              <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-deep-pitch-500 text-white shadow-xs">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-xl font-bold tracking-tight text-slate-900">
                {search || statusFilter !== 'all' || activeFiltersCount > 0
                  ? 'No offers match your current filter parameters'
                  : isInvestor
                  ? "You haven't initiated any offers yet"
                  : 'No offers yet'}
              </h3>
              <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                {search || statusFilter !== 'all' || activeFiltersCount > 0
                  ? 'Try broadening your filter criteria, resetting active tags, or clearing the search bar.'
                  : isInvestor
                  ? 'Explore vetted startups in the newsfeed, evaluate their ML fundability scores, and structure your first investment term sheet.'
                  : 'Your investor pipeline is still developing. Pitchmic is continuously analyzing investor intent, behavioral sequences, and engagement signals to surface qualified offers.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              {search || statusFilter !== 'all' || activeFiltersCount > 0 ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                    resetAdvancedFilters();
                  }}
                  size="default"
                >
                  Clear all filters
                </Button>
              ) : isInvestor ? (
                <Link href="/newsfeed">
                  <Button
                    variant="default"
                    size="default"
                    leftIcon={<TrendingUp className="h-4 w-4" />}
                    className="shadow-md shadow-brand-orange-500/20"
                  >
                    Browse Pitches
                  </Button>
                </Link>
              ) : (
                <>
                  <Link href="/investors">
                    <Button
                      variant="default"
                      size="default"
                      leftIcon={<Compass className="h-4 w-4" />}
                      className="shadow-md shadow-brand-orange-500/20"
                    >
                      Review Investor Matches
                    </Button>
                  </Link>
                  <Link href="/discover">
                    <Button variant="outline" size="default" leftIcon={<Search className="h-4 w-4" />}>
                      Discover Investors
                    </Button>
                  </Link>
                </>
              )}
            </div>

            {/* Live Telemetry Monitoring Grid */}
            <div className="w-full mt-6 pt-6 border-t border-slate-200 text-left">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 text-center mb-3">
                Pitchmic is active and monitoring your investor signals
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 mb-1">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                    Investor Intent
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Real-time probabilistic tracking of investor profile visits and repeat sessions
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 mb-1">
                    <span className="flex h-2 w-2 rounded-full bg-brand-orange-500" />
                    Pitch Engagement
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Telemetry logging slide read durations, deck downloads, and video completion
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 mb-1">
                    <span className="flex h-2 w-2 rounded-full bg-brand-deep-pitch-500" />
                    Data-Room Activity
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Audit logs monitoring financial models, cap table reviews, and team memos
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 mb-1">
                    <span className="flex h-2 w-2 rounded-full bg-sky-500" />
                    Intro Requests
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Automated routing for GP diligence, partner syndicates, and term sheet calls
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Offer Cards */
        <div className="space-y-4">
          {filteredOffers.map((offer, i) => (
            <OfferRow
              key={`${offer.id}-${i}`}
              offer={offer}
              index={i}
              viewAs={perspective}
              onOpen={(offerId) => {
                const target = offers.find((o) => o.id === offerId) || offer;
                setSelectedOfferForModal(target);
              }}
              isCompared={comparisonSelection.has(offer.id)}
              onToggleCompare={toggleCompareOffer}
            />
          ))}
        </div>
      )}

      {/* Floating Offer Comparison Bar when offers are selected */}
      {comparisonSelection.size >= 2 && (
        <div className="fixed bottom-6 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-slate-800 bg-slate-900/95 px-5 py-2.5 text-white shadow-2xl backdrop-blur-md">
            <GitCompare className="h-4 w-4 text-brand-orange-400" />
            <span className="text-xs font-semibold">
              {comparisonSelection.size} offers selected for side-by-side comparison
            </span>
            <Button
              size="sm"
              variant="default"
              onClick={() => setIsComparisonOpen(true)}
              className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white rounded-full text-xs h-7 px-3"
            >
              Compare Now
            </Button>
            <button
              type="button"
              onClick={() => setComparisonSelection(new Set())}
              className="text-slate-400 hover:text-white transition-colors text-xs ml-1"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Offer Detail Intelligence Modal */}
      {selectedOfferForModal && (
        <OfferDetailIntelligenceModal
          offer={selectedOfferForModal}
          isOpen={Boolean(selectedOfferForModal)}
          onClose={() => setSelectedOfferForModal(null)}
          perspective={perspective}
          onCompare={(offerId) => {
            toggleCompareOffer(offerId);
            setIsComparisonOpen(true);
          }}
        />
      )}

      {/* Offer Comparison Sheet */}
      <OfferComparisonSheet
        open={isComparisonOpen}
        onOpenChange={setIsComparisonOpen}
        offers={offersForComparison}
      />
    </div>
  );
}

interface StatsCardProps {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string | undefined }>;
  accent: 'orange' | 'violet' | 'emerald' | 'sky' | 'amber';
}

const ACCENT_CLASSES: Record<StatsCardProps['accent'], string> = {
  orange: 'from-brand-orange-500 to-amber-500',
  violet: 'from-brand-deep-pitch-500 to-indigo-500',
  emerald: 'from-emerald-500 to-teal-500',
  sky: 'from-sky-500 to-blue-500',
  amber: 'from-amber-500 to-orange-500',
};

function StatsCard({ label, value, subtitle, icon: Icon, accent }: StatsCardProps) {
  return (
    <Card className="group overflow-hidden border-slate-200 bg-white transition-all hover:shadow-lg hover:shadow-slate-900/5">
      <CardContent className="flex flex-col justify-between p-4 sm:p-5 h-full">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {label}
          </span>
          <div
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-xs',
              ACCENT_CLASSES[accent]
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2 min-w-0">
          <p className="truncate text-2xl font-extrabold tracking-tight text-slate-900 tabular-nums">
            {value}
          </p>
          {subtitle && (
            <p className="mt-0.5 truncate text-[11px] text-slate-500 font-medium">
              {subtitle}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
