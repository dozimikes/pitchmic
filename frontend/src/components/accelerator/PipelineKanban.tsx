'use client';

import * as React from 'react';
import {
  Layers,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Filter,
  XCircle,
  MinusCircle,
  Clock,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { ApplicationItem } from '@/lib/acceleratorApi';

interface PipelineKanbanProps {
  applications: ApplicationItem[];
  selectedAppId: number | null;
  workflowStyle?: 'yc_style' | 'techstars_style' | string | null;
  onSelectApp: (id: number) => void;
  onTransitionStatus: (id: number, newStatus: string) => void;
}

interface ColumnDef {
  id: string;
  title: string;
  group: 'forward' | 'disposition';
  next: string | null;
  nextLabel: string;
  prev: string | null;
  prevLabel: string;
  colorClass?: string;
  includes?: string[];
}

// ── Techstars (full 6-stage) column set — progressive gating with disposition columns
const TS_COLUMNS: ColumnDef[] = [
  { id: 'SUBMITTED', title: 'Inbound Submitted', group: 'forward', next: 'SCREENING', nextLabel: 'Screen', prev: null, prevLabel: '' },
  { id: 'SCREENING', title: 'Screening Queue', group: 'forward', next: 'SHORTLISTED', nextLabel: 'Shortlist', prev: 'SUBMITTED', prevLabel: 'Return' },
  { id: 'SHORTLISTED', title: 'Shortlisted', group: 'forward', next: 'INTERVIEW_INVITED', nextLabel: 'Interview', prev: 'SCREENING', prevLabel: 'Demote' },
  { id: 'INTERVIEW_INVITED', title: 'Dual Interviews', group: 'forward', next: 'COMMITTEE_REVIEW', nextLabel: 'Send to IC', prev: 'SHORTLISTED', prevLabel: 'Demote' },
  { id: 'COMMITTEE_REVIEW', title: 'Committee IC', group: 'forward', next: 'ACCEPTED', nextLabel: 'Accept', prev: 'INTERVIEW_INVITED', prevLabel: 'Return' },
  { id: 'ACCEPTED', title: 'Batch Enrolled', group: 'forward', next: null, nextLabel: '', prev: 'COMMITTEE_REVIEW', prevLabel: 'Revoke' },
  // Major #6 — disposition columns so reviewers can see the outcomes of every
  // application, not just the happy-path forwards.
  { id: 'DEFERRED_WAITLIST', title: 'Deferred / Waitlist', group: 'disposition', next: 'SHORTLISTED', nextLabel: 'Revive', prev: null, prevLabel: '', colorClass: 'bg-amber-500/5 border-amber-500/20' },
  { id: 'REJECTED', title: 'Rejected', group: 'disposition', next: 'SCREENING', nextLabel: 'Re-review', prev: null, prevLabel: '', colorClass: 'bg-rose-500/5 border-rose-500/20' },
  { id: 'WITHDRAWN', title: 'Founder Withdrawn', group: 'disposition', next: 'SUBMITTED', nextLabel: 'Re-open', prev: null, prevLabel: '', colorClass: 'bg-neutral-700/20 border-neutral-600' },
];

// ── YC-style (Rapid) column set — collapses shortlist + interview into a single
//    "Rapid Triage" stage because YC-style batches go from submission to IC in ~14 days.
const YC_COLUMNS: ColumnDef[] = [
  { id: 'SUBMITTED', title: 'Inbound Submitted', group: 'forward', next: 'RAPID_TRIAGE', nextLabel: 'Rapid Screen', prev: null, prevLabel: '' },
  { id: 'RAPID_TRIAGE', title: 'Rapid Triage', group: 'forward', next: 'COMMITTEE_REVIEW', nextLabel: 'Send to IC', prev: 'SUBMITTED', prevLabel: 'Return', includes: ['SCREENING', 'SHORTLISTED', 'INTERVIEW_INVITED', 'INTERVIEW_COMPLETE'] },
  { id: 'COMMITTEE_REVIEW', title: 'Committee IC', group: 'forward', next: 'ACCEPTED', nextLabel: 'Accept', prev: 'RAPID_TRIAGE', prevLabel: 'Demote' },
  { id: 'ACCEPTED', title: 'Batch Enrolled', group: 'forward', next: null, nextLabel: '', prev: 'COMMITTEE_REVIEW', prevLabel: 'Revoke' },
  { id: 'DEFERRED_WAITLIST', title: 'Waitlist', group: 'disposition', next: 'RAPID_TRIAGE', nextLabel: 'Revive', prev: null, prevLabel: '', colorClass: 'bg-amber-500/5 border-amber-500/20' },
  { id: 'REJECTED', title: 'Rejected', group: 'disposition', next: 'RAPID_TRIAGE', nextLabel: 'Re-review', prev: null, prevLabel: '', colorClass: 'bg-rose-500/5 border-rose-500/20' },
  { id: 'WITHDRAWN', title: 'Founder Withdrawn', group: 'disposition', next: 'SUBMITTED', nextLabel: 'Re-open', prev: null, prevLabel: '', colorClass: 'bg-neutral-700/20 border-neutral-600' },
];

function dispositionIcon(status: string) {
  switch (status) {
    case 'REJECTED':
      return <XCircle className="w-3.5 h-3.5 mr-1 text-rose-400 shrink-0" />;
    case 'WITHDRAWN':
      return <MinusCircle className="w-3.5 h-3.5 mr-1 text-neutral-400 shrink-0" />;
    case 'DEFERRED_WAITLIST':
      return <Clock className="w-3.5 h-3.5 mr-1 text-amber-400 shrink-0" />;
    default:
      return null;
  }
}

export function PipelineKanban({
  applications,
  selectedAppId,
  workflowStyle,
  onSelectApp,
  onTransitionStatus,
}: PipelineKanbanProps) {
  const [tierFilter, setTierFilter] = React.useState<string>('ALL');

  // Minor #18 — workflow_style now actually drives the kanban column density.
  const columns = workflowStyle === 'yc_style' ? YC_COLUMNS : TS_COLUMNS;

  const forwardColumns = columns.filter((c) => c.group === 'forward');
  const dispositionColumns = columns.filter((c) => c.group === 'disposition');

  // Map a given app status string to the correct column id (needed for
  // YC-style collapse where multiple statuses share one visual column).
  const resolveColumnId = (appStatus: string): string => {
    const exact = columns.find((c) => c.id === appStatus);
    if (exact) return exact.id;
    const viaIncludes = columns.find((c) => c.includes?.includes(appStatus));
    return viaIncludes?.id ?? appStatus;
  };

  const appsByColumnId = React.useMemo(() => {
    const map: Record<string, ApplicationItem[]> = {};
    columns.forEach((c) => (map[c.id] = []));
    applications.forEach((app) => {
      const colId = resolveColumnId(app.status);
      if (!map[colId]) map[colId] = [];
      map[colId].push(app);
    });
    return map;
  }, [applications, columns]);

  const renderColumn = (col: ColumnDef) => {
    const colApps = (appsByColumnId[col.id] ?? []).filter((app) => {
      const tierMatch = tierFilter === 'ALL' || app.automated_screening_tier === tierFilter;
      return tierMatch;
    });

    return (
      <div
        key={col.id}
        className={cn(
          'rounded-xl border p-3 flex flex-col min-h-[520px]',
          col.colorClass ?? 'bg-neutral-900/40 border-neutral-800/80'
        )}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            {col.group === 'disposition' && dispositionIcon(col.id)}
            <span
              className={cn(
                'text-xs font-semibold truncate',
                col.group === 'disposition' ? 'text-neutral-200' : 'text-neutral-300'
              )}
            >
              {col.title}
            </span>
          </div>
          <span
            className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0',
              col.group === 'disposition'
                ? 'bg-neutral-800/80 text-neutral-300'
                : 'bg-neutral-800 text-neutral-400'
            )}
          >
            {colApps.length}
          </span>
        </div>

        <div className="space-y-3 flex-1">
          {colApps.map((app) => (
            <div
              key={app.id}
              onClick={() => onSelectApp(app.id)}
              className={cn(
                'border rounded-lg p-3.5 space-y-2.5 transition-all cursor-pointer shadow-sm',
                selectedAppId === app.id
                  ? 'bg-emerald-950/30 border-emerald-500/60'
                  : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-850'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-white truncate max-w-[120px]">
                  {app.company_name}
                </span>
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] font-bold font-mono',
                    app.automated_screening_tier === 'A'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-blue-500/20 text-blue-400'
                  )}
                >
                  T-{app.automated_screening_tier}
                </span>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono">
                <span>Fit: <strong className="text-emerald-400">{app.program_fit_score.toFixed(0)}%</strong></span>
                <span>·</span>
                <span>Evid: <strong className="text-blue-400">{app.evidence_confidence_score.toFixed(0)}%</strong></span>
              </div>

              {app.stage_conflict_detected && (
                <div className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                  <span>Stage Mismatch</span>
                </div>
              )}

              {/* Major #6 — regressive transitions are exposed alongside forward
                  ones so that users can demote an application if it was moved
                  forward prematurely. Disposition columns only allow reviving
                  back into the pipeline (no "further regress"). */}
              <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between text-[10px] flex-wrap gap-1">
                <span className="text-neutral-500">{app.total_claims} Claims</span>
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  {col.prev && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTransitionStatus(app.id, col.prev!);
                      }}
                      className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-medium flex items-center gap-1 transition-colors cursor-pointer"
                      title={`Move back to ${col.prev}`}
                    >
                      <ArrowLeft className="w-2.5 h-2.5" />
                      <span>{col.prevLabel}</span>
                    </button>
                  )}
                  {col.next && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTransitionStatus(app.id, col.next!);
                      }}
                      className={cn(
                        'px-2 py-0.5 rounded font-medium flex items-center gap-1 transition-colors cursor-pointer',
                        col.id === 'COMMITTEE_REVIEW' && col.next === 'ACCEPTED'
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : col.group === 'disposition'
                          ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white'
                          : 'bg-neutral-800 hover:bg-emerald-600 text-neutral-300 hover:text-white'
                      )}
                      title={`Move forward to ${col.next}`}
                    >
                      <span>{col.nextLabel}</span>
                      <ArrowRight className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {colApps.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-center p-4">
              <p className="text-xs text-neutral-600">No applicants in stage</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const gridCols = columns.length <= 5
    ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5'
    : columns.length <= 7
    ? 'grid-cols-1 md:grid-cols-3 lg:grid-cols-7'
    : 'grid-cols-1 md:grid-cols-3 lg:grid-cols-9';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            Admissions Kanban Pipeline
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] font-mono ml-1',
                workflowStyle === 'yc_style'
                  ? 'border-orange-500/40 text-orange-300 bg-orange-500/10'
                  : 'border-neutral-700 text-neutral-300'
              )}
            >
              {workflowStyle === 'yc_style' ? 'YC Rapid' : 'Techstars Multi-Stage'}
            </Badge>
          </h2>
          <p className="text-xs text-neutral-400">
            Progressive stage advancement through screening, dual-interviews, and committee selection.
            Every column supports forward <em>and</em> regressive transitions; disposition columns
            (waitlist / rejected / withdrawn) are shown for complete funnel visibility.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filter Tier:
          </span>
          {['ALL', 'A', 'B', 'C', 'D'].map((t) => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className={cn(
                'px-2.5 py-1 rounded text-xs font-mono transition-colors cursor-pointer',
                tierFilter === t
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'bg-neutral-900 text-neutral-400 border border-neutral-800 hover:bg-neutral-850'
              )}
            >
              {t === 'ALL' ? 'All Tiers' : `Tier ${t}`}
            </button>
          ))}
        </div>
      </div>

      {/* Happy-path forward stages */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-2 pl-1">
          Active Pipeline — {forwardColumns.length} stages
        </div>
        <div className={cn('grid gap-4 overflow-x-auto pb-4', gridCols)}>
          {forwardColumns.map(renderColumn)}
        </div>
      </div>

      {/* Major #6 — Disposition stages visually separated so reviewers can
          audit the final state of every application without losing them. */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-2 pl-1">
          Dispositions — {dispositionColumns.length} outcomes
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {dispositionColumns.map(renderColumn)}
        </div>
      </div>
    </div>
  );
}
