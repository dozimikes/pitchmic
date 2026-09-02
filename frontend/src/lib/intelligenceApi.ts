import { apiGet, apiPost } from './api';

export type EvidenceStateType = 'verified_empirical' | 'seed_proxy' | 'founder_claimed' | 'unavailable';

export interface DimensionScore {
  key: string;
  name: string;
  raw_score: number;
  weight_pct: number;
  weighted_contribution: number;
  evidence_state: EvidenceStateType;
  confidence_pct: number;
  justifications: string[];
  positive_signals: string[];
  missing_evidence: string[];
  stage_concern: 'acceptable' | 'moderate_concern' | 'material_concern';
}

export interface ScoreLedger {
  base_weighted_score: number;
  evidence_confidence_adjustment: number;
  stage_alignment_adjustment: number;
  unsupported_claim_adjustment: number;
  final_fundability_score: number;
  confidence_interval_low: number;
  confidence_interval_high: number;
  conviction_verdict: string;
  empirical_coverage_pct: number;
}

export interface StageAssessment {
  declared_stage: string;
  assessed_maturity: string;
  round_readiness_pct: number;
  alignment_status: 'Strong' | 'Conditional' | 'Below Expected';
  primary_gap: string;
  stage_milestone_target: string;
}

export interface MathCheck {
  metric: string;
  claimed_value?: number | null;
  calculated_value?: number | null;
  is_consistent: boolean;
  delta_pct?: number | null;
  note: string;
}

export interface UnitEconomicsAudit {
  cac?: number | null;
  ltv?: number | null;
  cac_ltv_ratio?: number | null;
  gross_margin_pct?: number | null;
  burn_rate?: number | null;
  runway_months?: number | null;
  implied_payback_months?: number | null;
  is_mathematically_coherent: boolean;
  anomalies: string[];
  risk_level?: 'low' | 'medium' | 'critical' | 'healthy' | 'caution';
  cac_evidence_state?: string;
  ltv_evidence_state?: string;
  margin_evidence_state?: string;
  notes?: string;
}

export interface CompetitorBenchmark {
  name: string;
  tier?: string;
  stage?: string;
  threat_level: 'direct' | 'indirect' | 'incumbent' | 'adjacent';
  threat_vector?: string;
  differentiation_verdict: string;
  funding_total?: string;
  region?: string;
}

export interface VerifiedClaim {
  claim_text: string;
  category: string;
  slide_no?: number;
  evidence_state?: string;
  status?: 'verified' | 'triangulated' | 'self_reported' | 'discrepancy';
  source_attribution?: string;
  confidence_score?: number;
  confidence?: number;
}

export interface PitchDeckForensicReport {
  status?: string;
  company_name: string;
  industry?: string;
  analysis_id?: number;
  audit: {
    fundability_score: number;
    score_ledger?: ScoreLedger;
    dimension_scores?: DimensionScore[];
    stage_assessment?: StageAssessment;
    unit_economics: UnitEconomicsAudit;
    competitors: CompetitorBenchmark[];
    verified_claims?: VerifiedClaim[];
    math_consistency_checks?: MathCheck[];
    contradictions?: string[];
    missing_slides?: string[];
    top_score_drivers?: string[];
    bull_thesis: string;
    bear_thesis: string;
    highest_priority_diligence?: string[];
  };
}

// ---------------------------------------------------------------------------
// Probabilistic ML & Venture Outcome Types
// ---------------------------------------------------------------------------

export interface ProbabilisticBelief {
  prior_alpha: number;
  prior_beta: number;
  posterior_alpha: number;
  posterior_beta: number;
  prior_probability: number;
  posterior_probability: number;
  credible_interval_5: number;
  credible_interval_50: number;
  credible_interval_95: number;
  uncertainty_score: number;
  evidence_weight_applied: number;
  update_history: Array<{
    step: number;
    probability: number;
    uncertainty: number;
    added_positive_weight?: number;
    added_negative_weight?: number;
  }>;
}

export interface SurvivalCurvePoint {
  horizon_months: number;
  probability_milestone_achieved: number;
  hazard_rate: number;
}

export interface MetricAnomalyReport {
  metric_key: string;
  claimed_value: any;
  sector_median: number;
  sector_p95: number;
  is_anomaly: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  explanation: string;
}

export interface UnicornProbabilityProfile {
  company_name: string;
  stage: string;
  sector: string;
  overall_fundability_score: number;
  series_a_18m_probability: number;
  series_b_36m_probability: number;
  ten_m_arr_5y_probability: number;
  hundred_m_valuation_5y_probability: number;
  unicorn_one_b_valuation_probability: number;
  bayesian_belief: ProbabilisticBelief;
  confidence_tier: 'VERY_HIGH' | 'HIGH' | 'MODERATE' | 'SPECULATIVE';
  evidence_coverage_percentage: number;
  prediction_uncertainty_score: number;
  survival_curve: SurvivalCurvePoint[];
  primary_positive_drivers: string[];
  primary_uncertainty_drivers: string[];
  anomaly_audit_reports: MetricAnomalyReport[];
  generated_at: string;
}

