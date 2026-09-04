'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Search,
  Filter,
  TrendingUp,
  Sparkles,
  Plus,
  Loader2,
  Rocket,
  ArrowDown,
  SlidersHorizontal,
  ShieldCheck,
  Briefcase,
  Layers,
  Brain,
  FolderLock,
  HandCoins,
  Target,
  BarChart3,
  Mic,
  Eye,
  Heart,
  ArrowUpRight,
} from 'lucide-react';
import { useNewsfeed } from '@/hooks/useNewsfeed';
import { useRouter } from 'next/navigation';
import { PitchCard } from '@/components/newsfeed/PitchCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Separator } from '@/components/ui/Separator';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/lib/types';
import { cn } from '@/lib/utils';

type SortOption = 'newest' | 'popular' | 'trending' | 'featured';

const SORT_OPTIONS: Array<{ value: SortOption; label: string; icon: React.ComponentType<{ className?: string | undefined }> }> = [
  { value: 'newest', label: 'Newest', icon: Sparkles },
  { value: 'trending', label: 'Trending', icon: TrendingUp },
  { value: 'popular', label: 'Most liked', icon: Rocket },
  { value: 'featured', label: 'Featured', icon: Sparkles },
];

const INDUSTRIES = [
  'SaaS',
  'AI / ML',
  'Fintech',
  'Healthtech',
  'Climate',
  'Consumer',
  'E-commerce',
  'B2B Software',
];

const STAGES = ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Growth'];

