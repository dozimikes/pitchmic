'use client';

import * as React from 'react';
import { Check, GitCompare, Sparkles } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { Separator } from '@/components/ui/Separator';
import {
  cn,
  followOnCapacityFromAmount,
  formatCompactCurrency,
  formatCurrency,
  impliedValuationFromOffer,
  numOr,
  strategicFitFromMatch,
} from '@/lib/utils';
import type { Offer } from '@/lib/types';

export interface OfferComparisonSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offers: Offer[];
}

const WEIGHTS = {
  match: 0.3,
  intent: 0.25,
  close: 0.2,
  valuation: 0.15,
  fit: 0.1,
} as const;

function fitToNum(fit: 'High' | 'Medium' | 'Low'): number {
  return fit === 'High' ? 100 : fit === 'Medium' ? 65 : 30;
}

function buildRow(offer: Offer, maxValuation: number) {
  const match = numOr(offer.match_score, 70);
  const intent = numOr(offer.investor_intent_pct, 50);
  const close = numOr(offer.close_probability_pct, Math.round(intent * 0.78));
  const implied = impliedValuationFromOffer(
    offer.amount,
    offer.equity_pct,
    offer.valuation
  );
  const valuationNorm = maxValuation > 0 && implied ? (implied / maxValuation) * 100 : 65;
  const fit = strategicFitFromMatch(offer.match_dimensions ?? offer.match_score);
  const weighted =
    match * WEIGHTS.match +
    intent * WEIGHTS.intent +
    close * WEIGHTS.close +
    valuationNorm * WEIGHTS.valuation +
    fitToNum(fit) * WEIGHTS.fit;
  const follow = followOnCapacityFromAmount(
    offer.amount,
    undefined
  );
  return {
    offer,
    match,
    intent,
    close,
    implied,
    valuationNorm,
    fit,
    weighted,
    follow,
  };
}

