# Company Page (Venture Intelligence) Hardening - PRD

## Overview
- **Summary**: Close all P0–P3 gaps found in the `/company` venture-intelligence dashboard page (1010-line monolith at `frontend/src/app/(dashboard)/company/page.tsx`). Covers type-safety, missing inputs, dead UI, defensive data handling, API response shape hardening, and code quality.
- **Purpose**: Eliminate future runtime crashes (e.g. `offers.map is not a function`-class regressions), eliminate silent data loss on save, and ensure the page displays only real server data (never misleading demo fallbacks presented as facts).
- **Target Users**: Startup founders using the dashboard to maintain their canonical venture profile, register evidence-backed claims, and manage fundraising-round data for investor diligence.

## Goals
1. No runtime `TypeError` thrown from `.map()` / `.length` access when the DRF backend returns a paginated `{ results }` envelope instead of a raw array.
2. No `Number(undefined).toLocaleString()` producing visible `"NaN"` strings anywhere in rendered cards/tables.
3. All controlled inputs declared in the form schema are actually rendered in JSX (no data-loss bug where save silently drops LinkedIn/Twitter).
4. No UI elements present themselves as actionable (Button) while actually doing nothing.
5. Hardcoded demo fallback values are clearly distinguishable from real API-backed values.
6. Dependent React Query caches are correctly invalidated after identity save.
7. Dead imports / explicit `any` casts are removed or replaced with proper narrowing for maintainability.

## Non-Goals
- Do **not** refactor the 1010-line monolith into separate component files (out of scope; tracked separately as a long-term maintainability task, not a bugfix).
- Do **not** redesign the UX of the tab layout, maturity matrix, or claims 3-way matrix (visual critique is documented separately; this ticket is correctness-only).
- Do **not** build new claim-dialog RHF+zod wiring; only add non-blocking inline error feedback for blank fields.
- Do **not** add real Stripe/Quickbooks integrations for "Add Period", "Log Round", "Add Segment". These are non-functional backend work; we only surface disabled/coming-soon state so users aren't misled.
- Do **not** build a real Logo upload flow; just link to the existing `/profile/logo` route.
- Do **not** change the ProfileUpdateSchema shape itself (requires backend contract review tracked as separate work); the narrower resolver cast stays with a safer type than `as never`.

## Background & Context
- This page uses Next.js 14.2.13 App Router, TanStack Query 5, react-hook-form 7 with `@hookform/resolvers/zod`, framer-motion for tab transitions, and `lucide-react` icons.
- Project conventions:
  - `frontend/src/lib/utils.ts` exports `numOr(v, fallback)` (line 333) for NaN-safe numeric coercion.
  - Sibling pages (`pipeline/page.tsx`, `offers/page.tsx`, `dataroom/page.tsx`) already carry an inline `ensureArray<T>()` helper that unwraps `{ results?: T[] }` / `{ data?: T[] }` envelopes and falls back to `[]`.  **Convention**: new array-shaped query results MUST pass through this defensive guard.
  - Backend DRF views now correctly elevate `summary`/`count` fields outside the `results` wrapper (see `offers/views.py` lessons), but endpoints *may* still return either shape on older routes; client MUST handle both.
- Browser observation: `/company` correctly redirects unauthenticated users to `/sign-in?next=%2Fcompany`; sign-in page has no JS runtime errors. Sign-in redirect and Next image warning are both pre-existing and unrelated to this ticket.

## Functional Requirements

### FR-1: Defensive API array handling
- Every list-shaped React Query data consumer (`claims`, `financials`, `fundingRounds`, `customers`) MUST pass the raw API response through an `ensureArray<T>()` helper before being stored or `.map()`ed.
- Every nested array field (`claim.supporting_evidence`, `snapshot.maturity_dimensions`, `snapshot.contextual_assessments`, `snapshot.historical_trajectory`) MUST be guarded with `Array.isArray()` before iteration / `.length` access.

### FR-2: NaN-safe numeric formatting
- Every `Number(x).toLocaleString()` call on API-supplied values MUST use `numOr(Number(x), 0)` (or appropriate non-zero fallback per domain: e.g., runway could legitimately be 0) before formatting. Applies to: revenue, burn, ACV, funding amounts, campaign amounts, average contract values.

