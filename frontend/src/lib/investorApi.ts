/**
 * investorApi.ts
 * ==============
 * Typed API client for the Pitchmic Institutional Investment Operating System.
 * Covers: Firms, Funds, Mandates, Deal Flow, Underwriting, IC Deliberation,
 *         Term Sheets, Portfolio Intelligence, and Outcome Calibration.
 */

import { api } from './api';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface InvestmentFirm {
  id: number;
  name: string;
  slug: string;
  website: string;
  headquarters: string;
  investment_regions: string;
  fund_type: string;
  founded_year: number | null;
  aum_usd: string;
  logo_url: string;
  funds: InvestmentFund[];
  members: FirmMember[];
  created_at: string;
}

export interface FirmMember {
  id: number;
  firm: number;
  user: number;
  user_email: string;
  user_name: string;
  title: string;
  institutional_role: string;
  can_vote_ic: boolean;
  can_issue_term_sheet: boolean;
  can_underwrite: boolean;
  is_lead_partner: boolean;
}

export interface InvestmentFund {
  id: number;
  firm: number;
  firm_name: string;
  name: string;
  vintage_year: number;
  fund_size_usd: string;
  deployed_capital_usd: string;
  stage_focus: string;
  geography_focus: string;
  sector_focus: string;
  min_check_size_usd: string;
  max_check_size_usd: string;
  target_ownership_pct_min: number;
  target_ownership_pct_max: number;
  has_reserves: boolean;
  reserves_ratio: number;
  is_active: boolean;
  active_cases_count: number;
}

export interface InvestmentMandate {
  id: number;
  fund: number;
  thesis_summary: string;
  stage_rules: string[];
  geography_whitelist: string[];
  sector_whitelist: string[];
  min_revenue_usd: string;
  pre_revenue_allowed: boolean;
  founder_preferences: Record<string, boolean>;
  exclusion_list: string[];
  target_moat_signals: string[];
  updated_at: string;
}

export interface DealClaim {
  id: number;
  claim_id: string;
  claim_text: string;
  category: string;
  materiality: string;
  source: string;
  founder_asserted: boolean;
  verification_status: string;
  discrepancy_notes: string;
  evidence_audit: DealEvidence | null;
  created_at: string;
}

export interface DealEvidence {
  id: number;
  claimed_value: string;
  audited_value: string;
  counterparties_found: number;
  counterparties_signed: number;
  active_commitments: number;
  confidence: number;
  audit_summary: Record<string, unknown>;
}

export interface DealFinancialModel {
  id: number;
  declared_mrr_usd: string;
  audited_mrr_usd: string;
  discrepancy_detected: boolean;
  discrepancy_explanation: string;
  monthly_burn_usd: string;
  runway_months: number;
  gross_margin_pct: number;
  cac_usd: string;
  ltv_usd: string;
  scenario_models: Record<string, unknown>;
}

export interface InvestmentMemo {
  id: number;
  executive_summary: string;
  thesis_alignment_rationale: string;
  bull_case: Array<{ point: string; strength: string }>;
  bear_case: Array<{ point: string; strength: string }>;
  kill_conditions: Array<{ condition: string; severity: string }>;
  recommended_terms: Record<string, unknown>;
  generated_at: string;
}

export interface ICDebateSession {
  id: number;
  status: string;
  debate_log: Array<{
    partner_id: number;
    partner_name: string;
    comment: string;
    side: 'bull' | 'bear';
    timestamp: string;
  }>;
  challenge_mode_log: Array<{
    partner_name: string;
    dimension: string;
    old_score: number;
    new_score: number;
    adjusted_underwriting_score: number;
    evidence_justification: string;
    timestamp: string;
  }>;
}

export interface ICPartnerVote {
  id: number;
  partner: number;
  partner_name: string;
  partner_email: string;
  vote: 'INVEST' | 'PASS' | 'DEFER' | 'REQUEST_DILIGENCE';
  conviction_score: number;
  recommended_check_usd: string;
  conditions: string;
  notes: string;
  created_at: string;
}

export interface TermSheetRevision {
  id: number;
  version_number: number;
  instrument: string;
  investment_amount_usd: string;
  pre_money_valuation_usd: string;
  valuation_cap_usd: string;
  discount_pct: number;
  target_ownership_pct: number;
  board_rights: string;
  pro_rata_rights: boolean;
  information_rights: boolean;
  status: string;
  closing_checklist: Array<{ item: string; status: string }>;
  created_at: string;
}

export interface InvestmentCaseList {
  id: number;
  company_name: string;
  industry: string;
  geography: string;
  fund_name: string;
  lead_partner_name: string | null;
  status: string;
  priority_tier: string;
  sourcing_channel: string;
  thesis_fit_score: number;
  underwriting_score: number;
  evidence_confidence_score: number;
  overall_readiness_score: number;
  declared_stage: string;
  inferred_stage: string;
  stage_conflict_detected: boolean;
  portfolio_conflict_detected: boolean;
  target_ask_usd: string;
  proposed_check_usd: string;
  claims_count: number;
  created_at: string;
  updated_at: string;
}

