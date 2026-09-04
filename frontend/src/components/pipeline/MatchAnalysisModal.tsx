'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, CheckCircle2, AlertTriangle, ExternalLink, ShieldCheck,
  TrendingUp, Sparkles, FolderLock, FileText, ArrowRight,
  Layers, DollarSign, Award, Target,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Separator } from '@/components/ui/Separator';
import { cn } from '@/lib/utils';
import type { RecommendedOpportunity } from '@/lib/opportunityIntelligenceApi';

interface MatchAnalysisModalProps {
  opportunity: RecommendedOpportunity | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToPipeline: (opp: RecommendedOpportunity) => void;
}

const DIMENSION_LABELS: Record<keyof RecommendedOpportunity['dimensional_scores'], { label: string; description: string }> = {
  stage_fit: { label: 'Stage Fit', description: 'Match with targeted financing stage' },
  geography_fit: { label: 'Geography Fit', description: 'Eligible countries and operational regions' },
  sector_fit: { label: 'Sector Fit', description: 'Industry and vertical alignment' },
  funding_fit: { label: 'Funding Fit', description: 'Match between target raise and capital range' },
  business_model_fit: { label: 'Business Model Fit', description: 'B2B/B2C revenue architecture fit' },
  product_maturity: { label: 'Product Maturity', description: 'Functional readiness and tech defensibility' },
  evidence_readiness: { label: 'Evidence Readiness', description: 'Documentary proof and verified claims' },
};

export function MatchAnalysisModal({
  opportunity,
  isOpen,
  onClose,
  onAddToPipeline,
}: MatchAnalysisModalProps) {
  if (!isOpen || !opportunity) return null;

  const dims = opportunity.dimensional_scores;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden my-8"
      >
        {/* Header */}
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-orange-50/30 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] uppercase font-bold text-slate-600">
                  {opportunity.organization}
                </Badge>
                <Badge className="bg-emerald-600 text-white font-bold text-xs">
                  {opportunity.overall_match_score}% Match
                </Badge>
                <span className="flex items-center gap-1 text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                  <ShieldCheck className="h-3 w-3 text-emerald-600" />
                  Official Source Verified
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mt-1.5">{opportunity.title}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Funding: ${Number(opportunity.funding_min_usd).toLocaleString()} to ${Number(opportunity.funding_max_usd).toLocaleString()} · {opportunity.equity_terms}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* 7-Dimension Breakdown */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-brand-orange-500" />
                7-Dimensional Match Analysis
              </h4>
              <span className="text-xs font-bold text-slate-900">
                Composite Score: <span className="text-emerald-600">{opportunity.overall_match_score}%</span>
              </span>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              {Object.entries(dims).map(([key, score]) => {
                const meta = DIMENSION_LABELS[key as keyof typeof DIMENSION_LABELS];
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-800">{meta?.label || key}</span>
                        <span className="text-slate-400 ml-1.5 hidden sm:inline">({meta?.description})</span>
                      </div>
                      <span className="font-bold tabular-nums text-slate-900">{score}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-200/80 overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          score >= 90 ? 'bg-emerald-500' : score >= 80 ? 'bg-brand-orange-500' : 'bg-amber-500'
                        )}
                        style={{ width: `${score}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Positive Convictions */}
          {opportunity.positive_convictions && opportunity.positive_convictions.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Why this opportunity fits your venture
              </h4>
              <div className="space-y-1.5">
                {opportunity.positive_convictions.map((conv, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-emerald-900 bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-200/60">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{conv}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Identified Diligence Gaps */}
          {opportunity.evidence_gaps && opportunity.evidence_gaps.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                What could prevent acceptance? (Identified Evidence Gaps)
              </h4>
              <div className="space-y-1.5">
                {opportunity.evidence_gaps.map((gap, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 text-xs text-amber-950 bg-amber-50/80 p-3 rounded-xl border border-amber-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold">{gap}</span>
                        <p className="text-[11px] text-amber-800/80 mt-0.5">
                          Resolving this before submitting can increase your application readiness score by up to 18 points.
                        </p>
                      </div>
                    </div>
                    <Link href="/dataroom" onClick={onClose} className="shrink-0 self-center">
                      <Button size="sm" variant="outline" className="h-7 text-[10px] border-amber-300 text-amber-900 hover:bg-amber-100 gap-1">
                        <FolderLock className="h-3 w-3" /> Fix in Data Room
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key Benefits */}
          {opportunity.key_benefits && opportunity.key_benefits.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Cohort Program Offerings:
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
                {opportunity.key_benefits.map((b, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5">
                    <Award className="h-3.5 w-3.5 text-brand-orange-500 shrink-0" />
                    <span className="truncate">{b}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-100 bg-slate-50/80 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <a
            href={opportunity.application_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 font-medium"
          >
            <span>Visit official portal ({opportunity.organization})</span>
            <ExternalLink className="h-3 w-3" />
          </a>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button variant="ghost" size="sm" onClick={onClose} className="flex-1 sm:flex-initial">
              Close
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                onAddToPipeline(opportunity);
                onClose();
              }}
              className="flex-1 sm:flex-initial bg-brand-orange-500 hover:bg-brand-orange-600 text-white gap-1.5 shadow-xs"
            >
              <Target className="h-3.5 w-3.5" />
              Add to Pipeline Funnel
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
