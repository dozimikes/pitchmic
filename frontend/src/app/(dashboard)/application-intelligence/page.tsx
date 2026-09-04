'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Target,
  Brain,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  Layers,
  Scale,
  Award,
  FileSearch,
  ShieldCheck,
  Users,
  BarChart3,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Zap,
  Gauge,
  MapPin,
  Building2,
  Clock,
  Briefcase,
  DollarSign,
  Globe2,
  Flame,
  Eye,
  EyeOff,
  Check,
  X,
  ArrowRight,
  Play,
  Send,
  RefreshCw,
  ExternalLink,
  HelpCircle,
  Plus,
  Lightbulb,
  ShieldAlert,
  UserCheck,
  Cpu,
  Search,
  Activity,
  BookOpen,
  FileCheck2,
  FileQuestion,
  AlertOctagon,
  Star,
  ListChecks,
  Compass,
  GraduationCap,
  MessageSquare,
  Rocket,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Separator } from '@/components/ui/Separator';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import {
  applicationIntelligenceApi,
  ensureArray,
  formatDate,
  ProgramIntelligenceProfile,
  ProgramSelectionSignal,
  ProgramRequirement,
  ProgramApplicationQuestion,
  ProgramRubric,
  StartupProgramFit,
  ReadinessDimension,
  StageEvidenceExpectation,
  LinkedEvidenceItem,
  EvidenceGraphNode,
  HiddenEvidenceFinding,
  EvidenceGapRow,
  ApplicationStrategy,
  RedTeamFinding,
  InterviewQuestion,
  AnswerEvaluation,
  EvaluatorPersona,
  ProgramReadinessComparison,
  FundingReadinessRoadmap,
  ReadinessAction,
  CorrelationNote,
  ProgramPersonaVerdict,
  SourceType,
  ConfidenceLevel,
  ImportanceLevel,
  StartupStage,
  AssessmentLabel,
} from '@/lib/applicationIntelligenceApi';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

type RubricTab = 'requirements' | 'questions' | 'signals';

const STAGE_OPTIONS: { value: StartupStage; label: string }[] = [
  { value: 'IDEA', label: 'Idea' },
  { value: 'PRE_SEED', label: 'Pre-Seed' },
  { value: 'SEED', label: 'Seed' },
  { value: 'SERIES_A', label: 'Series A' },
];

function sourceBadgeClass(source: SourceType): string {
  switch (source) {
    case 'OFFICIAL':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'INFERRED':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'OBSERVED':
      return 'bg-violet-50 text-violet-700 border-violet-200';
  }
}

function confidenceBadgeClass(conf: ConfidenceLevel): string {
  switch (conf) {
    case 'HIGH':
      return 'bg-emerald-100 text-emerald-800';
    case 'MEDIUM':
      return 'bg-amber-100 text-amber-800';
    case 'LOW':
      return 'bg-rose-100 text-rose-800';
  }
}

