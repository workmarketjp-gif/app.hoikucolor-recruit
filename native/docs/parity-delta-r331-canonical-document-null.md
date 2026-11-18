# r331 — Private application-document list reads reject ambiguous empty responses

**Date:** 2026-11-18 NZ. **Ownership:** COLOR JOBSEEKER Native adapters / focused regressions.
**Baseline:** existing Web jobseeker `/applications` → `ApplicationMessages`, Web main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`; Native parent/detail/apply vault reads, source inspected at COLOR branch `9c714d43df2669c10d5d9267bb628b40a3769866`. Synthetic three-source application states; no actual device or Web screenshot comparison.

## Closed source-level ambiguity

Three Native canonical Supabase list adapters treated `data: null, error: null` as `[]`: `listJobseekerDocuments`, `listApplicationDocumentExpectations`, `listSubmittedApplicationDocuments`. In an unverified read response that could erase a saved-vault view, submitted-copy list, or required-document status as if the candidate had no documents. Those three adapters now accept only an array (a genuinely empty `[]` remains valid) and throw a fixed Japanese read-recovery error otherwise. The existing caller / three-source snapshot already withholds actions after failed reads; no data is mutated, no retries are added, and no private server payload is interpolated into the error.

No changes to orphan reconciliation, delete/write paths, public site, auth, RLS, Storage, DB, edge functions or application sending. A Web-origin ambiguity must be handled by its independent owner, not reproduced intentionally.

## Local scoped QA and remaining acceptance

`node --experimental-strip-types --test native/qa/native-document-vault-canonical-rows-r331.test.mjs` **13/13 PASS** on the actual new helper source. `tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler native/src/lib/canonicalDocumentRows.ts` **PASS**, helper only. GitHub adapter three-site wiring is source-checked; complete Expo TypeScript check and native runtime were not available in this Linux environment. Do not treat the focused tests as an Expo/framework build.

**Android:** IMPLEMENTING — no installed/emulator read-failure UI, canonical save/readback or signed candidate. **iOS:** IMPLEMENTING — no Simulator/installed read-failure UI, canonical save/readback or authorized TestFlight/ad-hoc candidate. Next independent QA: valid `[]` vs unexpected null returned by actual canonical API under synthetic candidate, plus error presentation on both installed OSes and Web parity.
