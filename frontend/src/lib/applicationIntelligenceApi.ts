import { apiGet } from './api';
import { formatDate } from './utils';

export type SourceType = 'OFFICIAL' | 'INFERRED' | 'OBSERVED';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type ImportanceLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
export type StartupStage = 'IDEA' | 'PRE_SEED' | 'SEED' | 'SERIES_A';
export type VerificationStatus =
  | 'unverified'
  | 'documentary'
  | 'third_party_verified'
  | 'machine_observed'
  | 'founder_claimed';
export type EvidenceSource =
  | 'pitch_deck'
  | 'dataroom_doc'
  | 'invoice'
  | 'contract'
  | 'cap_table'
  | 'api_telemetry'
  | 'public_registry'
  | 'product_screenshot'
  | 'financial_model'
  | 'customer_list'
  | 'analytics_export'
  | 'incorporation_doc'
  | 'pilot_agreement'
  | 'testimonial'
  | 'product_metrics';
export type PersonaType = 'PROGRAM_DIRECTOR' | 'INVESTOR' | 'TECHNICAL' | 'SKEPTICAL';
export type InformationLayer = 'FACTS' | 'SIGNALS' | 'OUTCOMES';
export type AssessmentLabel = 'Strong' | 'Moderate' | 'Weak';
export type FixPriority = 1 | 2 | 3 | 4;
export type FindingCategory =
  | 'traction'
  | 'team'
  | 'market'
  | 'product'
  | 'customers'
  | 'financials'
  | 'defensibility'
  | 'narrative';

export interface ProgramIntelligenceProfile {
  id: string;
  name: string;
  short_name?: string;
  type: 'Accelerator' | 'Grant' | 'VC Fund' | 'Competition' | 'Angel Syndicate';
  stage: string;
  investment: string;
  geography: string;
  industry: string;
  application_format: string;
  website_url?: string;
  deadline_text?: string;
  founder_quality_bar: string;
  evidence_expectations_bar: string;
  interview_intensity: string;
  created_at: string;
}

export interface ProgramSelectionSignal {
  id: string;
  program_id: string;
  criterion: string;
  source_type: SourceType;
  weight: number;
  confidence: ConfidenceLevel;
  evidence_text: string;
  official_source_ref?: string;
}

export interface ProgramRequirement {
  id: string;
  program_id: string;
  category: FindingCategory;
  description: string;
  importance: ImportanceLevel;
  rationale?: string;
}

export interface ProgramApplicationQuestion {
  id: string;
  program_id: string;
  question_number: number;
  label: string;
  rubric_dimension: string;
  importance: ImportanceLevel;
  max_char_limit?: number;
}

export interface ProgramRubric {
  program_id: string;
  requirements: ProgramRequirement[];
  questions: ProgramApplicationQuestion[];
  signals: ProgramSelectionSignal[];
}

export interface ReadinessDimension {
  key: string;
  name: string;
  score: number;
  assessment_label: AssessmentLabel;
  stage_concern_note?: string;
  positive_signals: string[];
  missing_evidence: string[];
}

export interface StartupProgramFit {
  program_id: string;
  startup_id: string;
  overall_readiness: number;
  verdict: string;
  strengths: string[];
  gaps: string[];
  risks: string[];
  dimension_scores: ReadinessDimension[];
  generated_at: string;
}

export interface StageEvidenceExpectation {
  stage: StartupStage;
  evidence_items: string[];
  description: string;
}

export interface LinkedEvidenceItem {
  id: string;
  claim_id?: string;
  source_type: EvidenceSource;
  title: string;
  verification_status: VerificationStatus;
  confidence: number;
  doc_ref?: string;
  verifier_name?: string;
  notes?: string;
  discovered_hidden?: boolean;
}

export interface EvidenceGraphNode {
  claim_id: string;
  claim_statement: string;
  claim_type:
    | 'metric'
    | 'traction'
    | 'market'
    | 'product'
    | 'team'
    | 'regulatory'
    | 'financial';
  declared_value: string;
  verified_value?: string;
  observed_value?: string;
  evidence_items: LinkedEvidenceItem[];
  confidence: number;
  time_period?: string;
  customer_count?: number;
  materiality: 'critical' | 'high' | 'medium' | 'low';
}

export interface HiddenEvidenceFinding {
  id: string;
  description: string;
  category: FindingCategory;
  confidence: ConfidenceLevel;
  suggested_usage: string;
  quantified_value?: string;
}

export interface EvidenceGapRow {
  id: string;
  program_requirement_id: string;
  program_requirement_category: FindingCategory;
  program_requirement_title: string;
  what_they_want: string;
  what_you_claim: string;
  what_you_can_prove: string;
  what_is_missing: string;
  recommendation: string;
}

export interface ApplicationStrategy {
  problem: string;
  founder_advantage: string;
  why_now: string;
  proof: string;
  program_fit: string;
  primary_weakness: string;
  mitigation: string;
}

export interface RedTeamFinding {
  id: string;
  rejection_reason: string;
  severity: 'high' | 'medium' | 'low';
  fix_priority: FixPriority;
  fix_description: string;
  estimated_impact: string;
  estimated_score_impact_points?: number;
}

export interface InterviewQuestion {
  id: string;
  program_id: string;
  question: string;
  category: string;
  public_source_ref?: string;
}

export interface AnswerEvaluation {
  dimension:
    | 'Founder-market fit'
    | 'Specificity'
    | 'Evidence'
    | 'Conviction'
    | 'Memorability'
    | 'Program alignment';
  score: number;
  feedback: string;
}

export interface EvaluatorPersona {
  id: string;
  name: string;
  type: PersonaType;
  focus_areas: string[];
  bias_description: string;
}

export interface ProgramReadinessComparison {
  program_id: string;
  program_name: string;
  overall_score: number;
  key_strength: string;
  key_gap: string;
  verdict: string;
}

export interface ReadinessAction {
  id: string;
  action: string;
  impact_points: number;
  priority: FixPriority;
  rationale: string;
  timeframe?: string;
}

export interface FundingReadinessRoadmap {
  baseline_readiness: number;
  recommended_actions: ReadinessAction[];
  projected_readiness: number;
  should_submit: boolean;
  projected_milestone?: string;
}

export interface CorrelationNote {
  id: string;
  text: string;
  layer: InformationLayer;
  caveat: string;
  sample_size_hint?: string;
}

export interface ProgramPersonaVerdict {
  persona_id: string;
  persona_name: string;
  verdict: 'lean-in' | 'neutral' | 'skeptical';
  rationale: string;
}

function ensureArray<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val as T[];
  if (val && typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if (Array.isArray(obj.results)) return obj.results as T[];
    if (Array.isArray(obj.data)) return obj.data as T[];
  }
  return [];
}

export { ensureArray, formatDate };

const TECHSTARS_PROFILE: ProgramIntelligenceProfile = {
  id: 'prog-techstars',
  name: 'Techstars',
  short_name: 'Techstars',
  type: 'Accelerator',
  stage: 'Early stage (Pre-Seed through Seed)',
  investment: '$220K for 6% equity',
  geography: 'Global / program-specific',
  industry: 'Program dependent (Fintech, Climate, Health, SaaS, etc.)',
  application_format: 'Online application + written responses + pitch deck + optional video',
  website_url: 'https://www.techstars.com',
  deadline_text: 'Rolling deadlines per cohort location',
  founder_quality_bar: 'VERY HIGH',
  evidence_expectations_bar: 'HIGH',
  interview_intensity: 'HIGH',
  created_at: '2026-09-01T10:00:00.000Z',
};

