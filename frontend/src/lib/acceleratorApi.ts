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

// ── Eligibility & Triage report (server-computed, single source) ──────────────
export type EligibilityBucket = 'eligible' | 'needs_verification' | 'disqualified' | 'rejected';

export interface EligibilityReportRow {
  application_id: number;
  company_name: string;
  status: string;
  tier: string | null;
  completeness: number;
  program_fit: number;
  eligibility: {
    percentage: number;
    verdict: string;
    satisfied: number;
    uncertain: number;
    failed: number;
    evidence_needed: number;
    total: number;
  };
  requirements: EligibilityRequirement[];
  signals: {
    stage_conflict: boolean;
    unverified_claims: number;
    pending_dimensions: string[];
    failed_dimensions: string[];
  };
  bucket: EligibilityBucket;
}

export interface EligibilityGateFailure {
  dimension: string;
  title: string;
  rule: string;
  count: number;
  pct_of_disqualified: number;
  cumulative_pct: number;
}

export interface EligibilityOverride {
  application_id: number;
  company_name: string;
  from_stage: string;
  to_stage: string;
  actor: string;
  reason: string;
  timestamp: string;
}

export interface EligibilityReport {
  program_id: number | null;
  scope: {
    total_applications: number;
    triage_scope: number;
    evaluated: number;
    excluded: { status: string; count: number }[];
    truncated: boolean;
  };
  buckets: Record<EligibilityBucket, number>;
  gate_failures: EligibilityGateFailure[];
  rows: EligibilityReportRow[];
  recent_overrides: EligibilityOverride[];
  generated_at: string;
}

// ── Reviewer assignment (who the program asked; ownership, not a verdict) ─────
export type AssignmentStatus = 'pending' | 'in_progress' | 'completed';
export type AssignmentConflictStatus = 'none' | 'potential' | 'recused';

/** One reviewer's seat on one application in one round. The applications list
 *  rows and the reviewer-consensus report rows emit this same shape.
 *
 *  An assignment is not a gate: any eligible reviewer may still file a
 *  scorecard without one. `scorecard_filed` is the separate fact that proves a
 *  review actually happened — "asked" and "done" must never be collapsed. */
export interface ReviewAssignmentRow {
  id: number;
  reviewer_id: number;
  reviewer_name: string;
  round_id: string;
  status: AssignmentStatus;
  conflict_status: AssignmentConflictStatus;
  /** ISO timestamp, or null when no deadline was set. Null is not "overdue". */
  due_at: string | null;
  scorecard_filed: boolean;
  /** Computed by the server against its own clock. A browser clock that is off
   *  by hours must not be able to make a deadline look met. */
  is_overdue: boolean;
}

/** A candidate the program may put on a review, with load counted server-side.
 *  `role` is the account's platform role — the eligibility rule is the
 *  platform's (role, staff, or an active reviewer profile), so this is one page
 *  of eligible people, not "this program's team". */
export interface AssignmentCandidate {
  id: number;
  name: string;
  email: string;
  role: string;
  /** Whether this person holds a staff seat in the program being asked about.
   *  The honest version of "on our team", which the eligibility pool is not. */
  on_program_team: boolean;
  /** Already holds a seat on this application (present when the picker is
   *  opened from one). A marker, not a filter — a second round is legitimate. */
  already_asked: boolean;
  open_assignments: number;
  completed_assignments: number;
  /** Scorecards this person has actually submitted for this program. */
  scorecards_filed: number;
  /** Diligence questions currently on this person's desk, counted by the same
   *  server query as their review load. */
  open_diligence: number;
  /** Null means the reviewer profile states no limit — unknown, not unlimited. */
  max_active_reviews: number | null;
  /** Advisory only: the server records a seat over this number. A stated limit
   *  is a workload signal the picker shows, not a gate it enforces. */
  at_capacity: boolean;
}

/** One page of that pool, with what the server matched beyond the page. */
export interface AssignmentCandidatePage {
  program_id: number;
  candidates: AssignmentCandidate[];
  total_matching: number;
  returned: number;
  limit: number;
}

/** A stored assignment, as the review-assignments endpoint returns it. Carries
 *  everything `ReviewAssignmentRow` does plus who recorded the ask. */
export interface ReviewAssignmentDetail extends ReviewAssignmentRow {
  application: number;
  company_name: string;
  reviewer: number;
  reviewer_email: string;
  assigned_at: string;
  assigned_by: number | null;
  /** Who pressed "assign". Server-recorded; never supplied by the client. */
  assigned_by_name: string | null;
  /** The server's own answer to "may this account take the seat off" — the
   *  same rule DELETE enforces, so the button and the request cannot disagree.
   *  Null means no request was in scope, which is unknown, not a refusal. */
  may_remove: boolean | null;
  notes: string;
}

// ── Due diligence items ──────────────────────────────────────────────────────

export type DiligenceStatus = 'open' | 'in_progress' | 'resolved' | 'blocked';

/** One diligence question the program is chasing, as the API stores it.
 *
 *  Ownership, not a verdict: an item says a named human is answerable for
 *  clearing a question by a date. It never decides the application. `owner_name`
 *  and `due_at` are null when nobody has been put on it / no date was set —
 *  absent is neither "nobody cares" nor "overdue". */
