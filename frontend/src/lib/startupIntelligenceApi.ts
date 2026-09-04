/**
 * frontend.src.lib.startupIntelligenceApi
 * ========================================
 * Typed client for Canonical Venture Intelligence Profile models,
 * claims, evidence provenance, maturity matrix, structured financials,
 * and live intelligence snapshots.
 */
import { apiGet, apiPost, apiPatch } from './api';

export interface StartupEvidence {
  id: string;
  startup: string;
  claim?: string | null;
  source_type: 'pitch_deck' | 'dataroom_doc' | 'invoice' | 'contract' | 'cap_table' | 'api_telemetry' | 'public_registry';
  title: string;
  document_url?: string;
  external_source?: string;
  verification_status: 'unverified' | 'documentary' | 'third_party_verified' | 'machine_observed';
  confidence: number;
  verifier_name?: string;
  notes?: string;
  created_at: string;
}

export interface StartupClaim {
  id: string;
  startup: string;
  claim_type: 'metric' | 'traction' | 'market' | 'product' | 'team' | 'regulatory' | 'financial';
  statement: string;
  source_type: string;
  source_document?: string;
  materiality: 'critical' | 'high' | 'medium' | 'low';
  declared_value: string;
  verified_value?: string;
  observed_value?: string;
  normalized_value?: number | null;
  status: 'declared' | 'under_review' | 'verified' | 'disputed' | 'refuted';
  confidence: number;
  supporting_evidence?: StartupEvidence[];
  created_at: string;
  updated_at: string;
}

export interface StartupMaturityAssessment {
  id: string;
  startup: string;
  declared_financing_stage: string;
  inferred_financing_stage: string;
  stage_confidence: number;
  product_score: number;
  commercial_score: number;
  revenue_score: number;
  operational_score: number;
  market_score: number;
  regulatory_score: number;
  execution_score: number;
  evidence_score: number;
  product_maturity: string;
  commercial_maturity: string;
  revenue_maturity: string;
  operational_maturity: string;
  evidence_maturity: string;
  overall_maturity: string;
  overall_score: number;
  confidence: number;
  model_version: string;
  assessed_at: string;
}

export interface StartupFinancialSnapshot {
  id: string;
  startup: string;
  period_label: string;
  revenue_usd: string;
  gross_profit_usd: string;
  gross_margin_pct: number;
  operating_expenses_usd: string;
  net_burn_monthly_usd: string;
  cash_balance_usd: string;
  runway_months: number;
  customers_count: number;
  cac_usd?: string | null;
  ltv_usd?: string | null;
  arpu_usd?: string | null;
  churn_rate_pct: number;
  retention_rate_pct: number;
  evidence?: string | null;
  evidence_title?: string;
  recorded_at: string;
}

export interface StartupFundingRound {
  id: string;
  startup: string;
  round_type: 'pre_seed' | 'seed' | 'series_a' | 'series_b' | 'bridge' | 'grant';
  instrument: 'safe' | 'convertible_note' | 'priced_equity' | 'grant';
  amount_usd: string;
  valuation_post_money_usd?: string | null;
  announced_date?: string | null;
  close_date?: string | null;
  investors_summary?: string;
  lead_investor_name?: string;
  created_at: string;
}

export interface StartupCustomerSegment {
  id: string;
  startup: string;
  segment_type: string;
  customer_count: number;
  average_contract_value_usd: string;
  retention_rate_pct: number;
  geography: string;
  created_at: string;
}

export interface FundraisingCampaign {
  id: string;
  startup: string;
  round_name: string;
  target_amount_usd: string;
  amount_committed_usd: string;
  amount_raised_usd: string;
  valuation_cap_usd: string;
  instrument: string;
  status: 'preparing' | 'active' | 'closing' | 'completed' | 'paused';
  target_close_date?: string | null;
  terms_summary: string;
  updated_at: string;
}

export interface StartupContextualAssessment {
  id?: string;
  evaluator_type: 'vc_fund' | 'accelerator' | 'angel_syndicate';
  evaluator_name: string;
  fit_score: number;
  primary_conviction: string;
  primary_concern: string;
  confidence?: number;
}

