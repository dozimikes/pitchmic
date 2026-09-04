'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, Plus, FileText, Eye, Heart, TrendingUp, Loader2,
  Archive, Radio, PenSquare, MoreHorizontal, CheckCircle2,
  Flame, AlertCircle, Sparkles,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { apiGet, apiPatch } from '@/lib/api';
import type { PaginatedResponse, Pitch } from '@/lib/types';
import { cn, formatRelative } from '@/lib/utils';

type FilterTab = 'all' | 'live' | 'draft';

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'draft', label: 'Drafts' },
];

export default function PitchesPage() {
  const [filter, setFilter] = React.useState<FilterTab>('all');
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['pitches', 'mine'],
    queryFn: () => apiGet<PaginatedResponse<Pitch>>('/pitches/?mine=true'),
  });

  const pitches = data?.results ?? [];

  const filtered = pitches.filter((p) => {
    if (filter === 'live') return !p.is_draft;
    if (filter === 'draft') return p.is_draft;
    return true;
  });

  const liveCount = pitches.filter((p) => !p.is_draft).length;
  const draftCount = pitches.filter((p) => p.is_draft).length;
  const totalViews = pitches.reduce((acc, p) => acc + (p.view_count ?? 0), 0);
  const totalOffers = pitches.reduce((acc, p) => acc + (p.offers_count ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              My Pitches
            </h1>
            <Badge variant="secondary">{pitches.length}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Manage and track all your pitch decks and funding rounds.
          </p>
        </div>
        <Link href="/pitches/new">
          <Button
            variant="default"
            leftIcon={<Plus className="h-4 w-4" />}
            className="shadow-lg shadow-brand-orange-500/20"
          >
            New pitch
          </Button>
        </Link>
      </div>

      {/* Stats bar */}
      {!isLoading && pitches.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total Pitches', value: pitches.length, icon: Mic, color: 'text-brand-orange-500' },
            { label: 'Live', value: liveCount, icon: Radio, color: 'text-emerald-600' },
            { label: 'Total Views', value: totalViews, icon: Eye, color: 'text-sky-600' },
            { label: 'Active Offers', value: totalOffers, icon: Flame, color: 'text-amber-500' },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className="border-slate-200 bg-white">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50', stat.color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-900 leading-none tabular-nums">{stat.value}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Filter tabs */}
      {!isLoading && pitches.length > 0 && (
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1 w-fit">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={cn(
                'rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all',
                filter === tab.value
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {tab.label}
              {tab.value === 'live' && liveCount > 0 && (
                <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                  {liveCount}
                </span>
              )}
              {tab.value === 'draft' && draftCount > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                  {draftCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-brand-orange-500" />
        </div>
      )}

      {/* Error */}
      {isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-2 py-8 text-center text-sm text-red-700 justify-center">
            <AlertCircle className="h-4 w-4" />
            Failed to load pitches. Please refresh and try again.
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && !isError && pitches.length === 0 && (
        <Card className="border-dashed bg-slate-50/50">
          <CardContent className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-orange-500/10 to-brand-deep-pitch-500/10">
              <Mic className="h-8 w-8 text-brand-orange-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">No pitches yet</h3>
              <p className="mt-1 text-sm text-slate-600">
                Create your first pitch to start attracting investors.
              </p>
            </div>
            <Link href="/pitches/new">
              <Button variant="default" leftIcon={<Plus className="h-4 w-4" />}>
                Create your first pitch
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Filtered empty state */}
      {!isLoading && !isError && pitches.length > 0 && filtered.length === 0 && (
        <Card className="border-dashed bg-slate-50/50">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Sparkles className="h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-500">
              No {filter} pitches found.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Pitch card grid */}
      {filtered.length > 0 && (
        <motion.div
          layout
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <AnimatePresence mode="popLayout">
            {filtered.map((pitch) => (
              <PitchSummaryCard
                key={pitch.id}
                pitch={pitch}
                onMutate={() => void queryClient.invalidateQueries({ queryKey: ['pitches', 'mine'] })}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}

function PitchSummaryCard({ pitch, onMutate }: { pitch: Pitch; onMutate: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const toggleDraftMutation = useMutation({
    mutationFn: () => apiPatch(`/pitches/${pitch.id}/`, { is_draft: !pitch.is_draft }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pitches', 'mine'] });
    },
  });

  const isLive = !pitch.is_draft;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="group relative overflow-hidden border-slate-200 transition-all hover:border-brand-orange-300 hover:shadow-md">
        {/* Status accent line */}
        <div
          className={cn(
            'absolute left-0 top-0 h-full w-1',
            pitch.is_draft ? 'bg-amber-400' : 'bg-emerald-500',
          )}
          aria-hidden="true"
        />

        <CardHeader className="pb-3 pl-5">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">
              {pitch.title}
            </CardTitle>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge variant={pitch.is_draft ? 'warning' : 'success'} className="text-[10px]">
                {pitch.is_draft ? 'Draft' : 'Live'}
              </Badge>
              {/* Actions dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                    aria-label="Pitch actions"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem
                    onClick={() => router.push(`/pitches/${pitch.id}/edit`)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <PenSquare className="h-3.5 w-3.5" /> Edit pitch
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void toggleDraftMutation.mutateAsync(undefined)}
                    disabled={toggleDraftMutation.isPending}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    {isLive ? (
                      <><Archive className="h-3.5 w-3.5 text-amber-500" /> Move to Draft</>
                    ) : (
                      <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Publish Live</>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => router.push(`/pitches/${pitch.id}`)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Eye className="h-3.5 w-3.5" /> View public page
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500">{formatRelative(pitch.created_at)}</p>
        </CardHeader>

        <CardContent className="pl-5">
          {pitch.description && (
            <p className="mb-3 line-clamp-2 text-xs text-slate-600">{pitch.description}</p>
          )}

          {/* Metrics row */}
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" />
              {/* FIXED: was showing like_count here - now shows view_count */}
              {pitch.view_count ?? 0} views
            </span>
            <span className="flex items-center gap-1">
              <Heart className="h-3.5 w-3.5" />
              {pitch.like_count ?? 0} likes
            </span>
            {(pitch.offers_count ?? 0) > 0 && (
              <span className="flex items-center gap-1 font-medium text-brand-orange-600">
                <TrendingUp className="h-3.5 w-3.5" />
                {pitch.offers_count} offer{pitch.offers_count !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* CTA buttons */}
          <div className="mt-4 flex items-center gap-2">
            <Link href={`/pitches/${pitch.id}`} className="flex-1">
              <Button variant="outline" size="sm" className="w-full" leftIcon={<Eye className="h-3.5 w-3.5" />}>
                View
              </Button>
            </Link>
            <Link href={`/pitches/${pitch.id}/edit`} className="flex-1">
              <Button variant="ghost" size="sm" className="w-full" leftIcon={<FileText className="h-3.5 w-3.5" />}>
                Edit
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
