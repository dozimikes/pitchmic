/**
 * Pitchmic Screening Intelligence — shared dashboard vocabulary and helpers.
 *
 * Single source of truth for the labels, status lists and evidence-level ladder
 * the accelerator dashboard renders. It is presentation and parsing only: every
 * screening judgement (risk, review-queue lane, attention counters, funnel) is
 * computed by the backend — see backend/apps/accelerator/queue_routing.py and
 * the screening_summary action. Pages must read those fields rather than
 * re-deriving, because divergent client copies are how one application ends up
 * "Medium risk" in one table and "High" in another.
 */

// ── Statuses (mirror AcceleratorApplication.STATUS_CHOICES — models.py) ──────
export const APP_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'SCREENING',
  'SHORTLISTED',
  'INTERVIEW_INVITED',
  'INTERVIEW_COMPLETE',
  'COMMITTEE_REVIEW',
  'EVIDENCE_REQUESTED',
  'WAITLISTED',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'DEFERRED',
] as const;

export type AppStatus = (typeof APP_STATUSES)[number];

export const STATUS_LABELS: Record<AppStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  SCREENING: 'Screening',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW_INVITED: 'Interview invited',
  INTERVIEW_COMPLETE: 'Interview complete',
  COMMITTEE_REVIEW: 'Committee review',
  EVIDENCE_REQUESTED: 'Evidence requested',
  WAITLISTED: 'Waitlisted',
  ACCEPTED: 'Selected',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  DEFERRED: 'On hold',
};

/** A decision has been made; the application leaves the active pool. */
export const TERMINAL_STATUSES: readonly AppStatus[] = ['ACCEPTED', 'REJECTED', 'WITHDRAWN'];

/** Still inside the active funnel — eligible for the review queue & actions. */
export const ACTIVE_FUNNEL_STATUSES: readonly AppStatus[] = [
  'SUBMITTED', 'SCREENING', 'SHORTLISTED', 'INTERVIEW_INVITED',
  'INTERVIEW_COMPLETE', 'COMMITTEE_REVIEW', 'EVIDENCE_REQUESTED',
  'WAITLISTED', 'DEFERRED',
];

/** Deepest-reached funnel rank per status (mirrors STATUS_REACHED_RANK). */
export const STATUS_REACHED_RANK: Record<string, number> = {
  DRAFT: 0,
  SUBMITTED: 1,
  SCREENING: 2,
  SHORTLISTED: 3,
  INTERVIEW_INVITED: 4,
  INTERVIEW_COMPLETE: 5,
  COMMITTEE_REVIEW: 6,
  EVIDENCE_REQUESTED: 6,
  WAITLISTED: 6,
  DEFERRED: 6,
  ACCEPTED: 7,
  REJECTED: 1,
  WITHDRAWN: 1,
};

export const isTerminal = (status: string): boolean =>
  (TERMINAL_STATUSES as readonly string[]).includes(status);

export const isActiveFunnel = (status: string): boolean =>
  (ACTIVE_FUNNEL_STATUSES as readonly string[]).includes(status);

// ── Evidence levels ──────────────────────────────────────────────────────────
// Product guardrail: Pitchmic never shows a bare numeric verdict. Scores are
// rendered as evidence levels. MISSING IS NOT ZERO: null/undefined returns
// null so "no data yet" can never render as "Requires validation" (which is a
// statement about the applicant, not about our fetch state).

export interface EvidenceLevel {
  label: string;
  /** Tailwind tone token: text/bg/border families to pick per surface. */
  tone: 'strong' | 'moderate' | 'limited' | 'gap';
  score: number;
}

export function evidenceLevel(score: number | null | undefined): EvidenceLevel | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  const s = Number(score);
  if (s >= 75) return { label: 'Strong evidence', tone: 'strong', score: s };
  if (s >= 55) return { label: 'Moderate evidence', tone: 'moderate', score: s };
  if (s >= 35) return { label: 'Limited evidence', tone: 'limited', score: s };
  return { label: 'Requires validation', tone: 'gap', score: s };
}

/** Short chip form of the same ladder. */
export function evidenceLevelShort(score: number | null | undefined): string {
  const lvl = evidenceLevel(score);
  if (!lvl) return 'No data';
  return { strong: 'Strong', moderate: 'Moderate', limited: 'Limited', gap: 'Needs Evidence' }[lvl.tone];
}

// ── Risk levels and queue lanes (computed by the server) ─────────────────────
// Routing lives in backend/apps/accelerator/queue_routing.py and arrives on each
// application row as risk_level / risk_reasons / queue_bucket, with the lane
// totals in screening_summary.queues. There is deliberately no client-side
// re-derivation here: a browser copy is what let one row read "Medium" in a
// table and "High" in another.

export type RiskLevel = 'High' | 'Medium' | 'Low';

export type QueueBucket = 'priority' | 'investigate' | 'hold' | 'needs_evidence' | 'wildcard';

// ── Errors ───────────────────────────────────────────────────────────────────
// lib/api.ts rejects with ApiError whose `message` already contains the
// backend's `error`/`detail`/field errors. Reading `err.response` is dead —
// ApiError does not carry the axios response. Always use this helper.

