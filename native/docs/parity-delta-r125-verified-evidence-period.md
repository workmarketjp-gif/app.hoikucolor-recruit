# Color Native r125 — verified evidence period integrity

Date: 2026-11-10 NZ. State: IMPLEMENTING.
Repo: workmarketjp-gif/app.hoikucolor-recruit
Single-writer branch: native/color-jobseeker-submission-quarantine-20261110-r116
Parent: 0b93025f0e8f214807e9b458514379b9723e102d

## Web/Native baseline and scope
- Jobseeker Web reference: src/components/JobCard.tsx blob f352532f4c8c28888f58d47364dd5c1eba044d29 and src/components/VerifiedFinanceSummary.tsx blob e9e3a0f5e055d7d8b0b5163dde7495ce2eac7592, synthetic candidate fixtures; deployed SHA/rendered screenshot not verified.
- Native baseline: native/src/lib/jobVerifiedEvidence.ts blob 664a6c0903cfc5f09450b7b48a338882f3337777 and native/qa/native-job-verified-evidence.test.mjs blob 02bbc8c7846d7a8a2fbffa482cccceacea4b3fb4.
- Corrects malformed but calendar-impossible source dates (e.g. February 30), reverse-ordered months and fractional verified metric totals being shown as credible evidence in Native job detail. Invalid periods are suppressed, not fabricated; genuine leap dates and verified metrics remain visible.
- Home's existing disclosure logic is unchanged; the shared verifiedEvidence() parser now enforces its calendar/integer checks consistently. Backend/RPC/RLS, other owners' files and user data are unchanged.

## Reproducible focused evidence
- Node 22.16.0 using real original Native helper/test files reconstructed from GitHub-matching r124 evidence: `node --experimental-strip-types --test qa/native-job-verified-evidence.test.mjs qa/native-home-evidence-unit-parity.test.mjs`.
- Before change: 12 PASS, 3 FAIL (new tests catch fractional totals, impossible dates, reversed periods).
- After change: 15 PASS, 0 FAIL. Current source blob 20691ac0e736848ed11bad3f52d3be74d54928aa; test blob 51fa8750ff55710ecd9e9e6d912a1532ee2751a0. Both GitHub blobs independently matched `git hash-object` before ref update.
- TypeScript compiler transpile syntax diagnostics: 0 for changed helper and existing home helper, NOT Expo project typecheck.
- No Android SDK/emulator nor macOS/Xcode/iOS simulator; no signed Android APK, iOS distribution, rendered two-OS QA, authenticated canonical API write/readback or physical-device acceptance.

## Parity delta and next gate
| Journey | Android source | Android runtime | iOS source | iOS runtime |
| --- | --- | --- | --- | --- |
| Job detail verified evidence period and count display | Source fix and focused Node test | NOT_VERIFIED | Shared source fix and focused Node test | NOT_VERIFIED |

Remaining: locked Expo `npm ci` + project typecheck, real cross-OS rendering, authenticated end-to-end search->detail->documents->apply->message, signing/distribution.
This is not DEVELOPER_VERIFIED or READY_FOR_MASA_ACCEPTANCE. No new paid build, Actions, EAS, production change, actual job application, chat, Store submission, auto-merge or invitation. GitHub workflow ci.yml targets main pushes and pull requests; branch-only commit does not request those; connected Cloudflare accounts have no Pages projects, external Git integration/billing unverified.
