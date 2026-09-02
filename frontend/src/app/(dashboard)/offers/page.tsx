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
} from 'lucide-react';
import { OfferRow } from '@/components/offers/OfferRow';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Separator } from '@/components/ui/Separator';
import { OfferStatus, type Offer } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { cn, formatCurrency } from '@/lib/utils';
import { apiGet } from '@/lib/api';

type VirtualFilter = OfferStatus | 'all' | 'active' | 'pending' | 'closed';
type StatusFilter = VirtualFilter;

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

function offersMatchFilter(offers: Offer[], status: StatusFilter): Offer[] {
  if (status === 'all') return offers;
  if (status === 'active') {
    return offers.filter((o) => ACTIVE_OFFER_STATUSES.includes(o.status));
  }
  if (status === 'pending') {
    return offers.filter(
      (o) => o.status === OfferStatus.DRAFT || o.status === OfferStatus.SENT
    );
  }
  if (status === 'closed') {
    return offers.filter((o) => CLOSED_OFFER_STATUSES.includes(o.status));
  }
  return offers.filter((o) => o.status === status);
}

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: OfferStatus.NEGOTIATING, label: 'Negotiating' },
  { value: OfferStatus.ACCEPTED, label: 'Accepted' },
  { value: OfferStatus.REJECTED, label: 'Rejected' },
  { value: 'closed', label: 'Closed' },
];

interface StatsSummary {
  total: number;
  total_amount: number;
  avg_equity: number;
  pending_count: number;
  accepted_count: number;
}

