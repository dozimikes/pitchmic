'use client';

import * as React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  CheckCircle,
  CheckCircle2,
  ChevronRight,
  Database,
  FileCheck2,
  FileText,
  Fingerprint,
  GitBranch,
  Layers,
  Link2,
  Lock,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useIntelligence, EvidenceItem } from '@/app/(dashboard)/accelerator/IntelligenceContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

export function EvidenceDrawer() {
  const { evidenceDrawerOpen, closeEvidenceDrawer, activeEvidence } = useIntelligence();

  if (!evidenceDrawerOpen || !activeEvidence) return null;

  const statusBadge = (status: EvidenceItem['status']) => {
    switch (status) {
      case 'VERIFIED':
        return {
          label: 'VERIFIED',
          badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
          icon: ShieldCheck,
        };
      case 'PARTIALLY_VERIFIED':
        return {
          label: 'PARTIALLY VERIFIED',
          badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
          icon: AlertCircle,
        };
      case 'CONTRADICTED':
      case 'FLAGGED':
        return {
          label: 'CONTRADICTION DETECTED',
          badge: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
          icon: ShieldAlert,
        };
      default:
        return {
          label: 'UNVERIFIED',
          badge: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
          icon: Shield,
        };
    }
  };

  const badgeConfig = statusBadge(activeEvidence.status);
  const StatusIcon = badgeConfig.icon;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/70 backdrop-blur-xs transition-opacity duration-300">
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-xl border-l border-white/10 bg-[#0A0E17] text-white shadow-2xl flex flex-col justify-between">
          
          {/* Header */}
          <div className="border-b border-white/10 px-6 py-5 bg-[#0F1623]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Layers className="h-4 w-4" />
                </span>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                    Evidence Contract Graph
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn('rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1', badgeConfig.badge)}>
                      <StatusIcon className="h-3 w-3" />
                      {badgeConfig.label}
                    </span>
                    {activeEvidence.snapshotId && (
                      <span className="text-[11px] text-white/50 font-mono flex items-center gap-1">
                        <Lock className="h-2.5 w-2.5" />
                        {activeEvidence.snapshotId}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={closeEvidenceDrawer}
                className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3">
              <h2 className="text-lg font-bold text-white tracking-tight">
                {activeEvidence.title}
              </h2>
              {activeEvidence.claimant && (
                <p className="text-xs text-white/60">
                  Claimant: <strong className="text-white">{activeEvidence.claimant}</strong>
                </p>
              )}
            </div>
          </div>

          {/* Body: Evidence Graph */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            
            {/* Visual Evidence Graph Tree */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/50 mb-3 flex items-center justify-between">
                <span>Triangulated Evidence Tree</span>
                <span className="text-emerald-400 font-mono">
                  Confidence: {activeEvidence.confidence > 0 ? `${activeEvidence.confidence}%` : 'Not recorded'}
                </span>
              </div>

              {/* Node 1: Declared Claim */}
              <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-3.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    1. Founder Declared Claim
                  </span>
                  <span className="text-[10px] text-white/40">{activeEvidence.declared.date || 'Application'}</span>
                </div>
                <div className="text-sm font-semibold text-white">
                  &ldquo;{activeEvidence.declared.value}&rdquo;
                </div>
                <div className="text-[11px] text-indigo-200/60 mt-1">
                  Source: {activeEvidence.declared.source}
                </div>
              </div>

              {/* Connector */}
              <div className="flex justify-center py-2 text-white/20">
                <ArrowDown className="h-4 w-4" />
              </div>

              {/* Node 2: Supporting Documents */}
              <div className="rounded-lg border border-white/10 bg-white/5 p-3.5 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 flex items-center gap-1.5">
                  <FileCheck2 className="h-3.5 w-3.5 text-blue-400" />
                  2. Supporting Documentation
                </span>
                <div className="space-y-1.5">
                  {activeEvidence.supporting.length === 0 && (
                    <div className="text-[11px] text-white/40 italic bg-black/20 p-2 rounded border border-white/5">
                      No supporting documents recorded yet.
                    </div>
                  )}
                  {activeEvidence.supporting.map((doc, idx) => (
                    <div key={idx} className="flex items-start justify-between text-xs bg-black/20 p-2 rounded border border-white/5">
                      <div>
                        <div className="font-medium text-white/90">{doc.source}</div>
                        <div className="text-[11px] text-white/50">{doc.value}</div>
                      </div>
                      <span className={cn(
                        'text-[10px] font-bold px-1.5 py-0.5 rounded uppercase',
                        doc.status === 'MATCH' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                      )}>
                        {doc.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Connector */}
              <div className="flex justify-center py-2 text-white/20">
                <ArrowDown className="h-4 w-4" />
              </div>

              {/* Node 3: Observed Telemetry */}
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5" />
                  3. Observed Ground Truth (API / Banking / ERP)
                </span>
                <div className="space-y-1.5">
                  {activeEvidence.observed.length === 0 && (
                    <div className="text-[11px] text-white/40 italic bg-black/20 p-2 rounded border border-emerald-500/20">
                      No observed verification data yet — awaiting review.
                    </div>
                  )}
                  {activeEvidence.observed.map((obs, idx) => (
                    <div key={idx} className="flex items-start justify-between text-xs bg-black/30 p-2 rounded border border-emerald-500/20">
                      <div>
                        <div className="font-medium text-white/90">{obs.source}</div>
                        <div className="text-[11px] text-white/60 font-mono">{obs.value}</div>
                      </div>
                      <span className={cn(
                        'text-[10px] font-bold px-1.5 py-0.5 rounded uppercase',
                        obs.status === 'VERIFIED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                      )}>
                        {obs.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Reconciliation Notes */}
            {activeEvidence.notes && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-1.5">
                  <AlertTriangle className="h-4 w-4" />
                  Discrepancy & Reconciliation Note
                </div>
                <p className="text-xs text-amber-200/90 leading-relaxed">
                  {activeEvidence.notes}
                </p>
              </div>
            )}

            {/* Audit Proof Information */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/50 flex items-center gap-1.5">
                <Fingerprint className="h-3.5 w-3.5 text-indigo-400" />
                Audit Provenance
              </div>
              <p className="text-white/60">
                {activeEvidence.snapshotId ? (
                  <>This verification state is attached to Decision Snapshot <code className="text-indigo-300 bg-white/5 px-1 py-0.5 rounded">{activeEvidence.snapshotId}</code>.</>
                ) : (
                  'No decision snapshot is attached to this claim yet. Verification updates are recorded in the audit ledger as evidence arrives.'
                )}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-white/10 px-6 py-4 bg-[#0F1623] flex items-center justify-between">
            <span className="text-xs text-white/40">
              Closed-Loop Evidence Ledger
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={closeEvidenceDrawer}
              className="border-white/20 bg-white/5 text-white hover:bg-white/10"
            >
              Close Graph
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
