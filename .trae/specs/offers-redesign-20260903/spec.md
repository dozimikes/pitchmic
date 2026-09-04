# Offers Page ML Intelligence Redesign — Specification

## Problem

The current `/offers` page renders as a generic startup fundraising marketplace. It displays Amount + Status + Equity per row and four simple stat cards (Total Offered, Active, Accepted, Avg. Equity). The page answers: *"What offers have I received?"*

Pitchmic's architecture, however, already contains substantial ML infrastructure: Investor Intent Prediction, Behavioral Sequences, MatchScore, Venture Outcome Prediction, Bayesian updating, Knowledge Graph, calibration, and anomaly detection. Almost none of this intelligence is visible on the Offers page.

The gap means the product cannot demonstrate its differentiation from AngelList/DocSend-style conventional fundraising tools.

## Users

- **Startup founders** (primary): receive offers, evaluate conviction, compare terms, decide action.
- **Investors** (secondary): track sent offers, see their own pipeline status.
- **Accelerators / admins** (tertiary): portfolio view of offer landscape.

## Goals

1. Transform the Offers page into an **ML-powered Deal Intelligence Center** that visibly surfaces Pitchmic's predictive architecture.
2. For every offer, answer: *how strong is investor conviction, how good are the economics, how likely is it to close, and what should I do next?*
3. Add a dedicated **Pitchmic Intelligence** banner section, **Likely Offers** predictions, **Offer Comparison**, and a dramatically improved **empty state**.
4. Redesign stat cards, search/filter UX, and status taxonomy to be fundraising-semantically precise.
5. Keep existing visual polish (gradients, cards, motion) — do not turn into a cluttered AI dashboard.

## Non-Goals

- No new ML model training or retraining.
- No changes to authentication, authorization, or routing infrastructure.
- No realtime WebSocket / channel changes beyond the existing offer push layer.
- No new persisted Offer model fields (use existing MatchScore / InvestorIntentSignal / annotations instead).
- No implementation of an actual Offer Detail deep page in this iteration (the row "View Intelligence" button may link to `/offers/[id]` but routing scaffolding is out of scope; stub with modal/sheet or existing full-offer view).

## Functional Requirements

### FR-1 — Stat cards redesign (top-of-page KPIs)

Replace the current 4-card grid with 5 cards:

| Card | Startup perspective label | Investor perspective label |
|---|---|---|
| 1 | Offers Received | Offers Sent |
| 2 | Capital Offered | Capital Deployed |
| 3 | Active Negotiations | Active Negotiations |
| 4 | Accepted | Accepted |
| 5 | Best Offer | Best Offer |

- "Best Offer" shows the highest `amount` among non-closed offers, or `—` when none.
- Remove "Avg. Equity" from the top line (it moves into the Offer Economics block per card).
- Each card shows the correct perspective-aware label; the badge next to the page title counts Offers.

### FR-2 — Search placeholder correction and filter expansion

- The search input placeholder must say **"Search offers or investors..."** (startup) or **"Search offers or startups..."** (investor). Remove the word "pitches" from the placeholder.
- Keep the existing status tab pill row. Add a **"More Filters"** dropdown sheet that exposes these additional dimensions (client-side filter over the fetched offer list; no new backend query params required):
  - **Instrument** — SAFE / Convertible Note / Equity / Debt / Other (infer from `terms` text; default "Unknown" when blank).
  - **Investor Type** — VC / Angel / Family Office / Corporate / Accelerator (free-text heuristic match on `investor_company`; fallback "Unknown").
  - **Ticket size** — <$100K / $100K–$500K / $500K–$1M / $1M+.
  - **Pitchmic Match** — 90+ / 75–89 / 60–74 / <60 (uses `match_score` annotation).
  - **Strategic Fit** — High / Medium / Low (derived from MatchScore dimension sub-scores when available; default Medium).

### FR-3 — Pitchmic Intelligence banner section

Insert a card **directly below the stats grid, above the search/filter bar**, titled **"Pitchmic Intelligence"**. It contains:

