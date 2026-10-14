'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Brain, CheckCircle2, XCircle, Save, Scale, Database, Sparkles, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import { acceleratorApi } from '@/lib/acceleratorApi';

interface IntelligenceEngine {
  id: string;
  name: string;
  type: string;
  desc: string;
  enabled: boolean;
  badge: string;
}

// Static engine taxonomy (architecture documentation). The `enabled` flags are
// defaults only — real state is seeded from and persisted to module_config.
const ENGINE_TAXONOMY: IntelligenceEngine[] = [
  {
    id: 'rules',
    name: 'Deterministic Rules Engine',
    type: 'Rules',
    desc: 'Enforces hard policy gates: incorporation checks, geographic mandates, conflict disclosures, and stage rules.',
    enabled: true,
    badge: 'Zero-Tolerance',
  },
  {
    id: 'statistical',
    name: 'Statistical Calibration Engine',
    type: 'Statistics',
    desc: 'Calculates inter-reviewer variance, normalizes scoring tendencies (lenient vs. strict), and flags distribution shifts.',
    enabled: true,
    badge: 'Gaussian Normalization',
  },
  {
    id: 'ml',
    name: 'Machine Learning Baseline Models',
    type: 'ML',
    desc: 'Extracts 6-dimensional predictive baseline scores from founder responses, traction metrics, and unit economics.',
    enabled: true,
    badge: 'Ensemble baseline',
  },
  {
    id: 'graph',
    name: 'Graph & Conflict Intelligence',
    type: 'Graph',
    desc: 'Maps reviewer-founder co-investments, prior advisory relationships, and competitive portfolio overlap.',
    enabled: true,
    badge: 'Entity Resolution',
  },
  {
    id: 'external',
    name: 'External Market & Registry Telemetry',
    type: 'External',
    desc: 'Probes live website heartbeat, patent filings, corporate registry verification, and Crunchbase funding signals.',
    enabled: true,
    badge: 'Live Probes',
  },
  {
    id: 'llm',
    name: 'Structured Narrative & Claim Extraction',
    type: 'LLM Reasoning',
    desc: 'Synthesizes qualitative answers, decomposes pitch claims into verifiable entities, and summarizes discrepancies.',
    enabled: false,
    badge: 'Optional Reasoning',
  },
];

const MEMORY_TYPES: Array<{ value: string; label: string }> = [
  { value: 'selection_insight', label: 'Selection Insight' },
  { value: 'cohort_insight', label: 'Cohort Insight' },
  { value: 'mentor_insight', label: 'Mentor Insight' },
  { value: 'outcome_pattern', label: 'Outcome Pattern' },
  { value: 'risk_pattern', label: 'Risk Pattern' },
  { value: 'intervention_outcome', label: 'Intervention Outcome' },
  { value: 'curriculum_feedback', label: 'Curriculum Feedback' },
  { value: 'process_improvement', label: 'Process Improvement' },
];

interface ProgramMemoryItem {
  id: number;
  memory_type: string;
  memory_type_display?: string;
  title: string;
  description?: string;
  confidence?: number;
  is_actionable?: boolean;
  created_at?: string;
}

interface DashboardWidgetItem {
  id: number;
  role?: string;
  widgets?: unknown[];
  updated_at?: string;
}

const inputCls =
  'w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-xs text-white ' +
  'placeholder-white/30 focus:outline-none focus:border-indigo-500/60 transition';

