# Color Native r123 — Home verified-workplace and finance evidence presentation

Date: 2026-11-10 NZ. State **IMPLEMENTING**; neither Android nor iOS DEVELOPER_VERIFIED.

## Evidence baseline and ownership
- Repository: `workmarketjp-gif/app.hoikucolor-recruit`; single Color Native owner, branch `native/color-jobseeker-submission-quarantine-20261110-r116`.
- Base HEAD `8a579c7196c6394d4ae40298f3e71b30ac2f26b5`; implementation commit `8131de25772a29ecffc76d3ade4a592b95943355`.
- Authenticated jobseeker Web reference: `src/components/JobCard.tsx` blob `f352532f4c8c28888f58d47364dd5c1eba044d29`, `src/components/VerifiedFinanceSummary.tsx` blob `e9e3a0f5e055d7d8b0b5163dde7495ce2eac7592`, prior Web baseline `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`; source inspected 2026-11-10, synthetic candidate/job state. Web deployed SHA and same-state screenshot are **not verified**.
- Previous Native Home `native/src/components/FeaturedHomeJobs.tsx` blob `1c730683f776df4f09e5ef4663db0a49e6f99fdf` omitted the Web's visible ✓勤務実績 / ✓会計実績 tags and evidence coverage/period disclosures; expanded metrics had no distinct provenance group.

## Source changes
- Home card now renders separated workplace/finance badges **only if actual verified metric values are displayable**, with verified-source attribution and validated transparency/period metadata when present. Finance stability caveat appears only if its metric appears. No fabricated employer or finance claims; no candidate write, new API, RPC, RLS, or navigation changes.
- New `native/src/lib/homeVerifiedDisclosure.ts` omits malformed percentages and periods rather than displaying fabricated default 0% or invalid dates. Existing canonical `homeEvidenceMetrics` remains the authority on which values are visible.
- Source: `native/src/components/FeaturedHomeJobs.tsx` blob `bd13798cb0a43cfc262e9d6d235a1d2ce536263a`; helper `93e12ac129142eeb0efc2a1f84594e65ffc74f16`; test `0e0ef816c950079eb9acafb4701677197c4d3456`.

## Verification
- Node v22.16.0: `cd native && node --experimental-strip-types --test qa/native-home-verified-disclosure.test.mjs` — **4/4 PASS** (genuine committed helper and test have the exact same Git blob SHA as the tested local files).
- TypeScript `transpileModule` syntactic diagnostics on the new helper: **0** (not project typecheck).
- GitHub committed UI source binding checks: **6/6 PASS**; branch head and all three blobs re-fetched and matched, CI workflow runs for commit: **0 at verification**.
- Not run: installed Expo/React Native, full typecheck, Native JSX render, authenticated canonical readback, Web↔Native visual comparison.

| Workflow | Android source | Android runtime / visual / authenticated API | iOS source | iOS runtime / visual / authenticated API |
|---|---|---|---|---|
| Home verified workplace/finance badges, coverage and evidence disclosure | IMPLEMENTING, source integrated | NOT VERIFIED | IMPLEMENTING, shared source integrated | NOT VERIFIED |

## Remaining differences and release gate
- Web also distinguishes finance-specific sample units and metric priority; inspect the remaining mobile presentation delta without altering canonical values. Web JobCard has inline visit/apply UI while Native uses a job-detail flow; source-only routing does not prove UX parity.
- Complete locked Expo `npm ci`/typecheck, source-scoped regressions, Android/iOS installed synthetic-state render/readback, screenshots, signed installable APK and an authorized iOS TestFlight/ad-hoc/internal route remain required.
- No PR, main merge, production, paid Actions/EAS, DB/RLS/Workers, real application/message, tester invitation or Store publication. CI config targets main push/PR; no new runs were observed. Cloudflare and other potential billing integrations are not exhaustively verified.

Next: obtain an authorized full Expo checkout for typecheck and integrate any remaining highest-impact candidate flow gaps; then obtain separately verified Android and iOS developer QA. READY_FOR_MASA_ACCEPTANCE **false**.
