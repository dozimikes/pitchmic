'use client';

import * as React from 'react';
import { Compass, Sparkles, CheckCircle2, XCircle, HelpCircle, AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { EligibilityResult, AcceleratorProgram } from '@/lib/acceleratorApi';

// Known sector keywords accepted by the backend whitelist matcher.
// Shown as hints so founders know what strings will match.
const SECTOR_HINTS = [
  'fintech', 'logistics', 'agritech', 'healthtech', 'edtech',
  'b2b saas', 'cleantech', 'insurtech', 'proptech', 'mobility',
];

interface EligibilitySimulatorProps {
  program: AcceleratorProgram | undefined;
  eligibilityResult: EligibilityResult | undefined;
  eligibilityForm: any;
  setEligibilityForm: (form: any) => void;
  onRecalculate: () => void;
  /** Only shown when eligibility verdict is NOT ineligible */
  onLaunchApply: () => void;
}

// ── Verdict config ────────────────────────────────────────────────────────────
const verdictConfig: Record<
  string,
  { label: string; badge: string; icon: React.ReactNode; canApply: boolean }
> = {
  highly_eligible: {
    label: 'HIGHLY ELIGIBLE',
    badge: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    canApply: true,
  },
  review_needed: {
    label: 'REVIEW NEEDED',
    badge: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    canApply: true,
  },
  ineligible: {
    label: 'INELIGIBLE',
    badge: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
    icon: <XCircle className="w-3.5 h-3.5" />,
    canApply: false,
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
  program,
  eligibilityResult,
  eligibilityForm,
  setEligibilityForm,
  onRecalculate,
  onLaunchApply,
}: EligibilitySimulatorProps) {
  const [showSectorHints, setShowSectorHints] = React.useState(false);

  const verdict = eligibilityResult
    ? (verdictConfig[eligibilityResult.verdict] ?? verdictConfig['review_needed'])
    : null;

  const hasFailedRequirement = eligibilityResult?.breakdown.some((r) => r.status === 'failed');

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Compass className="w-5 h-5 text-emerald-400" />
          Accelerator Marketplace &amp; Real-Time Eligibility Engine
        </h2>
        <p className="text-xs text-neutral-400 mt-1">
          "Apply once, reuse everywhere." Build a canonical startup profile and evaluate
          instantaneous, granular requirement-by-requirement eligibility.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── Simulator controls ───────────────────────────────────────────── */}
        <Card className="lg:col-span-5 bg-neutral-900/70 border-neutral-800">
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Live Eligibility Calculator
            </h3>

            <div className="space-y-3 text-xs">
              {/* Country */}
              <div>
                <label className="text-neutral-400 block mb-1">Operating Country</label>
                <select
                  value={eligibilityForm.country}
                  onChange={(e) =>
                    setEligibilityForm({ ...eligibilityForm, country: e.target.value })
                  }
                  className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-white focus:border-emerald-500 outline-none"
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
                  value={eligibilityForm.stage}
                  onChange={(e) =>
                    setEligibilityForm({ ...eligibilityForm, stage: e.target.value })
                  }
                  className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-white focus:border-emerald-500 outline-none"
                >
                  <option value="idea">Idea / Prototype</option>
                  <option value="pre_seed">Pre-Seed</option>
                  <option value="seed">Seed</option>
                  <option value="series_a">Series A</option>
                </select>
              </div>

              {/* Sector — with hint guidance */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-neutral-400">Sector Alignment</label>
                  <button
                    type="button"
                    onClick={() => setShowSectorHints((v) => !v)}
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                  >
                    {showSectorHints ? 'Hide hints' : 'What sectors are accepted?'}
                  </button>
                </div>

                {showSectorHints && (
                  <div className="mb-2 p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 space-y-1.5">
                    <p className="text-[11px] text-neutral-400">
                      Type one or more keywords from the list below. The engine checks if your
                      input <em>contains</em> a whitelisted term (case-insensitive).
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {SECTOR_HINTS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() =>
                            setEligibilityForm({ ...eligibilityForm, sector: s })
                          }
                          className="px-2 py-0.5 rounded text-[10px] bg-neutral-800 hover:bg-emerald-600 text-neutral-300 hover:text-white transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <Input
                  value={eligibilityForm.sector}
                  onChange={(e) =>
                    setEligibilityForm({ ...eligibilityForm, sector: e.target.value })
                  }
                  placeholder="e.g. fintech, b2b saas, logistics"
                  className="bg-neutral-950 border-neutral-800 text-xs text-white"
                />
              </div>

              {/* Checkboxes */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="flex items-center gap-2 text-neutral-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={eligibilityForm.incorporated}
                    onChange={(e) =>
                      setEligibilityForm({ ...eligibilityForm, incorporated: e.target.checked })
                    }
                    className="accent-emerald-500 rounded"
                  />
                  <span>Incorporated Entity</span>
                </label>
                <label className="flex items-center gap-2 text-neutral-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={eligibilityForm.full_time}
                    onChange={(e) =>
                      setEligibilityForm({ ...eligibilityForm, full_time: e.target.checked })
                    }
                    className="accent-emerald-500 rounded"
                  />
                  <span>Full-Time Commitment</span>
                </label>
              </div>

              {/* Prior funding */}
              <div>
                <label className="text-neutral-400 block mb-1">
                  Prior Institutional Funding ($)
                </label>
                <Input
                  type="number"
                  value={eligibilityForm.total_funding_raised_usd}
                  onChange={(e) =>
                    setEligibilityForm({
                      ...eligibilityForm,
                      total_funding_raised_usd: Number(e.target.value),
                    })
                  }
                  className="bg-neutral-950 border-neutral-800 text-xs text-white font-mono"
                />
              </div>

              <Button
                onClick={onRecalculate}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs mt-2"
              >
                Recalculate Granular Eligibility
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Results panel ────────────────────────────────────────────────── */}
        <div className="lg:col-span-7 space-y-6">
          {eligibilityResult ? (
            <Card className="bg-neutral-900/70 border-neutral-800">
              <CardContent className="p-6 space-y-5">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                      Instant Intelligence Layer
                    </span>
                    <h3 className="text-lg font-bold text-white mt-0.5">
                      {eligibilityResult.program_name} — {eligibilityResult.eligibility_percentage}%
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

                {/* Ineligible callout */}
                {eligibilityResult.verdict === 'ineligible' && (
                  <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/30 flex items-start gap-2.5">
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-rose-300">
                        This startup does not meet the program's hard requirements.
                      </p>
                      <p className="text-[11px] text-neutral-400 mt-0.5">
                        Review the failed requirements below. Resolve them before applying to
                        avoid immediate disqualification.
                      </p>
                    </div>
                  </div>
                )}

                {/* Score summary pills */}
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                    <p className="text-[11px] text-neutral-400">Satisfied</p>
                    <p className="text-xl font-bold font-mono text-emerald-400">
                      {eligibilityResult.requirements_satisfied}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                    <p className="text-[11px] text-neutral-400">Uncertain</p>
                    <p className="text-xl font-bold font-mono text-amber-400">
                      {eligibilityResult.requirements_uncertain}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                    <p className="text-[11px] text-neutral-400">Requires Evidence</p>
                    <p className="text-xl font-bold font-mono text-blue-400">
                      {eligibilityResult.requirements_evidence_needed}
                    </p>
                  </div>
                  <div className={cn(
                    'p-3 rounded-lg border',
                    (eligibilityResult.requirements_failed ?? 0) > 0
                      ? 'bg-rose-950/20 border-rose-500/30'
                      : 'bg-neutral-950 border-neutral-800'
                  )}>
                    <p className="text-[11px] text-neutral-400">Failed</p>
                    <p className={cn(
                      'text-xl font-bold font-mono',
                      (eligibilityResult.requirements_failed ?? 0) > 0
                        ? 'text-rose-400'
                        : 'text-neutral-600'
                    )}>
                      {eligibilityResult.requirements_failed ?? 0}
                    </p>
                  </div>
                </div>

                {/* Per-requirement breakdown */}
                <div className="space-y-2 pt-2">
                  {eligibilityResult.breakdown.map((req, idx) => {
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

                {/* CTA row — apply button only enabled when not ineligible */}
                <div className="pt-3 border-t border-neutral-800 flex items-center justify-between gap-3">
                  {hasFailedRequirement && eligibilityResult.verdict !== 'ineligible' && (
                    <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Some requirements have gaps — you can still apply but expect additional
                      scrutiny.
                    </p>
                  )}
                  <div className="ml-auto">
                    {verdict?.canApply ? (
                      <Button
                        onClick={onLaunchApply}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-5 shadow-md"
                      >
                        Launch Adaptive Application for {eligibilityResult.program_name}
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-950/20 border border-rose-500/30">
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span className="text-xs text-rose-300 font-medium">
                          Resolve failed requirements before applying
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center min-h-[220px] rounded-xl border border-neutral-800 bg-neutral-900/40">
              <p className="text-sm text-neutral-500">
                Adjust the form and click <strong className="text-neutral-300">Recalculate</strong>{' '}
                to see granular eligibility.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
