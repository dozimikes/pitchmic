'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users,
  Award,
  ChevronRight,
  ChevronDown,
  Sparkles,
  ArrowRight,
  Sliders,
  Settings,
  HelpCircle,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import type { AcceleratorProgram } from '@/lib/acceleratorApi';

interface CohortSetupFlowProps {
  program?: AcceleratorProgram | null;
  milestoneTemplatesCount?: number;
  onOpenDateModal?: () => void;
  onOpenCapacityModal?: () => void;
}

export function CohortSetupFlow({
  program,
  milestoneTemplatesCount = 0,
  onOpenDateModal,
  onOpenCapacityModal,
}: CohortSetupFlowProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  // Step 1: Program dates (Application deadline & cohort start date)
  const hasDates = Boolean(program?.cohort_start_date && program?.application_deadline);
  
  // Step 2: Cohort Target Capacity & Capital Terms
  const hasCapacity = Boolean((program?.target_cohort_size ?? 0) > 0);

  // Step 3: Milestone templates & curriculum deliverables
  const hasMilestones = milestoneTemplatesCount > 0;

  // Step 4: Reviewers & Evaluation Criteria
  const hasCriteria = Boolean(program?.workflow_style || program?.sector_focus);

  const steps = [
    {
      num: '01',
      title: 'Cohort Schedule & Critical Dates',
      desc: 'Define admissions application deadline, cohort kickoff date, and runtime duration.',
      isComplete: hasDates,
      statusLabel: hasDates ? 'Configured' : 'Needs Dates',
      href: '/accelerator/settings',
      actionLabel: 'Set Dates',
      onClick: onOpenDateModal,
    },
    {
      num: '02',
      title: 'Target Cohort Size & Terms',
      desc: 'Set maximum cohort admission capacity, capital stipend, and equity mandate.',
      isComplete: hasCapacity,
      statusLabel: hasCapacity ? 'Configured' : 'Needs Capacity',
      href: '/accelerator/settings',
      actionLabel: 'Set Capacity',
      onClick: onOpenCapacityModal,
    },
    {
      num: '03',
      title: 'Weekly Milestone Curriculum',
      desc: 'Establish milestone deliverables (Product, Revenue, Discovery, Pitch) for weekly reviews.',
      isComplete: hasMilestones,
      statusLabel: hasMilestones ? `${milestoneTemplatesCount} Active` : 'Needs Curriculum',
      href: '/accelerator/cohorts',
      actionLabel: 'Define Milestones',
    },
    {
      num: '04',
      title: 'Reviewer Rubric & Governance',
      desc: 'Configure scoring dimension weights, consensus thresholds, and admissions committee seats.',
      isComplete: hasCriteria,
      statusLabel: hasCriteria ? 'Calibrated' : 'Needs Rubric',
      href: '/accelerator/settings',
      actionLabel: 'Review Rubric',
    },
  ];

  const completedCount = steps.filter((s) => s.isComplete).length;
  const progressPct = Math.round((completedCount / steps.length) * 100);

  // If 100% complete and collapsed, show sleek mini-banner
  if (completedCount === steps.length && isCollapsed) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between text-xs transition">
        <div className="flex items-center gap-2 text-emerald-700 font-medium">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>Cohort Program Setup Complete (4/4 Steps Configured)</span>
        </div>
        <button
          onClick={() => setIsCollapsed(false)}
          className="text-slate-500 hover:text-slate-900 text-xs underline cursor-pointer"
        >
          View Checklist
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50/70 via-white to-slate-50 p-6 shadow-xs relative overflow-hidden transition-all">
      {/* Subtle glow background accent */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-200/30 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
              <Sliders className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Cohort & Program Setup Guide
            </h3>
            <span
              className={cn(
                'px-2.5 py-0.5 rounded-full text-xs font-semibold border',
                progressPct === 100
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'
              )}
            >
              {completedCount} of {steps.length} Steps Complete ({progressPct}%)
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Configure your cohort dates, capacity, curriculum, and reviewer rubric so admissions pipeline and cohort telemetry can track live.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-xs text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 transition flex items-center gap-1 cursor-pointer bg-white shadow-2xs"
          >
            {isCollapsed ? 'Expand Guide' : 'Collapse'}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isCollapsed ? '' : 'rotate-180')} />
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="mt-5 space-y-4">
          {/* Progress Bar */}
          <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                progressPct === 100 ? 'bg-emerald-500' : 'bg-indigo-600'
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* 4 Steps Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5 pt-1">
            {steps.map((step) => {
              return (
                <div
                  key={step.num}
                  className={cn(
                    'flex flex-col justify-between p-4 rounded-xl border transition-all duration-200 shadow-2xs',
                    step.isComplete
                      ? 'border-slate-200 bg-white'
                      : 'border-indigo-200 bg-white hover:border-indigo-300 hover:shadow-xs'
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-mono font-bold text-slate-400">
                        {step.num}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border',
                          step.isComplete
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        )}
                      >
                        {step.isComplete ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" />
                            {step.statusLabel}
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="h-3 w-3" />
                            {step.statusLabel}
                          </>
                        )}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-slate-900 mb-1 leading-snug">
                      {step.title}
                    </h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
                      {step.desc}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 font-medium">
                      {step.isComplete ? 'Configured' : 'Action required'}
                    </span>
                    {step.onClick ? (
                      <button
                        onClick={step.onClick}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5 cursor-pointer"
                      >
                        {step.actionLabel} <ChevronRight className="h-3 w-3" />
                      </button>
                    ) : (
                      <Link
                        href={step.href}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5"
                      >
                        {step.actionLabel} <ChevronRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
