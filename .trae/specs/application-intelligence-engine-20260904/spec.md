# Pitchmic Application Intelligence Engine - Product Requirements Document

## Overview
- **Summary**: Transform the startup dashboard from a general fundability analyzer into a Program-specific Application Intelligence Engine that understands each accelerator/funder's evaluation model, compares it against the startup's evidence profile, and delivers actionable readiness diagnostics, gap analysis, and application strategy.
- **Purpose**: Move beyond generic "fundability scoring" to program-specific intelligence. Pitchmic identifies what each program looks for, measures how convincingly the startup demonstrates those qualities, surfaces evidence gaps, and helps produce an application that accurately presents the strongest case—without promising acceptance.
- **Target Users**: Founders/startup operators preparing accelerator, grant, or VC applications; especially pre-seed through Series A founders evaluating multiple funding programs simultaneously.

## Goals
- Deliver a **Program Intelligence Profile** per funding program (explicit requirements, questions, selection signals with source/confidence taxonomy).
- Compute a **Selection Readiness Score** per program, stage-conditioned so pre-revenue startups are not incorrectly penalized.
- Surface a three-layer evidence model (FACTS / SIGNALS / OUTCOMES) without mixing them.
- Build an **Evidence Graph** linking every startup claim to concrete supporting evidence with confidence levels.
- Identify **hidden evidence** already in the startup's materials (pilots, LOIs, usage growth) and flag underselling.
- Produce an **Evidence Gap Map** per program requirement: what they want → what you claim → what you can prove → what is missing.
- Generate an **Application Strategy** (core narrative, founder advantage, why-now, proof, weaknesses, mitigations) before answer generation.
- Provide an **Application Red Team** simulation identifying rejection vectors and ranked fixes.
- Build an **Interview Simulation** with program-specific public questions and multi-dimensional answer evaluation.
- Show **multi-program readiness comparison** so the same startup sees different scores for Techstars vs YC vs African-focused vs deep-tech accelerators.
- Deliver a **Funding Readiness Roadmap** recommending the highest-impact concrete actions to take *before* applying.

## Non-Goals
- Do not build the backend scraper/crawler in this change; focus on the frontend dashboard UI/UX and client-side data model that can consume such data when ready.
- Do not claim or display fake "percent chance of acceptance" numbers. No fabricated probabilistic certainties.
- Do not perform full LLM answer generation in this iteration; prepare the strategy and evidence-backed answer scaffolding.
- Do not modify backend API endpoints or Django models. Use mock/seed client-side data shaped to match what the existing intelligence and startup profile APIs already return plus new typed extensions.
- Do not rebuild the existing company, fundability, or discover pages from scratch; extend and compose them with the new intelligence layer.

## Background & Context
The current Pitchmic product has strong foundations:
- `company/page.tsx` implements a Canonical Venture Profile with Claims & Evidence provenance, 8-Dimension Maturity Matrix, Contextual Assessments, Financial Snapshots, and Campaign state.
- `fundability/page.tsx` implements a pitch-deck forensic audit with 8-pillar scorecard, unit economics, contradictions, and IC debate.
- `discover/page.tsx` implements multi-dimensional program/investor matching (industry, stage, ticket, location, semantic).

The user's product vision (pitch flow described) shows how these pieces compose into something significantly more powerful and program-aware. This spec turns that vision into a concrete, componentized dashboard update on the startup side, exposing the new intelligence layer while reusing every verified and production-grade component already in place.

## Functional Requirements