const TECHSTARS_SIGNALS: ProgramSelectionSignal[] = [
  {
    id: 'sig-ts-team',
    program_id: 'prog-techstars',
    criterion: 'TEAM',
    source_type: 'OFFICIAL',
    weight: 10,
    confidence: 'HIGH',
    evidence_text: '"We invest in people first. Team is the single most important factor."',
    official_source_ref: 'Techstars "What we look for" guidance, 2025',
  },
  {
    id: 'sig-ts-market',
    program_id: 'prog-techstars',
    criterion: 'MARKET',
    source_type: 'OFFICIAL',
    weight: 8,
    confidence: 'HIGH',
    evidence_text: 'Large, rapidly growing addressable market with near-term inflection.',
    official_source_ref: 'Techstars partner guidance, 2026',
  },
  {
    id: 'sig-ts-traction',
    program_id: 'prog-techstars',
    criterion: 'TRACTION',
    source_type: 'INFERRED',
    weight: 7,
    confidence: 'MEDIUM',
    evidence_text:
      'Accelerated companies often show early revenue, pilots, or strong user retention — but zero-revenue companies are explicitly accepted.',
    official_source_ref:
      'Inferred from Techstars CEO public interviews: "We have funded pre-revenue companies that became unicorns."',
  },
  {
    id: 'sig-ts-idea',
    program_id: 'prog-techstars',
    criterion: 'IDEA',
    source_type: 'OFFICIAL',
    weight: 5,
    confidence: 'HIGH',
    evidence_text:
      'The idea matters less than founder velocity, adaptability, and execution capability.',
    official_source_ref: 'Techstars partner memo, circulated Q1 2025',
  },
  {
    id: 'sig-ts-revenue',
    program_id: 'prog-techstars',
    criterion: 'B2B SAAS TRACTION',
    source_type: 'OBSERVED',
    weight: 6,
    confidence: 'MEDIUM',
    evidence_text:
      'Cohort analysis: accepted companies in the B2B SaaS tracks averaged 2.4 paying customers at application time.',
    official_source_ref:
      'Observed patterns among 220+ accepted companies in Pitchmic dataset (2023–2025 cohorts)',
  },
];

const TECHSTARS_REQUIREMENTS: ProgramRequirement[] = [
  {
    id: 'req-ts-team',
    program_id: 'prog-techstars',
    category: 'team',
    description:
      'Demonstrable founder ability: domain expertise, execution velocity, and coachability.',
    importance: 'VERY_HIGH',
    rationale: 'TEAM carries the maximum signal weight in the rubric.',
  },
  {
    id: 'req-ts-market',
    program_id: 'prog-techstars',
    category: 'market',
    description:
      'Concrete market sizing: TAM, SAM, SOM with bottom-up support, not just top-down assertions.',
    importance: 'HIGH',
  },
  {
    id: 'req-ts-traction',
    program_id: 'prog-techstars',
    category: 'traction',
    description:
      'Any validation signal available: customers, pilots, prototypes, surveys, LOIs, corporate interest — not necessarily revenue.',
    importance: 'HIGH',
  },
  {
    id: 'req-ts-product',
    program_id: 'prog-techstars',
    category: 'product',
    description:
      'Product clarity and defensibility narrative; why now, why you, and the moat trajectory.',
    importance: 'MEDIUM',
  },
  {
    id: 'req-ts-financials',
    program_id: 'prog-techstars',
    category: 'financials',
    description:
      'Unit economics if revenue exists; otherwise a clear path to pricing and monetization.',
    importance: 'MEDIUM',
  },
];

const TECHSTARS_QUESTIONS: ProgramApplicationQuestion[] = [
  {
    id: 'q-ts-1',
    program_id: 'prog-techstars',
    question_number: 1,
    label: 'Describe the problem you are solving.',
    rubric_dimension: 'Problem clarity',
    importance: 'HIGH',
    max_char_limit: 1500,
  },
  {
    id: 'q-ts-2',
    program_id: 'prog-techstars',
    question_number: 2,
    label: 'Describe your solution and why it is better.',
    rubric_dimension: 'Solution differentiation',
    importance: 'HIGH',
    max_char_limit: 1500,
  },
  {
    id: 'q-ts-3',
    program_id: 'prog-techstars',
    question_number: 3,
    label: 'Describe your team and why you are uniquely positioned to win.',
    rubric_dimension: 'Team advantage',
    importance: 'VERY_HIGH',
    max_char_limit: 1500,
  },
  {
    id: 'q-ts-4',
    program_id: 'prog-techstars',
    question_number: 4,
    label: 'What traction have you demonstrated so far?',
    rubric_dimension: 'Traction',
    importance: 'HIGH',
    max_char_limit: 1500,
  },
  {
    id: 'q-ts-5',
    program_id: 'prog-techstars',
    question_number: 5,
    label: 'How big is the market and how did you size it?',
    rubric_dimension: 'Market',
    importance: 'HIGH',
    max_char_limit: 1500,
  },
  {
    id: 'q-ts-6',
    program_id: 'prog-techstars',
    question_number: 6,
    label: 'How do you make money? Describe your business model and unit economics.',
    rubric_dimension: 'Business model',
    importance: 'MEDIUM',
    max_char_limit: 1500,
  },
];

export const STAGE_EVIDENCE_EXPECTATIONS: StageEvidenceExpectation[] = [
  {
    stage: 'IDEA',
    description:
      'Idea-stage companies are not expected to produce revenue evidence. Focus on insight, validation, and early building.',
    evidence_items: [
      'Founder insight (proprietary problem exposure)',
      'Problem validation interviews (≥ 10)',
      'Customer discovery notes / journey maps',
      'Market evidence (data points, news, regulation)',
      'Prototype or technical feasibility demo',
    ],
  },
  {
    stage: 'PRE_SEED',
    description:
      'Pre-seed companies should show product and user validation artifacts. Revenue is not required but is a positive signal.',
    evidence_items: [
      'Working prototype / MVP',
      'Early user validation (signups, waitlist, beta users)',
      'Pilot interest or LOIs from target customers',
      'Early usage metrics (DAU/MAU, retention, session length)',
      'Founder-market fit narrative (domain background + path)',
      'Market evidence and adjacent trend data',
    ],
  },
  {
    stage: 'SEED',
    description:
      'Seed-stage applications require commercial proof and repeatable distribution patterns.',
    evidence_items: [
      'Revenue (paid customers, MRR/ARR trend)',
      'Customer count and retention cohorts',
      'Growth (MoM revenue or user growth)',
      'Distribution playbook (CAC, channels, conversion)',
      'Unit economics (CAC payback, LTV, gross margin)',
    ],
  },
  {
    stage: 'SERIES_A',
    description:
      'Series A requires proven scale, predictability, and durable economics.',
    evidence_items: [
      'Revenue trajectory and repeatability',
      'Growth rate (MoM / QoQ)',
      'Retention (cohort curves, NDR, gross revenue retention)',
      'CAC efficiency and payback period',
      'LTV and LTV:CAC ratio trend',
      'Gross margin and contribution margin stability',
      'Repeatability across segments / geos',
    ],
  },
];

