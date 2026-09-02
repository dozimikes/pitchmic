'use client';

import * as React from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  type InfiniteData,
} from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import type { Pitch, PitchLike, PaginatedResponse } from '@/lib/types';

const NEWSFEED_QUERY_KEY = ['newsfeed', 'pitches'] as const;

interface UseNewsfeedOptions {
  search?: string | undefined;
  industry?: string | undefined;
  stage?: string | undefined;
  sort?: 'newest' | 'popular' | 'trending' | 'featured';
  pageSize?: number;
  enabled?: boolean;
}

export interface UseNewsfeedReturn {
  query: UseInfiniteQueryResult<InfiniteData<PaginatedResponse<Pitch>>, Error>;
  pitches: Pitch[];
  isEmpty: boolean;
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  canLoadMore: boolean;
  loadMore: () => void;
  likeMutation: UseMutationResult<PitchLike, Error, string, unknown>;
  prefetchNextPage: () => Promise<void>;
}

export function useNewsfeed(options: UseNewsfeedOptions = {}): UseNewsfeedReturn {
  const {
    search,
    industry,
    stage,
    sort = 'newest',
    pageSize = 12,
    enabled = true,
  } = options;

  const queryClient = useQueryClient();

  const queryKey = React.useMemo(
    () => [...NEWSFEED_QUERY_KEY, { search, industry, stage, sort, pageSize }] as const,
    [search, industry, stage, sort, pageSize]
  );

  const query = useInfiniteQuery<PaginatedResponse<Pitch>, Error>({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (typeof pageParam === 'string' && pageParam) {
        const cursorUrl = new URL(pageParam, window.location.origin);
        cursorUrl.searchParams.forEach((value, key) => {
          params.set(key, value);
        });
      } else {
        params.set('page_size', String(pageSize));
        if (search) params.set('search', search);
        if (industry) params.set('industry', industry);
        if (stage) params.set('stage', stage);
        if (sort) params.set('sort', sort);
      }
      const queryString = params.toString();
      const endpoint = `/pitches/${queryString ? `?${queryString}` : ''}`;
      return apiGet<PaginatedResponse<Pitch>>(endpoint);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    getPreviousPageParam: (firstPage) => firstPage.previous ?? undefined,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    enabled,
  });

  const pitches = React.useMemo(
    () => query.data?.pages.flatMap((p) => p.results) ?? [],
    [query.data]
  );

  const isEmpty = !query.isLoading && !query.isFetchingNextPage && pitches.length === 0;
  const isLoadingInitial = query.isLoading;
  const isLoadingMore = query.isFetchingNextPage;
  const canLoadMore = !!query.hasNextPage && !query.isFetchingNextPage;

  const loadMore = React.useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [query]);

  const prefetchNextPage = React.useCallback(async () => {
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    const nextPageParam = query.data?.pageParams[query.data.pageParams.length - 1] as string | null ?? null;
    await queryClient.prefetchInfiniteQuery({
      queryKey,
      initialPageParam: nextPageParam,
      queryFn: async ({ pageParam }) => {
        const params = new URLSearchParams();
        if (typeof pageParam === 'string' && pageParam) {
          const cursorUrl = new URL(pageParam, window.location.origin);
          cursorUrl.searchParams.forEach((value, key) => params.set(key, value));
        }
        return apiGet<PaginatedResponse<Pitch>>(`/pitches/?${params.toString()}`);
      },
    });
  }, [query.hasNextPage, query.isFetchingNextPage, query.data, queryClient, queryKey]);

  const likeMutation = useMutation<PitchLike, Error, string, unknown>({
    mutationFn: async (pitchId: string) => {
      return apiPost<PitchLike>(`/pitches/${pitchId}/like/`, {});
    },
    onMutate: async (pitchId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<
        InfiniteData<PaginatedResponse<Pitch>>
      >(queryKey);

      if (previous) {
        const optimistic = {
          ...previous,
          pages: previous.pages.map((page) => ({
            ...page,
            results: page.results.map((pitch) =>
              pitch.id === pitchId
                ? {
                    ...pitch,
                    like_count: (pitch.like_count ?? 0) + 1,
                  }
                : pitch
            ),
          })),
        };
        queryClient.setQueryData(queryKey, optimistic);
      }

      return { previous };
    },
    onError: (_err, pitchId, context) => {
      if ((context as { previous?: InfiniteData<PaginatedResponse<Pitch>> })?.previous) {
        queryClient.setQueryData(
          queryKey,
          (context as { previous: InfiniteData<PaginatedResponse<Pitch>> }).previous
        );
      }
      void pitchId;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    query,
    pitches,
    isEmpty,
    isLoadingInitial,
    isLoadingMore,
    canLoadMore,
    loadMore,
    likeMutation,
    prefetchNextPage,
  };
}

export interface UsePitchLikeProps {
  pitchId: string;
}

export function usePitchLike({ pitchId }: UsePitchLikeProps) {
  const queryClient = useQueryClient();

  const unlike = useMutation({
    mutationFn: async (id: string) => {
      return apiDelete<void>(`/pitches/${id}/like/`);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: NEWSFEED_QUERY_KEY });
      const previous = queryClient.getQueryData<
        InfiniteData<PaginatedResponse<Pitch>>
      >(NEWSFEED_QUERY_KEY);
      if (previous) {
        queryClient.setQueryData(NEWSFEED_QUERY_KEY, {
          ...previous,
          pages: previous.pages.map((page) => ({
            ...page,
            results: page.results.map((pitch) =>
              pitch.id === id
                ? {
                    ...pitch,
                    like_count: Math.max(0, (pitch.like_count ?? 0) - 1),
                  }
                : pitch
            ),
          })),
        });
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      const ctx = context as { previous?: InfiniteData<PaginatedResponse<Pitch>> } | undefined;
      if (ctx?.previous) {
        queryClient.setQueryData(NEWSFEED_QUERY_KEY, ctx.previous);
      }
    },
  });

  void pitchId;
  return { unlike };
}