export interface InvestmentCaseDetail extends InvestmentCaseList {
  startup_details: {
    id: number;
    company_name: string;
    industry: string;
    location: string;
    website: string;
    funding_stage: string;
    total_funding_raised: number;
    current_revenue: number;
    customer_count: number;
    employee_count: string;
    tam: number;
  };
  fund: number;
  firm: number;
  thesis_fit_breakdown: Record<string, number>;
  stage_conflict_notes: string;
  conflict_explanation: string;
  critical_risks: string[];
  rejection_reasons: string[];
  rejection_notes: string;
  watchlist_reassess_date: string | null;
  watchlist_milestone_trigger: string;
  claims: DealClaim[];
  financial_model: DealFinancialModel | null;
  memo: InvestmentMemo | null;
  partner_votes: ICPartnerVote[];
  term_sheets: TermSheetRevision[];
  ic_debates: ICDebateSession[];
  proposed_valuation_cap_usd: string;
  warm_paths?: WarmPathItem[];
}

export interface PortfolioAlert {
  id: number;
  portfolio_company: number;
  company_name: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string;
  metric_delta: string;
  is_resolved: boolean;
  created_at: string;
}

export interface PortfolioCompany {
  id: number;
  company_name: string;
  entry_valuation_usd: string;
  invested_capital_usd: string;
  current_fair_value_usd: string;
  ownership_pct: number;
  holding_multiple: number;
  follow_on_status: string;
  is_active: boolean;
  alerts: PortfolioAlert[];
  active_alerts_count: number;
  onboarded_at: string;
}

export interface DashboardSummary {
  deal_flow: {
    total_active: number;
    new_inbox: number;
    thesis_aligned: number;
    priority: number;
    awaiting_ic: number;
    screening: number;
    diligence: number;
    term_sheets: number;
  };
  portfolio: {
    companies: number;
    active_alerts: number;
    follow_on_candidates: number;
  };
  thesis: {
    avg_fit_pct: number;
    watchlist_triggered: number;
  };
  ai_insights: string[];
}

export interface WarmPathItem {
  member_name: string;
  member_title: string;
  target_person: string;
  target_organization: string;
  connection_type: string;
  warmth_pct: number;
  context: string;
}

export interface RelationshipEdge {
  id: number;
  firm: number;
  member: number;
  member_name?: string;
  target_person_name: string;
  target_organization: string;
  target_email: string;
  connection_type: string;
  connection_type_display?: string;
  strength_score: number;
  notes: string;
  created_at: string;
}

export interface CalibrationReport {
  calibration_accuracy_pct: number;
  total_outcomes_tracked: number;
  brier_score: number;
  dimension_accuracies: Record<string, number>;
  partner_biases: Array<{
    partner: string;
    bias_title: string;
    detail: string;
    severity: string;
    recommendation: string;
  }>;
}

export interface IngestDealPayload {
  startup_id: number;
  fund_id: number;
  target_ask_usd?: number;
  sourcing_channel?: string;
  notes?: string;
}

export interface CounterOfferPayload {
  investment_amount_usd: number;
  valuation_cap_usd: number;
  discount_pct?: number;
  target_ownership_pct?: number;
  instrument?: string;
  board_rights?: string;
  pro_rata_rights?: boolean;
  information_rights?: boolean;
}

export interface StartupOption {
  id: number;
  company_name: string;
  industry: string;
  location: string;
  funding_stage: string;
  current_revenue: number;
  total_funding_raised: number;
}

export interface FundExposure {
  total_invested_usd: number;
  geography: Array<{ label: string; amount_usd: number; pct: number }>;
  sector: Array<{ label: string; amount_usd: number; pct: number }>;
  stage: Array<{ label: string; amount_usd: number; pct: number }>;
}

// ─────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────

