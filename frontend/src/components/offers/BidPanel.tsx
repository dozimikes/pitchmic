'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DollarSign, Percent, TrendingUp, MessageSquare, Calendar, Send, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { OfferCreateSchema, type OfferCreateInput } from '@/lib/validators';
import { apiPost } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { cn, formatCurrency } from '@/lib/utils';
import type { Pitch } from '@/lib/types';

export interface BidPanelProps {
  pitch: Pitch;
  onSuccess?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function BidPanel({ pitch, onSuccess, onDismiss, className }: BidPanelProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<OfferCreateInput>({
    resolver: zodResolver(OfferCreateSchema),
    defaultValues: {
      pitch_id: pitch.id,
      amount: undefined,
      equity_pct: undefined,
      valuation: undefined,
      message: '',
      expires_at: undefined,
    },
  });

  const amount = watch('amount');
  const equity = watch('equity_pct');
  const impliedValuation =
    amount && equity && equity > 0
      ? Math.round(amount / (equity / 100))
      : undefined;

  const createOfferMutation = useMutation({
    mutationFn: async (data: OfferCreateInput) => {
      return apiPost('/offers/', {
        pitch: data.pitch_id,
        amount: data.amount,
        equity_pct: data.equity_pct,
        valuation: data.valuation,
        message: data.message,
        expires_at: data.expires_at,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['offers'] });
      void queryClient.invalidateQueries({ queryKey: ['pitches'] });
      reset();
      onSuccess?.();
    },
  });

  const onSubmit = handleSubmit((data) => {
    void createOfferMutation.mutateAsync(data);
  });

  return (
    <Card className={cn('border-slate-200 bg-white shadow-lg', className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <CardTitle className="text-base font-semibold text-slate-900">
          Make an offer
        </CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 truncate max-w-[200px]">
            {pitch.title}
          </span>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-5">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {/* Hidden pitch_id */}
          <input type="hidden" {...register('pitch_id')} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Investment Amount */}
            <div className="space-y-1.5">
              <Label htmlFor="bid-amount" className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <DollarSign className="h-3.5 w-3.5 text-slate-400" />
                Investment amount
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <Input
                  id="bid-amount"
                  type="number"
                  min={1}
                  step={1000}
                  placeholder="500,000"
                  className={cn('pl-7', errors.amount && 'border-red-400 focus:ring-red-400')}
                  aria-invalid={!!errors.amount}
                  aria-describedby={errors.amount ? 'bid-amount-error' : undefined}
                  {...register('amount')}
                />
              </div>
              {errors.amount && (
                <p id="bid-amount-error" role="alert" className="text-xs text-red-600">
                  {errors.amount.message}
                </p>
              )}
            </div>

            {/* Equity % */}
            <div className="space-y-1.5">
              <Label htmlFor="bid-equity" className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Percent className="h-3.5 w-3.5 text-slate-400" />
                Equity %
              </Label>
              <div className="relative">
                <Input
                  id="bid-equity"
                  type="number"
                  min={0.01}
                  max={100}
                  step={0.1}
                  placeholder="10"
                  className={cn('pr-7', errors.equity_pct && 'border-red-400 focus:ring-red-400')}
                  aria-invalid={!!errors.equity_pct}
                  aria-describedby={errors.equity_pct ? 'bid-equity-error' : undefined}
                  {...register('equity_pct')}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
              </div>
              {errors.equity_pct && (
                <p id="bid-equity-error" role="alert" className="text-xs text-red-600">
                  {errors.equity_pct.message}
                </p>
              )}
            </div>
          </div>

          {/* Implied valuation read-only */}
          {impliedValuation !== undefined && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5">
              <TrendingUp className="h-4 w-4 text-brand-deep-pitch-500 shrink-0" />
              <span className="text-xs text-slate-600">
                Implied pre-money valuation:{' '}
                <strong className="text-slate-900">{formatCurrency(impliedValuation)}</strong>
              </span>
            </div>
          )}

          {/* Valuation override */}
          <div className="space-y-1.5">
            <Label htmlFor="bid-valuation" className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <TrendingUp className="h-3.5 w-3.5 text-slate-400" />
              Pre-money valuation
              <span className="ml-1 font-normal text-slate-400">(optional)</span>
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
              <Input
                id="bid-valuation"
                type="number"
                min={1}
                step={10000}
                placeholder={impliedValuation ? String(impliedValuation) : '5,000,000'}
                className={cn('pl-7', errors.valuation && 'border-red-400')}
                {...register('valuation')}
              />
            </div>
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <Label htmlFor="bid-message" className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
              Message to founder
            </Label>
            <Textarea
              id="bid-message"
              rows={4}
              placeholder="Introduce yourself and explain why you're excited about this opportunity..."
              className={cn(errors.message && 'border-red-400 focus:ring-red-400')}
              aria-invalid={!!errors.message}
              aria-describedby={errors.message ? 'bid-message-error' : undefined}
              {...register('message')}
            />
            {errors.message && (
              <p id="bid-message-error" role="alert" className="text-xs text-red-600">
                {errors.message.message}
              </p>
            )}
          </div>

          {/* Expiry */}
          <div className="space-y-1.5">
            <Label htmlFor="bid-expires" className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              Offer expiry
              <span className="ml-1 font-normal text-slate-400">(optional)</span>
            </Label>
            <Input
              id="bid-expires"
              type="date"
              min={new Date().toISOString().split('T')[0]}
              {...register('expires_at')}
            />
          </div>

          {createOfferMutation.isError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {(createOfferMutation.error as Error).message ?? 'Failed to submit offer. Please try again.'}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            {onDismiss && (
              <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              variant="default"
              size="default"
              loading={isSubmitting || createOfferMutation.isPending}
              leftIcon={<Send className="h-4 w-4" />}
              className="shadow-md shadow-brand-orange-500/20"
            >
              Send offer
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
