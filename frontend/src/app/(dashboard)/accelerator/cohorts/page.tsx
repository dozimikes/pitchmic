'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users2, Sparkles, Building2 } from 'lucide-react';
import { acceleratorApi } from '@/lib/acceleratorApi';
import { CohortTracker } from '@/components/accelerator/CohortTracker';
import { useActiveProgram } from '../ProgramContext';

export default function CohortsPage() {
  const { activeProgram } = useActiveProgram();
  const { data: cohortData, isLoading } = useQuery({
    queryKey: ['cohort', activeProgram?.id],
    queryFn: () => acceleratorApi.getCohort(activeProgram!.id),
    enabled: !!activeProgram?.id,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Users2 className="h-6 w-6 text-emerald-600" />
              Cohort Management & Continuous Assessment
            </h1>
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              Active Cohort
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Track enrolled startups, verify milestone progression against KPIs, and monitor readiness score drift.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      ) : (
        <CohortTracker cohortData={cohortData} />
      )}
    </div>
  );
}
