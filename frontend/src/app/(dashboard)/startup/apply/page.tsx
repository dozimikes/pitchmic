'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  FileText,
  GraduationCap,
  MapPin,
  Rocket,
} from 'lucide-react';
import {
  acceleratorApi,
  type AcceleratorProgram,
  type ApplicationItem,
} from '@/lib/acceleratorApi';
import { DynamicApplicationWizard } from '@/components/accelerator/DynamicApplicationWizard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/hooks/useAuth';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft — not submitted yet',
  SUBMITTED: 'Submitted',
  SCREENING: 'In screening',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW_INVITED: 'Interview invited',
  INTERVIEW_COMPLETE: 'Interview complete',
  COMMITTEE_REVIEW: 'Committee review',
  EVIDENCE_REQUESTED: 'Evidence requested — action needed',
  WAITLISTED: 'Waitlisted',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  DEFERRED: 'Deferred',
};

function statusBadgeClass(status: string): string {
  if (status === 'ACCEPTED') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'REJECTED' || status === 'WITHDRAWN') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (status === 'EVIDENCE_REQUESTED') return 'bg-amber-50 text-amber-800 border-amber-200';
  if (status === 'DRAFT') return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-indigo-50 text-indigo-700 border-indigo-200';
}

function formatMoney(v?: number): string {
  if (!v) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}

export default function FounderApplyPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [wizardProgram, setWizardProgram] = React.useState<AcceleratorProgram | null>(null);

  const programsQuery = useQuery({
    queryKey: ['public-programs'],
    queryFn: () => acceleratorApi.getPrograms(),
  });

  const myApplicationsQuery = useQuery({
    queryKey: ['my-applications'],
    queryFn: () => acceleratorApi.getApplications(),
  });

  const programs = React.useMemo(
    () =>
      (programsQuery.data ?? []).filter(
        (p) => p.is_active && (p.program_status ?? 'published') === 'published'
      ),
    [programsQuery.data]
  );
  const myApplications: ApplicationItem[] = myApplicationsQuery.data ?? [];
  const applicationFor = (programId: number) =>
    myApplications.find((a) => a.program === programId);

  const firstName = user?.first_name || user?.email?.split('@')[0] || 'there';

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Accelerator programs
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-600">
          Hi {firstName} — browse open programs and apply. Your answers are
          pre-filled from your founder profile, and when you submit, the
          program team reviews your application (with your evidence) in their
          own workspace. Screening recommendations assist human reviewers; no
          admission decision is made automatically.
        </p>
      </header>

      {/* ── Open programs ─────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Open for applications
        </h2>

        {programsQuery.isLoading && (
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
            ))}
          </div>
        )}

        {programsQuery.error != null && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            Could not load programs. Refresh to try again.
          </p>
        )}

        {!programsQuery.isLoading && programs.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <Rocket className="mx-auto h-6 w-6 text-slate-400" />
            <p className="mt-2 text-sm font-medium text-slate-700">No programs are published right now</p>
            <p className="mt-1 text-xs text-slate-500">
              Programs appear here once their team publishes an application cycle.
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {programs.map((p) => {
            const existing = applicationFor(p.id);
            const closed = p.days_until_deadline != null && p.days_until_deadline < 0;
            return (
              <article
                key={p.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-slate-900">{p.name}</h3>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{p.organization_name || 'Accelerator'}</span>
                      </p>
                    </div>
                    {p.days_until_deadline != null && !closed && (
                      <Badge variant="outline" className="shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700">
                        {p.days_until_deadline}d left
                      </Badge>
                    )}
                    {closed && (
                      <Badge variant="outline" className="shrink-0 border-slate-200 bg-slate-50 text-slate-500">
                        Closed
                      </Badge>
                    )}
                  </div>

                  {p.tagline && (
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{p.tagline}</p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
                    {p.sector_focus && (
                      <span className="inline-flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" /> {p.sector_focus.split(',')[0]}
                      </span>
                    )}
                    {p.stage_focus && p.stage_focus !== 'any' && (
                      <span className="inline-flex items-center gap-1">
                        <GraduationCap className="h-3.5 w-3.5" /> {p.stage_focus.replace('_', ' ')}
                      </span>
                    )}
                    {(p.location || p.geography_focus) && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {p.is_remote ? 'Remote' : p.location || p.geography_focus.split(',')[0]}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="h-3.5 w-3.5" /> {p.program_duration_weeks}w
                    </span>
                    {p.funding_amount_usd ? (
                      <span className="font-medium text-slate-700">
                        {formatMoney(p.funding_amount_usd)}
                        {p.equity_offered_pct ? ` · ${p.equity_offered_pct}% equity` : ''}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  {existing ? (
                    <span
                      className={`inline-flex items-center rounded-lg border px-2 py-1 text-[11px] font-semibold ${statusBadgeClass(existing.status)}`}
                    >
                      {STATUS_LABELS[existing.status] ?? existing.status}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">Not applied yet</span>
                  )}
                  <Button
                    size="sm"
                    disabled={closed}
                    onClick={() => setWizardProgram(p)}
                  >
                    {existing ? 'Continue application' : 'Apply'}
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* ── My applications ───────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Your applications
        </h2>
        {myApplicationsQuery.isLoading && (
          <div className="h-20 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
        )}
        {!myApplicationsQuery.isLoading && myApplications.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
            You haven&apos;t applied to any program yet. Applications you start appear here, including drafts.
          </p>
        )}
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {myApplications.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {a.program_name || a.company_name}
                </p>
                <p className="text-xs text-slate-500">
                  {a.company_name} · updated {new Date(a.updated_at).toLocaleDateString()}
                  {a.status === 'EVIDENCE_REQUESTED' && (
                    <span className="ml-1 font-medium text-amber-700">— the program team needs more evidence from you</span>
                  )}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-lg border px-2 py-1 text-[11px] font-semibold ${statusBadgeClass(a.status)}`}
              >
                {STATUS_LABELS[a.status] ?? a.status}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {wizardProgram && (
        <DynamicApplicationWizard
          program={wizardProgram}
          onClose={() => setWizardProgram(null)}
          onSuccess={() => {
            setWizardProgram(null);
            void queryClient.invalidateQueries({ queryKey: ['my-applications'] });
          }}
        />
      )}
    </div>
  );
}
