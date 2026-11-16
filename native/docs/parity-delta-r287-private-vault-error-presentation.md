# COLOR Native r287 — private vault error presentation

- Date (NZ): 2026-11-16. COLOR JOBSEEKER Native owner; branch `native/color-jobseeker-integration-r216-20261114`, parent `b65e96b0790cc80f2c34e1e3a375b9f0da3bc157`. In scope: candidate private document vault UI, no server or Web changes.
- Web baseline: candidate Web document vault/recruit workflow `src/lib/documentVaultRepository.ts` and `src/components/ApplyDocumentsStep.tsx` at `main 5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`; synthetic candidate+PDF. Native privacy behavior hardening, no product feature removed.
- Gap: seven `DocumentVaultSection` error alerts inserted arbitrary SDK/Storage/RPC error.message (and therefore potential Clerk IDs, file paths, signed URLs, bearer strings) into rendered alerts.
- Fix: all seven alerts now pass unknown causes through `presentDocumentVaultError`, with operation-specific retry/review guidance. Three exact internal file-type/file-size/magic-validation messages remain actionable for file preparation/upload/camera; all other error text is suppressed. Existing ambiguous-write canonical reload and successful operations remain unchanged.
- Focused source tests: `cd native && node --experimental-strip-types --test qa/native-vault-error-presentation-r287.test.mjs qa/native-apply-vault-busy-fence-r286.test.mjs` — 15/15 PASS, Node 22. Synthetic-only. Git blob hashes of both QA source and implementation matched the tested local files before branch update. Full Expo typecheck and installed runtime QA NOT VERIFIED.
- Android: UI source only, no SDK/emulator/real render, no canonical API persistence proof or signing.
- iOS: UI source only, no macOS/Xcode/simulator/real render, no TestFlight/ad-hoc entitlement proof.
- Budget and release: push on existing nonmain development branch only; GitHub main/PR workflows and Cloudflare Worker branch trigger limited to main, no PR/main or production changes, no paid builds requested. Additional quota unknown.
- Next: end-to-end Web/candidate state → Android/iOS Native render → canonical readback of job detail, documents, application, messages, and safe signed test builds.
