# Color Native r122 — canonical live-feed availability and direct-apply parity

Date: 2026-11-10 NZ. Status: **IMPLEMENTING**, not developer-verified on either OS.
Repo: workmarketjp-gif/app.hoikucolor-recruit
Sole writer: Color Native Commander, `native/color-jobseeker-submission-quarantine-20261110-r116`.
Base HEAD: `660b26fca5ff92514be75b7344094de47d77fd79`. No open PR at preflight.

## Versioned source references and real defect

- Authenticated candidate Web/native backend: `supabase/migrations/20261006213000_hc_external_job_sources_v1.sql`, `hc_jobseeker_search_jobs_v2` and `hc_jobseeker_get_job_v2`. Neither RPC returns `is_open`; both return `source_kind`, `is_external`, `can_apply_direct` with a vetted public/jobseeker feed.
- Saved-job status RPC: `supabase/migrations/20261007100000_hc_saved_jobs_v2_result_columns_fix.sql`, `hc_jobseeker_list_saved_jobs_with_status_v2` explicitly returns `is_open`. An explicit `false` remains authoritative for saved closed jobs.
- UI source: `native/src/components/FeaturedHomeJobs.tsx` (Home cards) and `native/src/app/job/[id].tsx` (detail and document selection), candidate-owned synthetic state. Existing Web Home/direct apply visual reference in previous ledger; no new same-state screenshots or deployed SHA claim.
- Reproduced in actual old helper: a partially populated row lacking both `is_open` and canonical source metadata was displayed as **open**, because the missing status was accepted without confirming v2 row identity. No production malformed row or actual incorrect application was observed.

## Scoped fix

- `native/src/lib/homeFeaturedDetails.ts`: For absence of `is_open`, require the exact internal `hoiku_color/false/true` or nonempty external `non-hoiku_color/true/false` source projection before presenting **open**. Missing/mismatched metadata is **unknown**. Explicit `is_open=false` and invalid/expired `closing_at` continue to block new action.
- `native/src/lib/homeApplyDecision.ts`: reuse that same availability policy before document selection and pre-submit. Candidate-owned confirmed existing applications remain viewable even if the vacancy is closed. Neither helper can send an application.
- `native/qa/native-home-v2-availability.test.mjs`: 5 new focused behavioral tests for v2 internal/external, saved closed/open, malformed provenance, stale/invalid deadlines and direct-apply navigation.

## Source QA and matrix

Test runtime: Linux Node v22.16.0, `node --experimental-strip-types --test qa/native-home-v2-availability.test.mjs qa/native-home-featured-contract.test.mjs qa/native-job-detail-readback-authorization.test.mjs`.
Result: **15 tests PASS / 0 FAIL** using 3 exact-GitHub-blob existing fixtures plus the edited real helpers; no Expo/SDK substitutes. Old current source blob hashes were verified before edits; updated helper blobs checked after GitHub writes.
Missing: complete project `npm ci` / Expo `tsc`, authenticated RPC save/readback, rendered UI and paired Web screenshots.

| Workflow | Android source | Android runtime/visual/API | iOS source | iOS runtime/visual/API |
|---|---|---|---|---|
| Home featured status → detail → document selection | Updated shared Native helper, **IMPLEMENTING** | NOT VERIFIED | Updated shared Native helper, **IMPLEMENTING** | NOT VERIFIED |
| Saved closed-job status and existing application readback | Explicit close retained in helper, **IMPLEMENTING** | NOT VERIFIED | Same shared helper, **IMPLEMENTING** | NOT VERIFIED |

No Android SDK/emulator or signed installable APK in current runtime; Linux has no macOS/Xcode/iOS simulator or confirmed iOS distribution route. This does not imply platform acceptance.

## Safety, cost and integration

No database, RLS, Clerk, production Worker, application/message writes, paid Actions/EAS, PR, merge or Store submission. Github `.github/workflows/ci.yml` triggers on PR/main push, not this branch. Its preflight run count was zero. Accessible Cloudflare accounts had zero Pages projects when queried with valid page options; other linked integrations and ultimate billing cannot be ruled out.

Next: full dependency-backed Expo typecheck and exact-SHA contract/integration QA once an authorized complete checkout exists; then developer Android+iOS rendered/synthetic-state tests, actual authorized data save/readback, signature/distribution verification and MASA handoff. This source-only delta is **not READY_FOR_MASA_ACCEPTANCE**.
