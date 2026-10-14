'use client';

import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MinusCircle,
  Wand2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { acceleratorApi, type BatchAnalyzeRow } from '@/lib/acceleratorApi';
import { apiErrMessage } from '@/lib/screening';

export interface BatchAppItem {
  id: number;
  name: string;
  sector: string;
}

interface ReviewerBatchAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedApps: BatchAppItem[];
  onComplete: (analyzedIds: number[]) => void;
}

type RowState = 'Queued' | 'Running' | 'Screened' | 'Failed' | 'Skipped';

export function ReviewerBatchAnalysisModal({
  isOpen,
  onClose,
  selectedApps,
  onComplete,
}: ReviewerBatchAnalysisModalProps) {
  const { toast } = useToast();

  const [isRunning, setIsRunning] = React.useState(false);
  const [rowState, setRowState] = React.useState<Record<number, RowState>>({});
  const [tierByApp, setTierByApp] = React.useState<Record<number, string | null>>({});
  const [failure, setFailure] = React.useState<string | null>(null);
  const [tally, setTally] = React.useState<{ ran: number; notRun: number; failed: number } | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setIsRunning(false);
      setRowState({});
      setTierByApp({});
      setFailure(null);
      setTally(null);
    }
  }, [isOpen, selectedApps]);

  if (!isOpen) return null;

  const stateOf = (id: number): RowState => rowState[id] ?? 'Queued';

  const handleRun = async () => {
    setIsRunning(true);
    setFailure(null);
    setTally(null);
    const appIds = selectedApps.map((a) => a.id);
    const running: Record<number, RowState> = {};
    appIds.forEach((id) => {
      running[id] = 'Running';
    });
    setRowState(running);

    try {
      const res = await acceleratorApi.batchAnalyzeApplications(appIds);
      const byId: Record<number, BatchAnalyzeRow> = {};
      res.results.forEach((r) => {
        byId[r.application_id] = r;
      });

      const next: Record<number, RowState> = {};
      const tiers: Record<number, string | null> = {};
      appIds.forEach((id) => {
        const row = byId[id];
        if (!row) {
          // The server never ran this one — it is reported, not guessed at.
          next[id] = 'Skipped';
          return;
        }
        next[id] = row.ok ? 'Screened' : 'Failed';
        tiers[id] = row.tier ?? null;
      });
      setRowState(next);
      setTierByApp(tiers);
      setTally({ ran: res.ran, notRun: res.not_run, failed: res.failed });
      setIsRunning(false);

      const screened = appIds.filter((id) => next[id] === 'Screened');
      if (screened.length > 0) onComplete(screened);

      toast({
        title: res.failed === 0 && res.not_run === 0 ? 'Triage recorded' : 'Triage finished with gaps',
        description: `${screened.length} of ${appIds.length} selected rows carry a new tier.${
          res.not_run ? ` ${res.not_run} were not run.` : ''
        }${res.failed ? ` ${res.failed} failed.` : ''}`,
        variant: screened.length === 0 ? 'error' : res.failed || res.not_run ? 'info' : 'success',
      });
    } catch (err: any) {
      const message = apiErrMessage(err, 'The triage request failed.');
      const next: Record<number, RowState> = {};
      appIds.forEach((id) => {
        next[id] = 'Failed';
      });
      setRowState(next);
      setFailure(message);
      setIsRunning(false);
      toast({
        title: 'Triage did not run',
        description: `${message} No application was changed.`,
        variant: 'error',
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0F1623] text-white shadow-2xl p-6 space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Wand2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Run automated triage
              </h3>
              <p className="text-xs text-white/50">
                {selectedApps.length} application(s) — ranks each row, decides none of them
              </p>
            </div>
          </div>

          {!isRunning && (
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* What the engine actually writes */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 text-[11px] leading-relaxed text-white/60">
          Per row this stores the screening tier from its saved fit, strength and
          evidence scores, refreshes its eligibility row from the same engine the
          founder self-check uses, and writes an audit event. A row sitting in
          SUBMITTED moves to SCREENING — that is what a tier means. Accept and
          reject stay human actions; this run never takes either.
        </div>

        {/* Per-row outcomes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-white/50">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              Selected rows ({selectedApps.length})
            </span>
            {tally && (
              <span>
                {tally.ran} ran · {tally.failed} failed · {tally.notRun} not run
              </span>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
            {selectedApps.map((app) => {
              const state = stateOf(app.id);
              const tier = tierByApp[app.id];
              return (
                <div
                  key={app.id}
                  className="rounded-xl border border-white/5 bg-black/40 p-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">{app.name}</div>
                    <div className="text-[10px] text-white/40">{app.sector}</div>
                  </div>

                  <span
                    className={cn(
                      'shrink-0 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                      state === 'Screened' && 'bg-emerald-500/15 text-emerald-300',
                      state === 'Failed' && 'bg-rose-500/15 text-rose-300',
                      state === 'Skipped' && 'bg-white/5 text-white/40',
                      state === 'Running' && 'bg-indigo-500/15 text-indigo-300',
                      state === 'Queued' && 'bg-white/5 text-white/40'
                    )}
                  >
                    {state === 'Running' && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                    {state === 'Screened' && <CheckCircle2 className="h-2.5 w-2.5" />}
                    {state === 'Failed' && <AlertTriangle className="h-2.5 w-2.5" />}
                    {state === 'Skipped' && <MinusCircle className="h-2.5 w-2.5" />}
                    {state === 'Screened' ? (tier ? `Tier ${tier}` : 'Screened') : state}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {!!failure && (
          <p className="text-[11px] text-rose-300">{failure}</p>
        )}

        {/* Footer */}
        <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-3">
          <span className="text-[11px] text-white/40">
            Ranks and records evidence — reviewers still decide.
          </span>

          <div className="flex gap-2 shrink-0">
            {!isRunning && (
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="border-white/15 bg-white/5 text-white text-xs"
              >
                {tally ? 'Close' : 'Cancel'}
              </Button>
            )}
            <Button
              size="sm"
              disabled={isRunning || selectedApps.length === 0}
              onClick={handleRun}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                  {tally ? 'Run again' : `Run triage (${selectedApps.length})`}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
