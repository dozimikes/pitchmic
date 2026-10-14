'use client';

import * as React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  FileCheck,
  Fingerprint,
  Info,
  Layers,
  Percent,
  Shield,
  ShieldAlert,
  Sparkles,
  UserCheck,
  Wrench,
  X,
} from 'lucide-react';
import { useIntelligence, RiskSeverity } from '@/app/(dashboard)/accelerator/IntelligenceContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

export function IntelligenceDrawer() {
  const {
    intelligenceDrawerOpen,
    closeIntelligenceDrawer,
    activeExplanation,
    openEvidenceDrawer,
    openInterventionModal,
  } = useIntelligence();

  if (!intelligenceDrawerOpen || !activeExplanation) return null;

  const severityColor = (sev: RiskSeverity) => {
    switch (sev) {
      case 'CRITICAL':
      case 'HIGH':
        return {
          bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
          badge: 'bg-rose-500 text-white',
          dot: 'bg-rose-400',
        };
      case 'MEDIUM':
        return {
          bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
          badge: 'bg-amber-500 text-slate-950',
          dot: 'bg-amber-400',
        };
      case 'LOW':
        return {
          bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
          badge: 'bg-emerald-500 text-slate-950',
          dot: 'bg-emerald-400',
        };
      default:
        return {
          bg: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400',
          badge: 'bg-indigo-500 text-white',
          dot: 'bg-indigo-400',
        };
    }
  };

  const style = severityColor(activeExplanation.severity);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs transition-opacity duration-300">
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-xl border-l border-white/10 bg-[#0F1623] text-white shadow-2xl flex flex-col justify-between">
          
          {/* Header */}
          <div className="border-b border-white/10 px-6 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Brain className="h-4 w-4" />
                </span>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
                    Pitchmic Intelligence OS
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold uppercase', style.badge)}>
                      {activeExplanation.severity}
                    </span>
                    <span className="text-xs text-white/50">
                      Confidence: <strong className="text-white">{activeExplanation.confidence > 0 ? `${activeExplanation.confidence}%` : 'Not recorded'}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={closeIntelligenceDrawer}
                className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3">
              <h2 className="text-lg font-bold text-white tracking-tight">
                {activeExplanation.title}
              </h2>
              {activeExplanation.entityName && (
                <p className="text-sm font-medium text-white/70">
                  Entity: <span className="text-indigo-300 font-semibold">{activeExplanation.entityName}</span> · {activeExplanation.category}
                </p>
              )}
              <div className="mt-2 flex items-center gap-4 text-xs text-white/50">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Detected: {activeExplanation.detectedAt}
                </span>
                <span className="flex items-center gap-1">
                  <Fingerprint className="h-3 w-3" />
                  {activeExplanation.model}
                </span>
              </div>
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            
            {/* Why Section */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 mb-3">
                <ShieldAlert className="h-4 w-4 text-indigo-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white/90">
                  Detected Evidence Signals
                </h3>
              </div>
              <ul className="space-y-2.5">
                {activeExplanation.evidence.map((sig, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs text-white/80 leading-relaxed">
                    <span className={cn('h-1.5 w-1.5 rounded-full mt-1.5 shrink-0', style.dot)} />
                    <span>{sig}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Evidence Sources */}
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-white/50 mb-2">
                Underlying Data Sources
              </h4>
              <div className="flex flex-wrap gap-2">
                {activeExplanation.sources.map((source, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/80"
                  >
                    <FileCheck className="h-3 w-3 text-emerald-400" />
                    {source}
                  </span>
                ))}
              </div>
            </div>

            {/* Contradictory Signals if any */}
            {activeExplanation.contradictions && activeExplanation.contradictions.length > 0 && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="flex items-center gap-2 mb-2 text-amber-400 font-semibold text-xs uppercase tracking-wider">
                  <AlertTriangle className="h-4 w-4" />
                  Contradictory / Divergent Signals
                </div>
                <ul className="space-y-1.5 text-xs text-amber-200/80">
                  {activeExplanation.contradictions.map((c, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-amber-400">•</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Policy Context */}
            {activeExplanation.policy && (
              <div className="text-xs text-white/40 border-t border-white/5 pt-3">
                <span className="font-semibold text-white/60">Evaluation Policy: </span>
                {activeExplanation.policy}
              </div>
            )}

            {/* Recommended Intervention */}
            {activeExplanation.recommendedAction && (
              <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent p-5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-400 mb-2">
                  <Sparkles className="h-4 w-4" />
                  Recommended System Intervention
                </div>
                <p className="text-sm font-semibold text-white mb-2">
                  {activeExplanation.recommendedAction.label}
                </p>

                {activeExplanation.recommendedAction.suggestedMentor && (
                  <div className="flex items-center gap-2 text-xs text-white/70 mb-2">
                    <UserCheck className="h-3.5 w-3.5 text-indigo-300" />
                    <span>Matched Lead: <strong className="text-white">{activeExplanation.recommendedAction.suggestedMentor}</strong></span>
                  </div>
                )}

                {activeExplanation.recommendedAction.expectedOutcome && (
                  <p className="text-xs text-white/60 italic bg-black/20 p-2.5 rounded-lg border border-white/5">
                    &ldquo;{activeExplanation.recommendedAction.expectedOutcome}&rdquo;
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="border-t border-white/10 px-6 py-4 bg-[#0B0F17] flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={!activeExplanation.evidenceDetail}
              onClick={() => {
                // Only open the evidence graph when a real EvidenceItem payload was supplied —
                // never fabricate provenance rows here.
                if (activeExplanation.evidenceDetail) {
                  openEvidenceDrawer(activeExplanation.evidenceDetail);
                }
              }}
              className="border-white/20 bg-white/5 text-white hover:bg-white/10 disabled:opacity-40"
              title={activeExplanation.evidenceDetail ? undefined : 'No evidence contract recorded for this signal'}
            >
              <Layers className="h-3.5 w-3.5 mr-1.5 text-indigo-400" />
              View Evidence Graph
            </Button>

            <Button
              size="sm"
              onClick={() => {
                closeIntelligenceDrawer();
                openInterventionModal({
                  startupName: activeExplanation.entityName,
                  problem: activeExplanation.title,
                  recommended: activeExplanation.recommendedAction?.label,
                  assignedMentor: activeExplanation.recommendedAction?.suggestedMentor,
                  expectedOutcome: activeExplanation.recommendedAction?.expectedOutcome,
                  category: activeExplanation.category,
                });
              }}
              className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium shadow-md hover:from-indigo-600 hover:to-purple-700"
            >
              <Wrench className="h-3.5 w-3.5 mr-1.5" />
              Draft Intervention Brief
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
