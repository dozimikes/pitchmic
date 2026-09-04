'use client';

/**
 * src/providers/QueryProvider.tsx
 *
 * Standalone React Query provider so it can be mounted independently of
 * the full app/providers.tsx stack (useful in Storybook, tests, etc.).
 * The configuration here mirrors app/providers.tsx intentionally.
 */
import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1_000,          // 1 minute
        gcTime: 5 * 60 * 1_000,         // 5 minutes
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // No retry on 4xx client errors
          if (
            error instanceof Error &&
            'status' in error &&
            typeof (error as { status?: number }).status === 'number' &&
            (error as { status: number }).status < 500
          ) {
            return false;
          }
          // Exponential backoff up to 3 retries (capped at 30 s) for 5xx
          if (failureCount >= 3) return false;
          return true;
        },
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 30_000),
      },
    },
  });
}

// Module-level client - shared across all uses in a single Node.js process
// (client component renders create a new one per browser navigation via the
// singleton pattern below)
let browserClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always create a fresh client so data isn't shared between requests
    return makeQueryClient();
  }
  // Browser: reuse the same client across navigations
  if (!browserClient) browserClient = makeQueryClient();
  return browserClient;
}

export interface QueryProviderProps {
  children: React.ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [client] = React.useState(() => getQueryClient());
  return (
    <QueryClientProvider client={client}>
      {children}
    </QueryClientProvider>
  );
}
