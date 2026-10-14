'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  History,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  User,
  FileText,
  Settings,
  Users,
  Shield,
  Brain,
  Link2,
  Download,
  RefreshCw,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import { acceleratorApi, type EventOutboxItem } from '@/lib/acceleratorApi';

type ResourceCategory =
  | 'policy' | 'member' | 'program' | 'integration' | 'security' | 'intelligence' | 'settings';
type Severity = 'low' | 'medium' | 'high' | 'critical';

/** Audit view-model derived from a real EventOutbox row (read-only, no invention). */
interface AuditEvent {
  id: string;
  actor: string;
  actorRole: string;
  action: string;
  resource: string;
  resourceType: ResourceCategory;
  timestamp: string;
  ip: string;
  before?: Record<string, string>;
  after?: Record<string, string>;
  severity: Severity;
}

const RESOURCE_ICONS: Record<ResourceCategory, React.FC<{ className?: string }>> = {
  policy: FileText,
  member: Users,
  program: Settings,
  integration: Link2,
  security: Shield,
  intelligence: Brain,
  settings: Settings,
};

const SEVERITY_STYLES: Record<Severity, string> = {
  low: 'bg-white/5 text-white/40 border-white/10',
  medium: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  high: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
  critical: 'bg-rose-600/20 text-rose-200 border-rose-500/40',
};

function categorize(eventType: string): ResourceCategory {
  const t = eventType.toLowerCase();
  if (t.includes('policy') || t.includes('rubric') || t.includes('evaluation')) return 'policy';
  if (t.includes('member') || t.includes('role') || t.includes('user') || t.includes('invite')) return 'member';
  if (t.includes('integrat') || t.includes('webhook') || t.includes('connection')) return 'integration';
  if (t.includes('security') || t.includes('auth') || t.includes('login') || t.includes('permission')) return 'security';
  if (t.includes('intelligence') || t.includes('ai') || t.includes('assessment') || t.includes('predict')) return 'intelligence';
  if (t.includes('settings') || t.includes('config') || t.includes('notification') || t.includes('template')) return 'settings';
  return 'program';
}

function severityFromStatus(status: string): Severity {
  if (status === 'failed') return 'high';
  if (status === 'pending') return 'medium';
  return 'low';
}

function asStringMap(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[k] = typeof val === 'object' ? JSON.stringify(val) : String(val);
  }
  return Object.keys(out).length ? out : undefined;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function toAuditEvent(ev: EventOutboxItem): AuditEvent {
  const payload = (ev.payload ?? {}) as Record<string, any>;
  const actor =
    payload.actor || payload.actor_email || payload.user_email || payload.email || payload.performed_by || 'System';
  const role = payload.actor_role || payload.role || payload.performed_by_role || '';
  const resource =
    payload.resource ||
    payload.resource_name ||
    (ev.application != null ? `Application #${ev.application}` : `Event · ${ev.event_type}`);
  return {
    id: String(ev.id),
    actor: String(actor),
    actorRole: String(role),
    action: ev.event_type,
    resource: String(resource),
    resourceType: categorize(ev.event_type),
    timestamp: formatTimestamp(ev.occurred_at),
    ip: String(payload.ip || ''),
    before: asStringMap(payload.before ?? payload.old),
    after: asStringMap(payload.after ?? payload.new),
    severity: severityFromStatus(ev.status),
  };
}

