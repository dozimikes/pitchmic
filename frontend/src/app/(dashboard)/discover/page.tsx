'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles, TrendingUp, MapPin, Building2, Target,
  ChevronRight, RefreshCw, Loader2, Zap, Filter,
} from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';

//  Types 

interface MatchScore {
  id: number;
  startup: number;
  startup_name: string;
  investor: number;
  investor_name: string;
  compatibility_score: number;
  industry_score: number;
  stage_score: number;
  ticket_size_score: number;
  location_score: number;
  semantic_score: number;
  confidence_interval: { lower: number; upper: number };
  created_at: string;
}

//  Helpers 

function scorePct(v: number) {
  return `${Math.round(v * 100)}%`;
}

function compatColor(score: number) {
  if (score >= 0.75) return 'bg-emerald-500';
  if (score >= 0.5) return 'bg-amber-400';
  return 'bg-rose-400';
}

function ScoreDimension({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-500 w-20 flex-shrink-0">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-1.5 rounded-full ${compatColor(value)}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="w-8 text-right font-semibold text-slate-600">{scorePct(value)}</span>
    </div>
  );
}

function MatchCard({ match, isStartupView }: { match: MatchScore; isStartupView: boolean }) {
  const [expanded, setExpanded] = React.useState(false);
  const compatPct = Math.round(match.compatibility_score * 100);

  return (
    <Card className="border-slate-200 hover:border-indigo-300 transition-colors">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-900 text-sm truncate">
                {isStartupView ? match.investor_name : match.startup_name}
              </span>
              <Badge
                variant={compatPct >= 75 ? 'success' : compatPct >= 50 ? 'warning' : 'secondary'}
                className="text-[11px]"
              >
                {compatPct}% match
              </Badge>
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
              {isStartupView ? (
                <>
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> Investor
                  </span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Startup
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Compatibility gauge */}
          <div className="flex-shrink-0 flex flex-col items-center gap-1">
            <div className="relative w-12 h-12">
              <svg viewBox="0 0 36 36" className="rotate-[-90deg]">
                <circle cx="18" cy="18" r="15" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                <circle
                  cx="18" cy="18" r="15"
                  fill="none"
                  stroke={compatPct >= 75 ? '#10b981' : compatPct >= 50 ? '#f59e0b' : '#ef4444'}
                  strokeWidth="4"
                  strokeDasharray={`${compatPct * 0.94} 100`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-slate-700">
                {compatPct}
              </div>
            </div>
          </div>
        </div>

        {/* Expandable dimensions */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 flex items-center gap-1 text-xs text-indigo-500 font-semibold hover:underline"
        >
          {expanded ? 'Hide details' : 'View dimension scores'}
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>

        {expanded && (
          <div className="mt-3 space-y-2 pt-3 border-t border-slate-100">
            <ScoreDimension label="Industry" value={match.industry_score} />
            <ScoreDimension label="Stage" value={match.stage_score} />
            <ScoreDimension label="Ticket size" value={match.ticket_size_score} />
            <ScoreDimension label="Location" value={match.location_score} />
            <ScoreDimension label="Semantic fit" value={match.semantic_score} />
            {match.confidence_interval && (
              <p className="text-[10px] text-slate-400 pt-1">
                Confidence interval: {Math.round(match.confidence_interval.lower * 100)}%–
                {Math.round(match.confidence_interval.upper * 100)}%
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

//  Main Page 

export default function DiscoverPage() {
  const { user, isStartup, isInvestor } = useAuth();
  const queryClient = useQueryClient();
  const [limit, setLimit] = React.useState(10);

  const { data: matches, isLoading, isFetching, refetch } = useQuery<MatchScore[]>({
    queryKey: ['top-matches', limit],
    queryFn: () =>
      apiGet<{ results?: MatchScore[] } | MatchScore[]>(`/matching/top-matches/?limit=${limit}`)
        .then((r) => (Array.isArray(r) ? r : r.results ?? [])),
    staleTime: 5 * 60 * 1000,
  });

  // Trigger async refresh of match scores (startup only)
  const refreshMutation = useMutation({
    mutationFn: (startupId: number) =>
      apiPost(`/matching/refresh/${startupId}/`, {}),
    onSuccess: () => {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['top-matches'] }), 3000);
    },
  });

  const startupId = (user as any)?.startup_id ?? null;

  const topMatches = matches ?? [];
  const emptyState = !isLoading && topMatches.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {isStartup ? 'Your Top Investor Matches' : 'Your Top Startup Matches'}
            </h1>
            <Badge variant="secondary">AI-Powered</Badge>
          </div>
          <p className="text-sm text-slate-600">
            Multi-dimensional compatibility scoring across industry, stage, ticket size,
            location, and semantic fit.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isStartup && startupId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => refreshMutation.mutate(startupId)}
              disabled={refreshMutation.isPending}
            >
              {refreshMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <Zap className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
              )}
              Refresh Scores
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            Reload
          </Button>
        </div>
      </div>

      {/* Score legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span className="font-semibold text-slate-600">Score guide:</span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
          Strong (≥75%)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
          Moderate (50–74%)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-rose-400 inline-block" />
          Weak (&lt;50%)
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Filter className="w-3.5 h-3.5" />
          Showing top
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="ml-1 text-xs border border-slate-200 rounded px-1.5 py-0.5"
          >
            {[5, 10, 20, 50].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </span>
      </div>

      {/* Loading skeletons */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      )}

      {/* Refresh in progress notice */}
      {refreshMutation.isSuccess && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-700 flex items-center gap-2">
          <Zap className="w-4 h-4 text-indigo-500" />
          Match scores are being recalculated — results will refresh automatically in ~10 seconds.
        </div>
      )}

      {/* Match cards */}
      {!isLoading && topMatches.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {topMatches.map((match) => (
            <MatchCard key={match.id} match={match} isStartupView={!!isStartup} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {emptyState && (
        <Card className="p-12 text-center border-dashed border-2 border-slate-200">
          <Target className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700 mb-1">No matches yet</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
            Match scores are computed nightly.
            {isStartup && ' Click "Refresh Scores" to trigger an immediate calculation.'}
            {isInvestor && ' Check back after startups have published their pitches.'}
          </p>
          {isStartup && startupId && (
            <Button
              size="sm"
              onClick={() => refreshMutation.mutate(startupId)}
              disabled={refreshMutation.isPending}
              className="bg-indigo-600 text-white"
            >
              <Zap className="w-3.5 h-3.5 mr-1.5" />
              Calculate My Matches Now
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}
