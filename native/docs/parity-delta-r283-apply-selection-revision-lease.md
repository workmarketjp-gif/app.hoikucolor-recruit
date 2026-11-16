# COLOR Native r283 — final apply selection revision lease

- Repository: `workmarketjp-gif/app.hoikucolor-recruit`, single COLOR writer branch `native/color-jobseeker-integration-r216-20261114`.
- Parent HEAD: `741fcd320768f296885f8a793770351318c4013c`. Web reference: `src/components/ApplyDocumentsStep.tsx` at `main 5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`, jobseeker, synthetic required-resume + optional-license state; 2026-11-16 source inspection.
- Native counterpart: `native/src/components/ApplyDocumentsPanel.tsx`. This is an additional conservative client safety gate, not a new Web feature or changed backend authority.

## Fixed implementation race
The existing r282 fresh requirements/vault check could run while an embedded vault reload/upload changed the displayed files, or a radio choice changed during the asynchronous preflight. A successful readback could still dispatch the previous selection. The panel now increments an immediate revision on vault status/data changes, radio selection, opening/closing a vault row and owner reload/lock. The final read wrapper checks that revision and pinned session before/after I/O; a changed selection cancels that submit and explicitly tells the candidate to review and tap again. The parent job detail has its own synchronous apply-in-flight lock and canonical prewrite checks; this change does not bypass them.

## Evidence and gates
- Node 22, dependency-free *actual source* tests: the new six async revision/readback scenarios plus the existing r282 six => 12/12 PASS.
- Android rendered QA and canonical API save/readback: NOT VERIFIED.
- iOS rendered QA and canonical API save/readback: NOT VERIFIED.
- Expo SDK-wide typecheck and signed Android/iOS builds: NOT VERIFIED (SDK, Xcode, signing/distribution unavailable).
- Push only to isolated Native dev branch (no PR/main, production Worker, Supabase/RLS, paid Actions or EAS); Actions triggers main/PR in `.github/workflows/ci.yml`. Cloudflare Git auto-build settings and paid quota remain unverified.
- Next: full SDK typecheck and two-OS synthetic search → job detail → documents → application → message QA, then safe signed builds.
