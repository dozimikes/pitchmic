'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Filter, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import { acceleratorApi, type EligibilityCheckRequest, type EligibilityResult } from '@/lib/acceleratorApi';
import { apiErrMessage } from '@/lib/screening';
import { EligibilitySimulator, EMPTY_FACTS } from '@/components/accelerator/EligibilitySimulator';

function TagList({
  label,
  values,
  onChange,
  fallback,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  /** What the engine actually does when nothing is saved here. */
  fallback?: string;
}) {
  const [draft, setDraft] = React.useState('');

  const commit = (raw: string) => {
    const parts = raw
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (parts.length === 0) return;
    const next = [...values];
    for (const p of parts) {
      if (!next.includes(p)) next.push(p);
    }
    onChange(next);
    setDraft('');
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-white uppercase tracking-wider">{label}</label>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-xs text-white"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="text-white/40 hover:text-rose-400 transition"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {values.length === 0 && (
          <span className="text-[11px] text-white/40 italic">
            {fallback ?? 'None set — every applicant passes this gate.'}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commit(draft);
            }
          }}
          placeholder="Add and press Enter…"
          className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
        />
        <Button
          type="button"
          onClick={() => commit(draft)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-2 flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
    </div>
  );
}

function ToggleButton({
  label,
  description,
  value,
  onToggle,
}: {
  label: string;
  description: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 p-4">
      <div>
        <h5 className="text-xs font-bold text-white">{label}</h5>
        <p className="text-[11px] text-white/50 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`shrink-0 rounded-lg border px-3.5 py-1.5 text-xs font-bold transition ${
          value
            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
            : 'bg-black/40 text-white/40 border-white/10'
        }`}
      >
        {value ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}

/** The six hard-gates the eligibility engine reads, in the shape it wants. */
interface GateDraft {
  geography: string[];
  sectors: string[];
  incorporated: boolean;
  fullTime: boolean;
  fundingMax: number;
  minTeam?: number;
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** Rule keys the engine reads, so defaults can be merged in one place. */
const RULE_KEYS = [
  'geography_whitelist',
  'sector_whitelist',
  'incorporated_required',
  'full_time_required',
  'previous_funding_max_usd',
  'min_team_size',
] as const;

/** Merge the engine's stated defaults over what the program row stores, so the
 *  editor shows the gate that is actually in force rather than a blank. */
function effectiveRules(
  stored: Record<string, any>,
  defaults: Record<string, any>
): Record<string, any> {
  const out: Record<string, any> = { ...stored };
  for (const key of RULE_KEYS) {
    if (out[key] === undefined && defaults[key] !== undefined) out[key] = defaults[key];
  }
  return out;
}

function toDraft(rules: Record<string, any>): GateDraft {
  const minTeam = rules.min_team_size;
  return {
    geography: asList(rules.geography_whitelist),
    sectors: asList(rules.sector_whitelist),
    incorporated: Boolean(rules.incorporated_required),
    fullTime: Boolean(rules.full_time_required),
    fundingMax: Number(rules.previous_funding_max_usd) || 0,
    minTeam: minTeam == null || minTeam === '' ? undefined : Number(minTeam),
  };
}

function sameGates(a: GateDraft, b: GateDraft): boolean {
  return (
    a.geography.join('\u0000') === b.geography.join('\u0000') &&
    a.sectors.join('\u0000') === b.sectors.join('\u0000') &&
    a.incorporated === b.incorporated &&
    a.fullTime === b.fullTime &&
    a.fundingMax === b.fundingMax &&
    (a.minTeam ?? null) === (b.minTeam ?? null)
  );
}

export function EligibilitySettings() {
  const { activeProgramId } = useActiveProgram();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const pid = activeProgramId ?? null;
  const programKey = ['accelerator-program-detail', pid] as const;

  // Program detail carries the eligibility hard-gates applied before screening.
  const { data: program, isLoading: programLoading } = useQuery({
    queryKey: programKey,
    queryFn: () => acceleratorApi.getProgram(pid as number),
    enabled: pid != null,
  });

  const storedRules = React.useMemo(
    () => (program?.eligibility_rules ?? {}) as Record<string, any>,
    [program]
  );
  // What the engine assumes for a key this program never set. Supplied by the
  // server, so this screen never restates a default and cannot drift from it.
  const ruleDefaults = React.useMemo(
    () => (program?.eligibility_defaults ?? {}) as Record<string, any>,
    [program]
  );
  const effective = React.useMemo(
    () => effectiveRules(storedRules, ruleDefaults),
    [storedRules, ruleDefaults]
  );

  const [draft, setDraft] = React.useState<GateDraft>(toDraft({}));
  const seededFor = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!program || pid == null) return;
    if (seededFor.current === pid) return; // don't clobber in-progress edits
    setDraft(toDraft(effective));
    seededFor.current = pid;
  }, [program, pid, effective]);

  React.useEffect(() => {
    // reset seed guard when switching programs
    if (seededFor.current !== pid) seededFor.current = null;
  }, [pid]);

  // Unsaved edits mean the preview below is scoring the previous rule set — the
  // engine reads the program row, not this form.
  const dirty = seededFor.current === pid && !sameGates(toDraft(effective), draft);
  const setGate = (patch: Partial<GateDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const save = useMutation({
    mutationFn: () =>
      acceleratorApi.updateProgram(pid as number, {
        eligibility_rules: {
          ...storedRules,
          geography_whitelist: draft.geography,
          sector_whitelist: draft.sectors,
          incorporated_required: draft.incorporated,
          full_time_required: draft.fullTime,
          previous_funding_max_usd: draft.fundingMax,
          min_team_size: draft.minTeam,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: programKey });
      queryClient.invalidateQueries({ queryKey: ['accelerator-programs'] });
      toast({
        title: 'Saved',
        description: 'Eligibility hard-gates updated for this program.',
        variant: 'success',
      });
    },
    onError: (err: any) =>
      toast({
        title: 'Save failed',
        description: err?.response?.data?.error || 'Could not save.',
        variant: 'error',
      }),
  });

  // ── Rule preview: the server's own engine scoring a hypothetical applicant ──
  const [facts, setFacts] = React.useState<EligibilityCheckRequest>(EMPTY_FACTS);
  const [preview, setPreview] = React.useState<EligibilityResult | undefined>(undefined);
  const [previewError, setPreviewError] = React.useState<string | null>(null);

  const runPreview = useMutation({
    mutationFn: () => acceleratorApi.checkEligibility(pid as number, facts),
    onSuccess: (data) => {
      setPreview(data);
      setPreviewError(null);
    },
    onError: (err) => {
      setPreview(undefined);
      setPreviewError(apiErrMessage(err, 'The eligibility check request failed.'));
    },
  });

  if (pid == null) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-8 text-center">
        <p className="text-sm text-white/60">Select a program to configure eligibility rules.</p>
      </div>
    );
  }

  if (programLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-white/50 py-10">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const geoFallback = asList(ruleDefaults.geography_whitelist).length
    ? `Nothing saved — the engine enforces its default list: ${asList(ruleDefaults.geography_whitelist).join(', ')}`
    : undefined;
  const fundingDefault = Number(ruleDefaults.previous_funding_max_usd);
  const ftDefault = ruleDefaults.full_time_required;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              Screening Methodology · Eligibility
            </span>
          </div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Filter className="h-5 w-5 text-indigo-400" />
            Eligibility Rules
          </h2>
          <p className="text-xs text-white/50 mt-1">
            Hard-gates applied to every application <span className="text-white/70 font-semibold">before screening</span>.
            Ineligible applications are filtered out automatically and never reach reviewers or the scoring rubric.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-6 shadow-xl">
        <TagList
          label="Geography whitelist (ISO country codes)"
          values={draft.geography}
          onChange={(geography) => setGate({ geography })}
          fallback={geoFallback}
        />
        <TagList
          label="Sector whitelist"
          values={draft.sectors}
          onChange={(sectors) => setGate({ sectors })}
          fallback="Nothing saved — this gate passes for every applicant."
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <ToggleButton
            label="Incorporation required"
            description="Applicant must be a registered, incorporated entity."
            value={draft.incorporated}
            onToggle={() => setGate({ incorporated: !draft.incorporated })}
          />
          <ToggleButton
            label="Full-time team required"
            description={
              storedRules.full_time_required === undefined && ftDefault !== undefined
                ? `At least one co-founder 100% full-time — the engine enforces this until you save a value.`
                : 'Founding team must be committed full-time to the venture.'
            }
            value={draft.fullTime}
            onToggle={() => setGate({ fullTime: !draft.fullTime })}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-bold text-white uppercase tracking-wider">
              Previous funding cap (USD)
            </label>
            <input
              type="number"
              min={0}
              value={draft.fundingMax}
              onChange={(e) => setGate({ fundingMax: isNaN(Number(e.target.value)) ? 0 : Math.max(0, Number(e.target.value)) })}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[11px] text-white/40">
              Applications that already raised more than this are excluded.
              {storedRules.previous_funding_max_usd === undefined && fundingDefault
                ? ` ${fundingDefault.toLocaleString('en-US')} is the engine default while nothing is saved here.`
                : ''}
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-white uppercase tracking-wider">Minimum team size</label>
            <input
              type="number"
              min={0}
              value={draft.minTeam ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                setGate({ minTeam: raw === '' ? undefined : Math.max(0, Number(raw) || 0) });
              }}
              placeholder="Optional"
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[11px] text-white/40">Leave empty to skip this gate.</p>
          </div>
        </div>

        <div className="border-t border-white/10 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-[11px] text-white/40 max-w-md">
            These hard-gates run first in the pipeline. Any application failing them is removed before scoring and
            human screening, so reviewers only ever see eligible candidates.
          </p>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !dirty}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 flex items-center gap-2 disabled:opacity-40"
          >
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Filter className="h-3.5 w-3.5" />}
            <span>{save.isPending ? 'Saving…' : dirty ? 'Save eligibility rules' : 'No unsaved changes'}</span>
          </Button>
        </div>
      </div>

      {/* ── Preview the saved rule set against a hypothetical applicant ─────── */}
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-6 shadow-xl">
        <EligibilitySimulator
          facts={facts}
          onFactsChange={(next) => {
            setFacts(next);
            // A stale verdict under edited inputs reads as a live one.
            setPreview(undefined);
          }}
          result={preview}
          isRunning={runPreview.isPending}
          error={previewError}
          onRun={() => runPreview.mutate()}
          unsavedChanges={dirty}
          sectorWhitelist={draft.sectors}
        />
      </div>
    </div>
  );
}
