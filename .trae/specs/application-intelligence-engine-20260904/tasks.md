# Pitchmic Application Intelligence Engine - Implementation Plan

## Task 1: TypeScript type definitions + typed client module for program intelligence
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Create `frontend/src/lib/applicationIntelligenceApi.ts` containing all new interfaces:
    - `ProgramIntelligenceProfile` (id, name, type, stage, investment, geography, industry, application)
    - `ProgramSelectionSignal` (criterion, source_type ∈ OFFICIAL|INFERRED|OBSERVED, weight 1-10, confidence, evidence_text)
    - `ProgramRequirement` (category, description, importance ∈ LOW|MEDIUM|HIGH|VERY_HIGH)
    - `ProgramApplicationQuestion` (id, label, rubric_dimension, importance)
    - `ProgramRubric` (requirements[], questions[], signals[])
    - `StartupProgramFit` (strengths[], gaps[], risks[], dimension_scores[], overall_readiness)
    - `ReadinessDimension` (key, name, score 0-100, assessment_label, stage_concern_note?)
    - `StageEvidenceExpectation` (stage ∈ IDEA|PRE_SEED|SEED|SERIES_A, evidence_items[])
    - `EvidenceGraphNode` (claim_id, claim_statement, declared_value, evidence_items[], confidence, time_period?, customer_count?)
    - `LinkedEvidenceItem` (id, source_type, title, verification_status, confidence, doc_ref?)
    - `HiddenEvidenceFinding` (id, description, category, confidence, suggested_usage)
    - `EvidenceGapRow` (program_requirement, what_they_want, what_you_claim, what_you_can_prove, what_is_missing, recommendation)
    - `ApplicationStrategy` (problem, founder_advantage, why_now, proof, program_fit, primary_weakness, mitigation)
    - `RedTeamFinding` (rejection_reason, fix_priority ∈ 1|2|3|4, fix_description, estimated_impact)
    - `InterviewQuestion` (id, program_id, question, category)
    - `AnswerEvaluation` (dimension, score 0-100, feedback)
    - `EvaluatorPersona` (name, type ∈ PROGRAM_DIRECTOR|INVESTOR|TECHNICAL|SKEPTICAL, focus_areas[])
    - `ProgramReadinessComparison` (program_id, program_name, overall_score 0-100, key_strength, key_gap)
    - `ReadinessAction` (action, impact_points, priority, rationale)
    - `FundingReadinessRoadmap` (baseline_readiness, recommended_actions[], projected_readiness, should_submit: boolean)
    - `CorrelationNote` (text, layer ∈ FACTS|SIGNALS|OUTCOMES, caveat)
  - Export a typed `applicationIntelligenceApi` object mirroring the existing patterns in `startupIntelligenceApi.ts` with `getProgramProfile(id)`, `getProgramComparison(startupId)`, and seed fallback helpers.
  - Add `ensureArray`, `formatDate` usage patterns matching `company/page.tsx` for defensive rendering.
- **Acceptance Criteria Addressed**: AC-12
- **Test Requirements**:
  - `rule` TR-1.1: `cd frontend && npx tsc --noEmit` exits 0 with no new `any` types introduced. Evidence: TypeScript compiler stdout.
  - `rule` TR-1.2: grep for `: any` in the new `applicationIntelligenceApi.ts` file yields 0 matches. Evidence: grep output.
  - `rubric` TR-1.3: Type coverage completeness — scale 1-5; 1 = missing ≥4 key interfaces; 3 = main ones present but some optional-only; 5 = every interface listed above exported with correct field types. Threshold ≥ 4. Evidence: file inspection.
- **Notes**: Keep all seed data inside the module so components import it cleanly without duplicate type declarations spread across the page.

---

