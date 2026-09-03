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
  /** Primary key (integer serialised as string by DRF) */
  id: string;
  /** FK to User — serialised as id string */
  user: string;
  company_name: string;
  startup_name?: string;
  tagline?: string;
  description?: string;
  /** Contact / legacy columns mapped to backend serializer fields */
  address?: string;
  phone?: string;
  /** Comma-separated investment niches / industries (legacy "niche" column) */
  niche?: string;
  /** Extended profile fields */
  logo_url?: string;
  website?: string;
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  industry?: string;
  location?: string;
  founded_year?: number;
  /** employee_count is a string range on the backend ("1-10", "11-50", …) */
  employee_count?: string;
  pitch_video_url?: string;
  target_market?: string;
  team_members?: TeamMember[];
  created_at: string;
  updated_at: string;
}

export interface InvestorProfile {
  id: string;
  /** FK to User — serialised as id string */
  user: string;
  full_name: string;
  company_name?: string;
  title?: string;
  bio?: string;
  /** Contact / legacy columns */
  address?: string;
  phone?: string;
  /** Comma-separated investment niche (legacy column, also mirrored in preferred_industries) */
  niche?: string;
  /** Extended profile fields */
  avatar_url?: string;
  website?: string;
  linkedin?: string;
  twitter?: string;
  location?: string;
  /** Comma-separated string on the backend */
  preferred_industries?: string;
  investment_range_min?: string;
  investment_range_max?: string;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  /** FK to StartupProfile (not exposed as startup_profile_id) */
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
  /** FK to StartupProfile serialised as id */
  startup: string;
  startup_name?: string;
  startup_id?: string;
  title: string;
  description: string;
  /** Extended fields (added in migration T2-3) */
  problem?: string;
  solution?: string;
  market_size?: string;
  business_model?: string;
  traction?: string;
  use_of_funds?: string;
  tags?: string[];
  cover_image_url?: string;
  /** Decimal fields serialised as strings by DRF */
  asking_amount?: string;
  equity_offered?: string;
  image_url?: string;
  video_url?: string;
  deck_url?: string;
  is_draft: boolean;
  is_featured?: boolean;
  /** Annotated counts */
  like_count: number;
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

export interface Offer {
  id: string;
  pitch: string;
  investor: string;
  /** Nested read-only data when serialiser includes nested objects */
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
}

export interface Notification {
  id: string;
  user: string;
  /** notification_type on the backend: info | success | warning | error */
  notification_type: 'info' | 'success' | 'warning' | 'error';
  /** category on the backend */
  category: 'new_offer' | 'offer_updated' | 'new_pitch' | 'new_like' | 'system';
  title: string;
  body?: string;
  /** data JSON field */
  data?: Record<string, unknown>;
  /** Derived from read_at — true when read_at is non-null */
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
