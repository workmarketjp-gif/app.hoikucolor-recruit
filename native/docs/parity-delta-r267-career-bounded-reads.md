# r267 — Career read deadlines, retry and owner-session isolation

**Status:** IMPLEMENTING (source-verified only). **Checked:** 2026-11-15 NZ. **Writer:** COLOR JOBSEEKER Native UI/adapters/regressions.

## Frozen Web / Native reference
- Canonical Web JOBSEEKER `/career` plus the home salary/career panel; repo `workmarketjp-gif/app.hoikucolor-recruit` main `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59` (verified 2026-11-15), `src/views/CareerView.tsx` blob `ed5eac2c1777af12205f1518b747556ea2bb41b2`; authenticated synthetic candidate A, timed-out token, salary market and three-source partial error, session switch to candidate B. No deployed SHA or side-by-side screenshots claimed.
- Native branch `native/color-jobseeker-integration-r216-20261114`, pre-change HEAD `890b15e270557af1add7bd9eb043440ae2bea830`, `native/src/components/CareerExperience.tsx` original blob `9766ae1088ec277b1459bf56e6bfc1fe0812e865`, updated blob `0508de3e623db09ad1f0103a3ff78be73b448b01`.
- Existing `AGENTS.md` absent at repository root and checked Native paths. HQ #265 MINIMUM_COST_V1 applied; common owner/acceptance contract #467 reviewed; no competing open PR for Native paths as of preflight.

## Actual change and behavior
Four Native read flows previously used unbounded `pinCandidateAction()` and canonical reads. A stalled Clerk token or stalled read could leave spinner/loading without an actionable error:
1. Initial career conditions, matching preferences and profile read.
2. Three independent posted salary, official wages and holiday-market reads.
3. Quick salary/holiday scenario job search.
4. Advanced career scenario comparison.

All four now reuse existing `pinCandidateForRead` (bounded token preflight) and `boundedPrivateRead` (bounded read, default 15,000 ms). Only private **reads** are timed out. Existing retry UI and fixed privacy-safe errors can surface after the deadline, with owner/session/generation/App Lock fencing preserved. Market reads remain independent, so successful source sections can display while an unrelated source times out. Late network responses are not cancelled at transport; they must not overwrite the bounded result. No automatic retry, canonical API rewrite or write deadline was introduced; salary/conditions save, delete and canonical post-write readback remain as before.

## Evidence and matrix
- Changed paths: `native/src/components/CareerExperience.tsx`, `native/qa/native-career-bounded-read-r267.test.mjs`, this delta. No shared backend, Web, admin, LP, Store, DB, RLS, Storage, Worker or production release changes.
- GitHub exact blob `2b0a129afd06c6a3db530748108830b4f360ce9c` for new Node test matched the local tested source. `node --experimental-strip-types --test qa/native-career-bounded-read-r267.test.mjs qa/native-career-read-preflight-r265.test.mjs qa/native-career-write-preflight-r266.test.mjs qa/native-career-write-single-flight-r264.test.mjs qa/native-career-mutation-recovery-r263.test.mjs` from `native/`: **34/34 PASS** using exact GitHub helper blobs. New r267 alone **10/10 PASS**. `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions` on unchanged related helpers: **PASS**. Component import/call wiring checked in fetched GitHub TSX; this is **not** dependency-backed Expo/React Native typecheck or screen render.
- Android /career base, market, quick scenario, advanced: **IMPLEMENTING**, source-level read deadline verified; emulator/device UI, native keyboard/text scaling, actual Clerk/Supabase readback and signed APK **NOT VERIFIED**.
- iOS /career same four: **IMPLEMENTING**, source-level read deadline verified; macOS/Xcode/Simulator/physical UI, actual Clerk/Supabase readback and authorized TestFlight/ad-hoc distribution **NOT VERIFIED**.
- Both-OS Web/Native same-synthetic-state visual parity, accessible error/retry, offline/stalled calls and hot/cold session recovery: still open. No READY_FOR_MASA_ACCEPTANCE.

## Ownership, cost, integration and next task
- CI `.github/workflows/ci.yml` triggers `push: main` and `pull_request`, not branch-only push. No open PR at preflight. Cloudflare Workers build for `app-hoikucolor-recruit` is linked to `main`; its explicit Worker triggers list was empty. Development branch only, no PR/merge/main/production, no paid Actions/EAS/agents or real candidate requests. Usage and signing/distribution rights remain unverified.
- Next: dependency-backed Expo full typecheck; run synthetic timed-out token and source read on installed Android and iOS to validate safe error/retry, then compare Web and native screens including keyboard/large Japanese text. Continue other isolated Native parity gaps if local runners remain absent. Do not treat an old APK or the Node tests as release evidence.