export function IntelligenceSettings() {
  const { activeProgramId } = useActiveProgram();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const pid = activeProgramId ?? null;
  const programKey = ['accelerator-program-detail', pid] as const;
  const memoryKey = ['accelerator-program-memory', pid] as const;
  const widgetsKey = ['accelerator-dashboard-widgets', pid] as const;

  // Program detail carries module_config (intelligence toggles).
  const { data: program, isLoading: programLoading } = useQuery({
    queryKey: programKey,
    queryFn: () => acceleratorApi.getProgram(pid as number),
    enabled: pid != null,
  });

  const [intelEnabled, setIntelEnabled] = React.useState(true);
  const [analysisTrigger, setAnalysisTrigger] = React.useState<'manual' | 'automatic' | 'off'>('manual');
  const [humanReviewMandatory, setHumanReviewMandatory] = React.useState(true);
  const [requireExplanation, setRequireExplanation] = React.useState(true);
  const [engines, setEngines] = React.useState<IntelligenceEngine[]>(ENGINE_TAXONOMY.map((e) => ({ ...e })));

  const seededFor = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!program || !pid) return;
    if (seededFor.current === pid) return; // don't clobber in-progress edits
    const moduleCfg = ((program as any).module_config ?? {}) as Record<string, any>;
    const intel = (moduleCfg.intelligence ?? {}) as Record<string, any>;
    const engineState = (intel.engines ?? {}) as Record<string, boolean>;
    setIntelEnabled(typeof intel.enabled === 'boolean' ? intel.enabled : true);
    setAnalysisTrigger(
      intel.analysis_trigger === 'automatic' || intel.analysis_trigger === 'off'
        ? intel.analysis_trigger
        : 'manual'
    );
    setHumanReviewMandatory(intel.human_review_mandatory !== false);
    setRequireExplanation(intel.require_explanation !== false);
    setEngines(ENGINE_TAXONOMY.map((e) => ({
      ...e,
      enabled: typeof engineState[e.id] === 'boolean' ? engineState[e.id] : e.enabled,
    })));
    seededFor.current = pid;
  }, [program, pid]);

  React.useEffect(() => {
    // reset seed guard when switching programs
    if (seededFor.current !== pid) seededFor.current = null;
  }, [pid]);

  const saveIntel = useMutation({
    mutationFn: () => {
      const moduleCfg = ((program as any)?.module_config ?? {}) as Record<string, any>;
      const engineState: Record<string, boolean> = {};
      engines.forEach((e) => { engineState[e.id] = e.enabled; });
      return acceleratorApi.updateProgram(pid as number, {
        module_config: {
          ...moduleCfg,
          intelligence: {
            enabled: intelEnabled,
            analysis_trigger: analysisTrigger,
            human_review_mandatory: humanReviewMandatory,
            require_explanation: requireExplanation,
            engines: engineState,
          },
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: programKey });
      queryClient.invalidateQueries({ queryKey: ['accelerator-programs'] });
      toast({
        title: 'Intelligence Governance Saved',
        description: 'Analytical engine toggles and guardrails persisted for this program.',
        variant: 'success',
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Save failed',
        description: err?.response?.data?.error || 'Could not save intelligence configuration.',
        variant: 'error',
      });
    },
  });

  // ── Program memory & saved dashboard layouts ────────────────────────────────
  const { data: memoryEntries = [], isLoading: memoryLoading } = useQuery({
    queryKey: memoryKey,
    queryFn: () => acceleratorApi.osList<ProgramMemoryItem>('program-memory', pid as number),
    enabled: pid != null,
  });
  const { data: widgetConfigs = [] } = useQuery({
    queryKey: widgetsKey,
    queryFn: () => acceleratorApi.osList<DashboardWidgetItem>('dashboard-widgets', pid as number),
    enabled: pid != null,
  });

  const [memTitle, setMemTitle] = React.useState('');
  const [memType, setMemType] = React.useState('selection_insight');
  const [memDesc, setMemDesc] = React.useState('');

  const createMemory = useMutation({
    mutationFn: () =>
      acceleratorApi.osCreate<ProgramMemoryItem>('program-memory', {
        program_id: pid as number,
        memory_type: memType,
        title: memTitle,
        description: memDesc,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memoryKey });
      setMemTitle('');
      setMemDesc('');
      toast({ title: 'Memory entry recorded', variant: 'success' });
    },
    onError: (err: any) => {
      toast({
        title: 'Create failed',
        description: err?.response?.data?.error || 'Could not record memory entry.',
        variant: 'error',
      });
    },
  });

  const deleteMemory = useMutation({
    mutationFn: (id: number) => acceleratorApi.osDelete('program-memory', id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memoryKey });
      toast({ title: 'Memory entry deleted' });
    },
    onError: () => toast({ title: 'Delete failed', variant: 'error' }),
  });

  const submitMemory = () => {
    if (!memTitle.trim()) {
      toast({ title: 'Title is required', variant: 'error' });
      return;
    }
    createMemory.mutate();
  };

  const handleToggleEngine = (id: string) => {
    setEngines(engines.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e)));
  };

  if (pid == null) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-8 text-center">
        <p className="text-sm text-white/60">Select a program to configure its intelligence layer.</p>
      </div>
    );
  }

  if (programLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-white/50 py-10">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading intelligence configuration…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-white/10 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            Intelligence · Governance &amp; Engines
          </span>
        </div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Brain className="h-5 w-5 text-indigo-400" />
          Intelligence Configuration &amp; Governance Guardrails
        </h2>
        <p className="text-xs text-white/50 mt-1">
          Pitchmic provides explainable baseline intelligence to assist human reviewers. ML never replaces human discretion and is strictly forbidden from unilateral admissions actions.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-6 shadow-xl">
        {/* Core Toggle & Trigger Mode */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <h4 className="text-sm font-bold text-white">Pitchmic Intelligence Platform</h4>
            <p className="text-xs text-white/40 mt-0.5">
              Activates automated claim extraction, dimensional baselines, and cross-reviewer variance detection.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={intelEnabled}
              onChange={(e) => setIntelEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        {/* Execution Mode */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-white uppercase tracking-wider block">
            Intelligence Analysis Trigger Mode
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                id: 'manual',
                title: 'Reviewer Manual Batch Trigger',
                desc: 'Reviewer selects candidates in queue and explicitly clicks [Run Intelligence Analysis]. Recommended.',
              },
              {
                id: 'automatic',
                title: 'Automatic on Intake Submission',
                desc: 'Runs background analysis immediately upon candidate form submission.',
              },
              {
                id: 'off',
                title: 'Engine Paused',
                desc: 'No automated scoring or signal extraction executed.',
              },
            ].map((mode) => (
              <div
                key={mode.id}
                onClick={() => setAnalysisTrigger(mode.id as any)}
                className={`p-4 rounded-xl border transition cursor-pointer ${
                  analysisTrigger === mode.id
                    ? 'border-indigo-500 bg-indigo-950/20 shadow-md shadow-indigo-500/10'
                    : 'border-white/10 bg-black/20 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white">{mode.title}</span>
                  {analysisTrigger === mode.id && <CheckCircle2 className="h-4 w-4 text-indigo-400" />}
                </div>
                <p className="text-[11px] text-white/50 leading-relaxed">{mode.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Section 10: Strict Governance Guardrails */}
        <div className="border-t border-white/10 pt-5 space-y-4">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-indigo-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Institutional Governance &amp; Ethical Guardrails
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Permitted Actions */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2.5">
              <h5 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> ML Capabilities (Permitted)
              </h5>
              <div className="space-y-1.5 text-xs text-white/80">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span>Inform human reviewers with independent dimension baselines</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span>Recommend triage screening priority (Tiers A, B, C, D)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span>Flag discrepancies between declared claims &amp; verified files</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span>Highlight score divergences exceeding ±10pt threshold</span>
                </div>
              </div>
            </div>

            {/* Prohibited Actions */}
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-2.5">
              <h5 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                <XCircle className="h-4 w-4" /> ML Prohibitions (Hard Guardrails)
              </h5>
              <div className="space-y-1.5 text-xs text-white/80">
                <div className="flex items-center gap-2">
                  <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                  <span>ML may <strong>NOT</strong> automatically reject an application</span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                  <span>ML may <strong>NOT</strong> automatically accept an application</span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                  <span>ML may <strong>NOT</strong> finalize committee selection decisions</span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                  <span>ML may <strong>NOT</strong> silently overwrite human score adjustments</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-white">Human Review Mandatory Before Selection Committee</p>
                <p className="text-[11px] text-white/40 mt-0.5">
                  Precludes any candidate from advancing to selection committee without completed human reviewer sign-off.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={humanReviewMandatory}
                  onChange={(e) => setHumanReviewMandatory(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between border-t border-white/5 pt-3">
              <div>
                <p className="text-xs font-bold text-white">Require Auditable Explanation For Every Score Variance</p>
                <p className="text-[11px] text-white/40 mt-0.5">
                  Forces human reviewers to document qualitative rationale whenever their evaluation differs significantly from baseline signals.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireExplanation}
                  onChange={(e) => setRequireExplanation(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Section 9: Explicit Architectural Engine Taxonomy */}
        <div className="border-t border-white/10 pt-5 space-y-3">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
            Analytical Engine Architecture &amp; Taxonomy
          </h4>
          <div className="space-y-2">
            {engines.map((eng) => (
              <div
                key={eng.id}
                className="p-3.5 rounded-xl border border-white/10 bg-black/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{eng.name}</span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/60 border border-white/10">
                      {eng.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/50">{eng.desc}</p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={eng.enabled}
                    onChange={() => handleToggleEngine(eng.id)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-white/10 pt-4 flex items-center justify-between">
          <span className="text-[11px] text-white/40">
            Model versions are recorded per review in the database.
          </span>
          <Button
            onClick={() => saveIntel.mutate()}
            disabled={saveIntel.isPending}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 flex items-center gap-2"
          >
            {saveIntel.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>{saveIntel.isPending ? 'Saving...' : 'Save Intelligence Governance'}</span>
          </Button>
        </div>
      </div>

      {/* Program Memory & Learnings */}
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-indigo-400" /> Program Memory &amp; Learnings
            </h4>
            <p className="text-[11px] text-white/40 mt-1">
              Durable insights captured across cycles to inform future selection and delivery decisions.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              value={memTitle}
              onChange={(e) => setMemTitle(e.target.value)}
              placeholder="Insight title"
              className={inputCls}
            />
            <select value={memType} onChange={(e) => setMemType(e.target.value)} className={inputCls}>
              {MEMORY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <div className="flex items-center">
              <Button
                onClick={submitMemory}
                disabled={createMemory.isPending}
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs w-full"
              >
                {createMemory.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Record insight
              </Button>
            </div>
          </div>
          <textarea
            value={memDesc}
            onChange={(e) => setMemDesc(e.target.value)}
            placeholder="What did this program learn? (evidence-backed observation)"
            rows={2}
            className={inputCls + ' resize-none'}
          />
        </div>

        {memoryLoading ? (
          <div className="flex items-center gap-2 text-xs text-white/50 py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading memory entries…
          </div>
        ) : memoryEntries.length === 0 ? (
          <p className="text-[11px] text-white/40 italic">No memory entries recorded for this program yet.</p>
        ) : (
          <div className="space-y-2">
            {memoryEntries.map((m) => (
              <div key={m.id} className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{m.title}</p>
                  {m.description && (
                    <p className="text-[11px] text-white/50 line-clamp-2">{m.description}</p>
                  )}
                  <p className="text-[10px] text-white/40 mt-1">
                    {m.memory_type_display || m.memory_type}
                    {typeof m.confidence === 'number' ? ` · confidence ${(m.confidence * 100).toFixed(0)}%` : ''}
                  </p>
                </div>
                <button
                  onClick={() => deleteMemory.mutate(m.id)}
                  className="p-1.5 rounded-md text-white/50 hover:text-rose-400 hover:bg-rose-500/10 shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Saved Dashboard Layouts */}
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-4 shadow-xl">
        <div>
          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" /> Saved Dashboard Widget Layouts
          </h4>
          <p className="text-[11px] text-white/40 mt-1">
            Per-role workspace layouts configured by program members.
          </p>
        </div>
        {widgetConfigs.length === 0 ? (
          <p className="text-[11px] text-white/40 italic">No saved dashboard widget configurations yet.</p>
        ) : (
          <div className="space-y-2">
            {widgetConfigs.map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-bold text-white truncate">{w.role || 'default'}</p>
                <span className="text-[10px] text-white/40 shrink-0">{w.widgets?.length ?? 0} widget(s)</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