export interface StealthFounderSignal {
  id: number;
  source: string;
  founder_name: string;
  company_name: string;
  signal_type: string;
  confidence: number;
  jurisdiction: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface ResolvedFounderProfile {
  founder_name: string;
  probable_companies: string[];
  primary_jurisdiction: string;
  velocity_score: number;
  sources_detected: string[];
  top_signal_type?: string;
}

export interface DigitalBrainQueryResult {
  answer: string;
  confidence: number;
  sources_found?: number;
  sources: Array<{
    company_name: string;
    source_type: string;
    summary: string;
    tags?: string[];
    verdict?: string;
    created_at?: string;
  }>;
}

export interface VoiceInterviewQuestion {
  id: string;
  topic: string;
  question: string;
}

export interface VoiceInterviewSession {
  id: number;
  startup: number;
  company_name: string;
  stage: string;
  interviewer_persona: string;
  status: string;
  transcript: Array<{
    speaker: 'interviewer' | 'founder' | 'candidate';
    text: string;
    timestamp: number;
    recorded_at?: string;
  }>;
  debrief_scorecard?: {
    overall_score: number;
    recommendation: string;
    evaluation_metrics: {
      communication_clarity: number;
      domain_depth: number;
      founder_conviction: number;
    };
    green_flags: string[];
    red_flags: string[];
  };
}

export interface EnterpriseTenant {
  id: number;
  name: string;
  slug: string;
  tier: 'starter' | 'pro' | 'enterprise';
  monthly_deal_quota: number;
  current_month_usage: number;
  webhook_url: string;
  contact_email: string;
  is_active: boolean;
  created_at: string;
}

export const intelligenceApi = {
  // Forensics
  uploadPitchDeck: async (formData: FormData): Promise<PitchDeckForensicReport> => {
    return apiPost<PitchDeckForensicReport>('/intelligence/forensics/deck/upload/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  analyzeDeckText: async (payload: {
    company_name: string;
    deck_text: string;
    metrics?: Record<string, any>;
    startup_id?: number;
    stage?: string;
    sector?: string;
  }) => {
    return apiPost<any>('/intelligence/forensics/deck/', payload);
  },

  // Probabilistic ML & Venture Outcome Engine
  predictVentureOutcomes: async (payload: {
    company_name: string;
    stage?: string;
    sector?: string;
    base_fundability_score?: number;
    claimed_metrics?: Record<string, number>;
    verified_evidence_ratio?: number;
    team_founder_spike?: number;
    moat_score?: number;
  }): Promise<UnicornProbabilityProfile> => {
    return apiPost<UnicornProbabilityProfile>('/intelligence/predict/outcomes/', payload);
  },

  // Audit Evidence Ledger
  auditEvidenceLedger: async (payload: {
    dimensions: Record<string, any>;
    claims: Array<{ metric_key: string; claimed_value: any; locator: string }>;
  }) => {
    return apiPost<any>('/intelligence/evidence/audit/', payload);
  },

  // Stealth Sourcing
  getStealthSignals: async (): Promise<StealthFounderSignal[]> => {
    return apiGet<StealthFounderSignal[]>('/intelligence/stealth/signals/');
  },

  discoverStealthFounders: async (payload: { keyword: string; registry: string }) => {
    return apiPost<{
      discovered_signals_count: number;
      resolved_founders_count: number;
      profiles: ResolvedFounderProfile[];
    }>('/intelligence/stealth/discover/', payload);
  },

  // Digital Brain
  queryDigitalBrain: async (query: string, tenantId = 'antler_global'): Promise<DigitalBrainQueryResult> => {
    return apiPost<DigitalBrainQueryResult>('/intelligence/brain/query/', { query, tenant_id: tenantId });
  },

  ingestDigitalBrainNote: async (payload: {
    company_name: string;
    source_type: string;
    summary: string;
    content: string;
    tags?: string[];
    verdict?: string;
    tenant_id?: string;
  }) => {
    return apiPost<any>('/intelligence/brain/ingest/', payload);
  },

  // Voice Interviews
  startVoiceInterview: async (payload: {
    startup_id: number;
    stage?: string;
    interviewer_persona?: string;
  }) => {
    return apiPost<{
      status: string;
      session_id: number;
      company_name: string;
      stage: string;
      interviewer_persona: string;
      agenda_questions: VoiceInterviewQuestion[];
    }>('/intelligence/voice/start/', payload);
  },

  recordVoiceTurn: async (sessionId: number, turn: { speaker: string; text: string; timestamp?: number }) => {
    return apiPost<{ status: string; session_id: number; turn_count: number }>(
      `/intelligence/voice/${sessionId}/turn/`,
      turn
    );
  },

  debriefVoiceInterview: async (sessionId: number) => {
    return apiPost<{ status: string; session_id: number; debrief: any }>(
      `/intelligence/voice/${sessionId}/debrief/`,
      {}
    );
  },

  // Enterprise Tenants & Licensing
  getTenants: async (): Promise<EnterpriseTenant[]> => {
    return apiGet<EnterpriseTenant[]>('/intelligence/tenants/');
  },

  createTenant: async (payload: {
    name: string;
    slug: string;
    tier: string;
    webhook_url?: string;
    contact_email?: string;
  }): Promise<EnterpriseTenant> => {
    return apiPost<EnterpriseTenant>('/intelligence/tenants/', payload);
  },

  provisionAPIKey: async (tenantId: number, name = 'Production Key') => {
    return apiPost<{
      status: string;
      tenant_name: string;
      key_name: string;
      key_prefix: string;
      api_key: string;
      warning: string;
    }>(`/intelligence/tenants/${tenantId}/keys/`, { name });
  },
};
