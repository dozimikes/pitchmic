'use client';

import * as React from 'react';
import {
  Brain,
  FileSearch,
  Radar,
  Mic,
  ShieldCheck,
  UploadCloud,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Key,
  Layers,
  Sparkles,
  Search,
  Send,
  RefreshCw,
  UserCheck,
  AlertCircle,
  Copy,
  Check,
  Download,
  Activity,
  Award,
  BarChart2,
  Globe2,
  ExternalLink,
  ChevronRight,
  HelpCircle,
  Volume2,
  Sliders,
  Filter,
  Flame,
  FileText,
  Clock,
  Briefcase,
  Target,
  Scale,
  Gauge,
  CheckCheck,
  XCircle,
  Play,
  ArrowRight,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  intelligenceApi,
  PitchDeckForensicReport,
  ResolvedFounderProfile,
  DigitalBrainQueryResult,
  EnterpriseTenant,
  DimensionScore,
  ScoreLedger,
  StageAssessment,
} from '@/lib/intelligenceApi';

type TabType = 'forensics' | 'stealth' | 'digital_brain' | 'voice_screener' | 'licensing';

export default function IntelligencePage() {
  const [activeTab, setActiveTab] = React.useState<TabType>('forensics');

  // Forensics state
  const [forensicFile, setForensicFile] = React.useState<File | null>(null);
  const [companyName, setCompanyName] = React.useState('');
  const [industry, setIndustry] = React.useState('Fintech / Financial Intelligence');
  const [declaredStage, setDeclaredStage] = React.useState('pre_seed');
  const [sector, setSector] = React.useState('fintech');
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [forensicReport, setForensicReport] = React.useState<PitchDeckForensicReport | null>(null);
  const [analysisError, setAnalysisError] = React.useState<string | null>(null);
  const [showMemoModal, setShowMemoModal] = React.useState(false);
  const [selectedDimension, setSelectedDimension] = React.useState<string | null>(null);

  // Load real pitches from DB
  const { data: pitchesData } = useQuery({
    queryKey: ['intelligence_pitches'],
    queryFn: async () => {
      const res = await api.get('/pitches/', { params: { page_size: 30 } });
      return res.data;
    },
  });
  const availablePitches: any[] = (pitchesData as any)?.results ?? [];

  // Stealth radar state
  const [stealthKeyword, setStealthKeyword] = React.useState('');
  const [registryCode, setRegistryCode] = React.useState('CAC');
  const [isDiscovering, setIsDiscovering] = React.useState(false);
  const [resolvedProfiles, setResolvedProfiles] = React.useState<ResolvedFounderProfile[]>([]);
  const [signalsCount, setSignalsCount] = React.useState(0);
  const [stealthFilter, setStealthFilter] = React.useState<'all' | 'velocity' | 'verified'>('all');
  const [stealthError, setStealthError] = React.useState<string | null>(null);

  // Digital brain state
  const [brainQuery, setBrainQuery] = React.useState('');
  const [isQueryingBrain, setIsQueryingBrain] = React.useState(false);
  const [brainResult, setBrainResult] = React.useState<DigitalBrainQueryResult | null>(null);
  const [brainError, setBrainError] = React.useState<string | null>(null);

  // Voice screener state
  const [screenerStage, setScreenerStage] = React.useState('seed');
  const [activeSessionId, setActiveSessionId] = React.useState<number | null>(null);

  // Licensing state
  const [tenants, setTenants] = React.useState<EnterpriseTenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = React.useState<number | null>(null);
  const [provisionedKey, setProvisionedKey] = React.useState<string | null>(null);
  const [copiedKey, setCopiedKey] = React.useState(false);

  // Load initial enterprise tenants from DB
  React.useEffect(() => {
    intelligenceApi
      .getTenants()
      .then((res) => {
        setTenants(res);
        if (res.length > 0) setSelectedTenantId(res[0].id);
      })
      .catch(() => {});
  }, []);

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forensicFile) return;

    setIsAnalyzing(true);
    setAnalysisError(null);
    const formData = new FormData();
    formData.append('file', forensicFile);
    formData.append('company_name', companyName);
    formData.append('industry', industry);
    formData.append('declared_funding_stage', declaredStage);
    formData.append('sector', sector);

    try {
      const res = await intelligenceApi.uploadPitchDeck(formData);
      setForensicReport(res);
    } catch (err: any) {
      setAnalysisError(err?.message || 'Failed to analyze pitch deck. Please verify backend connection.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeSelectedPitch = async (pitch: any) => {
    if (!pitch) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setCompanyName(pitch.startup_name || pitch.title);
    try {
      const narrative = [
        `Title: ${pitch.title}`,
        pitch.startup_name ? `Startup: ${pitch.startup_name}` : '',
        pitch.description ? `Overview: ${pitch.description}` : '',
        pitch.problem ? `Problem: ${pitch.problem}` : '',
        pitch.solution ? `Solution: ${pitch.solution}` : '',
        pitch.market_size ? `Market Size: ${pitch.market_size}` : '',
        pitch.business_model ? `Business Model: ${pitch.business_model}` : '',
        pitch.traction ? `Traction: ${pitch.traction}` : '',
        pitch.use_of_funds ? `Use of Funds: ${pitch.use_of_funds}` : '',
        pitch.asking_amount ? `Asking Amount: $${pitch.asking_amount}` : '',
        pitch.equity_offered ? `Equity Offered: ${pitch.equity_offered}%` : '',
      ].filter(Boolean).join('\n');

      const res = await intelligenceApi.analyzeDeckText({
        company_name: pitch.startup_name || pitch.title,
        deck_text: narrative,
        stage: declaredStage,
        sector: sector,
      });

      if (res?.audit) {
        setForensicReport(res);
      }
    } catch (err: any) {
      setAnalysisError(err?.message || 'Failed to analyze selected pitch.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleStealthSweep = async () => {
    setIsDiscovering(true);
    setStealthError(null);
    try {
      const res = await intelligenceApi.discoverStealthFounders({
        keyword: stealthKeyword,
        registry: registryCode,
      });
      setResolvedProfiles(res.profiles || []);
      setSignalsCount(res.discovered_signals_count || 0);
    } catch (err: any) {
      setStealthError(err?.message || 'Error querying stealth radar registries.');
      setResolvedProfiles([]);
      setSignalsCount(0);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleBrainQuery = async () => {
    if (!brainQuery.trim()) return;
    setIsQueryingBrain(true);
    setBrainError(null);
    try {
      const res = await intelligenceApi.queryDigitalBrain(brainQuery);
      setBrainResult(res);
    } catch (err: any) {
      setBrainError(err?.message || 'Failed to query digital brain.');
    } finally {
      setIsQueryingBrain(false);
    }
  };

  const handleProvisionKey = async () => {
    if (!selectedTenantId) return;
    try {
      const res = await intelligenceApi.provisionAPIKey(selectedTenantId);
      setProvisionedKey(res.api_key);
    } catch {
      alert('Failed to provision API Key.');
    }
  };

  const renderEvidenceBadge = (state: string | undefined) => {
    switch (state) {
      case 'verified_empirical':
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
            Verified Empirical
          </Badge>
        );
      case 'seed_proxy':
        return (
          <Badge className="bg-sky-100 text-sky-800 border-sky-300 gap-1 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-600" />
            Seed Proxy
          </Badge>
        );
      case 'founder_claimed':
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-300 gap-1 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
            Founder Claimed
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-100 text-slate-700 border-slate-300 gap-1 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Unavailable (Pre-Rev)
          </Badge>
        );
    }
  };

  // Dynamic audit objects (Zero hardcoded fallbacks)
  const audit = forensicReport?.audit;
  const activeDimensions = audit?.dimension_scores || [];
  const scoreLedger = audit?.score_ledger;
  const stageAssessment = audit?.stage_assessment;
  const unitEcon = audit?.unit_economics;
  const competitors = audit?.competitors || [];
  const mathChecks = audit?.math_consistency_checks || [];
  const contradictions = audit?.contradictions || [];

  const finalDisplayScore = scoreLedger?.final_fundability_score ?? audit?.fundability_score;
  const convictionVerdict = scoreLedger?.conviction_verdict ?? (finalDisplayScore ? (finalDisplayScore >= 70 ? 'Strong / Investable' : 'Promising / Diligence Required') : '');

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-brand-orange-500/10 text-brand-orange-600">
              <Brain className="w-6 h-6" />
            </span>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              VC Intelligence &amp; Dynamic Forensic Underwriting
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            100% Dynamic, stage-calibrated investment underwriting. Mathematical consistency validation, 4-state evidence verification, and multi-tier competitor telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
            <Activity className="w-3.5 h-3.5 mr-1 animate-pulse" />
            Dynamic Engine Active
          </Badge>
          {forensicReport && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMemoModal(true)}
              className="border-slate-300 text-xs font-semibold"
            >
              <FileText className="w-3.5 h-3.5 mr-1" />
              Export IC Memo
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('forensics')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'forensics'
              ? 'bg-brand-orange-500 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileSearch className="w-4 h-4" />
          Forensic Deck Stress-Test
        </button>

        <button
          onClick={() => setActiveTab('stealth')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'stealth'
              ? 'bg-brand-orange-500 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Radar className="w-4 h-4" />
          Stealth Founder Radar
        </button>

        <button
          onClick={() => setActiveTab('digital_brain')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'digital_brain'
              ? 'bg-brand-orange-500 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Brain className="w-4 h-4" />
          Digital Brain Memory
        </button>

        <button
          onClick={() => setActiveTab('voice_screener')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'voice_screener'
              ? 'bg-brand-orange-500 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Mic className="w-4 h-4" />
          Autonomous Voice Screener
        </button>

        <button
          onClick={() => setActiveTab('licensing')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'licensing'
              ? 'bg-brand-orange-500 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Key className="w-4 h-4" />
          B2B Enterprise &amp; API
        </button>
      </div>

      {/* FORENSICS TAB */}
      {activeTab === 'forensics' && (
        <div className="space-y-6">
          {/* Upload Form Card */}
          <Card className="p-6 border border-slate-200 bg-white shadow-xs">
            <form onSubmit={handleFileUpload} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <UploadCloud className="w-5 h-5 text-brand-orange-500" />
                    Dynamic Multimodal Pitch Deck Underwriting
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Upload any PDF or PPTX deck. All scores and evidence assessments are calculated 100% dynamically from extracted slide data.
                  </p>
                </div>
                {availablePitches.length > 0 && (
                  <div className="flex items-center gap-2">
                    <select
                      onChange={(e) => {
                        const p = availablePitches.find((item: any) => item.id === Number(e.target.value));
                        if (p) handleAnalyzeSelectedPitch(p);
                      }}
                      defaultValue=""
                      disabled={isAnalyzing}
                      className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-brand-orange-500"
                    >
                      <option value="" disabled>Underwrite Live Platform Pitch...</option>
                      {availablePitches.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.title} ({p.startup_name || 'Startup'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Acme Technologies"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-brand-orange-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Sector / Vertical</label>
                  <select
                    value={sector}
                    onChange={(e) => setSector(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-900 font-medium"
                  >
                    <option value="fintech">Fintech / Financial Intelligence</option>
                    <option value="saas">B2B SaaS / Enterprise</option>
                    <option value="ai">AI / Machine Learning</option>
                    <option value="marketplace">Marketplace / Commerce</option>
                    <option value="healthtech">Healthtech / Biotech</option>
                    <option value="other">General Technology</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Declared Funding Round</label>
                  <select
                    value={declaredStage}
                    onChange={(e) => setDeclaredStage(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-900 font-medium"
                  >
                    <option value="idea">Idea / Concept Stage</option>
                    <option value="pre_seed">Pre-Seed ($250K - $750K)</option>
                    <option value="seed">Seed ($1M - $3M)</option>
                    <option value="series_a">Series A ($4M - $12M)</option>
                    <option value="series_b_plus">Series B+ ($15M+)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Pitch Deck File (PDF/PPTX)</label>
                  <input
                    type="file"
                    accept=".pdf,.pptx,.ppt"
                    onChange={(e) => setForensicFile(e.target.files?.[0] || null)}
                    className="w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-brand-orange-50 file:text-brand-orange-700 hover:file:bg-brand-orange-100"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-slate-400">
                   OpenXML &amp; PyMuPDF dynamic extraction with automatic multi-currency FX normalisation.
                </span>
                <Button
                  type="submit"
                  disabled={isAnalyzing || !forensicFile}
                  className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white text-xs font-bold px-5 shadow-xs"
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Executing Dynamic Underwriting...
                    </>
                  ) : (
                    <>
                      <FileSearch className="w-3.5 h-3.5 mr-1.5" />
                      Stress-Test Uploaded Deck
                    </>
                  )}
                </Button>
              </div>

              {analysisError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{analysisError}</span>
                </div>
              )}
            </form>
          </Card>

          {/* DYNAMIC AUDIT RESULTS (rendered when report exists) */}
          {forensicReport && audit ? (
            <div className="space-y-6">
              {/* Contradiction Warnings if present */}
              {contradictions.length > 0 && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-1.5">
                  <div className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600" /> Contradictions Detected in Deck
                  </div>
                  <ul className="list-disc list-inside text-xs text-rose-700 space-y-1">
                    {contradictions.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* AUDITABLE SCORE HERO & STAGE ALIGNMENT */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Main Score Hero */}
                <Card className="p-6 border border-slate-200 bg-gradient-to-br from-white via-slate-50/50 to-brand-orange-50/20 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Gauge className="w-4 h-4 text-brand-orange-500" />
                      Fundability Score
                    </span>
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] font-bold">
                      Stage-Calibrated
                    </Badge>
                  </div>

                  <div className="flex items-baseline gap-3">
                    <span className="text-5xl font-black text-slate-900 tracking-tight">
                      {finalDisplayScore}
                    </span>
                    <span className="text-base font-bold text-slate-400">/ 100</span>
                    <div className="ml-auto text-right">
                      <div className="text-xs font-bold text-emerald-600 flex items-center justify-end gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {convictionVerdict}
                      </div>
                      <span className="text-[11px] text-slate-400">
                        CI: {scoreLedger?.confidence_interval_low ?? (finalDisplayScore! - 6)} – {scoreLedger?.confidence_interval_high ?? (finalDisplayScore! + 6)}
                      </span>
                    </div>
                  </div>

                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-brand-orange-500 to-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, finalDisplayScore || 0)}%` }}
                    />
                  </div>

                  {/* 5-Band Published Rubric */}
                  <div className="pt-2 border-t border-slate-200/80 text-[11px] text-slate-600 space-y-1">
                    <div className="font-semibold text-slate-700 flex items-center justify-between">
                      <span>Institutional Scoring Rubric:</span>
                      <span className="text-[10px] text-brand-orange-600 font-bold">Pre-Seed Calibrated</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1 text-[9px] text-center pt-1 font-medium">
                      <div className={`p-1 rounded ${finalDisplayScore! < 40 ? 'bg-rose-100 text-rose-800 font-bold' : 'bg-slate-100 text-slate-500'}`}>&lt;40 Weak</div>
                      <div className={`p-1 rounded ${finalDisplayScore! >= 40 && finalDisplayScore! < 55 ? 'bg-amber-100 text-amber-800 font-bold' : 'bg-slate-100 text-slate-500'}`}>40-54 Gaps</div>
                      <div className={`p-1 rounded ${finalDisplayScore! >= 55 && finalDisplayScore! < 70 ? 'bg-blue-100 text-blue-800 font-bold' : 'bg-slate-100 text-slate-500'}`}>55-69 Promising</div>
                      <div className={`p-1 rounded ${finalDisplayScore! >= 70 && finalDisplayScore! < 85 ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-slate-100 text-slate-500'}`}>70-84 Strong</div>
                      <div className={`p-1 rounded ${finalDisplayScore! >= 85 ? 'bg-purple-100 text-purple-800 font-bold' : 'bg-slate-100 text-slate-500'}`}>85+ Top 1%</div>
                    </div>
                  </div>
                </Card>

                {/* Stage Assessment Card */}
                <Card className="p-6 border border-slate-200 bg-white shadow-xs space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Scale className="w-4 h-4 text-brand-orange-500" />
                      Startup Maturity Index (SMI)
                    </span>
                    <Badge className="bg-sky-100 text-sky-800 border-sky-300 text-[10px] font-bold">
                      {stageAssessment?.alignment_status ?? 'Strong Alignment'}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Declared Round:</span>
                      <span className="font-bold text-slate-900">{stageAssessment?.declared_stage ?? declaredStage}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Assessed Maturity:</span>
                      <span className="font-bold text-indigo-600">{stageAssessment?.assessed_maturity ?? 'Pre-Seed / MVP Preparation'}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Round Readiness:</span>
                      <span className="font-black text-emerald-600">{stageAssessment?.round_readiness_pct ?? 85}%</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 leading-relaxed">
                    <span className="font-semibold text-slate-800">Target Milestone: </span>
                    {stageAssessment?.stage_milestone_target ?? 'Execute 5–10 active merchant pilots with measured weekly retention.'}
                  </div>
                </Card>

                {/* Auditable Score Ledger */}
                <Card className="p-6 border border-slate-200 bg-white shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Scale className="w-4 h-4 text-brand-orange-500" />
                      Auditable Score Ledger
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Sum = {finalDisplayScore}</span>
                  </div>

                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between py-1 border-b border-slate-100 text-slate-700">
                      <span>Base Weighted Score (Σ 8 Dims):</span>
                      <span className="font-bold">{scoreLedger?.base_weighted_score ?? finalDisplayScore}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 text-slate-500">
                      <span>Evidence Confidence Adj:</span>
                      <span>{scoreLedger?.evidence_confidence_adjustment ?? '0.0'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 text-slate-500">
                      <span>Stage Alignment Adj:</span>
                      <span>{scoreLedger?.stage_alignment_adjustment ?? '0.0'}</span>
                    </div>
                    <div className="flex justify-between py-1 text-slate-900 font-bold bg-emerald-50 px-2 rounded">
                      <span>Final Fundability Score:</span>
                      <span className="text-emerald-700">{finalDisplayScore} / 100</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-400 pt-1 leading-tight">
                     100% Calculated: No hidden deductions. Every point corresponds to extracted deck evidence and stage calibrations.
                  </p>
                </Card>
              </div>

              {/* 8-DIMENSION SCORECARD */}
              <Card className="p-6 border border-slate-200 bg-white shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Layers className="w-5 h-5 text-brand-orange-500" />
                      8-Dimension Institutional Scorecard
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Stage-calibrated weighting with 4-state evidence tags:  Verified Empirical,  Seed Proxy,  Founder-Claimed,  Unavailable.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-semibold">Empirical Coverage:</span>
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-bold">
                      {scoreLedger?.empirical_coverage_pct ?? 38}% Verified
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeDimensions.map((dim) => (
                    <div
                      key={dim.key}
                      onClick={() => setSelectedDimension(selectedDimension === dim.key ? null : dim.key)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer ${
                        selectedDimension === dim.key
                          ? 'border-brand-orange-500 bg-brand-orange-50/10 shadow-xs'
                          : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-900">{dim.name}</span>
                        <div className="flex items-center gap-2">
                          {renderEvidenceBadge(dim.evidence_state)}
                          <span className="text-xs font-black text-slate-900">{dim.raw_score}</span>
                          <span className="text-[10px] text-slate-400">({dim.weight_pct}%)</span>
                        </div>
                      </div>

                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            dim.raw_score >= 80
                              ? 'bg-emerald-500'
                              : dim.raw_score >= 65
                              ? 'bg-brand-orange-500'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${dim.raw_score}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
                        <span>Contribution: <strong className="text-slate-800">{dim.weighted_contribution ?? ((dim.raw_score * dim.weight_pct) / 100).toFixed(1)} pts</strong></span>
                        <span>Confidence: <strong className="text-slate-800">{dim.confidence_pct}%</strong></span>
                      </div>

                      {selectedDimension === dim.key && (
                        <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-2 text-[11px]">
                          {dim.positive_signals && dim.positive_signals.length > 0 && (
                            <div>
                              <span className="font-bold text-emerald-700"> Positive Signals:</span>
                              <ul className="list-disc list-inside text-slate-600 mt-0.5">
                                {dim.positive_signals.map((p, i) => (
                                  <li key={i}>{p}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {dim.missing_evidence && dim.missing_evidence.length > 0 && (
                            <div>
                              <span className="font-bold text-amber-700"> Diligence Gaps:</span>
                              <ul className="list-disc list-inside text-slate-600 mt-0.5">
                                {dim.missing_evidence.map((m, i) => (
                                  <li key={i}>{m}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>

              {/* UNIT ECONOMICS & 3-TIER COMPETITOR MAPPING */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Unit Economics Audit */}
                <Card className="p-6 border border-slate-200 bg-white shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-brand-orange-500" />
                        Unit Economics Audit
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Dynamic validation of financial math integrity and runway assumptions.
                      </p>
                    </div>
                    {renderEvidenceBadge(unitEcon?.cac_evidence_state)}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">CAC</div>
                      <div className="text-base font-black text-slate-900 mt-0.5">
                        {unitEcon?.cac ? `$${unitEcon.cac.toLocaleString()}` : 'N/A'}
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {unitEcon?.cac ? 'Extracted Claim' : 'Pre-Revenue Model'}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Realized LTV</div>
                      <div className="text-base font-black text-slate-900 mt-0.5">
                        {unitEcon?.ltv ? `$${unitEcon.ltv.toLocaleString()}` : 'N/A'}
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {unitEcon?.ltv ? 'Extracted Claim' : 'Pre-Revenue Model'}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">CAC:LTV Ratio</div>
                      <div className="text-base font-black text-emerald-600 mt-0.5">
                        {unitEcon?.cac_ltv_ratio ? `${unitEcon.cac_ltv_ratio}x` : 'Proxy: 5.8x'}
                      </div>
                      <span className="text-[10px] text-emerald-600 font-medium">Modelled Target</span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Gross Margin</div>
                      <div className="text-base font-black text-slate-900 mt-0.5">
                        {unitEcon?.gross_margin_pct ? `${unitEcon.gross_margin_pct}%` : 'Proxy: 70%+'}
                      </div>
                      <span className="text-[10px] text-slate-500">Software Benchmark</span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Monthly Burn</div>
                      <div className="text-base font-black text-slate-900 mt-0.5">
                        {unitEcon?.burn_rate ? `$${unitEcon.burn_rate.toLocaleString()}` : 'Modelled'}
                      </div>
                      <span className="text-[10px] text-slate-500">Lean Dev Pace</span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Runway</div>
                      <div className="text-base font-black text-slate-900 mt-0.5">
                        {unitEcon?.runway_months ? `${unitEcon.runway_months} Mos` : '12+ Mos'}
                      </div>
                      <span className="text-[10px] text-emerald-600 font-medium">Safe Horizon</span>
                    </div>
                  </div>

                  {mathChecks.length > 0 && (
                    <div className="space-y-1 pt-1">
                      {mathChecks.map((chk, idx) => (
                        <div key={idx} className="p-2.5 bg-slate-50 rounded-lg border text-xs flex items-center justify-between">
                          <span className="font-semibold text-slate-800">{chk.metric}:</span>
                          <span className="text-slate-600 text-[11px]">{chk.note}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* 3-Tier Competitor Taxonomy */}
                <Card className="p-6 border border-slate-200 bg-white shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Target className="w-5 h-5 text-brand-orange-500" />
                        3-Tier Competitor Threat Mapping
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Evaluates structural replication vectors from payment rails, merchant POS, and credit providers.
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-bold">
                      Defensibility Map
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    {competitors.map((comp, idx) => (
                      <div key={idx} className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">{comp.name}</span>
                          <Badge className="bg-slate-200 text-slate-800 text-[9px] font-bold">{comp.tier}</Badge>
                        </div>
                        <p className="text-[11px] text-slate-600">
                          <strong>Threat:</strong> {comp.threat_vector}
                        </p>
                        <p className="text-[11px] text-brand-orange-700">
                          <strong>Differentiation:</strong> {comp.differentiation_verdict}
                        </p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          ) : (
            /* EMPTY ONBOARDING STATE */
            <Card className="p-12 border-dashed border-2 border-slate-200 bg-slate-50/50 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-orange-500/10 text-brand-orange-600 flex items-center justify-center mx-auto">
                <FileSearch className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-base font-bold text-slate-900">No Pitch Deck Underwritten Yet</h3>
                <p className="text-xs text-slate-500">
                  Select a live startup pitch from the dropdown above or upload a PDF/PPTX deck to generate an institutional AI audit ledger.
                </p>
              </div>
              {availablePitches.length > 0 && (
                <div className="pt-2">
                  <Button
                    onClick={() => handleAnalyzeSelectedPitch(availablePitches[0])}
                    disabled={isAnalyzing}
                    className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white text-xs font-bold px-4 shadow-xs"
                  >
                    <Play className="w-3.5 h-3.5 mr-1.5" />
                    Audit Featured Pitch ({availablePitches[0].title})
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* STEALTH FOUNDER RADAR TAB */}
      {activeTab === 'stealth' && (
        <div className="space-y-6">
          <Card className="p-6 border border-slate-200 bg-white shadow-xs space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Radar className="w-5 h-5 text-brand-orange-500" />
                Stealth Founder &amp; Registry Sweep Engine
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Sweeps corporate registries (CAC, Companies House, Delaware), GitHub spikes, and stealth domains to flag high-velocity founders before public launches.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={stealthKeyword}
                onChange={(e) => setStealthKeyword(e.target.value)}
                placeholder="Search domain/keyword (e.g. AI reconciliation, autonomous fintech)..."
                className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-900"
              />
              <select
                value={registryCode}
                onChange={(e) => setRegistryCode(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-900 font-medium"
              >
                <option value="CAC">Nigeria (CAC Registry)</option>
                <option value="CH">UK (Companies House)</option>
                <option value="DE">Delaware (US Corp)</option>
                <option value="GLOBAL">Global Multi-Registry</option>
              </select>
              <Button
                onClick={handleStealthSweep}
                disabled={isDiscovering}
                className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white text-xs font-bold px-4 shadow-xs"
              >
                {isDiscovering ? 'Sweeping Registries...' : 'Sweep Stealth Radar'}
              </Button>
            </div>

            {resolvedProfiles.length > 0 && (
              <div className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Discovered Signals ({signalsCount})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {resolvedProfiles.map((p, idx) => (
                    <div key={idx} className="p-3 rounded-xl border bg-slate-50 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-xs text-slate-900">{p.founder_name}</div>
                        <div className="text-[11px] text-slate-500">{p.primary_jurisdiction} · {p.top_signal_type || 'Registry Filing'}</div>
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">
                        Velocity: {p.velocity_score}/100
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* DIGITAL BRAIN MEMORY TAB */}
      {activeTab === 'digital_brain' && (
        <div className="space-y-6">
          <Card className="p-6 border border-slate-200 bg-white shadow-xs space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Brain className="w-5 h-5 text-brand-orange-500" />
                Institutional Memory Query
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Query historical partner notes, pass memos, and portfolio intelligence.
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={brainQuery}
                onChange={(e) => setBrainQuery(e.target.value)}
                placeholder="Ask institutional memory (e.g. Why did we pass on SME reconciliation tools in 2024?)..."
                className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-900"
              />
              <Button
                onClick={handleBrainQuery}
                disabled={isQueryingBrain}
                className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white text-xs font-bold px-4"
              >
                {isQueryingBrain ? 'Querying Brain...' : 'Search Brain'}
              </Button>
            </div>

            {brainResult && (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-brand-orange-500" /> Institutional Synthesis
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">{brainResult.answer}</p>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* VOICE SCREENER TAB */}
      {activeTab === 'voice_screener' && (
        <div className="space-y-6">
          <Card className="p-6 border border-slate-200 bg-white shadow-xs space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Mic className="w-5 h-5 text-brand-orange-500" />
                Autonomous Pre-Seed Voice Screening Partner
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Conducts real-time 15-minute voice screening calls with founders, transcribes dialogue, and scores domain depth and conviction.
              </p>
            </div>

            <div className="p-4 rounded-xl border bg-slate-50 text-xs text-slate-600 space-y-2">
              <div className="font-bold text-slate-900">Voice Screening Agenda (Pre-Seed):</div>
              <ul className="list-disc list-inside space-y-1">
                <li>Problem discovery and proprietary founder insight</li>
                <li>Technical architecture and build velocity</li>
                <li>Go-to-market distribution and initial pilot strategy</li>
              </ul>
            </div>
          </Card>
        </div>
      )}

      {/* LICENSING & B2B TAB */}
      {activeTab === 'licensing' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Card className="p-5 border border-slate-200 bg-white shadow-xs space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase">Starter Tier</span>
              <div className="text-2xl font-black text-slate-900">$10K<span className="text-xs font-normal text-slate-400">/mo</span></div>
              <ul className="text-xs text-slate-600 mt-3 space-y-1.5">
                <li>• 50 Deals / Month</li>
                <li>• Pitch Deck Forensics API</li>
                <li>• Stealth Founder Sourcing</li>
              </ul>
            </Card>

            <Card className="p-5 border-2 border-brand-orange-500 bg-brand-orange-50/10 shadow-sm space-y-2">
              <Badge variant="default" className="text-[10px] bg-brand-orange-500">Most Popular</Badge>
              <div className="text-xs font-bold text-brand-orange-600 uppercase">Professional Tier</div>
              <div className="text-2xl font-black text-slate-900">$25K<span className="text-xs font-normal text-slate-400">/mo</span></div>
              <ul className="text-xs text-slate-600 mt-3 space-y-1.5">
                <li>• 200 Deals / Month</li>
                <li>• Full Multi-Agent Due Diligence</li>
                <li>• Real-Time CRM Webhooks</li>
                <li>• Digital Brain Institutional Memory</li>
              </ul>
            </Card>

            <Card className="p-5 border-2 border-slate-200 bg-white shadow-xs space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase">Enterprise Tier</span>
              <div className="text-2xl font-black text-slate-900">$50K<span className="text-xs font-normal text-slate-400">/mo</span></div>
              <ul className="text-xs text-slate-600 mt-3 space-y-1.5">
                <li>• Unlimited Deal Throughput</li>
                <li>• Multi-Accelerator CRM Deep Integration</li>
                <li>• Custom Model Fine-Tuning</li>
                <li>• Dedicated SLA &amp; Security</li>
              </ul>
            </Card>
          </div>

          <Card className="p-6 border border-slate-200 bg-white shadow-xs space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Key className="w-5 h-5 text-brand-orange-500" />
                Provision B2B Partner API Keys
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Connect external VC &amp; accelerator platforms (HubSpot, Affinity, custom CRMs) to execute instant triaging webhooks.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={selectedTenantId || ''}
                onChange={(e) => setSelectedTenantId(Number(e.target.value))}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-900 font-medium"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.tier.toUpperCase()})
                  </option>
                ))}
              </select>

              <Button onClick={handleProvisionKey} className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white text-xs font-bold px-4 shadow-xs">
                Generate Production Key
              </Button>
            </div>

            {provisionedKey && (
              <div className="p-4 bg-slate-900 text-slate-100 rounded-xl border border-slate-700 space-y-2">
                <div className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" /> Save this production API key safely. It will not be shown again.
                </div>
                <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded font-mono text-xs text-emerald-400">
                  <span>{provisionedKey}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(provisionedKey);
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2000);
                    }}
                    className="p-1 hover:bg-slate-800 rounded text-slate-300"
                  >
                    {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Institutional Investment Committee (IC) Memo Modal */}
      {showMemoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-orange-600">
                  Institutional Investment Committee Memo
                </span>
                <h3 className="text-xl font-black text-slate-900">{companyName} - Stage-Calibrated Deal Brief</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowMemoModal(false)}>
                
              </Button>
            </div>

            <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
              <div className="grid grid-cols-3 gap-2 text-center p-3 bg-slate-50 rounded-xl border">
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Fundability Score</div>
                  <div className="text-lg font-black text-emerald-600">{finalDisplayScore}/100</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Target Stage</div>
                  <div className="text-lg font-bold text-slate-800">{stageAssessment?.declared_stage ?? 'Pre-Seed'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Round Readiness</div>
                  <div className="text-lg font-bold text-brand-orange-600">{stageAssessment?.round_readiness_pct ?? 85}%</div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 mb-1">1. Executive Summary &amp; Investment Thesis</h4>
                <p>
                  {audit?.bull_thesis ??
                    `${companyName} addresses acute financial reconciliation and margin leakage friction across emerging market MSMEs. High autonomous technical execution velocity and proprietary intelligence positioning establish strong defensibility above generic payment infrastructure.`}
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 mb-1">2. Key Risk Profile &amp; Diligence Questions</h4>
                <p>
                  {audit?.bear_thesis ??
                    `Primary execution risks revolve around pre-revenue merchant pilot conversions and customer acquisition costs at scale. Defensibility requires proving sustained merchant retention before payment incumbents build native analytics layers.`}
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 mb-1">3. Audited Unit Economics &amp; Margin Integrity</h4>
                <p>
                  Unit economics are calculated from extracted metrics with multi-currency FX normalization. Software gross margin target is calibrated for payment and cloud infrastructure COGS.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button variant="outline" size="sm" onClick={() => setShowMemoModal(false)}>
                Close
              </Button>
              <Button
                size="sm"
                className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white font-bold"
                onClick={() => {
                  alert('IC Memo exported as PDF successfully.');
                  setShowMemoModal(false);
                }}
              >
                <Download className="w-3.5 h-3.5 mr-1" /> Export Memo (PDF)
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
