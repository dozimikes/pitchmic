/**
 * fundabilityApi.ts
 * ==================
 * API client for the Fundability Engine.
 * All calls hit /api/v1/fundability/.
 */

import { api } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EvidenceStatus =
  | 'declared'
  | 'supported'
  | 'verified'
  | 'observed'
  | 'contradicted'
  | 'outdated'
  | 'unsupported';

export type DimensionKey =
  | 'problem'
  | 'solution'
  | 'market'
  | 'team'
  | 'traction'
  | 'business_model'
  | 'defensibility'
  | 'fundraising';

export type GapSeverity = 'critical' | 'high' | 'medium' | 'low';
export type GapStatus = 'open' | 'in_progress' | 'resolved' | 'accepted';
export type ActionStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';
export type ConvictionLabel =
  | 'exceptional'
  | 'strong'
  | 'promising'
  | 'speculative'
  | 'weak';
export type StageLabel =
  | 'idea'
  | 'pre_seed'
  | 'seed'
  | 'series_a'
  | 'series_b_plus';
export type ConfidenceLabel = 'high' | 'medium' | 'low';
export type ProgramRecommendation =
  | 'apply_now'
  | 'fix_first'
  | 'not_yet'
  | 'strong_match';

export interface FundabilityDimension {
  id: string;
  dimension_key: DimensionKey;
  dimension_name: string;
  raw_score: number;
  weight_pct: number;
  weighted_contribution: number;
  evidence_state: string;
  evidence_state_display: string;
  confidence_pct: number;
  stage_concern: string;
  stage_concern_display: string;
  positive_signals: string[];
  missing_evidence: string[];
  justifications: string[];
  recommended_actions: string[];
}

export interface FundabilityGap {
  id: string;
  assessment: string;
  startup: number;
  dimension_key: DimensionKey;
  title: string;
  description: string;
  severity: GapSeverity;
  severity_display: string;
  status: GapStatus;
  status_display: string;
  current_state: string;
  expected_state: string;
  why_it_matters: string;
  evidence_required: string;
  impact: string;
  effort: string;
  priority_rank: number;
  action_count: number;
  created_at: string;
  updated_at: string;
}

export interface ImprovementAction {
  id: string;
  gap: string;
  gap_title: string;
  gap_severity: GapSeverity;
  dimension_key: DimensionKey;
  startup: number;
  action_type: string;
  action_type_display: string;
  title: string;
  description: string;
  why_investors_care: string;
  evidence_missing: string;
  how_to_obtain: string;
  target_milestone: string;
  reassess_after: string;
  status: ActionStatus;
  status_display: string;
  completed_at: string | null;
  completion_notes: string;
  estimated_score_delta: number;
  priority_rank: number;
  created_at: string;
  updated_at: string;
}

export interface ProgramReadiness {
  id: string;
  program_name: string;
  program_type: string;
  fit_score: number;
  readiness_score: number;
  evidence_gaps_count: number;
  fit_rationale: string;
  top_gap: string;
  recommendation: ProgramRecommendation;
  recommendation_display: string;
  created_at: string;
}

export interface NextBestAction {
  id: string;
  title: string;
  impact: string;
  severity: GapSeverity;
  severity_display?: string;
  estimated_score_delta: number;
  dimension_key: DimensionKey;
}

export interface TopProgramReadiness {
  id?: string;
  program_name: string;
  program_type?: string;
  fit_score: number;
  readiness_score: number;
  recommendation: ProgramRecommendation;
  recommendation_display?: string;
  evidence_gaps_count?: number;
}

export interface FundabilityAssessmentSummary {
  id: string;
  company_name: string;
  overall_score: number;
  conviction: ConvictionLabel;
  conviction_display: string;
  inferred_stage: StageLabel;
  inferred_stage_display: string;
  stage_confidence: number;
  evidence_completeness_pct: number;
  critical_gaps_count: number;
  important_gaps_count: number;
  strong_signals_count: number;
  confidence: ConfidenceLabel;
  confidence_display?: string;
  confidence_interval_low: number;
  confidence_interval_high: number;
  assessment_count?: number;
  deck_contradictions: Array<{
    title?: string;
    field?: string;
    severity?: GapSeverity;
    severity_display?: string;
    detail?: string;
    deck_value?: unknown;
    profile_value?: unknown;
  }>;
  assessed_at: string;
  is_current: boolean;
  has_assessment: boolean;
  next_best_action: NextBestAction | null;
  top_program_readiness: TopProgramReadiness[];
}

