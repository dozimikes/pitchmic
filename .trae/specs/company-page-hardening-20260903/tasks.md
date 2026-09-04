# Company Page (Venture Intelligence) Hardening - Implementation Plan

## Task 1: Defensive ensureArray + Array.isArray guards for all list/nested array access
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Add inline `ensureArray<T>()` helper (copy existing project convention from `pipeline/page.tsx` L302-318)
  - Wrap top-level query results for `claims`, `financials`, `fundingRounds`, `customers` using `ensureArray<T>(raw)` instead of `= []` default (which only catches undefined, not object-shaped envelopes)
  - Prefix every `.length` / `.map()` / `.entries()` access on nested API arrays (`supporting_evidence`, `maturity_dimensions`, `contextual_assessments`, `historical_trajectory`) with an `Array.isArray()` guard OR pipe through `ensureArray<T>` at destructure point so iteration is always safe
- **Acceptance Criteria Addressed**: AC-1, AC-2
- **Test Requirements**:
  - `rule` TR-1.1: In the file, all four top-level queries destructure `data: xRaw` then reassign via `ensureArray`. Evidence: grep `ensureArray` matches on claims, financials, fundingRounds, customers lines.
  - `rule` TR-1.2: All nested array iteration sites (5 sites: supporting_evidence, maturity_dimensions entries, contextual_assessments map, historical_trajectory map) prefixed with Array.isArray or piped through ensureArray at destructure. Evidence: source line inspection per site.

## Task 2: Replace raw Number(x).toLocaleString() with numOr + NaN-safe formatting
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Audit every `Number(foo).toLocaleString()` where `foo` comes from the API. There are ~10 sites.
  - Prepend `import { … numOr … } from '@/lib/utils'` if missing.
  - Wrap each as `numOr(Number(foo), 0)` before `.toLocaleString()` so null/undefined → 0 instead of NaN.
  - For fields where `0` is misleading (e.g. valuation post-money, CAC/LTV), use a falsy check to render '-' fallback instead of `$0`.
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `rule` TR-2.1: No raw `Number(field_from_api).toLocaleString()` remains. Evidence: `grep -n 'Number(\(fin\.\|rnd\.\|seg\.\|campaign\.\)' company/page.tsx` returns 0 matches.

## Task 3: Add LinkedIn URL + Twitter URL inputs + errors to identity form
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - In identity form grid, AFTER website URL row (at ~line 428 before final save button section), add two new form groups wired to `register('linkedin_url')` and `register('twitter_url')`.
  - Use same Label + Input + errors pattern as other fields.
  - Confirm both fields are already declared in validator schema, defaultValues.reset() effect, and saveMutation.patch payload — if NOT, add them.
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `rule` TR-3.1: Identity form `<form>` renders inputs for `linkedin_url` and `twitter_url` with matching error paragraphs. Evidence: source lines showing two Input nodes + two error nodes.

## Task 4: Disabled/Coming-soon state for Add Period / Log Round / Add Segment buttons
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - For the three dead-action buttons, either (a) add `disabled` prop + change label text to "Add Period (Coming soon)" style, OR (b) keep text but add `variant: ghost` disabled. Consistent across all three.
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `rule` TR-4.1: All three buttons have `disabled` attribute. Evidence: source lines for each Button component include `disabled={true}` or `disabled` prop.
  - `rule` TR-4.2: Button label or variant clearly signals non-actionable. Evidence: "(Coming soon)" suffix in child text or disabled visual style.

## Task 5: Remove duplicate entityType/stage useState + source badges from snapshot
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Delete `const [entityType, setEntityType] = React.useState(…)` and `const [stage, setStage] = React.useState(…)` declarations.
  - Delete the two native `<select>` inputs (Incorporation Jurisdiction at ~L384 and Operational Stage at ~L396) from identity form — they don't save anywhere.
  - Source header badge "Pre-Seed / Seed…" from `snapshot?.financing_stage` with fallback "Stage not set" Badge variant=outline instead of hard-coded `useState` value.
  - Entity badge: if profile has no entity field, render "Entity not set" Badge; do NOT re-introduce an unsaved select.
- **Acceptance Criteria Addressed**: AC-6 (option a: removed + snapshot-sourced)
- **Test Requirements**:
  - `rule` TR-5.1: No `useState` calls for `entityType` / `stage` remain. Evidence: grep returns 0 for both identifiers.
  - `rule` TR-5.2: Header stage badge reads from snapshot.financing_stage with guarded fallback. Entity badge has no select control. Evidence: source lines header badges section.

