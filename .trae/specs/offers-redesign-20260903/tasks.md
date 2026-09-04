# Offers Redesign — Implementation Tasks

Parent Spec: [spec.md](./spec.md)

## Task 1: Backend — Offer serializer intelligence annotations & summary enrichment

**Priority:** high
**Status:** pending
**Blocked By:** (none)
**Depends on:** (none)

### Scope

Backend files to edit:

- `backend/apps/offers/serializers.py` — extend `OfferSerializer` to annotate each offer with:
  - `match_score`, `match_dimensions` (from `apps.matching.models.MatchScore` via investor+startup join; fallback heuristic if missing)
  - `investor_intent_pct`, `intent_tier` (from `BehavioralSequenceModel.evaluate_sequence` over `InvestorIntentSignal` rows for the investor+startup pair; deterministic fallback via counts if signals empty)
  - `close_probability_pct` (intent minus status penalty; e.g. expired=0%, negotiating=intent×0.85)
  - `behavioral_signals` (string array of `InvestorIntentSignal.signal` unique values for the pair)
  - `engagement_score` (based on signal depth + recency; 0-100)
  - `offer_economics.implied_valuation` (amount/equity×100 or valuation field), `.median_dilution_pct` (across the same pitch's offers), `.capital_weighted_dilution_pct` (weighted mean)
- `backend/apps/offers/views.py` — override `list` action to return a richer `summary` block including:
  - `offers_received_count` / `offers_sent_count` (perspective-aware)
  - `capital_offered_sum`
  - `active_negotiation_count` (sent + negotiating + draft active states)
  - `accepted_count`
  - `best_offer_amount` (max amount among non-closed)
  - `high_conviction_count` (offers where investor_intent_pct ≥ 70)
  - `likely_offers` (array of up to 3 investor+probability pairs computed from intent signals where no offer yet exists but intent ≥ 55; include investor_name, investor_company, probability, and rationale_signals[])
  - `deal_health_score` (0-100) and `deal_health_tier` + `deal_health_factors` (arrows dictionary)
- `backend/apps/offers/urls.py` — no change; existing DRF route is sufficient.

### Deterministic fallbacks (used when ML model not run yet)

- Match score: 72 + (industry keyword match 0–10) + (ticket in range 0–8) → clamped 0–97.
- Investor intent: min(95, 30 + signal_count×5 − days_since_last_activity_gt7_penalty).
- Close probability: intent × status_multiplier (negotiating 0.88, sent 0.78, draft 0.55, accepted 99, rejected 0, expired 0).

### Test Requirements (local)

- **TR-1.1 (rule):** Call `GET /offers/` as a startup user; verify each offer object in `results[]` has keys `match_score`, `investor_intent_pct`, `close_probability_pct`, `behavioral_signals`, `engagement_score`, `offer_economics` (value or null allowed, key presence required).
- **TR-1.2 (rule):** Response includes `summary` object with keys: `offers_received_count` (or `offers_sent_count` for investor), `capital_offered_sum`, `active_negotiation_count`, `accepted_count`, `best_offer_amount`, `high_conviction_count`, `likely_offers` (array), `deal_health_score`, `deal_health_tier`, `deal_health_factors`.
- **TR-1.3 (rule):** Existing `PATCH /offers/<id>/` status transitions return unchanged shape and still succeed (curl the accept/reject/negotiate flows).
- **TR-1.4 (rubric):** Fallback robustness — wipe MatchScore and InvestorIntentSignal rows for a test user → endpoint returns 200 with non-null heuristics for every annotation key (no 500, no all-null objects).
  Threshold ≥ 9/10 (0 all-nulls, no exceptions).

### Completion Evidence

Capture: one `curl` GET /offers JSON response snippet showing new keys; one PATCH status-transition curl showing success.

---

## Task 2: Frontend — Type definitions, utility helpers, and new OfferCard subcomponents

**Priority:** high
**Status:** pending
**Blocked By:** Task 1 (for type shape finalisation; can draft in parallel but must reconcile)
**Depends on:** (none)

### Scope

Files to edit / create:

- `frontend/src/lib/types.ts` — extend `Offer` interface with optional backend annotation keys from Task 1. Add:
  - `OfferEconomics` interface
  - `MatchDimensions` interface
  - `LikelyOffer` interface (`investor_name`, `investor_company`, `offer_probability_pct`, `rationale_signals`: string[])
  - `DealHealthSummary` (`score`: number, `tier`: string, `factors`: Record<string, "up"|"down"|"flat">)
  - `PitchmicIntelligenceSummary` (`high_conviction_count`, `likely_offer_count`, `best_offer_amount`, `highest_intent_pct`, `negotiation_opportunity_tier`, `next_milestone_term_sheet_probability_pct`)
  - `OfferComparisonSelection` (offerId set management shape)
- `frontend/src/lib/utils.ts` — add helpers:
  - `formatCompactCurrency(n)` for $750K / $2.25M style summaries.
  - `tierFromScore(score, thresholds)` → "LOW"|"WARM"|"HIGH_CONVICTION"|"VERY_HIGH_CONVICTION".
  - `arrowLabelFromFactor(factor)` → "↑"/"↓"/"→".
  - `instrumentFromTerms(terms, equity_pct)` → "SAFE" | "Convertible Note" | "Equity" | "Debt" | "Unknown".
  - `investorTypeFromCompany(company_name)` → VC | Angel | Family Office | Corporate | Accelerator | Unknown.
  - `ticketBucket(amount)` → "<$100K" | "$100K–$500K" | "$500K–$1M" | "$1M+".
  - `strategicFitFromMatch(match_dimensions or score)` → "High" | "Medium" | "Low".
  - `statusDisplayLabel(status, perspective)` — implements FR-9 label mapping.
- **New subcomponent** `frontend/src/components/offers/ScoreBar.tsx` — small reusable `<ScoreBar value={0-100} label="Investor Intent" suffix="%" colorScheme="intent" />` with semantic colouring and hover tooltip for model-name attribution (MatchScore / BehavioralSequence / VentureOutcome — tooltip only, not LLM call).
- **New subcomponent** `frontend/src/components/offers/EngagementChecklist.tsx` — renders `behavioral_signals[]` as a checklist of ✓ Pitch viewed, ✓ Deck downloaded, ✓ Data room viewed, ✓ Partner introduced, ✓ Offer submitted, greying out signals that are absent. Takes `intent_tier` too so that HIGH_CONVICTION expands to 5 items, WARM shows 3.
- **New subcomponent** `frontend/src/components/offers/InvestorEngagementScore.tsx` — compact "Investor Engagement: 87/100 — Deck 92% viewed · Data room 8 docs viewed · Last activity 2h ago" line.

### Test Requirements (local)

- **TR-2.1 (rule):** TypeScript `tsc --noEmit` passes after edits (no type errors in the files above).
- **TR-2.2 (rule):** `tierFromScore` deterministic mapping: scores 0-29 LOW, 30-54 WARM, 55-79 HIGH_CONVICTION, 80+ VERY_HIGH_CONVICTION.
- **TR-2.3 (rule):** `statusDisplayLabel` for startup perspective + sent status → "Under Review"; draft → "Pending Response"; investor perspective + sent → "Sent · Awaiting reply".
- **TR-2.4 (rubric):** `<ScoreBar />` visual clarity on 375px viewport. Threshold ≥ 8/10 (bar visible, label readable, no wrap overflow).

### Completion Evidence

TSC clean output; one unit test or manual log showing tier mapping and status label mapping; 375px ScoreBar screenshot.

---

## Task 3: Frontend — Rewrite the main Offers page (stats, banner, search, filters)

**Priority:** high
**Status:** pending
**Blocked By:** Tasks 1 & 2
**Depends on:** (none)

### Scope

Rewrite `frontend/src/app/(dashboard)/offers/page.tsx`:

- Replace 4-card StatsGrid with 5-card grid per FR-1. Use the new summary object keys from backend, fallback to client-side aggregate over `offers[]` if summary is missing.
- Add **Pitchmic Intelligence banner** Card immediately after stats grid. Render:
  - Title + icon row.
  - Narrative lines (3–6 bullets) from `PitchmicIntelligenceSummary` computed from summary + offers.
  - Deal Health score block with tier + arrow-factor row.
  - [View Investor Intelligence] CTA → href `/intelligence`.
- Add **Likely Offers** inner section within the banner (compact 3-col inline card row for each `summary.likely_offers[]`). Use precise "Estimated probability of offer" wording.
- Rewrite search placeholder per FR-2 (role-aware, no "pitch" substring).
- Implement **More Filters** Sheet that uses the new helpers from Task 2: Instrument, Investor Type, Ticket size, Pitchmic Match, Strategic Fit — all client-side filter predicates applied to `filteredOffers`.
- Keep existing status pill row but swap pill labels via `statusDisplayLabel()`.

### Test Requirements (local)

- **TR-3.1 (rule):** 5 stat cards render, titles match spec perspective (startup vs investor).
- **TR-3.2 (rule):** Pitchmic Intelligence banner renders before search filter card in DOM order. Contains Deal Health score.
- **TR-3.3 (rule):** Likely offer card DOM text contains "probability of offer" and does NOT contain "will offer" or "predicted offer".
- **TR-3.4 (rule):** More filters sheet opens and lists 5 dimension sections (Instrument, Investor Type, Ticket size, Pitchmic Match, Strategic Fit). Each section contains selectable options.
- **TR-3.5 (rule):** Search input placeholder string does not match regex `/pitch/i`.
- **TR-3.6 (rubric):** Info density balance on a page with 3 sample offers. Threshold ≥ 7/10 (core decision signals visible, not overwhelming per AC-16).

### Completion Evidence

Screenshot of populated stats+banner+filters; DOM-text grep confirms placeholder / likely-offer wording.

---

## Task 4: Frontend — Rewrite OfferRow into intelligence-rich OfferCard

**Priority:** high
**Status:** pending
**Blocked By:** Task 2 (ScoreBar / Checklist / EngagementScore subcomponents), types from Task 2

### Scope

Replace `frontend/src/components/offers/OfferRow.tsx` content (keep the same file and exported `OfferRow` name so existing imports don't break — rename internal structures as needed):

- **Header:** counterparty name, investor type, precise status badge (via `statusDisplayLabel`).
- **Economics trio row:** Investment $ / Equity % / Implied Valuation $.
- **ML score row:** three `<ScoreBar>` components: Pitchmic Match (tooltip: "MatchScore composite across industry, stage, ticket, location"), Investor Intent (tooltip: "BehavioralSequenceModel conversion intent"), Close Probability (tooltip: "VentureOutcomePredictor × status multiplier").
- **Intent tier pill** + label, semantic colouring.
- **Engagement checklist** via `<EngagementChecklist>` (show ≥3 ticks, ≥5 for very high conviction).
- **Terms line**: instrument badge + pro-rata + board observer (heuristic from `terms` field text matches; default `SAFE · Pro‑rata · Board observer` for non-empty active offers).
- **Investor Engagement sub-footer** via `<InvestorEngagementScore>` with docs/time info.
- **Action row:** [Intelligence] (opens a Sheet stub with "Full intelligence" heading + summary of every score and its rationale) · [Compare] (toggles selection set) · [Negotiate] (existing mutation) · [Accept] (existing mutation) — retain existing Message, Simulate Dilution, and More menu.
- Keep existing Framer Motion row animation and colour strip — update strip colour palette to align with intent tier as a semantic cue (optional but encouraged).

### Test Requirements (local)

- **TR-4.1 (rule):** Each OfferRow in DOM contains 3 ScoreBar instances (Match / Intent / Close) with distinct labels and progress bars.
- **TR-4.2 (rule):** Engagement checklist shows ≥3 visible checkmarks for any active offer.
- **TR-4.3 (rule):** Existing Accept and Negotiate onClick handlers still call `handleStatusChange()` with the correct OfferStatus — verify from source code or spy on mutation call.
- **TR-4.4 (rubric):** Architectural alignment (score labelling & tooltips reference underlying models). Threshold ≥ 8/10 per AC-17.
- **TR-4.5 (rubric):** 375px mobile stacking integrity. Threshold ≥ 8/10 per AC-18 for just the offer card.

### Completion Evidence

Single-offer card screenshot; 375px stacked card screenshot; grep of tooltips confirming model-name attribution.

---

## Task 5: Frontend — Offer Comparison sheet & deterministic recommendation engine

**Priority:** medium
**Status:** pending
**Blocked By:** Tasks 3 & 4 (need global selection state & per-card Compare toggle)
**Depends on:** (none)

### Scope

- Create new file `frontend/src/components/offers/OfferComparisonSheet.tsx`.
- Wire selection state up in `offers/page.tsx`: `Set<string>` of offer IDs, exposed via context or prop-drill through OfferRow (add `onToggleCompare(offerId)` prop).
- Global **[Compare]** button in the search/filter row next to "More filters". Disabled unless selection.size is between 2–4.
- Sheet content:
  - Title: "Compare Offers"
  - Table with columns: Investor | Capital | Equity | Implied Valuation | Pitchmic Match | Investor Intent | Strategic Fit | Follow-on capacity | Estimated close probability
    - Follow-on capacity heuristic: High if investor's investment_range_max (from types if available or fallback) / offer amount ≥ 4; Medium if 2–4; Low if <2 (defaults to Medium when unknown).
    - Strategic Fit → use helper from Task 2.
  - **Pitchmic Recommendation** card below the table:
    - Winner = argmax over `weightedScore = match*0.30 + intent*0.25 + close*0.20 + valuation_normalised*0.15 + strategic_fit_numeric*0.10`
      - Valuation normalised: for same pitch offers, 100 × (this implied valuation / max valuation).
    - Render a 2–3 sentence rationale referencing the specific dimension strengths/weaknesses of the winner vs the runner-up. Use template strings + variable interpolation — **no LLM call**.

### Test Requirements (local)

- **TR-5.1 (rule):** 2–4 offers can be selected; compare CTA enables; sheet opens.
- **TR-5.2 (rule):** Comparison table contains all 9 required columns (Investor, Capital, Equity, Implied Valuation, Pitchmic Match, Investor Intent, Strategic Fit, Follow-on capacity, Estimated close probability).
- **TR-5.3 (rule):** Recommendation is computed from a deterministic weighted formula in source code (no fetch to /api/ai, /predict, or any LLM provider route). Grep of `OfferComparisonSheet.tsx` for an `argmax`/`reduce` + explicit weights confirms this.
- **TR-5.4 (rubric):** Recommendation explanation comprehensibility. Threshold ≥ 8/10 — a founder reading the paragraph understands *why* the offer won without inspecting code.

### Completion Evidence

Screenshot of 3-offer comparison with recommendation visible; code excerpt showing the weighted score formula.

---

## Task 6: Frontend — Empty state redesign

**Priority:** medium
**Status:** pending
**Blocked By:** Task 3 (page structure is known)
**Depends on:** (none)

### Scope

In `frontend/src/app/(dashboard)/offers/page.tsx`, replace the empty-state branch:

- Wrap content in a vertically-centered min-height card ~450px (flex layout `min-h-[450px]` around the content, not just padding).
- Heading: **"No offers yet"**.
- Sub-paragraph matches spec copy.
- Two primary CTAs (perspective-aware):
  - Startup → [Discover Investors] → `/discover`, [Review Investor Matches] → `/pipeline`
  - Investor → [Browse Pitches] → `/newsfeed`
- Below CTAs, a "Pitchmic is monitoring your investor signals" 2×2 grid:
  - Investor interest (icon: Eye or TrendingUp)
  - Pitch engagement (icon: Sparkles or Play)
  - Data-room activity (icon: FolderOpen or Files)
  - Intro requests (icon: Mail or MessageSquare)
  Each with caption line, muted colours.

### Test Requirements (local)

- **TR-6.1 (rule):** Rendered empty container height (getBoundingClientRect) is between 380px and 520px (inclusive).
- **TR-6.2 (rule):** Startup perspective has exactly 2 primary CTAs labelled "Discover Investors" and "Review Investor Matches" (exact text). Investor perspective has "Browse Pitches".
- **TR-6.3 (rule):** 4-item "monitoring" legend present below CTAs.
- **TR-6.4 (rubric):** Visual polish. Threshold ≥ 8/10 (layout is balanced, not lopsided; icons and text aligned properly).

### Completion Evidence

Screenshot of empty state at 1024px; measured height value logged from devtools.

---

## Task 7: Integration, graceful null handling, lint/type checks

**Priority:** high
**Status:** pending
**Blocked By:** Tasks 1–6 (all above)
**Depends on:** (none)

### Scope

- **Graceful null passes:** Artificially null all annotation keys in backend response (mock by editing local state or API interceptor). Confirm page renders without React crash, without console TypeError, and every ScoreBar shows "-" or a deterministic default stub (never "0%" as a silent placeholder). Do this for 3 scenarios: (a) all annotations null, (b) half null, (c) fully populated.
- **Existing offer mutation regression test:** Walk Accept / Negotiate / Decline / Withdraw flows on a test offer (or stub offer) and confirm optimistic updates + server roundtrip + react-query refetch produce correct UI state (use the dev server or a unit-style flow).
- **TypeScript & lint:** Run `npm run lint` (or eslint) + `tsc --noEmit` in `frontend/` directory, zero new errors (pre-existing legacy errors allowed only if count doesn't increase).
- **Responsive spot-check:** 375px (iPhone SE), 768px (iPad mini), 1440px desktop. Screenshot each size with sample data populated.
- **Tie-up loose ends:** Any skipped CTAs (e.g., the "View Intelligence" Sheet stub from Task 4 action row) at minimum render a Sheet with the score summary and rationale bullets; no new route in this iteration.

### Test Requirements (local)

- **TR-7.1 (rule):** Console has 0 TypeErrors / Uncaught Errors when all 6 annotation keys are null per offer; ScoreBars show non-zero placeholder (dash or computed stub).
- **TR-7.2 (rule):** Accepting a `sent` offer transitions status to `accepted`, success toast or UI state confirms, refetches without crash.
- **TR-7.3 (rule):** Frontend `tsc --noEmit` passes and eslint has ≥0 new errors (count existing before + after; Δ must be ≤ 0).
- **TR-7.4 (rubric):** Mobile (375px) overall layout integrity. Threshold ≥ 8/10 per AC-18 (no CTA overlap, stats grid wraps correctly, comparison table scrolls).

### Completion Evidence

Console screenshot (clean) during full-null mock run; Accept-flow success screenshot; TSC + eslint terminal output; 3 responsive screenshots (375/768/1440).

---

## Task coverage of Acceptance Criteria (AC → Task)

| AC | Primary verifying task |
|---|---|
| AC-1 Stats 5 cards, perspective-aware | Task 3, TR-3.1 |
| AC-2 Search placeholder excludes pitches | Task 3, TR-3.5 |
| AC-3 5-dimension More Filters | Task 3, TR-3.4 |
| AC-4 Pitchmic Intelligence banner | Task 3, TR-3.2 |
| AC-5 "Estimated probability" wording | Task 3, TR-3.3 |
| AC-6 Deal Health 0–100 + tier + arrows | Task 3, TR-3.2 |
| AC-7 3 ML progress bars per card | Task 4, TR-4.1 |
| AC-8 ≥3 engagement checklist ticks | Task 4, TR-4.2 |
| AC-9 Compare sheet 9 columns, 2–4 selection | Task 5, TR-5.1 + TR-5.2 |
| AC-10 Deterministic weighted recommendation | Task 5, TR-5.3 |
| AC-11 Empty state 380–520px + 2 CTAs + 4 signals | Task 6, TR-6.1 + TR-6.2 + TR-6.3 |
| AC-12 Status display label taxonomy | Task 2, TR-2.3 + Task 4 render |
| AC-13 Backend intelligence keys + summary | Task 1, TR-1.1 + TR-1.2 |
| AC-14 Existing mutations succeed | Task 1, TR-1.3 + Task 7, TR-7.2 |
| AC-15 No crash on null annotations | Task 7, TR-7.1 |
| AC-16 Intelligence clarity rubric ≥7 | Task 3, TR-3.6 |
| AC-17 Architectural alignment rubric ≥8 | Task 4, TR-4.4 |
| AC-18 Mobile responsive rubric ≥8 | Task 7, TR-7.4 |