### FR-3: Identity form — all declared fields rendered
- The identity `<form onSubmit={onSubmit}>` (lines ~364) MUST include explicit `Input` widgets for every field name `register()`ed and every field sent in the PATCH body:
  - `linkedin_url` / `twitter_url` MUST be added as two new input rows in the identity form.
  - Corresponding `{ errors.linkedin_url && <p>…</p> }` error inline feedback MUST mirror existing patterns.

### FR-4: Dead buttons have clear affordance
- Three action buttons with no `onClick` ("Add Period", "Log Round", "Add Segment") MUST be in `disabled` state and display a "Coming soon" suffix OR a disabled-style label. Users MUST be able to visually distinguish them from live action widgets.

### FR-5: Duplicate stage/entity state eliminated
- `useState('Delaware C-Corporation (USA)')` (entityType) and `useState('Pre-Seed')` (stage) are NOT connected to the API and conflict with snapshot-sourced values elsewhere. Either:
  - Wire them to `register()` and include in PATCH payload, OR
  - **Preferred**: remove the `useState` + duplicate `<select>` widgets, and source the header badges from `snapshot.financing_stage` (already rendered at line 275) + `entityType`-equivalent profile field if present; fall back to snapshot defaults with clear 'Not yet set' label when missing.

### FR-6: Claim registration dialog — inline error state
- "Save Claim" button disables when fields are blank — but there is no user-visible reason. Add a compact inline `<p>` that renders at least when the user has touched a field but it's still empty, OR always show field-level helper text stating minimum non-blank requirement. This is a lighter-touch alternative to full RHF+zod rewrite.

### FR-7: Per-tab error and loading states
- Each tabbed workspace (`claims`, `maturity`, `financials`, `customers`, `campaign`) MUST render an error UI with a Retry-triggering Button if its corresponding `useQuery` returns `isError`. It MUST NOT silently render a blank state or show fake demo fallback data without an explicit "(Demo fallback)" banner.

### FR-8: Save mutation invalidates dependent caches
- After `saveMutation` success, in addition to invalidating `['startup-profile']` also invalidate/reset the family of queries that key on `profile.id`: `['startup-intelligence', 'snapshot']`, `['startup-claims']`, `['startup-financials']`, `['startup-funding-rounds']`, `['startup-customers']`, `['startup-campaign']`.

### FR-9: Snapshot score hard-coded fallbacks marked as preliminary
- Header tile scores (fundamental_strength_score ?? 71, funding_readiness_score ?? 65, stage_confidence ?? 0.91) use hard-coded placeholders while loading. These MUST render with a "(Preliminary)" text suffix or `HelpCircle` tooltip explaining the value is a default estimate, not a real engine score. Alternatively: show a skeleton/placeholder until the snapshot loads.

### FR-10: Logo upload entry point
- The avatar section at the top MUST include a small `Button` / `Link` pointing to `/profile/logo` so users can discover and navigate to the actual logo upload page instead of hunting through the sidebar.

### FR-11: Unsaved changes guard on tab switch
- When user clicks another tab while `isDirty === true` on the identity form (unsaved edits), present a `window.confirm('Discard unsaved venture identity changes?')` prompt before actually switching active tabs.

## Non-Functional Requirements

### NFR-1: Type strictness
- `resolver: zodResolver(ProfileUpdateSchema) as never` — the `as never` cast MUST be removed. Acceptable narrower casts: `zodResolver(ProfileUpdateSchema) as ReturnType<typeof zodResolver<Extract<ProfileUpdateInput,{role:'startup'}>>>` OR, cleanest, keep `as unknown as <correctResolverType>` with a one-line comment linking to the schema-narrowing follow-up ticket.
- All `as any` casts in the page MUST be replaced with named, domain-appropriate type assertions (e.g. `as StartupClaim['claim_type']`, typed fallback array for customer segments).
- Dead icon imports (icons imported but never rendered in JSX) from `lucide-react` are removed.

### NFR-2: Render correctness
- Visual regression: Every rendered card/table that previously showed a hardcoded demo row ONLY when the array was empty MUST continue to show it BUT wrap the entire fallback block with an explicit visually-distinct banner or Badge labeling it "(Sample data — connect API or add data above)".

