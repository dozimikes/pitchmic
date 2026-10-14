'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Gavel, ShieldCheck, CalendarClock, FileSearch, Vote } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import { acceleratorApi } from '@/lib/acceleratorApi';
import { apiErrMessage } from '@/lib/screening';

type DecisionMode = 'MAJORITY' | 'CONSENSUS' | 'SOLE';

/** Which config block the settings route wants opened (steps 6–8 of the
 *  configuration flow deep-link here via ?focus=). */
export type InterviewDecisionFocus = 'interview' | 'due-diligence' | 'decision-rules';

const FOCUS_SECTIONS: Record<InterviewDecisionFocus, { id: string; label: string }> = {
  interview: { id: 'ids-sec-interview', label: 'Interview Process' },
  'due-diligence': { id: 'ids-sec-due-diligence', label: 'Due Diligence Inputs' },
  'decision-rules': { id: 'ids-sec-decision-rules', label: 'Decision Rules' },
};

function ToggleButton({
  label,
  description,
  value,
  onToggle,
  disabled,
}: {
  label: string;
  description: string;
  value: boolean;
  onToggle: () => void;
  disabled?: boolean;
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
        disabled={disabled}
        className={`shrink-0 rounded-lg border px-3.5 py-1.5 text-xs font-bold transition disabled:opacity-40 ${
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

export function InterviewDecisionSettings({ focus }: { focus?: InterviewDecisionFocus | null }) {
  const { activeProgramId } = useActiveProgram();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const pid = activeProgramId ?? null;
  const programKey = ['accelerator-program-detail', pid] as const;

  // Program detail carries the workflow_config object shared with the workflow engine.
  const { data: program, isLoading: programLoading } = useQuery({
    queryKey: programKey,
    queryFn: () => acceleratorApi.getProgram(pid as number),
    enabled: pid != null,
  });

  // base = the full untouched workflow_config; we only merge our interview_decision slice into it.
  const [base, setBase] = React.useState<Record<string, any>>({});
  const [minReviewers, setMinReviewers] = React.useState(2);
  const [dualInterview, setDualInterview] = React.useState(true);
  const [decisionMode, setDecisionMode] = React.useState<DecisionMode>('MAJORITY');
  const [icQuorum, setIcQuorum] = React.useState(3);
  const [allowMl, setAllowMl] = React.useState(true);

  const seededFor = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!program || !pid) return;
    if (seededFor.current === pid) return; // don't clobber in-progress edits
    const wf = ((program as any).workflow_config ?? {}) as Record<string, any>;
    setBase(wf);
    const d = (wf.interview_decision ?? {}) as Record<string, any>;
    setMinReviewers(d.min_reviewers_required == null ? 2 : Number(d.min_reviewers_required) || 0);
    setDualInterview(d.require_dual_interview == null ? true : Boolean(d.require_dual_interview));
    setDecisionMode(
      d.decision_mode === 'CONSENSUS' || d.decision_mode === 'SOLE' || d.decision_mode === 'MAJORITY'
        ? d.decision_mode
        : 'MAJORITY'
    );
    setIcQuorum(d.ic_quorum == null ? 3 : Number(d.ic_quorum) || 0);
    // Storage key stays allow_ai_recommendations for backend compatibility;
    // user-facing language is ML.
    setAllowMl(d.allow_ai_recommendations == null ? true : Boolean(d.allow_ai_recommendations));
    seededFor.current = pid;
  }, [program, pid]);

  React.useEffect(() => {
    // reset seed guard when switching programs
    if (seededFor.current !== pid) seededFor.current = null;
  }, [pid]);

  // Honor the ?focus= deep link from the configuration flow: scroll the
  // matching section into view (and highlight it briefly).
  React.useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(FOCUS_SECTIONS[focus].id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focus, programLoading]);

  const save = useMutation({
    mutationFn: () =>
      acceleratorApi.updateProgram(pid as number, {
        workflow_config: {
          ...base,
          interview_decision: {
            min_reviewers_required: minReviewers,
            require_dual_interview: dualInterview,
            decision_mode: decisionMode,
            ic_quorum: icQuorum,
            allow_ai_recommendations: allowMl,
          },
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: programKey });
      queryClient.invalidateQueries({ queryKey: ['accelerator-programs'] });
      toast({
        title: 'Saved',
        description: 'Interview & decision governance updated.',
        variant: 'success',
      });
    },
    onError: (err: unknown) =>
      toast({
        title: 'Save failed',
        description: apiErrMessage(err, 'Could not save.'),
        variant: 'error',
      }),
  });

  if (pid == null) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-8 text-center">
        <p className="text-sm text-white/60">Select a program to configure interview decision governance.</p>
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

  const sectionHighlight = (f: InterviewDecisionFocus) =>
    focus === f ? 'border-indigo-500/40 ring-1 ring-indigo-500/30' : 'border-white/10';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              Review &amp; Decision
            </span>
          </div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Gavel className="h-5 w-5 text-indigo-400" />
            Interview &amp; Decision Governance
          </h2>
          <p className="text-xs text-white/50 mt-1">
            Selection Framework methodology controls: how many reviewers must weigh in and how the interview
            committee finalizes an admission decision. These settings are the methodology CMS — humans decide.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-8 shadow-xl">
        {/* ── Interview Process (config step 6) ─────────────────────────────── */}
        <section id={FOCUS_SECTIONS.interview.id} className={`scroll-mt-28 rounded-2xl border p-5 space-y-4 transition ${sectionHighlight('interview')} bg-black/20`}>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-indigo-400" />
            <h3 className="text-sm font-black uppercase tracking-wider text-white/80">Interview Process</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-bold text-white uppercase tracking-wider">Min reviewers required</label>
              <input
                type="number"
                min={0}
                value={minReviewers}
                onChange={(e) => setMinReviewers(isNaN(Number(e.target.value)) ? 0 : Math.max(0, Number(e.target.value)))}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-white/40">Reviewer evaluations needed before a decision can be recorded.</p>
            </div>
            <ToggleButton
              label="Require dual interview"
              description="Candidates must complete two independent interview rounds."
              value={dualInterview}
              onToggle={() => setDualInterview((v) => !v)}
            />
          </div>
        </section>

        {/* ── Due Diligence inputs (config step 7) ──────────────────────────── */}
        <section id={FOCUS_SECTIONS['due-diligence'].id} className={`scroll-mt-28 rounded-2xl border p-5 space-y-3 transition ${sectionHighlight('due-diligence')} bg-black/20`}>
          <div className="flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-indigo-400" />
            <h3 className="text-sm font-black uppercase tracking-wider text-white/80">Due Diligence Inputs</h3>
            <span className="px-2 py-0.5 rounded-full border border-white/15 bg-white/5 text-[10px] font-bold uppercase tracking-wider text-white/50">
              Informational
            </span>
          </div>
          <p className="text-xs text-white/55 leading-relaxed">
            Claim extraction, verification status and contradiction handling are configured under{' '}
            <span className="text-white/80 font-semibold">Evidence &amp; Verification</span> in the Selection
            Framework — there is no separate due-diligence toggle here, and diligence findings are evidence inputs
            to this committee, never an automated gate.
          </p>
        </section>

        {/* ── Decision Rules (config step 8) ────────────────────────────────── */}
        <section id={FOCUS_SECTIONS['decision-rules'].id} className={`scroll-mt-28 rounded-2xl border p-5 space-y-4 transition ${sectionHighlight('decision-rules')} bg-black/20`}>
          <div className="flex items-center gap-2">
            <Vote className="h-4 w-4 text-indigo-400" />
            <h3 className="text-sm font-black uppercase tracking-wider text-white/80">Decision Rules</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-bold text-white uppercase tracking-wider">IC quorum</label>
              <input
                type="number"
                min={0}
                value={icQuorum}
                onChange={(e) => setIcQuorum(isNaN(Number(e.target.value)) ? 0 : Math.max(0, Number(e.target.value)))}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-white/40">Committee members required to finalize the decision.</p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-white uppercase tracking-wider">Decision mode</label>
              <select
                value={decisionMode}
                onChange={(e) => setDecisionMode(e.target.value as DecisionMode)}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="MAJORITY">MAJORITY — decide by majority vote</option>
                <option value="CONSENSUS">CONSENSUS — full committee agreement required</option>
                <option value="SOLE">SOLE — a single chair decides</option>
              </select>
            </div>
          </div>
          <ToggleButton
            label="Include ML recommendations"
            description="Surface ML-generated evidence and recommendations to the committee as advisory input."
            value={allowMl}
            onToggle={() => setAllowMl((v) => !v)}
          />
        </section>

        <div className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-black/20 p-4">
          <ShieldCheck className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-white/60">
            Guardrail: ML produces evidence and recommendations; the interview committee records the decision — there
            is no automated admissions. A model suggestion is advisory only and never finalizes an outcome.
          </p>
        </div>

        <div className="border-t border-white/10 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-[11px] text-white/40 max-w-md">
            Only the interview-decision slice of the workflow configuration is changed here; unrelated workflow settings
            for this program are preserved.
          </p>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 flex items-center gap-2 disabled:opacity-40"
          >
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gavel className="h-3.5 w-3.5" />}
            <span>{save.isPending ? 'Saving…' : 'Save governance'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
