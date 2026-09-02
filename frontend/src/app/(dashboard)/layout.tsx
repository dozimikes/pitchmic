'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mic } from 'lucide-react';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { initialized, isAuthenticated } = useAuth();

  React.useEffect(() => {
    if (initialized && !isAuthenticated) {
      router.replace('/sign-in');
    }
  }, [initialized, isAuthenticated, router]);

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-orange-50 via-white to-brand-deep-pitch-50">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-2xl bg-brand-orange-500/20" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-orange-500 to-brand-deep-pitch-600 shadow-lg shadow-brand-orange-500/30">
              <Mic className="h-8 w-8 text-white" />
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading PitchMic...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <DashboardShell>
      <Suspense
        fallback={
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="h-80 animate-pulse bg-slate-100 border-slate-200">
                <div className="aspect-[16/9] w-full bg-slate-200" />
                <div className="space-y-3 p-5">
                  <div className="h-4 w-3/4 rounded bg-slate-200" />
                  <div className="h-3 w-full rounded bg-slate-200" />
                  <div className="h-3 w-5/6 rounded bg-slate-200" />
                </div>
              </Card>
            ))}
          </div>
        }
      >
        {children}
      </Suspense>
    </DashboardShell>
  );
}
