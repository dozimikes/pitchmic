# Company Page (Venture Intelligence) Hardening - Independent Review

- [x] CP-R1: ensureArray wraps all four top-level list queries (claims, financials, fundingRounds, customers)
  - **Type**: `rule`
  - **Covers**: AC-1, Task 1
  - **Result**: PASS
  - **Evidence**: All four queries wrapped: claims at page.tsx:130, financials at :141, fundingRounds at :152, customers at :163. ensureArray defined at :71-79 with [] fallback and .results/.data envelope unwrap.

- [x] CP-R2: All nested array access sites prefixed with Array.isArray() guard
  - **Type**: `rule`
  - **Covers**: AC-2, Task 1
  - **Result**: PASS
  - **Evidence**: Four nested sites guarded: (1) claim.supporting_evidence guard at :730 before .map at :737, (2) snapshot.maturity_dimensions guard at :797 before Object.entries, (3) snapshot.contextual_assessments at :854 before .map at :855, (4) snapshot.historical_trajectory at :906 before .map at :909.

- [x] CP-R3: No raw Number(api_field).toLocaleString() without numOr guard
  - **Type**: `rule`
  - **Covers**: AC-3, Task 2
  - **Result**: PASS
  - **Evidence**: All 9 toLocaleString sites wrapped with numOr: :998, :1000, :1003x2, :1099, :1101, :1197, :1260, :1266, :1272. Additional numOr at :399, :699. numOr imported at :28.

- [x] CP-R4: LinkedIn + Twitter inputs + error blocks rendered in identity form
  - **Type**: `rule`
  - **Covers**: AC-4, Task 3
  - **Result**: PASS
  - **Evidence**: LinkedIn input + error block at :532-534. Twitter/X input + error block at :537-539. Fields registered via register(), defaults hydrated from profile at :183-184, watch() used in header links at :328-351.

- [x] CP-R5: All three dead buttons carry disabled + Coming-soon state
  - **Type**: `rule`
  - **Covers**: AC-5, Task 4
  - **Result**: PASS
  - **Evidence**: Add Period disabled + Coming soon at :973-975. Log Round disabled + Coming soon at :1079-1081. Add Segment disabled + Coming soon at :1168-1170. All three with Plus leftIcon.

- [ ] CP-R6: entityType/stage useState duplicates removed; header badges snapshot-sourced
  - **Type**: `rule`
  - **Covers**: AC-6, Task 5
  - **Result**: FAIL (issue noted)
  - **Evidence**: useState removal PASS: only 5 useStates at :83-88, no entityType/stage. Stage badge snapshot-sourced at :293-301 (snapshot?.financing_stage). BUT Entity badge at :302-304 is HARDCODED "Entity not set" with no conditional snapshot read — NOT snapshot-sourced.

- [x] CP-R7: saveMutation onSuccess invalidates all seven query-family keys
  - **Type**: `rule`
  - **Covers**: AC-7, Task 8
  - **Result**: PASS
  - **Evidence**: onSuccess at :205-214 Promise.all invalidates 7 keys: startup-profile :207, startup-intelligence+snapshot :208, startup-claims :209, startup-financials :210, startup-funding-rounds :211, startup-customers :212, startup-campaign :213.

- [x] CP-R8: Tab-switch confirm prompt guards identity dirty state
  - **Type**: `rule`
  - **Covers**: AC-8, Task 12
  - **Result**: PASS
  - **Evidence**: handleTabClick at :233-239: activeTab==='identity' && tabId!=='identity' && isDirty triggers window.confirm('Discard unsaved venture identity changes?'). isDirty from useForm at :95.

- [x] CP-R9: All demo fallback blocks (four sites) visibly labeled with Sample-data banner
  - **Type**: `rubric`
  - **Covers**: AC-9, Task 10
  - **Scale**: 1-5; Pass Threshold >= 4; Score: 5
  - **Result**: PASS
  - **Evidence**: All 4 demo blocks have AlertTriangle + amber banner + sample copy: Maturity Matrix :813-817, Financials sample header row :1019-1025, Funding Rounds banner :1108-1112, Customers banner :1174-1178. Score 5 = every demo block prefaced by alert-style banner with AlertTriangle icon and clear copy.

