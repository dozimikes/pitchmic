'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, Save, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import { acceleratorApi } from '@/lib/acceleratorApi';

export function DataPrivacySettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeProgramId } = useActiveProgram();
  const pid = activeProgramId ?? null;
  const programKey = ['accelerator-settings-program', pid] as const;

  const [retentionYears, setRetentionYears] = React.useState(7);

  const { data: program } = useQuery({
    queryKey: programKey,
    queryFn: () => acceleratorApi.getProgram(pid as number),
    enabled: pid != null,
  });

  const moduleConfig: Record<string, any> =
    React.useMemo(() => (program as any)?.module_config ?? {}, [program]);

  const seededFor = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!program || pid == null) return;
    if (seededFor.current === pid) return; // don't clobber in-progress edits
    const dp = ((program as any).module_config?.data_privacy ?? {}) as Record<string, any>;
    if (typeof dp.data_retention_days === 'number') {
      setRetentionYears(Math.max(1, Math.round(dp.data_retention_days / 365)));
    }
    seededFor.current = pid;
  }, [program, pid]);

  React.useEffect(() => {
    if (seededFor.current !== pid) seededFor.current = null;
  }, [pid]);

  const savePolicies = useMutation({
    mutationFn: () =>
      acceleratorApi.updateProgram(pid as number, {
        module_config: {
          ...moduleConfig,
          data_privacy: {
            ...(moduleConfig.data_privacy ?? {}),
            data_retention_days: retentionYears * 365,
          },
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: programKey });
      queryClient.invalidateQueries({ queryKey: ['accelerator-programs'] });
      toast({
        title: 'Retention Policy Saved',
        description: 'The retention window is recorded on this program.',
        variant: 'success',
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Save failed',
        description: err?.response?.data?.error || 'Could not save the retention policy.',
        variant: 'error',
      });
    },
  });
  const isSaving = savePolicies.isPending;

  if (pid == null) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-8 text-center">
        <p className="text-sm text-white/60">Select a program to configure its data and privacy policies.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-white/10 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            Data · Retention &amp; Visibility
          </span>
        </div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Database className="h-5 w-5 text-indigo-400" />
          Evidence Retention &amp; Data Visibility
        </h2>
        <p className="text-xs text-white/50 mt-1">
          How long this program says it keeps selection data, and what the review team can actually
          see. Every statement below describes server behaviour that exists today.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-6 shadow-xl">
        {/* Retention window */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Retention Window</h4>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2 max-w-sm">
            <label className="text-xs font-semibold text-white/70 block">
              Keep selection records for
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={25}
                value={retentionYears}
                onChange={(e) => setRetentionYears(parseInt(e.target.value) || 1)}
                className="w-20 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white focus:outline-none"
              />
              <span className="text-xs text-white/40">years</span>
            </div>
            <p className="text-[10px] text-white/40">
              Saved on the program record as{' '}
              <span className="font-mono">{retentionYears * 365} days</span>. No purge job reads this
              value yet, so it documents the policy instead of carrying it out.
            </p>
          </div>
        </div>

        {/* Provenance the server enforces regardless of any setting */}
        <div className="border-t border-white/10 pt-5 space-y-3">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
            Evidence Provenance
          </h4>
          <div className="rounded-xl border border-white/10 bg-black/20 divide-y divide-white/5 text-xs">
            <div className="p-3.5 flex items-start justify-between gap-4">
              <div>
                <span className="font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  Snapshot hash on every stage transition
                </span>
                <p className="text-[11px] text-white/40 mt-1">
                  Each audit event stores the scores that were live at that moment together with
                  their SHA-256 digest, so a later edit cannot rewrite what a decision relied on.
                </p>
              </div>
              <span className="text-emerald-400 font-bold shrink-0">Always on</span>
            </div>
            <div className="p-3.5 flex items-start justify-between gap-4">
              <div>
                <span className="font-bold text-white">Committee decision dossier snapshot</span>
                <p className="text-[11px] text-white/40 mt-1">
                  Recording a final decision hashes the dossier payload — company, decision, claims
                  count, quorum result and rationale — into the audit ledger.
                </p>
              </div>
              <span className="text-emerald-400 font-bold shrink-0">Always on</span>
            </div>
          </div>
          <p className="text-[10px] text-white/35">
            These are enforced by the audit ledger itself. There is deliberately no switch for them
            here, because switching them off would not change what the server writes.
          </p>
        </div>

        {/* Who can see what */}
        <div className="border-t border-white/10 pt-5 space-y-3">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Data Visibility</h4>
          <div className="rounded-xl border border-white/10 bg-black/20 divide-y divide-white/5 text-xs">
            <div className="p-3.5 flex items-start justify-between gap-4">
              <div>
                <span className="font-bold text-white">Reviewer data visibility</span>
                <p className="text-[11px] text-white/40 mt-1">
                  Any reviewer in a program can read that program's whole application pool —
                  assignment scopes are not enforced yet, so nobody has a private queue.
                </p>
              </div>
              <span className="text-amber-400 font-bold shrink-0">Program-wide</span>
            </div>
            <div className="p-3.5 flex items-start justify-between gap-4">
              <div>
                <span className="font-bold text-white">Notes and Decision Room comments</span>
                <p className="text-[11px] text-white/40 mt-1">
                  Application notes and deliberation comments carry no visibility field: anyone who
                  can open the application can read them. Treat them as program-visible, not
                  confidential.
                </p>
              </div>
              <span className="text-amber-400 font-bold shrink-0">Not restricted</span>
            </div>
            <div className="p-3.5 flex items-start justify-between gap-4">
              <div>
                <span className="font-bold text-white">Founder data export and erasure</span>
                <p className="text-[11px] text-white/40 mt-1">
                  There is no subject-access export, no erasure workflow and no privacy queue. A
                  request of that kind has to be handled against the database by whoever operates
                  it.
                </p>
              </div>
              <span className="text-rose-400 font-bold shrink-0">Not implemented</span>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 pt-4 flex items-center justify-between gap-4">
          <span className="text-[11px] text-white/40">
            Saved to this program's configuration record.
          </span>
          <Button
            onClick={() => savePolicies.mutate()}
            disabled={isSaving}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 flex items-center gap-2 shrink-0"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Retention Policy'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