- Narrative line items (stubbed from ML layer annotations or deterministic heuristics when annotations are absent):
  - *N investors currently showing high conviction*
  - *N offers received · N likely offer(s) in pipeline*
  - *Best current offer: $amount*
  - *Highest investor intent: XX%*
  - *Negotiation opportunity: Low / Medium / High*
  - *Predicted next milestone: Term sheet probability XX%*
- A CTA button: **[View Investor Intelligence]** (links to `/intelligence` or same-anchor scroll; no new route required).
- If zero offers + zero signals, the banner gracefully collapses to a single line: *"Pitchmic is monitoring investor signals. Intelligence will surface here as engagement grows."*

### FR-4 — "Likely Offers" predictive block

Above the main offer list (or inside the Intelligence banner when populated), render a compact row of up to 3 cards:

- Investor avatar + name
- **Estimated probability of offer: XX%**
- Sub-bullet: *Based on pitch engagement, data-room activity, behavior, stage compatibility, historical patterns.*
- Probability numbers use the `BehavioralSequenceModel.conversion_intent_score` (if available via annotation), otherwise a deterministic heuristic from `InvestorIntentSignal` count + type + recency.
- **Important wording**: never "will make an offer" — always "Estimated probability of offer".

### FR-5 — Deal Health indicator

Inside the Pitchmic Intelligence banner, add:

- **Fundraising Health** score 0–100 with a label tier (Weak / Moderate / Strong / Exceptional).
- The score composes: investor demand volume, offer velocity, negotiation activity, conversion-to-accepted rate, and capital concentration (single investor >40% of offered capital → penalty).
- Below the score, a bullet line with arrows: *Investor demand ↑ · Offer velocity ↑ · Negotiation activity → · Conversion rate ↑ · Capital concentration ↓*

### FR-6 — Offer row becomes an intelligence card

Replace the current `OfferRow` information density. Each offer card must now expose:

- **Header row**: counterparty name, fund type, status badge (use precise labels: Pending Response / Under Review / Negotiating / Accepted / Rejected / Expired / Closed — map from existing OfferStatus enum).
- **Economics trio**: Investment $ / Equity % / Implied Valuation $.
- **ML score row** (three scores with horizontal progress bars):
  - *Pitchmic Match* 0–100 (from `MatchScore.compatibility_score` annotation; stub with deterministic 60–95 if not available).
  - *Investor Intent* % (from behavioral sequence model or heuristic).
  - *Close Probability* % (from Venture Outcome / survival heuristics; stub with intent − status penalty).
- **Intent tier label**: LOW / WARM / HIGH CONVICTION / VERY HIGH CONVICTION — coloured green-emerald scale.
- **Investor engagement** checklist: ✓ Pitch viewed · ✓ Deck downloaded · ✓ Data room viewed · ✓ Partner introduced · ✓ Offer submitted (toggle checks based on signal presence; stub any missing signals based on intent tier).
- **Terms line**: Instrument · Pro-rata · Board observer (parsed from `terms` field; stub SAFE / Equity / Convertible when empty based on equity_pct presence pattern).
- **Action row**: [Intelligence] [Compare] [Negotiate] [Accept]. Keep existing Message, Dilution Sim, More menu. The [Intelligence] and [Compare] open their respective UI; [Negotiate]/[Accept] retain current mutations.
- **Engagement score** from data-room telemetry (when available): *Investor Engagement: 87/100 — Deck 92% viewed · Data room 8 docs viewed · Last activity 2h ago*. Stub with reasonable default if data-room telemetry missing.

### FR-7 — Offer Comparison capability

- Add a global **[Compare]** button next to the Filters button, plus per-card [Compare] toggles that add/remove the offer to a selection set (min 2, max 4).
- When ≥2 are selected, open a Sheet (reuse existing `ui/Sheet` component) with a side-by-side comparison table:
  - Capital · Equity · Implied Valuation · Pitchmic Match · Investor Intent · Strategic Fit · Follow-on capacity · Estimated close probability
