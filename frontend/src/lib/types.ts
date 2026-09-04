export enum UserRole {
  STARTUP = 'startup',
  INVESTOR = 'investor',
  ACCELERATOR = 'accelerator',
  ADMIN = 'admin',
}

export enum OfferStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  NEGOTIATING = 'negotiating',
  WITHDRAWN = 'withdrawn',
  EXPIRED = 'expired',
}

export type OfferStatusUnion = `${OfferStatus}`;

export type OfferStatusFilter =
  | OfferStatus.DRAFT
  | OfferStatus.SENT
  | OfferStatus.ACCEPTED
  | OfferStatus.REJECTED
  | OfferStatus.NEGOTIATING
  | OfferStatus.WITHDRAWN
  | OfferStatus.EXPIRED;

export type OfferStatusStartupTransition =
  | OfferStatus.ACCEPTED
  | OfferStatus.REJECTED
  | OfferStatus.NEGOTIATING;

export type OfferStatusInvestorTransition =
  | OfferStatus.SENT
  | OfferStatus.WITHDRAWN;

export const isOfferStatusStartupTransition = (
  s: OfferStatus
): s is OfferStatusStartupTransition =>
  s === OfferStatus.ACCEPTED ||
  s === OfferStatus.REJECTED ||
  s === OfferStatus.NEGOTIATING;

export const isOfferStatusInvestorTransition = (
  s: OfferStatus
): s is OfferStatusInvestorTransition =>
  s === OfferStatus.SENT || s === OfferStatus.WITHDRAWN;

export interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: UserRole;
  avatar_url?: string;
  is_verified: boolean;
  is_staff?: boolean;
  is_superuser?: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StartupProfile {
  id: string;
  user: string;
  company_name: string;
  startup_name?: string;
  tagline?: string;
  description?: string;
  address?: string;
  phone?: string;
  niche?: string;
  logo_url?: string;
  website?: string;
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  industry?: string;
  location?: string;
  founded_year?: number;
  employee_count?: string;
  pitch_video_url?: string;
  target_market?: string;
  asking_amount?: string;
  team_members?: TeamMember[];
  created_at: string;
  updated_at: string;
}

export interface InvestorProfile {
  id: string;
  user: string;
  full_name: string;
  company_name?: string;
  title?: string;
  bio?: string;
  address?: string;
  phone?: string;
  niche?: string;
  avatar_url?: string;
  website?: string;
  linkedin?: string;
  twitter?: string;
  location?: string;
  preferred_industries?: string;
  investment_range_min?: string;
  investment_range_max?: string;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  startup_profile?: string;
  name: string;
  role: string;
  bio?: string;
  linkedin?: string;
  avatar_url?: string;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface Pitch {
  id: string;
  startup: string;
  startup_name?: string;
  startup_id?: string;
  title: string;
  description: string;
  problem?: string;
  solution?: string;
  market_size?: string;
  business_model?: string;
  traction?: string;
  use_of_funds?: string;
  tags?: string[];
  cover_image_url?: string;
  asking_amount?: string;
  equity_offered?: string;
  image_url?: string;
  video_url?: string;
  deck_url?: string;
  is_draft: boolean;
  is_featured?: boolean;
  like_count: number;
  view_count?: number;
  is_liked_by_me?: boolean;
  offers_count?: number;
  pitched_at?: string;
  attachments?: PitchAttachment[];
  created_at: string;
  updated_at: string;
}

export interface PitchAttachment {
  id: string;
  file_name: string;
  file_url: string;
  file_type?: string;
  file_size?: number;
  created_at: string;
}

export interface PitchLike {
  id: string;
  pitch: string;
  user: string;
  created_at: string;
}

export interface MatchDimensions {
  industry: number;
  stage: number;
  ticket_size: number;
  location: number;
  semantic: number;
}

export interface OfferEconomics {
  implied_valuation: number | null;
  median_dilution_pct: number | null;
  capital_weighted_dilution_pct: number | null;
}

export type IntentTier =
  | 'COLD'
  | 'WARM'
  | 'HIGH_CONVICTION'
  | 'IMMINENT_TERM_SHEET';

export interface Offer {
  id: string;
  pitch: string;
  investor: string;
  pitch_title?: string;
  startup_name?: string;
  investor_name?: string;
  investor_company?: string;
  amount: string;
  equity_pct: string;
  valuation?: string;
  message?: string;
  terms?: string;
  status: OfferStatus;
  valid_transitions?: OfferStatus[];
  expires_at?: string;
  sent_at?: string;
  responded_at?: string;
  created_at: string;
  updated_at: string;

  match_score?: number | null;
  match_dimensions?: MatchDimensions | null;
  investor_intent_pct?: number | null;
  intent_tier?: IntentTier | string | null;
  close_probability_pct?: number | null;
  behavioral_signals?: string[];
  engagement_score?: number | null;
  offer_economics?: OfferEconomics | null;
}

export interface LikelyOffer {
  investor_name: string;
  investor_company: string;
  offer_probability_pct: number;
  match_score?: number;
  rationale_signals: string[];
}

export type DealHealthFactor = 'up' | 'down' | 'flat';

export interface DealHealthSummary {
  score: number;
  tier: string;
  factors: Record<string, DealHealthFactor>;
}

export interface PitchmicIntelligenceSummary {
  high_conviction_count: number;
  likely_offer_count: number;
  best_offer_amount: number | null;
  highest_intent_pct: number | null;
  negotiation_opportunity_tier: 'Low' | 'Medium' | 'High' | string;
  next_milestone_term_sheet_probability_pct: number;
}

export interface OffersListSummary extends Partial<PitchmicIntelligenceSummary> {
  offers_received_count?: number;
  offers_sent_count?: number;
  capital_offered_sum: number;
  active_negotiation_count: number;
  accepted_count: number;
  best_offer_amount: number | null;
  high_conviction_count: number;
  likely_offer_count: number;
  likely_offers: LikelyOffer[];
  highest_intent_pct: number | null;
  negotiation_opportunity_tier: string;
  next_milestone_term_sheet_probability_pct: number;
  deal_health_score: number;
  deal_health_tier: string;
  deal_health_factors: Record<string, DealHealthFactor>;
}

export interface Notification {
  id: string;
  user: string;
  notification_type: 'info' | 'success' | 'warning' | 'error';
  category: 'new_offer' | 'offer_updated' | 'new_pitch' | 'new_like' | 'system';
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
  read_at?: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export type OfferPerspective = 'startup' | 'investor';

export type Instrument =
  | 'SAFE'
  | 'Convertible Note'
  | 'Equity'
  | 'Debt'
  | 'Other'
  | 'Unknown';

export type InvestorTypeLabel =
  | 'VC'
  | 'Angel'
  | 'Family Office'
  | 'Corporate'
  | 'Accelerator'
  | 'Unknown';

export type TicketBucket =
  | '<$100K'
  | '$100K–$500K'
  | '$500K–$1M'
  | '$1M+';

export type StrategicFitLabel = 'High' | 'Medium' | 'Low';

export type ScoreColorScheme = 'match' | 'intent' | 'close' | 'generic';

export type OfferComparisonSelection = Set<string>;
