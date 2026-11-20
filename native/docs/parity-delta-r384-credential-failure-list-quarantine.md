# COLOR Native r384 — credential failure quarantines retained application/message rows

## Verified source / ownership
- Web source reference: JOBSEEKER /applications and /messages, main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, `src/App.tsx` blob `21bbe8abf51ceee657266ff286593c8af784f399`. Synthetic signed-in candidate A, verified conversations, then manual refresh with either valid pinned session+list error or expired/revoked Clerk pin. Web retention on ordinary failure is source-backed; this security correction does not copy a Web authentication defect.
- Native parent r383 `7451292f0e6322d7c6f8781e65f926ab9b0396f7`. COLOR jobseeker screens and dedicated Native read helper/QA only. No root/native AGENTS.md or open PRs found at preflight. Single writer: this r384 isolated branch; no main/shared backend writes.
- HQ #265 MINIMUM_COST_V1 and #467 accepted requirements preserved. `.github/workflows/ci.yml` triggers on PR/main only; other workflows path-filtered to MCP/HelloWork. Cloudflare Worker trigger reports in prior ledgers conflict (0 vs 1 main-only); no production deployment assumed.

## Defect and bounded change
- Previously, a failed pin/token during application or message manual refresh set `freshlyVerifiedOwner.current = ownerKey` without an authorized pin. That could revive retained private rows and re-enable navigation after a credential failure.
- `readCandidateApplicationIndex` now reports an optional, already verified exact-owner pinned credential before the separate read, without changing the canonical RPC contract.
- On **post-pin list read failure**, same-session previously verified rows may remain visible, but only while the newly pinned session remains current and privacy is allowed.
- On **pin failure, owner mismatch, session revoke or App Lock**, clear the row verification lease and old private rows. Generic owner-scoped error remains visible without minting a private-data lease.
- Message index callbacks now fence pending reads on `privacy.shieldVisible` as well as current generation and session. No applications/messages/scouts are sent, no user privilege, database, RLS or Storage policy changes.

## Web-to-Android/iOS scoped matrix
| Synthetic scenario | Web/source intent | Native source | Android runtime | iOS runtime |
|---|---|---|---|---|
| Verified rows, manual refresh, still-current pin then network list failure | Previously verified rows remain, detail reauthorizes | Retain only same-owner pinned data; show error | NOT VERIFIED | NOT VERIFIED |
| Verified rows, expired/failed Clerk pin | Protected rows must not outlive authorization | Quarantine rows and disable navigation | NOT VERIFIED | NOT VERIFIED |
| Candidate switch/App Lock during pending list | Never disclose previous candidate | Reject stale lease and async callbacks | NOT VERIFIED | NOT VERIFIED |
| Fresh canonical list success | Canonical result overrides cache | Read, verify exact session, replace rows | NOT VERIFIED | NOT VERIFIED |
| First-load error | Error, not fabricated empty list | Owner-scoped generic retry message | NOT VERIFIED | NOT VERIFIED |

## Evidence / remaining gates
- Local Node v22.16.0, real GitHub SHA-matched `candidateApplicationIndexRead.ts` and `privateReadDeadline.ts`: new test showed 3/7 RED before callback, then 7/7 PASS after fix, with no network/API calls.
- Command: `node --experimental-strip-types --test native/qa/native-application-message-failed-pin-r384.test.mjs`; `tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --allowImportingTsExtensions native/src/lib/candidateApplicationIndexRead.ts native/src/lib/candidateVerifiedReadFailure.ts native/src/lib/privateReadDeadline.ts` PASS (focused helpers only).
- Both TSX screen changes require real Expo/Clerk typecheck and installed runtime QA; no Android SDK/emulator, macOS/Xcode/iOS simulator or verified signing/distribution in current Linux environment.
- Real Clerk/Supabase synthetic save/readback and paired Web/Native screenshots remain unverified. No paid CI/EAS, PR, main merge, deployment, real candidate mutation or Store submission; actual billing/quotas unconfirmed.
- Next: canonical synthetic search→save→apply→applications→messages with both-OS installed render QA, then signed Android APK and authorized installable iOS distribution. State IMPLEMENTING, not READY_FOR_MASA_ACCEPTANCE.