export function apiErrMessage(err: unknown, fallback = 'Action failed'): string {
  const e = err as { message?: string } | undefined;
  return e?.message?.trim() || fallback;
}

// ── CSV export (formula-injection safe) ──────────────────────────────────────

function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  // Neutralise spreadsheet formula injection (=, +, -, @, tab, CR).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(','));
  const blob = new Blob(['' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Shared query keys (one cache, not five) ──────────────────────────────────

export const qk = {
  applications: (pid?: number | null) => ['accelerator-applications', pid] as const,
  screeningSummary: (pid?: number | null) => ['accelerator-screening-summary', pid] as const,
  eligibilityReport: (pid?: number | null) => ['accelerator-eligibility-report', pid] as const,
  appDetail: (id: number) => ['accelerator-app-detail', id] as const,
  appAssessment: (id: number) => ['accelerator-app-assessment', id] as const,
  evidenceGraph: (id: number) => ['accelerator-evidence-graph', id] as const,
  allowedTransitions: (id: number) => ['accelerator-allowed-transitions', id] as const,
  appNotes: (id: number) => ['accelerator-app-notes', id] as const,
  appComments: (id: number) => ['accelerator-app-comments', id] as const,
  reviews: (pid?: number | null) => ['accelerator-reviews', pid] as const,
  reviewerConsensus: (pid?: number | null) => ['accelerator-reviewer-consensus', pid] as const,
  myCalibration: (pid?: number | null) => ['accelerator-my-calibration', pid] as const,
  appReviews: (id: number) => ['accelerator-reviews-for-app', id] as const,
  /** Seats on one application, straight from /review-assignments/. */
  reviewAssignments: (id: number) => ['accelerator-review-assignments', id] as const,
  /** Prefix that matches every application's seat list, for invalidation. */
  reviewAssignmentsAll: () => ['accelerator-review-assignments'] as const,
  /** Who may be asked, with server-counted load. The page is keyed by search
   *  text and limit too, so two different searches cannot share one cache. */
  assignmentCandidates: (pid?: number | null, q?: string, limit?: number) =>
    ['accelerator-assignment-candidates', pid, q, limit] as const,
  /** Prefix that matches every candidate page, for invalidation. */
  assignmentCandidatesAll: () => ['accelerator-assignment-candidates'] as const,
  /** Open diligence questions on one application, from /diligence-items/. */
  diligenceItems: (id: number) => ['accelerator-diligence-items', id] as const,
  /** Prefix that matches every application's diligence list, for invalidation. */
  diligenceItemsAll: () => ['accelerator-diligence-items'] as const,
  /** Program-level diligence numbers, computed by the server. */
  diligenceRollup: (pid?: number | null) => ['accelerator-diligence-rollup', pid] as const,
  decisionRoom: (pid?: number | null) => ['accelerator-decision-room', pid] as const,
  candidateCard: (id: number | null) => ['accelerator-candidate-card', id] as const,
  interviewGuide: (id: number | null) => ['accelerator-interview-guide', id] as const,
};

// ── Dates ────────────────────────────────────────────────────────────────────

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Screening-summary payload types (backend screening_summary action) ──────

export interface FunnelStep { key: string; label: string; count: number }
export interface NameCount { name: string; count: number }

/** One Selection Framework dimension ranked by the pool's mean stored score.
 *  `avg_score` is 0-100 and only present when the server actually scored the
 *  dimension on at least one application; `scored_count` is that denominator. */
export interface StrengthRow {
  key: string;
  label: string;
  avg_score: number;
  scored_count: number;
}

/** Cohort-over-cohort comparison computed server-side against the most recent
 *  other program by the same creator. A null metric means "no baseline" —
 *  render as —, never as 0%. */
export type CohortDeltaKey =
  | 'total' | 'processed' | 'review_queue' | 'interviews' | 'due_diligence' | 'selected';
export interface CohortDeltas {
  previous_program: string | null;
  metrics: Partial<Record<CohortDeltaKey, number | null>> | null;
}

export interface ScreeningSummary {
  program_id: number | null;
  total: number;
  processed: number;
  review_queue: number;
  by_status: Record<string, number>;
  attention: {
    priority: number;
    uncertain: number;
    contradictory: number;
    missing_evidence: number;
    holds: number;
  };
  /** Review-queue lane totals over the active funnel — the same router that
   *  stamps each row's `queue_bucket`, so cards and tabs cannot disagree. */
  queues?: Record<QueueBucket, number>;
  /** Pool-wide "Top Strengths" ladder, ranked by the server from stored
   *  assessment dimension scores. Absent/empty means nothing was scored. */
  strengths?: StrengthRow[];
  funnel: FunnelStep[];
  tiers: Record<string, number>;
  sectors: NameCount[];
  countries: NameCount[];
  declared_stages: NameCount[];
  week_new: number;
  prev_week_new: number;
  cohort_deltas?: CohortDeltas;
  generated_at: string;
}