const SEED_EVIDENCE_ITEMS: LinkedEvidenceItem[] = [
  {
    id: 'ev-pilot-1',
    source_type: 'pilot_agreement',
    title: 'Pilot Agreement — Merchant A (Lagos)',
    verification_status: 'documentary',
    confidence: 0.92,
    doc_ref: 'DATAROOM/PILOT/LAGOS-001.pdf',
    verifier_name: 'Document extractor',
    discovered_hidden: true,
  },
  {
    id: 'ev-pilot-2',
    source_type: 'pilot_agreement',
    title: 'Pilot Agreement — Merchant B (Abeokuta)',
    verification_status: 'documentary',
    confidence: 0.88,
    doc_ref: 'DATAROOM/PILOT/ABK-002.pdf',
    verifier_name: 'Document extractor',
    discovered_hidden: true,
  },
  {
    id: 'ev-pilot-3',
    source_type: 'pilot_agreement',
    title: 'Pilot Agreement — Merchant C (Ibadan)',
    verification_status: 'documentary',
    confidence: 0.85,
    doc_ref: 'DATAROOM/PILOT/IB-003.pdf',
    verifier_name: 'Document extractor',
    discovered_hidden: true,
  },
  {
    id: 'ev-analytics-1',
    source_type: 'analytics_export',
    title: 'Weekly usage analytics export (17 active merchants)',
    verification_status: 'machine_observed',
    confidence: 0.9,
    doc_ref: 'ANALYTICS/EVENTS/2026-W33.csv',
    verifier_name: 'Usage analytics sync',
    discovered_hidden: true,
  },
  {
    id: 'ev-loi-1',
    source_type: 'contract',
    title: 'LOI — Regional Distributor PLC',
    verification_status: 'documentary',
    confidence: 0.9,
    doc_ref: 'DATAROOM/LOI/RD-2026.pdf',
    verifier_name: 'Document extractor',
    discovered_hidden: true,
  },
  {
    id: 'ev-loi-2',
    source_type: 'contract',
    title: 'LOI — Corporate Treasury Group',
    verification_status: 'documentary',
    confidence: 0.8,
    doc_ref: 'DATAROOM/LOI/CTG-2026.pdf',
    verifier_name: 'Document extractor',
    discovered_hidden: true,
  },
  {
    id: 'ev-fin-1',
    source_type: 'financial_model',
    title: 'Internal financial model — transaction volume',
    verification_status: 'founder_claimed',
    confidence: 0.6,
    doc_ref: 'MODEL/2026-08-FIN.xlsx',
    verifier_name: 'Self-reported',
    discovered_hidden: true,
  },
  {
    id: 'ev-dev-hist',
    source_type: 'product_metrics',
    title: 'Git commit history — 8 months of active product development',
    verification_status: 'machine_observed',
    confidence: 0.95,
    verifier_name: 'VCS integration',
    discovered_hidden: true,
  },
  {
    id: 'ev-ent-conv',
    source_type: 'customer_list',
    title: 'CRM notes — 3 enterprise conversations in progress',
    verification_status: 'documentary',
    confidence: 0.7,
    verifier_name: 'CRM export',
    discovered_hidden: true,
  },
];

export const SEED_EVIDENCE_GRAPH: EvidenceGraphNode[] = [
  {
    claim_id: 'claim-pilots',
    claim_statement: '4 pilot merchants are actively using the platform',
    claim_type: 'traction',
    declared_value: '4 Pilot Merchants (Lagos, Abeokuta, Ibadan + 1)',
    verified_value: '3 Documentary Pilot Agreements + Usage Analytics',
    observed_value: '17 active weekly merchant users',
    evidence_items: [
      SEED_EVIDENCE_ITEMS[0],
      SEED_EVIDENCE_ITEMS[1],
      SEED_EVIDENCE_ITEMS[2],
      SEED_EVIDENCE_ITEMS[3],
    ],
    confidence: 0.85,
    time_period: '2026 W30 – W35',
    customer_count: 4,
    materiality: 'high',
  },
  {
    claim_id: 'claim-lois',
    claim_statement: 'Letter-of-intent discussions are underway with enterprise counterparties',
    claim_type: 'traction',
    declared_value: '2 LOIs signed',
    verified_value: '2 Documentary LOIs on file',
    observed_value: '3 additional enterprise conversations ongoing',
    evidence_items: [
      SEED_EVIDENCE_ITEMS[4],
      SEED_EVIDENCE_ITEMS[5],
      SEED_EVIDENCE_ITEMS[8],
    ],
    confidence: 0.82,
    materiality: 'high',
  },
  {
    claim_id: 'claim-txn',
    claim_statement: 'Platform is processing meaningful transaction volume across merchants',
    claim_type: 'financial',
    declared_value: '₦4.2M cumulative processed',
    verified_value: '₦4.2M (founder model)',
    observed_value: 'Reported in financial model',
    evidence_items: [SEED_EVIDENCE_ITEMS[6]],
    confidence: 0.62,
    time_period: 'Since Jan 2026',
    materiality: 'medium',
  },
  {
    claim_id: 'claim-team',
    claim_statement:
      'Founder has 8 years of engineering experience and built the MVP independently',
    claim_type: 'team',
    declared_value: '8 years engineering experience · MVP built independently',
    verified_value: 'Resume + Git history corroborate',
    evidence_items: [SEED_EVIDENCE_ITEMS[7]],
    confidence: 0.88,
    materiality: 'high',
  },
];

export const SEED_HIDDEN_FINDINGS: HiddenEvidenceFinding[] = [
  {
    id: 'hid-users',
    description: '17 active weekly users across 4 pilot merchants',
    category: 'traction',
    confidence: 'HIGH',
    suggested_usage:
      'Lead with this number in the traction answer. Compare it to early-stage benchmarks and pair with the weekly retention trend.',
    quantified_value: '17 active users',
  },
  {
    id: 'hid-pilots',
    description: '4 signed pilot companies (Lagos, Abeokuta, Ibadan + 1)',
    category: 'traction',
    confidence: 'HIGH',
    suggested_usage:
      'Name the 3 documentary pilots in the traction answer and, with permission, name the merchants as social proof.',
    quantified_value: '4 pilot companies',
  },
  {
    id: 'hid-lois',
    description: '2 signed LOIs plus 3 enterprise conversations in progress',
    category: 'traction',
    confidence: 'MEDIUM',
    suggested_usage:
      'Use in "Why now" and traction sections to demonstrate increasing downstream demand and commercial momentum.',
    quantified_value: '2 LOIs',
  },
  {
    id: 'hid-growth',
    description: '37% weekly usage growth W30 → W35',
    category: 'customers',
    confidence: 'HIGH',
    suggested_usage:
      'Put this early in the traction section and tie it to specific merchant activation events to show velocity.',
    quantified_value: '37% weekly growth',
  },
  {
    id: 'hid-volume',
    description: '₦4.2M in cumulative payment volume processed',
    category: 'financials',
    confidence: 'MEDIUM',
    suggested_usage:
      'Cite this in the business-model answer alongside the per-transaction take-rate; emphasize "self-reported, under audit".',
    quantified_value: '₦4.2M processed',
  },
  {
    id: 'hid-dev',
    description: '8 months of consistent product development (Git commit history)',
    category: 'product',
    confidence: 'HIGH',
    suggested_usage:
      'Use in the founder-advantage section to reinforce build velocity and tenacity before formal incorporation.',
    quantified_value: '8 months dev history',
  },
  {
    id: 'hid-ent',
    description: '3 enterprise conversations logged in CRM',
    category: 'traction',
    confidence: 'MEDIUM',
    suggested_usage:
      'Mention delicately in "Go-to-market" and pipeline sections to show the distribution conversation has already started.',
    quantified_value: '3 enterprise convos',
  },
];

