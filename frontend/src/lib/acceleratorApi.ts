'use client';

import { api } from './api';

export interface EligibilityCheckRequest {
  country?: string;
  sector?: string;
  stage?: string;
  incorporated?: boolean;
  full_time?: boolean;
  total_funding_raised_usd?: number;
  team_size?: number;
  previous_accelerator?: boolean;
  revenue_usd?: number;
}

export interface EligibilityRequirement {
  dimension: string;
  title: string;
  status: 'satisfied' | 'uncertain' | 'failed' | 'requires_evidence';
  rule: string;
  user_value: string;
  requires_evidence: boolean;
}

export interface EligibilityResult {
  program_id: number;
  program_name: string;
  eligibility_percentage: number;
  requirements_satisfied: number;
  requirements_uncertain: number;
  requirements_failed: number;
  requirements_evidence_needed: number;
  total_requirements: number;
  verdict: 'highly_eligible' | 'review_needed' | 'ineligible';
  breakdown: EligibilityRequirement[];
}

export interface AcceleratorProgram {
  id: number;
  name: string;
  organization_name: string;
  slug: string;
  logo_url?: string;
  website?: string;
  tagline: string;
  description: string;
  sector_focus: string;
  geography_focus: string;
  stage_focus: string;
  equity_offered_pct: number;
  funding_amount_usd: number;
  program_duration_weeks: number;
  is_remote: boolean;
  location: string;
  application_deadline?: string;
  cohort_start_date?: string;
  program_cycle: string;
  target_cohort_size: number;
  total_applications: number;
  days_until_deadline?: number;
  workflow_style: 'yc_style' | 'techstars_style' | 'custom';
  eligibility_rules: Record<string, any>;
  is_active: boolean;
}

export interface ApplicationClaim {
  id: number;
  claim_id: string;
  claim_text: string;
  category: string;
  materiality: 'critical' | 'high' | 'medium' | 'low';
  source: string;
  founder_asserted: boolean;
  evidence_required: boolean;
  evidence_status: string;
  verification_status: 'pending' | 'verified' | 'partially_verified' | 'unverified' | 'contradicted' | 'flagged';
  verified_value?: Record<string, any>;
  discrepancy_notes?: string;
  evidence_detail?: {
    claimed_count: number;
    documents_found: number;
    documents_signed: number;
    unique_entities: number;
    current_documents: number;
    commercial_intent_count: number;
    confidence: number;
    verification_summary?: Record<string, any>;
  };
}

export interface ApplicationAssessment {
  id: number;
  founder_score: number;
  founder_confidence: number;
  problem_score: number;
  problem_confidence: number;
  product_score: number;
  product_confidence: number;
  market_score: number;
  market_confidence: number;
  traction_score: number;
  traction_confidence: number;
  revenue_score: number;
  revenue_confidence: number;
  team_score: number;
  team_confidence: number;
  declared_stage: string;
  inferred_stage: string;
  stage_confidence: number;
  stage_conflict: boolean;
  stage_conflict_explanation?: string;
  overall_program_fit: number;
  startup_strength: number;
  evidence_confidence: number;
  application_completeness: number;
  risk_flags: Array<{
    risk: string;
    severity: string;
    confidence: number;
    evidence: string;
    mitigation: string;
  }>;
  bull_case: Array<{ point: string; strength: string }>;
  bear_case: Array<{ point: string; strength: string }>;
  overall_recommendation: 'INTERVIEW' | 'REJECT' | 'WAITLIST' | 'REQUEST_EVIDENCE';
  recommendation_confidence: number;
  recommendation_reasoning: string;
}