export function OfferComparisonSheet({
  open,
  onOpenChange,
  offers,
}: OfferComparisonSheetProps) {
  const rows = React.useMemo(() => {
    const impliedValues = offers
      .map((o) => impliedValuationFromOffer(o.amount, o.equity_pct, o.valuation))
      .filter((v): v is number => typeof v === 'number' && v > 0);
    const maxVal = impliedValues.length ? Math.max(...impliedValues) : 0;
    return offers.map((o) => buildRow(o, maxVal));
  }, [offers]);

  const ranked = React.useMemo(
    () => [...rows].sort((a, b) => b.weighted - a.weighted),
    [rows]
  );
  const winner = ranked[0];
  const runnerUp = ranked[1];

  const winnerAdvantage = winner && runnerUp ? winner.weighted - runnerUp.weighted : 0;

  const recommendation = React.useMemo(() => {
    if (!winner) return null;
    const winnerName =
      winner.offer.investor_company ||
      winner.offer.investor_name ||
      'Investor';
    const runnerName =
      runnerUp?.offer.investor_company ||
      runnerUp?.offer.investor_name;
    const strengths: string[] = [];
    if (winner.match >= 80 || (runnerUp && winner.match > runnerUp.match + 5)) {
      strengths.push('strongest Pitchmic Match');
    }
    if (winner.intent >= 70 || (runnerUp && winner.intent > runnerUp.intent + 8)) {
      strengths.push('highest investor conviction');
    }
    if (winner.close >= 70 || (runnerUp && winner.close > runnerUp.close + 8)) {
      strengths.push('best close probability');
    }
    if (winner.implied && (!runnerUp?.implied || winner.implied >= runnerUp.implied)) {
      strengths.push('top implied valuation');
    }
    if (winner.fit === 'High') strengths.push('high strategic fit');
    const strengthStr = strengths.length
      ? strengths.slice(0, 3).join(', ')
      : 'balanced performance across all dimensions';
    let sentence = `${winnerName} appears to offer the strongest overall combination of valuation, investor fit, conviction and closing probability.`;
    sentence += ` It leads on ${strengthStr}.`;
    if (runnerUp && runnerName && winnerAdvantage > 3) {
      const delta =
        runnerUp.implied && winner.implied
          ? Math.round((winner.implied / runnerUp.implied - 1) * 100)
          : 0;
      if (delta > 0) {
        sentence += ` Compared to ${runnerName}, the implied valuation is ~${delta}% higher with a ${Math.round(winnerAdvantage)}-point Pitchmic composite advantage.`;
      } else {
        sentence += ` Its Pitchmic composite score leads ${runnerName} by ~${Math.round(winnerAdvantage)} points driven by conviction and match strength.`;
      }
    }
    if (winner.follow === 'High') {
      sentence += ' Note: this investor also has strong projected follow-on capacity.';
    }
    return sentence;
  }, [winner, runnerUp, winnerAdvantage]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] max-h-[90vh] sm:h-[88vh]">
        <SheetHeader className="border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-orange-500/10 to-brand-deep-pitch-500/10">
              <GitCompare className="h-4 w-4 text-brand-orange-500" />
            </div>
            <div className="text-left">
              <SheetTitle className="text-lg font-bold">Compare Offers</SheetTitle>
              <SheetDescription>
                Side-by-side economics, match quality and closing odds · weighted recommendation below
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="overflow-y-auto px-6 py-5 pb-24">
          {rows.length < 2 ? (
            <Card className="border-dashed bg-slate-50">
              <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center text-slate-500">
                <GitCompare className="h-8 w-8 text-slate-400" />
                <p className="font-medium text-slate-700">
                  Select at least 2 offers to compare.
                </p>
                <p className="text-sm">
                  Use the [Compare] toggle on each offer card, then return here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[780px] border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                        Investor
                      </th>
                      {rows.map((r) => (
                        <th
                          key={r.offer.id}
                          className={cn(
                            'px-4 py-3 text-center font-semibold',
                            winner?.offer.id === r.offer.id &&
                              'bg-emerald-50/60 text-emerald-700'
                          )}
                        >
                          <div className="flex flex-col items-center gap-1">
                            {winner?.offer.id === r.offer.id && (
                              <Badge variant="success" className="text-[10px]">
                                <Check className="mr-0.5 h-2.5 w-2.5" />
                                Recommended
                              </Badge>
                            )}
                            <span className="text-slate-900 text-sm normal-case tracking-tight">
                              {r.offer.investor_company ||
                                r.offer.investor_name ||
                                'Investor'}
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {[
                      {
                        label: 'Capital',
                        accessor: (r: (typeof rows)[number]) =>
                          formatCurrency(Number(r.offer.amount || 0)),
                        numeric: false,
                      },
                      {
                        label: 'Equity',
                        accessor: (r: (typeof rows)[number]) => `${r.offer.equity_pct}%`,
                        numeric: false,
                      },
                      {
                        label: 'Implied Valuation',
                        accessor: (r: (typeof rows)[number]) =>
                          r.implied ? formatCompactCurrency(r.implied) : '—',
                        numeric: false,
                      },
                      {
                        label: 'Pitchmic Match',
                        accessor: (r: (typeof rows)[number]) => `${Math.round(r.match)}`,
                        numeric: true,
                        highlight: 'match',
                      },
                      {
                        label: 'Investor Intent',
                        accessor: (r: (typeof rows)[number]) => `${Math.round(r.intent)}%`,
                        numeric: true,
                        highlight: 'intent',
                      },
                      {
                        label: 'Strategic Fit',
                        accessor: (r: (typeof rows)[number]) => r.fit,
                        numeric: false,
                      },
                      {
                        label: 'Follow-on capacity',
                        accessor: (r: (typeof rows)[number]) => r.follow,
                        numeric: false,
                      },
                      {
                        label: 'Estimated close probability',
                        accessor: (r: (typeof rows)[number]) => `${Math.round(r.close)}%`,
                        numeric: true,
                        highlight: 'close',
                      },
                    ].map((rowDef, i) => (
                      <tr key={rowDef.label} className={i % 2 ? 'bg-slate-50/40' : ''}>
                        <td className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-slate-700">
                          <span className="text-xs uppercase tracking-wider text-slate-500">
                            {rowDef.label}
                          </span>
                        </td>
                        {rows.map((r) => {
                          const isBest =
                            rowDef.numeric &&
                            ranked[0] &&
                            (rowDef.highlight === 'match'
                              ? r.match === ranked[0].match
                              : rowDef.highlight === 'intent'
                              ? r.intent === ranked[0].intent
                              : rowDef.highlight === 'close'
                              ? r.close === ranked[0].close
                              : false);
                          return (
                            <td
                              key={r.offer.id}
                              className={cn(
                                'px-4 py-3 text-center tabular-nums',
                                winner?.offer.id === r.offer.id &&
                                  'bg-emerald-50/30',
                                isBest && 'font-bold text-emerald-700'
                              )}
                            >
                              {rowDef.accessor(r)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Separator className="my-6" />

              {recommendation && winner && (
                <Card className="border-brand-deep-pitch-200 bg-gradient-to-br from-brand-deep-pitch-50/70 via-white to-brand-orange-50/40">
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-brand-deep-pitch-200">
                        <Sparkles className="h-4 w-4 text-brand-deep-pitch-500" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          Pitchmic Recommendation
                        </h3>
                        <p className="text-[11px] uppercase tracking-wider text-slate-500">
                          Weighted composite · Match 30% · Intent 25% · Close 20% ·
                          Valuation 15% · Fit 10%
                        </p>
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-800">
                      {recommendation}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-600">
                      <Badge
                        variant="default"
                        className="bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/20"
                      >
                        Composite score: {Math.round(winner.weighted)}/100
                      </Badge>
                      {runnerUp && (
                        <Badge
                          variant="outline"
                          className="text-slate-600"
                        >
                          Margin vs #{runnerUp.offer.investor_company || 'alt'}:{' '}
                          {winnerAdvantage > 0
                            ? `+${winnerAdvantage.toFixed(1)}`
                            : winnerAdvantage.toFixed(1)}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-slate-500">
                        Deterministic · ML scores only, no LLM generation
                      </Badge>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                        Close
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default OfferComparisonSheet;
