# COLOR Native | private document canonical readback integration (r352)

Owner: COLOR JOBSEEKER / branch `native/color-vault-web-default-r341-20261119`. Reference: jobseeker Web `/profile` document vault, `src/lib/documentVaultRepository.ts`, baseline main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`; candidate role, synthetic document state. Verified source comparison: 2026-11-19 NZ. No Web visual capture or live-user data.

| ID | Web action / contract | Native integrated behavior | Android | iOS | Canonical persistence |
| --- | --- | --- | --- | --- | --- |
| JS-VAULT-READBACK | Change default file and re-read candidate-scoped document list | Reject duplicate IDs and >1 default of same document type, allow another document type to have its own default | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED (synthetic source tests only) |
| JS-VAULT-DELETE | Delete a private document with Storage/RPC response ambiguity | Authoritative owner-scoped finalize=true takes precedence over a lost Storage.remove response. Unconfirmed states never claim deleted or promise a safe automatic retry | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED (no real Supabase calls) |

Integration chain: `r346` source + dedicated regression at commit `178b5db339d5e4ec03d9cf5d6d7251ce955abf4a`. `r345` finalization guard + dedicated regression integrated in the subsequent commit recording this ledger. This supersedes the **unintegrated r344** proposed behavior; do NOT apply r344.

Evidence: Linux Node v22.16.0 `node --experimental-strip-types --test qa/native-vault-mutation-unique-readback-r346.test.mjs`: 16/16 PASS; `node --experimental-strip-types --test qa/native-vault-delete-authoritative-finalize-r345.test.mjs`: 12/12 PASS. Executed on previous source-backed package; source/test Git blobs verified in the commit operation. NOT a full Expo install/typecheck or device run. Android emulator/SDK, macOS/Xcode/iOS simulator and signed distribution NOT AVAILABLE/NOT VERIFIED.

No changed shared backend, production RLS, real candidate messages, PR or main. GitHub branch-specific push is outside main-only CI; Cloudflare dedicated Preview auto_build=false was confirmed in prior r351, costs/quotas UNKNOWN. Remaining vault work: r343 fresh replacement pre-write, r347 exact upload confirmation, r348 canonical action guard; all unintegrated. Web vs Android and iOS rendered QA, canonical readback, full Expo build and accepted signed candidates remain blockers.