- [ ] CP-R10: Full type strictness cleanup complete
  - **Type**: `rubric`
  - **Covers**: AC-10, Task 11
  - **Scale**: 1-5; Pass Threshold >= 5; Score: 3
  - **Result**: FAIL
  - **Evidence**: PASS: zero as never / as any (grep 0 matches). FAIL: (1) Three narrowed casts at :97-99, :188, :230 have NO TODO comments (anchor 5 requires "+ TODO comment"). (2) SIX unused imported icons: Briefcase, Trash2, Check, Eye, ArrowUpRight, Clock all imported at :7-12 with zero JSX usage. Only 2 of 3 criteria removed → Score 3.

- [x] CP-R11: Snapshot score tiles skeleton during loading OR (Preliminary) when defaults active
  - **Type**: `rule`
  - **Covers**: AC-11, Task 9
  - **Result**: PASS
  - **Evidence**: Skeleton pulse divs rendered during isLoadingSnapshot at :358-362. (Preliminary) labels at three sites with ?? defaults: Fundamental Strength :369 with score ?? 71, Funding Readiness :380 with ?? 65, Stage Confidence :400 with ?? 0.91.

- [x] CP-R12: Logo upload entry link rendered near header avatar
  - **Type**: `rule`
  - **Covers**: AC-12, Task 12
  - **Result**: PASS
  - **Evidence**: Avatar at :271-277 immediately followed by Link href="/profile/logo" wrapping Button "Change logo" at :278-282 in same flex column.

- [x] CP-R13: Per-tab error UI with Retry button exists for all 5 tabbed queries
  - **Type**: `rule`
  - **Covers**: AC-13, Task 7
  - **Result**: PASS
  - **Evidence**: All 5 have AlertCircle + copy + Retry button with matching refetch: Claims (:587-599, refetchClaims), Maturity/Snapshot (:768-780, refetchSnapshot), Financials (:942-954, refetchFinancials), Funding Rounds (:1050-1062, refetchFundingRounds), Customers (:1145-1157, refetchCustomers). Campaign bonus at :1224-1236.

- [x] CP-R14: Claim dialog inline required-field messaging under statement + declared-value inputs
  - **Type**: `rule`
  - **Covers**: AC-14, Task 6
  - **Result**: PASS
  - **Evidence**: Claim statement conditional amber "Required — enter a non-empty claim statement." at :635-637 when !newClaimStatement.trim(). Declared value conditional amber "Required — enter the declared value of this claim." at :648-650 when !newClaimDeclaredValue.trim(). Save disabled at :657 on same conditions.

- [x] CP-M1: TypeScript strict typecheck exit 0
  - **Type**: `rule`
  - **Covers**: All ACs (meta)
  - **Result**: PASS
  - **Evidence**: npx tsc --noEmit in frontend dir → exit code 0 (cmd 856a46cd, terminal 2). No type errors.

- [x] CP-M2: ESLint exit 0 for changed file
  - **Type**: `rule`
  - **Covers**: All ACs (meta)
  - **Result**: PASS
  - **Evidence**: npx eslint 'src/app/(dashboard)/company/page.tsx' --no-error-on-unmatched-pattern → exit code 0 (cmd a728d371, terminal 3). No lint issues.

## Review History

### Review R1
- **Result**: `fail`
- **Evidence**: 14 of 16 checkpoints PASS. Two FAIL: CP-R6 (header entity badge hardcoded static — not snapshot-sourced; entity/stage useState removal OK though) and CP-R10 (type-strictness rubric Score 3 < threshold 5: narrowed casts lack TODO comments; 6 unused icons — Briefcase, Trash2, Check, Eye, ArrowUpRight, Clock). CP-M1 tsc and CP-M2 eslint both exit 0.
