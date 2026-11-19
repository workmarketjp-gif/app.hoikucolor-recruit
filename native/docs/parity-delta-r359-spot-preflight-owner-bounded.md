# COLOR Native r359 — bounded Spot application preflight and owner proof

**State:** IMPLEMENTING. **Date:** 2026-11-19 NZ. Source-level integration only; Android/iOS rendered QA and signed acceptance builds NOT VERIFIED.

## Source, owner and frozen reference

- Single writer: ChatGPT COLOR JOBSEEKER Commander, branch `native/color-vault-web-default-r341-20261119`, starting HEAD `f3e0d771e6702c966000ce4f427996eefaad549f` (r358). Open PRs 0 at read. No root/nested `AGENTS.md` in current repository tree. HQ #467 and #265 MINIMUM_COST_V1 read. No shared Web/API/schema write.
- Web comparison baseline carried forward from r358: candidate Web `/spot`, `src/views/SpotJobsView.tsx`, main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, file blob `aa395794adde80d42d3b0c3c8425ee1744d7974e`, inspected 2026-11-19. Reference state is synthetic authenticated candidate with application action. This run did not capture Web rendered pixels or assert current live deployment SHA.
- Native files: `native/src/lib/spotApplicationPreflight.ts`, `native/src/app/spot-jobs.tsx`, `native/qa/native-spot-application-preflight-r359.test.mjs`.

## Concrete gap closed at source level

Previously, Spot `apply` awaited both Clerk `pinCandidateAction()` (including `getToken`) and `getJobseekerProfile` without a deadline before arming the existing r358 durable pending marker. An indefinitely pending **read-only** prerequisite left the button at `応募中…` forever. It also trusted the returned profile without independently matching its `clerk_user_id` to the pinned candidate ID.

The screen now uses `readSpotApplicationPreflight` to:
1. Bound only the pre-submit Clerk pin and candidate profile RPC to existing 15-second read deadlines, with a second gate immediately before either read.
2. Check pinned candidate + exact session against the displayed owner, verify profile `clerk_user_id` against the pinned candidate, and reject screen/account/stale responses.
3. Preserve the genuine null-profile navigation to the existing profile editor. Never treat a rejected or timed-out profile RPC as a missing profile.
4. Keep the application **mutation outside** both deadlines. r358 durable single-flight arm and uncertain-commit quarantine, server authorization and canonical `submitApplication` are unchanged. No automatic retry or duplicate submit.

## Parity delta

| Workflow | Web baseline | Android Native source | iOS Native source | Android runtime | iOS runtime | Canonical live Web/readback |
| --- | --- | --- | --- | --- | --- | --- |
| SPOT-PREFLIGHT-01: apply prerequisites | Candidate `/spot` requires an authenticated profile | Deadline-bounded token and profile read; exact owner verification | Same TS source | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| SPOT-PREFLIGHT-02: late/stale/failed read | Failure cannot prove application or missing profile | No submit on timeout, rejection, account switch or wrong owner; explicit error | Same TS source | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| SPOT-SUBMIT-01: actual application | Existing canonical submit flow | r358 durable arm + `submitApplication` retained | Same TS source | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |

## Real test and code provenance

- Node v22.16.0 / npm v10.9.2 / TypeScript 5.8.3 in isolated Linux source directory.
- `node --experimental-strip-types --test qa/native-spot-application-preflight-r359.test.mjs qa/native-spot-application-dispatch-r358.test.mjs`: **17/17 PASS** (11 new preflight cases plus six existing dispatch cases), deterministic synthetic identity/data only.
- `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions src/lib/spotApplicationPreflight.ts`: **PASS**, helper and its two real import dependencies ONLY. No fake stubs; Expo-wide `tsc` NOT RUN.
- GitHub re-read blob SHA equals isolated tested real source: helper `ac0f0a5b9e6dece3dc3ee222bb03dd4fa66ca32e`, regression `cd86a5d59fe9dc772850b8b9fa1a33d8c4c8b489`; screen `a73400ee6a4741cb71f907085f4be069e3e34b4d` passes exact static wiring checks. Static checks are NOT a rendered Native test.
- Commits: helper `d03c88d507b2961f0f0cf2a19401bdfa8fbf28e9`, test `f43606c88d9876558513c186a3cf5b8d3360f373`, screen `bd2f0b78489eafc6c180067a4573a16406b41fe0`.
- No complete Expo checkout (container GitHub DNS failure). Android adb/emulator/SDK unavailable. Linux has no Xcode/iOS Simulator; Android signing and iOS authorized distribution/unexpired identities not verified. No physical-device QA, no installed candidate on either OS.

## Safety and cost boundary

- CI `.github/workflows/ci.yml` has main-push and pull_request triggers; this branch direct push did not request Actions. Cloudflare `app-hoikucolor-recruit` Git build trigger branch allowlist is `main`, and the branch-specific Preview `0b6812dd43dd4b9ba55856bf6b604198` was read as `auto_build=false` immediately before writes. No CI dispatch, new paid build, PR, main, backend, production or Store action initiated.
- Actual GitHub/Cloudflare billing/quota remains unverified. A direct GitHub source commit is NOT a signed candidate or production release.
- Next: obtain a full authorized Expo checkout; run `native/npm ci` and `npm run typecheck` before device testing. Then use synthetic accounts for Spot preflight timeout, owner switch, profile save/readback, submit-to-application and Web correspondence on Android and iOS separately. Verify installation/signing distribution authority before proposing acceptance.
