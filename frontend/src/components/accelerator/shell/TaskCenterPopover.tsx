'use client';

import * as React from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  FileSearch,
  Inbox,
  MessageSquareDashed,
  Vote,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkInboxItem, WorkInboxKind, WorkInboxReport } from '@/lib/acceleratorApi';

interface TaskCenterPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  report: WorkInboxReport | null;
  isLoading: boolean;
  isError: boolean;
  programName: string | null;
}

const KIND_META: Record<WorkInboxKind, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  review: { label: 'Review', icon: Vote },
  diligence: { label: 'Diligence', icon: FileSearch },
  interview: { label: 'Interview', icon: CalendarClock },
  awaiting_founder: { label: 'Awaiting founder', icon: MessageSquareDashed },
};

function formatDue(dueAt: string | null): string {
  if (!dueAt) return 'No due date';
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return 'Unreadable date';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function WorkRow({ item }: { item: WorkInboxItem }) {
  const meta = KIND_META[item.kind] ?? { label: item.kind, icon: Inbox };
  const Icon = meta.icon;
  return (
    <Link
      href={item.href}
      className="group flex items-start justify-between gap-2 rounded-xl p-2.5 hover:bg-white/5 transition"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-1">
          <Icon
            className={cn(
              'h-3 w-3 shrink-0',
              item.overdue === true ? 'text-rose-400' : 'text-indigo-400'
            )}
          />
          <span className="text-[9px] font-bold uppercase tracking-wider text-white/40 shrink-0">
            {meta.label}
          </span>
          <span className="text-[11px] text-white/70 truncate">{item.company}</span>
        </div>
        <p className="text-xs font-medium text-white leading-snug line-clamp-2">{item.title}</p>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-white/40">
          <span
            className={cn(
              'flex items-center gap-1',
              item.overdue === true && 'font-semibold text-rose-400'
            )}
          >
            {formatDue(item.due_at)}
            {item.overdue === true ? ' · overdue' : ''}
          </span>
          {item.area && <span className="truncate">· {item.area}</span>}
        </div>
      </div>
      <ArrowUpRight className="h-3.5 w-3.5 text-white/20 group-hover:text-white/60 transition shrink-0 mt-1" />
    </Link>
  );
}

export function TaskCenterPopover({
  isOpen,
  onClose,
  anchorRef,
  report,
  isLoading,
  isError,
  programName,
}: TaskCenterPopoverProps) {
  const [mounted, setMounted] = React.useState(false);
  const [anchor, setAnchor] = React.useState<{ top: number; right: number } | null>(null);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!isOpen) return;
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setAnchor({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [isOpen, anchorRef]);

  React.useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose, anchorRef]);

  const panelRef = React.useRef<HTMLDivElement | null>(null);

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  const counts = report?.counts ?? null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="My open work"
      style={
        anchor
          ? { position: 'fixed', top: anchor.top, right: anchor.right }
          : { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }
      }
      className="z-50 w-[380px] max-w-[calc(100vw-16px)] rounded-2xl border border-white/10 bg-[#0F1623] text-white shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="border-b border-white/10 px-4 py-3.5 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shrink-0">
            <Inbox className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">My Work</h4>
            <p className="text-[11px] text-white/50 truncate">
              {isError
                ? 'Could not be loaded — the count is unknown, not zero.'
                : isLoading
                ? 'Counting rows that carry your name…'
                : `${report?.total_open ?? 0} open rows assigned to you${programName ? ` in ${programName}` : ''}`}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg p-1 text-white/40 hover:bg-white/10 hover:text-white transition shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Server-computed counts. Each number is one of the four work ledgers,
          filtered to rows naming this person and still open. */}
      <div className="grid grid-cols-4 border-b border-white/5 bg-black/20 p-2 text-center text-[10px]">
        {(
          [
            { key: 'review', label: 'Reviews', value: counts?.reviews, tone: 'text-indigo-400' },
            { key: 'dd', label: 'Diligence', value: counts?.diligence, tone: 'text-blue-400' },
            { key: 'int', label: 'Interviews', value: counts?.interviews, tone: 'text-emerald-400' },
            {
              key: 'founder',
              label: 'Waiting on founder',
              value: counts?.awaiting_founder,
              tone: 'text-purple-400',
            },
          ] as const
        ).map((cell) => (
          <div key={cell.key}>
            <div className={cn('font-bold', cell.tone)}>
              {isLoading || isError ? '—' : cell.value ?? 0}
            </div>
            <div className="text-white/40 truncate px-1">{cell.label}</div>
          </div>
        ))}
      </div>

      {counts && counts.overdue > 0 && !isLoading && !isError && (
        <div className="border-b border-white/5 bg-rose-500/5 px-4 py-1.5 text-[10px] text-rose-300">
          {counts.overdue} of these are past their due date.
        </div>
      )}

      {/* Rows */}
      <div className="max-h-80 overflow-y-auto divide-y divide-white/5 p-2">
        {isLoading ? (
          <div className="space-y-2 py-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <div className="py-8 text-center text-xs text-white/50">
            <FileSearch className="mx-auto h-8 w-8 text-amber-400/50 mb-2" />
            The work inbox could not be loaded, so nothing here is known — including whether it is
            empty.
          </div>
        ) : (report?.items.length ?? 0) === 0 ? (
          <div className="py-8 px-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400/50 mb-2" />
            <p className="text-xs text-white/60">
              No open review, diligence, interview or evidence row carries your name
              {programName ? ` in ${programName}` : ''}.
            </p>
            <p className="text-[11px] text-white/35 mt-1.5 leading-snug">
              That is nothing owed to you here — it is not the program being clear. Open reviews and
              diligence questions show the assignments made by whoever runs them.
            </p>
          </div>
        ) : (
          <>
            {report?.items.map((item) => <WorkRow key={item.key} item={item} />)}
            {report?.truncated && (
              <p className="px-2.5 py-2 text-[10px] text-white/40">
                Showing the soonest {report.items.length} of {report.total_open}. The counts above
                cover all of them.
              </p>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-white/10 px-4 py-2.5 bg-black/30 text-[10px] text-white/40 leading-snug">
        Rows are completed where the work happens — a review on its application, a question in Due
        Diligence. Nothing is marked done from here.
      </div>
    </div>,
    document.body
  );
}
