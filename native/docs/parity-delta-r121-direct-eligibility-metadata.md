# r121 — Fail-closed direct-apply metadata (source stage)

Date: 2026-11-10 NZ. State: IMPLEMENTING, not developer-verified on Android or iOS.
Repo: workmarketjp-gif/app.hoikucolor-recruit. Branch: native/color-jobseeker-submission-quarantine-20261110-r116. Parent before change: 2e787dab30f86c290ae0e06b690047b9eefe7d34.

## Verified Web/backend reference
- Native `searchJobseekerJobs` uses authenticated `hc_jobseeker_search_jobs_v2`; Native detail uses `hc_jobseeker_get_job_v2`.
- SQL: `supabase/migrations/20261007134800_hc_jobseeker_search_projection_stage_a_narrow_v2.sql` returns explicit `is_external` and `can_apply_direct`. `supabase/migrations/20261006213000_hc_external_job_sources_v1.sql` returns `false/true` for eligible first-party jobs and `true/false` for imported external jobs.
- Existing Web JobCard/direct-apply contract remains baseline; no Web mutation, no new backend permission.

## Closed source gap
Previously missing `is_external` / `can_apply_direct` values could be treated as an internal directly applicable posting in Home and Job Detail because both flags were optional in Native `JobseekerJob`. That is **not** a validated permission. Direct-application action, direct-apply document preflight, and Job Detail start/submit now require **explicit** `is_external === false` AND `can_apply_direct === true`. The native visit CTA separately requires an explicit internal source. Candidate-owned existing applications remain viewable, and server authorization is unchanged.

## Verification and limits
- Local archive originally matched GitHub blob SHA for `homeApplyDecision.ts`, `FeaturedHomeJobs.tsx`, and r120 focused test before edits. Node 22 `--experimental-strip-types --test` original partial source suite after test changes: 16 PASS, 1 ENOENT (fifth existing test requires complete `job/[id].tsx` checkout; NOT a successful complete test).
- Scope-specific helper tests with missing/false/null/true metadata all PASS. Actual GitHub Job Detail source receives the same strict flag guard; complete project typecheck, SDK-linked/OS-native runtime, authenticated API roundtrip, Web paired screenshots are NOT VERIFIED.
- Android: no SDK/emulator, signed APK or developer rendered QA. iOS: Linux, no Xcode/simulator, authorized signing/distribution or developer rendered QA. Both remain NOT VERIFIED.
- CI `.github/workflows/ci.yml` runs on PR or main push, not this development branch. No PR, merge, paid Actions/EAS, Production/Cloudflare deploy, DB/RLS/auth changes, real application/message, Store submission. Cloudflare account linkage/cost remains uncertain.

## Remaining next work
Run complete Expo dependency-backed TypeScript and all affected source tests once checkout/SDK access is available. Resolve Home inline-card picker vs top-of-detail placement and complete same-state Web/Native screenshots and two-platform runtime tests. Do not claim READY_FOR_MASA_ACCEPTANCE from source checks.