function importanceBadgeClass(imp: ImportanceLevel): string {
  switch (imp) {
    case 'VERY_HIGH':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    case 'HIGH':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'MEDIUM':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'LOW':
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

function assessmentColor(label: AssessmentLabel): string {
  switch (label) {
    case 'Strong':
      return 'text-emerald-600';
    case 'Moderate':
      return 'text-amber-600';
    case 'Weak':
      return 'text-rose-600';
  }
}

function dimensionProgressColor(score: number): string {
  if (score >= 75) return 'bg-emerald-500';
  if (score >= 55) return 'bg-brand-orange-500';
  return 'bg-rose-500';
}

function compatColor(score: number) {
  if (score >= 75) return 'bg-emerald-500';
  if (score >= 50) return 'bg-amber-400';
  return 'bg-rose-400';
}

function ScoreBar({ label, value, max = 10 }: { label: string; value: number; max?: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-bold text-slate-700 w-20 shrink-0">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
        <div
          className="h-2.5 rounded-full bg-gradient-to-r from-brand-orange-400 to-brand-orange-600"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-black text-slate-900 w-10 text-right">{value}/{max}</span>
    </div>
  );
}

function ScoreDimension({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-500 w-28 flex-shrink-0">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-1.5 rounded-full ${compatColor(value)}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="w-10 text-right font-semibold text-slate-700">{pct}</span>
    </div>
  );
}

function CircularDial({ score, size = 120, label }: { score: number; size?: number; label?: string }) {
  const radius = size * 0.42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (Math.min(100, score) / 100) * circumference;
  const strokeColor = score >= 80 ? '#10b981' : score >= 65 ? '#f97316' : '#f43f5e';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="h-full w-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={size * 0.07}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={size * 0.07}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-black text-slate-900" style={{ fontSize: size * 0.25 }}>{score}</span>
        {label && <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">{label}</span>}
      </div>
    </div>
  );
}

export default function ApplicationIntelligencePage() {
  const { user } = useAuth();

  const [selectedProgramId, setSelectedProgramId] = React.useState<string>('prog-techstars');
  const [stage, setStage] = React.useState<StartupStage>('PRE_SEED');
  const [rubricTab, setRubricTab] = React.useState<RubricTab>('signals');
  const [selectedInterviewQ, setSelectedInterviewQ] = React.useState<string | null>(null);
  const [interviewAnswer, setInterviewAnswer] = React.useState<string>('');
  const [evaluations, setEvaluations] = React.useState<AnswerEvaluation[] | null>(null);
  const [isEvaluating, setIsEvaluating] = React.useState(false);
  const [strategy, setStrategy] = React.useState<ApplicationStrategy | null>(null);
  const [isSavingStrategy, setIsSavingStrategy] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);

  const { data: programsList = [], isLoading: isLoadingPrograms } = useQuery({
    queryKey: ['ai_programs_list'],
    queryFn: () => applicationIntelligenceApi.getAllPrograms(),
  });

  const { data: programProfile, isLoading: isLoadingProfile } = useQuery({
    queryKey: ['ai_program_profile', selectedProgramId],
    queryFn: () => applicationIntelligenceApi.getProgramProfile(selectedProgramId),
  });

  const { data: programRubric, isLoading: isLoadingRubric } = useQuery({
    queryKey: ['ai_program_rubric', selectedProgramId],
    queryFn: () => applicationIntelligenceApi.getProgramRubric(selectedProgramId),
  });

  const { data: startupFit, isLoading: isLoadingFit } = useQuery({
    queryKey: ['ai_startup_fit', selectedProgramId, stage],
    queryFn: () => applicationIntelligenceApi.getStartupFit(selectedProgramId, 'default-startup', stage),
  });

  const { data: stageExpectationsList = [], isLoading: isLoadingExpectations } = useQuery({
    queryKey: ['ai_stage_expectations'],
    queryFn: () => applicationIntelligenceApi.getStageExpectations(),
  });

  const stageExpectations = ensureArray<StageEvidenceExpectation>(stageExpectationsList).find(
    (s) => s.stage === stage
  );

  const { data: evidenceGraph, isLoading: isLoadingEvidence } = useQuery({
    queryKey: ['ai_evidence_graph'],
    queryFn: () => applicationIntelligenceApi.getEvidenceGraph(),
  });

  const { data: hiddenFindings, isLoading: isLoadingHidden } = useQuery({
    queryKey: ['ai_hidden_evidence'],
    queryFn: () => applicationIntelligenceApi.getHiddenEvidence(),
  });

  const { data: gapMap, isLoading: isLoadingGapMap } = useQuery({
    queryKey: ['ai_gap_map'],
    queryFn: () => applicationIntelligenceApi.getGapMap(),
  });

  const { data: defaultStrategy, isLoading: isLoadingDefaultStrategy } = useQuery({
    queryKey: ['ai_default_strategy'],
    queryFn: () => applicationIntelligenceApi.getDefaultStrategy(),
  });

  React.useEffect(() => {
    if (defaultStrategy && !strategy) {
      setStrategy(defaultStrategy);
    }
  }, [defaultStrategy, strategy]);

  const { data: redTeam, isLoading: isLoadingRedTeam } = useQuery({
    queryKey: ['ai_red_team'],
    queryFn: () => applicationIntelligenceApi.getRedTeamFindings(),
  });

  const { data: interviewQuestions, isLoading: isLoadingInterview } = useQuery({
    queryKey: ['ai_interview_qs', selectedProgramId],
    queryFn: () => applicationIntelligenceApi.getInterviewQuestions(selectedProgramId),
  });

  const { data: evaluatorPersonas, isLoading: isLoadingPersonas } = useQuery({
    queryKey: ['ai_evaluator_personas'],
    queryFn: () => applicationIntelligenceApi.getEvaluatorPersonas(),
  });

  const { data: personaVerdicts, isLoading: isLoadingVerdicts } = useQuery<ProgramPersonaVerdict[]>({
    queryKey: ['ai_persona_verdicts', selectedProgramId, stage],
    queryFn: () =>
      startupFit?.dimension_scores
        ? applicationIntelligenceApi.getPersonaVerdicts(startupFit.dimension_scores, startupFit.overall_readiness)
        : Promise.resolve<ProgramPersonaVerdict[]>([]),
    enabled: !!startupFit?.dimension_scores,
  });

  const { data: comparison, isLoading: isLoadingComparison } = useQuery({
    queryKey: ['ai_program_comparison', stage],
    queryFn: () => applicationIntelligenceApi.getProgramComparison(stage),
  });

  const { data: roadmap, isLoading: isLoadingRoadmap } = useQuery({
    queryKey: ['ai_roadmap'],
    queryFn: () => applicationIntelligenceApi.getRoadmap(),
  });

  const { data: correlations, isLoading: isLoadingCorrelations } = useQuery({
    queryKey: ['ai_correlations'],
    queryFn: () => applicationIntelligenceApi.getCorrelations(),
  });

  const handleEvaluateAnswer = async () => {
    if (!selectedInterviewQ || !interviewAnswer.trim()) return;
    const questions = ensureArray<InterviewQuestion>(interviewQuestions);
    const q = questions.find((x) => x.id === selectedInterviewQ);
    if (!q) return;
    setIsEvaluating(true);
    setEvaluations(null);
    try {
      const res = await applicationIntelligenceApi.evaluateInterviewAnswer(q, interviewAnswer);
      setEvaluations(res);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleSaveStrategy = async () => {
    if (!strategy) return;
    setIsSavingStrategy(true);
    try {
      await applicationIntelligenceApi.saveApplicationStrategy('default-startup', selectedProgramId, strategy);
      setLastSavedAt(new Date());
    } finally {
      setIsSavingStrategy(false);
    }
  };

  const updateStrategyField = <K extends keyof ApplicationStrategy>(key: K, value: ApplicationStrategy[K]) => {
    setStrategy((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const readiness = startupFit?.overall_readiness ?? 0;
  const dimensions = startupFit?.dimension_scores ?? [];

  return (
    <div className="space-y-6 pb-16">
      {/* ── HERO BANNER ─────────────────────────── */}
      <div className="rounded-3xl border border-brand-orange-200/80 bg-gradient-to-br from-brand-orange-50/70 via-white to-brand-deep-pitch-50/50 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-orange-200 bg-white px-3 py-1 text-xs font-semibold text-brand-orange-700 shadow-2xs mb-3">
              <Sparkles className="h-3.5 w-3.5 text-brand-orange-500" />
              <span>Pitchmic Application Intelligence Engine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 leading-tight">
              Understand what programs actually look for — then measure your evidence against it.
            </h1>
            <p className="mt-2 text-sm sm:text-base text-slate-600 leading-relaxed">
              Pitchmic identifies what this program is looking for, measures how convincingly your startup demonstrates those qualities, identifies your evidence gaps, and helps you produce an application that accurately presents your strongest case.
            </p>
          </div>

          {/* Program Selector */}
          <div className="flex flex-col gap-2 md:w-[320px] shrink-0">
            <Label htmlFor="program-select" className="text-xs font-semibold text-slate-700">
              Select Program to Analyze
            </Label>
            <select
              id="program-select"
              value={selectedProgramId}
              onChange={(e) => setSelectedProgramId(e.target.value)}
              className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-orange-500 shadow-sm"
            >
              {ensureArray<ProgramIntelligenceProfile>(programsList).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.type}
                </option>
              ))}
            </select>
            {programProfile && (
              <div className="text-[11px] text-slate-500 leading-snug bg-white/60 border border-slate-200/60 rounded-xl p-2.5">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                  <DollarSign className="h-3 w-3 text-brand-orange-600" />
                  {programProfile.investment}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <Globe2 className="h-3 w-3 text-slate-500" />
                  {programProfile.geography}
                </div>
              </div>
            )}
          </div>
        </div>

        {startupFit && (
          <div className="mt-6 flex items-center gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
            <CircularDial score={readiness} size={96} label="Readiness" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {programProfile?.short_name ?? programProfile?.name ?? 'Program'} Selection Readiness
              </div>
              <div className="text-lg font-black text-slate-900 mt-0.5">
                {startupFit.verdict}
              </div>
              <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                Pitchmic has built a {programProfile?.name ?? 'program'}-specific rubric, compared it against your structured startup evidence, and computed the readiness score below using stage-conditioned evidence expectations (revenue is not penalized at {stage.replace('_', '-')}).
              </p>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <Link href="/company">
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> View Startup Profile
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* ── THREE-LAYER DISTINCTION BANNER ─────────────────────────── */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b border-slate-100 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="h-4 w-4 text-brand-orange-500" />
                Three-Layer Intelligence Taxonomy
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Pitchmic never mixes these layers. Correlations are never presented as &ldquo;requirements&rdquo;.
              </CardDescription>
            </div>
            <Badge variant="outline" className="bg-white text-slate-600 border-slate-200 text-[10px] font-bold">
              FACTS • SIGNALS • OUTCOMES
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200/70 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-black border border-emerald-200">L1</span>
                <div className="text-xs font-black uppercase tracking-wider text-emerald-800">Facts</div>
              </div>
              <p className="text-[11px] text-emerald-900 leading-snug">
                <strong>What the program officially says.</strong> Official requirements, questions, deadlines, investment terms, eligibility. Cited directly from program materials.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-sky-50 border border-sky-200/70 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-sky-100 text-sky-700 text-[10px] font-black border border-sky-200">L2</span>
                <div className="text-xs font-black uppercase tracking-wider text-sky-800">Signals</div>
              </div>
              <p className="text-[11px] text-sky-900 leading-snug">
                <strong>What Pitchmic infers.</strong> Derived from application questions, published interview guides, public founder guidance, cohort patterns, and partner statements.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-violet-50 border border-violet-200/70 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-violet-100 text-violet-700 text-[10px] font-black border border-violet-200">L3</span>
                <div className="text-xs font-black uppercase tracking-wider text-violet-800">Outcomes</div>
              </div>
              <p className="text-[11px] text-violet-900 leading-snug">
                <strong>What Pitchmic observes.</strong> From its own application → interview → acceptance/rejection dataset. Always phrased as <em>&ldquo;associated with higher interview rates&rdquo;</em>, never as <em>&ldquo;required&rdquo;</em>.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── PROGRAM INTELLIGENCE PROFILE + RUBRIC TABS ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Program Profile Card */}
        {programProfile && (
          <Card className="lg:col-span-1 border-slate-200 shadow-sm">
            <CardHeader className="bg-slate-50/60 border-b border-slate-100 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Brain className="h-4 w-4 text-brand-orange-500" />
                    Program Intelligence Profile
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    {programProfile.name} · {programProfile.type}
                  </CardDescription>
                </div>
                <Badge variant="default" className="bg-brand-orange-500 text-[10px] font-bold">
                  L1 + L2 + L3
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Stage</div>
                  <div className="text-xs font-bold text-slate-900 mt-0.5">{programProfile.stage}</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Investment</div>
                  <div className="text-xs font-bold text-slate-900 mt-0.5">{programProfile.investment}</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Format</div>
                  <div className="text-xs font-bold text-slate-900 mt-0.5">{programProfile.application_format}</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Deadline</div>
                  <div className="text-xs font-bold text-slate-900 mt-0.5">{programProfile.deadline_text}</div>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Selection Signals</span>
                  <Badge variant="outline" className="text-[9px] text-slate-500 border-slate-200 bg-white">
                    Weighted / 10
                  </Badge>
                </div>
                <div className="space-y-2">
                  {ensureArray<ProgramSelectionSignal>(programRubric?.signals).slice(0, 5).map((sig) => (
                    <div key={sig.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span className="text-xs font-bold text-slate-900">{sig.criterion}</span>
                          <Badge className={`text-[8px] px-1.5 py-0 border ${sourceBadgeClass(sig.source_type)}`}>
                            {sig.source_type}
                          </Badge>
                          <Badge className={`text-[8px] px-1.5 py-0 ${confidenceBadgeClass(sig.confidence)}`}>
                            {sig.confidence}
                          </Badge>
                        </div>
                        <span className="text-xs font-black text-slate-900 shrink-0">{sig.weight}/10</span>
                      </div>
                      <ScoreBar label="" value={sig.weight} max={10} />
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200/60">
                  <div className="text-[9px] font-bold uppercase text-rose-600">Founder Bar</div>
                  <div className="text-[11px] font-black text-rose-900 mt-0.5">{programProfile.founder_quality_bar}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200/60">
                  <div className="text-[9px] font-bold uppercase text-amber-700">Evidence Bar</div>
                  <div className="text-[11px] font-black text-amber-900 mt-0.5">{programProfile.evidence_expectations_bar}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-violet-50 border border-violet-200/60">
                  <div className="text-[9px] font-bold uppercase text-violet-700">Interview</div>
                  <div className="text-[11px] font-black text-violet-900 mt-0.5">{programProfile.interview_intensity}</div>
                </div>
              </div>

              <div className="text-[10px] text-slate-400 leading-tight pt-1">
                Profile generated {formatDate(programProfile.created_at)}. Source badges:
                <span className="mx-1 px-1 rounded bg-emerald-100 text-emerald-700 font-semibold">OFFICIAL</span>
                <span className="mr-1 px-1 rounded bg-sky-100 text-sky-700 font-semibold">INFERRED</span>
                <span className="px-1 rounded bg-violet-100 text-violet-700 font-semibold">OBSERVED</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Program Rubric Tabs */}
        <Card className="lg:col-span-2 border-slate-200 shadow-sm">
          <CardHeader className="bg-slate-50/60 border-b border-slate-100 pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-brand-orange-500" />
                  Program Rubric
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  The concrete evaluation model this program uses. Examine each tab to understand the evaluation.
                </CardDescription>
              </div>
              <div className="inline-flex p-1 rounded-xl bg-slate-200/80 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setRubricTab('requirements')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all',
                    rubricTab === 'requirements' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <ListChecks className="h-3.5 w-3.5" />
                  Requirements ({ensureArray<ProgramRequirement>(programRubric?.requirements).length})
                </button>
                <button
                  type="button"
                  onClick={() => setRubricTab('questions')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all',
                    rubricTab === 'questions' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <FileQuestion className="h-3.5 w-3.5" />
                  Questions ({ensureArray<ProgramApplicationQuestion>(programRubric?.questions).length})
                </button>
                <button
                  type="button"
                  onClick={() => setRubricTab('signals')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all',
                    rubricTab === 'signals' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <Target className="h-3.5 w-3.5" />
                  Selection Signals ({ensureArray<ProgramSelectionSignal>(programRubric?.signals).length})
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            <AnimatePresence mode="wait">
              {rubricTab === 'requirements' && (
                <motion.div
                  key="requirements"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3"
                >
                  {ensureArray<ProgramRequirement>(programRubric?.requirements).length === 0 && (
                    <div className="text-xs text-slate-400 text-center py-8">No requirements available.</div>
                  )}
                  {ensureArray<ProgramRequirement>(programRubric?.requirements).map((req) => (
                    <div key={req.id} className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-brand-orange-200/60 hover:bg-brand-orange-50/10 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-[10px] capitalize">
                              {req.category}
                            </Badge>
                            <Badge className={`text-[10px] border ${importanceBadgeClass(req.importance)}`}>
                              {req.importance.replace('_', ' ')}
                            </Badge>
                          </div>
                          <p className="text-xs font-semibold text-slate-900 leading-relaxed">{req.description}</p>
                          {req.rationale && (
                            <p className="text-[11px] text-slate-500 mt-1.5 italic leading-snug">
                              <strong>Rationale:</strong> {req.rationale}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}

              {rubricTab === 'questions' && (
                <motion.div
                  key="questions"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3"
                >
                  {ensureArray<ProgramApplicationQuestion>(programRubric?.questions).length === 0 && (
                    <div className="text-xs text-slate-400 text-center py-8">No questions available.</div>
                  )}
                  {ensureArray<ProgramApplicationQuestion>(programRubric?.questions).map((q) => (
                    <div key={q.id} className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-brand-orange-200/60 hover:bg-brand-orange-50/10 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <div className="w-7 h-7 shrink-0 rounded-full bg-brand-orange-100 text-brand-orange-700 text-xs font-black flex items-center justify-center border border-brand-orange-200">
                            Q{q.question_number}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-900 leading-relaxed">{q.label}</p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-[10px]">
                                Maps to: {q.rubric_dimension}
                              </Badge>
                              <Badge className={`text-[10px] border ${importanceBadgeClass(q.importance)}`}>
                                Importance: {q.importance.replace('_', ' ')}
                              </Badge>
                              {q.max_char_limit && (
                                <span className="text-[10px] text-slate-400 font-medium">
                                  Limit: {q.max_char_limit.toLocaleString()} chars
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}

              {rubricTab === 'signals' && (
                <motion.div
                  key="signals"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3"
                >
                  {ensureArray<ProgramSelectionSignal>(programRubric?.signals).length === 0 && (
                    <div className="text-xs text-slate-400 text-center py-8">No selection signals modeled.</div>
                  )}
                  {ensureArray<ProgramSelectionSignal>(programRubric?.signals).map((sig) => (
                    <div key={sig.id} className="p-4 rounded-xl border border-slate-200 bg-white hover:border-brand-orange-200/60 hover:bg-brand-orange-50/10 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-black text-slate-900">{sig.criterion}</span>
                            <Badge className={`text-[9px] px-1.5 py-0 border font-bold ${sourceBadgeClass(sig.source_type)}`}>
                              {sig.source_type}
                            </Badge>
                            <Badge className={`text-[9px] px-1.5 py-0 font-bold ${confidenceBadgeClass(sig.confidence)}`}>
                              Confidence: {sig.confidence}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            {sig.evidence_text}
                          </p>
                          {sig.official_source_ref && (
                            <p className="text-[10px] text-slate-500 flex items-center gap-1 italic">
                              <BookOpen className="h-3 w-3" />
                              {sig.official_source_ref}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 w-[120px] text-center">
                          <div className="text-2xl font-black text-slate-900">{sig.weight}</div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Weight / 10</div>
                          <div className="mt-1.5 w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div
                              className="h-2 rounded-full bg-gradient-to-r from-brand-orange-400 to-brand-orange-600"
                              style={{ width: `${(sig.weight / 10) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>

      {/* ── STARTUP PROFILE + STAGE + SELECTION READINESS ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Startup Profile Summary */}
        <Card className="lg:col-span-1 border-slate-200 shadow-sm">
          <CardHeader className="bg-slate-50/60 border-b border-slate-100 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-brand-orange-500" />
                  Startup Profile
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Structured evidence & stage calibration
                </CardDescription>
              </div>
              <Link href="/company">
                <Badge variant="outline" className="border-brand-orange-300 text-brand-orange-700 bg-brand-orange-50/50 text-[10px] font-bold hover:bg-brand-orange-100 cursor-pointer">
                  Open →
                </Badge>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            {/* Stage Selector */}
            <div>
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 block">
                Evidence Stage Calibration
              </Label>
              <div className="grid grid-cols-4 gap-1.5 bg-slate-200/70 p-1 rounded-xl">
                {STAGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStage(opt.value)}
                    className={cn(
                      'py-1.5 px-1 rounded-lg text-[10px] font-bold transition-all',
                      stage === opt.value
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {stageExpectations?.description && (
                <p className="text-[10px] text-slate-500 mt-1.5 leading-tight">
                  {stageExpectations.description}
                </p>
              )}
            </div>

            <Separator />

            {/* Mini Profile */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[9px] font-bold uppercase text-slate-400">Stage</div>
                <div className="text-xs font-bold text-slate-900 mt-0.5 capitalize">{stage.replace('_', '-')}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[9px] font-bold uppercase text-slate-400">Revenue</div>
                <div className="text-xs font-bold text-slate-900 mt-0.5">$0 (Pre-Revenue)</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[9px] font-bold uppercase text-slate-400">Customers</div>
                <div className="text-xs font-bold text-slate-900 mt-0.5">3 Pilot Merchants</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[9px] font-bold uppercase text-slate-400">Team</div>
                <div className="text-xs font-bold text-slate-900 mt-0.5">1 Technical Founder</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 col-span-1">
                <div className="text-[9px] font-bold uppercase text-slate-400">Market</div>
                <div className="text-xs font-bold text-slate-900 mt-0.5">Nigeria</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 col-span-1">
                <div className="text-[9px] font-bold uppercase text-slate-400">Sector</div>
                <div className="text-xs font-bold text-slate-900 mt-0.5">Fintech</div>
              </div>
            </div>

            <Separator />

            {/* Stage Expected Evidence */}
            {stageExpectations && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  Expected Evidence ({stage.replace('_', '-')})
                </div>
                <ul className="space-y-1.5">
                  {ensureArray<string>(stageExpectations.evidence_items).map((item, i) => (
                    <li key={i} className="text-[11px] text-slate-700 flex items-start gap-1.5 leading-snug">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Selection Readiness Card */}
        <Card className="lg:col-span-2 border-slate-200 shadow-sm">
          <CardHeader className="bg-slate-50/60 border-b border-slate-100 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-brand-orange-500" />
                  Selection Readiness Score
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Stage-conditioned: {stage.replace('_', '-')} startups are <strong>not</strong> penalized for zero revenue.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                  <Target className="h-3 w-3 mr-1" /> {programProfile?.short_name ?? 'Program'} Rubric
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-start">
              {/* Dial */}
              <div className="md:col-span-2 flex flex-col items-center text-center">
                <CircularDial score={readiness} size={170} label="Readiness" />
                <div className="mt-3">
                  <div className="text-base font-black text-slate-900">{startupFit?.verdict}</div>
                  <p className="text-xs text-slate-500 mt-1 max-w-[280px] leading-relaxed">
                    This number is computed against the {programProfile?.name} rubric using the {stage}-conditioned evidence model. A different program yields a different score for the same startup.
                  </p>
                </div>
              </div>

              {/* 8 Dimensions Table */}
              <div className="md:col-span-3 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Selection Dimension Breakdown
                </div>
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 p-2.5 pl-3">Dimension</th>
                        <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 p-2.5">Assessment</th>
                        <th className="text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 p-2.5 pr-3 w-16">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ensureArray<ReadinessDimension>(dimensions).map((dim, idx) => (
                        <tr key={dim.key} className={cn('border-b border-slate-100 last:border-b-0', idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30')}>
                          <td className="p-2.5 pl-3">
                            <div className="font-bold text-slate-900">{dim.name}</div>
                            {dim.stage_concern_note && (
                              <div className="text-[10px] text-brand-orange-700 mt-0.5 leading-snug flex items-start gap-1">
                                <AlertTriangle className="h-2.5 w-2.5 shrink-0 mt-0.5" />
                                {dim.stage_concern_note}
                              </div>
                            )}
                          </td>
                          <td className="p-2.5">
                            <div className="flex items-center gap-2">
                              <Badge className={cn('text-[10px] font-bold',
                                dim.assessment_label === 'Strong' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                                dim.assessment_label === 'Moderate' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                                'bg-rose-100 text-rose-800 border border-rose-200'
                              )}>
                                {dim.assessment_label}
                              </Badge>
                              <div className="flex-1 min-w-[80px] bg-slate-100 h-1.5 rounded-full overflow-hidden hidden sm:block">
                                <div
                                  className={`h-1.5 rounded-full ${dimensionProgressColor(dim.score)}`}
                                  style={{ width: `${dim.score}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="p-2.5 pr-3 text-right font-black text-slate-900">{dim.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Biggest Weaknesses */}
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200/60">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5 mb-1.5">
                    <AlertOctagon className="h-3 w-3" />
                    Biggest Weaknesses
                  </div>
                  <ul className="space-y-0.5 text-[11px] text-rose-900 leading-snug">
                    {ensureArray<ReadinessDimension>(dimensions)
                      .filter((d) => d.score < 60)
                      .sort((a, b) => a.score - b.score)
                      .slice(0, 4)
                      .map((d, i) => (
                        <li key={d.key} className="flex items-start gap-1.5">
                          <span className="font-black text-rose-700 shrink-0">{i + 1}.</span>
                          <span className="font-semibold">{d.name} evidence</span>
                          {ensureArray<string>(d.missing_evidence)?.[0] && (
                            <span className="text-rose-700/80">— {ensureArray<string>(d.missing_evidence)[0]}</span>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── PROGRAM FIT ANALYSIS (STRENGTHS / GAPS / RISKS) ─────────────────────────── */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="bg-slate-50/60 border-b border-slate-100 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Scale className="h-4 w-4 text-brand-orange-500" />
                Program Fit Analysis
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                How your evidence stacks against the {programProfile?.name} selection model.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Strengths */}
            <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/70">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center border border-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </div>
                <div className="text-xs font-black uppercase tracking-wider text-emerald-800">Strengths</div>
                <Badge className="ml-auto bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                  {ensureArray<string>(startupFit?.strengths).length}
                </Badge>
              </div>
              <ul className="space-y-2">
                {ensureArray<string>(startupFit?.strengths).map((s, i) => (
                  <li key={i} className="text-[11px] text-emerald-900 leading-snug flex items-start gap-1.5">
                    <Check className="h-3 w-3 text-emerald-600 shrink-0 mt-0.5" />
                    <span className="font-medium">{s}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Gaps */}
            <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/70">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center border border-amber-200">
                  <AlertTriangle className="h-3.5 w-3.5" />
                </div>
                <div className="text-xs font-black uppercase tracking-wider text-amber-800">Gaps</div>
                <Badge className="ml-auto bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200">
                  {ensureArray<string>(startupFit?.gaps).length}
                </Badge>
              </div>
              <ul className="space-y-2">
                {ensureArray<string>(startupFit?.gaps).map((g, i) => (
                  <li key={i} className="text-[11px] text-amber-900 leading-snug flex items-start gap-1.5">
                    <AlertCircle className="h-3 w-3 text-amber-600 shrink-0 mt-0.5" />
                    <span className="font-medium">{g}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Risks */}
            <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200/70">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center border border-rose-200">
                  <ShieldAlert className="h-3.5 w-3.5" />
                </div>
                <div className="text-xs font-black uppercase tracking-wider text-rose-800">Risks</div>
                <Badge className="ml-auto bg-rose-100 text-rose-800 text-[10px] font-bold border border-rose-200">
                  {ensureArray<string>(startupFit?.risks).length}
                </Badge>
              </div>
              <ul className="space-y-2">
                {ensureArray<string>(startupFit?.risks).map((r, i) => (
                  <li key={i} className="text-[11px] text-rose-900 leading-snug flex items-start gap-1.5">
                    <AlertOctagon className="h-3 w-3 text-rose-600 shrink-0 mt-0.5" />
                    <span className="font-medium">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── EVIDENCE GRAPH + HIDDEN EVIDENCE ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Evidence Graph */}
        <Card className="lg:col-span-2 border-slate-200 shadow-sm">
          <CardHeader className="bg-slate-50/60 border-b border-slate-100 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-brand-orange-500" />
                  Evidence Graph
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Claims are linked to supporting evidence with 3-way Declared / Verified / Observed values.
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-white border-slate-200 text-slate-600 text-[10px] font-bold">
                {ensureArray<EvidenceGraphNode>(evidenceGraph).length} Claims • L3 Verified
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            {ensureArray<EvidenceGraphNode>(evidenceGraph).length === 0 && (
              <div className="text-xs text-slate-400 text-center py-8">No evidence graph loaded.</div>
            )}
            {ensureArray<EvidenceGraphNode>(evidenceGraph).map((node) => (
              <div key={node.claim_id} className="p-4 rounded-xl border border-slate-200 bg-white hover:border-brand-orange-200/60 transition-colors">
                {/* Claim Header */}
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-[10px] capitalize">
                        {node.claim_type}
                      </Badge>
                      <Badge className={cn('text-[10px] font-bold',
                        node.materiality === 'critical' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                        node.materiality === 'high' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                        node.materiality === 'medium' ? 'bg-sky-100 text-sky-800 border border-sky-200' :
                        'bg-slate-100 text-slate-700 border border-slate-200'
                      )}>
                        {node.materiality} materiality
                      </Badge>
                      <span className="text-[10px] text-slate-400 font-medium">
                        Confidence: {node.confidence}%
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-900 leading-snug">{node.claim_statement}</p>
                  </div>
                </div>

                {/* 3-way Values */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-[9px] font-bold uppercase text-slate-400">Declared</div>
                    <div className="text-[11px] font-bold text-slate-800 mt-0.5 leading-tight">{node.declared_value}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="text-[9px] font-bold uppercase text-emerald-700">Verified</div>
                    <div className="text-[11px] font-bold text-emerald-900 mt-0.5 leading-tight">{node.verified_value ?? 'Pending'}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-sky-50 border border-sky-200">
                    <div className="text-[9px] font-bold uppercase text-sky-700">Observed</div>
                    <div className="text-[11px] font-bold text-sky-900 mt-0.5 leading-tight">{node.observed_value ?? 'N/A'}</div>
                  </div>
                </div>

                {/* Evidence Items */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
                    <Layers className="h-3 w-3" />
                    Linked Evidence ({ensureArray<LinkedEvidenceItem>(node.evidence_items).length})
                  </div>
                  <div className="space-y-1.5">
                    {ensureArray<LinkedEvidenceItem>(node.evidence_items).map((ev) => (
                      <div
                        key={ev.id}
                        className={cn(
                          'p-2 rounded-lg border flex items-start justify-between gap-2',
                          ev.discovered_hidden
                            ? 'bg-brand-orange-50/40 border-brand-orange-200/70'
                            : 'bg-slate-50 border-slate-200'
                        )}
                      >
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <div className={cn(
                            'w-5 h-5 shrink-0 rounded flex items-center justify-center mt-0.5',
                            ev.verification_status === 'third_party_verified' ? 'bg-emerald-100 text-emerald-700' :
                            ev.verification_status === 'documentary' ? 'bg-sky-100 text-sky-700' :
                            ev.verification_status === 'machine_observed' ? 'bg-violet-100 text-violet-700' :
                            'bg-slate-200 text-slate-600'
                          )}>
                            <Check className="h-2.5 w-2.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-bold text-slate-900 truncate">{ev.title}</div>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span className="text-[9px] text-slate-500 capitalize bg-slate-100 px-1 rounded">
                                {ev.source_type.replace(/_/g, ' ')}
                              </span>
                              <span className="text-[9px] text-slate-500 capitalize bg-slate-100 px-1 rounded">
                                {ev.verification_status.replace(/_/g, ' ')}
                              </span>
                              <span className="text-[9px] font-bold text-slate-600">
                                Conf: {ev.confidence}%
                              </span>
                              {ev.discovered_hidden && (
                                <Badge className="bg-brand-orange-100 text-brand-orange-800 text-[8px] font-bold border border-brand-orange-200">
                                  HIDDEN FIND
                                </Badge>
                              )}
                            </div>
                            {ev.notes && (
                              <p className="text-[10px] text-slate-500 mt-1 leading-snug italic">{ev.notes}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Hidden Evidence */}
        <Card className="lg:col-span-1 border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-gradient-to-br from-brand-orange-50 to-amber-50 border-b border-brand-orange-200/60 pb-4">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Eye className="h-4 w-4 text-brand-orange-600" />
                Hidden Evidence Scanner
              </CardTitle>
              <CardDescription className="text-xs text-slate-600 mt-0.5">
                Pitchmic found quantified proof in your uploaded materials that you are not yet citing in applications.
              </CardDescription>
            </div>
          </CardHeader>
          <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200/70 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-[11px] text-rose-900 leading-snug">
              <strong className="font-black uppercase tracking-tight">You are underselling your traction.</strong> The artifacts you uploaded contain stronger evidence than what currently appears in your pitch deck and application drafts.
            </div>
          </div>
          <CardContent className="p-5 space-y-3">
            {ensureArray<HiddenEvidenceFinding>(hiddenFindings).length === 0 && (
              <div className="text-xs text-slate-400 text-center py-6">No hidden findings.</div>
            )}
            {ensureArray<HiddenEvidenceFinding>(hiddenFindings).map((f) => (
              <div key={f.id} className="p-3 rounded-xl border border-slate-200 bg-white hover:border-brand-orange-200/60 hover:bg-brand-orange-50/20 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-[9px] capitalize">
                      {f.category}
                    </Badge>
                    <Badge className={`text-[9px] font-bold ${confidenceBadgeClass(f.confidence)}`}>
                      {f.confidence}
                    </Badge>
                  </div>
                  {f.quantified_value && (
                    <Badge className="bg-emerald-100 text-emerald-800 text-[10px] font-black border border-emerald-200 shrink-0">
                      {f.quantified_value}
                    </Badge>
                  )}
                </div>
                <p className="text-xs font-bold text-slate-900 leading-snug">{f.description}</p>
                <div className="mt-2 p-2 rounded-lg bg-brand-orange-50/60 border border-brand-orange-100">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-brand-orange-700 flex items-center gap-1 mb-0.5">
                    <Lightbulb className="h-2.5 w-2.5" /> Use this in:
                  </div>
                  <p className="text-[10px] text-brand-orange-900 leading-snug">{f.suggested_usage}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── EVIDENCE GAP MAP ─────────────────────────── */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="bg-slate-50/60 border-b border-slate-100 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-brand-orange-500" />
                Evidence Gap Map
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                For every requirement: what they want → what you claim → what you can prove → what is missing.
              </CardDescription>
            </div>
            <Badge variant="outline" className="bg-white border-slate-200 text-slate-600 text-[10px] font-bold">
              {ensureArray<EvidenceGapRow>(gapMap).length} Program Requirements
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          {ensureArray<EvidenceGapRow>(gapMap).length === 0 && (
            <div className="text-xs text-slate-400 text-center py-8">No gap map loaded.</div>
          )}
          {ensureArray<EvidenceGapRow>(gapMap).map((row) => (
            <div key={row.id} className="p-4 rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black text-slate-900">{row.program_requirement_title}</span>
                  <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-[10px] capitalize">
                    {row.program_requirement_category}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                {/* Want */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 relative">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                    <Target className="h-2.5 w-2.5" /> What They Want
                  </div>
                  <p className="text-[11px] text-slate-800 leading-snug font-medium">{row.what_they_want}</p>
                  <ChevronRight className="hidden md:block absolute top-1/2 -right-2 h-4 w-4 text-slate-300 -translate-y-1/2 bg-white rounded-full border border-slate-200" />
                </div>
                {/* Claim */}
                <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 relative">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-sky-700 mb-1 flex items-center gap-1">
                    <MessageSquare className="h-2.5 w-2.5" /> What You Claim
                  </div>
                  <p className="text-[11px] text-sky-900 leading-snug font-medium">{row.what_you_claim}</p>
                  <ChevronRight className="hidden md:block absolute top-1/2 -right-2 h-4 w-4 text-sky-300 -translate-y-1/2 bg-white rounded-full border border-sky-200" />
                </div>
                {/* Prove */}
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 relative">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 mb-1 flex items-center gap-1">
                    <CheckCircle2 className="h-2.5 w-2.5" /> What You Can Prove
                  </div>
                  <p className="text-[11px] text-emerald-900 leading-snug font-medium">{row.what_you_can_prove}</p>
                  <ChevronRight className="hidden md:block absolute top-1/2 -right-2 h-4 w-4 text-emerald-300 -translate-y-1/2 bg-white rounded-full border border-emerald-200" />
                </div>
                {/* Missing + Recommendation */}
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-rose-700 mb-1 flex items-center gap-1">
                    <AlertTriangle className="h-2.5 w-2.5" /> What Is Missing
                  </div>
                  <p className="text-[11px] text-rose-900 leading-snug font-medium mb-2">{row.what_is_missing}</p>
                  <div className="pt-2 border-t border-rose-200/60">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-rose-700 mb-0.5 flex items-center gap-1">
                      <Lightbulb className="h-2.5 w-2.5" /> Recommendation:
                    </div>
                    <p className="text-[10px] text-rose-800 leading-snug">{row.recommendation}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── APPLICATION STRATEGY BUILDER ─────────────────────────── */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="bg-slate-50/60 border-b border-slate-100 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Compass className="h-4 w-4 text-brand-orange-500" />
                Application Strategy — Core Narrative
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Define your core narrative BEFORE generating answers. State is retained across tab switches.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {lastSavedAt && (
                <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Saved {formatDate(lastSavedAt.toISOString())}
                </span>
              )}
              <Button
                size="sm"
                onClick={handleSaveStrategy}
                disabled={isSavingStrategy || !strategy}
                className="gap-1.5"
              >
                {isSavingStrategy ? (
                  <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                ) : (
                  <><Check className="h-3.5 w-3.5" /> Save Strategy</>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          {!strategy && isLoadingDefaultStrategy && (
            <div className="text-xs text-slate-400 text-center py-8">Loading application strategy…</div>
          )}
          {strategy && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Problem */}
              <div>
                <Label htmlFor="strat-problem" className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-1.5">
                  <AlertTriangle className="h-3 w-3 text-rose-500" /> 1. Problem
                </Label>
                <Textarea
                  id="strat-problem"
                  rows={4}
                  value={strategy.problem}
                  onChange={(e) => updateStrategyField('problem', e.target.value)}
                  className="text-xs leading-relaxed"
                />
              </div>
              {/* Founder Advantage */}
              <div>
                <Label htmlFor="strat-founder" className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-1.5">
                  <UserCheck className="h-3 w-3 text-emerald-500" /> 2. Founder Advantage
                </Label>
                <Textarea
                  id="strat-founder"
                  rows={4}
                  value={strategy.founder_advantage}
                  onChange={(e) => updateStrategyField('founder_advantage', e.target.value)}
                  className="text-xs leading-relaxed"
                />
              </div>
              {/* Why Now */}
              <div>
                <Label htmlFor="strat-whynow" className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-1.5">
                  <Clock className="h-3 w-3 text-sky-500" /> 3. Why Now
                </Label>
                <Textarea
                  id="strat-whynow"
                  rows={4}
                  value={strategy.why_now}
                  onChange={(e) => updateStrategyField('why_now', e.target.value)}
                  className="text-xs leading-relaxed"
                />
              </div>
              {/* Proof */}
              <div>
                <Label htmlFor="strat-proof" className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-1.5">
                  <FileCheck2 className="h-3 w-3 text-violet-500" /> 4. Proof
                </Label>
                <Textarea
                  id="strat-proof"
                  rows={4}
                  value={strategy.proof}
                  onChange={(e) => updateStrategyField('proof', e.target.value)}
                  className="text-xs leading-relaxed"
                />
              </div>
              {/* Program Fit */}
              <div>
                <Label htmlFor="strat-fit" className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-1.5">
                  <Target className="h-3 w-3 text-brand-orange-500" /> 5. Program Fit
                </Label>
                <Textarea
                  id="strat-fit"
                  rows={4}
                  value={strategy.program_fit}
                  onChange={(e) => updateStrategyField('program_fit', e.target.value)}
                  className="text-xs leading-relaxed"
                />
              </div>
              {/* Primary Weakness */}
              <div>
                <Label htmlFor="strat-weakness" className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-1.5">
                  <AlertCircle className="h-3 w-3 text-amber-500" /> 6. Primary Weakness
                </Label>
                <Textarea
                  id="strat-weakness"
                  rows={4}
                  value={strategy.primary_weakness}
                  onChange={(e) => updateStrategyField('primary_weakness', e.target.value)}
                  className="text-xs leading-relaxed"
                />
              </div>
              {/* Mitigation — full width */}
              <div className="md:col-span-2">
                <Label htmlFor="strat-mitigation" className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-1.5">
                  <ShieldCheck className="h-3 w-3 text-emerald-500" /> 7. Mitigation
                </Label>
                <Textarea
                  id="strat-mitigation"
                  rows={3}
                  value={strategy.mitigation}
                  onChange={(e) => updateStrategyField('mitigation', e.target.value)}
                  className="text-xs leading-relaxed"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── MULTI-PROGRAM READINESS COMPARISON ─────────────────────────── */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="bg-slate-50/60 border-b border-slate-100 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-brand-orange-500" />
                Program-Specific Readiness Comparison
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Same startup profile — different scores. The evaluator changed, not the startup. Readiness is program-relative.
              </CardDescription>
            </div>
            <Badge variant="outline" className="bg-white border-slate-200 text-slate-600 text-[10px] font-bold">
              Stage: {stage.replace('_', '-')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <div className="space-y-3">
            {ensureArray<ProgramReadinessComparison>(comparison)
              .sort((a, b) => b.overall_score - a.overall_score)
              .map((cmp) => {
                const isSelected = cmp.program_id === selectedProgramId;
                return (
                  <button
                    key={cmp.program_id}
                    type="button"
                    onClick={() => setSelectedProgramId(cmp.program_id)}
                    className={cn(
                      'w-full text-left p-4 rounded-xl border transition-all',
                      isSelected
                        ? 'border-brand-orange-500 bg-brand-orange-50/30 ring-2 ring-brand-orange-500/20 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    )}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-black text-slate-900">{cmp.program_name}</span>
                          {isSelected && (
                            <Badge className="bg-brand-orange-500 text-white text-[10px] font-bold">ACTIVE</Badge>
                          )}
                        </div>
                        <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden mt-2">
                          <div
                            className={cn(
                              'h-3 rounded-full transition-all duration-500',
                              cmp.overall_score >= 80 ? 'bg-emerald-500' :
                              cmp.overall_score >= 65 ? 'bg-brand-orange-500' :
                              cmp.overall_score >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                            )}
                            style={{ width: `${cmp.overall_score}%` }}
                          />
                        </div>
                        <div className="flex items-center gap-3 mt-2 flex-wrap text-[11px]">
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            <Plus className="h-2.5 w-2.5" /> {cmp.key_strength}
                          </span>
                          <span className="text-rose-700 font-semibold flex items-center gap-1">
                            <AlertTriangle className="h-2.5 w-2.5" /> {cmp.key_gap}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={cn('text-2xl font-black',
                          cmp.overall_score >= 80 ? 'text-emerald-600' :
                          cmp.overall_score >= 65 ? 'text-brand-orange-600' :
                          cmp.overall_score >= 50 ? 'text-amber-600' : 'text-rose-600'
                        )}>
                          {cmp.overall_score}
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">/ 100</div>
                        <div className="text-[10px] text-slate-600 mt-0.5 max-w-[140px] leading-tight">{cmp.verdict}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* ── RED TEAM ASSESSMENT + INTERVIEW + PERSONAS ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="bg-gradient-to-br from-rose-50 to-rose-100/40 border-b border-rose-200/60 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold text-rose-900 flex items-center gap-2">
                  <AlertOctagon className="h-4 w-4 text-rose-600" />
                  Application Red Team
                </CardTitle>
                <CardDescription className="text-xs text-rose-700 mt-0.5">
                  Skeptical selection committee view: Why might we reject this startup?
                </CardDescription>
              </div>
              <Badge className="bg-rose-100 text-rose-800 text-[10px] font-bold border border-rose-200">
                {ensureArray<RedTeamFinding>(redTeam).length} Rejection Vectors
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-3">
            {ensureArray<RedTeamFinding>(redTeam).length === 0 && (
              <div className="text-xs text-slate-400 text-center py-8">No red-team findings.</div>
            )}
            {ensureArray<RedTeamFinding>(redTeam).map((r) => (
              <div key={r.id} className="p-3.5 rounded-xl border border-rose-200/60 bg-rose-50/40">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={cn('text-[10px] font-black w-9 justify-center',
                      r.fix_priority === 1 ? 'bg-rose-600 text-white' :
                      r.fix_priority === 2 ? 'bg-orange-500 text-white' :
                      r.fix_priority === 3 ? 'bg-amber-500 text-white' :
                      'bg-slate-500 text-white'
                    )}>
                      P{r.fix_priority}
                    </Badge>
                    <Badge className={cn('text-[10px] font-bold',
                      r.severity === 'high' ? 'bg-rose-200 text-rose-900 border border-rose-300' :
                      r.severity === 'medium' ? 'bg-amber-200 text-amber-900 border border-amber-300' :
                      'bg-slate-200 text-slate-800 border border-slate-300'
                    )}>
                      {r.severity.toUpperCase()}
                    </Badge>
                  </div>
                  {r.estimated_score_impact_points && (
                    <Badge className="bg-emerald-100 text-emerald-800 text-[10px] font-black border border-emerald-200 shrink-0">
                      +{r.estimated_score_impact_points} pts
                    </Badge>
                  )}
                </div>
                <div className="mb-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700 mb-0.5">
                    Why we would reject:
                  </div>
                  <p className="text-xs font-bold text-rose-900 leading-relaxed">{r.rejection_reason}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-white border border-rose-200/50">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-0.5 flex items-center gap-1">
                    <Zap className="h-2.5 w-2.5" /> How to fix (Priority {r.fix_priority}):
                  </div>
                  <p className="text-[11px] text-slate-800 leading-snug font-medium">{r.fix_description}</p>
                  <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                    <TrendingUp className="h-2.5 w-2.5" /> {r.estimated_impact}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* INTERVIEW + PERSONAS stacked */}
        <div className="space-y-6">
          {/* Interview Simulation */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="bg-slate-50/60 border-b border-slate-100 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-brand-orange-500" />
                    Interview Simulation
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    Program-specific published interview questions. Answer and Pitchmic evaluates on 6 dimensions.
                  </CardDescription>
                </div>
                <Badge className="bg-violet-100 text-violet-800 text-[10px] font-bold border border-violet-200">
                  {ensureArray<InterviewQuestion>(interviewQuestions).length} Questions
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              {/* Question List */}
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                {ensureArray<InterviewQuestion>(interviewQuestions).map((q) => {
                  const isSelected = selectedInterviewQ === q.id;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => {
                        setSelectedInterviewQ(q.id);
                        setEvaluations(null);
                        setInterviewAnswer('');
                      }}
                      className={cn(
                        'w-full text-left p-3 rounded-xl border transition-all text-xs',
                        isSelected
                          ? 'border-brand-orange-500 bg-brand-orange-50/30 ring-2 ring-brand-orange-500/20 font-bold shadow-xs'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 font-medium'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-[9px] shrink-0">
                          {q.category}
                        </Badge>
                        {isSelected ? (
                          <ChevronUp className="h-3.5 w-3.5 text-brand-orange-600 shrink-0 mt-0.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                        )}
                      </div>
                      <p className="mt-1.5 leading-relaxed">{q.question}</p>
                    </button>
                  );
                })}
              </div>

              {/* Answer + Evaluate */}
              <AnimatePresence>
                {selectedInterviewQ && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-3 overflow-hidden"
                  >
                    <Separator />
                    <div>
                      <Label htmlFor="interview-answer" className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                        Your Answer
                      </Label>
                      <Textarea
                        id="interview-answer"
                        rows={5}
                        value={interviewAnswer}
                        onChange={(e) => setInterviewAnswer(e.target.value)}
                        placeholder="Write your interview answer. Pitchmic will evaluate it for founder-market fit, specificity, evidence, conviction, memorability, and program alignment."
                        className="text-xs leading-relaxed"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={handleEvaluateAnswer}
                        disabled={isEvaluating || !interviewAnswer.trim()}
                        className="gap-1.5"
                      >
                        {isEvaluating ? (
                          <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Evaluating…</>
                        ) : (
                          <><Send className="h-3.5 w-3.5" /> Evaluate Answer</>
                        )}
                      </Button>
                    </div>

                    {/* Evaluation Results */}
                    {evaluations && evaluations.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
                      >
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                          <Scale className="h-3 w-3 text-brand-orange-500" /> Answer Evaluation (6 dimensions, 0–100)
                        </div>
                        <div className="space-y-2">
                          {evaluations.map((ev) => (
                            <div key={ev.dimension} className="space-y-1">
                              <ScoreDimension label={ev.dimension} value={ev.score} />
                              <p className="text-[10px] text-slate-600 leading-snug ml-[120px]">{ev.feedback}</p>
                            </div>
                          ))}
                        </div>
                        {/* Low evidence warning */}
                        {evaluations.some((e) => e.dimension === 'Evidence' && e.score < 60) && (
                          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2">
                            <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-rose-900 leading-snug">
                              <strong className="font-black">Your answer is persuasive but contains no concrete evidence supporting your claim.</strong> Add quantified proof, specific anecdotes, or verifiable artifacts to raise the Evidence dimension above 60.
                            </p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>

          {/* Evaluator Personas */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="bg-slate-50/60 border-b border-slate-100 pb-3">
              <div>
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Users className="h-4 w-4 text-brand-orange-500" />
                  Evaluator Personas & Verdicts
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Four distinct reviewers evaluate the same application through their individual lenses.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ensureArray<EvaluatorPersona>(evaluatorPersonas).map((persona) => {
                  const verdict = ensureArray<ProgramPersonaVerdict>(personaVerdicts).find((v) => v.persona_id === persona.id);
                  return (
                    <div
                      key={persona.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-brand-orange-200/60 hover:bg-brand-orange-50/10 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center border',
                            persona.type === 'PROGRAM_DIRECTOR' ? 'bg-sky-100 text-sky-700 border-sky-200' :
                            persona.type === 'INVESTOR' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                            persona.type === 'TECHNICAL' ? 'bg-violet-100 text-violet-700 border-violet-200' :
                            'bg-rose-100 text-rose-700 border-rose-200'
                          )}>
                            {persona.type === 'PROGRAM_DIRECTOR' && <UserCheck className="h-4 w-4" />}
                            {persona.type === 'INVESTOR' && <DollarSign className="h-4 w-4" />}
                            {persona.type === 'TECHNICAL' && <Cpu className="h-4 w-4" />}
                            {persona.type === 'SKEPTICAL' && <EyeOff className="h-4 w-4" />}
                          </div>
                          <div>
                            <div className="text-xs font-black text-slate-900 leading-tight">{persona.name}</div>
                            <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-[9px] mt-0.5">
                              {persona.type.replace('_', ' ')}
                            </Badge>
                          </div>
                        </div>
                        {verdict && (
                          <Badge className={cn('text-[10px] font-black',
                            verdict.verdict === 'lean-in' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                            verdict.verdict === 'neutral' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            'bg-rose-100 text-rose-800 border border-rose-200'
                          )}>
                            {verdict.verdict.toUpperCase()}
                          </Badge>
                        )}
                      </div>
                      <div className="mb-2">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Focus Areas</div>
                        <div className="flex flex-wrap gap-1">
                          {persona.focus_areas.map((fa, i) => (
                            <span key={i} className="text-[9px] font-medium bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                              {fa}
                            </span>
                          ))}
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 italic leading-snug mb-2">{persona.bias_description}</p>
                      {verdict && (
                        <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                          <p className="text-[10px] text-slate-700 leading-snug"><strong className="font-bold">Rationale:</strong> {verdict.rationale}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── FUNDING READINESS ROADMAP ─────────────────────────── */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className={cn(
          'border-b pb-4',
          roadmap && !roadmap.should_submit
            ? 'bg-gradient-to-br from-rose-50 to-amber-50 border-rose-200/60'
            : 'bg-gradient-to-br from-emerald-50 to-sky-50 border-emerald-200/60'
        )}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className={cn(
                'text-base font-bold flex items-center gap-2',
                roadmap && !roadmap.should_submit ? 'text-rose-900' : 'text-emerald-900'
              )}>
                <Rocket className={cn('h-4 w-4', roadmap && !roadmap.should_submit ? 'text-rose-600' : 'text-emerald-600')} />
                Funding Readiness Roadmap
              </CardTitle>
              <CardDescription className={cn('text-xs mt-0.5', roadmap && !roadmap.should_submit ? 'text-rose-700' : 'text-emerald-700')}>
                Pre-submission improvement actions with estimated score impact.
              </CardDescription>
            </div>
            {roadmap && !roadmap.should_submit && (
              <Badge className="bg-rose-600 text-white text-[11px] font-black px-3 py-1 shadow-xs animate-pulse">
                ⚠ Don&apos;t submit yet
              </Badge>
            )}
            {roadmap && roadmap.should_submit && (
              <Badge className="bg-emerald-600 text-white text-[11px] font-black px-3 py-1 shadow-xs">
                Ready to submit
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-5">
          {!roadmap ? (
            <div className="text-xs text-slate-400 text-center py-8">Loading roadmap…</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
              {/* Baseline vs Projected */}
              <div className="md:col-span-1 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
                    <CircularDial score={roadmap.baseline_readiness} size={96} label="Baseline" />
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-2">Current Readiness</div>
                  </div>
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                    <CircularDial score={roadmap.projected_readiness} size={96} label="Projected" />
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mt-2">After Improvements</div>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-brand-orange-50 border border-brand-orange-200/60">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-brand-orange-700">Net Gain</span>
                    <span className="text-sm font-black text-brand-orange-600">
                      +{roadmap.projected_readiness - roadmap.baseline_readiness} pts
                    </span>
                  </div>
                  <div className="w-full bg-white h-2 rounded-full overflow-hidden border border-brand-orange-100">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-brand-orange-400 to-emerald-500 transition-all duration-700"
                      style={{
                        width: `${Math.min(100, ((roadmap.projected_readiness - roadmap.baseline_readiness) / Math.max(1, (100 - roadmap.baseline_readiness))) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
                {roadmap.projected_milestone && (
                  <div className="p-3 rounded-xl bg-violet-50 border border-violet-200/60">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-violet-700 mb-0.5 flex items-center gap-1">
                      <Star className="h-2.5 w-2.5" /> Projected Milestone
                    </div>
                    <p className="text-[11px] text-violet-900 leading-snug font-medium">{roadmap.projected_milestone}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="md:col-span-2 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Highest-Impact Actions ({roadmap.recommended_actions?.length ?? 0})
                </div>
                <div className="space-y-2">
                  {ensureArray<ReadinessAction>(roadmap.recommended_actions)
                    .sort((a, b) => a.priority - b.priority)
                    .map((action, idx) => (
                      <div
                        key={action.id}
                        className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-brand-orange-200/60 hover:bg-brand-orange-50/20 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 flex-1 min-w-0">
                            <div className={cn(
                              'w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-xs font-black text-white',
                              action.priority === 1 ? 'bg-rose-500' :
                              action.priority === 2 ? 'bg-orange-500' :
                              action.priority === 3 ? 'bg-amber-500' :
                              'bg-slate-500'
                            )}>
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-xs font-black text-slate-900">{action.action}</span>
                                <Badge className={cn('text-[9px] font-black',
                                  action.priority === 1 ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                                  action.priority === 2 ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                                  action.priority === 3 ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                                  'bg-slate-100 text-slate-700 border border-slate-200'
                                )}>
                                  P{action.priority}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-slate-600 leading-snug">{action.rationale}</p>
                              {action.timeframe && (
                                <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                  <Clock className="h-2.5 w-2.5" /> {action.timeframe}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <Badge className="bg-emerald-100 text-emerald-800 text-[11px] font-black border border-emerald-200 px-2">
                              +{action.impact_points}
                            </Badge>
                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">impact pts</div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── OUTCOME CORRELATIONS ─────────────────────────── */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="bg-slate-50/60 border-b border-slate-100 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Activity className="h-4 w-4 text-violet-500" />
                Outcome Learning &amp; Historical Correlations
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Pitchmic observations from its own application → interview → acceptance dataset.
              </CardDescription>
            </div>
            <Badge className="bg-violet-100 text-violet-800 text-[10px] font-bold border border-violet-200">
              L3 · OUTCOMES · Never requirements
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-5 space-y-3">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2 text-[11px] text-slate-600 leading-snug">
            <HelpCircle className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
            Pitchmic does <strong className="font-black text-slate-900">not</strong> present these correlations as official program criteria. Language is cautious: &ldquo;associated with higher interview rates,&rdquo; not &ldquo;required.&rdquo; These are observations from Pitchmic&apos;s dataset.
          </div>
          {ensureArray<CorrelationNote>(correlations).length === 0 && (
            <div className="text-xs text-slate-400 text-center py-6">No outcome data yet for this program.</div>
          )}
          {ensureArray<CorrelationNote>(correlations).map((note) => (
            <div
              key={note.id}
              className={cn(
                'p-4 rounded-xl border',
                note.layer === 'OUTCOMES'
                  ? 'bg-violet-50/60 border-violet-200/60'
                  : 'bg-sky-50/60 border-sky-200/60'
              )}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <Badge className={cn('text-[9px] font-black',
                  note.layer === 'OUTCOMES'
                    ? 'bg-violet-200 text-violet-900 border border-violet-300'
                    : 'bg-sky-200 text-sky-900 border border-sky-300'
                )}>
                  L{note.layer === 'OUTCOMES' ? '3' : '2'} · {note.layer}
                </Badge>
                {note.sample_size_hint && (
                  <span className="text-[10px] text-slate-500 font-medium italic">
                    Dataset: {note.sample_size_hint}
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-slate-900 leading-relaxed">{note.text}</p>
              <p className="text-[11px] text-slate-600 mt-2 leading-snug italic flex items-start gap-1">
                <AlertCircle className="h-3 w-3 text-slate-400 shrink-0 mt-0.5" />
                {note.caveat}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