export default function NewsfeedPage() {
  const { isStartup, isInvestor, isAccelerator, isAdminMode, canSwitchRole, setActiveRole } = useAuth();
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [sort, setSort] = React.useState<SortOption>('newest');
  const [industry, setIndustry] = React.useState<string | undefined>(undefined);
  const [stage, setStage] = React.useState<string | undefined>(undefined);
  const [showFilters, setShowFilters] = React.useState(false);
  const debouncedSearchRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  React.useEffect(() => {
    if (debouncedSearchRef.current) clearTimeout(debouncedSearchRef.current);
    debouncedSearchRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 350);
    return () => {
      if (debouncedSearchRef.current) clearTimeout(debouncedSearchRef.current);
    };
  }, [search]);

  const {
    pitches,
    isLoadingInitial,
    isLoadingMore,
    canLoadMore,
    loadMore,
    query,
  } = useNewsfeed({
    search: debouncedSearch || undefined,
    sort,
    industry,
    stage,
  });

  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && canLoadMore && !isLoadingMore) {
          loadMore();
        }
      },
      { rootMargin: '200px 0px' }
    );

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    return () => observer.disconnect();
  }, [canLoadMore, isLoadingMore, loadMore]);

  const activeFiltersCount =
    (industry ? 1 : 0) + (stage ? 1 : 0) + (debouncedSearch ? 1 : 0);

  const resetFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setIndustry(undefined);
    setStage(undefined);
  };

  return (
    <div className="space-y-6">
      {/* ── Top Header with role and persona title ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {isInvestor ? 'Investor Deal Stream' : 'Peer Ecosystem Feed'}
            </h1>
            <Badge variant="default" className="bg-brand-deep-pitch-500 hover:bg-brand-deep-pitch-600">
              <Sparkles className="mr-1 h-3 w-3" />
              {pitches.length} pitches
            </Badge>
            {isInvestor && (
              <Badge variant="outline" className="text-indigo-700 border-indigo-200 bg-indigo-50 text-xs gap-1">
                <Brain className="h-3 w-3" />AI-Matched
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {isInvestor
              ? 'High-signal dealflow - curated Pan-African pitches matched to your investment focus.'
              : 'Explore the pitch ecosystem and track how your own startup is gaining traction.'}
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {canSwitchRole && (
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 gap-0.5">
              <button
                type="button"
                onClick={() => {
                  setActiveRole(UserRole.ADMIN);
                  router.push('/admin');
                }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                  isAdminMode
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/60'
                )}
                title="Switch to Admin Dashboard"
              >
                <ShieldCheck className={cn('h-3.5 w-3.5', isAdminMode ? 'text-emerald-400' : 'text-slate-500')} />
                <span>Admin</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveRole(UserRole.ACCELERATOR);
                  router.push('/accelerator');
                }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                  isAccelerator
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/60'
                )}
                title="Switch to Accelerator Dashboard"
              >
                <Layers className={cn('h-3.5 w-3.5', isAccelerator ? 'text-purple-400' : 'text-slate-500')} />
                <span>Accelerator</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveRole(UserRole.INVESTOR)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                  isInvestor
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/60'
                )}
                title="Switch to Investor View"
              >
                <Briefcase className={cn('h-3.5 w-3.5', isInvestor ? 'text-indigo-400' : 'text-slate-500')} />
                <span>Investor</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveRole(UserRole.STARTUP)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                  isStartup
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/60'
                )}
                title="Switch to Startup View"
              >
                <Rocket className={cn('h-3.5 w-3.5', isStartup ? 'text-brand-orange-400' : 'text-slate-500')} />
                <span>Startup</span>
              </button>
            </div>
          )}

          {isStartup && (
            <Link href="/pitches/new">
              <Button
                variant="default"
                size="default"
                leftIcon={<Plus className="h-4 w-4" />}
                className="shadow-lg shadow-brand-orange-500/20"
              >
                New Pitch
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* ── INVESTOR MODE: Diligence Filter Bar ── */}
      {(isInvestor || isAdminMode) && (
        <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50/70 via-white to-blue-50/40 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 shadow-md shadow-indigo-600/20">
                <Target className="h-4.5 w-4.5 text-white" />
              </div>
              <div>
                <div className="text-xs font-bold text-indigo-800 uppercase tracking-wide">Diligence Radar &mdash; Investor Mode</div>
                <div className="text-[11px] text-indigo-600/80">Filter by ticket size &middot; Trigger DataRoom requests &middot; Pin deals to portfolio</div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Ticket Size Filters */}
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider self-center">Ticket:</div>
              {[
                { label: '< $50k', range: 'micro' },
                { label: '$50k–$250k', range: 'seed' },
                { label: '$250k–$1M', range: 'pre_series_a' },
                { label: '$1M+', range: 'series_a' },
              ].map((t) => (
                <button
                  key={t.range}
                  type="button"
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all"
                >
                  {t.label}
                </button>
              ))}

              <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />

              {/* DataRoom & DataMemo triggers */}
              <button
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all"
              >
                <FolderLock className="h-3.5 w-3.5" />
                <span>DataRoom Access</span>
              </button>

              <button
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white hover:border-amber-600 transition-all"
              >
                <HandCoins className="h-3.5 w-3.5" />
                <span>Send Term Sheet</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STARTUP MODE: Founder Traction Radar ── */}
      {isStartup && !isAdminMode && (
        <div className="rounded-2xl border border-brand-orange-200 bg-gradient-to-r from-brand-orange-50/60 via-white to-amber-50/40 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-orange-500 shadow-md shadow-brand-orange-500/20">
                <BarChart3 className="h-4.5 w-4.5 text-white" />
              </div>
              <div>
                <div className="text-xs font-bold text-brand-orange-800 uppercase tracking-wide">Founder Traction Radar</div>
                <div className="text-[11px] text-brand-orange-600/90">Track your pitch engagement &middot; see investor signals &middot; benchmark vs. peers</div>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-brand-orange-200">
                <Eye className="h-3.5 w-3.5 text-brand-orange-500" />
                <span className="text-xs font-bold text-slate-700">Pitch Views: <span className="text-brand-orange-600">{pitches.reduce((a, p) => a + (p.like_count ?? 0), 0)} signals</span></span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-brand-orange-200">
                <Heart className="h-3.5 w-3.5 text-rose-500" />
                <span className="text-xs font-bold text-slate-700">Total Likes: <span className="text-rose-600">{pitches.reduce((a, p) => a + p.like_count, 0)}</span></span>
              </div>
              <Link href="/pitches/new">
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-brand-orange-500 text-white hover:bg-brand-orange-600 transition-all shadow-sm"
                >
                  <Mic className="h-3.5 w-3.5" />
                  <span>Record New Pitch</span>
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Search & Filter Card ── */}
      <Card className="border-slate-200 bg-white">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="search"
                placeholder="Search pitches, startups, keywords..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="default"
                onClick={() => setShowFilters((s) => !s)}
                leftIcon={<SlidersHorizontal className="h-4 w-4" />}
                className="h-10"
              >
                Filters
                {activeFiltersCount > 0 && (
                  <span className="ml-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-orange-500 px-1.5 text-[10px] font-bold text-white">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {SORT_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setSort(value)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                  sort === value
                    ? 'border-transparent bg-gradient-to-r from-brand-orange-500 to-brand-deep-pitch-500 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              {activeFiltersCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="text-xs h-8"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2">
              <FilterGroup
                title="Industry"
                options={INDUSTRIES}
                value={industry}
                onChange={(v) => setIndustry(v === industry ? undefined : v)}
              />
              <FilterGroup
                title="Stage"
                options={STAGES}
                value={stage}
                onChange={(v) => setStage(v === stage ? undefined : v)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {isLoadingInitial ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card
              key={i}
              className="h-[420px] overflow-hidden border-slate-200 animate-pulse"
            >
              <div className="aspect-[16/9] w-full bg-slate-200" />
              <div className="space-y-3 p-5">
                <div className="h-5 w-3/4 rounded bg-slate-200" />
                <div className="space-y-2">
                  <div className="h-3 w-full rounded bg-slate-200" />
                  <div className="h-3 w-5/6 rounded bg-slate-200" />
                  <div className="h-3 w-2/3 rounded bg-slate-200" />
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div className="h-14 rounded bg-slate-200" />
                  <div className="h-14 rounded bg-slate-200" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : pitches.length === 0 ? (
        <Card className="border-dashed bg-slate-50/50">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-orange-500/10 to-brand-deep-pitch-500/10">
              <Filter className="h-8 w-8 text-brand-orange-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">No pitches match your filters</h3>
            <p className="max-w-md text-sm text-slate-600">
              Try removing some filters, adjusting your search, or exploring a
              different sort order.
            </p>
            <Button
              variant="outline"
              onClick={resetFilters}
              size="default"
              leftIcon={<TrendingUp className="h-4 w-4" />}
            >
              Clear filters & show all
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {pitches.map((pitch, i) => (
              <PitchCard key={`${pitch.id}-${i}`} pitch={pitch} index={i} />
            ))}
          </div>

          <div ref={sentinelRef} className="h-1" />

          <div className="mt-10 flex flex-col items-center justify-center gap-3">
            {isLoadingMore ? (
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm text-slate-600 shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin text-brand-orange-500" />
                Loading more pitches...
              </div>
            ) : canLoadMore ? (
              <Button
                variant="outline"
                size="lg"
                onClick={loadMore}
                leftIcon={<ArrowDown className="h-4 w-4" />}
                className="shadow-sm"
                disabled={query.isFetchingNextPage}
              >
                Load more
              </Button>
            ) : pitches.length > 0 ? (
              <p className="rounded-full border border-slate-200 bg-white px-5 py-2 text-xs text-slate-500 shadow-sm">
                 You&apos;re all caught up! Check back soon for new pitches.
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

interface FilterGroupProps {
  title: string;
  options: string[];
  value?: string | undefined;
  onChange: (value: string) => void;
}

function FilterGroup({ title, options, value, onChange }: FilterGroupProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-all',
              value === option
                ? 'border-transparent bg-brand-orange-500 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-700 hover:border-brand-orange-300 hover:text-brand-orange-700'
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
