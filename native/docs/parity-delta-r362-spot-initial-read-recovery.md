# COLOR Native r362 — Recover Spot after an initial failed read

**2026-11-19 NZ | IMPLEMENTING | COLOR jobseeker only.** This is source-level parity, **not** Android/iOS runtime acceptance.

## Ownership and frozen reference
- Repo: `workmarketjp-gif/app.hoikucolor-recruit`; single COLOR development writer on `native/color-vault-web-default-r341-20261119`. Base HEAD `3b7086ca3df66e433aa8add4374834b56196ad7f` (r361). Open PR search: none. `.github/workflows/ci.yml` triggers on `main` push and PR, not branch push. Cloudflare `app-hoikucolor-recruit` build triggers API returned `[]` before updates. No auto-merge, force-push or main/production write.
- Web source baseline: `src/views/SpotJobsView.tsx` on `main`, blob `aa395794adde80d42d3b0c3c8425ee1744d7974e`, inspected 2026-11-19, candidate role, `/spot`. Web retries a failed visible read on the next visible window event / 60-second cadence. Native `spot-jobs.tsx` at r361 only refreshed with a verified snapshot; therefore an initial read failure could not recover automatically.
- No deployed Web SHA / paired synthetic screenshots available. Web behavior is **source** reference only.

## Closed gap (source)
- `native/src/lib/spotForegroundRefresh.ts`: allow a quiet refresh for an *explicitly failed first read*, only if the recorded failure owner equals the active session owner and there is no contradictory verified snapshot. Existing refresh remains allowed for a verified same-owner snapshot. Foreground, privacy lock, read-in-flight and submit-in-flight gates remain mandatory.
- `native/src/app/spot-jobs.tsx`: record failed read owner only for a currently authorized explicit read failure; clear on account switch, lock, blur and explicit retry. A confirmed quiet recovery clears only a corresponding **read** error, preserving an uncertain application-submission warning. Verified jobs/assignments remain canonical. No new dispatch or automatic application retry.
- `native/qa/native-spot-initial-failure-foreground-recovery-r362.test.mjs`: 11 behavioral cases for initial recovery, verified refresh, no initial failure, owner handoff, signed-out, lock, background, concurrent read/apply.
- Status: **source-level behavior implemented on common Android/iOS TypeScript**. Not developer-verified on either OS.

## GitHub provenance and actual checks
1. Helper commit `956fb6696ea656e667bd2388d7af7050290ae80d`, blob `f24eb614d9e12d3cee2797e23f000c8bbc6736bb`.
2. Screen commit `d6e090f7a8f12e65f92dbca742f41b6db6dcb287`, blob `1cc5c204bb137a7834b9b7cedd3092d0d5e5da77`.
3. Regression commit `5fcf92297bb139ad501b553218f43e781e759a94`, test blob `db82697c817cb18695ec1cd05b0c0b03cabf67f7`.
4. Executed in isolated Linux Node 22.16.0 / TypeScript 5.8.3 on files independently hashed identical to GitHub blobs: `cd native && node --experimental-strip-types --test qa/native-spot-foreground-refresh-r361.test.mjs qa/native-spot-initial-failure-foreground-recovery-r362.test.mjs` → **20/20 PASS** (prior r361 test blob `d4b08ff0fa316c043a9c52c2f82a33664a78526e`). `tsc --strict --noEmit --skipLibCheck --target es2022 --module esnext src/lib/spotForegroundRefresh.ts` → PASS **only for this helper**.
5. Post-integration GitHub source re-read: both blobs and test blob matched; seven screen wiring/protection source assertions passed. Full Expo dependencies not installed, entire app typecheck **NOT RUN**. No fabricated framework stubs. Branch SHA was `5fcf92297bb139ad501b553218f43e781e759a94` before writing this ledger.
6. GitHub combined statuses 0 and PR-triggered workflow runs 0 on regression SHA. Neither count proves full CI success.

## Android / iOS / persistence evidence
| Gate | Android | iOS |
| --- | --- | --- |
| Common Native source, scoped Node test | PASS (platform-neutral code only) | PASS (platform-neutral code only) |
| Installed rendered UI, safe-area/keyboard, long labels, accessibility screenshots | NOT VERIFIED: no Android SDK/emulator | NOT VERIFIED: no macOS/Xcode/simulator |
| Synthetic candidate canonical Supabase save-readback, Web correspondence, session handoff | NOT VERIFIED | NOT VERIFIED |
| Developer-signed installable artifact / identity | NOT AVAILABLE | NOT AVAILABLE: no approved signing/distribution route |

## Cost and next gate
No new GitHub Actions, PR, EAS, Worker publish, database/auth/RLS/Edge change, real candidate data/application/message, Store submission, or cross-task write. Actual billed spend and remaining quota unknown.
**Next independent priority:** verify the new initial-failure recovery and later uncertain-submission warning on a complete Expo runtime, then verify synthetic Spot→application list/detail→message readback and screen parity on both OSes. A full dependency checkout (GitHub DNS unavailable in this Linux session), Android runner, and authorized macOS/Xcode + iOS signing route are the minimum execution gates. Do not mark `DEVELOPER_VERIFIED` or `READY_FOR_MASA_ACCEPTANCE` before real two-OS evidence.
