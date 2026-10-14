'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sliders, Save, FileCheck, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import { acceleratorApi } from '@/lib/acceleratorApi';

interface ApplicationFormItem {
  id: number;
  name: string;
  form_type?: string;
  version?: number;
  status?: string;
  question_count?: number;
}

const statusBadgeCls = (status: string) => {
  if (status === 'published') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  if (status === 'archived') return 'bg-white/5 text-white/40 border-white/10';
  return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
};

export function ApplicationDefaultsSettings() {
  const { activeProgramId } = useActiveProgram();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const pid = activeProgramId ?? null;
  const programKey = ['accelerator-program-detail', pid] as const;
  const formsKey = ['accelerator-forms', pid] as const;

  // Program detail carries question_config (intake defaults live under intake_defaults).
  const { data: program, isLoading: programLoading } = useQuery({
    queryKey: programKey,
    queryFn: () => acceleratorApi.getProgram(pid as number),
    enabled: pid != null,
  });

  const [appMode, setAppMode] = React.useState<'fixed' | 'rolling' | 'rolling_cohort' | 'rolling_monthly'>('rolling');
  const [reviewRounds, setReviewRounds] = React.useState(2);
  const [reviewersCount, setReviewersCount] = React.useState(3);
  const [retentionYears, setRetentionYears] = React.useState(7);
  const [duplicateDetection, setDuplicateDetection] = React.useState(true);
  const [applicationVersioning, setApplicationVersioning] = React.useState(true);
  const [editWindowHours, setEditWindowHours] = React.useState(24);

  const seededFor = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!program || !pid) return;
    if (seededFor.current === pid) return; // don't clobber in-progress edits
    const qc = ((program as any).question_config ?? {}) as Record<string, any>;
    const d = (qc.intake_defaults ?? {}) as Record<string, any>;
    if (
      d.mode === 'fixed' || d.mode === 'rolling' ||
      d.mode === 'rolling_cohort' || d.mode === 'rolling_monthly'
    ) {
      setAppMode(d.mode);
    }
    if (d.review_rounds != null) setReviewRounds(Number(d.review_rounds) || 1);
    if (d.min_reviewers != null) setReviewersCount(Number(d.min_reviewers) || 1);
    if (d.retention_years != null) setRetentionYears(Number(d.retention_years) || 0);
    if (d.edit_window_hours != null) setEditWindowHours(Number(d.edit_window_hours) || 0);
    if (typeof d.duplicate_detection === 'boolean') setDuplicateDetection(d.duplicate_detection);
    if (typeof d.version_snapshots === 'boolean') setApplicationVersioning(d.version_snapshots);
    seededFor.current = pid;
  }, [program, pid]);

  React.useEffect(() => {
    // reset seed guard when switching programs
    if (seededFor.current !== pid) seededFor.current = null;
  }, [pid]);

  const saveDefaults = useMutation({
    mutationFn: () => {
      const qc = ((program as any)?.question_config ?? {}) as Record<string, any>;
      return acceleratorApi.updateProgram(pid as number, {
        question_config: {
          ...qc,
          intake_defaults: {
            mode: appMode,
            review_rounds: reviewRounds,
            min_reviewers: reviewersCount,
            retention_years: retentionYears,
            edit_window_hours: editWindowHours,
            duplicate_detection: duplicateDetection,
            version_snapshots: applicationVersioning,
          },
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: programKey });
      queryClient.invalidateQueries({ queryKey: ['accelerator-programs'] });
      toast({
        title: 'Application Defaults Saved',
        description: 'Intake defaults persisted for this program.',
        variant: 'success',
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Save failed',
        description: err?.response?.data?.error || 'Could not save application defaults.',
        variant: 'error',
      });
    },
  });

  // ── Application forms for this program ──────────────────────────────────────
  const { data: forms = [], isLoading: formsLoading } = useQuery({
    queryKey: formsKey,
    queryFn: () => acceleratorApi.osList<ApplicationFormItem>('forms', pid as number),
    enabled: pid != null,
  });

  const invalidateForms = () => queryClient.invalidateQueries({ queryKey: formsKey });

  const publishForm = useMutation({
    mutationFn: (id: number) => acceleratorApi.publishForm(id),
    onSuccess: () => {
      invalidateForms();
      toast({ title: 'Form published', description: 'The form is now live for founder submissions.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Publish failed', description: err?.response?.data?.error || 'Could not publish form.', variant: 'error' });
    },
  });

  const newFormVersion = useMutation({
    mutationFn: (id: number) => acceleratorApi.newFormVersion(id),
    onSuccess: () => {
      invalidateForms();
      toast({ title: 'Draft version created', description: 'A new editable version was forked from the published form.', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Versioning failed', description: err?.response?.data?.error || 'Could not create a new form version.', variant: 'error' });
    },
  });

  if (pid == null) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-8 text-center">
        <p className="text-sm text-white/60">Select a program to configure its application defaults.</p>
      </div>
    );
  }

  if (programLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-white/50 py-10">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading application defaults…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-white/10 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            Programs · Global Intake Defaults
          </span>
        </div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Sliders className="h-5 w-5 text-indigo-400" />
          Application &amp; Intake Defaults
        </h2>
        <p className="text-xs text-white/50 mt-1">
          Establish program-level baseline defaults for application cycles. Individual cycles can override these parameters when needed.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-6 shadow-xl">
        {/* Intake Mode */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-white uppercase tracking-wider block">
            Default Application Intake Mode
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                id: 'rolling',
                title: 'Rolling Window (Continuous)',
                desc: 'Candidates are screened and reviewed continuously as submitted.',
              },
              {
                id: 'fixed',
                title: 'Fixed Cohort Deadline',
                desc: 'Batch-style admissions with a strict cut-off deadline date.',
              },
              {
                id: 'rolling_cohort',
                title: 'Rolling + Cohort Assignment',
                desc: 'Continuous intake automatically mapped to upcoming quarterly batches.',
              },
              {
                id: 'rolling_monthly',
                title: 'Rolling + Monthly Selection',
                desc: 'Admissions committee deliberates on the 1st of each month.',
              },
            ].map((mode) => (
              <label
                key={mode.id}
                onClick={() => setAppMode(mode.id as any)}
                className={`p-4 rounded-xl border transition cursor-pointer flex items-start gap-3 ${
                  appMode === mode.id
                    ? 'border-indigo-500 bg-indigo-950/20 shadow-md shadow-indigo-500/10'
                    : 'border-white/10 bg-black/20 hover:border-white/20'
                }`}
              >
                <input
                  type="radio"
                  name="appMode"
                  checked={appMode === mode.id}
                  onChange={() => {}}
                  className="mt-1 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="text-xs font-bold text-white">{mode.title}</div>
                  <div className="text-[11px] text-white/50 mt-0.5 leading-relaxed">{mode.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Review Requirements */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-white/10 pt-5">
          <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-2">
            <label className="text-xs font-semibold text-white/70 block">Review Rounds Required</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={5}
                value={reviewRounds}
                onChange={(e) => setReviewRounds(parseInt(e.target.value) || 1)}
                className="w-20 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white focus:outline-none"
              />
              <span className="text-xs text-white/40">rounds</span>
            </div>
            <p className="text-[10px] text-white/40">e.g. Screening round + Partner consensus round.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-2">
            <label className="text-xs font-semibold text-white/70 block">Min Reviewers Per Candidate</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={10}
                value={reviewersCount}
                onChange={(e) => setReviewersCount(parseInt(e.target.value) || 1)}
                className="w-20 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white focus:outline-none"
              />
              <span className="text-xs text-white/40">reviewers</span>
            </div>
            <p className="text-[10px] text-white/40">Guarantees quorum before IC committee deliberation.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-2">
            <label className="text-xs font-semibold text-white/70 block">Founder Post-Submit Edit Window</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={168}
                value={editWindowHours}
                onChange={(e) => setEditWindowHours(parseInt(e.target.value) || 0)}
                className="w-20 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white focus:outline-none"
              />
              <span className="text-xs text-white/40">hours</span>
            </div>
            <p className="text-[10px] text-white/40">Allow founder edits before candidate dossier is locked.</p>
          </div>
        </div>

        {/* Data Governance & Deduplication */}
        <div className="border-t border-white/10 pt-5 space-y-4">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Intake Integrity &amp; Versioning</h4>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-white">Cross-Cycle Duplicate Detection</p>
                <p className="text-[11px] text-white/40 mt-0.5">
                  Flags re-applicants using canonical founder email, company domain, and corporate registration fingerprints.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={duplicateDetection}
                  onChange={(e) => setDuplicateDetection(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between border-t border-white/5 pt-3">
              <div>
                <p className="text-xs font-bold text-white">Immutable Application Version Snapshots</p>
                <p className="text-[11px] text-white/40 mt-0.5">
                  Archives every document re-upload, founder edit, and evidence response with before/after diffs.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={applicationVersioning}
                  onChange={(e) => setApplicationVersioning(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 pt-4 flex items-center justify-between">
          <span className="text-[11px] text-white/40">
            Existing active cycles will continue with their current rules.
          </span>
          <Button
            onClick={() => saveDefaults.mutate()}
            disabled={saveDefaults.isPending}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 flex items-center gap-2"
          >
            {saveDefaults.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>{saveDefaults.isPending ? 'Saving...' : 'Save Defaults'}</span>
          </Button>
        </div>
      </div>

      {/* Program Application Forms */}
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-4 shadow-xl">
        <div>
          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <FileCheck className="h-3.5 w-3.5 text-indigo-400" /> Program Application Forms
          </h4>
          <p className="text-[11px] text-white/40 mt-1">
            Form definitions that drive founder intake for this program. Publish drafts to open them for submissions, or fork a new draft version from a published form.
          </p>
        </div>

        {formsLoading ? (
          <div className="flex items-center gap-2 text-xs text-white/50 py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading forms…
          </div>
        ) : forms.length === 0 ? (
          <p className="text-[11px] text-white/40 italic">No application forms exist for this program yet.</p>
        ) : (
          <div className="space-y-2">
            {forms.map((f) => {
              const st = f.status || 'draft';
              return (
                <div key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{f.name}</p>
                    <p className="text-[10px] text-white/40 truncate">
                      {f.form_type || 'application'} · v{f.version ?? 1} · {f.question_count ?? 0} question(s)
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg border ${statusBadgeCls(st)}`}>
                      {st}
                    </span>
                    {st === 'draft' && (
                      <Button
                        onClick={() => publishForm.mutate(f.id)}
                        disabled={publishForm.isPending}
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs"
                      >
                        {publishForm.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCheck className="h-3.5 w-3.5" />}
                        Publish
                      </Button>
                    )}
                    {st === 'published' && (
                      <Button
                        onClick={() => newFormVersion.mutate(f.id)}
                        disabled={newFormVersion.isPending}
                        size="sm"
                        variant="secondary"
                        className="bg-white/10 hover:bg-white/15 text-white text-xs"
                      >
                        {newFormVersion.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        New version
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
