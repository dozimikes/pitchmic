'use client';

import * as React from 'react';
import { Activity, FileText, FolderKanban, Clock } from 'lucide-react';
import { cn, formatRelative, numOr } from '@/lib/utils';

export interface InvestorEngagementScoreProps {
  score: number | null | undefined;
  lastActivity?: string | Date | null;
  documentsViewed?: number;
  deckViewedPct?: number;
  className?: string;
  compact?: boolean;
}

export function InvestorEngagementScore({
  score,
  lastActivity,
  documentsViewed,
  deckViewedPct,
  className,
  compact = false,
}: InvestorEngagementScoreProps) {
  const value = numOr(score, 0);
  const isMeaningful = value > 0 || documentsViewed !== undefined || deckViewedPct !== undefined || lastActivity;

  if (!isMeaningful && compact) return null;

  const displayScore =
    score === null || score === undefined || Number.isNaN(Number(score)) ? null : Math.round(value);

  const scoreColor =
    displayScore === null
      ? 'text-slate-400'
      : displayScore >= 80
      ? 'text-emerald-600'
      : displayScore >= 55
      ? 'text-brand-orange-500'
      : 'text-slate-500';

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2',
        compact && 'px-2.5 py-1.5',
        className
      )}
    >
      <div className="flex items-center gap-1.5">
        <Activity className={cn('h-3.5 w-3.5 shrink-0', scoreColor)} />
        <span className={cn('text-xs font-medium text-slate-600', compact && 'text-[11px]')}>
          Investor Engagement
        </span>
        <span className={cn('text-sm font-bold tabular-nums', scoreColor)}>
          {displayScore === null ? '—' : `${displayScore}/100`}
        </span>
      </div>
      <span className="hidden sm:inline-block h-3 w-px bg-slate-200" aria-hidden="true" />
      {(deckViewedPct !== undefined || documentsViewed !== undefined || lastActivity) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          {deckViewedPct !== undefined && (
            <div className="flex items-center gap-1">
              <FileText className="h-3 w-3 text-slate-400" />
              <span>
                Deck: <span className="font-medium text-slate-700">{Math.round(deckViewedPct)}% viewed</span>
              </span>
            </div>
          )}
          {documentsViewed !== undefined && (
            <div className="flex items-center gap-1">
              <FolderKanban className="h-3 w-3 text-slate-400" />
              <span>
                Data room:{' '}
                <span className="font-medium text-slate-700">{documentsViewed} doc{documentsViewed === 1 ? '' : 's'} viewed</span>
              </span>
            </div>
          )}
          {lastActivity && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-slate-400" />
              <span>
                Last: <span className="font-medium text-slate-700">{formatRelative(lastActivity)}</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default InvestorEngagementScore;