export interface ApplicationItem {
  id: number;
  company_name: string;
  program_name: string;
  organization_name: string;
  status: string;
  automated_screening_tier: 'A' | 'B' | 'C' | 'D';
  program_fit_score: number;
  startup_strength_score: number;
  evidence_confidence_score: number;
  application_completeness_score: number;
  founder_score: number;
  eligibility_score: number;
  stage_conflict_detected: boolean;
  inferred_stage: string;
  total_claims: number;
  unverified_claims: number;
  reviewer_count: number;
  submitted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface PipelineData {
  program_id: number;
  program_name: string;
  organization_name: string;
  total_applications: number;
  columns: Record<string, ApplicationItem[]>;
  tiers: { A: number; B: number; C: number; D: number };
  avg_fit: number;
  avg_evidence_confidence: number;
}

export interface ReviewerScoreInput {
  application: number;
  founder_score: number;
  market_score: number;
  product_score: number;
  team_score: number;
  traction_score: number;
  overall_conviction: number;
  recommendation: 'INTERVIEW' | 'REJECT' | 'WAITLIST' | 'NEEDS_MORE_INFO';
  notes?: string;
}

export interface CommitteeVoteInput {
  application_id: number;
  vote: 'YES' | 'CONDITIONAL' | 'PASS';
  conviction_score: number;
  notes?: string;
}

export interface CommitteeFinalizeInput {
  application_id: number;
  decision: 'ACCEPTED' | 'REJECTED' | 'WAITLISTED' | 'DEFERRED' | 'EVIDENCE_REQUESTED';
  rationale?: string;
  conditions?: string;
}

function unwrapList<T>(data: any): T[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

export const acceleratorApi = {
  // Programs & Marketplace
  getPrograms: async (): Promise<AcceleratorProgram[]> => {
    const res = await api.get<any>('/accelerator/programs/');
    return unwrapList<AcceleratorProgram>(res.data);
  },

  getProgram: async (id: number) => {
    const res = await api.get<AcceleratorProgram>(`/accelerator/programs/${id}/`);
    return res.data;
  },

  checkEligibility: async (programId: number, data: EligibilityCheckRequest) => {
    const res = await api.post<EligibilityResult>(`/accelerator/programs/${programId}/check-eligibility/`, data);
    return res.data;
  },

  getPipeline: async (programId: number) => {
    const res = await api.get<PipelineData>(`/accelerator/programs/${programId}/pipeline/`);
    return res.data;
  },

  getCohort: async (programId: number) => {
    const res = await api.get<any>(`/accelerator/programs/${programId}/cohort/`);
    return res.data;
  },

  // Applications
  getApplications: async (): Promise<ApplicationItem[]> => {
    const res = await api.get<any>('/accelerator/applications/');
    return unwrapList<ApplicationItem>(res.data);
  },

  getApplicationDetail: async (id: number) => {
    const res = await api.get<any>(`/accelerator/applications/${id}/`);
    return res.data;
  },

  getApplicationAssessment: async (id: number) => {
    const res = await api.get<ApplicationAssessment>(`/accelerator/applications/${id}/assessment/`);
    return res.data;
  },

  submitApplication: async (id: number) => {
    const res = await api.post<any>(`/accelerator/applications/${id}/submit/`);
    return res.data;
  },

  transitionStatus: async (id: number, status: string) => {
    const res = await api.post<any>(`/accelerator/applications/${id}/transition-status/`, { status });
    return res.data;
  },

  queryCopilot: async (id: number, query: string) => {
    const res = await api.post<{ query: string; company_name: string; answer: string; generated_at: string }>(
      `/accelerator/applications/${id}/copilot/`,
      { query }
    );
    return res.data;
  },

  // Reviews
  submitReview: async (data: ReviewerScoreInput) => {
    const res = await api.post('/accelerator/reviews/', data);
    return res.data;
  },

  getDisagreements: async (applicationId?: number) => {
    const res = await api.get('/accelerator/disagreements/', {
      params: applicationId ? { application_id: applicationId } : {},
    });
    return res.data;
  },

  // Committee IC
  castCommitteeVote: async (data: CommitteeVoteInput) => {
    const res = await api.post('/accelerator/committee/cast-vote/', data);
    return res.data;
  },

  finalizeDecision: async (data: CommitteeFinalizeInput) => {
    const res = await api.post('/accelerator/committee/finalize-decision/', data);
    return res.data;
  },

  // Evidence Request
  requestEvidence: async (applicationId: number, requestedItems: Array<{ type: string; description: string }>, message?: string) => {
    const res = await api.post('/accelerator/evidence-requests/', {
      application: applicationId,
      requested_items: requestedItems,
      message_to_founder: message || '',
    });
    return res.data;
  },

  resolveEvidence: async (requestId: number, notes?: string) => {
    const res = await api.post(`/accelerator/evidence-requests/${requestId}/resolve/`, {
      founder_response: notes || 'Evidence provided and verified.',
    });
    return res.data;
  },

  // Seed defaults helper
  seedDefaults: async () => {
    const res = await api.post('/accelerator/seed-defaults/');
    return res.data;
  },
};