export const SEED_GAP_MAP_ROWS: EvidenceGapRow[] = [
  {
    id: 'gap-team',
    program_requirement_id: 'req-ts-team',
    program_requirement_category: 'team',
    program_requirement_title: 'Founder / Team Advantage',
    what_they_want:
      'Concrete proof that founder has the unique domain, execution, and resilience advantage needed to win.',
    what_you_claim:
      '8 years engineering experience; built MVP alone; first-principle understanding of the payments stack.',
    what_you_can_prove:
      '✓ 8 years engineering experience (resume)\n✓ MVP built and shipped\n✓ 8-month git commit history',
    what_is_missing:
      '⚠ No quantified founder achievement metric\n⚠ No clear founder-market connection (Nigerian SME finance exposure narrative)\n⚠ Team size = solo founder; no co-founder or advisors listed',
    recommendation:
      'Strengthen founder narrative: quantify one flagship engineering achievement (e.g. "Led a $X migration" or "Shipped Y to Z customers") and explicitly connect personal background to why Nigerian SMEs trust you as a builder.',
  },
  {
    id: 'gap-traction',
    program_requirement_id: 'req-ts-traction',
    program_requirement_category: 'traction',
    program_requirement_title: 'Traction / Validation',
    what_they_want:
      'Any credible validation: customers, pilots, prototypes, surveys, LOIs, corporate interest — quality of proof matters more than quantity.',
    what_you_claim:
      '4 pilot merchants using the platform; 2 LOIs; early usage data trending up.',
    what_you_can_prove:
      '✓ 3 documentary pilot agreements\n✓ 17 weekly active users (analytics)\n✓ 2 LOIs on file\n✓ 37% weekly usage growth over 6 weeks',
    what_is_missing:
      '⚠ Customer / pilot retention is asserted but not quantified\n⚠ No qualitative customer quotes or testimonials on file\n⚠ No clear statement on pilot-to-paid conversion plan',
    recommendation:
      'Quantify pilot-to-paid roadmap and add 1–2 named merchant testimonials or post-pilot interview snippets. Map each pilot → explicit next-step conversion milestone.',
  },
  {
    id: 'gap-market',
    program_requirement_id: 'req-ts-market',
    program_requirement_category: 'market',
    program_requirement_title: 'Market Sizing (bottom-up)',
    what_they_want:
      'Bottom-up market size with transaction-volume math, not generic "Nigerian fintech is $XBn" top-down claims.',
    what_you_claim:
      'Huge market of Nigerian SMEs lacking unified financial visibility.',
    what_you_can_prove:
      '✓ Nigerian SME population statistics from public registry',
    what_is_missing:
      '⚠ No bottom-up per-merchant revenue × merchant count calculation\n⚠ No SAM/SOM decomposition\n⚠ No explicit trend (CAGR, regulation change, digitization wave) cited as catalyst',
    recommendation:
      'Replace generic TAM line with a 3-row bottom-up: number of addressable merchants × average take-rate per merchant × penetration 3-year SOM. Add one explicit "why now" regulatory or digitization catalyst.',
  },
  {
    id: 'gap-competitive',
    program_requirement_id: 'req-ts-product',
    program_requirement_category: 'defensibility',
    program_requirement_title: 'Competitive Differentiation',
    what_they_want:
      'Clear reason incumbents cannot copy the solution easily, plus first-mover or data-network-effect advantages.',
    what_you_claim:
      'Local operator advantage and unified visibility across fragmented payment rails.',
    what_you_can_prove:
      '✓ 3 existing pilot integrations with local payment rails',
    what_is_missing:
      '⚠ Competitive landscape matrix not documented\n⚠ Replication barrier not described (why banks/fintechs cannot copy in 1 quarter)\n⚠ No integration moat or proprietary dataset story',
    recommendation:
      'Write a 3-sentence moat statement: integration-specific partnerships, workflow data that compounds per merchant, and first-mover regional relationships. Then contrast head-to-head with the top 2 incumbents.',
  },
];

export const SEED_STRATEGY: ApplicationStrategy = {
  problem:
    'African SMEs operate across fragmented payment rails and bank accounts with no unified financial visibility. Owners cannot answer basic questions like "how much am I actually making this week" or "which channel drives real revenue", leading to poor cash flow decisions and inability to borrow against their own data.',
  founder_advantage:
    'Technical founder with 8 years in payments engineering who built the full stack MVP independently and has 8 months of live commit history. First-hand operator experience on Nigerian payment APIs means the team moves faster than generalist founders contracting out the core infrastructure.',
  why_now:
    'Digital-payment fragmentation keeps accelerating as new rails and agency-banking providers launch each quarter. SME digitization is a secular trend accelerated by CBN policy, not a fad — the window to own the SME financial-visibility layer is the next 12–18 months.',
  proof:
    'Existing product with 4 signed pilot merchants, 17 weekly active users, 37% week-over-week usage growth, 2 signed LOIs, and 3 additional enterprise conversations in CRM. ₦4.2M cumulative transaction volume already flowing through the system.',
  program_fit:
    "Techstars' fintech and financial-infrastructure focus, emphasis on founder velocity over pedigree, and global mentor network align exactly with this company's needs: program can accelerate US market expansion, introduce downstream banking partners, and validate the commercial model before a formal priced round.",
  primary_weakness:
    'Commercial traction is limited to pilots; no paying MRR yet. Solo-founder profile means board-level governance, hiring, and commercial BD all sit with one person.',
  mitigation:
    'Demonstrate validation beyond revenue: focus every answer on pilot depth (17 weekly actives, 37% WoW growth, LOIs, enterprise conversations). Frame the solo-founder model as capital efficiency and velocity, then proactively address hiring plan and advisory board in the interview phase.',
};

export const SEED_RED_TEAM: RedTeamFinding[] = [
  {
    id: 'red-traction',
    rejection_reason:
      'Traction is insufficiently demonstrated. Application reads as pilot-heavy with no clear, quantified path from pilot → paying customer.',
    severity: 'high',
    fix_priority: 1,
    fix_description:
      'Rewrite traction section around 3 proven pillars: 4 pilots, 17 actives, 37% WoW growth. Attach 1 explicit conversion milestone per pilot and name the 1–2 that will close to paid within 60 days post-program.',
    estimated_impact: '++ Commercial credibility; closes the biggest rejection vector',
    estimated_score_impact_points: 9,
  },
  {
    id: 'red-founder',
    rejection_reason:
      'Founder story reads as "generic engineering competence" but does not establish a clear unfair advantage or founder-market connection.',
    severity: 'high',
    fix_priority: 2,
    fix_description:
      'Quantify one flagship engineering outcome; explicitly connect professional background to Nigerian SME pain (e.g. personal network of 20+ SMEs consulted before MVP; family exposure to SME cash-flow pain).',
    estimated_impact: '+ Founder signal; shifts team read from "good" to "differentiated"',
    estimated_score_impact_points: 7,
  },
  {
    id: 'red-tam',
    rejection_reason:
      'Market size is asserted as generically large rather than evidenced with a bottom-up merchant × take-rate calculation.',
    severity: 'medium',
    fix_priority: 3,
    fix_description:
      'Replace top-down TAM with 3-row bottom-up calculation: addressable merchant base × average per-merchant take × 3-year realistic SOM. Add one regulatory or policy catalyst as "why now".',
    estimated_impact: '+ Market rigor; removes an easy-flag objection',
    estimated_score_impact_points: 5,
  },
  {
    id: 'red-moat',
    rejection_reason:
      'Competitive differentiation is unclear. Why cannot an incumbent bank or large fintech copy the exact feature set in one quarter?',
    severity: 'medium',
    fix_priority: 4,
    fix_description:
      'Write a 3-sentence moat: (1) rail-specific integration depth (already proven with 3 pilots), (2) per-merchant workflow data compounds as users grow, (3) first-mover relationships with regional aggregators. Include a quick 2-incumbent comparison matrix as an appendix answer.',
    estimated_impact: '+ Defensibility signal; reduces reviewer skepticism',
    estimated_score_impact_points: 4,
  },
];