export function AuditSettings() {
  const { activeProgramId } = useActiveProgram();
  const pid = activeProgramId ?? null;

  const { data: rawEvents = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['accelerator-audit', pid],
    queryFn: () => acceleratorApi.osList<EventOutboxItem>('events', pid as number),
    enabled: pid != null,
  });

  const [search, setSearch] = React.useState('');
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [filterType, setFilterType] = React.useState<'all' | ResourceCategory>('all');

  const events = React.useMemo(
    () => [...rawEvents]
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
      .map(toAuditEvent),
    [rawEvents],
  );

  const filtered = events.filter((ev) => {
    const matchesSearch =
      ev.actor.toLowerCase().includes(search.toLowerCase()) ||
      ev.action.toLowerCase().includes(search.toLowerCase()) ||
      ev.resource.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filterType === 'all' || ev.resourceType === filterType;
    return matchesSearch && matchesFilter;
  });

  const totalEvents = events.length;
  const criticalCount = events.filter((e) => e.severity === 'critical' || e.severity === 'high').length;
  const policyCount = events.filter((e) => e.resourceType === 'policy').length;
  const now = new Date();
  const thisMonth = rawEvents.filter((e) => {
    const d = new Date(e.occurred_at);
    return !Number.isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const handleExport = () => {
    if (!events.length) return;
    const header = 'occurred_at,event_type,actor,action,resource,status\n';
    const rows = events.map((e) =>
      [e.timestamp, e.action, e.actor, e.action, e.resource, e.severity]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([header + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${pid ?? 'program'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-indigo-400" />
          <h2 className="text-lg font-bold text-white">Audit & Governance</h2>
        </div>
        <p className="text-xs text-white/50">
          Append-only record of every configuration change, permission modification, and system event across the
          organization. Immutable and tamper-evident.
        </p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Events', value: totalEvents.toString(), color: 'text-white' },
          { label: 'This Month', value: thisMonth.toString(), color: 'text-indigo-400' },
          { label: 'Critical Events', value: criticalCount.toString(), color: 'text-rose-400' },
          { label: 'Policy Changes', value: policyCount.toString(), color: 'text-amber-400' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className={cn('text-lg font-black', stat.color)}>{stat.value}</p>
            <p className="text-[10px] text-white/40 font-medium mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
          <input
            type="text"
            placeholder="Search audit log..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50"
          />
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as typeof filterType)}
              className="appearance-none pl-3 pr-8 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white/70 focus:outline-none focus:border-indigo-500/50 cursor-pointer"
            >
              <option value="all">All Events</option>
              <option value="policy">Policy</option>
              <option value="member">Members</option>
              <option value="security">Security</option>
              <option value="intelligence">Intelligence</option>
              <option value="integration">Integrations</option>
              <option value="settings">Settings</option>
            </select>
            <Filter className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-white/40 pointer-events-none" />
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white/60 hover:text-white hover:bg-white/10 transition"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white/60 hover:text-white hover:bg-white/10 transition"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Notice */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5">
        <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-200/80">
          Audit logs are immutable and append-only. Events cannot be deleted, edited, or altered. Retention period:
          7 years.
        </p>
      </div>

      {/* Event List */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
        {/* Table Header */}
        <div className="hidden md:grid grid-cols-[1fr_2fr_2fr_1fr_auto] gap-4 px-4 py-3 bg-white/5">
          {['Actor', 'Action', 'Resource', 'Timestamp', 'Severity'].map((col) => (
            <span key={col} className="text-[10px] font-black uppercase tracking-widest text-white/30">
              {col}
            </span>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-xs text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading audit events…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <History className="h-10 w-10 text-white/20 mx-auto mb-3" />
            <p className="text-sm font-semibold text-white/70">No audit events recorded</p>
            <p className="text-xs text-white/40 mt-1 max-w-sm mx-auto">
              Administrative actions, permission updates, and evaluation policy modifications will automatically generate immutable audit records here.
            </p>
          </div>
        ) : null}

        {filtered.map((event) => {
          const Icon = RESOURCE_ICONS[event.resourceType];
          const isExpanded = expandedId === event.id;
          const hasDiff = (event.before && Object.keys(event.before).length > 0) || (event.after && Object.keys(event.after).length > 0);

          return (
            <div key={event.id} className="group">
              <button
                onClick={() => setExpandedId(isExpanded ? null : event.id)}
                className="w-full grid grid-cols-1 md:grid-cols-[1fr_2fr_2fr_1fr_auto] gap-3 md:gap-4 px-4 py-4 text-left hover:bg-white/5 transition items-start md:items-center"
              >
                {/* Actor */}
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center shrink-0">
                    <User className="h-3.5 w-3.5 text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white leading-tight">{event.actor}</p>
                    <p className="text-[10px] text-white/40">{event.actorRole}</p>
                  </div>
                </div>

                {/* Action */}
                <div>
                  <p className="text-xs text-white font-medium">{event.action}</p>
                  <p className="text-[10px] text-white/40 mt-0.5 hidden md:block">{event.ip}</p>
                </div>

                {/* Resource */}
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-white/30 shrink-0" />
                  <p className="text-xs text-white/70 line-clamp-2">{event.resource}</p>
                </div>

                {/* Timestamp */}
                <p className="text-[11px] text-white/50 font-mono">{event.timestamp}</p>

                {/* Severity + expand */}
                <div className="flex items-center gap-2">
                  <span className={cn('text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border', SEVERITY_STYLES[event.severity])}>
                    {event.severity}
                  </span>
                  {hasDiff && (
                    <span className="text-white/30 group-hover:text-white/70 transition">
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </span>
                  )}
                </div>
              </button>

              {/* Diff Expansion */}
              {isExpanded && hasDiff && (
                <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {event.before && Object.keys(event.before).length > 0 && (
                    <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3.5 space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-rose-400">Before</p>
                      {Object.entries(event.before).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between">
                          <span className="text-xs text-white/50">{k}</span>
                          <span className="text-xs font-semibold text-rose-300 font-mono">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {event.after && Object.keys(event.after).length > 0 && (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">After</p>
                      {Object.entries(event.after).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between">
                          <span className="text-xs text-white/50">{k}</span>
                          <span className="text-xs font-semibold text-emerald-300 font-mono">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination hint */}
      <div className="flex items-center justify-between text-xs text-white/40">
        <p>Showing {filtered.length} of {totalEvents} events</p>
      </div>

      {/* Policy Versions */}
      <div className="space-y-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Evaluation Policy Versions</h3>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] divide-y divide-white/5 overflow-hidden">
          {[
            { version: 'v1', date: 'Active', status: 'Active', author: 'System Policy', changes: 'Configurable multidimensional rubric applied from active archetype' },
          ].map((pv) => (
            <div key={pv.version} className="px-4 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-black text-indigo-400">{pv.version}</span>
                <div>
                  <p className="text-xs font-medium text-white">{pv.changes}</p>
                  <p className="text-[10px] text-white/40">
                    {pv.author} · {pv.date}
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  'text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border',
                  pv.status === 'Active'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                    : 'bg-white/5 text-white/30 border-white/10'
                )}
              >
                {pv.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