## Task 6: Claim dialog inline validation messaging
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - Under claim statement input, add conditional text: when `!newClaimStatement.trim()`, show red-500 helper "Enter a non-empty claim statement" or grey-400 "Required" helper.
  - Under declared value input, add conditional text: when `!newClaimDeclaredValue.trim()`, show similar inline help.
  - Keep Save disabled logic but user now understands WHY.
- **Acceptance Criteria Addressed**: AC-14
- **Test Requirements**:
  - `rule` TR-6.1: Inline helper paragraphs present under both inputs. Evidence: source lines in Add Claim dialog body after each Input.

## Task 7: Per-tab error UI with refetch buttons for all 5 tabs
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Destructure `isError: isClaimsError, refetch: refetchClaims` from the existing claims query (or add missing).
  - Add `isError` + `refetch` destructures for snapshot, financials, customers, campaign queries.
  - In each tab workspace, BEFORE the normal list/cards render block, insert an error short-circuit pattern:
    - `{ isXError && <Card error-red variant><CardContent>AlertCircle + Failed to load … label + Button refetch </CardContent></Card> }`
  - Keep existing empty-state demo fallbacks.
- **Acceptance Criteria Addressed**: AC-13
- **Test Requirements**:
  - `rule` TR-7.1: All 5 per-tab queries destructure `isError` and `refetch`. Evidence: per query line.
  - `rule` TR-7.2: All 5 tab blocks render error short-circuit UI when `isError === true`, each with a Button that calls `.refetch()`. Evidence: tab JSX source lines.

## Task 8: Extend saveMutation onSuccess invalidation to all dependent query families
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - In saveMutation `onSuccess` (~L161), after `invalidateQueries({queryKey:['startup-profile']})`, add parallel invalidation calls for the six dependent keys using `queryClient.invalidateQueries` with each family key.
  - Wrap them in a single `Promise.all([...])` + return the promise (since onSuccess accepts async) so React Query awaits completion.
- **Acceptance Criteria Addressed**: AC-7
- **Test Requirements**:
  - `rule` TR-8.1: onSuccess invalidates all 7 listed keys (profile + snapshot + claims + financials + funding-rounds + customers + campaign). Evidence: source onSuccess block code.

## Task 9: Snapshot score preliminary labeling OR skeleton
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 1 (ensureArray setup area is a good place)
- **Description**:
  - In the header section two quick-snapshot badges block (Fundamental Strength / Funding Readiness): when `isLoadingSnapshot === true` OR when fallback values are used, either:
    - Show small skeleton `h-14 w-28 rounded-xl bg-slate-100 animate-pulse` placeholders, OR
    - Add a tiny "(Preliminary)" or "Estimate" Badge/Label suffix next to the `/100` scores when defaults are active.
  - Same for stage_confidence at L277.
- **Acceptance Criteria Addressed**: AC-11
- **Test Requirements**:
  - `rule` TR-9.1: Score tiles either have a skeleton while snapshot isLoading, or carry "(Preliminary)" wording when defaults are used. Evidence: header score tiles source.

## Task 10: Wrap all hardcoded demo fallback blocks with visible sample-data banners
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - 4 demo fallback sites:
    1. Financials table empty-state row (~L811 fake "Q2 2026" row)
    2. Funding Rounds empty-state card (~L872 fake "Pre-Seed Bridge")
    3. Customer Segments fallback triple-array inline (~L913 fake Enterprise, Mid-Market, Developer API cards)
    4. Maturity matrix fallback object inline (~L648 fake 8-dimensions hardcoded)
    5. Contextual assessments fallback empty (already a no-op — double-check)
    6. Historical trajectory empty state (already a no-op — double-check)
  - For each fake fallback, add a top-level visually-clear wrapper: prepend a Badge/Alert banner saying "(Sample data — connect API or add real data)". Do NOT silently interleave demo rows with real rows if the user adds one row later — fallbacks must render only when arrays are truly empty.
- **Acceptance Criteria Addressed**: AC-9
- **Test Requirements**:
  - `rubric` TR-10.1: Disclosure quality. Scale 1-5; anchors 1=still hidden; 3=badge on each; 5=banner + consistent pattern across all four sites. Threshold >=4. Evidence: fallback rendering source.
  - `rule` TR-10.2: Fallback blocks only render when `array.length === 0`. Evidence: conditional wrapper at each site.

