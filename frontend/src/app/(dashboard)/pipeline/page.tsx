'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, DollarSign, Users, CheckCircle2, Clock, Target,
  TrendingUp, Plus, ChevronRight, AlertCircle, MessageSquare,
  FolderLock, HandCoins, Loader2, ArrowRight, Circle, Sparkles,
  ShieldCheck, RefreshCw, ExternalLink, Award, AlertTriangle,
  FileText, Check, X, Building2, Briefcase,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Separator } from '@/components/ui/Separator';
import { apiGet } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { OfferStatus, type Offer } from '@/lib/types';
import {
  opportunityIntelligenceApi,
  type RecommendedOpportunity,
} from '@/lib/opportunityIntelligenceApi';
import { MatchAnalysisModal } from '@/components/pipeline/MatchAnalysisModal';

// ---------------------------------------------------------------------------
// Pipeline Stage Configuration
// ---------------------------------------------------------------------------
const PIPELINE_STAGES = [
  {
    id: 'outreach',
    label: 'Outreach',
    description: 'Investors contacted or introduced',
    color: 'bg-slate-200',
    textColor: 'text-slate-700',
    icon: Users,
  },
  {
    id: 'interested',
    label: 'Interested',
    description: 'Expressed interest, reviewing materials',
    color: 'bg-sky-100',
    textColor: 'text-sky-700',
    icon: Target,
  },
  {
    id: 'diligence',
    label: 'Due Diligence',
    description: 'Active data room or investor review',
    color: 'bg-amber-100',
    textColor: 'text-amber-700',
    icon: FolderLock,
  },
  {
    id: 'term_sheet',
    label: 'Term Sheet',
    description: 'Offer received, under negotiation',
    color: 'bg-brand-orange-100',
    textColor: 'text-brand-orange-700',
    icon: HandCoins,
  },
  {
    id: 'closed',
    label: 'Closed',
    description: 'Investment committed and wired',
    color: 'bg-emerald-100',
    textColor: 'text-emerald-700',
    icon: CheckCircle2,
  },
] as const;