export const SEED_INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'int-why-person',
    program_id: 'prog-techstars',
    question:
      'Why are you the right person to build this? What do you understand about the problem that outsiders do not?',
    category: 'Founder motivation / advantage',
    public_source_ref: 'Techstars published interview guide, 2025',
  },
  {
    id: 'int-customers',
    program_id: 'prog-techstars',
    question:
      'Walk me through your most excited customer and the specific value they get that they cannot get anywhere else.',
    category: 'Customer demand / validation',
    public_source_ref: 'Techstars MD interview playbook',
  },
  {
    id: 'int-roadmap',
    program_id: 'prog-techstars',
    question:
      'What will your product look like 18 months from now, and what specifically will you ship in the next 90 days to get there?',
    category: 'Development roadmap / milestones',
    public_source_ref: 'Techstars interview FAQ',
  },
  {
    id: 'int-competition',
    program_id: 'prog-techstars',
    question:
      'Who are your most dangerous competitors and why will you beat them even if they are better-funded?',
    category: 'Competition / defensibility',
  },
  {
    id: 'int-capital',
    program_id: 'prog-techstars',
    question:
      'How will you deploy this $220K and what metrics will you use to prove it is working 3 months in?',
    category: 'Capital requirements / milestones',
  },
  {
    id: 'int-weakness',
    program_id: 'prog-techstars',
    question:
      "What is your biggest weakness as a founder right now, and what are you doing to address it?",
    category: 'Self-awareness / coachability',
  },
];

export const SEED_EVALUATOR_PERSONAS: EvaluatorPersona[] = [
  {
    id: 'p-director',
    name: 'Program Director',
    type: 'PROGRAM_DIRECTOR',
    focus_areas: [
      'Founder quality and coachability',
      'Market size and program thesis fit',
      'Whether this startup can meaningfully benefit from the 13-week program',
      'Network value to other portfolio founders',
    ],
    bias_description:
      'Optimizes for founder-company and founder-cohort fit; will reject great-looking companies if the founder reads as uncoachable.',
  },
  {
    id: 'p-investor',
    name: 'Investor',
    type: 'INVESTOR',
    focus_areas: [
      'Market expansion and return potential',
      'Unit economics and path to $10M ARR',
      'Exit scenarios and strategic acquirers',
      'Capital efficiency and burn trajectory',
    ],
    bias_description:
      'Wants to see 10× return path; skeptical of any claim without commercial proof; loves clear pricing.',
  },
  {
    id: 'p-technical',
    name: 'Technical Reviewer',
    type: 'TECHNICAL',
    focus_areas: [
      'Product architecture and technical choices',
      'Moat: integration depth, proprietary data, or algorithmic edge',
      'Scalability of the current MVP to 100× volume',
      'Founder technical depth and velocity',
    ],
    bias_description:
      'Reacts negatively to hand-waving about infrastructure; wants specific stacks, data models, and failure-modes discussed honestly.',
  },
  {
    id: 'p-skeptical',
    name: 'Skeptical Reviewer',
    type: 'SKEPTICAL',
    focus_areas: [
      'Weak claims missing evidence',
      'Internal contradictions between answers',
      'Hidden risks in market, competition, or founder assumptions',
      'Anything that looks like vanity metrics or "storytelling without data".',
    ],
    bias_description:
      'Assumes every applicant is overstating by at least 2×; goes line-by-line looking for assertions without citation or quantification.',
  },
];

const COMPARISON_PROGRAMS_BASE: Array<{
  profile: ProgramIntelligenceProfile;
  comparison: Omit<ProgramReadinessComparison, 'program_id' | 'program_name'>;
}> = [
  {
    profile: {
      id: 'prog-techstars',
      name: 'Techstars',
      type: 'Accelerator',
      stage: 'Early stage',
      investment: '$220K',
      geography: 'Global',
      industry: 'Program dependent',
      application_format: 'Online',
      founder_quality_bar: 'VERY HIGH',
      evidence_expectations_bar: 'HIGH',
      interview_intensity: 'HIGH',
      created_at: '2026-09-01T10:00:00.000Z',
    },
    comparison: {
      overall_score: 71,
      key_strength: 'Founder velocity, 37% WoW usage growth in pilots',
      key_gap: 'Limited paying revenue, solo-founder governance',
      verdict: 'Strong fit for fintech-focused cohort if narrative sharpened',
    },
  },
  {
    profile: {
      id: 'prog-yc',
      name: 'Y Combinator',
      type: 'Accelerator',
      stage: 'Early stage',
      investment: '$500K',
      geography: 'Global (mostly US)',
      industry: 'Broad tech',
      application_format: 'Online application + video interview',
      founder_quality_bar: 'EXTREMELY HIGH',
      evidence_expectations_bar: 'VERY HIGH',
      interview_intensity: 'VERY HIGH',
      created_at: '2026-09-01T10:00:00.000Z',
    },
    comparison: {
      overall_score: 63,
      key_strength: 'Clear MVP + usage trajectory',
      key_gap:
        'YC expects extreme ambition / TAM and US market orientation — neither is clearly established yet',
      verdict: 'Possible but borderline; rewrite the market story before applying',
    },
  },
  {
    profile: {
      id: 'prog-masschallenge',
      name: 'MassChallenge',
      type: 'Accelerator',
      stage: 'Early stage',
      investment: 'No-equity grant + in-kind services',
      geography: 'Global hubs',
      industry: 'Broad (impact & general)',
      application_format: 'Online application',
      founder_quality_bar: 'MODERATE',
      evidence_expectations_bar: 'MODERATE',
      interview_intensity: 'MODERATE',
      created_at: '2026-09-01T10:00:00.000Z',
    },
    comparison: {
      overall_score: 84,
      key_strength:
        'Nigerian fintech impact angle, clear pilot traction with real merchants',
      key_gap: 'Impact KPIs (financial inclusion) not yet articulated clearly',
      verdict: 'High-probability target with modest impact-KPI updates',
    },
  },
  {
    profile: {
      id: 'prog-africa',
      name: 'African-Focused Fintech Accelerator',
      short_name: 'African Accelerator',
      type: 'Accelerator',
      stage: 'Pre-seed through Seed',
      investment: '$100K – $150K for equity',
      geography: 'Pan-African (Lagos / Nairobi / Accra)',
      industry: 'Fintech, financial inclusion, SME infra',
      application_format: 'Online + regional partner referral',
      founder_quality_bar: 'HIGH',
      evidence_expectations_bar: 'HIGH',
      interview_intensity: 'HIGH',
      created_at: '2026-09-01T10:00:00.000Z',
    },
    comparison: {
      overall_score: 91,
      key_strength:
        'Hyper-aligned thesis: on-ground Nigerian SME pilots, local-payment integration depth',
      key_gap: 'Must still tighten commercial milestones and post-program capital use',
      verdict: 'Highest program-alignment target; apply immediately after light polish',
    },
  },
  {
    profile: {
      id: 'prog-deeptech',
      name: 'Deep-Tech Research Accelerator',
      short_name: 'Deep-Tech Accelerator',
      type: 'Accelerator',
      stage: 'R&D / pre-commercial',
      investment: '$250K+ non-dilutive grant + equity',
      geography: 'US / EU',
      industry: 'Deep science, AI/ML infrastructure, hard tech',
      application_format: 'Research-focused + advisor letters',
      founder_quality_bar: 'VERY HIGH',
      evidence_expectations_bar: 'SPECIALISED',
      interview_intensity: 'VERY HIGH',
      created_at: '2026-09-01T10:00:00.000Z',
    },
    comparison: {
      overall_score: 38,
      key_strength: 'Engineering credibility',
      key_gap:
        'The program requires defensible technical breakthrough or proprietary research dataset; this is an SME-payments integration play, not a deep-tech story.',
      verdict: 'Poor program-thesis fit; application energy is better spent elsewhere',
    },
  },
];

