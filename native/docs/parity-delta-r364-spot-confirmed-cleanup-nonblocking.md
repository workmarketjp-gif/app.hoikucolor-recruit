# COLOR Native r364 — confirmed Spot navigation is not blocked by local receipt cleanup

**2026-11-19 NZ | IMPLEMENTING | source-level only**

## Ownership and canonical reference
- Single writer: ChatGPT COLOR JOBSEEKER, development branch `native/color-vault-web-default-r341-20261119`; pre-write HEAD `fcad63e1a2a85c179522fdc381d3e79b8d74afa0` (r363), open PR count 0. No root/native `AGENTS.md` found; HQ #265 MINIMUM_COST_V1 and cross-app owner #467 inspected. This is not a claim that no external scheduler exists.
- Web baseline: jobseeker `/spot`, `src/views/SpotJobsView.tsx` from `main` `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c` (2026-11-19), candidate-only synthetic confirmed-application scenario. Web sets the confirmed ID immediately after canonical submission. Browser/deployed and installed Native side-by-side QA **not performed**.
- Native bug after r363: `submitApplication` already verified the candidate-owned canonical application detail, but awaited `clearPendingHomeApplication` on SecureStore before navigating. Storage hanging indefinitely kept the user on the Spot Apply screen despite a successful canonical submission.

## Closed source-level gap
- `native/src/lib/spotConfirmedApplication.ts`: `navigateAfterConfirmedSpotSubmission` starts **one** best-effort local marker cleanup but never awaits its result before routing; handles both asynchronous rejection and synchronous cleanup failure. If candidate/session is stale before cleanup, nothing runs; if changed while cleanup begins, navigation is suppressed. The existing marker remains fail-closed if cleanup fails. The helper never dispatches an application.
- `native/src/app/spot-jobs.tsx`: following canonical submit + guarded confirmation projection, use the bounded-scope helper to navigate to the verified `/application/:id`. No additional list fetch or submit RPC is introduced.
- `native/qa/native-spot-confirmed-cleanup-nonblocking-r364.test.mjs`: 5 behavioral cases for never-settling cleanup, rejected cleanup, stale owner, session switch during cleanup initiation, synchronous storage exception.

## Verification
- Isolated Linux Node v22.16.0/npm 10.9.2 runtime with writable real GitHub-source helper; `git ls-remote` still cannot resolve github.com (the connector supplies source). No fabricated Expo dependencies or stubs.
- `cd native && node --experimental-strip-types --test qa/native-spot-confirmed-detail-navigation-r363.test.mjs qa/native-spot-confirmed-cleanup-nonblocking-r364.test.mjs`: **12/12 PASS** (5 new + 7 existing).
- `cd native && tsc --noEmit --strict --skipLibCheck --target es2022 src/lib/spotConfirmedApplication.ts`: **PASS for helper only**, not Expo app.
- Post-write GitHub helper blob `43f3ce9bdcaa080dccf4cda8753e2461b3e71c57`; test blob `cdd8080a3ed23202fec47b74d6d922732f9c735f` match `git hash-object` on local test files; screen blob `2eab3bfea4c680221d9532c813c473b3b24a8553`, with six direct screen wiring checks passed against GitHub source.
- Web → Android and Web → iOS screenshot correspondence: **NOT_VERIFIED**. Both OS installed runtime tests and actual same-candidate Supabase save/readback: **NOT_VERIFIED**. Android SDK/emulator and macOS/Xcode/iOS simulator absent in Linux. Android signing, iOS signing/TestFlight permissions, and installable artifacts: **NOT_VERIFIED**.

## Cost/release
- `.github/workflows/ci.yml` triggers on `main` push and PR, not this development-branch push. Current open PR count 0; Cloudflare account's `app-hoikucolor-recruit` Workers Build Trigger GET returned empty array immediately before editing. No new Actions/EAS job, PR, main merge, backend/DB/RLS, Workers production release, Store submission, or real candidate action was intentionally triggered. No claim about billable amounts or remaining allowance.
- Next: obtain full Expo dependencies/checkout for full `tsc --noEmit` and rendered QA, then use a synthetic account to verify Spot application -> canonical application detail/list -> messages and Web reconciliation on both OSes. Investigate whether an in-flight quiet Spot refresh can overwrite newly confirmed local proof; do not mask true authoritative revocation.
- State remains `IMPLEMENTING`, **not** `DEVELOPER_VERIFIED` or `READY_FOR_MASA_ACCEPTANCE`.
