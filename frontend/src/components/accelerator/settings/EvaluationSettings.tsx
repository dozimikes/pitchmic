'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Brain, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import { acceleratorApi } from '@/lib/acceleratorApi';
import { apiErrMessage } from '@/lib/screening';

interface DimensionWeight {
  key: string;
  name: string;
  weight: number;
  description: string;
}

export function EvaluationSettings() {
  const { activeProgramId } = useActiveProgram();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const pid = activeProgramId ?? null;
  const programKey = ['accelerator-program-detail', pid] as const;

  // Program detail carries the persisted scoring rubric + eligibility hard-gates.
  const { data: program, isLoading: programLoading } = useQuery({
    queryKey: programKey,
    queryFn: () => acceleratorApi.getProgram(pid as number),
    enabled: pid != null,
  });

  const [version, setVersion] = React.useState('1.0');
  const [effectiveDate, setEffectiveDate] = React.useState('Not set');
  const [status, setStatus] = React.useState('Active');
  const [dimensions, setDimensions] = React.useState<DimensionWeight[]>([]);
  const [eligibilityRules, setEligibilityRules] = React.useState<Record<string, any>>({});
  const [rubricBase, setRubricBase] = React.useState<Record<string, any>>({});

  const seededFor = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!program || !pid) return;
    if (seededFor.current === pid) return; // don't clobber in-progress edits
    const cfg = ((program as any).scoring_rubric_config ?? {}) as Record<string, any>;
    setRubricBase(cfg);
    setVersion(String(cfg.version || (program as any).program_version || '1.0'));
    setEffectiveDate(String(cfg.effective_date || 'Not set'));
    setStatus(String(cfg.status || 'Active'));
    setDimensions(
      Array.isArray(cfg.dimensions)
        ? cfg.dimensions.map((d: any) => ({
            key: String(d.key ?? ''),
            name: String(d.name ?? d.label ?? ''),
            weight: Number(d.weight) || 0,
            description: typeof d.description === 'string' ? d.description : '',
          }))
        : []
    );
    setEligibilityRules(((program as any).eligibility_rules ?? {}) as Record<string, any>);
    seededFor.current = pid;
  }, [program, pid]);

  React.useEffect(() => {
    // reset seed guard when switching programs
    if (seededFor.current !== pid) seededFor.current = null;
  }, [pid]);

  const totalWeight = dimensions.reduce((acc, d) => acc + d.weight, 0);
  const isValidTotal = totalWeight === 100;

  const handleWeightChange = (key: string, newWeight: number) => {
    const clamped = Math.max(0, Math.min(100, isNaN(newWeight) ? 0 : newWeight));
    setDimensions(dimensions.map((d) => (d.key === key ? { ...d, weight: clamped } : d)));
  };

  const saveRubric = useMutation({
    mutationFn: ({ nextVersion, effectiveOn }: { nextVersion: string; effectiveOn: string }) =>
      acceleratorApi.updateProgram(pid as number, {
        scoring_rubric_config: {
          ...rubricBase,
          version: nextVersion,
          effective_date: effectiveOn,
          status: 'Active',
          dimensions,
        },
        // Hard-gates are edited elsewhere; persisted back unchanged.
        eligibility_rules: eligibilityRules,
      }),
    onSuccess: (_data, { nextVersion, effectiveOn }) => {
      queryClient.invalidateQueries({ queryKey: programKey });
      queryClient.invalidateQueries({ queryKey: ['accelerator-programs'] });
      setVersion(nextVersion);
      setEffectiveDate(effectiveOn);
      setStatus('Active');
      toast({
        title: `Policy Version ${nextVersion} Created`,
        description: 'New evaluation policy persisted. Historical applications retain their original scored policy.',
        variant: 'success',
      });
    },
    onError: (err: unknown) => {
      toast({
        title: 'Save failed',
        description: apiErrMessage(err, 'Could not save evaluation policy.'),
        variant: 'error',
      });
    },
  });

  const handleCreatePolicyVersion = () => {
    if (pid == null) return;
    if (!isValidTotal) {
      toast({
        title: 'Weight Allocation Error',
        description: `Dimension weights must equal 100%. Current total: ${totalWeight}%.`,
        variant: 'error',
      });
      return;
    }
    const parts = version.split('.');
    const nextVer = `${parts[0]}.${parseInt(parts[1] || '0', 10) + 1}`;
    saveRubric.mutate({ nextVersion: nextVer, effectiveOn: new Date().toISOString().slice(0, 10) });
  };

  if (pid == null) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-8 text-center">
        <p className="text-sm text-white/60">Select a program to configure its evaluation framework.</p>
      </div>
    );
  }

  if (programLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-white/50 py-10">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading evaluation policy…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              Programs · Evaluation Framework
            </span>
          </div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Brain className="h-5 w-5 text-indigo-400" />
            Default Evaluation Framework &amp; Weight Rebalancer
          </h2>
          <p className="text-xs text-white/50 mt-1">
            Defines the multi-dimensional scoring rubric for candidate admissions. Modifying scoring weights creates an immutable version to preserve historical evaluations.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-right">
            <span className="text-[10px] text-white/40 block font-mono">ACTIVE POLICY</span>
            <span className="font-bold text-emerald-400 font-mono">v{version} · {status}</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-6 shadow-xl">
        {/* Version strip */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-[10px] font-bold uppercase text-white/40 block">Policy Version</span>
              <span className="text-sm font-black text-white font-mono">v{version}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-white/40 block">Effective Date</span>
              <span className="text-xs font-semibold text-white/80">{effectiveDate}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-white/40 block">Enforcement Mode</span>
              <span className="text-xs font-semibold text-emerald-400">Strict Weighted Baseline</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-white/60">Total Weight:</span>
            <span
              className={`text-sm font-black font-mono px-2.5 py-0.5 rounded-lg border ${
                isValidTotal
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
              }`}
            >
              {totalWeight}% {isValidTotal ? '✓' : '⚠ (Must equal 100%)'}
            </span>
          </div>
        </div>

        {/* Dimension Sliders & Inputs */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Core Evaluation Dimensions</h4>
          <div className="space-y-3">
            {dimensions.map((dim) => (
              <div
                key={dim.key}
                className="p-4 rounded-xl border border-white/10 bg-black/20 space-y-2 hover:border-white/20 transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h5 className="text-xs font-bold text-white">{dim.name}</h5>
                    <p className="text-[11px] text-white/50">{dim.description}</p>
                  </div>
                  <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={dim.weight}
                      onChange={(e) => handleWeightChange(dim.key, parseInt(e.target.value))}
                      className="w-16 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 text-xs font-bold text-indigo-300 text-center focus:outline-none"
                    />
                    <span className="text-xs font-bold text-white/40">%</span>
                  </div>
                </div>

                {/* Slider */}
                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={dim.weight}
                    onChange={(e) => handleWeightChange(dim.key, parseInt(e.target.value))}
                    className="w-full accent-indigo-500 bg-white/10 rounded-lg h-1.5 cursor-pointer"
                  />
                </div>
              </div>
            ))}
            {dimensions.length === 0 && (
              <p className="text-[11px] text-white/40 italic">
                No scoring dimensions stored for this program yet — the rubric is unconfigured until dimensions are saved.
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-white/10 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-[11px] text-white/40 max-w-md">
            Creating a new evaluation policy version does not overwrite past cohort decisions. It establishes the baseline for all subsequent application intakes.
          </p>
          <Button
            onClick={handleCreatePolicyVersion}
            disabled={saveRubric.isPending || !isValidTotal}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 flex items-center gap-2 disabled:opacity-40"
          >
            {saveRubric.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            <span>{saveRubric.isPending ? 'Saving…' : 'Create Policy Version'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