- **FR-1**: Program Intelligence Profile card. Displays per-program: type, stage, investment, geography, industry, application format. Selection signals as criterion bars (1–10 scale) with explicit source_type badges: OFFICIAL, INFERRED, OBSERVED, each with a confidence level (HIGH/MEDIUM/LOW).
- **FR-2**: Program Rubric breakdown: three tabs for Requirements, Application Questions (with per-question importance: HIGH/MEDIUM/LOW), and Selection Signal detail rows.
- **FR-3**: Startup Profile synthesis panel auto-populated from the canonical company profile (stage, revenue, customers, team, geography, sector, product, funding sought) and links back to the Company page for editing.
- **FR-4**: Program Fit Analysis: Strengths, Gaps, Risks columns with specific, program-referenced bullets drawn from the rubric + startup evidence.
- **FR-5**: Selection Readiness Score (0–100) for the selected program. Breakdown table with at least 8 selection dimensions: Founder/Team, Market, Problem, Product, Traction, Evidence, Competitive Advantage, Application Quality. Each gets a score (0–100) and an assessment (Strong / Moderate / Weak).
- **FR-6**: Stage-conditioned evidence model. A startup stage selector (Idea / Pre-seed / Seed / Series A) drives expected-evidence expectations visible in a table. Traction with $0 revenue for Idea/Pre-seed is not labeled Weak; instead expected evidence is founder insight, prototypes, interviews, pilot interest.
- **FR-7**: Evidence Graph. For each traction claim (e.g., "$50K ARR"), show the claim, its linked evidence items (financial statement, Stripe/Paystack data, bank statement), time period, customer count, and confidence badge.
- **FR-8**: Hidden Evidence scanner. A card listing evidence discovered from uploaded/saved artifacts—active users, pilot companies, LOIs, usage growth, transaction volume, product development history, enterprise conversations—plus an "underselling traction" warning with suggestions for where to use each piece of evidence.
- **FR-9**: Evidence Gap Map. Per program requirement, a 4-row visual: WHAT THEY WANT → WHAT YOU CLAIM → WHAT YOU CAN PROVE → WHAT IS MISSING. Example for TEAM: signal detail, found evidence, missing items (quantified achievement, founder-market connection), recommendation.
- **FR-10**: Application Strategy builder. A structured card with CORE NARRATIVE sections (Problem, Founder Advantage, Why Now, Proof, Program Fit, Primary Weakness, Mitigation) that the founder can edit and save.
- **FR-11**: Program-specific scores comparison. Show the SAME startup scored against multiple programs (Techstars, YC, MassChallenge, African-focused accelerator, Deep-tech accelerator) with different bar results to emphasize that the evaluator, not the startup, changes the score.
- **FR-12**: Application Red Team. "Why might we reject this startup?" bullet list. Then a "How to fix" priority-ranked list (Priority 1–4) with estimated impact indicators.
- **FR-13**: Interview Simulation. Program-specific interview questions pulled from the Program Intelligence Profile. Founder types an answer; the system evaluates 6 dimensions: Founder-market fit, Specificity, Evidence, Conviction, Memorability, Program alignment (0–100 each) and flags missing evidence.
- **FR-14**: Evaluator Persona simulation (Program Director, Investor, Technical reviewer, Skeptical reviewer) with per-persona focus description and aggregated result view.
- **FR-15**: Funding Readiness Roadmap. If readiness < 70, show "Don't submit yet" banner. List the top 4 highest-impact pre-submission actions with estimated potential score impact (+X each) and projected post-improvement readiness.
- **FR-16**: Three-layer distinction banner. FACTS (official) / SIGNALS (Pitchmic-inferred) / OUTCOMES (Pitchmic observed, from its own dataset) — never mixed, always clearly labeled. Correlations phrased as "Among applications in our dataset, this characteristic is associated with higher interview rates" not "Program X requires this."
- **FR-17**: Integrate with existing UI. New sections must use the existing Card/Button/Badge/Separator/Input/Label/Textarea primitives from `@/components/ui/*`; follow the brand-orange + slate color system; use `ensureArray` for list handling; use `formatDate` for all date rendering.

