# Color Native r172 — restore Scout screen's missing implementation dependencies

- **Reference (Web):** `src/views/ScoutsView.tsx`, `src/lib/scoutInboxRepository.ts`, `src/lib/scoutPrivacyRepository.ts`, Web `main` `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6` (2026-11-12 NZ source check; authenticated synthetic jobseeker).
- **Native starting point:** `native/color-manual-search-button-generation-r171-20261112` at `22e9029ec7ddb9971131b6094ea7debf7a912b84`. Native `native/src/app/scouts.tsx` imports four in-repo helpers which are absent from that source tree despite being referenced by dedicated QA tests. Without them the Scout route cannot resolve its imports in a full module build.
- **Remedy:** materialize the *unchanged, exact* helper blobs from the existing historical `native/color-scout-web-form-inbox-parity-20261106-r30` branch. This is recovery of existing work, not a redesign or new data contract. No Web/API/RPC/DB/production files change.
- **Restored files / known prior Git blob SHA:**
  - `native/src/lib/scoutMutationReadback.ts` — `4de851860f3494c0972e2812718a8f1b8faa8fd5`
  - `native/src/lib/scoutPreferencesReadback.ts` — `f505cd370a4c76580234e86d604c6d526f943160`
  - `native/src/lib/scoutReadLease.ts` — `d50fe0f0bd9216c40764062f3dd85a6bf37fb31b`
  - `native/src/lib/scoutWebParity.ts` — `b2754c0a4287f994ce6ac5d5d0eb532ad75847fd`
- **Local evidence, exact source hash:** all four `git hash-object` outputs matched those GitHub blobs. Node 22.16.0 `node --experimental-strip-types --test qa/scout-runtime-restoration.test.mjs` (temporary isolated test against the exact four source files) **4/4 PASS**: candidate/session lease, canonical scout mutation confirmation, preferences save/readback, numeric/time input safety. `tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler src/lib/scoutReadLease.ts src/lib/scoutMutationReadback.ts src/lib/scoutWebParity.ts` **PASS for those three standalone files only**. `scoutPreferencesReadback.ts` has a type-only import of `candidateParityApi.ts` and was NOT covered by that standalone typecheck.
- **Not verified:** existing full-repository QA suites (including `native/qa/scout-*.test.mjs`), whole Expo/TSX build, Android and iOS runtime, authenticated Supabase save/readback, screenshot/visual QA, native signing or distribution. A missing file is a definite compile blocker, but restoring these four alone does not prove the complete Native app builds.
- **Integration safety:** only isolated Native source and ledger changes. No PR, main merge, Cloudflare/Worker deployment, production data operation, paid CI/EAS, real candidate/scout action, or Store publication.
- **Next:** run the four existing Scout QA test files and whole-program Native typecheck when dependency graph is available; resolve other actual missing imports, then developer test Scout inbox/privacy/form and cross-user isolation on both OSes. Keep candidate-readback and Web parity separate from merely source-restored status.

State: **IMPLEMENTING**, not **DEVELOPER_VERIFIED** or **READY_FOR_MASA_ACCEPTANCE**.
