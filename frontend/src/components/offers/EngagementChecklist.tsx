'use client';

import * as React from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IntentDisplayTier } from '@/lib/utils';

export interface EngagementChecklistProps {
  behavioralSignals?: string[] | null;
  intentTier: IntentDisplayTier;
  compact?: boolean;
}

export interface SignalItem {
  key: string;
  label: string;
  event: string;
  minTier: IntentDisplayTier;
}

const SIGNAL_ITEMS: SignalItem[] = [
  { key: 'view', label: 'Pitch viewed', event: 'VIEW_PITCH', minTier: 'LOW' },
  { key: 'deck', label: 'Deck downloaded', event: 'DOWNLOAD_DECK', minTier: 'WARM' },
  { key: 'dataroom', label: 'Data room viewed', event: 'VIEW_DATAROOM', minTier: 'WARM' },
  { key: 'intro', label: 'Partner introduced', event: 'REQUEST_INTRO', minTier: 'HIGH CONVICTION' },
  { key: 'offer', label: 'Offer submitted', event: 'SUBMIT_OFFER', minTier: 'VERY HIGH CONVICTION' },
];

const TIER_RANK: Record<IntentDisplayTier, number> = {
  LOW: 0,
  WARM: 1,
  'HIGH CONVICTION': 2,
  'VERY HIGH CONVICTION': 3,
};

function tierMeetsMin(tier: IntentDisplayTier, min: IntentDisplayTier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[min];
}

export function EngagementChecklist({
  behavioralSignals,
  intentTier,
  compact = false,
}: EngagementChecklistProps) {
  const signals = new Set((behavioralSignals ?? []).map((s) => s.toUpperCase()));

  const visibleItems = SIGNAL_ITEMS.filter((item) =>
    tierMeetsMin(intentTier, item.minTier) || TIER_RANK[intentTier] >= TIER_RANK['WARM']
  );
  const items = visibleItems.length >= 3 ? visibleItems : SIGNAL_ITEMS.slice(0, 3);

  return (
    <div
      className={cn(
        'grid gap-1.5',
        items.length <= 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-5'
      )}
    >
      {items.map((item) => {
        const present = signals.has(item.event.toUpperCase());
        // If the tier would imply this signal but it's not in the set, still show a soft greyed-out mark to avoid visual gaps
        const implied = !present && tierMeetsMin(intentTier, item.minTier);
        return (
          <div
            key={item.key}
            className={cn(
              'flex items-center gap-1.5 rounded-md',
              compact ? 'py-0.5' : 'py-1'
            )}
          >
            {present ? (
              <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <Check className="h-3 w-3 stroke-[3px]" />
              </span>
            ) : implied ? (
              <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-500">
                <Check className="h-3 w-3 stroke-[3px] opacity-70" />
              </span>
            ) : (
              <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Minus className="h-3 w-3 stroke-[3px]" />
              </span>
            )}
            <span
              className={cn(
                'truncate text-xs',
                present
                  ? 'font-medium text-slate-800'
                  : implied
                  ? 'text-slate-600'
                  : 'text-slate-500'
              )}
            >
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default EngagementChecklist;