export default function OffersPage() {
  const { isInvestor } = useAuth();
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [search, setSearch] = React.useState('');

  const perspective: 'investor' | 'startup' = isInvestor ? 'investor' : 'startup';

  const offersQuery = useQuery({
    queryKey: ['offers', perspective],
    queryFn: async () => {
      return apiGet<{ results: Offer[]; summary: StatsSummary }>('/offers/');
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const offers = offersQuery.data?.results ?? [];
  const summary = offersQuery.data?.summary;

  const filteredOffers = React.useMemo(() => {
    let result = offers;
    if (statusFilter === 'active') {
      result = result.filter((o) => ACTIVE_OFFER_STATUSES.includes(o.status));
    } else if (statusFilter !== 'all') {
      result = result.filter((o) => o.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((o) => {
        const pitchTitle = o.pitch_title?.toLowerCase() ?? '';
        const startupName = o.startup_name?.toLowerCase() ?? '';
        const investorName = o.investor_name?.toLowerCase() ?? '';
        const investorCompany = o.investor_company?.toLowerCase() ?? '';
        return (
          pitchTitle.includes(q) ||
          startupName.includes(q) ||
          investorName.includes(q) ||
          investorCompany.includes(q)
        );
      });
    }
    return result;
  }, [offers, statusFilter, search]);

  const activeCounts = React.useMemo(() => {
    const counts: Record<string, number> = { all: offers.length };
    counts['active'] = offersMatchFilter(offers, 'active').length;
    counts['pending'] = offersMatchFilter(offers, 'pending').length;
    counts['closed'] = offersMatchFilter(offers, 'closed').length;
    for (const o of offers) {
      counts[o.status] = (counts[o.status] ?? 0) + 1;
    }
    return counts;
  }, [offers]);

  const totalAmount = filteredOffers.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
  const avgEquity =
    filteredOffers.length > 0
      ? filteredOffers.reduce((sum, o) => sum + (Number(o.equity_pct) || 0), 0) / filteredOffers.length
      : 0;

  const headerTitle = isInvestor ? 'Offers you\'ve sent' : 'Offers you\'ve received';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Offers
            </h1>
            <Badge
              variant="default"
              className={cn(
                isInvestor
                  ? 'bg-brand-deep-pitch-500 hover:bg-brand-deep-pitch-600'
                  : 'bg-brand-orange-500 hover:bg-brand-orange-600'
              )}
            >
              <HandCoins className="mr-1 h-3 w-3" />
              {offers.length} total
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {headerTitle}. Track status, negotiate terms, and manage your pipeline.
          </p>
        </div>
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatsCard
          label={perspective === 'investor' ? 'Total deployed' : 'Total offered'}
          value={formatCurrency(summary?.total_amount ?? totalAmount)}
          icon={HandCoins}
          accent="orange"
        />
        <StatsCard
          label="Active"
          value={String(summary?.pending_count ?? activeCounts['active'] ?? 0)}
          icon={Sparkles}
          accent="violet"
        />
        <StatsCard
          label="Accepted"
          value={String(summary?.accepted_count ?? activeCounts[OfferStatus.ACCEPTED] ?? 0)}
          icon={TrendingUp}
          accent="emerald"
        />
        <StatsCard
          label="Avg. equity"
          value={`${(summary?.avg_equity ?? avgEquity).toFixed(1)}%`}
          icon={ArrowDownUp}
          accent="sky"
        />
      </div>

      <Card className="border-slate-200 bg-white">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="search"
                placeholder={`Search ${perspective === 'investor' ? 'startups or pitches' : 'investors or pitches'}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10"
              />
            </div>
            <Button
              variant="outline"
              size="default"
              leftIcon={<Filter className="h-4 w-4" />}
              className="h-10"
            >
              More filters
            </Button>
          </div>

          <div className="-mx-1 flex flex-wrap items-center gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-thin">
            {STATUS_FILTERS.map(({ value, label }) => {
              const isActive = statusFilter === value;
              const count = value === 'all' || value === 'active'
                ? activeCounts[value] ?? 0
                : activeCounts[value] ?? 0;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                    isActive
                      ? 'border-transparent bg-gradient-to-r from-brand-orange-500 to-brand-deep-pitch-500 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  )}
                >
                  {label}
                  <span
                    className={cn(
                      'flex h-4 min-w-[16px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-600'
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {offersQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-28 animate-pulse border-slate-200">
              <div className="h-full w-full bg-slate-100" />
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
        <Card className="border-dashed bg-slate-50/50">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-orange-500/10 to-brand-deep-pitch-500/10">
              <HandCoins className="h-8 w-8 text-brand-orange-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">
              {search || statusFilter !== 'all'
                ? 'No offers match your filters'
                : isInvestor
                ? 'You haven\'t made any offers yet'
                : 'You haven\'t received any offers yet'}
            </h3>
            <p className="max-w-md text-sm text-slate-600">
              {isInvestor
                ? 'Browse the newsfeed and send your first offer to a promising startup.'
                : 'Once your pitch goes live, investors will be able to send you structured offers here.'}
            </p>
            <Link href={isInvestor ? '/newsfeed' : '/pitches/new'}>
              <Button
                variant="default"
                size="default"
                leftIcon={isInvestor ? <TrendingUp className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                className="shadow-lg shadow-brand-orange-500/20"
              >
                {isInvestor ? 'Browse pitches' : 'Create your first pitch'}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredOffers.map((offer, i) => (
            <OfferRow key={`${offer.id}-${i}`} offer={offer} index={i} viewAs={perspective} />
          ))}
        </div>
      )}
    </div>
  );
}

interface StatsCardProps {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string | undefined }>;
  accent: 'orange' | 'violet' | 'emerald' | 'sky';
}

const ACCENT_CLASSES: Record<StatsCardProps['accent'], string> = {
  orange: 'from-brand-orange-500 to-amber-500',
  violet: 'from-brand-deep-pitch-500 to-indigo-500',
  emerald: 'from-emerald-500 to-teal-500',
  sky: 'from-sky-500 to-blue-500',
};

function StatsCard({ label, value, icon: Icon, accent }: StatsCardProps) {
  return (
    <Card className="group overflow-hidden border-slate-200 bg-white transition-all hover:shadow-lg hover:shadow-slate-900/5">
      <CardContent className="flex items-center gap-4 p-4 sm:p-5">
        <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md', ACCENT_CLASSES[accent])}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            {label}
          </p>
          <p className="mt-0.5 truncate text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