function unwrapList<T>(data: any): T[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

export const investorApi = {
  // --- Firm & Fund ---
  getFirms: () =>
    api.get<any>('/investors/firms/').then((r) => unwrapList<InvestmentFirm>(r.data)),

  getFunds: (firmId?: number) =>
    api
      .get<any>('/investors/funds/', firmId ? { params: { firm: firmId } } : undefined)
      .then((r) => unwrapList<InvestmentFund>(r.data)),

  getMandates: () =>
    api.get<any>('/investors/mandates/').then((r) => unwrapList<InvestmentMandate>(r.data)),

  updateMandate: (mandateId: number, payload: Partial<InvestmentMandate>) =>
    api.patch<InvestmentMandate>(`/investors/mandates/${mandateId}/`, payload).then((r) => r.data),

  // --- Relationship Intelligence ---
  getRelationships: (firmId?: number) =>
    api
      .get<any>('/investors/relationships/', firmId ? { params: { firm_id: firmId } } : undefined)
      .then((r) => unwrapList<RelationshipEdge>(r.data)),

  createRelationship: (payload: Partial<RelationshipEdge>) =>
    api.post<RelationshipEdge>('/investors/relationships/', payload).then((r) => r.data),

  // --- Ingestion & Startups ---
  getAvailableStartups: () =>
    api.get<StartupOption[]>('/users/startups/').then((r) => {
      // Return results array or raw array
      const d = r.data as any;
      return Array.isArray(d) ? d : d.results || [];
    }).catch(() => []),

  ingestDeal: (payload: IngestDealPayload) =>
    api.post('/investors/cases/ingest-deal/', payload).then((r) => r.data),

  // --- Deal Flow ---
  getDealFlow: (params?: { fund_id?: number; status?: string }) =>
    api.get<any>('/investors/cases/', { params }).then((r) => unwrapList<InvestmentCaseList>(r.data)),

  getDealDetail: (id: number) =>
    api.get<InvestmentCaseDetail>(`/investors/cases/${id}/`).then((r) => r.data),

  advanceStatus: (id: number, newStatus: string) =>
    api
      .post(`/investors/cases/${id}/advance-status/`, { status: newStatus })
      .then((r) => r.data),

  recalculateFit: (id: number) =>
    api.post(`/investors/cases/${id}/recalculate-fit/`).then((r) => r.data),

  extractClaims: (id: number) =>
    api.post(`/investors/cases/${id}/extract-claims/`).then((r) => r.data),

  addToWatchlist: (id: number, payload: { reassess_date: string; milestone_trigger: string }) =>
    api.post(`/investors/cases/${id}/watchlist/`, payload).then((r) => r.data),

  rejectDeal: (id: number, payload: { rejection_reasons: string[]; rejection_notes: string }) =>
    api.post(`/investors/cases/${id}/reject/`, payload).then((r) => r.data),

  // --- Underwriting ---
  challengeAssessment: (
    id: number,
    payload: { dimension: string; new_score: number; evidence_justification: string }
  ) =>
    api.post(`/investors/cases/${id}/challenge-assessment/`, payload).then((r) => r.data),

  generateMemo: (id: number) =>
    api.post<InvestmentMemo>(`/investors/cases/${id}/generate-memo/`).then((r) => r.data),

  // --- IC Room ---
  addICDebate: (id: number, payload: { comment: string; side: 'bull' | 'bear' }) =>
    api.post(`/investors/cases/${id}/add-ic-debate/`, payload).then((r) => r.data),

  castICVote: (payload: {
    investment_case_id: number;
    vote: string;
    conviction_score: number;
    recommended_check_usd: number;
    conditions: string;
    notes: string;
  }) => api.post('/investors/ic/cast-vote/', payload).then((r) => r.data),

  // --- Term Sheets & Counter-Offers ---
  getTermSheets: (caseId: number) =>
    api
      .get<any>('/investors/term-sheets/', { params: { case_id: caseId } })
      .then((r) => unwrapList<TermSheetRevision>(r.data)),

  proposeCounterOffer: (termSheetId: number, payload: CounterOfferPayload) =>
    api.post(`/investors/term-sheets/${termSheetId}/propose-counter-offer/`, payload).then((r) => r.data),

  acceptAndClose: (termSheetId: number) =>
    api.post(`/investors/term-sheets/${termSheetId}/accept-and-close/`).then((r) => r.data),

  // --- Portfolio & Exposure ---
  getPortfolio: (firmId?: number) =>
    api
      .get<any>('/investors/portfolio/', firmId ? { params: { firm_id: firmId } } : undefined)
      .then((r) => unwrapList<PortfolioCompany>(r.data)),

  resolveAlert: (companyId: number, alertId: number) =>
    api
      .post(`/investors/portfolio/${companyId}/resolve-alert/`, { alert_id: alertId })
      .then((r) => r.data),

  getFundExposure: (params?: { firm_id?: number; fund_id?: number }) =>
    api.get<FundExposure>('/investors/portfolio/fund-exposure/', { params }).then((r) => r.data),

  // --- Dashboard & Calibration ---
  getDashboardSummary: (fundId?: number) =>
    api
      .get<DashboardSummary>('/investors/cases/dashboard-summary/', fundId ? { params: { fund_id: fundId } } : undefined)
      .then((r) => r.data),

  getCalibrationReport: (firmId?: number) =>
    api
      .get<CalibrationReport>('/investors/cases/calibration-report/', firmId ? { params: { firm_id: firmId } } : undefined)
      .then((r) => r.data),

  // --- Seed ---
  seedDefaults: () =>
    api.post('/investors/seed-defaults/').then((r) => r.data),
};