type PipelineStage = typeof PIPELINE_STAGES[number]['id'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function offerToPipelineStage(offer: Offer): PipelineStage {
  switch (offer.status) {
    case OfferStatus.DRAFT:
    case OfferStatus.SENT:
    case OfferStatus.NEGOTIATING:
      return 'term_sheet';
    case OfferStatus.ACCEPTED:
      return 'closed';
    default:
      return 'interested';
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Data Shapes
// ---------------------------------------------------------------------------
interface PipelineContact {
  id: string;
  name: string;
  stage: PipelineStage;
  amount: number;
  note: string;
  date: string;
  isOpportunity?: boolean;
  isInvestorMatch?: boolean;
  compatibilityPct?: number;
}

interface MatchScoreItem {
  id: number;
  investor_name: string;
  investor_firm: string;
  compatibility_score: number;
  ticket_size_score: number;
  created_at: string;
  asking_amount: string | null;
}

interface Notification {
  id: string;
  title: string;
  body: string;
  notification_type: string;
  category: string;
  created_at: string;
  read_at: string | null;
}

// ---------------------------------------------------------------------------
// Add Investor Contact Modal
// ---------------------------------------------------------------------------
interface AddContactModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (contact: PipelineContact) => void;
}

function AddContactModal({ open, onClose, onAdd }: AddContactModalProps) {
  const [name, setName] = React.useState('');
  const [firm, setFirm] = React.useState('');
  const [stage, setStage] = React.useState<PipelineStage>('outreach');
  const [amount, setAmount] = React.useState('');
  const [note, setNote] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const id = `manual_${Date.now()}`;
    onAdd({
      id,
      name: firm ? `${name} - ${firm}` : name,
      stage,
      amount: Number(amount.replace(/[^0-9.]/g, '')) || 0,
      note: note.trim() || 'Manually added investor contact',
      date: new Date().toISOString().slice(0, 10),
    });
    setName(''); setFirm(''); setStage('outreach'); setAmount(''); setNote('');
    onClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="relative w-full max-w-md mx-4 rounded-2xl border border-slate-200 bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-orange-100">
                <Users className="h-4 w-4 text-brand-orange-600" />
              </div>
              <h2 className="text-sm font-bold text-slate-900">Add Investor Contact</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Contact Name *
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-orange-400 focus:outline-none focus:ring-2 focus:ring-brand-orange-100"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Firm / Fund
                </label>
                <input
                  value={firm}
                  onChange={(e) => setFirm(e.target.value)}
                  placeholder="Savannah Fund"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-orange-400 focus:outline-none focus:ring-2 focus:ring-brand-orange-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Pipeline Stage
                </label>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value as PipelineStage)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-orange-400 focus:outline-none focus:ring-2 focus:ring-brand-orange-100"
                >
                  {PIPELINE_STAGES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Target Amount (USD)
                </label>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="150000"
                  type="number"
                  min="0"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-orange-400 focus:outline-none focus:ring-2 focus:ring-brand-orange-100"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Note
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="e.g. Intro via conference, reviewing Q3 metrics"
                className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-orange-400 focus:outline-none focus:ring-2 focus:ring-brand-orange-100"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="text-xs bg-brand-orange-500 hover:bg-brand-orange-600 text-white gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Add to Pipeline
              </Button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function FundraisingPipelinePage() {
  const queryClient = useQueryClient();
  const [selectedOppForModal, setSelectedOppForModal] = React.useState<RecommendedOpportunity | null>(null);
  const [manualContacts, setManualContacts] = React.useState<PipelineContact[]>([]);
  const [showAddModal, setShowAddModal] = React.useState(false);

  function ensureArray<T>(val: unknown, fallbackKey?: keyof T): T[] {
    if (Array.isArray(val)) return val as T[];
    if (val && typeof val === 'object') {
      const obj = val as Record<string, unknown>;
      const candidates = [fallbackKey, 'results', 'data'] as const;
      for (const key of candidates) {
        if (key && Array.isArray(obj[key as string])) return obj[key as string] as T[];
      }
    }
    return [];
  }

  // 1. Real database offers
  const { data: offersRaw, isLoading: isLoadingOffers } = useQuery({
    queryKey: ['offers', 'pipeline'],
    queryFn: async () => {
      try {
        return await apiGet<{ results?: Offer[] } | Offer[]>('/offers/');
      } catch {
        return [] as Offer[];
      }
    },
    staleTime: 15000,
  });

  // 2. Real AI opportunity recommendations
  const {
    data: opportunityData,
    isLoading: isLoadingOpps,
    refetch: refetchOpps,
    isFetching: isFetchingOpps,
  } = useQuery({
    queryKey: ['funding-opportunities', 'recommended'],
    queryFn: () => opportunityIntelligenceApi.getRecommended(),
    staleTime: 30000,
  });

  // 3. Real investor match scores from /matching/top-matches/
  const { data: matchScoresRaw, isLoading: isLoadingMatches } = useQuery({
    queryKey: ['matching', 'top-matches'],
    queryFn: async () => {
      try {
        return await apiGet<{ results?: MatchScoreItem[] } | MatchScoreItem[]>(
          '/matching/top-matches/?limit=20'
        );
      } catch {
        return [] as MatchScoreItem[];
      }
    },
    staleTime: 60000,
  });

  // 4. Real notifications for activity timeline
  const { data: notificationsRaw } = useQuery({
    queryKey: ['notifications', 'pipeline'],
    queryFn: async () => {
      try {
        return await apiGet<{ results?: Notification[] } | Notification[]>(
          '/notifications/?ordering=-created_at&limit=8'
        );
      } catch {
        return [] as Notification[];
      }
    },
    staleTime: 30000,
  });

  // 5. Trigger Ecosystem Ingestion Sync
  const syncMutation = useMutation({
    mutationFn: () => opportunityIntelligenceApi.triggerSync(),
    onSuccess: () => {
      void refetchOpps();
    },
  });

  // 6. Save opportunity to pipeline
  const saveToPipelineMutation = useMutation({
    mutationFn: (opp: RecommendedOpportunity) =>
      opportunityIntelligenceApi.saveToPipeline(opp.opportunity_id, 'interested'),
    onSuccess: () => {
      void refetchOpps();
    },
  });

  const offers: Offer[] = ensureArray<Offer>(offersRaw);
  const matchScores: MatchScoreItem[] = ensureArray<MatchScoreItem>(matchScoresRaw);
  const notifications: Notification[] = ensureArray<Notification>(notificationsRaw);
  const recommendedOpps = Array.isArray(opportunityData?.recommendations)
    ? opportunityData.recommendations
    : [];

  // -- Build pipeline contacts from real offers --
  const offerContacts: PipelineContact[] = offers.map((o) => ({
    id: `offer_${o.id}`,
    name: (o as any).investor_name || (o as any).investor?.full_name || (o as any).investor?.company_name || 'Venture Partner',
    stage: offerToPipelineStage(o),
    amount: Number(o.amount ?? 0),
    note: `Term sheet: ${formatCurrency(Number(o.amount ?? 0))} at ${o.equity_pct ?? 0}% equity`,
    date: o.created_at?.slice(0, 10) ?? 'Recent',
  }));

  // -- Build pipeline contacts from real investor match scores --
  // High match (>=0.75) go to "interested", lower go to "outreach"
  const investorContacts: PipelineContact[] = matchScores.map((m) => {
    const pct = Math.round(m.compatibility_score * 100);
    const displayName = m.investor_firm
      ? `${m.investor_firm}`
      : m.investor_name || 'Investor';
    return {
      id: `match_${m.id}`,
      name: displayName,
      stage: pct >= 75 ? 'interested' : 'outreach',
      amount: Number(m.asking_amount?.replace(/[^0-9.]/g, '') || 0),
      note: `AI Match: ${pct}% compatibility. Industry: ${Math.round((m.ticket_size_score ?? 0) * 100)}% ticket size fit.`,
      date: m.created_at?.slice(0, 10) ?? 'Recent',
      isInvestorMatch: true,
      compatibilityPct: pct,
    };
  });

  // -- Build pipeline contacts from saved opportunities (is_saved_to_pipeline = true) --
  const savedOppContacts: PipelineContact[] = recommendedOpps
    .filter((opp) => opp.is_saved_to_pipeline)
    .map((opp) => ({
      id: `opp_${opp.opportunity_id}`,
      name: opp.title,
      stage: (opp as any).pipeline_stage as PipelineStage ?? 'interested',
      amount: Number(opp.funding_max_usd || 0),
      note: `${opp.organization} - ${opp.opportunity_type}. Match: ${opp.overall_match_score}%`,
      date: 'Saved',
      isOpportunity: true,
    }));

  // Merge all real sources + manual additions
  // De-duplicate by id: offers take precedence over investor matches if same investor appears
  const allContacts: PipelineContact[] = [
    ...offerContacts,
    ...savedOppContacts,
    ...investorContacts.filter(
      (m) => !offerContacts.some((o) => o.name === m.name)
    ),
    ...manualContacts,
  ];

  // Pipeline aggregate statistics
  const totalOutreach = allContacts.length;
  const activeCount = allContacts.filter((c) => c.stage === 'diligence' || c.stage === 'term_sheet').length;
  const totalCommitted = allContacts.filter((c) => c.stage === 'closed').reduce((s, c) => s + c.amount, 0);
  const totalPipeline = allContacts.filter((c) => c.stage !== 'closed').reduce((s, c) => s + c.amount, 0);
  const highFitCount = opportunityData?.high_fit_count ?? recommendedOpps.filter((o) => o.overall_match_score >= 85).length;

  // Build activity events from real notifications + opportunity verification timestamps
  const activityEvents = React.useMemo(() => {
    const events: { label: string; sub: string; time: string; type: string }[] = [];

    // From real notifications
    notifications.slice(0, 6).forEach((n) => {
      events.push({
        label: n.title || 'Pipeline update',
        sub: n.body || n.category || '',
        time: relativeTime(n.created_at),
        type: n.notification_type || n.category || 'info',
      });
    });

    // From opportunity verification timestamps (if no notifications yet)
    if (events.length === 0) {
      recommendedOpps.slice(0, 4).forEach((opp) => {
        events.push({
          label: `${opp.title} verified`,
          sub: `Status: ${opp.status}${opp.days_remaining != null ? ` - ${opp.days_remaining} days remaining` : ''}`,
          time: `${opp.verified_freshness_hours_ago}h ago`,
          type: 'opportunity',
        });
      });
    }

    return events;
  }, [notifications, recommendedOpps]);

  const isLoading = isLoadingOffers || isLoadingMatches;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Fundraising Pipeline</h1>
            <Badge className="bg-brand-orange-500 text-white text-xs">Continuous OS</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Track active investor relationships, term sheet negotiations, and verified ecosystem funding opportunities.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/offers">
            <Button variant="outline" size="sm" className="gap-2 text-xs">
              <HandCoins className="h-3.5 w-3.5" />
              Offers &amp; Term Sheets
            </Button>
          </Link>
          <Button
            size="sm"
            variant="default"
            onClick={() => syncMutation.mutate()}
            loading={syncMutation.isPending || isFetchingOpps}
            className="gap-2 text-xs bg-slate-900 hover:bg-slate-800 text-white"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', (syncMutation.isPending || isFetchingOpps) && 'animate-spin')} />
            Sync Opportunities
          </Button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Contacts</p>
            <p className="text-2xl font-black text-slate-900 mt-1">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : totalOutreach}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">In active funnel</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Diligence</p>
            <p className="text-2xl font-black text-brand-orange-600 mt-1">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : activeCount}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">In review or term sheet</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Committed Capital</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : formatCurrency(totalCommitted)}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Closed investments</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pipeline Potential</p>
            <p className="text-2xl font-black text-sky-600 mt-1">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : formatCurrency(totalPipeline)}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Open discussions</p>
          </CardContent>
        </Card>
        <Card className="border-brand-orange-200 bg-gradient-to-br from-orange-50/50 to-white">
          <CardContent className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-brand-orange-600 flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Matched Radar
            </p>
            <p className="text-2xl font-black text-slate-900 mt-1">
              {isLoadingOpps ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : recommendedOpps.length}
            </p>
            <p className="text-xs text-emerald-600 font-semibold mt-0.5">{highFitCount} High Fit (&ge;85%)</p>
          </CardContent>
        </Card>
      </div>

      {/* ── SECTION: VERIFIED FUNDING OPPORTUNITIES RADAR ── */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Target className="h-4 w-4 text-brand-orange-500" />
                Verified Funding Opportunities Radar
              </h2>
              <Badge variant="secondary" className="text-[10px] font-bold">
                {recommendedOpps.length} Matched
              </Badge>
              <span className="flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Eco-Monitor Active
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Continuously discovered from Tier-1 official portals, change-verified, and personalized to your venture profile.
            </p>
          </div>
          <div className="text-xs text-slate-400">
            Source: Official Portals (Antler, Visa, Google, Future Africa)
          </div>
        </div>

        {isLoadingOpps ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-brand-orange-500" />
          </div>
        ) : recommendedOpps.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-10 text-center gap-2">
            <Target className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-500">No opportunities matched yet</p>
            <p className="text-xs text-slate-400">Click Sync Opportunities to ingest live ecosystem data</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => syncMutation.mutate()}
              loading={syncMutation.isPending}
              className="mt-2 text-xs gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Sync Now
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recommendedOpps.map((opp) => (
              <Card
                key={opp.opportunity_id}
                className="group relative flex flex-col justify-between border-slate-200 bg-white transition-all hover:border-brand-orange-300 hover:shadow-md"
              >
                <div className="p-5 space-y-3">
                  {/* Top Badges */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] font-bold uppercase text-slate-600">
                        {opp.organization}
                      </Badge>
                      <Badge
                        className={cn(
                          'text-[10px] font-bold text-white',
                          opp.overall_match_score >= 90
                            ? 'bg-emerald-600'
                            : opp.overall_match_score >= 80
                            ? 'bg-brand-orange-500'
                            : 'bg-slate-700'
                        )}
                      >
                        {opp.overall_match_score}% Match
                      </Badge>
                    </div>

                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-[10px] font-bold',
                        opp.status === 'CLOSING_SOON'
                          ? 'bg-amber-100 text-amber-900 border-amber-300'
                          : 'bg-slate-100 text-slate-700'
                      )}
                    >
                      {opp.status === 'CLOSING_SOON' ? `Closes in ${opp.days_remaining ?? 18}d` : opp.status}
                    </Badge>
                  </div>

                  {/* Title and Description */}
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm group-hover:text-brand-orange-600 transition-colors">
                      {opp.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                      {opp.description}
                    </p>
                  </div>

                  {/* Capital and Freshness Strip */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-[11px]">Funding Range:</span>
                      <span className="font-bold text-slate-900">
                        ${Number(opp.funding_min_usd).toLocaleString()} - ${Number(opp.funding_max_usd).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>Terms: {opp.equity_terms}</span>
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Verified {opp.verified_freshness_hours_ago}h ago
                      </span>
                    </div>
                  </div>

                  {/* Match signals */}
                  <div className="space-y-1 text-xs">
                    <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                        <Check className="h-3 w-3 text-emerald-600" /> Stage Fit ({opp.dimensional_scores.stage_fit}%)
                      </span>
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                        <Check className="h-3 w-3 text-emerald-600" /> Geography ({opp.dimensional_scores.geography_fit}%)
                      </span>
                    </div>

                    {opp.evidence_gaps && opp.evidence_gaps.length > 0 && (
                      <div className="pt-1">
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60 font-medium">
                          <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                          {opp.evidence_gaps[0]}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="border-t border-slate-100 bg-slate-50/50 p-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedOppForModal(opp)}
                    className="text-xs font-bold text-brand-orange-600 hover:text-brand-orange-700 hover:underline flex items-center gap-1"
                  >
                    Why {opp.overall_match_score}%?
                  </button>

                  <div className="flex items-center gap-1.5">
                    {!opp.is_saved_to_pipeline ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={saveToPipelineMutation.isPending}
                        onClick={() => saveToPipelineMutation.mutate(opp)}
                        className="h-7 text-[11px] px-2 gap-1 border-slate-300"
                      >
                        <Plus className="h-3 w-3" /> Add to Pipeline
                      </Button>
                    ) : (
                      <Badge className="h-7 px-2 text-[11px] bg-emerald-100 text-emerald-800 font-semibold gap-1">
                        <Check className="h-3 w-3" /> In Pipeline
                      </Badge>
                    )}
                    <a href={opp.application_url} target="_blank" rel="noopener noreferrer">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-[11px] px-2.5 bg-brand-orange-500 hover:bg-brand-orange-600 text-white gap-1 shadow-2xs"
                      >
                        Apply
                      </Button>
                    </a>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* ── SECTION: KANBAN-STYLE PIPELINE FUNNEL ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Activity className="h-4 w-4 text-brand-orange-500" />
              Pipeline Funnel Stages
            </h2>
            <p className="text-xs text-slate-500">
              Investor relationships from AI matches, active offers, and saved opportunities.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-xs"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Add Investor Contact
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-brand-orange-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {PIPELINE_STAGES.map((stage) => {
              const stageContacts = allContacts.filter((c) => c.stage === stage.id);
              const StageIcon = stage.icon;
              return (
                <div key={stage.id} className="flex flex-col gap-2">
                  {/* Stage Header */}
                  <div className={cn('flex items-center justify-between rounded-xl px-3 py-2', stage.color)}>
                    <div className="flex items-center gap-2">
                      <StageIcon className={cn('h-3.5 w-3.5 shrink-0', stage.textColor)} />
                      <span className={cn('text-xs font-bold', stage.textColor)}>{stage.label}</span>
                    </div>
                    <span className={cn('text-xs font-black tabular-nums', stage.textColor)}>
                      {stageContacts.length}
                    </span>
                  </div>

                  {/* Stage Cards */}
                  <div className="space-y-2 min-h-[90px]">
                    {stageContacts.length === 0 ? (
                      <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 py-6 text-[11px] text-slate-400">
                        Empty stage
                      </div>
                    ) : (
                      stageContacts.map((contact) => (
                        <motion.div
                          key={contact.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs hover:border-brand-orange-200 hover:shadow-xs transition-all cursor-pointer space-y-1"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs font-bold text-slate-900 leading-snug truncate">{contact.name}</p>
                            <div className="flex items-center gap-1 shrink-0">
                              {contact.isOpportunity && (
                                <Badge className="bg-brand-orange-100 text-brand-orange-800 text-[9px] py-0 px-1">Eco</Badge>
                              )}
                              {contact.isInvestorMatch && (
                                <Badge className="bg-sky-100 text-sky-800 text-[9px] py-0 px-1">AI</Badge>
                              )}
                            </div>
                          </div>
                          {contact.amount > 0 && (
                            <p className="text-[11px] font-semibold text-brand-orange-600">
                              {formatCurrency(contact.amount)}
                            </p>
                          )}
                          {contact.compatibilityPct != null && (
                            <p className="text-[11px] font-semibold text-sky-600">
                              {contact.compatibilityPct}% compatibility
                            </p>
                          )}
                          <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">
                            {contact.note}
                          </p>
                          <p className="text-[10px] text-slate-400 pt-1 tabular-nums">{contact.date}</p>
                        </motion.div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SECTION: REAL ACTIVITY TIMELINE ── */}
      <Separator />
      <div>
        <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-400" />
          Recent Ingestion &amp; Pipeline Activity
        </h2>

        {activityEvents.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 py-8 text-[11px] text-slate-400">
            No recent activity. Activity populates as you receive notifications and ecosystem updates.
          </div>
        ) : (
          <div className="space-y-2">
            {activityEvents.map((event, i) => {
              const iconType = event.type;
              const Icon =
                iconType === 'opportunity'
                  ? ShieldCheck
                  : iconType === 'offer' || iconType === 'deal'
                  ? HandCoins
                  : iconType === 'diligence'
                  ? FolderLock
                  : iconType === 'action_required'
                  ? AlertCircle
                  : Activity;
              const color =
                iconType === 'opportunity'
                  ? 'text-emerald-600'
                  : iconType === 'offer' || iconType === 'deal'
                  ? 'text-brand-orange-500'
                  : iconType === 'diligence'
                  ? 'text-amber-600'
                  : iconType === 'action_required'
                  ? 'text-red-500'
                  : 'text-sky-600';

              return (
                <div key={`${event.label}-${i}`} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3">
                  <div className={cn('mt-0.5 shrink-0', color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-900">{event.label}</p>
                    {event.sub && (
                      <p className="text-[11px] text-slate-500 mt-0.5">{event.sub}</p>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{event.time}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Match Analysis Modal */}
      <MatchAnalysisModal
        opportunity={selectedOppForModal}
        isOpen={!!selectedOppForModal}
        onClose={() => setSelectedOppForModal(null)}
        onAddToPipeline={(opp) => saveToPipelineMutation.mutate(opp)}
      />

      {/* Add Investor Contact Modal */}
      <AddContactModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={(contact) => setManualContacts((prev) => [...prev, contact])}
      />
    </div>
  );
}
