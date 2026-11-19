# COLOR Native r378 — application-index refresh single-flight without restricting Web navigation

## Web reference and correction to r377
- JOBSEEKER Web `/applications`, `src/App.tsx` main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, blob `21bbe8abf51ceee657266ff286593c8af784f399`, inspected 2026-11-20 NZ. Synthetic user A double-taps manual refresh and receives a network error after previously confirmed application rows. Source/state baseline only: deployed SHA and screenshot NOT VERIFIED.
- The Web renders its existing application cards with `onOpen(app.id)` even if the `applications` resource reports an error; application detail makes its own canonical read/authorization. The earlier isolated **r377 branch** disabled these cards after failed list refresh and would therefore unnecessarily reduce Web functionality. **Do not integrate r377.** It has not been merged, PR-created or released; this r378 branch forks from r376 and intentionally excludes r377.
- This r378 change keeps Web-like stale rows and navigation unchanged. It only suppresses repeated same-frame private list refresh requests, improving predictable UX and minimum-cost RPC use without inventing a result.

## Ownership / implementation
- Existing COLOR writer repo `workmarketjp-gif/app.hoikucolor-recruit`; branch `native/color-application-refresh-single-flight-r378-20261120` based on exact r376 `4ba2bf92dfce5430ce0e0441490658bad79566d6`. No open PR detected before branch work; no root or native AGENTS.md present. MINIMUM_COST_V1 / issue #467 read.
- Added `native/src/lib/applicationIndexRefreshFlight.ts`: synchronous pre-read gate requiring not-pending, current owner key and private access.
- Integrated `refreshPending` ref at `native/src/app/(tabs)/applications.tsx`: acquired before the async Clerk/Supabase read, released only by current generation's finally, or explicitly revoked on focus exit/lock/session replacement. A superseded old request cannot clear a newer read's guard. The existing manual stale-row, error, individual row navigation, pinned session and canonical detail contracts are unchanged. No automatic retries, no backend write.
- No Staff/Family, admin, LP, Hello Work, shared backend, schema/RLS, workers or Production changes.

## Scoped evidence / Android-iOS matrix
- Node v22.16.0 and TypeScript 5.8.3 in isolated Linux directory: `node --experimental-strip-types --test qa/native-application-list-single-flight-r378.test.mjs` **5/5 PASS**; helper-only strict `tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --allowImportingTsExtensions src/lib/applicationIndexRefreshFlight.ts` **PASS**.
- Local/GitHub source blob SHA: helper `4705f32a1b01b6497eb7fc98754bcbefe9f58637`; regression `d221d978709843e37e242a03031855c3a388b063`. Screen blob `7ac7d42f82fd05f857f4fcbefe6e2eff61ab6056` → `e74a72e8311dc04e4c2e8e3129fbc3f3b21b3c22`. Source-level wiring checked by GitHub re-read; this is NOT Expo/React Native runtime QA.
- Android **IMPLEMENTING** — SDK/adb/emulator unavailable; no synthetic canonical E2E, installed UI/render, signed installable build.
- iOS **IMPLEMENTING** — Linux lacks macOS/Xcode/simulator; no installed UI/render, synthetic canonical E2E or authorized TestFlight/ad-hoc.
- Whole app Expo typecheck and dependencies, verified Apple/Android signing/distribution, Web-vs-Native same-state visual comparison and complete search→apply→messages persistent E2E remain unverified. Not DEVELOPER_VERIFIED and **not READY_FOR_MASA_ACCEPTANCE**.

## Cost / release
- GitHub Actions `.github/workflows/ci.yml`: push main and pull_request triggers. Isolated branch only. No PR, main, production, Store, paid Actions/EAS or synthetic user mutation. Cloudflare automatic Git build path not independently rechecked in this run; quotas and actual billing unknown.
- Next: test full Expo project and real canonical synthetic application/message persistence on authorized QA backend, then Android/iOS runtime and signed candidate handoff. Continue safe independent work without changing acceptance conditions.