export interface DiligenceItemRow {
  id: number;
  application: number;
  company_name: string;
  question: string;
  /** Free-text label the program chose (finance, legal, references…). */
  area: string;
  status: DiligenceStatus;
  owner_id: number | null;
  owner_name: string | null;
  owner_email: string | null;
  due_at: string | null;
  /** Computed by the server from its own clock. Do not re-derive it here. */
  is_overdue: boolean;
  resolution_note: string;
  resolved_at: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

/** Per-application diligence tally, counted server-side on an application row.
 *  Null means the reader is not shown diligence ownership at all. */
export interface ApplicationDiligence {
  items: number;
  open: number;
  overdue: number;
  unowned: number;
  resolved: number;
  blocked: number;
  next_due_at: string | null;
}

/** Program-level diligence numbers. */
export interface DiligenceRollup {
  program_id: number | null;
  as_of: string;
  items: number;
  open: number;
  overdue: number;
  unowned_open: number;
  undated_open: number;
  resolved: number;
  blocked: number;
  by_status: Record<DiligenceStatus, number>;
  next_due_at: string | null;
  /** Days past the earliest missed deadline, or null when nothing has slipped. */
  oldest_overdue_days: number | null;
  by_owner: {
    owner_id: number | null;
    owner_name: string | null;
    open: number;
    overdue: number;
  }[];
  applications_covered: number;
  applications_uncovered: number;
}

// ── Reviewer Consensus report (server-computed, single source) ────────────────
export type ReviewLane = 'awaiting_review' | 'in_review' | 'decided';
export type ConsensusState = 'none' | 'single_reviewer' | 'consensus' | 'divergent';
export type ReviewerTendency = 'insufficient_data' | 'in_line' | 'lenient' | 'strict';

export interface ReviewerConsensusRow {
  application_id: number;
  company_name: string;
  status: string;
  sector: string | null;
  stage: string | null;
  lane: ReviewLane;
  reviewer_count: number;
  /** Who this program asked, separate from `reviewer_count` (who filed a
   *  scorecard). Null when the server hides reviewer identity from you. */
  assignments?: ReviewAssignmentRow[] | null;
  human_avg_conviction: number | null;
  human_conviction_spread_points: number | null;
  consensus_state: ConsensusState;
  recommendations: Record<string, number>;
  open_disagreements: number;
  claims: { total: number; unverified: number; contradicted: number };
  stage_conflict: boolean;
  ml: {
    screening_ran: boolean;
    tier: string | null;
    ran_at: string | null;
    program_fit: number | null;
    startup_strength: number | null;
    evidence_confidence: number | null;
    completeness: number | null;
  };
  aging_days: number | null;
  my_review: {
    conviction: number;
    recommendation: string;
    submitted_at: string;
  } | null;
}

export interface ReviewerCalibrationRow {
  reviewer_id: number;
  reviewer_name: string;
  reviews: number;
  avg_overall_conviction: number | null;
  last_submitted_at: string | null;
  tendency: ReviewerTendency;
  agreement_with_cohort_pct: number | null;
}

export interface ReviewerCalibration {
  total_scorecards: number;
  applications_reviewed: number;
  multi_reviewer_applications: number;
  inter_reviewer_agreement_pct: number | null;
  cohort_avg_conviction: number | null;
  agreement_basis: string;
  reviewers: ReviewerCalibrationRow[];
}

/** ReviewerDisagreement row enriched by the serializer with both humans. */
export interface ReviewerDisagreementRow {
  id: number;
  application: number;
  application_name: string;
  dimension: string;
  variance_pct: number;
  variance_points: number;
  dimension_a: number | null;
  dimension_b: number | null;
  reviewer_a: number;
  reviewer_b: number;
  reviewer_a_name: string;
  reviewer_b_name: string;
  resolved: boolean;
  resolution_notes: string;
  detected_at?: string;
}

/** One row per application the server actually ran triage on. `ok: false` rows
 *  carry their own failure; rows dropped by scoping or the server cap land in
 *  `not_run` instead of being counted as screened. */
export interface BatchAnalyzeRow {
  application_id: number;
  ok: boolean;
  company_name: string;
  tier: string | null;
  status?: string;
  eligibility_score?: number;
  eligibility_checked_at?: string | null;
  error?: string;
}

export interface BatchAnalyzeResponse {
  results: BatchAnalyzeRow[];
  requested: number;
  ran: number;
  not_run: number;
  failed: number;
  error: string | null;
  generated_at: string;
}

export interface MyReviewerCalibration {
  reviews_submitted: number;
  applications_reviewed: number;
  comparable_dimension_scores: number;
  agreement_with_cohort_pct: number | null;
  mean_bias_points: number | null;
  bias_note: string;
}

export interface ReviewerConsensusReport {
  program_id: number | null;
  scope: {
    total_applications: number;
    review_scope: number;
    evaluated: number;
    excluded: { status: string; count: number }[];
    truncated: boolean;
  };
  rollup: {
    lanes: Record<ReviewLane, number>;
    scorecards_recorded: number;
    active_reviewers: number;
    avg_human_conviction: number | null;
    open_disagreements: number;
    ml_screened: number;
    ml_not_run: number;
    reviewed_applications: number;
    multi_reviewer_applications: number;
    /** Applications with at least one ask recorded, and those with none. Counted
     *  over the whole review scope, so they add up to `scope.review_scope`. */
    applications_assigned: number;
    applications_unassigned: number;
  };
  calibration: ReviewerCalibration;
  disagreements: ReviewerDisagreementRow[];
  rows: ReviewerConsensusRow[];
  generated_at: string;
}

export interface CohortRuntime {
  phase: 'unscheduled' | 'upcoming' | 'running' | 'ended';
  /** Null whenever the cohort is not mid-flight, or the dates cannot say. */
  week: number | null;
  total_weeks: number | null;
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
  cohort_start_date?: string | null;
  cohort_end_date?: string | null;
  /** Where the cohort actually is in time, computed by the server from its two
   *  schedule dates. Never derived from `program_duration_weeks`, which is a
   *  creation default (12) rather than something a human planned. */
  cohort_runtime?: CohortRuntime;
  program_cycle: string;
  target_cohort_size: number;
  total_applications: number;
  days_until_deadline?: number;
  workflow_style: 'yc_style' | 'techstars_style' | 'custom';
  eligibility_rules: Record<string, any>;
  /** What the rules engine assumes for any eligibility_rules key the program
   *  never set — read from the server so the UI never restates a default. */
  eligibility_defaults?: Record<string, any>;
  is_active: boolean;
  is_public?: boolean;
  program_status?: string;
  program_version?: string;
  program_type?: string;
  capital_model?: string;
  created_by_name?: string;
  workflow_config?: Record<string, any>;
  question_config?: Record<string, any>;
  scoring_rubric_config?: Record<string, any>;
  branding_config?: Record<string, any>;
  module_config?: Record<string, any>;
  notification_config?: Record<string, any>;
  portal_config?: Record<string, any>;
}

// ── Workflow OS ────────────────────────────────────────────────────────────────

export interface WorkflowStage {
  slug: string;
  label?: string;
  description?: string;
  terminal?: boolean;
}

export interface WorkflowTransition {
  from_stage: string;
  to_stage: string;
  label?: string;
}

export interface StatusOption {
  slug: string;
  label: string;
}

export interface TriggerOption {
  value: string;
  label: string;
}

export interface WorkflowConfig {
  program_id: number;
  style: 'yc_style' | 'techstars_style' | 'custom' | string;
  stages: WorkflowStage[];
  transitions: WorkflowTransition[];
  available_statuses?: StatusOption[];
  available_triggers?: TriggerOption[];
}

export interface AutomationAction {
  type: string;
  params?: Record<string, any>;
  [k: string]: any;
}

export interface WorkflowAutomation {
  id: number;
  name: string;
  description?: string;
  trigger_event: string;
  trigger_event_display?: string;
  conditions: Record<string, any>;
  actions: AutomationAction[];
  is_active: boolean;
  order: number;
  created_at?: string;
  updated_at?: string;
}

export interface AutomationInput {
  program_id: number;
  name: string;
  description?: string;
  trigger_event: string;
  conditions?: Record<string, any>;
  actions?: AutomationAction[];
  is_active?: boolean;
  order?: number;
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
  /** Set when a human pinned the claim to something said in an interview. */
  source_interview?: number | null;
  source_transcript_turn?: number | null;
  /** The states the ledger carries, sent with the row. Absent means the readout
   *  was built outside a request, which is unknown rather than a refusal. */
  verification_choices?: ClaimVerificationChoice[];
  may_verify?: boolean | null;
}

/** One state a claim may be moved to, with what that state asks for.
 *  The labels and the preconditions come from `evidence_state` on the server,
 *  so the list a reviewer is offered cannot drift from the list the endpoint
 *  will accept. */
export interface ClaimVerificationChoice {
  value: string;
  label: string;
  needs_note: boolean;
  needs_evidence: boolean;
  /** What is actually in hand for this claim, in the reader's own words. */
  evidence_attached: string[];
}

/** A claim row as the verification surfaces read it. */
export type ClaimVerificationRow = ApplicationClaim;

/** Who a stored transcript line may be attributed to — the backend's own list
 *  (InterviewSession.TRANSCRIPT_SPEAKERS). Attribution is the point of a
 *  transcript, so it is a choice, not free text. */
export type TranscriptSpeaker = 'founder' | 'interviewer' | 'team_member' | 'observer';

/** One append-only turn as stored on InterviewSession.transcript. `turn` is
 *  assigned by the server in arrival order, and the timestamp is the server's
 *  clock — never a value a browser supplied. */
export interface InterviewTranscriptTurn {
  turn: number;
  speaker: TranscriptSpeaker | string;
  text: string;
  timestamp: string | null;
  /** Who typed it up — a different person from whoever spoke. */
  recorded_by?: string | null;
  recorded_by_id?: number | null;
}

export interface TranscriptWriteResult {
  session: {
    id: number;
    status: string;
    transcript: InterviewTranscriptTurn[];
    transcript_turn_count: number;
    claims_recorded_from_it: number;
  };
  turns_added: number;
  transcript_turns: number;
  session_status: string;
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
  company_name: string;  program_name: string;
  organization_name: string;
  program?: number;
  status: string;
  automated_screening_tier: 'A' | 'B' | 'C' | 'D' | '' | null;
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
  contradicted_claims?: number;
  verified_claims?: number;
  reviewer_count: number;
  /** Screening risk and review-queue lane, both routed by the server module
   *  apps.accelerator.queue_routing — read them, never recompute them. */
  risk_level?: 'High' | 'Medium' | 'Low';
  risk_reasons?: string[];
  queue_bucket?: string;
  /** Days waiting in the funnel, computed by the server from
   *  submitted_at-or-created_at. Null means no timestamp exists — render a
   *  dash, never "0". Do not re-derive it from the timestamps in the browser. */
  aging_days?: number | null;
  /** Who this program asked to review the row, from the same server shape the
   *  consensus report uses. Null = reviewer identity is hidden from you; []
   *  = genuinely nobody was asked. Never render null as "nobody". */
  assignments?: ReviewAssignmentRow[] | null;
  /** Diligence questions written down for this application, tallied by the
   *  server. Null = not shown to you; all-zero = nobody has questioned it yet. */
  diligence?: ApplicationDiligence | null;
  submitted_at?: string;
  created_at: string;
  updated_at: string;
  startup_name?: string;
  sector?: string | null;
  country?: string | null;
  location?: string | null;
  declared_stage?: string | null;
  founder_name?: string | null;
  stage?: string;
  readiness_score?: number;
}

/** Where a claim was heard, straight off the stored FK — null unless the claim
 *  really was pinned to an interview session. `speaker`/`said_at` come from the
 *  cited transcript turn, so they are absent rather than guessed when the turn
 *  is no longer on the record. */
export interface ClaimInterviewProvenance {
  session_id: number;
  round_number: number;
  interview_type: string;
  interview_type_label: string;
  interviewer: string | null;
  turn: number | null;
  speaker: string | null;
  said_at: string | null;
  recorded_by: string | null;
}

export interface EvidenceGraphClaim {
  id: number;
  claim_id: string;
  statement: string;
  category: string;
  materiality: string;
  source: string;
  interview: ClaimInterviewProvenance | null;
  value: string | null;
  founder_asserted: boolean;
  evidence_status: string;
  verification_status: 'verified' | 'partially_verified' | 'unverified' | 'contradicted' | string;
  discrepancy_notes: string;
  verified_at: string | null;
  evidence: Array<Record<string, any>>;
  used_by: { decisions: any[]; reviews: any[] };
}

export interface EvidenceGraphNode {
  id: string;
  kind: 'application' | 'claim' | 'evidence' | 'interview' | string;
  label: string;
  category?: string;
  materiality?: string;
  status: string;
}

export interface EvidenceGraphLink {
  source: string;
  target: string;
  /** asserted | supports | contradicts | heard_in — only relations stored on
   *  the rows, never one the browser inferred. */
  kind: string;
}

export interface EvidenceGraph {
  application_id: number;
  company_name: string;
  program: { id: number; name: string };
  status: string;
  claims: EvidenceGraphClaim[];
  summary: { total: number; verified: number; contradicted: number; unverified: number };
  /** Node/link traversal of the same claim rows, for the graph drawing. */
  graph?: {
    nodes: EvidenceGraphNode[];
    links: EvidenceGraphLink[];
    truncated: boolean;
    node_limit: number;
  };
}

/** One deterministic interview probe from /applications/{id}/interview-guide/. */
export interface InterviewProbe {
  key: string;
  question: string;
  tag: string;
  /** Severity, never styling: the client maps this to its own tone classes. */
  severity: 'high' | 'medium' | 'info' | string;
  detail: string | null;
}

export interface InterviewGuide {
  application_id: number;
  assessment_present: boolean;
  open_claims: number;
  probes: InterviewProbe[];
  areas_to_explore: InterviewProbe[];
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

export interface CommitteeBallot {
  voter_id: number;
  voter_name: string;
  vote: 'YES' | 'CONDITIONAL' | 'PASS';
  conviction_score: number;
  notes?: string;
  timestamp?: string;
}

/** Server-derived ballot tally (tally_committee_votes) — newest write per voter wins. */
export interface CommitteeVoteTally {
  yes: number;
  conditional: number;
  pass: number;
  total_votes: number;
  quorum_required: number;
  quorum_met: boolean;
  votes: CommitteeBallot[];
}

export interface CommitteeQuorum {
  yes: number;
  conditional: number;
  pass: number;
  total_votes: number;
  quorum_required: number;
  quorum_met: boolean;
  voters?: CommitteeBallot[];
}

export interface CommitteeFinalizeInput {
  application_id: number;
  decision: 'ACCEPTED' | 'REJECTED' | 'WAITLISTED' | 'DEFERRED' | 'EVIDENCE_REQUESTED';
  rationale?: string;
  conditions?: string;
}

// ─── Context types (used by ProgramContext.tsx) ───────────────────────────────

export interface ActiveContext {
  organization_id: number | null;
  organization_name: string | null;
  program_id: number | null;
  program_name: string | null;
  // The account's own role, as the server reads it off the user record. Null
  // when the account carries no recognised role, so a title here is never a
  // browser preference.
  role: string | null;
  role_code: string | null;
  is_program_creator: boolean;
  /** Whether this account may change the active program's configuration — the
   *  same question the write guard asks, answered by the server. Wider than
   *  `is_program_creator`, because platform staff configure programs they did
   *  not create. */
  can_configure_program: boolean;
  /** The seats this account holds in the active program, from the staff roster.
   *  Empty is not "member" and not "nobody": it usually means this account owns
   *  the program rather than being seated in it. */
  program_roles: { code: string; label: string; membership_id: number }[];
}

// An organization the account reaches through a program it can see. `id` is a
// real AcceleratorOrganization key, or null while the program only carries its
// own free-text organization name (every seeded program today).
export interface OrganizationSummary {
  id: number | null;
  name: string;
  linked: boolean;
  program_ids: number[];
}

export interface UserContextResponse {
  user_id: number;
  email: string;
  organizations: OrganizationSummary[];
  active_context: ActiveContext;
}

// ─── Work inbox types (one person's own open work in one program) ─────────────

export type WorkInboxKind = 'review' | 'diligence' | 'interview' | 'awaiting_founder';

export interface WorkInboxItem {
  key: string;
  kind: WorkInboxKind;
  application_id: number;
  company: string;
  title: string;
  /** Diligence questions only — the area the question was filed under. */
  area?: string;
  /** Null means the row genuinely has no date, which is not the same as "not overdue". */
  due_at: string | null;
  overdue: boolean | null;
  href: string;
}

export interface WorkInboxReport {
  program_id: number;
  program_name: string;
  generated_at: string;
  counts: {
    reviews: number;
    diligence: number;
    interviews: number;
    awaiting_founder: number;
    overdue: number;
  };
  total_open: number;
  /** Capped at `item_limit`; counts are computed over the whole set regardless. */
  items: WorkInboxItem[];
  item_limit: number;
  truncated: boolean;
}

// ─── Decision Room types ──────────────────────────────────────────────────────

export interface DecisionRoomCandidate {
  application_id: number;
  company_name: string;
  sector: string;
  stage: string;
  status: string;
  tier: 'A' | 'B' | 'C' | 'D';
  weighted_score: number;
  program_fit_score: number;
  startup_strength_score: number;
  evidence_confidence_score: number;
  reviewer_count: number;
  /** Who has filed a scorecard (for rail avatars); empty = nobody yet. */
  reviewers: Array<{ id: number; name: string | null }>;
  has_disagreements: boolean;
  /** Mean of the humans' 1–10 conviction, or null when nobody has scored. */
  mean_human_conviction: number | null;
  contradicted_claims: number;
  unverified_claims: number;
  stage_conflict_detected: boolean;
  /** Screening risk routed by apps.accelerator.queue_routing — the same module
   *  the review queue uses, so the room and the queue cannot disagree. */
  risk?: { level: 'High' | 'Medium' | 'Low'; points: number; reasons: string[] };
  votes: CommitteeVoteTally;
  submitted_at: string | null;
  /** Latest recorded committee decision, or null while the candidate is open. */
  final_decision: {
    decision: string;
    decided_by: string | null;
    decided_at: string;
    rationale: string;
  } | null;
}

export interface DecisionRoomSummary {
  program_id: number;
  program_name: string;
  target_cohort_size: number;
  ic_quorum?: { min_votes: number };
  funnel: {
    total: number;
    submitted: number;
    screening: number;
    shortlisted: number;
    interviewed: number;
    committee: number;
    accepted: number;
    waitlisted: number;
    rejected: number;
    seats_remaining: number;
  };
  candidates: DecisionRoomCandidate[];
}

export interface CandidateCard {
  application_id: number;
  company_name: string;
  description: string;
  website?: string;
  sector: string;
  stage: string;
  country: string;
  status: string;
  automated_screening_tier: string;
  scores: {
    weighted_score: number;
    program_fit_score: number;
    startup_strength_score: number;
    evidence_confidence_score: number;
    eligibility_score: number;
    founder_score: number;
  };
  /** The program's own Selection Framework rows (name/label/weight/score). */
  dimension_scores: ScoringDimensionRow[];
  assessment: {
    overall_recommendation: string;
    recommendation_confidence: number;
    recommendation_reasoning: string;
    risk_flags: any[];
    bull_case: any[];
    bear_case: any[];
    contradictions: any[];
  };
  /** Reviewer scorecards filed by humans for this candidate. */
  reviewers: CandidateReviewerScorecard[];
  disagreements: any[];
  interviews: CandidateInterview[];
  committee_decisions: CandidateDecisionRow[];
  vote_tally: CommitteeVoteTally;
  mean_human_conviction: number | null;
  submitted_at: string | null;
  claims: CandidateClaim[];
  evidence_requests: EvidenceRequestRow[];
}

/** One extracted claim on the candidate, with its verification state. */
export interface CandidateClaim {
  id: number;
  claim_id: string;
  category: string;
  claim_text: string;
  materiality: string;
  verification_status: 'verified' | 'unverified' | 'contradicted' | 'pending' | string;
  confidence: number;
}

/** Loop-back evidence request (EvidenceRequest model) on the candidate card. */
export interface EvidenceRequestRow {
  id: number;
  status: 'PENDING' | 'PARTIAL' | 'COMPLETE' | 'EXPIRED' | string;
  requested_by: string | null;
  requested_items: Array<Record<string, any>> | any[];
  message_to_founder: string;
  response_deadline: string | null;
  founder_response: string;
  created_at: string;
  resolved_at: string | null;
}

/** One committee interview row on the candidate card. */
export interface CandidateInterview {
  id: number;
  interview_type: string;
  round_number: number;
  status: string;
  overall_score: number | null;
  scheduled_at: string | null;
  notes: string;
}

/** One recorded committee decision on the candidate card. */
export interface CandidateDecisionRow {
  id: number;
  decision: string;
  decided_by: string;
  notes: string;
  stipulations: string[];
  voting_summary: Record<string, any>;
  decided_at: string;
}

/** One Selection Framework dimension (name/label/weight/score) from the server. */
export interface ScoringDimensionRow {
  name: string;
  label: string;
  description: string;
  weight: number;
  score: number;
  /** ML confidence (%) for this dimension, or null when the engine never
   *  scored a dimension by that name. */
  confidence: number | null;
}

/** A single reviewer's scorecard for a candidate, from get_candidate_card. */
export interface CandidateReviewerScorecard {
  reviewer_id: number;
  reviewer_name: string;
  recommendation: string;
  overall_conviction: number;
  dimension_scores: Record<string, number>;
  founder_score: number;
  market_score: number;
  product_score: number;
  team_score: number;
  traction_score: number;
  notes: string;
  strengths: string[];
  concerns: string[];
  submitted_at: string | null;
  updated_at: string | null;
}

export interface Paged<T> {
  count: number;
  results: T[];
}

export interface ApplicationListParams {
  page?: number;
  page_size?: number;
  status?: string;
  tier?: string;
  declared_stage?: string;
  sector?: string;
  country?: string;
  q?: string;
}

export interface AllowedTransitions {
  current: string;
  allowed: Array<{ status: string; label: string }>;
}

export interface AppNote {
  id: number;
  body: string;
  created_at: string;
  author: string;
}

function unwrapList<T>(data: any): T[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

function unwrapPaged<T>(data: any): Paged<T> {
  if (Array.isArray(data)) return { count: data.length, results: data };
  if (data && Array.isArray(data.results)) {
    return { count: typeof data.count === 'number' ? data.count : data.results.length, results: data.results };
  }
  return { count: 0, results: [] };
}

// ─── Program OS: config-layer + subsystem types ───────────────────────────────

export interface ProgramStageItem {
  id?: number; program_id?: number; name: string; slug: string; type?: string;
  description?: string; order?: number; is_entry?: boolean; is_terminal?: boolean;
  entry_conditions?: Record<string, any>; exit_conditions?: Record<string, any>;
  deadline_days?: number | null; permissions?: Record<string, any>; config?: Record<string, any>;
}
export interface StageTransitionItem {
  id?: number; program_id?: number; from_stage: number; to_stage: number;
  from_slug?: string; to_slug?: string; label?: string; condition?: Record<string, any>;
  requires_approval?: boolean; order?: number;
}
export interface FormQuestionOption { id?: number; label: string; value: string; order?: number; }
export interface FormQuestionItem {
  id?: number; label: string; help_text?: string; field_type: string; required?: boolean;
  order?: number; character_limit?: number | null; validation?: Record<string, any>;
  visible_if?: Record<string, any>; required_if?: Record<string, any>; routing?: Record<string, any>;
  config?: Record<string, any>; options?: FormQuestionOption[];
}
export interface FormSectionItem {
  id?: number; name: string; description?: string; order?: number;
  visible_if?: Record<string, any>; questions?: FormQuestionItem[];
}
export interface FormDefinitionItem {
  id?: number; program_id?: number; name: string; form_type: string; version?: number;
  status?: string; description?: string; is_default?: boolean; published_at?: string | null;
  sections?: FormSectionItem[]; question_count?: number; created_at?: string; updated_at?: string;
}
export interface RenderedForm {
  id: number; name: string; form_type: string; version: number; status: string;
  sections: { id: number; name: string; description: string; visible_if: Record<string, any>;
    questions: Array<Partial<FormQuestionItem> & { id: number }> }[];
}
export interface SubmitFormResponse { id: number; status: string; routing: Array<Record<string, any>>; complete: boolean; }
export interface NotificationTemplateItem {
  id?: number; program_id?: number; key: string; name: string; channel: string;
  subject?: string; body?: string; is_active?: boolean;
}
export interface ProgramNotificationItem {
  id: number; program: number; application?: number | null; template_key?: string;
  channel: string; subject?: string; body?: string; status: string; sent_at?: string | null; created_at: string;
}
export interface CustomObjectFieldItem { id?: number; name: string; key: string; field_type: string; required?: boolean; order?: number; }
export interface CustomObjectItem {
  id?: number; program_id?: number; name: string; slug: string; description?: string;
  icon?: string; fields?: CustomObjectFieldItem[]; created_at?: string;
}
export interface CustomRecordItem {
  id?: number; custom_object: number; application?: number | null; membership?: number | null;
  data: Record<string, any>; created_at?: string; updated_at?: string;
}
/** One person's seat on a program's own team, as `program-staff/` stores it.
 *  A seat is what lets a colleague read and work the program's records; it does
 *  not let them change how the program judges founders. */
export interface ProgramStaffSeat {
  id?: number;
  program_id?: number;
  user: number;
  user_name: string;
  user_email: string;
  /** The code the server stores; `role_label` is its own wording for it. */
  role: string;
  role_label: string;
  is_active: boolean;
  /**
   * When the seat was written. There is deliberately no "seated by" — the model
   * carries no actor column, so the server reports the timestamp it has rather
   * than a name it would have to invent. Who seated a person is in the event
   * ledger (`program_staff_seated`), not on the roster row.
   */
  member_since: string | null;
}

/** A role a seat may carry, read off the server's own field choices. */
export interface StaffRoleOption {
  value: string;
  label: string;
}

export interface ProgramRoleItem {
  id?: number; program_id?: number | null; name: string; slug: string; description?: string;
  permissions?: string[]; field_visibility?: Record<string, any>; is_system?: boolean;
  /** People the server can tie to this role. Null means the role's slug is not
   *  one the staff table can hold — unknown, which is not the same as zero. */
  member_count?: number | null;
}
/** One scoring dimension of a program's evaluation policy. `weight` is the
 *  stored fraction (0.25 = 25%); the model validates that they sum to 1.0. */
export interface EvaluationPolicyDimension {
  name?: string; label?: string; weight?: number;
  description?: string; evidence_requirement?: string;
}
/** A versioned ProgramEvaluationPolicy, as the server stores it. The field names
 *  here are the model's own: `version`, not a label, and `scoring_dimensions`,
 *  not a weights map. */
export interface EvaluationPolicyItem {
  id: number; program: number; version: string; is_active: boolean;
  effective_from: string | null; created_at?: string;
  created_by_email: string | null;
  scoring_dimensions: EvaluationPolicyDimension[];
  min_reviewers_per_application?: number; review_rounds?: number;
}
/** What a cycle's two window dates say about right now. "unscheduled" means no
 *  dates exist — it is not a claim that intake is closed. Whether a founder's
 *  own form can post into the cycle is a separate fact: `intake_open`, which is
 *  true only once a person has issued the cycle's key. */
export interface CycleScheduledWindow {
  state: 'unscheduled' | 'not_yet_open' | 'inside_window' | 'past_deadline';
  opens_at: string | null;
  closes_at: string | null;
}

/** The cycle's receiving door, as the server reports it. Never the key itself:
 *  it is stored hashed and shown once, at the moment it is issued. */
export interface CycleIntakeKeyState {
  hint: string | null;
  issued_at: string | null;
  issued_by: { id: number; email: string } | null;
}

export interface ApplicationCycleItem {
  id: number;
  name: string;
  cycle_code?: string;
  status: string;
  intake_type: 'batch' | 'rolling' | string;
  open_date?: string | null;
  deadline?: string | null;
  cohort_start_date?: string | null;
  cohort_end_date?: string | null;
  /** Required on create. The model's default of 15 is what an unplanned cycle
   *  looks like, not a size a director chose. */
  target_cohort_size: number;
  application_count: number;
  accepted_count: number;
  /** Rows received from outside the dashboard that no person has decided yet.
   *  They are not applications and are not counted as one anywhere. */
  staged_count: number;
  intake_open: boolean;
  intake_key: CycleIntakeKeyState | null;
  scheduled_window: CycleScheduledWindow;
  days_until_deadline?: number | null;
  cohort_runtime: CohortRuntime;
  created_at: string;
  updated_at: string;
}

/** Write payload: program_id is sent, the rest mirror the editable fields. */
export type ApplicationCycleWrite = Partial<Omit<ApplicationCycleItem,
  'id' | 'application_count' | 'accepted_count' | 'staged_count' | 'intake_open'
  | 'intake_key' | 'scheduled_window' | 'days_until_deadline' | 'cohort_runtime'
  | 'created_at' | 'updated_at'>>
  & { program_id: number; name: string; target_cohort_size: number };

/** An update: a cycle stays in the program it was created in, so the program is
 *  only ever sent on create. */
export type ApplicationCycleEdit = Omit<ApplicationCycleWrite, 'program_id'>;

// ─── External intake: the staged queue, a cycle's key, and spreadsheet imports ─

/** One row's reason for being hard to file. A description for the reader, never
 *  a score and never a decision — `code`s are listed, not applied. */
export interface IntakeIssue {
  code: string;
  field?: string;
  message: string;
}

export interface IntakeSubmissionRow {
  id: number;
  program_id: number;
  program_name: string;
  cycle_id: number | null;
  cycle_name: string | null;
  source: 'website' | 'spreadsheet' | 'api' | string;
  external_id: string | null;
  founder_email: string;
  founder_name: string;
  company_name: string;
  status: 'staged' | 'accepted' | 'dismissed' | string;
  issues: IntakeIssue[];
  blocking_gaps: string[];
  can_accept: boolean;
  note: string;
  batch_ref: string | null;
  /** The submission as it arrived, keyed by the sender's own headings. */
  payload: Record<string, string>;
  application_id: number | null;
  decided_by: { id: number; email: string } | null;
  decided_at: string | null;
  created_at: string;
}

/** What the key endpoint answers. `intake_key` is present on exactly one
 *  response — the call that issued or rotated it — and on no read. */
export interface IntakeKeyResponse {
  cycle_id: number;
  program_id: number;
  intake_open: boolean;
  hint: string | null;
  issued_at: string | null;
  issued_by: string | null;
  intake_key?: string;
  detail?: string;
}

export interface IntakeImportRow {
  row_number: number;
  founder_email: string;
  founder_name: string;
  company_name: string;
  external_id: string | null;
  issues: IntakeIssue[];
  payload: Record<string, string>;
}

export interface IntakeImportCounts {
  rows: number;
  with_issues: number;
  can_accept: number;
  already_in_queue?: number;
  stored?: number;
  already_staged?: number;
}

/** A preview (`committed: false`) writes nothing; the rows it returns are the
 *  server's reading of the file, not stored data. A commit returns the rows it
 *  actually stored. The two shapes are kept apart so neither is mistaken for
 *  the other in the screen. */
export interface IntakeImportPreview {
  committed: false;
  headers: string[];
  unmapped_headers: string[];
  suggested_mapping: Record<string, string>;
  mapping: Record<string, string>;
  counts: IntakeImportCounts;
  rows: IntakeImportRow[];
  rows_truncated: boolean;
}

export interface IntakeImportCommit {
  committed: true;
  batch_ref: string;
  counts: IntakeImportCounts & { stored: number; already_staged: number };
  rows: IntakeSubmissionRow[];
  rows_truncated: boolean;
}

export type IntakeImportResult = IntakeImportPreview | IntakeImportCommit;

/** Accept is the only intake call that files an application, and it says
 *  whether it opened a founder account to do it — the account cannot sign in
 *  until its owner claims it. */
export interface IntakeAcceptResult {
  detail: string;
  submission: IntakeSubmissionRow;
  application_id: number;
  founder_account_created: boolean;
}



export interface DashboardReportItem {  id?: number; program_id?: number; name: string; description?: string; metric: string;
  filters?: Record<string, any>; group_by?: string; compare?: string; visualization?: string;
  is_public_to_org?: boolean;
}
export interface EventOutboxItem {
  id: number; program: number; application?: number | null; event_type: string;
  payload: Record<string, any>; status: string; occurred_at: string; processed_at?: string | null;
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

  updateProgram: async (id: number, data: Partial<AcceleratorProgram> & Record<string, any>): Promise<AcceleratorProgram> => {
    const res = await api.patch<AcceleratorProgram>(`/accelerator/programs/${id}/`, data);
    return res.data;
  },

  // Application cycles are plain CRUD over /accelerator/application-cycles/,
  // reached through osList/osCreate/osUpdate/osDelete below with the typed
  // ApplicationCycleItem shape. Every date, count and phase comes from the
  // server; an unset date arrives as null.

  checkEligibility: async (programId: number, data: EligibilityCheckRequest) => {
    const res = await api.post<EligibilityResult>(`/accelerator/programs/${programId}/check-eligibility/`, data);
    return res.data;
  },

  // Eligibility & Triage tab payload: buckets, ranked gate failures, per-app
  // requirement breakdowns and recent overrides — all computed server-side by
  // the same engine that answers checkEligibility.
  getEligibilityReport: async (programId?: number): Promise<EligibilityReport> => {
    const res = await api.get<EligibilityReport>('/accelerator/applications/eligibility-report/', {
      params: programId ? { program_id: programId } : {},
    });
    return res.data;
  },

  // Persist eligibility onto application rows (feeds the funnel's Eligibility
  // Check step + eligibility_passed automations). Idempotent; safe to re-run.
  evaluateEligibility: async (programId?: number): Promise<{ evaluated: number; generated_at: string }> => {
    const res = await api.post<{ evaluated: number; generated_at: string }>(
      '/accelerator/applications/evaluate-eligibility/',
      {},
      { params: programId ? { program_id: programId } : {} },
    );
    return res.data;
  },

  // Reviewer Consensus tab payload: lanes, deduped human consensus per
  // candidate, truthful ML screening state, calibration and open
  // disagreements — computed server-side, never re-derived in the browser.
  getReviewerConsensus: async (programId?: number): Promise<ReviewerConsensusReport> => {
    const res = await api.get<ReviewerConsensusReport>(
      '/accelerator/applications/reviewer-consensus-report/',
      { params: programId ? { program_id: programId } : {} },
    );
    return res.data;
  },

  // Cohort-wide reviewer calibration for ONE program. The consensus tab reads
  // the same numbers inside reviewer-consensus-report; this endpoint exists for
  // screens (Analytics) that only need the calibration block.
  getReviewerCalibration: async (programId: number): Promise<ReviewerCalibration> => {
    const res = await api.get<ReviewerCalibration>('/accelerator/reviews/calibration/', {
      params: { program_id: programId },
    });
    return res.data;
  },

  // Closing a flagged variance is a human act; it requires an explanation and
  // records who did it in the row's resolution notes.
  resolveDisagreement: async (id: number, resolutionNotes: string): Promise<ReviewerDisagreementRow> => {
    const res = await api.post<ReviewerDisagreementRow>(
      `/accelerator/disagreements/${id}/resolve/`,
      { resolution_notes: resolutionNotes },
    );
    return res.data;
  },

  // ── Reviewer assignment ────────────────────────────────────────────────────
  // Who the program ASKED to review an application, and by when. This routes
  // attention and records ownership — it is not a gate on who may review, and
  // not a verdict. Staff-only endpoint (a founder's own row returns no list).

  /** Requires programId or applicationId: an unscoped bulk read is refused. */
  listReviewAssignments: async (scope: {
    programId?: number;
    applicationId?: number;
    reviewerId?: number;
    status?: AssignmentStatus | AssignmentStatus[];
  }): Promise<ReviewAssignmentDetail[]> => {
    const res = await api.get<any>('/accelerator/review-assignments/', {
      params: {
        ...(scope.programId ? { program_id: scope.programId } : {}),
        ...(scope.applicationId ? { application_id: scope.applicationId } : {}),
        ...(scope.reviewerId ? { reviewer: scope.reviewerId } : {}),
        ...(scope.status
          ? { assignment_status: (Array.isArray(scope.status) ? scope.status : [scope.status]).join(',') }
          : {}),
      },
    });
    return unwrapList<ReviewAssignmentDetail>(res.data);
  },

  /** The server answers with one page of the eligible pool plus how many it
   *  matched, so a large program is never fetched whole to be filtered in the
   *  browser. `candidates` is that page — a short list may mean "narrower
   *  search", not "nobody else exists"; `total_matching` says which. */
  reviewAssignmentCandidates: async (scope: {
    programId: number;
    /** Seats already on this application are marked `already_asked`. */
    applicationId?: number | null;
    q?: string;
    limit?: number;
  }): Promise<AssignmentCandidatePage> => {
    const res = await api.get<AssignmentCandidatePage>(
      '/accelerator/review-assignments/candidates/',
      {
        params: {
          program_id: scope.programId,
          ...(scope.applicationId ? { application_id: scope.applicationId } : {}),
          ...(scope.q ? { q: scope.q } : {}),
          ...(scope.limit ? { limit: scope.limit } : {}),
        },
      },
    );
    return {
      ...res.data,
      candidates: res.data.candidates ?? [],
    };
  },

  createReviewAssignment: async (input: {
    application: number;
    reviewer: number;
    round_id?: string;
    /** 'YYYY-MM-DD' from a date input; stored as end of that day. */
    due_date?: string | null;
    notes?: string;
  }): Promise<ReviewAssignmentDetail> => {
    const { due_date, ...rest } = input;
    const res = await api.post<ReviewAssignmentDetail>('/accelerator/review-assignments/', {
      ...rest,
      due_at: due_date ? `${due_date}T23:59:59Z` : null,
    });
    return res.data;
  },

  updateReviewAssignment: async (
    id: number,
    input: {
      status?: AssignmentStatus;
      conflict_status?: AssignmentConflictStatus;
      due_date?: string | null;
      notes?: string;
    }
  ): Promise<ReviewAssignmentDetail> => {
    const { due_date, ...rest } = input;
    const body: Record<string, unknown> = { ...rest };
    if (due_date !== undefined) body.due_at = due_date ? `${due_date}T23:59:59Z` : null;
    const res = await api.patch<ReviewAssignmentDetail>(
      `/accelerator/review-assignments/${id}/`,
      body
    );
    return res.data;
  },

  deleteReviewAssignment: async (id: number): Promise<void> => {
    await api.delete(`/accelerator/review-assignments/${id}/`);
  },

  // ── Due diligence items ────────────────────────────────────────────────────
  // Ownership of an open question, not a decision about the startup. Staff-only
  // endpoint; every count the DD board shows comes back from /rollup/ rather
  // than being tallied in the browser.

  /** Requires programId or applicationId: an unscoped bulk read is refused. */
  listDiligenceItems: async (scope: {
    programId?: number;
    applicationId?: number;
    ownerId?: number | 'none';
    status?: DiligenceStatus | DiligenceStatus[];
    overdueOnly?: boolean;
  }): Promise<DiligenceItemRow[]> => {
    const res = await api.get<any>('/accelerator/diligence-items/', {
      params: {
        ...(scope.programId ? { program_id: scope.programId } : {}),
        ...(scope.applicationId ? { application_id: scope.applicationId } : {}),
        ...(scope.ownerId !== undefined ? { owner: scope.ownerId } : {}),
        ...(scope.status
          ? { item_status: (Array.isArray(scope.status) ? scope.status : [scope.status]).join(',') }
          : {}),
        ...(scope.overdueOnly ? { overdue: 'true' } : {}),
      },
    });
    return unwrapList<DiligenceItemRow>(res.data);
  },

  /** Requires programId or applicationId. */
  getDiligenceRollup: async (scope: {
    programId?: number;
    applicationId?: number;
  }): Promise<DiligenceRollup> => {
    const res = await api.get<DiligenceRollup>('/accelerator/diligence-items/rollup/', {
      params: {
        ...(scope.programId ? { program_id: scope.programId } : {}),
        ...(scope.applicationId ? { application_id: scope.applicationId } : {}),
      },
    });
    return res.data;
  },

  createDiligenceItem: async (input: {
    application: number;
    question: string;
    area?: string;
    /** User id, or null to leave the question explicitly unowned. */
    owner?: number | null;
    /** 'YYYY-MM-DD' from a date input; stored as end of that day. */
    due_date?: string | null;
  }): Promise<DiligenceItemRow> => {
    const { due_date, ...rest } = input;
    const res = await api.post<DiligenceItemRow>('/accelerator/diligence-items/', {
      ...rest,
      due_at: due_date ? `${due_date}T23:59:59Z` : null,
    });
    return res.data;
  },

  updateDiligenceItem: async (
    id: number,
    input: {
      question?: string;
      area?: string;
      status?: DiligenceStatus;
      /** Pass null to take the question off someone without deleting it. */
      owner?: number | null;
      due_date?: string | null;
      resolution_note?: string;
    }
  ): Promise<DiligenceItemRow> => {
    const { due_date, ...rest } = input;
    const body: Record<string, unknown> = { ...rest };
    if (due_date !== undefined) body.due_at = due_date ? `${due_date}T23:59:59Z` : null;
    const res = await api.patch<DiligenceItemRow>(
      `/accelerator/diligence-items/${id}/`,
      body
    );
    return res.data;
  },

  deleteDiligenceItem: async (id: number): Promise<void> => {
    await api.delete(`/accelerator/diligence-items/${id}/`);
  },

  getPipeline: async (programId: number) => {    const res = await api.get<PipelineData>(`/accelerator/programs/${programId}/pipeline/`);
    return res.data;
  },

  getCohort: async (programId: number) => {
    const res = await api.get<any>(`/accelerator/programs/${programId}/cohort/`);
    return res.data;
  },

  // Workflow OS — definition (stages + transitions)
  getWorkflow: async (programId: number): Promise<WorkflowConfig> => {
    const res = await api.get<WorkflowConfig>(`/accelerator/programs/${programId}/workflow/`);
    return res.data;
  },

  saveWorkflow: async (
    programId: number,
    config: { style: string; stages: WorkflowStage[]; transitions: WorkflowTransition[] }
  ): Promise<WorkflowConfig> => {
    const res = await api.put<WorkflowConfig>(`/accelerator/programs/${programId}/workflow/`, config);
    return res.data;
  },

  // Workflow OS — automations (trigger → conditions → queued actions)
  listAutomations: async (programId: number): Promise<WorkflowAutomation[]> => {
    const res = await api.get<any>('/accelerator/automations/', { params: { program_id: programId } });
    return unwrapList<WorkflowAutomation>(res.data);
  },

  createAutomation: async (data: AutomationInput): Promise<WorkflowAutomation> => {
    const res = await api.post<WorkflowAutomation>('/accelerator/automations/', data);
    return res.data;
  },

  updateAutomation: async (id: number, data: Partial<AutomationInput>): Promise<WorkflowAutomation> => {
    const res = await api.patch<WorkflowAutomation>(`/accelerator/automations/${id}/`, data);
    return res.data;
  },

  deleteAutomation: async (id: number): Promise<void> => {
    await api.delete(`/accelerator/automations/${id}/`);
  },

  // Applications. The list endpoint paginates at 25/page by default and
  // returns {count, results}. getApplicationsPaged keeps the full envelope;
  // getApplications returns just the current page's rows (back-compatible
  // shape for callers that only need one page — pass page_size to widen).
  getApplications: async (programId?: number, params?: ApplicationListParams): Promise<ApplicationItem[]> => {
    const res = await api.get<any>('/accelerator/applications/', {
      params: { ...(programId ? { program_id: programId } : {}), ...(params || {}) },
    });
    return unwrapList<ApplicationItem>(res.data);
  },

  getApplicationsPaged: async (programId?: number, params?: ApplicationListParams): Promise<Paged<ApplicationItem>> => {
    const res = await api.get<any>('/accelerator/applications/', {
      params: { ...(programId ? { program_id: programId } : {}), ...(params || {}) },
    });
    return unwrapPaged<ApplicationItem>(res.data);
  },

  getScreeningSummary: async (programId?: number): Promise<import('./screening').ScreeningSummary> => {
    const res = await api.get<import('./screening').ScreeningSummary>('/accelerator/applications/screening-summary/', {
      params: programId ? { program_id: programId } : {},
    });
    return res.data;
  },

  getAllowedTransitions: async (id: number): Promise<AllowedTransitions> => {
    const res = await api.get<AllowedTransitions>(`/accelerator/applications/${id}/allowed-transitions/`);
    return res.data;
  },

  getApplicationNotes: async (id: number): Promise<AppNote[]> => {
    const res = await api.get<AppNote[]>(`/accelerator/applications/${id}/notes/`);
    return unwrapList<AppNote>(res.data);
  },

  addApplicationNote: async (id: number, body: string): Promise<AppNote> => {
    const res = await api.post<AppNote>(`/accelerator/applications/${id}/notes/`, { body });
    return res.data;
  },

  getApplicationComments: async (id: number): Promise<AppNote[]> => {
    const res = await api.get<AppNote[]>(`/accelerator/applications/${id}/comments/`);
    return unwrapList<AppNote>(res.data);
  },

  addApplicationComment: async (id: number, body: string): Promise<AppNote> => {
    const res = await api.post<AppNote>(`/accelerator/applications/${id}/comments/`, { body });
    return res.data;
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

  // The server refuses an unscoped bulk read — scorecards are per-program data,
  // so a caller must say which application (or program) it is asking about.
  getDisagreements: async (applicationId: number, programId?: number) => {
    const res = await api.get('/accelerator/disagreements/', {
      params: { application_id: applicationId, ...(programId ? { program_id: programId } : {}) },
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

  // Decision Room
  getDecisionRoom: async (programId: number) => {
    const res = await api.get<DecisionRoomSummary>(`/accelerator/programs/${programId}/decision-room/`);
    return res.data;
  },

  getCandidateCard: async (applicationId: number) => {
    const res = await api.get<CandidateCard>(`/accelerator/applications/${applicationId}/candidate-card/`);
    return res.data;
  },

  recordCommitteeDecision: async (
    applicationId: number,
    data: { decision: string; rationale: string; voting_summary?: Record<string, any> }
  ) => {
    const res = await api.post(`/accelerator/applications/${applicationId}/record-decision/`, data);
    return res.data;
  },

  // ── Decision OS: reviewer assist (AI produces evidence/recommendations only) ─
  advanceApplicationStage: async (
    id: number,
    toStage: string,
    reason?: string,
    override = false,
  ) => {
    const res = await api.post<any>(`/accelerator/applications/${id}/transition-status/`, {
      status: toStage,
      ...(reason ? { reason } : {}),
      ...(override ? { override: true } : {}),
    });
    return res.data;
  },

  recordReviewerScore: async (data: Record<string, any>) => {
    const res = await api.post<any>('/accelerator/reviews/', data);
    return res.data;
  },

  /** One row per application the server actually ran triage on. `ok: false` rows
   * carry the failure; rows it never touched are counted in `not_run`. */
  batchAnalyzeApplications: async (applicationIds: number[]): Promise<BatchAnalyzeResponse> => {
    const res = await api.post<BatchAnalyzeResponse>('/accelerator/applications/batch-analyze/', {
      application_ids: applicationIds,
    });
    return res.data;
  },

  /** Same endpoint, whole-program scope (server-capped). */
  triageAllApplications: async (programId: number): Promise<BatchAnalyzeResponse> => {
    const res = await api.post<BatchAnalyzeResponse>('/accelerator/applications/batch-analyze/', {
      program_id: programId,
    });
    return res.data;
  },

  /** The signed-in reviewer's own scoring behaviour against peers on shared
   * applications. Agreement is null until enough cards overlap. */
  getMyReviewerCalibration: async (programId?: number): Promise<MyReviewerCalibration> => {
    const res = await api.get<MyReviewerCalibration>(`/accelerator/reviews/my-calibration/`, {
      params: programId ? { program_id: programId } : {},
    });
    return res.data;
  },

  /** The versioned evaluation policy behind a program's scores. `version` and
   *  `scoring_dimensions` are the model's own field names — a policy has no
   *  `version_label` and no `weights` map. Empty means the program was never
   *  given a policy, which is not the same as a policy with no dimensions. */
  getPolicies: async (programId?: number): Promise<EvaluationPolicyItem[]> => {
    const res = await api.get<any>('/accelerator/policies/', {
      params: programId ? { program_id: programId } : {},
    });
    return unwrapList<EvaluationPolicyItem>(res.data);
  },

  // Founder Evidence Graph — read-only claim/evidence/contradiction traversal
  getEvidenceGraph: async (applicationId: number): Promise<EvidenceGraph> => {
    const res = await api.get<EvidenceGraph>('/accelerator/evidence-graph/', {
      params: { application_id: applicationId },
    });
    return res.data;
  },

  // Deterministic interview probes for one application, derived server-side
  // from the stored assessment and open claims (no ML call).
  getInterviewGuide: async (applicationId: number): Promise<InterviewGuide> => {
    const res = await api.get<InterviewGuide>(`/accelerator/applications/${applicationId}/interview-guide/`);
    return res.data;
  },

  // Interview transcript. Append-only: the server numbers each turn, stamps it
  // and records who wrote it down, so this is not a notes blob somebody can
  // rewrite. Staff-only — a founder must not be able to author what "the
  // founder said".
  captureInterviewTranscript: async (
    sessionId: number,
    turns: Array<{ speaker: TranscriptSpeaker; text: string }>
  ): Promise<TranscriptWriteResult> => {
    const res = await api.post<TranscriptWriteResult>(
      `/accelerator/interviews/${sessionId}/transcript/`,
      { turns }
    );
    return res.data;
  },

  // A human decides which heard answer was an assertion worth checking. The
  // row lands unverified, citing the session and turn.
  recordInterviewClaim: async (
    sessionId: number,
    input: {
      turn: number;
      statement?: string;
      category: string;
      materiality: string;
      evidence_required?: boolean;
    }
  ): Promise<ApplicationClaim> => {
    const res = await api.post<ApplicationClaim>(
      `/accelerator/interviews/${sessionId}/record-claim/`,
      input
    );
    return res.data;
  },

  // ── Claim verification ──────────────────────────────────────────────────
  // A claim's state is a recorded human act, so it has one write path and it is
  // not a PATCH on the claim. The offer is read from the row itself: the state
  // list, the model's own labels and each state's precondition come from
  // `evidence_state` on the server, so a control cannot offer `verified` to a
  // claim that has nothing attached and then take the refusal on the user's
  // behalf.
  getClaimVerificationOffer: async (claimId: number): Promise<ClaimVerificationRow> => {
    const res = await api.get<ClaimVerificationRow>(`/accelerator/claims/${claimId}/`);
    return res.data;
  },

  recordClaimVerification: async (
    claimId: number,
    input: { state: string; note?: string }
  ): Promise<ClaimVerificationRow> => {
    const res = await api.post<ClaimVerificationRow>(
      `/accelerator/claims/${claimId}/verification/`,
      input
    );
    return res.data;
  },

  // Mentorship
  getMentors: async (programId?: number) => {
    const res = await api.get<any>('/accelerator/mentors/', {
      params: programId ? { program_id: programId } : {},
    });
    return res.data;
  },

  assignMentor: async (data: { startup_id: number; mentor_id: number; program_id: number }) => {
    const res = await api.post('/accelerator/mentors/assign/', data);
    return res.data;
  },

  createMentorSession: async (data: Record<string, any>) => {
    const res = await api.post('/accelerator/mentor-sessions/', data);
    return res.data;
  },

  // Due Diligence lives under /accelerator/diligence-items/ — see the
  // DiligenceItem methods above. (An older `due-diligence/` pair of helpers
  // here pointed at a route the backend never registered.)

  // Outcomes / Alumni
  getOutcomes: async (programId?: number) => {
    const res = await api.get<any>('/accelerator/outcomes/', {
      params: programId ? { program_id: programId } : {},
    });
    return res.data;
  },

  // Seed defaults helper
  seedDefaults: async () => {
    const res = await api.post('/accelerator/seed-defaults/');
    return res.data;
  },

  // User / Organization Context
  getContext: async (): Promise<UserContextResponse> => {
    const res = await api.get<UserContextResponse>('/accelerator/context/');
    return res.data;
  },

  // There is no `role` parameter: the server reports the account's role, and a
  // role the client asserted used to be echoed straight back as authority.
  switchContext: async (data: {
    organization_id?: number | null;
    program_id?: number | null;
  }): Promise<UserContextResponse> => {
    const res = await api.post<UserContextResponse>('/accelerator/context/switch/', data);
    return res.data;
  },

  // The signed-in user's own open work in one program: reviews assigned to
  // them, diligence questions they own, interviews naming them as the
  // interviewer, evidence requests still with a founder. Counts come from the
  // server; an empty result means nothing is owed to this person.
  getWorkInbox: async (programId: number): Promise<WorkInboxReport> => {
    const res = await api.get<WorkInboxReport>('/accelerator/work-inbox/', {
      params: { program_id: programId },
    });
    return res.data;
  },

  // ── Program OS: generic config + subsystem CRUD ───────────────────────────
  // `resource` is the router prefix without slashes, e.g. 'stages', 'forms',
  // 'tracks', 'curriculum-weeks', 'mentor-profiles', 'outcome-records', ...
  osList: async <T>(resource: string, programId?: number): Promise<T[]> => {
    const res = await api.get<any>(`/accelerator/${resource}/`, {
      params: programId ? { program_id: programId } : {},
    });
    return unwrapList<T>(res.data);
  },
  osGet: async <T>(resource: string, id: number): Promise<T> => {
    const res = await api.get<T>(`/accelerator/${resource}/${id}/`);
    return res.data;
  },
  osCreate: async <T>(resource: string, data: any): Promise<T> => {
    const res = await api.post<T>(`/accelerator/${resource}/`, data);
    return res.data;
  },
  osUpdate: async <T>(resource: string, id: number, data: any): Promise<T> => {
    const res = await api.patch<T>(`/accelerator/${resource}/${id}/`, data);
    return res.data;
  },
  osDelete: async (resource: string, id: number): Promise<void> => {
    await api.delete(`/accelerator/${resource}/${id}/`);
  },

  // ── The program's own team ────────────────────────────────────────────────
  // Seating a person is the only way a second account comes to work a program
  // it did not create, and the server refuses the write for any account that
  // does not run the program — so this screen offers the action and the
  // backend decides, rather than the browser guessing who may click it.
  listProgramStaff: async (programId: number): Promise<ProgramStaffSeat[]> => {
    const res = await api.get<any>('/accelerator/program-staff/', {
      params: { program_id: programId },
    });
    return unwrapList<ProgramStaffSeat>(res.data);
  },

  /** The roles a seat may carry, straight off the server's field choices, so the
   *  picker cannot offer a title the database would refuse. */
  programStaffRoleOptions: async (): Promise<StaffRoleOption[]> => {
    const res = await api.get<StaffRoleOption[]>('/accelerator/program-staff/role-options/');
    return res.data ?? [];
  },

  seatProgramStaff: async (input: {
    program_id: number;
    user: number;
    role: string;
  }): Promise<ProgramStaffSeat> => {
    const res = await api.post<ProgramStaffSeat>('/accelerator/program-staff/', input);
    return res.data;
  },

  /** Deactivating is the reversible shape of leaving the team: the seat stays
   *  on the record and stops granting reach. */
  setProgramStaffSeatActive: async (id: number, is_active: boolean): Promise<ProgramStaffSeat> => {
    const res = await api.patch<ProgramStaffSeat>(`/accelerator/program-staff/${id}/`, { is_active });
    return res.data;
  },

  removeProgramStaffSeat: async (id: number): Promise<void> => {
    await api.delete(`/accelerator/program-staff/${id}/`);
  },

  // ── External intake: the staged queue, a cycle's key, spreadsheet imports ──
  // Nothing here creates an application except `acceptIntakeSubmission`, and the
  // server records the account that clicked it. The founder's own form posts to
  // a fourth endpoint (/intake/ingest/) that no dashboard code calls.
  listIntakeSubmissions: async (params: {
    program_id?: number | null; cycle_id?: number | null; status?: string;
  } = {}): Promise<IntakeSubmissionRow[]> => {
    const res = await api.get<any>('/accelerator/intake-submissions/', {
      params: Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''),
      ),
    });
    return unwrapList<IntakeSubmissionRow>(res.data);
  },
  acceptIntakeSubmission: async (id: number): Promise<IntakeAcceptResult> => {
    const res = await api.post<IntakeAcceptResult>(`/accelerator/intake-submissions/${id}/accept/`);
    return res.data;
  },
  dismissIntakeSubmission: async (id: number, note: string): Promise<{ detail: string }> => {
    const res = await api.post<{ detail: string }>(
      `/accelerator/intake-submissions/${id}/dismiss/`, { note },
    );
    return res.data;
  },
  getCycleIntakeKey: async (cycleId: number): Promise<IntakeKeyResponse> => {
    const res = await api.get<IntakeKeyResponse>(
      `/accelerator/application-cycles/${cycleId}/intake-key/`,
    );
    return res.data;
  },
  /** issue | rotate | seal. The plaintext key comes back from the one call that
   *  creates it, so the caller must show it and cannot ask for it again. */
  setCycleIntakeKey: async (
    cycleId: number, action: 'issue' | 'rotate' | 'seal',
  ): Promise<IntakeKeyResponse> => {
    const res = await api.post<IntakeKeyResponse>(
      `/accelerator/application-cycles/${cycleId}/intake-key/`, { action },
    );
    return res.data;
  },
  /** Dry run when `commit` is false — the server writes nothing and answers with
   *  every row's verdict, including the columns it could not map. */
  importIntakeFile: async (vars: {
    file: File; programId: number; cycleId?: number | null;
    mapping?: Record<string, string>; commit: boolean;
  }): Promise<IntakeImportResult> => {
    const form = new FormData();
    form.append('file', vars.file);
    form.append('program_id', String(vars.programId));
    if (vars.cycleId != null) form.append('cycle_id', String(vars.cycleId));
    if (vars.mapping) form.append('mapping', JSON.stringify(vars.mapping));
    form.append('commit', vars.commit ? 'true' : 'false');
    const res = await api.post<IntakeImportResult>('/accelerator/intake/import/', form);
    return res.data;
  },

  // ── Form builder: publish / version / render / submit ──────────────────────
  publishForm: async (id: number): Promise<FormDefinitionItem> => {
    const res = await api.post<FormDefinitionItem>(`/accelerator/forms/${id}/publish/`);
    return res.data;
  },
  newFormVersion: async (id: number): Promise<FormDefinitionItem> => {
    const res = await api.post<FormDefinitionItem>(`/accelerator/forms/${id}/new-version/`);
    return res.data;
  },
  renderForm: async (id: number): Promise<RenderedForm> => {
    const res = await api.get<RenderedForm>(`/accelerator/forms/${id}/render/`);
    return res.data;
  },
  submitFormResponse: async (data: {
    form: number; answers: Record<string, any>; application?: number;
  }): Promise<SubmitFormResponse> => {
    const res = await api.post<SubmitFormResponse>('/accelerator/form-responses/submit/', data);
    return res.data;
  },

  // ── Notifications ──────────────────────────────────────────────────────────
  markNotificationRead: async (id: number): Promise<void> => {
    await api.post(`/accelerator/program-notifications/${id}/mark-read/`);
  },

  // ── Reports / analytics ────────────────────────────────────────────────────
  getReportData: async <T = any>(id: number): Promise<T> => {
    const res = await api.get<T>(`/accelerator/reports/${id}/data/`);
    return res.data;
  },
};
