'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Brain,
  CheckCircle2,
  ChevronRight,
  Layers,
  Save,
  Scale,
  UserCheck,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useIntelligence } from '@/app/(dashboard)/accelerator/IntelligenceContext';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { acceleratorApi, ApplicationAssessment } from '@/lib/acceleratorApi';
import { apiErrMessage, qk } from '@/lib/screening';

export interface ScoreDimension {
  key: string;
  name: string;
  /** Reviewer scorecards use the backend 1–10 scale. */
  reviewerScore?: number | null;
  /** ML assessment baseline scores use the backend 0–100 scale. */
  mlScore?: number | null;
  mlConfidence?: number | null;
}

export interface CandidateScoreData {
  applicationId: number;
  startupName: string;
  sector?: string;
}

interface ScoreComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidateData: CandidateScoreData | null;
  /** Called after a scorecard is persisted so the parent can refetch. */
  onSaved?: (applicationId: number) => void;
}

// The five fixed scorecard dimensions on ReviewerAssessment (backend, 1–10).
const DIMENSIONS: Array<{ key: 'founder_score' | 'market_score' | 'product_score' | 'team_score' | 'traction_score'; name: string; mlKey: keyof ApplicationAssessment; mlConfKey: keyof ApplicationAssessment }> = [
  { key: 'founder_score', name: 'Founder', mlKey: 'founder_score', mlConfKey: 'founder_confidence' },
  { key: 'market_score', name: 'Market', mlKey: 'market_score', mlConfKey: 'market_confidence' },
  { key: 'product_score', name: 'Product', mlKey: 'product_score', mlConfKey: 'product_confidence' },
  { key: 'team_score', name: 'Team', mlKey: 'team_score', mlConfKey: 'team_confidence' },
  { key: 'traction_score', name: 'Traction', mlKey: 'traction_score', mlConfKey: 'traction_confidence' },
];

type ReviewRow = {
  id?: number;
  reviewer_name?: string;
  overall_conviction?: number;
  variance_rationale?: string;
  notes?: string;
  submitted_at?: string;
} & Partial<Record<(typeof DIMENSIONS)[number]['key'], number>>;