export const COMPARISON_PROGRAM_PROFILES: ProgramIntelligenceProfile[] =
  COMPARISON_PROGRAMS_BASE.map((c) => c.profile);

export const SEED_COMPARISON: ProgramReadinessComparison[] =
  COMPARISON_PROGRAMS_BASE.map((c) => ({
    program_id: c.profile.id,
    program_name: c.profile.name,
    ...c.comparison,
  }));

export const SEED_ROADMAP: FundingReadinessRoadmap = {
  baseline_readiness: 64,
  should_submit: false,
  projected_milestone:
    'After 4–6 weeks of focused validation work, Techstars readiness improves to ~82 and African accelerator climbs to ~95.',
  recommended_actions: [
    {
      id: 'act-pilot-conversion',
      action: 'Secure 1 pilot agreement with explicit post-pilot paid conversion terms',
      impact_points: 8,
      priority: 1,
      rationale:
        'Directly closes the #1 Red-Team objection (traction demonstration). Turns a "pilot-heavy" story into a "paying-on-ramp" story.',
      timeframe: '2 weeks',
    },
    {
      id: 'act-validation-interviews',
      action: 'Conduct 3 additional customer-validation interviews and write short case notes',
      impact_points: 7,
      priority: 2,
      rationale:
        'Supports founder-market fit, Problem, and Traction dimensions simultaneously. Turns qualitative claim into documented proof.',
      timeframe: '1 week',
    },
    {
      id: 'act-founder-narrative',
      action:
        'Rewrite founder-advantage answer with one quantified engineering milestone + explicit founder-market connection to Nigerian SME finance',
      impact_points: 5,
      priority: 3,
      rationale:
        'Founder is the #1-weighted Techstars criterion. 1–2 hours of focused writing for a very high signal/effort return.',
      timeframe: '0.5 week',
    },
    {
      id: 'act-bottomup-tam',
      action:
        'Replace top-down TAM with a 3-row bottom-up merchant-count × per-merchant-take × SOM calculation plus one "why now" catalyst',
      impact_points: 4,
      priority: 4,
      rationale:
        'Low-effort, high-certainty improvement; removes the easiest skeptical objection from any reviewer.',
      timeframe: '0.5 week',
    },
  ],
  projected_readiness: 88,
};

export const SEED_CORRELATIONS: CorrelationNote[] = [
  {
    id: 'corr-1',
    text:
      'Among applications in our dataset, named pilot customers with written agreements are associated with higher interview rates — particularly for African-focused programs.',
    layer: 'OUTCOMES',
    caveat:
      'This is an observed correlation, not an official program requirement. Other unobserved factors (founder network, referral) may also contribute.',
    sample_size_hint: 'Based on 1,420 program applications tracked',
  },
  {
    id: 'corr-2',
    text:
      'Applications that include at least one quantified founder achievement with numbers (not adjectives) are associated with higher team-dimension scores during committee review.',
    layer: 'OUTCOMES',
    caveat:
      'Correlational finding from Pitchmic-tracked outcomes. Individual reviewers may have different rubrics.',
    sample_size_hint: 'Based on committee read-throughs of 860 applications',
  },
  {
    id: 'corr-3',
    text:
      'Written bottom-up market-sizing (merchant-count × take × SOM) is associated with lower "market rigor" flags in review notes, compared with generic top-down regional TAM claims.',
    layer: 'SIGNALS',
    caveat:
      'Inferred pattern from Pitchmic reading of public review notes; not an official position of any listed program.',
  },
];

export function computeDimensionAssessment(score: number): AssessmentLabel {
  if (score >= 75) return 'Strong';
  if (score >= 55) return 'Moderate';
  return 'Weak';
}

export function computeStageConditionedTractionScore(
  stage: StartupStage,
  revenueUsd: number,
  pilotCount: number,
  activeUsers: number,
  lois: number,
  weeklyGrowthPct: number,
): { score: number; stage_note?: string } {
  if (stage === 'IDEA' || stage === 'PRE_SEED') {
    const nonRevenueSignals =
      Math.min(4, pilotCount) * 6 +
      Math.min(50, activeUsers) * 0.6 +
      Math.min(4, lois) * 5 +
      Math.min(60, weeklyGrowthPct) * 0.4;
    const score = Math.round(Math.min(100, 42 + nonRevenueSignals));
    const note =
      stage === 'IDEA'
        ? 'Idea-stage scoring calibrated: revenue is not expected. Expected evidence: prototypes, customer interviews, founder insight, pilot interest.'
        : 'Pre-seed scoring calibrated: zero revenue is acceptable here. Quality of validation (pilots, usage, LOIs) drives the dimension.';
    return { score, stage_note: note };
  }
  const revenueComponent = Math.min(30, revenueUsd / 5000);
  const pilotComponent = Math.min(20, pilotCount * 2);
  const userComponent = Math.min(20, activeUsers * 0.25);
  const growthComponent = Math.min(15, weeklyGrowthPct * 0.4);
  const loiComponent = Math.min(15, lois * 4);
  const score = Math.round(
    Math.min(100, revenueComponent + pilotComponent + userComponent + growthComponent + loiComponent),
  );
  return { score };
}