- Below the table: a **"Pitchmic Recommendation"** block naming the strongest overall offer, with reasoning that references the score columns. The recommendation is a deterministic weighted composite of Match × Intent × Valuation × Close probability — NOT an LLM call.

### FR-8 — Empty state redesign

The current empty state pushes the message far down. Replace it with a centered ~450px tall card:

- Icon block + **"No offers yet"** heading
- Paragraph: *"Your investor pipeline is still developing. Pitchmic will surface investor interest, engagement and offers here as they emerge."*
- Two primary CTAs (perspective-aware):
  - Startup: [Discover Investors] → `/discover`, [Review Investor Matches] → `/pipeline`
  - Investor: [Browse Pitches] → `/newsfeed`
- Below the CTAs, a small "signals monitoring" block with four icons: *Investor interest · Pitch engagement · Data-room activity · Intro requests* (these are "Pitchmic is watching" items, not counters).

### FR-9 — Status labels and precise-state taxonomy

Keep the DB `OfferStatus` enum unchanged. Display-label mapping:

| DB status | Startup display label | Investor display label |
|---|---|---|
| draft | Pending Response | Draft |
| sent | Under Review | Sent · Awaiting reply |
| negotiating | Negotiating | Negotiating |
| accepted | Accepted | Accepted |
| rejected | Rejected | Rejected |
| withdrawn | Investor withdrew | Withdrawn |
| expired | Expired | Expired |

Status filter pills should match the display taxonomy but still filter correctly against the raw enum.

### FR-10 — Backend: Offer serializer intelligence annotations

Extend the Django `OfferSerializer` (or add a parallel `list` action override) that annotates each flat offer response with optional intelligence fields. Fields may be `null` when computation hasn't run yet; frontend must handle `null` gracefully with stubs.

```
match_score: number | null         # 0-100, MatchScore.compatibility_score * 100
match_dimensions: {                # sub-scores, for filter "Strategic Fit"
  industry: number, stage: number, ticket_size: number, location: number, semantic: number
} | null
investor_intent_pct: number | null # 0-99, behavioral sequence conversion score
intent_tier: "COLD"|"WARM"|"HIGH_CONVICTION"|"IMMINENT_TERM_SHEET" | null
close_probability_pct: number | null
behavioral_signals: string[]       # e.g. ["VIEW_PITCH","DOWNLOAD_DECK","SUBMIT_OFFER"]
engagement_score: number | null    # 0-100 data-room / deck engagement
offer_economics: {
  implied_valuation: number | null,
  median_dilution_pct: number | null,
  capital_weighted_dilution_pct: number | null,
} | null
```

Additionally, the list endpoint summary should include the new KPI fields needed for FR-1 and FR-3 (total offers count, capital sum, active negotiation count, best offer, high_conviction_count, likely_offers array, deal_health_score).

When a real MatchScore or signal set is absent, compute a **deterministic heuristic** on the backend so the frontend always has numbers — never rely exclusively on frontend-only stubs for the "intelligence" numbers.

### FR-11 — Frontend type updates

Update `Offer` in `frontend/src/lib/types.ts` to include the new optional annotation fields from FR-10. Add a new `OfferComparisonSelection`, `LikelyOffer`, `DealHealthSummary`, and `PitchmicIntelligenceSummary` type interface.

## Non-Functional Requirements

### NFR-1 — Graceful degradation

Every ML number can be `null`. The UI must never crash; every progress bar / score tile must render a disabled state or "-" placeholder when data is absent, and must not show "0%" as a default. Stubs with deterministic placeholders are preferred over empty dashboards when annotations are missing.

### NFR-2 — Performance

Re-fetching offers on mount must remain ≤ the current p95. The Compare sheet and Intelligence banner must compute client-side composites in O(n) where n ≤ 50. No blocking render loops.

### NFR-3 — Responsiveness

