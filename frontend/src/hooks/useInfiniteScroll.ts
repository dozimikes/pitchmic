'use client';

import * as React from 'react';

export interface UseInfiniteScrollOptions {
  /** Called when the sentinel enters the viewport */
  onLoadMore: () => void;
  /** Whether there is more data to load */
  hasMore: boolean;
  /** Whether a load is currently in flight */
  isLoading: boolean;
  /**
   * Distance from the bottom of the viewport to trigger loading.
   * @default '200px'
   */
  rootMargin?: string;
  /**
   * Fraction of the sentinel that must be visible before triggering.
   * @default 0
   */
  threshold?: number;
}

/**
 * useInfiniteScroll
 *
 * Returns a ref to attach to a sentinel element at the bottom of a list.
 * When the sentinel enters the viewport (and `hasMore` is true and
 * `isLoading` is false), `onLoadMore` is called.
 *
 * @example
 * ```tsx
 * const sentinelRef = useInfiniteScroll({ onLoadMore: loadMore, hasMore, isLoading });
 * return (
 *   <>
 *     {items.map(i => <Item key={i.id} {...i} />)}
 *     <div ref={sentinelRef} aria-hidden="true" />
 *   </>
 * );
 * ```
 */
export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  isLoading,
  rootMargin = '200px 0px',
  threshold = 0,
}: UseInfiniteScrollOptions): React.RefCallback<HTMLElement | null> {
  const observerRef = React.useRef<IntersectionObserver | null>(null);

  // Stable callback ref — avoids re-creating the observer on every render
  const sentinelRef = React.useCallback(
    (node: HTMLElement | null) => {
      // Clean up previous observer
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      if (!node) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          const [entry] = entries;
          if (entry?.isIntersecting && hasMore && !isLoading) {
            onLoadMore();
          }
        },
        { rootMargin, threshold },
      );

      observerRef.current.observe(node);
    },
    // Re-wire observer if any dependency changes
    [onLoadMore, hasMore, isLoading, rootMargin, threshold],
  );

  return sentinelRef;
}