## Non-Functional Requirements
- **NFR-1 (Type safety)**: All new dashboard state and program/evidence types are defined as TypeScript interfaces in `frontend/src/lib/types.ts` or a new dedicated `frontend/src/lib/applicationIntelligenceApi.ts` client file; no `any` in new code paths.
- **NFR-2 (Consistency)**: Every new card, badge, and progress bar matches the visual style and responsive behavior (grid-cols-1 → sm:2 → lg:3) already used in `fundability/page.tsx` and `company/page.tsx`.
- **NFR-3 (Performance)**: Client-side rendering only. No SSR blocking data fetches. Mock seed data is statically typed and imported directly without runtime parsing costs.
- **NFR-4 (Accessibility)**: All tab selectors, accordions, and progress bars are keyboard-navigable; progress bars carry `role="progressbar"` with `aria-valuenow/min/max`; color alone is never the only status indicator (icons/text badges paired).
- **NFR-5 (Defensive coding)**: `ensureArray` + optional chaining for every API-shaped list; `formatDate` for all dates; friendly fallback UI for missing/empty data per existing pattern in fundability page.

## Constraints
- **Technical**: Frontend-only implementation within Next.js 14 App Router (`'use client'` components). No database schema changes, no new Django endpoints. All seed data is statically typed and lives in the frontend client module.
- **Business**: No acceptance-rate claims. Any correlation language must follow the cautious "associated with higher interview rates" phrasing specified in FR-16.
- **Dependencies**: Reuse `lucide-react`, `framer-motion`, `@tanstack/react-query` already in package.json. No new third-party UI libraries.
- **Design language**: Strictly reuse existing primitives (`Card`, `Button`, `Badge`, `Input`, `Label`, `Textarea`, `Separator`) and the Tailwind color tokens already in `tailwind.config.ts`.

## Assumptions
- Backend program intelligence, outcome tracking, and LLM answer generation capabilities will be added later and plug into the typed client without UI rewrites; today's mock-shape contract matches the anticipated API shape.
- At least one sample accelerator (Techstars-style profile) is used as the default demo program so sections have populated content to render.
- Existing canonical startup profile data (claims, maturity, financials from `startupIntelligenceApi`) is assumed to exist or fall back gracefully per the patterns already in place.

## Acceptance Criteria

### AC-1: Program Intelligence Profile renders with 3-layer source taxonomy
- **Type**: `rule`
- **Given**: The Application Intelligence dashboard loads a default program profile
- **When**: The Program Intelligence section is visible
- **Then**: Every selection-signal criterion row displays its numeric weight (1–10), a visual bar, and a `source_type` badge distinguishing OFFICIAL / INFERRED / OBSERVED with explicit confidence label
- **Pass Condition**: All three source types are represented in at least one criterion; badges are distinct; confidence text is present on every signal
- **Evidence**: Visual inspection + DOM snapshot showing at least one of each source_type badge on rendered signals

### AC-2: Selection Readiness Score breaks into 8 dimensions with stage-conditioned Traction scoring
- **Type**: `rule`
- **Given**: Startup stage is set to Idea or Pre-seed and declared revenue is $0
- **When**: Selection Readiness breakdown is rendered
- **Then**: The Traction dimension does not show "Weak" solely due to $0 revenue; expected evidence rows list founder insight / prototypes / pilot interest / customer discovery as Idea-stage evidence expectations
- **Pass Condition**: When stage = Idea and revenue = $0, Traction row either (a) is marked Moderate or better, OR (b) has an explanatory note "Idea-stage expected evidence: prototypes, interviews..." visible alongside its score
- **Evidence**: Rendered DOM + toggle interaction showing stage change affecting the evidence-expectation rows visible on screen

### AC-3: Evidence Graph links claims to evidence items with confidence
- **Type**: `rule`
- **Given**: Startup has at least one traction claim (e.g., "$50K ARR" or "4 pilot merchants")
- **When**: Evidence Graph section is shown
- **Then**: Each claim card displays 3-way values matrix (Declared / Verified / Observed) already patterned in `company/page.tsx`, a list of 1+ supporting evidence items with type badges, and a confidence score/percentage
- **Pass Condition**: At least one claim is rendered with >= 2 evidence items, each with a source_type label and a confidence badge
- **Evidence**: Screenshot or DOM extract showing >= 2 evidence children under one claim card

