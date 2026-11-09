# Color Native r124 — Home finance/workplace evidence fidelity

2026-11-10 NZ. State: IMPLEMENTING. Repo: workmarketjp-gif/app.hoikucolor-recruit.
Branch: native/color-jobseeker-submission-quarantine-20261110-r116. Base SHA: 8bc7330c57a64cdb017813312a2cf704134e072f.

## Versioned Web reference
- Jobseeker Web src/components/JobCard.tsx blob f352532f4c8c28888f58d47364dd5c1eba044d29: approved workplace ordering,  件の記録.
- Jobseeker Web src/components/VerifiedFinanceSummary.tsx blob e9e3a0f5e055d7d8b0b5163dde7495ce2eac7592: approved seven finance keys, financePriority order, か月分の記録.
- Source inspected 2026-11-10 with synthetic candidate/job fixture. Deployed SHA, screenshots and two-OS same-state comparison remain unverified.

## Closed source-level differences
- Native Home previously alphabetized arbitrary finance fields, showing unrelated/unapproved values and treating finance month samples as generic 件.
- Home now reuses existing Native verifiedEvidence() priority, provenance/allowlist and value validation, and labels finance samples as months. Explicitly conflicting/declared provenance no longer receives a verified badge. The existing verified RPC format with absent per-metric source remains supported.
- No new API, backend, credentials, job claims, navigation or write paths. Job detail logic is reused rather than cloned.
- Base source blob 73066a6689ba6fb764e99d61f45d2ad51cfc0b42, existing verifiedEvidence blob 664a6c0903cfc5f09450b7b48a338882f3337777.

## Real execution evidence
- Node v22.16.0, npm 10.9.2, Git 2.47.3; source blobs reconstructed locally and verified by git hash-object against GitHub before edits.
- Initial focused tests against original source: 0/5 PASS (5 failures reproducing ordering/units/provenance defects).
- After fix: node --experimental-strip-types --test qa/native-job-verified-evidence.test.mjs qa/native-home-evidence-unit-parity.test.mjs : 12/12 PASS; existing jobVerifiedEvidence test blob 02bbc8c7846d7a8a2fbffa482cccceacea4b3fb4.
- Globally installed TypeScript transpileModule parse: 0 syntactic diagnostics for both genuine helper modules. This is NOT project typecheck.
- Local GitHub HTTPS checkout/DNS unavailable; full Expo npm ci/typecheck, rendered Native QA, authenticated canonical API readback and same-state Web visual comparison NOT run.
- Android SDK/emulator unavailable; iOS macOS/Xcode/simulator unavailable. Android signing and iOS distribution authorization not verified; no installable candidates.

## Android/iOS parity status
| Journey | Android source | Android runtime | iOS source | iOS runtime |
| --- | --- | --- | --- | --- |
| Home verified workplace/finance ordering, provenance and sample units | IMPLEMENTING, changed | UNVERIFIED | IMPLEMENTING, shared change | UNVERIFIED |

No PR, main merge, production, DB/RLS/Worker, actual messages/applications, paid Actions/EAS, testers or Store submission. The existing CI runs on main push/PR, not this development branch; Cloudflare external build/billing links are not exhaustively verified.
Next: full locked Expo project typecheck; search→detail→documents→submit→message integration; per-OS rendered and authenticated QA. READY_FOR_MASA_ACCEPTANCE false.
