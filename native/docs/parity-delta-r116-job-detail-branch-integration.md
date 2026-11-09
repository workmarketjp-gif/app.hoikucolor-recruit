# COLOR Native parity delta — r116 / 2026-11-10 NZ

State: **IMPLEMENTING**, not DEVELOPER_VERIFIED. This is an isolated Native branch, not a merged PR, Production release or installable acceptance candidate.

## Frozen reference and ownership
- Repo: `workmarketjp-gif/app.hoikucolor-recruit`.
- New single-writer branch: `native/color-jobseeker-submission-quarantine-20261110-r116`, branched from `2a9aed03e2dbe21c935bb3302779eab15f62ea56`.
- Web jobseeker baseline: `src/components/JobCard.tsx` blob `f352532f4c8c28888f58d47364dd5c1eba044d29`, `main`, retrieved 2026-11-10 NZ. Reference role: signed-in jobseeker; **synthetic** open/closed/invalid-closing-date, owned existing application, pending ambiguous submit.
- Native original: `native/src/app/job/[id].tsx` blob `f5f6e1bb78d7a821f5486cd203dd9950f78cf5e7` at original branch head; integrated candidate blob `ba835da9d667192deacf6c2688b9537e380cb920`.
- Existing r77–r110 Home/notifications and related patch series are **NOT** integrated by this branch commit. Do not replace their original provenance with this scope.

## Actual changed files
- `native/src/app/job/[id].tsx`: pins candidate session, refreshes canonical job/profile/application before submission, refuses closed/unknown jobs, persists a candidate/job quarantine before RPC dispatch, quarantines unknown send results, preserves navigation to a confirmed owned application even if receipt cleanup fails. The marker is **not** server-side idempotency; no automatic retry is authorized.
- `native/src/lib/homeApplyDecision.ts`, `jobDetailReadbackRecovery.ts`, `homeApplyPending.ts`, `homeApplicationArmGate.ts`, `homeFeaturedDetails.ts`: the isolated defensive helpers from the previous staged r109/r114 patches.
- `native/src/lib/durableMutation.ts`: the existing private SecureStore registry accepts an application-kind receipt; only this kind bypasses the normal 7-day expiry, to avoid an unconfirmed submit silently becoming retryable after seven days. Account-deletion and user-scoped purge still apply.
- `native/qa/native-job-detail-readback-authorization.test.mjs`: six focused real-helper behavioral tests.

## Developer matrix — neither OS accepted yet
| Flow | Source / tests at branch | Android rendered & device QA | iOS rendered & device QA | Canonical API save→readback / Web same-state visual |
| --- | --- | --- | --- | --- |
| Job detail → documents → submit | Integrated source candidate, isolated behavior checks | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Closed or unknown vacancy; existing applicant readback | Six Node source-helper cases PASS | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Uncertain RPC outcome, duplicate-submit quarantine and session switch | Prior partial-harness tests; full Native runtime not tested | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Home featured cards and visits, notifications, other complete Web parity | Prior partial r77–r110 patches NOT integrated | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |

## Verifiable test/cost evidence
- Local Node v22.16.0 real-helper test: `node --experimental-strip-types --test native/qa/native-job-detail-readback-authorization.test.mjs`: **6 PASS / 0 FAIL** on helpers matching this commit's Git blob SHAs.
- Prior r109 extracted-Home suite reread this run: `node --experimental-strip-types --test native/qa/native-home-durable-arm-singleflight.test.mjs native/qa/native-home-ambiguous-recheck-integrity.test.mjs native/qa/native-home-pending-lifecycle.test.mjs native/qa/native-closed-saved-job-parity.test.mjs`: **19 PASS / 0 FAIL**, prior isolated partial-tree baseline only; NOT a test against the complete new branch.
- Historical r115 source-extracted job-detail cases 12/12 PASS apply only to the exact new job-detail blob `ba835d...`; they are synthetic and do NOT establish React Native, RPC or OS runtime success.
- Complete Expo `npm ci`, `npm run typecheck`, and all app/OS runtime tests: **NOT RUN**. Direct GitHub DNS and package download unavailable in local Linux. Do not represent syntax-only or isolated helper tests as Expo type success.
- GitHub `.github/workflows/ci.yml`: push trigger limited to `main`; other push workflows limited to `mcp/**`. No PR opened; immediate action-run query at first staging commit returned **0 workflow runs** (not a guarantee about later events).
- Connected Cloudflare account listing showed **0 Pages projects in each of two accessible accounts**; other accounts or external deployment hooks cannot be excluded. No Cloudflare write, build request or Production modification.
- Android SDK/emulator unavailable in this execution environment; iOS simulator/Xcode unavailable (Linux). Signing and iOS TestFlight/ad-hoc distribution authority remain UNVERIFIED.

## Next
Reconcile earlier r77–r110 source patch series against this branch, obtain complete exact-SHA Expo checkout and locked dependencies, fix any full-project TS/regression failures, then run native Android and iOS developer functional/visual and canonical persistence verification. Keep any PR blocked until Actions quota and Cloudflare/external auto-build cost gates are confirmed. Signed Android installable and authorized iOS delivery still required; MASA final device acceptance is a separate step. Do not send real applications or messages.
