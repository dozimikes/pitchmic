/**
 * frontend.src.lib.opportunityIntelligenceApi
 * ============================================
 * Typed API client for Continuous Funding Opportunity Intelligence:
 * - Real-time ecosystem recommendations
 * - 7-dimension match breakdowns
 * - Identified evidence gaps
 * - 1-Click saving to active pipeline
 */
import { apiGet, apiPost } from './api';

export interface RecommendedOpportunity {
  opportunity_id: string;
  source_id: string;
  organization: string;
  source_name: string;
  source_type: 'accelerator' | 'vc_firm' | 'grant_portal' | 'corporate_venture' | 'dfi_foundation';
  title: string;
  slug: string;
  opportunity_type: string;
  status: 'OPEN' | 'CLOSING_SOON' | 'CLOSED' | 'UPCOMING' | 'ROLLING' | 'PAUSED' | 'PREDICTED';
  funding_min_usd: string;
  funding_max_usd: string;
  equity_terms: string;
  deadline: string | null;
  days_remaining: number | null;
  is_rolling: boolean;
  source_confidence: number;
  verified_freshness_hours_ago: number;
  application_url: string;
  overall_match_score: number;
  is_saved_to_pipeline: boolean;
  dimensional_scores: {
    stage_fit: number;
    geography_fit: number;
    sector_fit: number;
    funding_fit: number;
    business_model_fit: number;
    product_maturity: number;
    evidence_readiness: number;
  };
  evidence_gaps: string[];
  positive_convictions: string[];
  key_benefits: string[];
  eligibility_criteria: string[];
  evidence_requirements: string[];
  description: string;
}

export interface RecommendedOpportunitiesResponse {
  startup_id: string;
  company_name: string;
  total_matched: number;
  high_fit_count: number;
  recommendations: RecommendedOpportunity[];
}

export const opportunityIntelligenceApi = {
  getRecommended: async (startupId?: string): Promise<RecommendedOpportunitiesResponse> => {
    const query = startupId ? `?startup_id=${encodeURIComponent(startupId)}` : '';
    return apiGet<RecommendedOpportunitiesResponse>(`/fundraising/opportunities/recommended/${query}`);
  },

  saveToPipeline: async (
    opportunityId: string,
    stage: string = 'outreach',
  ): Promise<{ status: string; opportunity_title: string; pipeline_stage: string; detail: string }> => {
    return apiPost(`/fundraising/opportunities/${opportunityId}/save_to_pipeline/`, { stage });
  },

  triggerSync: async (): Promise<{ status: string; sources_monitored: number; opportunities_updated: number; synced_at: string }> => {
    return apiPost('/fundraising/opportunities/sync/', {});
  },
};
