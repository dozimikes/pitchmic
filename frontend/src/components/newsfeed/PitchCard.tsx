'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Heart,
  MessageSquare,
  TrendingUp,
  Building2,
  DollarSign,
  Percent,
  Eye,
  ArrowRight,
  Share2,
  Bookmark,
  Play,
} from 'lucide-react';
import { cn, formatCurrency, formatRelative, truncate } from '@/lib/utils';
import type { Pitch } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { apiPost } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export interface PitchCardProps {
  pitch: Pitch;
  index?: number;
  onLike?: (pitchId: string) => void;
  onOffer?: (pitchId: string) => void;
}

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1],
      delay: i * 0.04,
    },
  }),
};

export function PitchCard({ pitch, index = 0, onLike, onOffer }: PitchCardProps) {
  const { isInvestor, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [liked, setLiked] = React.useState(false);
  const [optimisticLikes, setOptimisticLikes] = React.useState<number>(pitch.like_count ?? 0);

  React.useEffect(() => {
    setOptimisticLikes(pitch.like_count ?? 0);
  }, [pitch.like_count]);

  const likeMutation = useMutation({
    mutationFn: async () => {
      return apiPost(`/pitches/${pitch.id}/like/`, {});
    },
    onMutate: () => {
      setLiked(true);
      setOptimisticLikes((n) => n + 1);
      onLike?.(pitch.id);
    },
    onError: () => {
      setLiked(false);
      setOptimisticLikes((n) => Math.max(0, n - 1));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['newsfeed', 'pitches'] });
    },
  });

  const handleLike = () => {
    if (!isAuthenticated) return;
    if (liked) {
      setLiked(false);
      setOptimisticLikes((n) => Math.max(0, n - 1));
    } else {
      void likeMutation.mutateAsync();
    }
  };

  const startupName = pitch.startup_name ?? 'Startup';
  const startupLogo: string | null = null; // logo not returned by PitchListSerializer
  const coverImage = pitch.cover_image_url ?? null;

  return (
    <motion.article
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="show"
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      className="h-full"
    >
      <Card className="group relative flex h-full flex-col overflow-hidden border-slate-200 bg-white transition-all duration-300 hover:border-brand-orange-300 hover:shadow-xl hover:shadow-brand-orange-500/10">
        <Link
          href={`/pitches/${pitch.id}`}
          className="relative block aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-brand-orange-50"
        >
          {coverImage ? (
            <>
              <img
                src={coverImage}
                alt={pitch.title}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-slate-900/10 to-transparent opacity-80" />
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <div className="grid h-full w-full grid-cols-4 grid-rows-3">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'opacity-40',
                      (i + index) % 5 === 0 && 'bg-brand-orange-300',
                      (i + index) % 5 === 1 && 'bg-brand-deep-pitch-300',
                      (i + index) % 5 === 2 && 'bg-amber-300',
                      (i + index) % 5 === 3 && 'bg-indigo-300',
                      (i + index) % 5 === 4 && 'bg-emerald-300'
                    )}
                  />
                ))}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-white/80 via-transparent to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/90 shadow-lg backdrop-blur">
                  <Building2 className="h-10 w-10 text-brand-orange-500" />
                </div>
              </div>
            </div>
          )}

          <div className="absolute left-3 top-3 flex gap-2">
            {pitch.is_featured && (
              <Badge variant="default" className="shadow-md shadow-brand-orange-500/20">
                <TrendingUp className="mr-1 h-3 w-3" />
                Featured
              </Badge>
            )}
            {pitch.tags?.[0] && (
              <Badge variant="outline" className="border-white/30 bg-white/80 text-slate-800 backdrop-blur">
                {pitch.tags[0]}
              </Badge>
            )}
          </div>

          <div className="absolute right-3 top-3 flex gap-1.5">
            <button
              type="button"
              onClick={(e) => e.preventDefault()}
              aria-label="Bookmark"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-slate-600 backdrop-blur transition-colors hover:bg-white hover:text-brand-orange-600"
            >
              <Bookmark className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(e) => e.preventDefault()}
              aria-label="Share"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-slate-600 backdrop-blur transition-colors hover:bg-white hover:text-brand-deep-pitch-600"
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>

          {pitch.video_url && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-xl backdrop-blur transition-transform group-hover:scale-110">
                <Play className="ml-1 h-6 w-6 text-brand-orange-500" />
              </div>
            </div>
          )}

          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
            <div className="flex items-center gap-2 rounded-full bg-white/85 px-2 py-1 text-xs text-slate-700 backdrop-blur">
              <Eye className="h-3.5 w-3.5 text-slate-500" />
              <span className="font-medium">{pitch.offers_count ?? 0}</span>
            </div>
            {pitch.created_at && (
              <div className="rounded-full bg-black/40 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
                {formatRelative(pitch.created_at)}
              </div>
            )}
          </div>
        </Link>

        <div className="flex flex-1 flex-col p-5">
          <Link href={`/pitches/${pitch.id}`} className="block">
            <h3 className="line-clamp-2 text-lg font-semibold leading-snug tracking-tight text-slate-900 transition-colors group-hover:text-brand-orange-600">
              {pitch.title}
            </h3>
          </Link>

          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600">
            {truncate(pitch.description || 'No description provided.', 160)}
          </p>

          {(pitch.asking_amount || pitch.equity_offered) && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {pitch.asking_amount && (
                <div className="rounded-lg bg-brand-orange-50/60 border border-brand-orange-100 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand-orange-600">
                    <DollarSign className="h-3 w-3" />
                    Ask
                  </div>
                  <div className="mt-1 text-sm font-bold text-slate-900">
                    {formatCurrency(Number(pitch.asking_amount))}
                  </div>
                </div>
              )}
              {pitch.equity_offered !== null && (
                <div className="rounded-lg bg-brand-deep-pitch-50/60 border border-brand-deep-pitch-100 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand-deep-pitch-600">
                    <Percent className="h-3 w-3" />
                    Equity
                  </div>
                  <div className="mt-1 text-sm font-bold text-slate-900">
                    {pitch.equity_offered}%
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-5 flex items-center gap-3 pb-1">
            <Link
              href={pitch.startup_id ? `/companies/${pitch.startup_id}` : '#'}
              className="flex shrink-0 items-center gap-2.5"
            >
              <Avatar
                src={startupLogo}
                alt={startupName}
                fallback={startupName}
                size="sm"
                className="border-2 border-white shadow-sm ring-1 ring-slate-200"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {startupName}
                </p>
              </div>
            </Link>
          </div>

          <div className="mt-auto pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleLike}
                  aria-pressed={liked}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                    liked
                      ? 'bg-red-50 text-red-600 ring-1 ring-red-200'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-red-500'
                  )}
                >
                  <Heart
                    className={cn(
                      'h-4 w-4 transition-all',
                      liked && 'fill-red-500 text-red-500 scale-110'
                    )}
                  />
                  <span className="tabular-nums">{optimisticLikes}</span>
                </button>
                <Link
                  href={`/pitches/${pitch.id}#offers`}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-brand-deep-pitch-600"
                >
                  <MessageSquare className="h-4 w-4" />
                  <span className="tabular-nums">{pitch.offers_count ?? 0}</span>
                </Link>
              </div>

              {isInvestor ? (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onOffer?.(pitch.id)}
                  className="h-8 rounded-full px-4 text-xs shadow-md shadow-brand-orange-500/20"
                >
                  Make offer
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              ) : (
                <Link href={`/pitches/${pitch.id}`}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full px-4 text-xs border-slate-200"
                  >
                    View
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </Card>
    </motion.article>
  );
}