export function ScoreComparisonModal({
  isOpen,
  onClose,
  candidateData,
  onSaved,
}: ScoreComparisonModalProps) {
  const { openIntelligenceDrawer } = useIntelligence();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const app = candidateData?.applicationId ?? null;

  // Real ML baseline for this application (null when the pipeline hasn't run).
  const { data: assessment } = useQuery({
    queryKey: qk.appAssessment(app ?? 0),
    queryFn: () => acceleratorApi.getApplicationAssessment(app as number),
    enabled: isOpen && app != null,
    retry: false,
  });

  // Real submitted reviewer scorecards for this application.
  const { data: reviews = [] } = useQuery<ReviewRow[]>({
    queryKey: qk.appReviews(app ?? 0),
    queryFn: async () => {
      const rows = await acceleratorApi.getApplicationDetail(app as number);
      return (rows?.reviewer_assessments ?? []) as ReviewRow[];
    },
    enabled: isOpen && app != null,
  });

  const [scores, setScores] = React.useState<Record<string, string>>({});
  const [recommendation, setRecommendation] = React.useState<'INTERVIEW' | 'REJECT' | 'WAITLIST' | 'NEEDS_MORE_INFO'>('NEEDS_MORE_INFO');
  const [rationale, setRationale] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (candidateData) {
      setScores({});
      setRationale('');
      setRecommendation('NEEDS_MORE_INFO');
    }
  }, [candidateData]);

  if (!isOpen || !candidateData || app == null) return null;

  // Peer-average per dimension across the real submitted scorecards (1–10).
  const peerAvg = (key: (typeof DIMENSIONS)[number]['key']): number | null => {
    const vals = reviews
      .map((r) => r[key])
      .filter((v): v is number => typeof v === 'number');
    if (vals.length === 0) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  };

  const filled = DIMENSIONS.map((d) => parseFloat(scores[d.key] ?? ''));
  const allFilled = filled.every((v) => Number.isFinite(v) && v >= 1 && v <= 10);
  const ownConviction = allFilled
    ? Math.round((filled.reduce((a, b) => a + b, 0) / filled.length) * 10) / 10
    : null;
  const hasMlBaseline = !!assessment;
  const mlFit = hasMlBaseline && typeof assessment.startup_strength === 'number'
    ? Math.round(assessment.startup_strength)
    : null;

  const handleScoreChange = (key: string, raw: string) => {
    setScores((prev) => ({ ...prev, [key]: raw }));
  };

  const handleSave = async () => {
    if (!allFilled || ownConviction === null) return;
    setIsSaving(true);
    try {
      await acceleratorApi.submitReview({
        application: app,
        founder_score: filled[0],
        market_score: filled[1],
        product_score: filled[2],
        team_score: filled[3],
        traction_score: filled[4],
        overall_conviction: ownConviction,
        recommendation,
        notes: rationale,
      });
      queryClient.invalidateQueries({ queryKey: qk.appReviews(app) });
      // Bare prefixes match every program-scoped variant of these queries.
      queryClient.invalidateQueries({ queryKey: ['accelerator-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['accelerator-reviewer-consensus'] });
      queryClient.invalidateQueries({ queryKey: ['accelerator-my-calibration'] });
      queryClient.invalidateQueries({ queryKey: ['accelerator-applications'] });
      onSaved?.(app);
      toast({
        title: 'Scorecard Recorded',
        description: `Your ${ownConviction}/10 conviction score and rationale were persisted for ${candidateData.startupName}.`,
        variant: 'success',
      });
      onClose();
    } catch (err: unknown) {
      toast({
        title: 'Save Failed',
        description: apiErrMessage(err, 'Could not persist your scorecard.'),
        variant: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const openDimDrawer = (d: (typeof DIMENSIONS)[number]) => {
    const mlScore = hasMlBaseline ? (assessment[d.mlKey] as number | undefined) : undefined;
    const mlConf = hasMlBaseline ? (assessment[d.mlConfKey] as number | undefined) : undefined;
    openIntelligenceDrawer({
      title: `${candidateData.startupName} — ${d.name} Baseline`,
      entityName: candidateData.startupName,
      category: d.name,
      severity: 'INFO',
      confidence: typeof mlConf === 'number' ? Math.round(mlConf) : 0,
      detectedAt: 'Stored ML assessment',
      evidence: typeof mlScore === 'number'
        ? [`ML-assisted baseline score: ${Math.round(mlScore)}/100${typeof mlConf === 'number' ? ` (model-reported confidence ${Math.round(mlConf)}%)` : ''}`]
        : ['No ML baseline recorded for this dimension yet.'],
      sources: ['Application assessment record'],
      model: 'ML-assisted screening',
      policy: 'ML surfaces evidence and baselines only — reviewers decide.',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl border border-white/15 bg-[#0F1623] text-white shadow-2xl p-6 space-y-6 my-8">

        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                Human Scorecards vs ML Baseline
              </span>
              <span className="text-xs text-white/40 font-mono">
                App #{candidateData.applicationId}{candidateData.sector ? ` · ${candidateData.sector}` : ''}
              </span>
            </div>
            <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
              <Scale className="h-5 w-5 text-purple-400" />
              {candidateData.startupName}: Reviewer vs ML-Assisted Screening
            </h2>
            <p className="text-xs text-white/50 mt-1">
              Reviewer makes the decision. Pitchmic surfaces stored human scorecards and the ML baseline as independent evidence.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Score Contrast Banner — only real, stored values */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 flex items-center gap-1.5">
              <UserCheck className="h-3.5 w-3.5 text-indigo-400" />
              Submitted Scorecards
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{reviews.length}</span>
              <span className="text-xs text-white/40">review(s)</span>
            </div>
            <div className="text-[11px] text-white/50 mt-1">
              {reviews.length === 0 ? 'No human reviews yet' : 'From the reviewer assessment ledger'}
            </div>
          </div>

          <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
              <Brain className="h-3.5 w-3.5 text-indigo-400" />
              ML Baseline
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              {mlFit !== null ? (
                <>
                  <span className="text-3xl font-black text-indigo-300">{mlFit}</span>
                  <span className="text-xs text-indigo-400/60">/ 100 startup strength</span>
                </>
              ) : (
                <span className="text-sm font-bold text-white/50">No ML assessment recorded yet</span>
              )}
            </div>
            <div className="text-[11px] text-indigo-300/60 mt-1">
              ML-assisted screening · advisory evidence only
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 flex items-center justify-between">
              <span>Your Conviction</span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-3xl font-black text-emerald-400">
                {ownConviction !== null ? ownConviction : '—'}
              </span>
              <span className="text-xs text-white/40">/ 10 (live preview)</span>
            </div>
            <div className="text-[11px] text-white/50 mt-1">Fill all five dimensions to record a scorecard</div>
          </div>
        </div>

        {/* Dimension Comparison — peer human averages (1–10) vs ML baseline (0–100) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white/70 flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-indigo-400" />
              Dimension Breakdown
            </h3>
            <span className="text-[11px] text-white/40">
              Click &ldquo;Why?&rdquo; for the stored baseline signal
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0B0F17]">
            <table className="w-full text-left text-xs text-white/80">
              <thead className="border-b border-white/10 bg-white/5 text-[10px] uppercase font-bold text-white/50">
                <tr>
                  <th className="px-4 py-2.5">Dimension</th>
                  <th className="px-3 py-2.5 text-center">Peer Avg (1–10)</th>
                  <th className="px-4 py-2.5 text-center">Your Score (1–10)</th>
                  <th className="px-3 py-2.5 text-center">ML Baseline (0–100)</th>
                  <th className="px-4 py-2.5 text-right">Signal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {DIMENSIONS.map((d) => {
                  const peer = peerAvg(d.key);
                  const ml = hasMlBaseline ? (assessment[d.mlKey] as number | undefined) : undefined;
                  const mlConf = hasMlBaseline ? (assessment[d.mlConfKey] as number | undefined) : undefined;
                  return (
                    <tr key={d.key} className="hover:bg-white/[0.02] transition">
                      <td className="px-4 py-3">
                        <div className="font-bold text-white">{d.name}</div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {peer !== null ? (
                          <span className="font-black text-sm text-white">{peer}</span>
                        ) : (
                          <span className="text-white/30 italic font-mono">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex items-center gap-1.5 bg-white/5 border border-white/15 rounded-lg px-2 py-1">
                          <input
                            type="number"
                            min={1}
                            max={10}
                            step={0.5}
                            value={scores[d.key] ?? ''}
                            onChange={(e) => handleScoreChange(d.key, e.target.value)}
                            placeholder="—"
                            className="w-12 bg-transparent text-center font-bold text-white text-xs placeholder-white/30 focus:outline-hidden"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {typeof ml === 'number' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-bold">
                            <span>{Math.round(ml)}</span>
                            {typeof mlConf === 'number' && (
                              <span className="text-[9px] font-semibold text-indigo-400/70">conf {Math.round(mlConf)}%</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-white/30 italic font-mono">No data yet</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openDimDrawer(d)}
                          className="text-xs text-indigo-300 hover:text-white inline-flex items-center gap-1 font-semibold transition"
                        >
                          Why?
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {assessment?.recommendation_reasoning && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3.5 text-xs text-white/70">
              <span className="font-bold text-indigo-300 uppercase tracking-wider text-[10px] block mb-1">
                Stored recommendation reasoning (ML-assisted screening)
              </span>
              {assessment.recommendation_reasoning}
            </div>
          )}
        </div>

        {/* Reviewer scorecard submission — human decision capture */}
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
              <UserCheck className="h-4 w-4 text-emerald-400" />
              Your Scorecard &amp; Rationale
            </label>
            <span className="text-[10px] text-white/40 font-mono">Persisted to reviewer assessments</span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-white/50">Recommendation:</span>
            {(['INTERVIEW', 'WAITLIST', 'REJECT', 'NEEDS_MORE_INFO'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRecommendation(r)}
                className={cn(
                  'rounded-lg border px-2 py-1 font-semibold transition',
                  recommendation === r
                    ? 'border-indigo-500 bg-indigo-600/20 text-indigo-200'
                    : 'border-white/10 bg-white/5 text-white/50 hover:text-white'
                )}
              >
                {r.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          <textarea
            rows={3}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Record your reasoning — especially where your assessment diverges from the ML baseline (e.g. recent contracts not yet reflected in the data room)."
            className="w-full rounded-xl border border-white/15 bg-black/40 p-3 text-xs text-white placeholder-white/30 focus:border-indigo-500 focus:outline-hidden resize-none leading-relaxed"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 pt-4">
          <div className="text-[11px] text-white/40 flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Human score is authoritative. ML signals are evidentiary.
            </span>
            <span>
              You hold one live scorecard per application — saving again revises it in place, it never duplicates or
              adds a second ballot.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="border-white/15 bg-white/5 text-white text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!allFilled || isSaving}
              title={allFilled ? undefined : 'Fill all five dimension scores (1–10) to save'}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" />
              {isSaving ? 'Saving...' : 'Save scorecard'}
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
