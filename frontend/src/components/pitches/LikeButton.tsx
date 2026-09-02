'use client';

import * as React from 'react';
import { Heart } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { apiPost, apiDelete } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

export interface LikeButtonProps {
  pitchId: string;
  initialLiked?: boolean;
  initialCount?: number;
  /** Called after a successful like/unlike with the new state */
  onToggle?: (liked: boolean, count: number) => void;
  className?: string;
  showCount?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: { button: 'h-7 gap-1.5 px-2.5 text-xs', icon: 'h-3.5 w-3.5' },
  md: { button: 'h-9 gap-2 px-3 text-sm', icon: 'h-4 w-4' },
  lg: { button: 'h-10 gap-2 px-4 text-sm', icon: 'h-4.5 w-4.5' },
} as const;

export function LikeButton({
  pitchId,
  initialLiked = false,
  initialCount = 0,
  onToggle,
  className,
  showCount = true,
  size = 'md',
}: LikeButtonProps) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [optimisticLiked, setOptimisticLiked] = React.useState(initialLiked);
  const [optimisticCount, setOptimisticCount] = React.useState(initialCount);

  // Sync if parent re-renders with new props (e.g. query refetch)
  React.useEffect(() => { setOptimisticLiked(initialLiked); }, [initialLiked]);
  React.useEffect(() => { setOptimisticCount(initialCount); }, [initialCount]);

  const likeMutation = useMutation({
    mutationFn: async (liked: boolean) => {
      if (liked) {
        return apiPost(`/pitches/${pitchId}/like/`, {});
      } else {
        return apiDelete(`/pitches/${pitchId}/like/`);
      }
    },
    onMutate: async (liked: boolean) => {
      // Optimistic update
      setOptimisticLiked(liked);
      setOptimisticCount((c) => liked ? c + 1 : Math.max(0, c - 1));
      return { previousLiked: optimisticLiked, previousCount: optimisticCount };
    },
    onError: (_err, _liked, ctx) => {
      // Rollback
      if (ctx) {
        setOptimisticLiked(ctx.previousLiked);
        setOptimisticCount(ctx.previousCount);
      }
    },
    onSuccess: (_data, liked) => {
      onToggle?.(liked, optimisticCount);
      void queryClient.invalidateQueries({ queryKey: ['pitches'] });
      void queryClient.invalidateQueries({ queryKey: ['newsfeed'] });
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isAuthenticated || likeMutation.isPending) return;
    void likeMutation.mutateAsync(!optimisticLiked);
  };

  const { button: btnCls, icon: iconCls } = SIZE_CLASSES[size];

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isAuthenticated || likeMutation.isPending}
      aria-label={optimisticLiked ? 'Unlike pitch' : 'Like pitch'}
      aria-pressed={optimisticLiked}
      className={cn(
        'inline-flex items-center justify-center rounded-full border font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange-500 focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        optimisticLiked
          ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'
          : 'border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600',
        btnCls,
        className,
      )}
    >
      <Heart
        className={cn(
          iconCls,
          'transition-all',
          optimisticLiked && 'fill-current',
          likeMutation.isPending && 'animate-pulse',
        )}
      />
      {showCount && (
        <span className="tabular-nums leading-none">{optimisticCount}</span>
      )}
    </button>
  );
}