export function computeReadinessDimensions(
  stage: StartupStage,
  overrides?: Partial<Record<string, number>>,
): ReadinessDimension[] {
  const defaults: ReadinessDimension[] = [
    {
      key: 'founder_team',
      name: 'Founder / Team',
      score: 82,
      assessment_label: 'Strong',
      positive_signals: [
        '8 years engineering experience documented',
        'MVP built independently — proven build velocity',
        '8-month git history shows consistent progress',
      ],
      missing_evidence: [
        'Quantified flagship engineering achievement',
        'Clear founder-market connection to Nigerian SMEs',
        'Solo founder: no co-founder, advisors, or hiring plan visible',
      ],
    },
    {
      key: 'market',
      name: 'Market',
      score: 74,
      assessment_label: 'Strong',
      positive_signals: [
        'Pain is widely documented (SMEs, fragmented rails, cash flow opacity)',
        'Strong macro tailwind: CBN digitization + agency banking expansion',
      ],
      missing_evidence: [
        'Bottom-up SAM/SOM instead of generic TAM',
        'Explicit "why now" catalyst with date / data',
      ],
    },
    {
      key: 'problem',
      name: 'Problem',
      score: 78,
      assessment_label: 'Strong',
      positive_signals: [
        'Problem language is specific and cash-flow-critical for small merchants',
        'Aligns with multiple known African SME-finance pain points',
      ],
      missing_evidence: [
        'Named customer interview quotes corroborating pain intensity',
        'Baseline: how long does the problem cost a merchant per week in cash?',
      ],
    },
    {
      key: 'product',
      name: 'Product',
      score: 61,
      assessment_label: 'Moderate',
      positive_signals: [
        'MVP exists and 3 integrations to local payment rails are verified',
        'Active weekly usage across pilots',
      ],
      missing_evidence: [
        '3-sentence moat statement (replication barrier)',
        'Quick competitive matrix vs. top 2 incumbents',
        'Roadmap milestones for 90-day / 6-month / 18-month horizons',
      ],
    },
    {
      key: 'traction',
      name: 'Traction',
      score: 42,
      assessment_label: 'Weak',
      stage_concern_note:
        'Pre-seed calibrated: zero revenue is acceptable but pilot → paid conversion must be explicit.',
      positive_signals: [
        '4 signed pilots',
        '17 weekly active users',
        '37% WoW usage growth',
        '2 LOIs on file',
      ],
      missing_evidence: [
        'Quantified pilot-to-paid conversion milestones',
        'Named pilot customer quotes / testimonials',
        'Retention numbers or pilot-NPS scores',
      ],
    },
    {
      key: 'evidence',
      name: 'Evidence',
      score: 38,
      assessment_label: 'Weak',
      positive_signals: [
        '3 documentary pilot agreements on file',
        '2 LOIs on file',
        'Usage analytics corroborate 17 actives',
      ],
      missing_evidence: [
        'Most traction claims are founder-asserted or model-sourced without third-party verification',
        'Testimonials and customer validation interviews not in evidence graph',
      ],
    },
    {
      key: 'competitive_advantage',
      name: 'Competitive Advantage',
      score: 57,
      assessment_label: 'Moderate',
      positive_signals: [
        'Existing 3 pilot rail integrations are a head start',
        'On-ground regional operator perspective vs. remote international entrants',
      ],
      missing_evidence: [
        'Why incumbents cannot replicate in 1 quarter',
        'Any proprietary data or network-effect dynamic',
      ],
    },
    {
      key: 'application_quality',
      name: 'Application Quality',
      score: 69,
      assessment_label: 'Moderate',
      positive_signals: [
        'Structured answers exist across all required questions',
        'Evidence assets available to back most claims',
      ],
      missing_evidence: [
        'Answers need Red-Team pass to avoid sounding generic',
        'Core narrative must tie every answer back to the strategy.',
      ],
    },
  ];
  const tractionOverride = computeStageConditionedTractionScore(
    stage,
    0,
    4,
    17,
    2,
    37,
  );
  return defaults.map((d) => {
    const score = overrides?.[d.key] ?? d.score;
    const finalScore =
      d.key === 'traction' ? Math.max(score, tractionOverride.score) : score;
    return {
      ...d,
      score: finalScore,
      assessment_label: computeDimensionAssessment(finalScore),
      stage_concern_note:
        d.key === 'traction' ? tractionOverride.stage_note : d.stage_concern_note,
    };
  });
}

export function computeOverallReadiness(dimensions: ReadinessDimension[]): number {
  if (dimensions.length === 0) return 0;
  const sum = dimensions.reduce((acc, d) => acc + d.score, 0);
  return Math.round(sum / dimensions.length);
}

export function computeProgramReadiness(
  program: ProgramIntelligenceProfile,
  startup_stage: StartupStage,
  baseline_dims: ReadinessDimension[],
): number {
  const weights: Record<string, number> = {
    'prog-techstars': 1.0,
    'prog-yc': 0.92,
    'prog-masschallenge': 1.12,
    'prog-africa': 1.22,
    'prog-deeptech': 0.55,
  };
  const baseline = computeOverallReadiness(baseline_dims);
  const w = weights[program.id] ?? 1.0;
  return Math.max(0, Math.min(100, Math.round(baseline * w)));
}

export function evaluateInterviewAnswer(
  question: InterviewQuestion,
  answer: string,
): AnswerEvaluation[] {
  const length = answer.trim().length;
  const hasNumbers = /\d/.test(answer);
  const hasEvidenceWords =
    /\b(prove|evidence|document|verified|analysis|pilot|customer|data|metric|number|stat)\b/i.test(
      answer,
    );
  const hasMarketWords =
    /\b(nigeria|lagos|sme|payment|rail|fintech|agency|banking)\b/i.test(answer);
  const hasStoryWords = /\b(because|so that|which meant|led to|result)\b/i.test(answer);
  const scoreFor = (conditions: boolean[], base = 50): number => {
    const add = conditions.reduce((acc, c) => acc + (c ? 9 : 0), 0);
    return Math.min(100, Math.max(25, base + add + (length > 200 ? 3 : length > 80 ? 1 : -5)));
  };
  return [
    {
      dimension: 'Founder-market fit',
      score: scoreFor([hasMarketWords, hasStoryWords, hasNumbers, length > 140], 52),
      feedback:
        hasMarketWords && hasNumbers
          ? 'Good: explicitly connects to market with data.'
          : 'Add a concrete founder × market detail: a number, a named merchant, or a regulatory trigger.',
    },
    {
      dimension: 'Specificity',
      score: scoreFor([hasNumbers, length > 140, hasStoryWords], 48),
      feedback:
        length > 140 && hasNumbers
          ? 'Sufficiently specific numbers and timeline.'
          : 'Too generic: add a quantified specific and/or a named example (company, person, or amount).',
    },
    {
      dimension: 'Evidence',
      score: scoreFor([hasEvidenceWords, hasNumbers], 40),
      feedback:
        hasEvidenceWords && hasNumbers
          ? 'Claims are linked to documents or metrics.'
          : 'Your answer is persuasive but contains no concrete evidence supporting your claim. Name the artifact that proves it (pilot agreement, analytics, customer interview, etc.).',
    },
    {
      dimension: 'Conviction',
      score: scoreFor([length > 100, hasStoryWords], 55),
      feedback:
        length > 100 && hasStoryWords
          ? 'Conviction comes through naturally.'
          : 'Short and tentative: add one strong causal "because..." clause that anchors why you believe this.',
    },
    {
      dimension: 'Memorability',
      score: scoreFor([hasStoryWords, length > 120, hasNumbers], 45),
      feedback:
        hasStoryWords && hasNumbers
          ? 'Memorable hook present.'
          : 'Low memorability: try a one-sentence specific anecdote — e.g. "When merchant X told me Y".',
    },
    {
      dimension: 'Program alignment',
      score: scoreFor([hasMarketWords, hasEvidenceWords], 50),
      feedback:
        hasMarketWords && hasEvidenceWords
          ? 'Reads as aligned with accelerator evaluation model.'
          : 'Tie back to what the program weighs heavily (team, market, validation). Mention 1 explicit criterion from the program rubric.',
    },
  ];
}

export function computePersonaVerdicts(
  dims: ReadinessDimension[],
  overall: number,
): ProgramPersonaVerdict[] {
  const byKey = Object.fromEntries(dims.map((d) => [d.key, d.score]));
  const team = byKey.founder_team ?? 50;
  const market = byKey.market ?? 50;
  const traction = byKey.traction ?? 50;
  const product = byKey.product ?? 50;
  const evidence = byKey.evidence ?? 50;
  return [
    {
      persona_id: 'p-director',
      persona_name: 'Program Director',
      verdict: team >= 70 ? 'lean-in' : overall >= 65 ? 'neutral' : 'skeptical',
      rationale:
        team >= 70
          ? 'Reads as coachable, high-velocity founder aligned with cohort cohort-thesis; likely pushes toward interview.'
          : overall >= 65
          ? 'Wants to see stronger founder-market story before pushing for a slot.'
          : 'Needs significant founder-narrative work before program will commit interview bandwidth.',
    },
    {
      persona_id: 'p-investor',
      persona_name: 'Investor',
      verdict: traction >= 55 && market >= 70 ? 'lean-in' : evidence >= 45 ? 'neutral' : 'skeptical',
      rationale:
        traction >= 55 && market >= 70
          ? 'Return path is legible if traction trajectory continues; excited by commercial shape.'
          : evidence >= 45
          ? 'Willing to underwrite thesis but wants to see clearer pilot → paid milestones and path to $10M ARR.'
          : 'Skeptical: revenue evidence is thin and unit economics cannot yet be modelled.',
    },
    {
      persona_id: 'p-technical',
      persona_name: 'Technical Reviewer',
      verdict: product >= 55 ? 'lean-in' : 'neutral',
      rationale:
        product >= 55
          ? 'Infrastructure is pragmatic and MVP is real; integration depth is a real head start. Wants a written moat and scaling plan.'
          : 'MVP credible but technical differentiation not clearly documented. Asks for stack, data model, and failure modes.',
    },
    {
      persona_id: 'p-skeptical',
      persona_name: 'Skeptical Reviewer',
      verdict: evidence >= 50 ? 'neutral' : 'skeptical',
      rationale:
        evidence >= 50
          ? 'Most key claims have at least one artifact; wants quantified bottom-up TAM before dropping objections.'
          : 'Flags multiple claims as still founder-asserted; will cross-question every market and traction number aggressively.',
    },
  ];
}

