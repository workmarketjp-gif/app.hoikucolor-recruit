# Hoiku Color Native r141 — application document handoff and messaging Web parity

2026-11-11 NZ | IMPLEMENTING; source implementation only, not two-OS developer verified.

## Versioned Web source and writer

- Web source: `src/components/ApplicationMessages.tsx`, blob `6275c5e50c3f67eea58a2ecb53d6b984fd34a497`, repository main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, inspected 2026-11-11 NZ. Candidate account, one synthetic authorized application, one vault document already submitted, another missing and one expired former source. Source only; no Web screenshot.
- Native branch: `native/color-application-documents-web-parity-r141-20261111`, created from r140 HEAD `5cf002895989778aa0e92d90eec7190a0881ff18`. Sole writer for Color Native paths. Open PR search returned 0 before writes. No main write, force-push, shared backend/schema/auth/RLS/Worker or real candidate interaction.
- Scope: `native/src/components/ApplicationDocumentsSection.tsx`, `native/src/lib/applicationDocumentsPresentation.ts`, `native/src/app/application/[id].tsx`, dedicated Node test and source-wiring contract.

## Material Web-to-Native gaps addressed in source

- Previously Native application detail showed only a missing-document repair warning; Web provided a complete **応募書類** section with saved vault documents, per-document `この応募に提出`, confirmed/submitted state, batch missing-expectation repair, submitted-copy list and signed private preview. Native now exposes those interactions directly inside the existing application/message card without escaping to a Web page.
- Reuses existing candidate-scoped Supabase read/write APIs, pinned Clerk owner+session and App Lock-aware subtree. Source document submission must be confirmed by **application-specific canonical readback** before `提出済み` or success appears. Ambiguous readback clears the UI and requires manual refresh, not an automatic duplicate write. Prevents duplicate taps/overlapping source submissions and starting another write after session revocation. React StrictMode mount-replay restores the local view lease rather than permanently disabling private readback. Submitted-copy opening uses the existing HTTPS-only signed-URL helper.
- Web-equivalent missing expectation projection distinguishes repairable missing sources from deleted/former sources; presenting a saved document does **not** count as verified qualification or authorized facility access.
- Message composer now shows Web's `メッセージ` label, placeholder `園への質問や日程の相談など`, `n/4000`, `送信する` and complete empty-state copy, retaining existing durable send/ambiguity recovery.

## Tests — scope-limited, exact provenance

- Local Node 22.16.0 and TypeScript CLI: `cd native && node --experimental-strip-types --test qa/native-application-documents-presentation.test.mjs` — **6/6 PASS** against exact GitHub helper blob `1e846035e9e0b384d9f60a5e4b335652b3a6410f` and test blob `1f5adf528facc3c3ce7fada9cc6d0152448c72ac`. Tested local files have identical Git blob hashes.
- `tsc --strict --noEmit --target ES2022 --module ESNext --moduleResolution bundler src/lib/applicationDocumentsPresentation.ts`: **PASS**, pure helper only.
- Connected-GitHub static wiring assertions **13/13 PASS** on new component blob `3cf43a64dc1d7a012ed2117caf0c428ecd51163d` and screen blob `0f4eac9f3dc5cd2d50e0a713ab33ceb7044cc35e`; static review only. `native-application-documents-web-parity-contract.mjs` is committed for the normal Native contract runner, but **not executed locally**.
- Full lockfile-backed Expo `npm run typecheck`, mounted React Native component tests, canonical authenticated API save/readback, Android emulator and iOS simulator rendered parity remain **NOT RUN / NOT VERIFIED**. Do not infer type success or app behavior from helper tests. Linux git HTTPS still fails DNS; current runtime has Node/npm but no full source checkout or Expo dependencies. Android SDK/adb/emulator and macOS/Xcode/iOS simulator unavailable. Signing, app build identity, and authorized TestFlight/ad-hoc distribution not verified.

## Next gate and budget

- With an existing authorized full checkout and locked dependencies: run exact-head `npm run typecheck`, Node document wiring contract and targeted component behavioral tests, then synthetic-only canonical applicant A/B + App Lock + document submission/readback/open and messages on Android and iOS independently. Examine Web same-state mobile render and compare visually. Confirm that external OS document viewers meet privacy expectations; do not assert screen-capture prevention beyond verified surfaces.
- Signed Android APK/AAB and authorized iOS installable TestFlight/ad-hoc artifacts remain **NONE**. No new paid Actions/EAS/API, PR/main/production change or store action was authorized or initiated in this branch-only run; CI `.github/workflows/ci.yml` triggers on main pushes or PRs, not this feature branch. Cloudflare and external account charges/remaining quota not fully observable. No user/customer document was accessed or sent.

Do not set READY_FOR_MASA_ACCEPTANCE; both platform developer QA and distribution gates remain open.