### AC-4: Hidden Evidence scanner flags undersold evidence
- **Type**: `rule`
- **Given**: Seed evidence includes active users, pilot companies, LOIs, usage growth, and/or processed volume
- **When**: Hidden Evidence card is shown
- **Then**: List contains >= 3 discovered evidence items with checkmark indicators, and a "You are underselling your traction" banner + one recommendation sentence per discovered item
- **Pass Condition**: Hidden evidence list count >= 3 AND banner text contains "underselling" (case-insensitive)
- **Evidence**: Rendered card with list items and banner

### AC-5: Evidence Gap Map shows 4-column WHAT THEY WANT / CLAIM / PROVE / MISSING flow
- **Type**: `rule`
- **Given**: At least one TEAM requirement and one TRACTION requirement from program rubric
- **When**: Evidence Gap Map tab is active
- **Then**: Each program requirement row visually lays out 4 sequential stages with distinct icons/badges; MISSING stage includes a Recommendation call-out
- **Pass Condition**: >= 2 program requirements render with all 4 cells populated (non-empty text) and each MISSING cell contains a "Recommendation:" line
- **Evidence**: Rendered DOM snapshot of >= 2 rows with 4 stages each

### AC-6: Application Strategy card contains 7 narrative subsections
- **Type**: `rule`
- **Given**: Dashboard renders the Application Strategy section
- **When**: Strategy card is visible
- **Then**: 7 sections are present: Problem, Founder Advantage, Why Now, Proof, Program Fit, Primary Weakness, Mitigation; each has editable content area or pre-filled starter text; save button commits to local state
- **Pass Condition**: All 7 section headings are rendered in the card; typing into one textarea persists on tab switch (local state retained)
- **Evidence**: Manual interaction test with state dump

### AC-7: Red Team rejection reasons + 4-tier priority fixes
- **Type**: `rule`
- **Given**: Startup profile has at least one known weakness (limited traction / missing founder-market evidence / generic TAM claim / weak differentiation)
- **When**: Red Team section is expanded
- **Then**: >= 4 "Why might we reject?" bullets render, followed by a priority-ranked fix list (Priority 1 / 2 / 3 / 4) each with distinct label
- **Pass Condition**: Rejection reasons count >= 4 AND fix list has 4 distinct priority bands visible
- **Evidence**: Rendered bullets + priority list

### AC-8: Interview Simulation evaluates 6 answer dimensions
- **Type**: `rule`
- **Given**: User selects "Why are you the right person to build this?" as the active question
- **When**: Founder enters an answer and clicks "Evaluate answer"
- **Then**: 6 scores appear — Founder-market fit, Specificity, Evidence, Conviction, Memorability, Program alignment — each 0–100, and a feedback line calls out missing evidence if Evidence score < 60
- **Pass Condition**: All 6 dimension scores render in 0–100 range and, for a synthetic low-evidence answer, the missing-evidence warning appears
- **Evidence**: Interaction + screenshot of scores and warning text

### AC-9: Same startup shows different program-specific readiness scores
- **Type**: `rule`
- **Given**: Multi-program comparison section is visible
- **When**: At least 5 programs are listed (Techstars, YC, MassChallenge, African-focused accelerator, Deep-tech accelerator)
- **Then**: Scores differ across programs; African-focused accelerator yields the highest score for a Nigeria-based fintech startup while Deep-tech accelerator yields the lowest — demonstrating the evaluator drives the score
- **Pass Condition**: The 5 displayed scores are not all equal; African-focused score > Techstars OR > MassChallenge; Deep-tech score is <= all of the other 4
- **Evidence**: Rendered bar chart or score list showing variance across 5 programs