### NFR-3: Bundle impact
- Changes MUST NOT introduce new third-party dependencies. Inline helpers only (copy existing `ensureArray` pattern).

## Constraints
- **Technical**: Single-file change in `frontend/src/app/(dashboard)/company/page.tsx` is preferred for this ticket; no component file splits (per Non-Goal 1).
- **Technical**: Must continue to work with Next.js 14.2.13, React 18.3.1, TanStack Query 5.56, react-hook-form 7.53. No upgrades allowed.
- **Dependencies**: Backend endpoints `/profiles/startup/me/`, `startupIntelligenceApi.getSnapshot / getClaims / getFinancials / getFundingRounds / getCustomerSegments / getCampaign` — their input/output contracts are fixed for this ticket; we adapt client-side defenses to handle both raw arrays and paginated envelopes.
- **Business**: No feature additions beyond what's listed in FRs; this is a bugfix + defensive-hardening pass.

## Assumptions
1. `startupIntelligenceApi` method return types (`getSnapshot`, `getClaims`, etc.) may be broad enough that runtime shapes can vary; defensive guards are acceptable even when TypeScript claims types are narrower.
2. Using `window.confirm()` for the unsaved-changes guard is acceptable product UX. A custom modal is a future enhancement.
3. Adding a `Link` to `/profile/logo` (rather than an inline upload widget) is sufficient for FR-10.

## Open Questions
_None — all scope decisions resolved per Non-Goals above._

## Acceptance Criteria

### AC-1: ensureArray applied to all top-level list queries
- **Type**: `rule`
- **Given**: `/company` page renders with identity tab loaded
- **When**: backend for `claims` returns `{ results: [...] }` instead of a raw array
- **Then**: claims tab renders each card via `.map()` without throwing TypeError
- **Pass Condition**: static code inspection confirms `ensureArray<T>()` wraps `claims`, `financials`, `fundingRounds`, and `customers` before use
- **Evidence**: grep output + line number references

### AC-2: Array.isArray guards on all nested array accesses
- **Type**: `rule`
- **Given**: claim with truthy but non-array `supporting_evidence` object from API
- **When**: claim card is rendered
- **Then**: evidence list section skips rendering safely instead of throwing `.length` on object
- **Pass Condition**: supporting_evidence, snapshot.maturity_dimensions iteration, contextual_assessments map, historical_trajectory map all prefixed with Array.isArray() check (or ensureArray when it produces an iterable)
- **Evidence**: source inspection at exact lines

### AC-3: NaN-safe number formatting everywhere
- **Type**: `rule`
- **Given**: an API record has `revenue_usd: null` / `undefined`
- **When**: financial row + customer cards + campaign summary render
- **Then**: visible formatted value shows "$0" or empty/guard, never the string "NaN"
- **Pass Condition**: all `Number(x).toLocaleString()` usages for API-supplied values replaced with `numOr(Number(x), 0)` or equivalent
- **Evidence**: grep `Number\(` matches in the file show no raw usage for API fields

### AC-4: Linkedin + Twitter inputs present in identity form
- **Type**: `rule`
- **Given**: identity tab form rendered
- **When**: user inspects the form fields
- **Then**: two new labelled inputs (LinkedIn URL, Twitter URL) are present, wired via `register('linkedin_url')` and `register('twitter_url')` respectively, with matching `{ errors.xxx && … }` inline error paragraphs
- **Pass Condition**: form JSX contains both inputs and both error blocks
- **Evidence**: source inspection at form section

### AC-5: Dead buttons carry disabled/Coming-soon state
- **Type**: `rule`
- **Given**: user views tabs with "Add Period", "Log Round", "Add Segment" buttons
- **When**: button is clicked
- **Then**: no confusion because button element has `disabled` attribute OR a (Coming soon) label in its text
- **Pass Condition**: all three buttons render disabled/coming-soon state
- **Evidence**: source lines for each button