export interface FundabilityAssessment extends FundabilityAssessmentSummary {
  declared_stage: StageLabel;
  declared_stage_display: string;
  stage_rationale: string;
  bull_thesis: string;
  bear_thesis: string;
  sector: string;
  target_funding_type: string;
  target_amount_usd: string | null;
  methodology_version: string;
  dimensions: FundabilityDimension[];
  gaps: FundabilityGap[];
  program_readiness: ProgramReadiness[];
  improvement_plan: ImprovementAction[];
}

export interface EvidenceVaultItem {
  id: string;
  startup: number;
  title: string;
  description: string;
  evidence_type: string;
  evidence_type_display: string;
  dimension_tag: DimensionKey | 'financials' | 'general';
  dimension_tag_display: string;
  claim_description: string;
  file_url: string;
  external_url: string;
  status: EvidenceStatus;
  status_display: string;
  source_name: string;
  observed_date: string | null;
  confidence: number;
  contradicts_claim: string;
  created_at: string;
  updated_at: string;
}

export interface EvidenceVaultSummary {
  total_items: number;
  verified_items: number;
  completeness_pct: number;
  by_dimension: Record<
    string,
    { total: number; verified: number; dimension_display: string }
  >;
}

// ---------------------------------------------------------------------------
// Traction Metric types (for sub-profile pages)
// ---------------------------------------------------------------------------

export interface TractionMetric {
  id: string;
  startup: number;
  metric_type: string;
  metric_type_display: string;
  value: number;
  unit: string;
  period_label: string;
  period_start: string | null;
  period_end: string | null;
  evidence_status: string;
  evidence_status_display: string;
  evidence_source_description: string;
  evidence_file_url: string;
  notes: string;
  created_at: string;
}

export interface FounderProfile {
  id: string;
  startup: number;
  full_name: string;
  role: string;
  role_display: string;
  commitment: string;
  commitment_display: string;
  linkedin_url: string;
  is_primary: boolean;
  education_summary: string;
  previous_companies: string;
  previous_exits: number;
  years_industry_experience: number;
  technical_capability: number;
  commercial_capability: number;
  domain_expertise: number;
  founder_market_fit_description: string;
  responsibilities: string;
  created_at: string;
  updated_at: string;
}

export interface ProductProfile {
  id: string;
  startup: number;
  problem_statement: string;
  target_customer_description: string;
  customer_pain_frequency: string;
  current_alternatives: string;
  solution_description: string;
  product_status: string;
  product_status_display: string;
  demo_url: string;
  tech_differentiator: string;
  tech_differentiator_display: string;
  differentiator_description: string;
  moat_description: string;
  has_filed_ip: boolean;
  ip_description: string;
  updated_at: string;
}

export interface MarketProfile {
  id: string;
  startup: number;
  tam_usd: string | null;
  sam_usd: string | null;
  som_usd: string | null;
  market_growth_rate_pct: number | null;
  tam_evidence_source: string;
  tam_evidence_source_display: string;
  tam_source_citation: string;
  market_sizing_methodology: string;
  primary_geography: string;
  expansion_geography: string;
  direct_competitors: string;
  indirect_competitors: string;
  competitive_advantage: string;
  regulatory_notes: string;
  updated_at: string;
}

