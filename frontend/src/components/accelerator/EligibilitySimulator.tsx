'use client';

import * as React from 'react';
import { Compass, Sparkles, CheckCircle2, XCircle, HelpCircle, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import type { EligibilityCheckRequest, EligibilityResult } from '@/lib/acceleratorApi';

/**
 * Rule preview bench for a program's eligibility hard-gates. It holds no
 * scoring logic: every verdict on screen is the server's
 * /accelerator/programs/<id>/check-eligibility/ response, i.e. the same engine
 * (apps.accelerator.eligibility) that scores a founder's real application and
 * the one the founder self-check uses. Nothing here decides admission — it shows
 * what the SAVED rules would do to a hypothetical applicant.
 */

export const EMPTY_FACTS: EligibilityCheckRequest = {
  country: 'NG',
  stage: 'pre_seed',
  sector: '',
  incorporated: false,
  full_time: true,
  total_funding_raised_usd: 0,
  team_size: 2,
};

interface EligibilitySimulatorProps {
  facts: EligibilityCheckRequest;
  onFactsChange: (next: EligibilityCheckRequest) => void;
  result: EligibilityResult | undefined;
  isRunning: boolean;
  error: string | null;
  onRun: () => void;
  /** The engine reads the program row, so unsaved rule edits are not scored. */
  unsavedChanges: boolean;
  /** Sector whitelist as currently saved, used for the match hints. */
  sectorWhitelist: string[];
}

// ── Verdict config ────────────────────────────────────────────────────────────
const verdictConfig: Record<
  string,
  { label: string; badge: string; icon: React.ReactNode }
> = {
  highly_eligible: {
    label: 'PASSES EVERY GATE',
    badge: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  review_needed: {
    label: 'NEEDS VERIFICATION',
    badge: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  ineligible: {
    label: 'FAILS A HARD GATE',
    badge: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
};

// ── Requirement status config ─────────────────────────────────────────────────
function requirementStyle(status: string) {
  switch (status) {
    case 'satisfied':
      return {
        row: 'bg-emerald-950/10 border-emerald-500/20',
        badge: 'bg-emerald-500/20 text-emerald-400',
        icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
      };
    case 'uncertain':
      return {
        row: 'bg-amber-950/10 border-amber-500/20',
        badge: 'bg-amber-500/20 text-amber-400',
        icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
      };
    case 'requires_evidence':
      return {
        row: 'bg-blue-950/10 border-blue-500/20',
        badge: 'bg-blue-500/20 text-blue-400',
        icon: <HelpCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />,
      };
    case 'failed':
      // Previously fell through to blue — now correctly styled as a disqualifier
      return {
        row: 'bg-rose-950/20 border-rose-500/30',
        badge: 'bg-rose-500/20 text-rose-400',
        icon: <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />,
      };
    default:
      return {
        row: 'bg-neutral-900 border-neutral-800',
        badge: 'bg-neutral-700/50 text-neutral-400',
        icon: <Info className="w-3.5 h-3.5 text-neutral-500 shrink-0" />,
      };
  }
}

export function EligibilitySimulator({
  facts,
  onFactsChange,
  result,
  isRunning,
  error,
  onRun,
  unsavedChanges,
  sectorWhitelist,
}: EligibilitySimulatorProps) {
  const [showSectorHints, setShowSectorHints] = React.useState(false);
  const set = (patch: Partial<EligibilityCheckRequest>) => onFactsChange({ ...facts, ...patch });

  const verdict = result ? (verdictConfig[result.verdict] ?? verdictConfig['review_needed']) : null;

  const hasFailedRequirement = result?.breakdown.some((r) => r.status === 'failed');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Compass className="w-5 h-5 text-indigo-400" />
          Rule Preview
        </h2>
        <p className="text-xs text-neutral-400 mt-1">
          Describe a hypothetical applicant and run it through the same eligibility engine that scores real
          applications — no scoring logic lives here, every verdict is returned by the server.
        </p>
      </div>

      {unsavedChanges && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-200/90">
            You have unsaved rule edits. The server scores the program&apos;s <strong>saved</strong> rules, so this
            preview does not reflect them — save the rules above first.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── Simulator controls ───────────────────────────────────────────── */}
        <Card className="lg:col-span-5 bg-neutral-900/70 border-neutral-800">
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              Hypothetical Applicant
            </h3>

            <div className="space-y-3 text-xs">
              {/* Country */}
              <div>
                <label className="text-neutral-400 block mb-1">Operating Country</label>
                <select
                  value={facts.country ?? ''}
                  onChange={(e) => set({ country: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-white focus:border-indigo-500 outline-none"
                >
                  <option value="NG">Nigeria (NG)</option>
                  <option value="KE">Kenya (KE)</option>
                  <option value="ZA">South Africa (ZA)</option>
                  <option value="EG">Egypt (EG)</option>
                  <option value="GH">Ghana (GH)</option>
                  <option value="RW">Rwanda (RW)</option>
                  <option value="UG">Uganda (UG)</option>
                  <option value="US">United States (US)</option>
                </select>
              </div>

              {/* Stage */}
              <div>
                <label className="text-neutral-400 block mb-1">Company Stage</label>
                <select
                  value={facts.stage ?? ''}
                  onChange={(e) => set({ stage: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-white focus:border-indigo-500 outline-none"
                >
                  <option value="idea">Idea / Prototype</option>
                  <option value="pre_seed">Pre-Seed</option>
                  <option value="seed">Seed</option>
                  <option value="series_a">Series A</option>
                </select>
              </div>

              {/* Sector — matched against this program's own whitelist */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-neutral-400">Sector Alignment</label>
                  <button
                    type="button"
                    onClick={() => setShowSectorHints((v) => !v)}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                  >
                    {showSectorHints ? 'Hide accepted terms' : 'What does this program accept?'}
                  </button>
                </div>

                {showSectorHints && (
                  <div className="mb-2 p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 space-y-1.5">
                    {sectorWhitelist.length === 0 ? (
                      <p className="text-[11px] text-neutral-400">
                        No sector whitelist is saved for this program, so this gate passes for every applicant.
                      </p>
                    ) : (
                      <>
                        <p className="text-[11px] text-neutral-400">
                          The engine scores this gate satisfied when the text below <em>contains</em> one of these
                          saved terms (case-insensitive).
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {sectorWhitelist.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => set({ sector: s })}
                              className="px-2 py-0.5 rounded text-[10px] bg-neutral-800 hover:bg-indigo-600 text-neutral-300 hover:text-white transition-colors"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <Input
                  value={facts.sector ?? ''}
                  onChange={(e) => set({ sector: e.target.value })}
                  placeholder="e.g. fintech, b2b saas, logistics"
                  className="bg-neutral-950 border-neutral-800 text-xs text-white"
                />
              </div>

              {/* Checkboxes */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="flex items-center gap-2 text-neutral-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(facts.incorporated)}
                    onChange={(e) => set({ incorporated: e.target.checked })}
                    className="accent-indigo-500 rounded"
                  />
                  <span>Incorporated Entity</span>
                </label>
                <label className="flex items-center gap-2 text-neutral-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(facts.full_time)}
                    onChange={(e) => set({ full_time: e.target.checked })}
                    className="accent-indigo-500 rounded"
                  />
                  <span>Full-Time Commitment</span>
                </label>
              </div>

              {/* Prior funding + team size — the two numeric gates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-neutral-400 block mb-1">Prior institutional funding ($)</label>
                  <Input
                    type="number"
                    min={0}
                    value={facts.total_funding_raised_usd ?? 0}
                    onChange={(e) => set({ total_funding_raised_usd: Number(e.target.value) || 0 })}
                    className="bg-neutral-950 border-neutral-800 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">Team size</label>
                  <Input
                    type="number"
                    min={0}
                    value={facts.team_size ?? 0}
                    onChange={(e) => set({ team_size: Number(e.target.value) || 0 })}
                    className="bg-neutral-950 border-neutral-800 text-xs text-white font-mono"
                  />
                </div>
              </div>
              <p className="text-[10px] text-neutral-500">
                Team size only matters when a minimum team size is saved above — otherwise the engine skips that gate.
              </p>

              <Button
                onClick={onRun}
                disabled={isRunning}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs mt-2"
              >
                {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                {isRunning ? 'Scoring…' : 'Run this profile through the saved rules'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Results panel ────────────────────────────────────────────────── */}
        <div className="lg:col-span-7 space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/30 flex items-start gap-2.5">
              <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-rose-200">{error}</p>
            </div>
          )}
          {result ? (
            <Card className="bg-neutral-900/70 border-neutral-800">
              <CardContent className="p-6 space-y-5">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                      Server verdict for the saved rules
                    </span>
                    <h3 className="text-lg font-bold text-white mt-0.5">
                      {result.program_name} — {result.eligibility_percentage}%
                      eligible
                    </h3>
                  </div>
                  {verdict && (
                    <Badge
                      className={cn(
                        'text-xs font-bold font-mono px-3 py-1 flex items-center gap-1.5 shrink-0',
                        verdict.badge
                      )}
                    >
                      {verdict.icon}
                      {verdict.label}
                    </Badge>
                  )}
                </div>

                {/* Hard-gate callout */}
                {result.verdict === 'ineligible' && (
                  <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/30 flex items-start gap-2.5">
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-rose-300">
                        An application like this fails a hard gate and never reaches the scoring rubric.
                      </p>
                      <p className="text-[11px] text-neutral-400 mt-0.5">
                        The failed requirements below are why. A director override on the real triage view can still
                        promote it — that is a human decision, logged with a justification.
                      </p>
                    </div>
                  </div>
                )}

                {/* Score summary pills */}
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                    <p className="text-[11px] text-neutral-400">Satisfied</p>
                    <p className="text-xl font-bold font-mono text-emerald-400">
                      {result.requirements_satisfied}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                    <p className="text-[11px] text-neutral-400">Uncertain</p>
                    <p className="text-xl font-bold font-mono text-amber-400">
                      {result.requirements_uncertain}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                    <p className="text-[11px] text-neutral-400">Requires Evidence</p>
                    <p className="text-xl font-bold font-mono text-blue-400">
                      {result.requirements_evidence_needed}
                    </p>
                  </div>
                  <div className={cn(
                    'p-3 rounded-lg border',
                    (result.requirements_failed ?? 0) > 0
                      ? 'bg-rose-950/20 border-rose-500/30'
                      : 'bg-neutral-950 border-neutral-800'
                  )}>
                    <p className="text-[11px] text-neutral-400">Failed</p>
                    <p className={cn(
                      'text-xl font-bold font-mono',
                      (result.requirements_failed ?? 0) > 0
                        ? 'text-rose-400'
                        : 'text-neutral-600'
                    )}>
                      {result.requirements_failed ?? 0}
                    </p>
                  </div>
                </div>

                {/* Per-requirement breakdown */}
                <div className="space-y-2 pt-2">
                  {result.breakdown.map((req, idx) => {
                    const style = requirementStyle(req.status);
                    return (
                      <div
                        key={idx}
                        className={cn(
                          'p-3 rounded-lg border flex items-center justify-between text-xs gap-3',
                          style.row
                        )}
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          {style.icon}
                          <div className="min-w-0">
                            <p className="font-semibold text-white">{req.title}</p>
                            <p className="text-[11px] text-neutral-400 mt-0.5 truncate">
                              {req.rule}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-neutral-300">{req.user_value}</span>
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap',
                              style.badge
                            )}
                          >
                            {req.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footnote — what this preview is, and what it is not */}
                <div className="pt-3 border-t border-neutral-800 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-neutral-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-neutral-400">
                    {hasFailedRequirement
                      ? 'A hard-gate failure above is what filters an application out before screening.'
                      : 'No hard gate failed, so an application like this would reach human screening.'}{' '}
                    This is a preview of the rule set, not a decision about any candidate.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center min-h-[220px] rounded-xl border border-neutral-800 bg-neutral-900/40">
              <p className="text-sm text-neutral-500 text-center max-w-xs">
                {isRunning
                  ? 'Scoring against the saved rules…'
                  : 'Describe an applicant on the left and run it to see how the saved rules score it.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
