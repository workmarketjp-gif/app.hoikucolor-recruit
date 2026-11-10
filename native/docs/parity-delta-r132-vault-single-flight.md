# Hoiku Color Native r132 — single-flight vault actions

Date: 2026-11-10 NZ. State: **IMPLEMENTING**. Scope: COLOR jobseeker Native UI helper and regression only.

## Provenance and exclusive edit boundary

- Existing source branch: `native/color-apply-locked-document-type-r131-20261110`, base `1ebe403cfd7663d088157d8008005f8896ec132a`; isolated branch `native/color-vault-single-flight-r132-20261110`.
- Default `main` was `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`. No open PRs at preflight. Other `native/color-apply-vault-recovery-r131-20261110` is **diverged** and left untouched; reconcile before any integration.
- Root `AGENTS.md` not present (404 at base). HQ #467 and #265 MINIMUM_COST_V1 read.
- Web baseline: current `main` SHA above, authenticated synthetic jobseeker; application document selection `src/components/ApplyDocumentsStep.tsx`. This patch addresses a Native-specific double-tap/race, not a claimed Web pixel comparison or a changed Web contract.

## Gap addressed in code

Before React commits `busyId` and disables controls, two rapid OS tap events could both start an upload/camera picker or other vault action. The vault's prior `busyId` guard alone is asynchronous. A delayed completion from a previous owner could also clear the busy indicator for a newer action.

- Added synchronous, monotonic token lease for vault operations; no second operation can start while one is acquired.
- Wired five existing action handlers: file picker/upload, camera/permission/upload, signed private file open, set default, delete. Lease releases in each `finally` and is reset on Clerk owner or privacy-boundary change. A stale completion cannot release a newer lease.
- Existing canonical APIs/RLS, explicit document IDs, private cache cleanup, labels and design remain unchanged. This adds a local interaction guard; **it does not prove** OS tap behavior or actual duplicate server writes.

## Focused verification (only claims supported by evidence)

- Local Node v22.16.0: `node --experimental-strip-types --test --test-name-pattern='double tap|stale completion|unmatched operation|cancel/rejected picker' qa/native-vault-operation-lease.test.mjs` on actual new helper code: **4/4 PASS**.
- Global TypeScript: `tsc --strict --noEmit --target ES2022 --module ESNext src/lib/vaultOperationLease.ts`: PASS (helper only). This is **not** Expo project typecheck.
- GitHub readback verifies helper blob `d1248309b73f8d7964d3a9ba734e9643cb283fd1` and test blob `0394688de5126c6e2d671c128b9261c045a2516b` equal local `git hash-object`; UI blob `0e5582b08e65a67ad69232c774e7891c4b344e3a` contains one reset and five acquire/release pairs.
- New TSX wiring test in `qa/native-vault-operation-lease.test.mjs` **not executed in a full checkout**. Attempting the entire test locally failed ENOENT because the GitHub connector has source access while the container only has an isolated helper/test subset; do not count this as PASS.
- No dependency install, Expo typecheck, Native render, actual API write/readback or signed artifact. Direct `git ls-remote` from Linux failed DNS resolution for github.com. No substitute stub used.

## Incremental Web → Native matrix

| Path | Code status | Android Native runtime / screenshots / API | iOS Native runtime / screenshots / API |
| --- | --- | --- | --- |
| File picker or camera invoked twice rapidly | Synchronous single-flight lease wired; helper PASS | NOT VERIFIED | NOT VERIFIED |
| Document open / default / delete while another action runs | Same lease wired; TSX source inspected | NOT VERIFIED | NOT VERIFIED |
| Account switch / App Lock while action completes | Old lease invalidated in helper; owner-guard code preserved | NOT VERIFIED | NOT VERIFIED |
| Search → detail → document upload → apply → message canonical E2E | Existing flow; no E2E claim in this run | NOT VERIFIED | NOT VERIFIED |
| Signed installable handoff | NOT READY | No verified APK | No verified TestFlight/ad-hoc delivery |

## Release and cost boundaries

`.github/workflows/ci.yml` triggers on `main` push and PR; isolated branch only, no PR/merge. No explicit workflow dispatch, Actions rerun, EAS, production write, real application/message, Cloudflare deployment or Store submission. Additional CI usage observed in this run: none initiated; connected Cloudflare/GitHub billing/other triggers not fully audited, so zero cost is **not** asserted.

Next: reconcile the divergent r131 vault-recovery branch with the same-path owner before integration; use an authorized full Native checkout to run all five tests and `npm ci && npm run typecheck`, then complete synthetic Android/iOS canonical document apply/readback and Web visual QA. Signing/distribution and both platform runners remain external gates.