### AC-6: Stage and entity duplicates removed or properly wired
- **Type**: `rule`
- **Given**: identity tab + header badges
- **When**: user makes selections that previously were NOT persisted
- **Then**: no mismatch between "state-local values that lie" and persisted API values. Either selects are wired to register + PATCH payload, OR removed entirely and header badges source from snapshot.
- **Pass Condition**: (a) both selects removed + header badges snapshot-sourced with fallback label OR (b) both selects registered and fields included in reset effect + patch payload + errors rendered for each.
- **Evidence**: source inspection of useState usages and form payload

### AC-7: Save mutation invalidates all dependent caches
- **Type**: `rule`
- **Given**: user saves identity changes
- **When**: save mutation succeeds (onSuccess fires)
- **Then**: in addition to startup-profile, following keys invalidated: snapshot, claims, financials, funding-rounds, customers, campaign query families
- **Pass Condition**: invalidateQueries calls include all seven keys listed
- **Evidence**: source line at onSuccess block

### AC-8: Unsaved tab-switch prompt
- **Type**: `rule`
- **Given**: user typed in identity form making `isDirty` true
- **When**: they click a different tab
- **Then**: a confirm dialog appears; cancel keeps them on the current tab with state intact; OK switches tabs and resets form state
- **Pass Condition**: tab onClick handler branches on `isDirty && activeTab !== 'identity'` with a confirm() guard
- **Evidence**: source lines for tab click handler

### AC-9: Hardcoded demo fallbacks visually labeled as sample/demo data
- **Type**: `rubric`
- **Dimension**: Sample-data disclosure clarity
- **Scale**: 1-5
- **Anchors**: 1 = Fake rows look identical to real rows; 3 = "(Sample)" Badge visible on each fallback block; 5 = Entire fallback region wrapped with a visually distinct banner + explicit text inviting users to add real data
- **Pass Threshold**: >= 4
- **Evidence**: source lines for each demo fallback (financials empty-state row, funding round empty-state card, customers fallback triple, maturity_dimensions inline object, historical_trajectory empty handling plus contextual_assessments fallback)

### AC-10: Type strictness improvements
- **Type**: `rubric`
- **Dimension**: Type hygiene vs master
- **Scale**: 1-5
- **Anchors**: 1 = `as never`, two `as any` casts, and dead icons all remain; 3 = `as never` removed (safer cast with comment) and one `as any` fixed; 5 = `as never` narrowed with one-line follow-up ticket comment + both `as any` replaced + all unused icon imports trimmed
- **Pass Threshold**: >= 5 (full clean-up targeted since it's a single-pass file edit)
- **Evidence**: diff against baseline — icon count in the removed list; `as any` count; resolver cast

### AC-11: Snapshot preliminary labeling
- **Type**: `rule`
- **Given**: header score tiles render
- **When**: snapshot is still loading (score defaults kick in)
- **Then**: placeholder/default scores either show "Preliminary" text suffix next to score, OR tile shows a skeleton `<div>` while `isLoadingSnapshot` is true
- **Pass Condition**: one of the two patterns is applied to both Fundamental Strength and Funding Readiness tiles
- **Evidence**: source lines for score-tile rendering

### AC-12: Logo upload entry link present
- **Type**: `rule`
- **Given**: header with avatar renders
- **When**: user looks near the avatar
- **Then**: a link or small button with text "Change logo" navigates to `/profile/logo`
- **Pass Condition**: Link present near Avatar block
- **Evidence**: source lines near the `<Avatar size="xl">` render

### AC-13: Per-tab error UIs exist
- **Type**: `rule`
- **Given**: any per-tab query (claims, snapshot-maturity, financials, customers, campaign) returns isError
- **When**: user navigates to the corresponding tab
- **Then**: tab content area shows an error card (AlertCircle icon, "Failed to load …" text) + a `<Button>` calling `.refetch()` on the query
- **Pass Condition**: each of the 5 tabs has an `isError` guard with matching refetch UI before its normal list rendering
- **Evidence**: source lines per tab

### AC-14: Claim dialog inline validation messaging
- **Type**: `rule`
- **Given**: claim dialog is open
- **When**: statement or declared-value fields are blank but the user has interacted with them (e.g. field touched) OR Save button would be disabled
- **Then**: inline helper text under inputs states "(Required)" or "Please enter a claim statement" / "Please enter the declared value"
- **Pass Condition**: inline conditional text renders under at least the two string inputs
- **Evidence**: source lines for claim dialog inputs
