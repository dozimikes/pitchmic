'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users,
  Video,
  FileText,
  ChevronRight,
  Sparkles,
  ArrowUpRight,
  Plus,
  Compass,
  Building2,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import type { AcceleratorProgram } from '@/lib/acceleratorApi';

interface MilestoneTemplate {
  id: number;
  week_number: number;
  title: string;
  category: string;
  description?: string;
  is_required?: boolean;
}

interface CohortMember {
  id: number;
  company_name: string;
  latest_readiness_score: number;
  milestones_complete: number;
  milestones_total: number;
  demo_day_slot?: number | null;
}

interface CohortData {
  program_id: number;
  program_name: string;
  target_cohort_size: number;
  enrolled_count: number;
  members: CohortMember[];
  milestone_templates: MilestoneTemplate[];
}

interface CohortActivityFeedProps {
  program?: AcceleratorProgram | null;
  cohortData?: CohortData | null;
  isLoading?: boolean;
  onOpenCreateEvent?: () => void;
}

export function CohortActivityFeed({
  program,
  cohortData,
  isLoading,
  onOpenCreateEvent,
}: CohortActivityFeedProps) {
  const [activeTab, setActiveTab] = React.useState<'events' | 'milestones' | 'startups'>('events');

  const members = React.useMemo(() => cohortData?.members || [], [cohortData?.members]);
  const templates = React.useMemo(() => cohortData?.milestone_templates || [], [cohortData?.milestone_templates]);
  const enrolledCount = cohortData?.enrolled_count || 0;

  // Determine healthy, watch, risk breakdown
  const healthyMembers = members.filter((m) => (m.latest_readiness_score ?? 0) >= 70);
  const watchMembers = members.filter(
    (m) => (m.latest_readiness_score ?? 0) >= 50 && (m.latest_readiness_score ?? 0) < 70
  );
  const riskMembers = members.filter((m) => (m.latest_readiness_score ?? 0) < 50);

  // Cohort program schedule events (derived from program dates or templates)
  const hasProgramDates = Boolean(program?.cohort_start_date || program?.application_deadline);
  
  // Program milestone events
  const upcomingEvents = React.useMemo(() => {
    if (!templates.length && !hasProgramDates) {
      return [];
    }

    const events = [];
    if (program?.application_deadline) {
      events.push({
        id: 'evt-deadline',
        title: 'Admissions Application Deadline',
        date: program.application_deadline,
        type: 'deadline' as const,
        time: '11:59 PM UTC',
        host: 'Admissions Committee',
        badge: 'Critical Date',
        badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
      });
    }

    if (program?.cohort_start_date) {
      events.push({
        id: 'evt-start',
        title: 'Cohort Kickoff & Orientation Day',
        date: program.cohort_start_date,
        type: 'kickoff' as const,
        time: '10:00 AM UTC',
        host: program.name,
        badge: 'Program Launch',
        badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      });
    }

    // Include milestone checkpoint events if templates exist
    templates.slice(0, 3).forEach((t) => {
      events.push({
        id: `evt-ms-${t.id}`,
        title: `Week ${t.week_number} Deliverable: ${t.title}`,
        date: `Week ${t.week_number}`,
        type: 'deliverable' as const,
        time: 'End of Week Review',
        host: `${t.category.toUpperCase()} Checkpoint`,
        badge: t.is_required ? 'Required Milestone' : 'Elective',
        badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
      });
    });

    return events;
  }, [program, templates, hasProgramDates]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col h-full">
      {/* Header with Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Current Cohort Activities & Pulse
            </h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Runtime Live
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Operational schedule, weekly deliverables, and startup health tracking.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200 shrink-0">
          <button
            onClick={() => setActiveTab('events')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer',
              activeTab === 'events'
                ? 'bg-white text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            Events ({upcomingEvents.length})
          </button>
          <button
            onClick={() => setActiveTab('milestones')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer',
              activeTab === 'milestones'
                ? 'bg-white text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            Milestones ({templates.length})
          </button>
          <button
            onClick={() => setActiveTab('startups')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer',
              activeTab === 'startups'
                ? 'bg-white text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            Startups ({enrolledCount})
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 pt-4">
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
            <p className="text-xs text-slate-400">Syncing cohort telemetry...</p>
          </div>
        ) : activeTab === 'events' ? (
          <div>
            {upcomingEvents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center flex flex-col items-center justify-center my-2">
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                  <Calendar className="h-5 w-5" />
                </div>
                <h4 className="text-sm font-semibold text-slate-900">No Program Schedule Defined</h4>
                <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
                  Set cohort start dates, application deadlines, and weekly workshops to unlock live operational tracking.
                </p>
                <div className="flex items-center gap-2">
                  <Link href="/accelerator/settings">
                    <Button size="sm" className="h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white">
                      Configure Program Dates
                    </Button>
                  </Link>
                  {onOpenCreateEvent && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onOpenCreateEvent}
                      className="h-8 text-xs border-slate-300 text-slate-700 hover:bg-slate-50"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Event
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-100/70 hover:border-slate-300 transition"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                        {evt.type === 'deadline' ? (
                          <Clock className="h-4 w-4 text-rose-600" />
                        ) : evt.type === 'kickoff' ? (
                          <Sparkles className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Target className="h-4 w-4 text-indigo-600" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">{evt.title}</span>
                          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold border', evt.badgeColor)}>
                            {evt.badge}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-slate-400" />
                            {evt.date}
                          </span>
                          <span>•</span>
                          <span>{evt.time}</span>
                          <span>•</span>
                          <span className="text-slate-700 font-medium">{evt.host}</span>
                        </div>
                      </div>
                    </div>

                    <Link
                      href="/accelerator/cohorts"
                      className="self-end sm:self-center text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 shrink-0"
                    >
                      Details <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'milestones' ? (
          <div>
            {templates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center flex flex-col items-center justify-center my-2">
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                  <FileText className="h-5 w-5" />
                </div>
                <h4 className="text-sm font-semibold text-slate-900">No Milestone Curriculum Defined</h4>
                <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
                  Define weekly milestone templates (Product, Revenue, Customer Discovery, Fundraising) for enrolled founders.
                </p>
                <Link href="/accelerator/cohorts">
                  <Button size="sm" className="h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white">
                    Setup Milestone Templates
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-100/70 hover:border-slate-300 transition"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-mono text-xs font-bold shrink-0 border border-slate-200">
                        W{tpl.week_number}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">{tpl.title}</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {tpl.category}
                          </span>
                        </div>
                        {tpl.description && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-1">{tpl.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <span className="text-[11px] text-slate-400">
                        {enrolledCount > 0 ? `${enrolledCount} enrolled startups tracked` : 'Awaiting enrollment'}
                      </span>
                      <Link
                        href="/accelerator/cohorts"
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                      >
                        Ledger <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            {members.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center flex flex-col items-center justify-center my-2">
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                  <Users className="h-5 w-5" />
                </div>
                <h4 className="text-sm font-semibold text-slate-900">No Startups Enrolled in Active Cohort</h4>
                <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
                  Candidates must be admitted through the Decision Room to appear in cohort runtime telemetry.
                </p>
                <div className="flex items-center gap-2">
                  <Link href="/accelerator/decision-room">
                    <Button size="sm" className="h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white">
                      Open Decision Room
                    </Button>
                  </Link>
                  <Link href="/accelerator/applications">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs border-slate-300 text-slate-700 hover:bg-slate-50"
                    >
                      Screen Pipeline
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Micro summary bar */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-center">
                    <span className="text-xs font-semibold text-emerald-700">On Track</span>
                    <p className="text-base font-bold text-emerald-800">{healthyMembers.length}</p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-center">
                    <span className="text-xs font-semibold text-amber-700">Needs Attention</span>
                    <p className="text-base font-bold text-amber-800">{watchMembers.length}</p>
                  </div>
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-center">
                    <span className="text-xs font-semibold text-rose-700">At Risk</span>
                    <p className="text-base font-bold text-rose-800">{riskMembers.length}</p>
                  </div>
                </div>

                {/* Member row list */}
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {members.map((member) => {
                    const score = Math.round(member.latest_readiness_score ?? 0);
                    const isHealthy = score >= 70;
                    const isWatch = score >= 50 && score < 70;

                    return (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-100/70 transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-lg bg-slate-200 flex items-center justify-center font-bold text-xs text-slate-700">
                            {member.company_name.charAt(0)}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-900">{member.company_name}</span>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500">
                              <span>Milestones: {member.milestones_complete}/{member.milestones_total}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              'text-xs font-bold px-2 py-0.5 rounded-full border',
                              isHealthy
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : isWatch
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            )}
                          >
                            Score: {score}
                          </span>
                          <Link
                            href={`/accelerator/cohorts`}
                            className="text-slate-400 hover:text-slate-600 transition"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer link to Cohorts hub */}
      <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span>Active Program: <strong className="text-slate-900">{program?.name || 'Standard Program'}</strong></span>
        <Link
          href="/accelerator/cohorts"
          className="text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1"
        >
          Manage Cohort Runtime <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