- Stats grid: 2-col mobile / 3-col tablet / 5-col desktop (wrap the 5th card).
- Offer card: score row + engagement checklists must stack cleanly on mobile (<640px) without scroll inside a card.
- Compare sheet: table must horizontally scroll on narrow viewports; do not drop columns.

### NFR-4 — Existing behavior preservation

- All current status mutations (Accept / Negotiate / Decline / Withdraw) must keep working exactly as today, including optimistic react-query invalidation.
- The "Simulate Dilution" modal remains available and unchanged.
- The existing filter-by-status pill row still works (only the *labels* change per FR-9, not the filtering behavior).

### NFR-5 — Visual consistency

Reuse the existing design system primitives (`Card`, `Badge`, `Button`, `Sheet`, `Input`, `Avatar`, `Separator`, brand gradients) without introducing ad-hoc colours. Score-bar colours should be semantic:
- Match / intent / close probability → emerald→amber→red by percentile.
- Deal risk → amber / red for warning / critical.
- Urgency (expiry < 3 days) → amber tint on status badge.

## Constraints, Dependencies, Assumptions

- **Dependency**: `MatchScore` (apps.matching.models) already has startup↔investor compatibility data. Backend uses it when a row exists; otherwise falls back to heuristic.
- **Dependency**: `InvestorIntentSignal` (apps.matching.models) is source of behavioral events.
- **Assumption**: Offer-to-offer comparison uses the *same pitch* offers as the default filter but also allows cross-pitch comparison (user is responsible for the apples-to-oranges scenario).
- **Assumption**: Follow-on capacity in Compare table is heuristically inferred from investor investment range, not a new DB field.
- **Constraint**: No new database migrations in this iteration. All intelligence comes from joins/annotations over existing tables or heuristics.

## Open Questions

None at this time. Recommended direction is encoded as FRs above.

---

## Acceptance Criteria (ACs)

Every AC is either `rule` (objectively verifiable binary condition) or `rubric` (evaluative quality dimension with pass threshold).

### AC-1 (rule) — Stats grid has 5 perspective-aware cards

On page mount (startup user, zero data), the top grid shows 5 cards titled exactly: *Offers Received*, *Capital Offered*, *Active Negotiations*, *Accepted*, *Best Offer*. For an investor user the first two show *Offers Sent* and *Capital Deployed*. There is no card titled "Avg. equity" at the top of the page.

### AC-2 (rule) — Search placeholder excludes "pitches"

The search input placeholder string does **not** contain the substring "pitch" or "pitches". It contains either "offers or investors" or "offers or startups" depending on role.

### AC-3 (rule) — More Filters dropdown expands to show 5 filter dimensions

Clicking "More filters" opens a UI (dropdown or sheet) with labelled sections: Instrument, Investor Type, Ticket size, Pitchmic Match, Strategic Fit. Each section has 3–6 selectable options.

### AC-4 (rule) — Pitchmic Intelligence banner exists above search bar

The page DOM contains a card or section with the text "Pitchmic Intelligence" rendered before the search/filter card. It contains at least 3 insight lines and one CTA button.

### AC-5 (rule) — Likely Offers block shows "Estimated probability of offer" wording

When 1+ likely offer candidates are computed and rendered, each card uses the exact phrase "Estimated probability of offer" (or equivalent "offer probability") and never includes certainty phrasing such as "will offer", "predicted offer", etc.

### AC-6 (rule) — Deal Health score is displayed in the Intelligence banner

A numeric score 0–100 with a tier label (Weak/Moderate/Strong/Exceptional) and a one-line arrow-summary (↑↓→) of sub-metrics is visible inside the Pitchmic Intelligence card.

### AC-7 (rule) — Each offer card displays 3 ML scores with progress bars

Each rendered offer row card contains three labelled progress bars: Pitchmic Match, Investor Intent, and Close Probability. Each label appears alongside a numeric value and a horizontal visual bar.

### AC-8 (rule) — Investor engagement checklist shows ≥3 signal ticks