### AC-10: Funding Readiness Roadmap suggests pre-submission actions
- **Type**: `rule`
- **Given**: Overall readiness < 70 and Roadmap section renders
- **When**: User views the Roadmap
- **Then**: A "Don't submit yet" banner is visible, followed by >= 4 ranked high-impact actions, each with an estimated potential score impact (+X points) and a projected post-improvement readiness that equals baseline + sum of estimated impacts within ±3 points
- **Pass Condition**: Banner contains "Don't submit"; actions list >= 4 entries with "+N" indicators; projected readiness arithmetic is consistent
- **Evidence**: Rendered banner + list + arithmetic check

### AC-11: FACTS / SIGNALS / OUTCOMES are labeled distinctly and never mixed
- **Type**: `rule`
- **Given**: Any dashboard section that shows program information or outcome correlations
- **When**: A correlation statement appears in OUTCOMES layer
- **Then**: It uses phrasing "Among the applications in our dataset, this characteristic is associated with higher interview rates" (or equivalent cautious language) and never "Program X requires this"; three-layer banner clearly labels FACTS/SIGNALS/OUTCOMES definitions on the page
- **Pass Condition**: Outcome correlation banner/text exists and contains "associated with" substring (exact or near equivalent); FACTS/SIGNALS/OUTCOMES definition banner exists on the page
- **Evidence**: DOM snapshot of 3-layer banner and outcome correlation sentence

### AC-12: Types are 100% TypeScript, no any, defensive arrays
- **Type**: `rule`
- **Given**: All new source files for the dashboard
- **When**: Static code review or `tsc --noEmit` is run
- **Then**: Every new interface has explicit types; list-returning helpers use `ensureArray` pattern; no variable or parameter typed as `any` in new code; TypeScript project build succeeds with zero errors
- **Pass Condition**: `cd frontend && npx tsc --noEmit` exit code 0 AND grep for `: any` in newly added files returns zero matches
- **Evidence**: tsc stdout + grep output

### AC-13: Visual and codebase fidelity (rubric)
- **Type**: `rubric`
- **Dimension**: Dashboard UI coherence with existing fundability + company page patterns
- **Scale**: 1–5
- **Anchors**:
  - 1 = Custom styles, new primitives, breaks responsive grid, inconsistent badge scheme
  - 3 = Mostly reuses primitives, some color/token drift, responsive works but not pixel-perfect
  - 5 = 100% reuse of Card/Button/Badge/Input/Separator; color palette limited to existing tokens; responsive grid identical to fundability page; `ensureArray`/`formatDate` helpers used where appropriate
- **Pass Threshold**: >= 4
- **Evidence**: Side-by-side visual comparison screenshots vs existing company + fundability page cards; code inspection of imports showing reuse of existing UI components and helpers

### AC-14: Information density and scannability (rubric)
- **Type**: `rubric`
- **Dimension**: Founder can scan the dashboard top-to-bottom and understand the program-specific readiness story in <= 60 seconds
- **Scale**: 1–5
- **Anchors**:
  - 1 = Wall of text, no score hero, sections unordered and hard to follow
  - 3 = Score hero present; sections ordered but cross-links and hierarchy are weak
  - 5 = Clear flow (Program → Startup → Fit Score → Gaps → Strategy → Red Team → Interview → Roadmap); program-specific score hero at top of viewport; every section links conceptually to the next
- **Pass Threshold**: >= 4
- **Evidence**: Qualitative UX walkthrough recording or annotated section-order diagram

## Open Questions
- [ ] Should the new dashboard be a dedicated route (e.g. `/application-intelligence`) or integrated as new tabs within the existing `/company` page? Tentative plan: **new route `/application-intelligence`** so the canonical company profile remains clean and the new feature gets full viewport width.
- [ ] Should the existing `/discover` program list wire into the "select program" dropdown? Tentative: yes, reuse the top-matches endpoint data where possible with graceful fallback to the mock programs list.
- [ ] Do we want to persist edited Application Strategy content via a new backend endpoint? Tentative: local state in this iteration; the types/client module will include a `saveApplicationStrategy` stub for future wiring.