## Task 11: Type strictness — remove `as never`, remove both `as any`, trim dead icon imports
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - Import block: cross-reference each icon name against JSX usages. Delete unused ones from the lucide-react import list. At minimum: ChevronRight, Scale, AlertTriangle, Lock, Cpu, Database, Layers, Percent, Shield, HelpCircle — each one found to have zero JSX refs in file.
  - `resolver: zodResolver(ProfileUpdateSchema) as never` → replace with a safer cast plus one-line comment: `// TODO: narrow ProfileUpdateSchema per role to remove cast`. Safe cast: `zodResolver(ProfileUpdateSchema) as unknown as ReturnType<typeof zodResolver<Extract<ProfileUpdateInput, { role: 'startup' }>>>`. The cast-though-unknown + TODO comment is fine per non-goals this round.
  - Claim type select `e.target.value as any` → `as StartupClaim['claim_type']` (import StartupClaim type if needed — already imported at L31-32 StartupIntelligenceApi block)
  - Customer map `(seg: any)` → define a typed fallback inline array with explicit interface `type CustomerFallback = { id: string; segment_type: string; customer_count: number; … }` or `as StartupCustomerSegment & { id: string }` assertion depending on shape.
- **Acceptance Criteria Addressed**: AC-10
- **Test Requirements**:
  - `rule` TR-11.1: No `as never` remains. Evidence: grep count=0.
  - `rule` TR-11.2: No `as any` remains. Evidence: grep count=0.
  - `rule` TR-11.3: Every icon imported from lucide-react appears at least once in JSX (barring extremely dynamic use — none here). Evidence: manual cross-check of the import list.

## Task 12: Add logo upload entry link near header avatar + Add unsaved tab-switch confirm dialog
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - Header: Immediately under/right of the XL Avatar, add a compact `<Link href="/profile/logo"><Button size="xs" variant="outline">Change logo</Button></Link>` (use nearest Button sizes/variants available per Button component API; if xs not available use sm).
  - Tab switch guard in the 6-tab bar onClick handler. Existing handler does `onClick={() => setActiveTab(tab.id)}`. Replace with a `handleTabClick(tabId: TabId)` function that:
    - If `activeTab === 'identity' && tabId !== 'identity' && isDirty === true` → call `if (!window.confirm('Discard unsaved venture identity changes?')) return;` before doing `setActiveTab(tabId)`
    - Otherwise switch normally.
- **Acceptance Criteria Addressed**: AC-8, AC-12
- **Test Requirements**:
  - `rule` TR-12.1: Link to `/profile/logo` renders near avatar. Evidence: source lines in header identity block.
  - `rule` TR-12.2: Tab onClick handler wraps in confirm prompt conditionally. Evidence: handleTabClick function body with confirm().

## Issue I-1: Entity badge still hardcoded "Entity not set" — source from snapshot.entity_type with fallback
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Discovered By**: Review R1
- **Description**:
  - CP-R6 fails partial: stage badge is snapshot-sourced correctly, but the entity badge at ~line 302 always shows "Entity not set" hardcoded.
  - Fix: replace static Badge text with `{snapshot?.entity_type ?? snapshot?.legal_entity_type ?? ...}` plus a guarded fallback outline Badge saying "Entity not set" when both are absent.
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `rule` TR-I-1.1: Entity badge value is conditional — reads from `snapshot` fields before falling back to "Entity not set". Evidence: source lines header badges.

## Issue I-2: Narrowed casts lack TODO comments; 6 icons unused (Briefcase, Trash2, Check, Eye, ArrowUpRight, Clock)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Discovered By**: Review R1
- **Description**:
  - CP-R10 rubric (threshold 5, scored 3). Two gaps:
  - (a) Casts at lines ~97-99 (resolver), ~188 (reset payload), ~230 (onSubmit) are safer than `as never` but lack the required `// TODO: narrow ProfileUpdateSchema per role to remove cast` annotation.
  - (b) 6 imported icons never referenced in JSX: `Briefcase`, `Trash2`, `Check`, `Eye`, `ArrowUpRight`, `Clock`. Trim from the import block.
- **Acceptance Criteria Addressed**: AC-10
- **Test Requirements**:
  - `rule` TR-I-2.1: All 3 narrowed-cast sites have a one-line TODO comment preceding or inline. Evidence: grep `TODO.*narrow.*ProfileUpdateSchema` count == 3 or adjacent merged comment.
  - `rule` TR-I-2.2: None of Briefcase / Trash2 / Check / Eye / ArrowUpRight / Clock remain in the import list. Evidence: import block lines.
  - `rule` TR-I-2.3: Post-fix, every icon in the import list is referenced at least once in JSX. Evidence: manual cross-check.

## Task 13: Final verification — typecheck + build
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Tasks 1-12 all completed
- **Description**:
  - Run `frontend$ npm run typecheck` (tsc --noEmit)
  - Run `frontend$ npm run lint`
  - Fix any new TS/lint errors introduced.
- **Acceptance Criteria Addressed**: All ACs at meta-level
- **Test Requirements**:
  - `rule` TR-13.1: tsc --noEmit exits 0. Evidence: command output.
  - `rule` TR-13.2: next lint exits 0 with no new issues introduced. Evidence: command output.