export interface VentureIntelligenceSnapshot {
  startup_id: string;
  company_name: string;
  financing_stage: string;
  stage_confidence: number;
  product_maturity: string;
  commercial_maturity: string;
  revenue_maturity: string;
  operational_maturity: string;
  evidence_maturity: string;
  fundamental_strength_score: number;
  funding_readiness_score: number;
  evidence_confidence: number;
  primary_strength: string;
  primary_risk: string;
  critical_unknowns_count: number;
  total_claims_count: number;
  verified_claims_count: number;
  total_evidence_count: number;
  maturity_dimensions: {
    product: number;
    commercial: number;
    revenue: number;
    operational: number;
    market: number;
    regulatory: number;
    execution: number;
    evidence: number;
  };
  contextual_assessments: StartupContextualAssessment[];
  fundraising_campaign: {
    round_name: string;
    target_amount_usd: string;
    amount_committed_usd: string;
    valuation_cap_usd: string;
    instrument: string;
    status: string;
  };
  historical_trajectory: Array<{
    assessment_number: number;
    score: number;
    date: string;
    milestone: string;
  }>;
  last_assessed_at: string;
}

function unwrapList<T>(data: any): T[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

export const startupIntelligenceApi = {
  getSnapshot: async (startupId?: string): Promise<VentureIntelligenceSnapshot> => {
    const query = startupId ? `?startup_id=${encodeURIComponent(startupId)}` : '';
    return apiGet<VentureIntelligenceSnapshot>(`/startups/snapshot/${query}`);
  },

  getClaims: async (startupId?: string): Promise<StartupClaim[]> => {
    const query = startupId ? `?startup_id=${encodeURIComponent(startupId)}` : '';
    const res = await apiGet<any>(`/startups/claims/${query}`);
    return unwrapList<StartupClaim>(res);
  },

  createClaim: async (data: Partial<StartupClaim>): Promise<StartupClaim> => {
    return apiPost<StartupClaim>('/startups/claims/', data);
  },

  getEvidence: async (startupId?: string): Promise<StartupEvidence[]> => {
    const query = startupId ? `?startup_id=${encodeURIComponent(startupId)}` : '';
    const res = await apiGet<any>(`/startups/evidence/${query}`);
    return unwrapList<StartupEvidence>(res);
  },

  createEvidence: async (data: Partial<StartupEvidence>): Promise<StartupEvidence> => {
    return apiPost<StartupEvidence>('/startups/evidence/', data);
  },

  getFinancials: async (startupId?: string): Promise<StartupFinancialSnapshot[]> => {
    const query = startupId ? `?startup_id=${encodeURIComponent(startupId)}` : '';
    const res = await apiGet<any>(`/startups/financials/${query}`);
    return unwrapList<StartupFinancialSnapshot>(res);
  },

  createFinancialSnapshot: async (data: Partial<StartupFinancialSnapshot>): Promise<StartupFinancialSnapshot> => {
    return apiPost<StartupFinancialSnapshot>('/startups/financials/', data);
  },

  getFundingRounds: async (startupId?: string): Promise<StartupFundingRound[]> => {
    const query = startupId ? `?startup_id=${encodeURIComponent(startupId)}` : '';
    const res = await apiGet<any>(`/startups/funding-rounds/${query}`);
    return unwrapList<StartupFundingRound>(res);
  },

  createFundingRound: async (data: Partial<StartupFundingRound>): Promise<StartupFundingRound> => {
    return apiPost<StartupFundingRound>('/startups/funding-rounds/', data);
  },

  getCustomerSegments: async (startupId?: string): Promise<StartupCustomerSegment[]> => {
    const query = startupId ? `?startup_id=${encodeURIComponent(startupId)}` : '';
    const res = await apiGet<any>(`/startups/customers/${query}`);
    return unwrapList<StartupCustomerSegment>(res);
  },

  getCampaign: async (startupId?: string): Promise<FundraisingCampaign | null> => {
    const query = startupId ? `?startup_id=${encodeURIComponent(startupId)}` : '';
    const res = await apiGet<any>(`/startups/campaigns/${query}`);
    const list = unwrapList<FundraisingCampaign>(res);
    return list[0] ?? null;
  },

  updateCampaign: async (id: string, data: Partial<FundraisingCampaign>): Promise<FundraisingCampaign> => {
    return apiPatch<FundraisingCampaign>(`/startups/campaigns/${id}/`, data);
  },

  getContextualAssessments: async (startupId?: string): Promise<StartupContextualAssessment[]> => {
    const query = startupId ? `?startup_id=${encodeURIComponent(startupId)}` : '';
    const res = await apiGet<any>(`/startups/contextual-assessments/${query}`);
    return unwrapList<StartupContextualAssessment>(res);
  },
};
