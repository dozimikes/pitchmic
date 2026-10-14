'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Workflow, ArrowUp, ArrowDown, Plus, Trash2, Save, Zap, Loader2,
  Boxes, X, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import {
  acceleratorApi,
  type WorkflowStage,
  type WorkflowTransition,
  type StatusOption,
  type TriggerOption,
  type WorkflowAutomation,
  type AutomationAction,
} from '@/lib/acceleratorApi';

const inputCls =
  'w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-xs text-white ' +
  'placeholder-white/30 focus:outline-none focus:border-indigo-500/60 transition';

export function WorkflowSettings() {
  const { activeProgramId, activeProgram } = useActiveProgram();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const pid = activeProgramId ?? null;
  const wfKey = ['accelerator-workflow', pid] as const;
  const autoKey = ['accelerator-automations', pid] as const;

  // ── Workflow definition (stages + transitions) ────────────────────────────
  const { data: wf, isLoading: wfLoading } = useQuery({
    queryKey: wfKey,
    queryFn: () => acceleratorApi.getWorkflow(pid as number),
    enabled: pid != null,
  });

  const [style, setStyle] = React.useState<string>('techstars_style');
  const [stages, setStages] = React.useState<WorkflowStage[]>([]);
  const [transitions, setTransitions] = React.useState<WorkflowTransition[]>([]);
  const [availableStatuses, setAvailableStatuses] = React.useState<StatusOption[]>([]);

  const seededFor = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!wf || !pid) return;
    if (seededFor.current === pid) return; // don't clobber in-progress edits
    setStyle(wf.style);
    setStages(wf.stages.map((s) => ({ ...s })));
    setTransitions(wf.transitions.map((t) => ({ ...t })));
    setAvailableStatuses(wf.available_statuses ?? []);
    seededFor.current = pid;
  }, [wf, pid]);

  React.useEffect(() => {
    // reset seed guard when switching programs
    if (seededFor.current !== pid) seededFor.current = null;
  }, [pid]);

  const saveWorkflow = useMutation({
    mutationFn: () =>
      acceleratorApi.saveWorkflow(pid as number, { style, stages, transitions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wfKey });
      toast({ title: 'Workflow saved', description: 'Stage spine and transitions updated.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Save failed', description: err?.response?.data?.error || 'Could not save workflow.', variant: 'error' });
    },
  });

  const moveStage = (idx: number, dir: -1 | 1) => {
    setStages((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const removeStage = (slug: string) => {
    setStages((prev) => prev.filter((s) => s.slug !== slug));
    setTransitions((prev) => prev.filter((t) => t.from_stage !== slug && t.to_stage !== slug));
  };

  const updateStage = (slug: string, patch: Partial<WorkflowStage>) => {
    setStages((prev) => prev.map((s) => (s.slug === slug ? { ...s, ...patch } : s)));
  };

  const unusedStatuses = availableStatuses.filter((a) => !stages.some((s) => s.slug === a.slug));

  const addStage = (slug: string) => {
    const meta = availableStatuses.find((a) => a.slug === slug);
    if (!meta) return;
    setStages((prev) => [...prev, { slug, label: meta.label, terminal: false }]);
  };

  const [transFrom, setTransFrom] = React.useState('');
  const [transTo, setTransTo] = React.useState('');
  const addTransition = () => {
    if (!transFrom || !transTo || transFrom === transTo) return;
    const exists = transitions.some((t) => t.from_stage === transFrom && t.to_stage === transTo);
    if (!exists) setTransitions((prev) => [...prev, { from_stage: transFrom, to_stage: transTo }]);
    setTransFrom('');
    setTransTo('');
  };
  const removeTransition = (idx: number) => setTransitions((prev) => prev.filter((_, i) => i !== idx));

  // ── Automations ─────────────────────────────────────────────────────────────
  const { data: automations = [] } = useQuery({
    queryKey: autoKey,
    queryFn: () => acceleratorApi.listAutomations(pid as number),
    enabled: pid != null,
  });
  const availableTriggers: TriggerOption[] = wf?.available_triggers ?? [];

  const invalidateAutomations = () => queryClient.invalidateQueries({ queryKey: autoKey });

  const createAutomation = useMutation({
    mutationFn: (payload: any) => acceleratorApi.createAutomation({ ...payload, program_id: pid as number }),
    onSuccess: () => { invalidateAutomations(); toast({ title: 'Automation created', variant: 'success' }); },
    onError: () => toast({ title: 'Create failed', variant: 'error' }),
  });

  const toggleAutomation = useMutation({
    mutationFn: (a: WorkflowAutomation) => acceleratorApi.updateAutomation(a.id, { is_active: !a.is_active }),
    onSuccess: invalidateAutomations,
  });

  const deleteAutomation = useMutation({
    mutationFn: (id: number) => acceleratorApi.deleteAutomation(id),
    onSuccess: invalidateAutomations,
  });

  const [showAutoForm, setShowAutoForm] = React.useState(false);
  const [autoName, setAutoName] = React.useState('');
  const [autoTrigger, setAutoTrigger] = React.useState('');
  const [autoActions, setAutoActions] = React.useState<AutomationAction[]>([]);
  const [actionType, setActionType] = React.useState('send_notification');
  const [actionRole, setActionRole] = React.useState('founder');
  const [actionTemplate, setActionTemplate] = React.useState('');

  const queueAction = () => {
    setAutoActions((prev) => [
      ...prev,
      { type: actionType, params: { role: actionRole, template: actionTemplate || undefined } },
    ]);
    setActionTemplate('');
  };
  const resetAutoForm = () => {
    setAutoName(''); setAutoTrigger(''); setAutoActions([]); setShowAutoForm(false);
  };
  const submitAutomation = () => {
    if (!autoName || !autoTrigger) {
      toast({ title: 'Name and trigger are required', variant: 'error' });
      return;
    }
    createAutomation.mutate({ name: autoName, trigger_event: autoTrigger, actions: autoActions, is_active: true, order: automations.length + 1 });
    resetAutoForm();
  };

  if (pid == null) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-8 text-center">
        <p className="text-sm text-white/60">Select a program to configure its workflow.</p>
      </div>
    );
  }

  const stageLabel = (slug: string) => stages.find((s) => s.slug === slug)?.label || slug;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-white/10 pb-4">
        <span className="rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
          Program OS · Workflow
        </span>
        <h2 className="text-xl font-bold text-white flex items-center gap-2 mt-1">
          <Workflow className="h-5 w-5 text-indigo-400" />
          Workflow Builder
        </h2>
        <p className="text-xs text-white/50 mt-1">
          Define the {activeProgram?.name ?? 'program'} stage spine, allowed transitions, and trigger-based automations.
          Stages are constrained to valid application lifecycle states.
        </p>
      </div>

      {wfLoading ? (
        <div className="flex items-center gap-2 text-xs text-white/50 py-10">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading workflow…
        </div>
      ) : (
        <>
          {/* Style */}
          <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-5">
            <label className="text-[11px] font-bold text-white/70 uppercase tracking-wider">Workflow style</label>
            <select value={style} onChange={(e) => setStyle(e.target.value)} className={inputCls + ' mt-2 max-w-xs'}>
              <option value="yc_style">YC-Style (fast, same-day decision)</option>
              <option value="techstars_style">Techstars-Style (multi-stage committee)</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {/* Stages */}
          <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Stage spine</h4>
              <span className="text-[11px] text-white/40">{stages.length} stages</span>
            </div>

            <div className="space-y-2">
              {stages.map((stage, idx) => (
                <div key={stage.slug} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                  <span className="text-[10px] font-mono text-indigo-400 font-bold w-6">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <input
                    value={stage.label ?? stage.slug}
                    onChange={(e) => updateStage(stage.slug, { label: e.target.value })}
                    className={inputCls + ' flex-1'}
                  />
                  <span className="text-[10px] font-mono text-white/40 shrink-0">{stage.slug}</span>
                  <label className="flex items-center gap-1.5 text-[10px] text-white/50 shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!stage.terminal}
                      onChange={(e) => updateStage(stage.slug, { terminal: e.target.checked })}
                      className="accent-indigo-500"
                    />
                    terminal
                  </label>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => moveStage(idx, -1)} disabled={idx === 0}
                      className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/5 disabled:opacity-25">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => moveStage(idx, 1)} disabled={idx === stages.length - 1}
                      className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/5 disabled:opacity-25">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => removeStage(stage.slug)}
                      className="p-1.5 rounded-md text-white/50 hover:text-rose-400 hover:bg-rose-500/10">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {stages.length === 0 && (
                <p className="text-[11px] text-white/40 italic">No stages yet — add one below.</p>
              )}
            </div>

            {unusedStatuses.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
                <span className="text-[11px] text-white/40">Add stage:</span>
                {unusedStatuses.map((s) => (
                  <button key={s.slug} onClick={() => addStage(s.slug)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70 hover:border-indigo-500/50 hover:text-white transition">
                    <Plus className="h-3 w-3" /> {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Transitions */}
          <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-4">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Allowed transitions</h4>

            {transitions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {transitions.map((t, idx) => (
                  <span key={idx} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-[11px] text-white/80">
                    {stageLabel(t.from_stage)}
                    <span className="text-indigo-400">→</span>
                    {stageLabel(t.to_stage)}
                    <button onClick={() => removeTransition(idx)} className="text-white/30 hover:text-rose-400">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-white/40 italic">No explicit transitions defined — any forward movement is permitted.</p>
            )}

            {stages.length >= 2 && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
                <select value={transFrom} onChange={(e) => setTransFrom(e.target.value)} className={inputCls + ' max-w-[10rem]'}>
                  <option value="">From…</option>
                  {stages.map((s) => <option key={s.slug} value={s.slug}>{s.label || s.slug}</option>)}
                </select>
                <span className="text-white/30 text-xs">→</span>
                <select value={transTo} onChange={(e) => setTransTo(e.target.value)} className={inputCls + ' max-w-[10rem]'}>
                  <option value="">To…</option>
                  {stages.map((s) => <option key={s.slug} value={s.slug}>{s.label || s.slug}</option>)}
                </select>
                <Button onClick={addTransition} size="sm" variant="secondary"
                  className="bg-white/10 hover:bg-white/15 text-white text-xs">
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
            )}
          </div>

          {/* Save */}
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0F1623] px-6 py-4">
            <span className="text-[11px] text-white/40">Stage changes log to the immutable audit trail on transition.</span>
            <Button
              onClick={() => saveWorkflow.mutate()}
              disabled={saveWorkflow.isPending}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 flex items-center gap-2"
            >
              {saveWorkflow.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saveWorkflow.isPending ? 'Saving…' : 'Save Workflow'}
            </Button>
          </div>

          {/* Automations */}
          <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-400" /> Workflow automations
                </h4>
                <p className="text-[11px] text-white/40 mt-1">
                  Trigger-based rules. Actions are evaluated and logged as queued intents — the Communications OS performs delivery.
                </p>
              </div>
              <Button onClick={() => setShowAutoForm((v) => !v)} size="sm" variant="secondary"
                className="bg-white/10 hover:bg-white/15 text-white text-xs">
                <Boxes className="h-3.5 w-3.5" /> {showAutoForm ? 'Close' : 'New automation'}
              </Button>
            </div>

            {showAutoForm && (
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4 space-y-3">
                <input value={autoName} onChange={(e) => setAutoName(e.target.value)}
                  placeholder="Automation name" className={inputCls} />
                <select value={autoTrigger} onChange={(e) => setAutoTrigger(e.target.value)} className={inputCls}>
                  <option value="">Select trigger event…</option>
                  {availableTriggers.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>

                <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
                  <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Actions</p>
                  {autoActions.map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px] text-white/70">
                      <span>{a.type}{a.params?.role ? ` · ${a.params.role}` : ''}{a.params?.template ? ` · ${a.params.template}` : ''}</span>
                      <button onClick={() => setAutoActions((p) => p.filter((_, j) => j !== i))}
                        className="text-white/30 hover:text-rose-400"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <select value={actionType} onChange={(e) => setActionType(e.target.value)} className={inputCls + ' max-w-[9rem]'}>
                      <option value="send_notification">Notification</option>
                      <option value="assign_reviewer">Assign reviewer</option>
                      <option value="request_evidence">Request evidence</option>
                      <option value="create_task">Create task</option>
                    </select>
                    <select value={actionRole} onChange={(e) => setActionRole(e.target.value)} className={inputCls + ' max-w-[8rem]'}>
                      <option value="founder">Founder</option>
                      <option value="reviewer">Reviewer</option>
                      <option value="director">Director</option>
                      <option value="committee">Committee</option>
                      <option value="mentor">Mentor</option>
                    </select>
                    <input value={actionTemplate} onChange={(e) => setActionTemplate(e.target.value)}
                      placeholder="template (optional)" className={inputCls + ' flex-1 min-w-[8rem]'} />
                    <Button onClick={queueAction} size="sm" variant="secondary" className="bg-white/10 text-white text-xs">
                      <Plus className="h-3 w-3" /> Add action
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button onClick={resetAutoForm} size="sm" variant="ghost" className="text-white/60 text-xs">Cancel</Button>
                  <Button onClick={submitAutomation} size="sm" disabled={createAutomation.isPending}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs">
                    {createAutomation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Create
                  </Button>
                </div>
              </div>
            )}

            {automations.length === 0 ? (
              <p className="text-[11px] text-white/40 italic">No automations yet. These fire when a matching lifecycle event occurs.</p>
            ) : (
              <div className="space-y-2">
                {automations.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{a.name}</p>
                      <p className="text-[10px] text-white/40 truncate">
                        on {a.trigger_event_display || a.trigger_event} · {(a.actions?.length ?? 0)} action(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => toggleAutomation.mutate(a)}
                        className="p-1.5 rounded-md text-white/60 hover:text-white" title={a.is_active ? 'Disable' : 'Enable'}>
                        {a.is_active ? <ToggleRight className="h-5 w-5 text-emerald-400" /> : <ToggleLeft className="h-5 w-5" />}
                      </button>
                      <button onClick={() => deleteAutomation.mutate(a.id)}
                        className="p-1.5 rounded-md text-white/50 hover:text-rose-400 hover:bg-rose-500/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
