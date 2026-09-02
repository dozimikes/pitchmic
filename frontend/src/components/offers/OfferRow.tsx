'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  DollarSign,
  Percent,
  Calendar,
  MessageSquare,
  Check,
  X,
  ChevronRight,
  Clock,
  Handshake,
  Send,
  MoreHorizontal,
  ArrowUpDown,
} from 'lucide-react';
import { cn, formatCurrency, formatDate, formatRelative } from '@/lib/utils';
import { Offer, OfferStatus, UserRole } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/DropdownMenu';
import { useAuth } from '@/hooks/useAuth';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPatch } from '@/lib/api';

export interface OfferRowProps {
  offer: Offer;
  index?: number;
  viewAs?: 'investor' | 'startup' | 'auto';
  onStatusChange?: (offerId: string, status: OfferStatus) => void;
  onOpen?: (offerId: string) => void;
}

const STATUS_META: Record<
  OfferStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'; icon: React.ComponentType<{ className?: string | undefined }> }
> = {
  [OfferStatus.DRAFT]: {
    label: 'Draft',
    variant: 'secondary',
    icon: Clock,
  },
  [OfferStatus.SENT]: {
    label: 'Sent',
    variant: 'warning',
    icon: Send,
  },
  [OfferStatus.NEGOTIATING]: {
    label: 'Negotiating',
    variant: 'default',
    icon: ArrowUpDown,
  },
  [OfferStatus.ACCEPTED]: {
    label: 'Accepted',
    variant: 'success',
    icon: Check,
  },
  [OfferStatus.REJECTED]: {
    label: 'Rejected',
    variant: 'destructive',
    icon: X,
  },
  [OfferStatus.WITHDRAWN]: {
    label: 'Withdrawn',
    variant: 'secondary',
    icon: X,
  },
  [OfferStatus.EXPIRED]: {
    label: 'Expired',
    variant: 'outline',
    icon: Calendar,
  },
};

const rowVariants = {
  hidden: { opacity: 0, x: -16 },
  show: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.35,
      ease: [0.22, 1, 0.36, 1],
      delay: i * 0.05,
    },
  }),
};

