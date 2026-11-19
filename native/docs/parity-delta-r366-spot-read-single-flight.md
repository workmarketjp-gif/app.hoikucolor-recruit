# COLOR Native r366 — single-flight Spot snapshots on retry/focus

**2026-11-20 NZ | IMPLEMENTING | source-level verification only**

## Ownership and versioned reference
- Sole writer for these files: ChatGPT COLOR JOBSEEKER, dedicated branch `native/color-vault-web-default-r341-20261119`; r365 base `3671942733fd80314f89a50b1edd72aacccc19a5`. No open PRs when checked. No root/native AGENTS.md found.
- Web baseline: candidate `/spot` / `src/views/SpotJobsView.tsx` at main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, fetched 2026-11-20 NZ. Synthetic same-owner network-timeout/retry/focus states, **no** real candidate data or screenshots. Web provides a visible retry and 60-second foreground refresh.
- Native: `native/src/app/spot-jobs.tsx`, `native/src/lib/spotReadSingleFlight.ts`; both OSes share this Expo source. Actual Android/iOS rendering not yet verified.

## Gap fixed in source
- Previously repeated taps of 「もう一度読み込む」, or a visibility-triggered load while an explicit load was still active, could start multiple Clerk pins and concurrent Spot jobs/assignment RPCs; generation guards only discarded stale output **after** requests were launched.
- A candidate/session-scoped read lease now suppresses duplicate loads **before** generation increments, loading state changes or network dispatch. One read's completion only releases its own lease.
- Blur, privacy lock or account switch invalidates that lease. A pending old read cannot clear the newer session's active read; existing generation, owner, privacy, canonical-read and confirmed-application fences remain in force. An old request may still settle remotely; no claim of transport cancellation.
- No application RPC, message, signing, account RLS, schema, Web, Cloudflare Worker or production data changed. No new features or unauthorized server permissions.

## Exact evidence and limits
- Local isolated Linux: Node v22.16.0; npm 10.9.2; global tsc available. Git HTTPS clone remains blocked by DNS. The new helper and executable tests were sourced from this run's isolated files and uploaded as GitHub blobs matching local `git hash-object`.
- `cd native && node --experimental-strip-types --test qa/native-spot-read-single-flight-r366.test.mjs`: **7/7 PASS**, on the real helper from this commit. Covers retries, foreground overlap, blur/refocus, owner switch and stale release.
- `cd native && tsc --noEmit --strict --skipLibCheck --target es2022 src/lib/spotReadSingleFlight.ts`: **PASS for the helper**, not the full Expo app.
- Post-integration fetch verified real screen blob, helper and test from GitHub; **11/11** bounded JS source/wiring assertions passed, including strict ordering of hook declaration before owner-change use, single-flight gate before generation/loading, lease checked on RPC and commit, release/owner invalidation. The dedicated in-repo `native/qa/native-spot-read-single-flight-wiring-r366.test.mjs` was added but **not executed** in the isolated runtime because the full checked-out screen source is unavailable there.
- Implementation commit `40fff1915b2a96d8434ee711acc8c9acd11b00ba`; follow-up screen declaration-order fix/wiring-test commit `4497901636dd3102bb54e04e5762b990bedba7a9`. Current branch HEAD at this report's start `4497901636dd3102bb54e04e5762b990bedba7a9`.
- CI `.github/workflows/ci.yml`: push `main`, `pull_request`; no CI for dedicated branch push. Current HEAD: 0 reported GitHub statuses, 0 PR-triggered runs, 0 open PRs (**not** a CI PASS). Cloudflare `app-hoikucolor-recruit` Worker build triggers: 0 (read-only check).
- Android: SDK/emulator/adb not available; installed render, session/auth, network, readback and signed APK/AAB **NOT_VERIFIED**.
- iOS: Linux lacks macOS/Xcode/simulator; signing/TestFlight/ad-hoc credentials not verified; installed render, session/auth, readback and installable IPA **NOT_VERIFIED**.
- Full Expo dependencies/typecheck, Web↔Native same-synthetic-state rendering, production-equivalent private readback, application→message E2E and MASA physical-device acceptance remain **NOT_VERIFIED**. No blanket screen-capture claim.

## Next and cost
- Run full Expo `tsc --noEmit` plus the new screen-wiring test in an authorized full checkout once dependency access is possible. Then test synthetic candidate Spot retry/focus network behavior, including candidate switch and apply→canonical detail/list→messages; compare rendered Web/Android/iOS in matching states.
- No new paid Actions/EAS/API agents, PR, merge, production deploy, real applications/messages or Store submission. Actual bills/quota unknown. HQ #265 MINIMUM_COST_V1 and #467 acceptance gates unchanged.
- State **IMPLEMENTING**. Cannot mark DEVELOPER_VERIFIED or READY_FOR_MASA_ACCEPTANCE without Android+iOS runtime and signing/distribution evidence.
