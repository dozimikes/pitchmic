'use client';

import * as React from 'react';
import Link from 'next/link';
import { Mic, Plus, FileText, Eye, Heart, TrendingUp, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { apiGet } from '@/lib/api';
import type { PaginatedResponse, Pitch } from '@/lib/types';
import { cn, formatRelative } from '@/lib/utils';

export default function PitchesPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['pitches', 'mine'],
    queryFn: () => apiGet<PaginatedResponse<Pitch>>('/pitches/?mine=true'),
  });

  const pitches = data?.results ?? [];

  return (
    <div className="space-y-6">
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

      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-brand-orange-500" />
        </div>
      )}

      {isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-8 text-center text-sm text-red-700">
            Failed to load pitches. Please refresh and try again.
          </CardContent>
        </Card>
      )}

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

      {pitches.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pitches.map((pitch) => (
            <PitchSummaryCard key={pitch.id} pitch={pitch} />
          ))}
        </div>
      )}
    </div>
  );
}

function PitchSummaryCard({ pitch }: { pitch: Pitch }) {
  return (
    <Card className="group relative overflow-hidden border-slate-200 transition-all hover:border-brand-orange-300 hover:shadow-md">
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
          <Badge variant={pitch.is_draft ? 'warning' : 'success'} className="shrink-0 text-[10px]">
            {pitch.is_draft ? 'Draft' : 'Live'}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-slate-500">{formatRelative(pitch.created_at)}</p>
      </CardHeader>
      <CardContent className="pl-5">
        {pitch.description && (
          <p className="mb-3 line-clamp-2 text-xs text-slate-600">{pitch.description}</p>
        )}
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" />
            {pitch.like_count ?? 0}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" />
            {pitch.like_count ?? 0}
          </span>
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" />
            {pitch.offers_count ?? 0} offers
          </span>
        </div>
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
  );
}