## Task 2: Dashboard route scaffold + page shell + 3-layer taxonomy banner
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - Create `frontend/src/app/(dashboard)/application-intelligence/page.tsx` as a `'use client'` page.
  - Reuse the `DashboardShell` via the existing `(dashboard)/layout.tsx` (already in place).
  - Copy the top hero banner style from `fundability/page.tsx` (rounded-3xl, gradient, Sparkles badge) and adapt copy to "Pitchmic Application Intelligence Engine".
  - Add a program selector dropdown in the hero using existing `select` styling patterns from `intelligence/page.tsx`.
  - Implement a sticky "Three Layers Distinction" banner component (FACTS / SIGNALS / OUTCOMES definitions) using an inline 3-column grid within a `Card`.
  - Ensure responsive grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` consistently across sections.
  - Use existing `Card`, `Button`, `Badge`, `Separator`, `Input`, `Label` components only — no custom styled divs when primitives exist.
- **Acceptance Criteria Addressed**: AC-11, AC-13
- **Test Requirements**:
  - `rule` TR-2.1: Route `/application-intelligence` renders without runtime errors in the browser. Evidence: dev server console clear of errors, page loads with hero text visible.
  - `rule` TR-2.2: FACTS/SIGNALS/OUTCOMES 3-column banner is present and each column has ≥1 sentence description. Evidence: rendered DOM.
  - `rubric` TR-2.3: Visual alignment with existing fundability hero style — scale 1-5; 1 = totally custom; 3 = mostly similar colors/sizes; 5 = pixel-faithful match to existing rounded-3xl gradient hero. Threshold ≥ 4. Evidence: side-by-side screenshot comparison.
- **Notes**: Keep tab-bar logic in the page shell to add sections incrementally; aim for a single `activeSection` state keyed by string.

---

## Task 3: Program Intelligence Profile + Rubric sections (AC-1)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - Build `<ProgramIntelligenceCard>` showing header fields: program type, stage, investment, geography, industry, application format.
  - Build the `<SelectionSignalsList>` rendering each criterion as a horizontal weight bar (1–10) with `source_type` pill badges using existing badge variants + labels "OFFICIAL", "INFERRED", "OBSERVED" and confidence pill (HIGH / MEDIUM / LOW). Ensure all 3 source types appear in the seeded data for Techstars.
  - Build a `<ProgramRubricTabs>` component with three sub-tabs: Requirements, Questions, Selection Signals (detail). Use existing tab styling from `fundability/page.tsx` inline tab patterns.
  - Requirements tab: list rows with importance HIGH/MEDIUM/LOW using Badge variants.
  - Questions tab: list each question with rubric_dimension label and importance.
  - Seed the default program as a Techstars-style profile (team 10/10, market 8/10, traction 7/10, idea 5/10 with the correct source types).
- **Acceptance Criteria Addressed**: AC-1, AC-13
- **Test Requirements**:
  - `rule` TR-3.1: Selection signals section displays ≥ 1 OFFICIAL, ≥ 1 INFERRED, ≥ 1 OBSERVED badges. Evidence: DOM snapshot / screenshot.
  - `rule` TR-3.2: Each criterion row includes the confidence label (HIGH/MEDIUM/LOW) somewhere in visual proximity to its numeric weight. Evidence: visual inspection.
  - `rubric` TR-3.3: Readability / scannability of signal bars — scale 1-5; 1 = bars too small or labels clipping; 3 = readable but not crisp; 5 = bars properly scaled with consistent spacing and clear color distinction per source. Threshold ≥ 4. Evidence: UX walkthrough notes.
- **Notes**: Reuse `<ScoreDimension>` component pattern already in `discover/page.tsx` for bar visualization — this ensures consistency.

---

## Task 4: Startup Profile synthesis + Stage-conditioned Selection Readiness Score (AC-2, AC-9 baseline)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 3
- **Description**:
  - Add a `<StartupProfileSummaryCard>` that reads from the existing `startupIntelligenceApi.getSnapshot` data (stage, revenue, customers, team size, geography, sector, product maturity, funding sought). Link back to `/company` with an "Edit profile" Button.
  - Add a stage toggle (Idea / Pre-seed / Seed / Series A) using the same select styling patterns from `fundability/page.tsx`.
  - Build `<SelectionReadinessCard>`:
    - Large hero score (0–100) using the SVG circular dial from `fundability/page.tsx`.
    - 8-dimension breakdown table: Founder/team, Market, Problem, Product, Traction, Evidence, Competitive Advantage, Application Quality.
    - For Traction row, implement **stage-conditioned logic**: if stage ∈ {IDEA, PRE_SEED} and revenue === 0, the row must still show an `expected evidence` note listing founder insight/prototypes/pilot interest/customer discovery and NOT mark Weak solely due to zero revenue.
  - Implement the dimension-score computation in the typed `applicationIntelligenceApi.ts` module (Task 1) so it's reusable and testable.
- **Acceptance Criteria Addressed**: AC-2, AC-9 (baseline data), AC-13
- **Test Requirements**:
  - `rule` TR-4.1: Toggling stage selector to "Idea" when revenue=0 still renders Traction with either score ≥ 50 OR the explicit evidence-expectations note is present alongside. Evidence: browser-state toggle screenshot.
  - `rule` TR-4.2: All 8 readiness dimensions render with non-empty names and scores 0–100. Evidence: rendered table.
  - `rubric` TR-4.3: Score hero design fidelity — scale 1-5; 1 = plain number; 3 = decent dial but colors off; 5 = identical SVG dial pattern to fundability page with correct color gradient (brand-orange through emerald). Threshold ≥ 4. Evidence: visual comparison.
- **Notes**: The dimension-assessment mapping table (Strong ≥ 75, Moderate 55–74, Weak < 55) should be defined as a typed function in the API module so every section reuses the same thresholds.

---

## Task 5: Program Fit Analysis + Evidence Graph + Hidden Evidence (AC-3, AC-4)
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 4
- **Description**:
  - Build a 3-column `<FitAnalysisGrid>`: Strengths / Gaps / Risks. Each column uses cards with colored badges (emerald/amber/rose) matching existing palette. Populate with program-referenced bullets drawn from the seeded rubric and evidence state.
  - Build `<EvidenceGraphCard>`:
    - Per-traction-claim layout mirroring the 3-way values pattern (Declared / Verified / Observed) already present in `company/page.tsx` claims tab.
    - For each claim, list ≥2 evidence items with source_type badges and confidence pills.
    - Seed data must include at least one claim with 2+ evidence children (e.g., "4 pilot merchants" with Pilot agreement #1, Pilot agreement #2, usage analytics export).
  - Build `<HiddenEvidenceCard>`:
    - Header with "Evidence found:" label and checklist of ≥3 items (e.g., 17 active users, 4 pilot companies, 2 LOIs, 37% weekly usage growth, processed volume, 8-month dev history, enterprise conversations) with ✓ checkmarks.
    - Banner text must contain "underselling" (case-insensitive).
    - Each evidence item has a 1-sentence "Use this in:" recommendation (traction answer, founder narrative, etc.).
- **Acceptance Criteria Addressed**: AC-3, AC-4, AC-13
- **Test Requirements**:
  - `rule` TR-5.1: Evidence graph shows at least 1 claim with ≥ 2 evidence items. Evidence: DOM snapshot.
  - `rule` TR-5.2: Hidden evidence banner text contains "underselling" substring and list count ≥ 3 items. Evidence: grep of rendered text.
  - `rubric` TR-5.3: 3-column Fit analysis visual balance — scale 1-5; 1 = one column much wider or content spilling; 3 = usable but alignment wobbly; 5 = equal-width columns, consistent card styling, correct responsive collapse. Threshold ≥ 4. Evidence: responsive screenshots at lg/md/sm widths.
- **Notes**: Reuse the Badge variants already defined for evidence states (verified_empirical / founder_claimed / seed_proxy).

---

## Task 6: Evidence Gap Map + Application Strategy builder (AC-5, AC-6)
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 5
- **Description**:
  - Build `<EvidenceGapMap>` component: per-program-requirement row with 4 sequential stages: WHAT THEY WANT → WHAT YOU CLAIM → WHAT YOU CAN PROVE → WHAT IS MISSING. Each stage uses an icon (Target, MessageSquareText, CheckCircle2, AlertTriangle) and a color-tinted background from existing palette. At least 2 rows: TEAM and TRACTION.
  - Each row's MISSING stage must contain a "Recommendation:" line (e.g., "Strengthen founder narrative", "Add pilot retention evidence").
  - Build `<ApplicationStrategyCard>` with 7 editable subsections: Problem, Founder Advantage, Why Now, Proof, Program Fit, Primary Weakness, Mitigation.
  - Provide sensible pre-filled starter text for a Nigeria-based fintech MVP example. Implement via controlled form inputs with per-section `textarea`; local state retains edits on tab-switch (single React state keyed by section id). Add a "Save strategy" button that logs / (stub) persists via the typed API client.
- **Acceptance Criteria Addressed**: AC-5, AC-6, AC-13, AC-14 (foundations for narrative flow)
- **Test Requirements**:
  - `rule` TR-6.1: ≥ 2 gap rows render with all 4 stage cells populated (non-empty). Each MISSING cell contains the substring "Recommendation:". Evidence: rendered DOM.
  - `rule` TR-6.2: All 7 strategy section headings render; typing into the "Mitigation" textarea and switching to a different section then back preserves entered value (no reset). Evidence: manual interaction + state dump.
  - `rubric` TR-6.3: Gap map clarity / narrative flow — scale 1-5; 1 = 4 stages unlabeled or visually indistinct; 3 = distinct but icons missing; 5 = each stage visually distinct, icons present, arrows or left-to-right ordering obvious. Threshold ≥ 4. Evidence: UX walkthrough.
- **Notes**: Use `ChevronRight` from lucide-react as an arrow separator between the 4 stages to make the pipeline visual explicit.

---

## Task 7: Application Red Team + Interview Simulation (AC-7, AC-8) + Evaluator Personas (AC-14)
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 6
- **Description**:
  - Build `<RedTeamAssessmentCard>`:
    - Section 1: "Why might we reject this startup?" ≥ 4 bullet items seeded from known weaknesses (traction insufficiently demonstrated, founder story missing unfair advantage, TAM asserted without evidence, differentiation unclear, demand not proven).
    - Section 2: "How to fix" with Priority 1 / 2 / 3 / 4 bands using Badge labels. Each fix has an "Estimated impact" indicator (e.g., ++ readability,  + evidence points).
  - Build `<InterviewSimulationCard>`:
    - Left side: program-specific interview questions list (at least 3: founder motivation, customer demand, competition/capital), with active highlight on the selected question.
    - Right side: Textarea for founder answer + "Evaluate answer" Button.
    - On evaluate, render 6 dimension scores (Founder-market fit, Specificity, Evidence, Conviction, Memorability, Program alignment) 0–100 each.
    - If Evidence < 60, show a warning banner: "Your answer is persuasive but contains no concrete evidence supporting your claim."
    - Seed low-evidence and high-evidence example evaluators in the typed module.
  - Build `<EvaluatorPersonasPanel>`: 4 personas (Program Director / Investor / Technical reviewer / Skeptical reviewer), each with focus-areas description; show an aggregated verdict row after evaluation.
- **Acceptance Criteria Addressed**: AC-7, AC-8, AC-13, AC-14
- **Test Requirements**:
  - `rule` TR-7.1: Red Team rejection bullets ≥ 4 and fix list includes all 4 priority bands (1–4) with distinct labels. Evidence: rendered DOM.
  - `rule` TR-7.2: Clicking "Evaluate answer" renders all 6 answer dimension scores in 0–100 range. For the default empty/low-evidence answer, the missing-evidence warning substring "contains no concrete evidence" appears. Evidence: interaction log / screenshot.
  - `rubric` TR-7.3: Question → answer → scores layout coherence — scale 1-5; 1 = cluttered or unlabeled; 3 = functional but layout jumps; 5 = left question list + right answer/evaluation is a natural, readable flow. Threshold ≥ 4. Evidence: layout review.
- **Notes**: Evaluation scores live in client module pure function `evaluateInterviewAnswer(question, answer, seed)` → `AnswerEvaluation[]` — pure, deterministic, test-friendly, and easy to swap for real LLM call later.

---

## Task 8: Program Readiness comparison + Funding Readiness Roadmap + 3-layer Outcome correlations (AC-9, AC-10, AC-11)
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 7
- **Description**:
  - Build `<MultiProgramComparisonCard>`: 5-program bar list — Techstars, Y Combinator, MassChallenge, African-Focused Accelerator, Deep-Tech Accelerator. For a Nigeria-based fintech MVP with 3 pilots/1 founder: scores must differ meaningfully (African-focused highest ~91, Deep-tech lowest ~38, others in between). Show Key Strength / Key Gap per program.
  - Build `<FundingReadinessRoadmapCard>`:
    - If baseline < 70, render banner "Don't submit yet." with alert style.
    - List ≥ 4 ranked high-impact actions with "+N points" estimated impact (e.g., "Obtain 3 additional customer validation interviews" → +7; "Secure 1 pilot agreement" → +8; etc.).
    - Projected readiness = baseline + sum(impact) arithmetic must check out within ± 3 points.
    - If baseline ≥ 70, show "Positioned to submit" banner with caution notes.
  - Build `<OutcomeCorrelationsCard>`: 2–3 correlation bullets phrased as "Among the applications in our dataset, [characteristic] is associated with higher interview rates." — never "requires".
  - Reconcile AC-11: ensure the page-wide 3-layer banner (Task 2) still renders and connects to outcome cards.
- **Acceptance Criteria Addressed**: AC-9, AC-10, AC-11, AC-14
- **Test Requirements**:
  - `rule` TR-8.1: 5 programs rendered with distinct scores. African-focused accelerator score STRICTLY GREATER THAN MassChallenge OR Techstars; Deep-tech accelerator score LESS THAN OR EQUAL TO every other program score. Evidence: numeric comparison of rendered values.
  - `rule` TR-8.2: Baseline readiness < 70 → "Don't submit yet" banner present; actions list count ≥ 4 with "+N" indicators; `projected_readiness === baseline + sum(impact_points)` within ± 3. Evidence: arithmetic check of rendered numbers.
  - `rule` TR-8.3: At least one Outcome correlation sentence contains "associated with" phrase and never "requires" in any outcome-layer text. Evidence: grep of rendered strings.
  - `rubric` TR-8.4: Roadmap action-prioritization persuasiveness — scale 1-5; 1 = random ordering; 3 = sensible but no clear rationale; 5 = actions ordered by impact descending and each includes concise rationale. Threshold ≥ 4. Evidence: qualitative review.
- **Notes**: Comparison scores are determined purely via a deterministic pure function in the typed client module (`computeProgramReadiness(program_profile, startup_profile, stage)` → number) to make the contract explicit and auditable for the "evaluator, not startup, changes the score" story.

---

## Task 9: Wire it all together in the page, build integration, type check
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Tasks 1–8
- **Description**:
  - In `application-intelligence/page.tsx`, assemble all components in the user-specified order:
    1. Hero banner + program selector
    2. Three-layer taxonomy banner (FACTS/SIGNALS/OUTCOMES)
    3. Program Intelligence Profile + Rubric Tabs (Task 3)
    4. Startup Profile Summary (Task 4)
    5. Selection Readiness Score (Task 4)
    6. Program Fit Analysis (Task 5)
    7. Evidence Graph (Task 5)
    8. Hidden Evidence (Task 5)
    9. Evidence Gap Map (Task 6)
    10. Application Strategy (Task 6)
    11. Multi-Program Comparison (Task 8)
    12. Red Team (Task 7)
    13. Interview Simulation + Personas (Task 7)
    14. Funding Readiness Roadmap (Task 8)
    15. Outcome Correlations (Task 8)
  - Use `AnimatePresence` + `framer-motion` from `company/page.tsx` for subtle fade between sections if tabbing or expanding sections; otherwise keep defaults.
  - Ensure `ensureArray` guards wrap any optional-typed lists before calling `.map()`.
  - Ensure all date fields (created_at / assessed_at / etc.) pass through `formatDate` from `@/lib/utils`.
  - Run `cd frontend && npx tsc --noEmit` and fix any type errors.
  - Run `cd frontend && npm run build` or at minimum dev-server smoke check via `npm run dev` to catch runtime issues.
  - Add navigation entry in sidebar (`frontend/src/components/layout/Sidebar.tsx`) if needed, linking to `/application-intelligence`.
- **Acceptance Criteria Addressed**: AC-12, AC-13, AC-14
- **Test Requirements**:
  - `rule` TR-9.1: `cd frontend && npx tsc --noEmit` exits 0. Evidence: stdout captured.
  - `rule` TR-9.2: `cd frontend && npx next lint` reports 0 new ESLint errors/warnings introduced by new files (existing baseline OK). Evidence: ESLint output.
  - `rule` TR-9.3: Opening `/application-intelligence` loads without runtime errors (React error boundaries not triggered, console clear of red errors). Evidence: browser console.
  - `rubric` TR-9.4: Overall dashboard narrative flow — scale 1-5; 1 = jumbled order, sections appear random; 3 = ok order but transitions confusing; 5 = the story flows exactly as specified: Program → Startup → Fit Score → Evidence → Gaps → Strategy → Multi-Program → Red Team → Interview → Roadmap. Threshold ≥ 4. Evidence: annotated section order diagram / screen recording.
- **Notes**: This is the single integration task. Each component is built independently in prior tasks so this task should be straightforward composition + safety guards.

---

## Task 10: Final verification, diagnostics pass, independent review prep
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 9
- **Description**:
  - Run `GetDiagnostics` on the workspace to surface any TypeScript/lint issues.
  - Run `cd frontend && npx tsc --noEmit` and capture output.
  - Run `cd frontend && npx eslint src/app/(dashboard)/application-intelligence --max-warnings=0` if available; otherwise the broader `next lint`.
  - Ensure all 14 Acceptance Criteria are mapped to passing Task-level Test Requirements and mark coverage.
  - Prepare a build-evidence artifact (console logs, screenshots description, commands run) for inclusion in the Review gate evidence.
  - Sanity-check that nowhere in any new or modified component does "chance of acceptance" or "87.3%" acceptance rate phrasing appear. Confirm outcome language is always cautious per AC-11.
- **Acceptance Criteria Addressed**: AC-11, AC-12
- **Test Requirements**:
  - `rule` TR-10.1: GetDiagnostics reports 0 new errors in modified files. Evidence: GetDiagnostics output JSON.
  - `rule` TR-10.2: grep across new file set for strings matching regex pattern `\d+\.?\d*% chance|% acceptance|accepted|probability.*accept` returns 0 matches, OR any such match is explicitly in a disclaimer/not-recommended context. Evidence: grep output.
  - `rubric` TR-10.3: Coverage completeness — each of the 14 ACs is linked to ≥ 1 TR with passing status. Scale 1-5; 1 = <8 ACs covered; 3 = 10-12 covered; 5 = 14/14 covered with clear TR mapping. Threshold ≥ 4. Evidence: coverage matrix in review.md prep notes.
- **Notes**: This task is the prerequisite hand-off to the Review phase. Blocked by any failing type/lint rules from Task 9.
