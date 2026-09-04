'use client';

import * as React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import { cn, numOr, scoreBarColorClasses } from '@/lib/utils';
import type { ScoreColorScheme } from '@/lib/types';
import { Info } from 'lucide-react';

export interface ScoreBarProps {
  value: number | null | undefined;
  label: string;
  suffix?: string;
  colorScheme?: ScoreColorScheme;
  modelTooltip?: string;
  showValue?: boolean;
  compact?: boolean;
}

const SCHEME_TOOLTIPS: Record<ScoreColorScheme, string> = {
  match:
    'Pitchmic MatchScore — multi-dimensional composite of industry, stage, ticket, location and semantic similarity between your startup and this investor.',
  intent:
    'Investor Intent — computed by the BehavioralSequenceModel from the progression and velocity of investor signals (views → deck → data room → intro → offer).',
  close:
    'Close Probability — VentureOutcomePredictor × offer-status multiplier. Estimates the likelihood this offer converts to a signed round.',
  generic: 'Pitchmic ML score.',
};

export function ScoreBar({
  value,
  label,
  suffix = '',
  colorScheme = 'generic',
  modelTooltip,
  showValue = true,
  compact = false,
}: ScoreBarProps) {
  const displayValue =
    value === null || value === undefined || Number.isNaN(Number(value))
      ? null
      : Math.round(Number(value));
  const pct = displayValue === null ? 0 : Math.max(0, Math.min(100, displayValue));
  const tooltip = modelTooltip ?? SCHEME_TOOLTIPS[colorScheme];

  return (
    <div className={cn('flex flex-col gap-1 w-full', compact && 'gap-0.5')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          <span
            className={cn(
              'truncate font-medium text-slate-700',
              compact ? 'text-[10px] uppercase tracking-wider' : 'text-xs'
            )}
          >
            {label}
          </span>
          <Tooltip>
            <TooltipTrigger className="shrink-0 inline-flex text-slate-400 hover:text-slate-600 transition-colors">
              <Info className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
              <div className="max-w-[240px] leading-snug">{tooltip}</div>
            </TooltipContent>
          </Tooltip>
        </div>
        {showValue && (
          <span
            className={cn(
              'shrink-0 tabular-nums font-bold text-slate-900',
              compact ? 'text-xs' : 'text-sm'
            )}
          >
            {displayValue === null ? '—' : `${displayValue}${suffix}`}
          </span>
        )}
      </div>
      <div
        className={cn(
          'w-full overflow-hidden rounded-full bg-slate-100',
          compact ? 'h-1.5' : 'h-2'
        )}
        role="progressbar"
        aria-valuenow={displayValue ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${displayValue ?? 'n/a'}${suffix}`}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            scoreBarColorClasses(colorScheme, displayValue)
          )}
          style={{ width: displayValue === null ? '0%' : `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default ScoreBar;