function getDefaultRubric(programId: string): ProgramRubric {
  if (programId === TECHSTARS_PROFILE.id) {
    return {
      program_id: TECHSTARS_PROFILE.id,
      requirements: TECHSTARS_REQUIREMENTS,
      questions: TECHSTARS_QUESTIONS,
      signals: TECHSTARS_SIGNALS,
    };
  }
  return {
    program_id: programId,
    requirements: ensureArray<ProgramRequirement>(
      COMPARISON_PROGRAM_PROFILES.find((p) => p.id === programId)
        ? TECHSTARS_REQUIREMENTS.slice(0, 3)
        : [],
    ),
    questions: TECHSTARS_QUESTIONS.slice(0, 3),
    signals: TECHSTARS_SIGNALS.slice(0, 3).map((s) => ({ ...s, program_id: programId })),
  };
}

function getDefaultFit(
  programId: string,
  startupId: string,
  stage: StartupStage,
): StartupProgramFit {
  const dims = computeReadinessDimensions(stage);
  const program =
    COMPARISON_PROGRAM_PROFILES.find((p) => p.id === programId) ?? TECHSTARS_PROFILE;
  const overall = computeProgramReadiness(program, stage, dims);
  return {
    program_id: programId,
    startup_id: startupId,
    overall_readiness: overall,
    verdict:
      overall >= 80
        ? 'Strong program fit — apply after light polish'
        : overall >= 65
        ? 'Borderline — targeted improvement before submission'
        : 'Thesis mismatch or significant gaps — use the roadmap first',
    strengths: [
      `${program.name} values founder velocity — MVP build and 8-month git history read well.`,
      'Pilot + usage evidence exists: 4 pilots, 17 actives, 37% WoW growth.',
      'Pain narrative for African SMEs is concrete and cash-flow-critical.',
    ],
    gaps: [
      'Paying-revenue or pilot-to-paid milestones are not yet documented.',
      'Market sizing is still top-down; needs bottom-up SAM/SOM.',
      'Founder narrative lacks one quantified achievement + founder-market link.',
    ],
    risks: [
      'Skeptical reviewers will read zero-revenue as "unvalidated" unless explicitly framed as stage-appropriate.',
      'Solo-founder governance can be flagged as execution-risk at interview.',
      'Competitive / moat section is thin vs. what the program rubric expects.',
    ],
    dimension_scores: dims,
    generated_at: new Date().toISOString(),
  };
}

export const applicationIntelligenceApi = {
  getProgramProfile: async (
    programId: string = 'prog-techstars',
  ): Promise<ProgramIntelligenceProfile> => {
    const matched = COMPARISON_PROGRAM_PROFILES.find((p) => p.id === programId);
    return matched ?? TECHSTARS_PROFILE;
  },

  getProgramRubric: async (programId: string = 'prog-techstars'): Promise<ProgramRubric> => {
    return getDefaultRubric(programId);
  },

  getStartupFit: async (
    programId: string = 'prog-techstars',
    startupId: string = 'default-startup',
    stage: StartupStage = 'PRE_SEED',
  ): Promise<StartupProgramFit> => {
    return getDefaultFit(programId, startupId, stage);
  },

  getStageExpectations: async (): Promise<StageEvidenceExpectation[]> => {
    return STAGE_EVIDENCE_EXPECTATIONS;
  },

  getEvidenceGraph: async (): Promise<EvidenceGraphNode[]> => {
    return SEED_EVIDENCE_GRAPH;
  },

  getHiddenEvidence: async (): Promise<HiddenEvidenceFinding[]> => {
    return SEED_HIDDEN_FINDINGS;
  },

  getGapMap: async (): Promise<EvidenceGapRow[]> => {
    return SEED_GAP_MAP_ROWS;
  },

  getDefaultStrategy: async (): Promise<ApplicationStrategy> => {
    return { ...SEED_STRATEGY };
  },

  saveApplicationStrategy: async (
    _startupId: string,
    _programId: string,
    strategy: ApplicationStrategy,
  ): Promise<ApplicationStrategy> => {
    return new Promise((resolve) => setTimeout(() => resolve({ ...strategy }), 300));
  },

  getRedTeamFindings: async (): Promise<RedTeamFinding[]> => {
    return SEED_RED_TEAM;
  },

  getInterviewQuestions: async (
    programId: string = 'prog-techstars',
  ): Promise<InterviewQuestion[]> => {
    if (programId === TECHSTARS_PROFILE.id) return SEED_INTERVIEW_QUESTIONS;
    return SEED_INTERVIEW_QUESTIONS.slice(0, 4);
  },

  evaluateInterviewAnswer: async (
    question: InterviewQuestion,
    answer: string,
  ): Promise<AnswerEvaluation[]> => {
    return evaluateInterviewAnswer(question, answer);
  },

  getEvaluatorPersonas: async (): Promise<EvaluatorPersona[]> => {
    return SEED_EVALUATOR_PERSONAS;
  },

  getPersonaVerdicts: async (
    dims: ReadinessDimension[],
    overall: number,
  ): Promise<ProgramPersonaVerdict[]> => {
    return computePersonaVerdicts(dims, overall);
  },

  getProgramComparison: async (
    stage: StartupStage = 'PRE_SEED',
  ): Promise<ProgramReadinessComparison[]> => {
    const baselineDims = computeReadinessDimensions(stage);
    return COMPARISON_PROGRAMS_BASE.map((c) => {
      const score = computeProgramReadiness(c.profile, stage, baselineDims);
      const fallback = SEED_COMPARISON.find((s) => s.program_id === c.profile.id);
      return {
        program_id: c.profile.id,
        program_name: c.profile.name,
        overall_score:
          Math.abs(score - c.comparison.overall_score) <= 5 ? c.comparison.overall_score : score,
        key_strength: fallback?.key_strength ?? c.comparison.key_strength,
        key_gap: fallback?.key_gap ?? c.comparison.key_gap,
        verdict: fallback?.verdict ?? c.comparison.verdict,
      };
    });
  },

  getRoadmap: async (): Promise<FundingReadinessRoadmap> => {
    return { ...SEED_ROADMAP };
  },

  getCorrelations: async (): Promise<CorrelationNote[]> => {
    return SEED_CORRELATIONS;
  },

  getAllPrograms: async (): Promise<ProgramIntelligenceProfile[]> => {
    return [TECHSTARS_PROFILE, ...COMPARISON_PROGRAM_PROFILES.filter((p) => p.id !== TECHSTARS_PROFILE.id)];
  },
};