export interface BusinessModelProfile {
  id: string;
  startup: number;
  revenue_model: string;
  revenue_model_display: string;
  revenue_model_description: string;
  customer_type: string;
  customer_type_display: string;
  sales_model: string;
  sales_model_display: string;
  pricing_model: string;
  average_contract_value_usd: string | null;
  cac_usd: string | null;
  ltv_usd: string | null;
  cac_ltv_ratio: number | null;
  gross_margin_pct: number | null;
  payback_months: number | null;
  unit_economics_are_modelled: boolean;
  path_to_profitability: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

const BASE = '/fundability';
const STARTUPS = '/startups';

export const fundabilityApi = {
  // ---- Assessment ----------------------------------------------------------

  /** Run a new fundability assessment for the authenticated startup. */
  assess: () =>
    api.post<FundabilityAssessment>(`${BASE}/assess/`).then((r) => r.data),

  /** Get the current (most recent) summary for the dashboard. */
  getCurrent: () =>
    api
      .get<FundabilityAssessmentSummary>(`${BASE}/assessments/current/`)
      .then((r) => r.data),

  /** Get the full detail of a specific assessment. */
  getAssessment: (id: string) =>
    api
      .get<FundabilityAssessment>(`${BASE}/assessments/${id}/`)
      .then((r) => r.data),

  /** List past assessments. */
  listAssessments: () =>
    api
      .get<FundabilityAssessmentSummary[] | { results: FundabilityAssessmentSummary[] }>(`${BASE}/assessments/`)
      .then((r) => (Array.isArray(r.data) ? r.data : r.data.results ?? [])),

  /** Get gaps for an assessment. */
  getGaps: (assessmentId: string) =>
    api
      .get<FundabilityGap[]>(`${BASE}/assessments/${assessmentId}/gaps/`)
      .then((r) => r.data),

  /** Get the improvement plan for an assessment. */
  getImprovementPlan: (assessmentId: string) =>
    api
      .get<{ assessment_id: string; overall_score: number; actions: ImprovementAction[] }>(
        `${BASE}/assessments/${assessmentId}/improvement-plan/`
      )
      .then((r) => r.data),

  /** Update gap status (founder marks in_progress / resolved). */
  updateGapStatus: (gapId: string, status: GapStatus) =>
    api
      .patch<FundabilityGap>(`${BASE}/gaps/${gapId}/status/`, { status })
      .then((r) => r.data),

  /** Update action status (founder marks completed). */
  updateActionStatus: (
    actionId: string,
    payload: { status: ActionStatus; completion_notes?: string; completed_at?: string }
  ) =>
    api
      .patch<ImprovementAction>(`${BASE}/actions/${actionId}/status/`, payload)
      .then((r) => r.data),

  // ---- Evidence Vault ------------------------------------------------------

  listEvidence: (params?: { dimension?: string; status?: string }) =>
    api
      .get<EvidenceVaultItem[] | { results: EvidenceVaultItem[] }>(`${BASE}/evidence/`, { params })
      .then((r) => (Array.isArray(r.data) ? r.data : r.data.results ?? [])),

  getEvidenceSummary: () =>
    api
      .get<EvidenceVaultSummary>(`${BASE}/evidence/summary/`)
      .then((r) => r.data),

  addEvidence: (data: Partial<EvidenceVaultItem>) =>
    api
      .post<EvidenceVaultItem>(`${BASE}/evidence/`, data)
      .then((r) => r.data),

  updateEvidence: (id: string, data: Partial<EvidenceVaultItem>) =>
    api
      .patch<EvidenceVaultItem>(`${BASE}/evidence/${id}/`, data)
      .then((r) => r.data),

  deleteEvidence: (id: string) =>
    api.delete(`${BASE}/evidence/${id}/`).then((r) => r.data),

  // ---- Startup Sub-Profiles ------------------------------------------------

  getFounders: () =>
    api
      .get<FounderProfile[] | { results: FounderProfile[] }>(`${STARTUPS}/founders/`)
      .then((r) => (Array.isArray(r.data) ? r.data : r.data.results ?? [])),

  createFounder: (data: Partial<FounderProfile>) =>
    api
      .post<FounderProfile>(`${STARTUPS}/founders/`, data)
      .then((r) => r.data),

  updateFounder: (id: string, data: Partial<FounderProfile>) =>
    api
      .patch<FounderProfile>(`${STARTUPS}/founders/${id}/`, data)
      .then((r) => r.data),

  deleteFounder: (id: string) =>
    api.delete(`${STARTUPS}/founders/${id}/`).then((r) => r.data),

  getProductProfile: () =>
    api.get<ProductProfile>(`${STARTUPS}/product-profile/`).then((r) => r.data),

  saveProductProfile: (data: Partial<ProductProfile>) =>
    api
      .patch<ProductProfile>(`${STARTUPS}/product-profile/`, data)
      .then((r) => r.data),

  getMarketProfile: () =>
    api.get<MarketProfile>(`${STARTUPS}/market-profile/`).then((r) => r.data),

  saveMarketProfile: (data: Partial<MarketProfile>) =>
    api
      .patch<MarketProfile>(`${STARTUPS}/market-profile/`, data)
      .then((r) => r.data),

  getBusinessModel: () =>
    api
      .get<BusinessModelProfile>(`${STARTUPS}/business-model/`)
      .then((r) => r.data),

  saveBusinessModel: (data: Partial<BusinessModelProfile>) =>
    api
      .patch<BusinessModelProfile>(`${STARTUPS}/business-model/`, data)
      .then((r) => r.data),

  getTractionMetrics: (metricType?: string) =>
    api
      .get<TractionMetric[] | { results: TractionMetric[] }>(`${STARTUPS}/traction/`, {
        params: metricType ? { metric_type: metricType } : undefined,
      })
      .then((r) => (Array.isArray(r.data) ? r.data : r.data.results ?? [])),

  addTractionMetric: (data: Partial<TractionMetric>) =>
    api
      .post<TractionMetric>(`${STARTUPS}/traction/`, data)
      .then((r) => r.data),

  updateTractionMetric: (id: string, data: Partial<TractionMetric>) =>
    api
      .patch<TractionMetric>(`${STARTUPS}/traction/${id}/`, data)
      .then((r) => r.data),

  deleteTractionMetric: (id: string) =>
    api.delete(`${STARTUPS}/traction/${id}/`).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Plan name constants - single source of truth for subscription tier strings
// ---------------------------------------------------------------------------

export const PLAN_NAMES = {
  PRO: 'founder-pro',
  RAISE_PASS: 'raise-pass',
} as const;

// ---------------------------------------------------------------------------
// Score band thresholds - single source of truth used by all helpers + UI
// ---------------------------------------------------------------------------

export const SCORE_BANDS = {
  /** Score at or above this value = Investable */
  INVESTABLE: 75,
  /** Score at or above this value (but below INVESTABLE) = Promising */
  PROMISING: 55,
} as const;

// ---------------------------------------------------------------------------
// Score helpers (used by UI components)
// ---------------------------------------------------------------------------

export function getScoreColor(score: number): string {
  if (score >= SCORE_BANDS.INVESTABLE) return 'text-emerald-600';
  if (score >= SCORE_BANDS.PROMISING)  return 'text-amber-600';
  return 'text-rose-600';
}

export function getScoreBg(score: number): string {
  if (score >= SCORE_BANDS.INVESTABLE) return 'bg-emerald-50 border-emerald-200';
  if (score >= SCORE_BANDS.PROMISING)  return 'bg-amber-50 border-amber-200';
  return 'bg-rose-50 border-rose-200';
}

export function getScoreBarColor(score: number): string {
  if (score >= SCORE_BANDS.INVESTABLE) return 'bg-emerald-500';
  if (score >= SCORE_BANDS.PROMISING)  return 'bg-amber-500';
  return 'bg-rose-500';
}

/** Returns the hex stroke colour for the ScoreRing SVG. */
export function getScoreRingColor(score: number): string {
  if (score >= SCORE_BANDS.INVESTABLE) return '#10b981';
  if (score >= SCORE_BANDS.PROMISING)  return '#f59e0b';
  return '#f43f5e';
}

export function getSeverityColor(severity: GapSeverity): string {
  switch (severity) {
    case 'critical': return 'text-rose-700 bg-rose-50 border-rose-200';
    case 'high':     return 'text-orange-700 bg-orange-50 border-orange-200';
    case 'medium':   return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'low':      return 'text-slate-600 bg-slate-50 border-slate-200';
  }
}

export function getSeverityDot(severity: GapSeverity): string {
  switch (severity) {
    case 'critical': return 'bg-rose-500';
    case 'high':     return 'bg-orange-500';
    case 'medium':   return 'bg-amber-500';
    case 'low':      return 'bg-slate-400';
  }
}

export const STAGE_LABELS: Record<string, string> = {
  idea: 'Idea / Concept',
  pre_seed: 'Pre-Seed',
  seed: 'Seed',
  series_a: 'Series A',
  series_b_plus: 'Series B+',
};

export const CONVICTION_LABELS: Record<string, string> = {
  exceptional: 'Exceptional - High Conviction',
  strong: 'Strong - Investable',
  promising: 'Promising - Diligence Required',
  speculative: 'Speculative - Significant Gaps',
  weak: 'Weak - Insufficient Evidence',
};

/**
 * Maps each dimension key to a Lucide icon name.
 * Consumed by the page to render <DimensionIcon dimensionKey={key} /> rather
 * than emoji strings.  The icon name matches the export from 'lucide-react'.
 */
export const DIMENSION_ICON_KEYS: Record<DimensionKey, string> = {
  problem:         'Crosshair',
  solution:        'Wrench',
  market:          'Globe',
  team:            'Users',
  traction:        'TrendingUp',
  business_model:  'BarChart2',
  defensibility:   'ShieldCheck',
  fundraising:     'Rocket',
};