Each offer card shows an "Investor engagement" or "Investor activity" block with ≥3 checkmark bullet items (e.g. Pitch viewed, Deck downloaded, Data room viewed). The list length scales with intent tier (≥5 for very high conviction).

### AC-9 (rule) — Compare sheet opens for 2–4 selected offers

There is a global Compare CTA and per-card Compare toggle. Selecting exactly 2 offers and clicking the global button opens a Sheet/Modal with a comparison table containing the columns: Capital, Equity, Implied Valuation, Pitchmic Match, Investor Intent, Strategic Fit, Follow-on capacity, Estimated close probability.

### AC-10 (rule) — Pitchmic Recommendation is deterministic composite

The comparison sheet recommendation does NOT call an LLM/AI provider. Inspecting the frontend source (`frontend/src/components/offers/*`) shows the recommendation is computed as a weighted formula over the table columns (Match weight, Intent weight, Valuation normalisation, Close probability weight).

### AC-11 (rule) — Empty state card is vertically centered and ~450px tall

When the offer list is empty AND no filters are active, the rendered empty container has height roughly between 380px and 520px and shows exactly two primary CTAs + a 4-item "Pitchmic is monitoring" signal legend below.

### AC-12 (rule) — Status display labels match FR-9 taxonomy

For a startup user viewing an offer in `sent` status, the displayed badge says exactly "Under Review" (not "Sent"). For `draft` status the startup badge says "Pending Response". Investor-side labels match FR-9 investor column.

### AC-13 (rule) — Backend serializer includes optional intelligence annotations

The DRF `OfferSerializer` (or an overridden list response wrapper) returns per-offer keys (any may be null): `match_score`, `investor_intent_pct`, `intent_tier`, `close_probability_pct`, `behavioral_signals`, `engagement_score`, `offer_economics`. The summary includes best_offer_amount, high_conviction_count, likely_offers, deal_health_score.

### AC-14 (rule) — All existing status mutations still succeed

Running the existing frontend Accept / Negotiate / Decline flows against a live backend still produces the correct OfferStatus DB transition and react-query refetch (no API shape regression).

### AC-15 (rule) — No crash on null intelligence data

Artificially nulling every annotation key in the API payload, the page renders successfully (no React error boundary, no TypeError in console).

### AC-16 (rubric) — Intelligence clarity & non-overwhelm (threshold: ≥7/10)

**Scale:**
10 — Information is perfectly layered; at a glance the user sees top 3 decisions per offer, depth lives behind [Intelligence].
 7 — Good balance; core decision signals (Match, Intent, Close, Economics) are front-and-center without crowding.
 4 — Cluttered; too many metrics at top level or buried important signals.
 1 — No meaningful intelligence visible or overwhelming unstructured metric dump.

**Pass threshold**: ≥ 7/10. Evidence: screenshot or live page inspection of a populated 3-offer scenario.

### AC-17 (rubric) — Pitchmic architectural alignment (threshold: ≥8/10)

**Scale:**
10 — Every score explicitly maps to a named architecture component (BehavioralSequenceModel, MatchScore, VentureOutcome, Bayesian) and the mapping is discoverable from tooltips/UI.
 8 — Match, Intent, Close Probability, and Engagement are visibly present and labelled as Pitchmic ML outputs; at least one tooltip references the underlying model.
 5 — Numbers are present but look decorative; no linkage to the system's actual ML components.
 1 — Generic marketplace UI unchanged.

**Pass threshold**: ≥ 8/10. Evidence: UI copy + tooltips inspection.

### AC-18 (rubric) — Mobile responsive integrity (threshold: ≥8/10)

**Scale:**
10 — Perfect 320px-wide layout; all cards stack, comparison table scrolls without horizontal layout breakage.
 8 — Usable on a 375px mobile viewport: every CTA is tappable; no horizontal overflow on cards; scores/info remain legible.
 5 — Some overflow or CTA overlap; functional but degraded.
 1 — Major horizontal scroll or unusable layout below 768px.

**Pass threshold**: ≥ 8/10. Evidence: 375px viewport screenshot.