export function OfferRow({
  offer,
  index = 0,
  viewAs = 'auto',
  onStatusChange,
  onOpen,
}: OfferRowProps) {
  const { user, isStartup, isInvestor } = useAuth();
  const queryClient = useQueryClient();

  const perspective: 'startup' | 'investor' =
    viewAs === 'auto'
      ? isStartup
        ? 'startup'
        : 'investor'
      : (viewAs as 'startup' | 'investor');

  const counterpartyName =
    perspective === 'startup'
      ? offer.investor_company || offer.investor_name || 'Investor'
      : offer.startup_name || 'Startup';

  const counterpartyLogo: string | null = null; // flat serializer does not include avatar/logo URLs

  const statusMeta = STATUS_META[offer.status];
  const StatusIcon = statusMeta.icon;
  void user;

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, message }: { id: string; status: OfferStatus; message?: string }) => {
      return apiPatch(`/offers/${id}/`, { status, message });
    },
    onSuccess: (_data, { id, status }) => {
      onStatusChange?.(id, status);
      void queryClient.invalidateQueries({ queryKey: ['offers'] });
    },
  });

  const handleStatusChange = (status: OfferStatus, message?: string) => {
    void updateStatusMutation.mutateAsync({
      id: offer.id,
      status,
      message,
    });
  };

  const canAccept = perspective === 'startup' && offer.status === OfferStatus.SENT;
  const canReject = perspective === 'startup' && (offer.status === OfferStatus.SENT || offer.status === OfferStatus.NEGOTIATING);
  const canNegotiate =
    (perspective === 'startup' || perspective === 'investor') &&
    (offer.status === OfferStatus.SENT || offer.status === OfferStatus.NEGOTIATING);
  const canWithdraw = perspective === 'investor' && (offer.status === OfferStatus.SENT || offer.status === OfferStatus.NEGOTIATING || offer.status === OfferStatus.DRAFT);

  const valuation =
    offer.amount && offer.equity_pct
      ? Math.round((Number(offer.amount) / (Number(offer.equity_pct) / 100)))
      : offer.valuation ? Number(offer.valuation) : null;

  return (
    <motion.div
      custom={index}
      variants={rowVariants}
      initial="hidden"
      animate="show"
      layout
      whileHover={{ scale: 1.004 }}
      transition={{ type: 'spring', stiffness: 350, damping: 28 }}
      className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white transition-all duration-200 hover:border-brand-orange-300 hover:shadow-lg hover:shadow-slate-900/5"
    >
      <div className={cn(
        'absolute left-0 top-0 h-full w-1',
        offer.status === OfferStatus.ACCEPTED && 'bg-emerald-500',
        offer.status === OfferStatus.SENT && 'bg-amber-500',
        offer.status === OfferStatus.DRAFT && 'bg-slate-300',
        offer.status === OfferStatus.NEGOTIATING && 'bg-brand-orange-500',
        offer.status === OfferStatus.REJECTED && 'bg-red-500',
        offer.status === OfferStatus.WITHDRAWN && 'bg-slate-400',
        offer.status === OfferStatus.EXPIRED && 'bg-slate-200',
      )} aria-hidden="true" />

      <button
        type="button"
        onClick={() => onOpen?.(offer.id)}
        className="w-full p-4 sm:p-5 text-left"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
          <div className="flex min-w-0 items-center gap-3 sm:min-w-[220px] sm:flex-1">
            <div className="relative shrink-0">
              <Avatar
                src={counterpartyLogo}
                alt={counterpartyName}
                fallback={counterpartyName}
                size="lg"
                className="border-2 border-white shadow-sm ring-1 ring-slate-200"
              />
              <div
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white shadow-sm',
                  perspective === 'startup'
                    ? 'bg-brand-deep-pitch-500'
                    : 'bg-brand-orange-500'
                )}
              >
                {perspective === 'startup' ? (
                  <Handshake className="h-2.5 w-2.5 text-white" />
                ) : (
                  <Send className="h-2.5 w-2.5 text-white" />
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">
                {counterpartyName}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {perspective === 'startup' ? 'Investor offer' : 'Offer to startup'} ·{' '}
                {offer.pitch_title ? (
                  <span className="text-brand-orange-600 font-medium">
                    {offer.pitch_title}
                  </span>
                ) : (
                  'Pitch'
                )}
              </p>
              {offer.message && (
                <p className="mt-2 flex items-start gap-1.5 line-clamp-1 text-xs text-slate-600">
                  <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                  {offer.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-6 sm:flex sm:items-center sm:justify-end sm:min-w-[480px]">
            <div className="flex flex-col">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <DollarSign className="h-3 w-3" />
                Investment
              </div>
              <div className="mt-0.5 text-base font-bold text-slate-900 sm:text-lg tabular-nums">
                {formatCurrency(Number(offer.amount))}
              </div>
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <Percent className="h-3 w-3" />
                Equity
              </div>
              <div className="mt-0.5 text-base font-bold text-slate-900 sm:text-lg tabular-nums">
                {offer.equity_pct}%
              </div>
            </div>

            {valuation && (
              <div className="hidden flex-col sm:flex">
                <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <ArrowUpDown className="h-3 w-3" />
                  Valuation
                </div>
                <div className="mt-0.5 text-sm font-semibold text-slate-700 tabular-nums">
                  {formatCurrency(valuation)}
                </div>
              </div>
            )}

            <div className="flex flex-col items-start sm:items-end">
              <Badge
                variant={statusMeta.variant}
                className="inline-flex items-center gap-1 px-2.5 py-1"
              >
                <StatusIcon className="h-3 w-3" />
                {statusMeta.label}
              </Badge>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                <Calendar className="h-3 w-3" />
                <span>{formatRelative(offer.created_at)}</span>
              </div>
            </div>
          </div>

          <ChevronRight className="hidden h-5 w-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-orange-500 sm:block" />
        </div>

        {offer.expires_at &&
          (offer.status === OfferStatus.SENT || offer.status === OfferStatus.NEGOTIATING) && (
            <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-slate-600">
                Offer expires on{' '}
                <span className="font-semibold text-slate-800">
                  {formatDate(offer.expires_at)}
                </span>
              </span>
            </div>
          )}
      </button>

      {(canAccept || canReject || canNegotiate || canWithdraw) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
          {canAccept && (
            <Button
              size="sm"
              variant="default"
              loading={updateStatusMutation.isPending}
              onClick={(e) => {
                e.stopPropagation();
                handleStatusChange(OfferStatus.ACCEPTED);
              }}
              leftIcon={<Check className="h-3.5 w-3.5" />}
            >
              Accept offer
            </Button>
          )}
          {canNegotiate && (
            <Button
              size="sm"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                handleStatusChange(OfferStatus.NEGOTIATING);
              }}
              leftIcon={<ArrowUpDown className="h-3.5 w-3.5" />}
            >
              Negotiate
            </Button>
          )}
          {canReject && (
            <Button
              size="sm"
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                handleStatusChange(OfferStatus.REJECTED);
              }}
              leftIcon={<X className="h-3.5 w-3.5" />}
            >
              Decline
            </Button>
          )}
          {canWithdraw && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                handleStatusChange(OfferStatus.WITHDRAWN);
              }}
            >
              Withdraw offer
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Link href={`/messages?offer=${offer.id}`} onClick={(e) => e.stopPropagation()}>
              <Button variant="outline" size="sm" leftIcon={<MessageSquare className="h-3.5 w-3.5" />}>
                Message
              </Button>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-500"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Offer actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8}>
                <DropdownMenuLabel>Offer details</DropdownMenuLabel>
                <Link href={`/offers/${offer.id}`} onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem>
                    <ChevronRight className="h-4 w-4" />
                    View full offer
                  </DropdownMenuItem>
                </Link>
                <Link href={offer.pitch ? `/pitches/${offer.pitch}` : '#'} onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem>
                    <Send className="h-4 w-4" />
                    View pitch
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Export</DropdownMenuLabel>
                <DropdownMenuItem onClick={(e) => e.stopPropagation()}>Download PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => e.stopPropagation()}>Share link</DropdownMenuItem>
                {offer.status === OfferStatus.ACCEPTED && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={(e) => e.stopPropagation()} className="text-brand-deep-pitch-600 hover:bg-brand-deep-pitch-50">
                      <Handshake className="h-4 w-4" />
                      Close round
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export { OfferStatus, UserRole };
