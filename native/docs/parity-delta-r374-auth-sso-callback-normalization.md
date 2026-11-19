# COLOR Native parity delta r374 — OAuth callback with normalized trailing slash

## Reference, ownership and fixed synthetic state
- Repo: `workmarketjp-gif/app.hoikucolor-recruit`; single isolated writer on `native/color-auth-sso-callback-normalized-r374-20261120` based on r373 exact SHA `d4925da23e548520d389ad868cf812a160897110` (2026-11-20 NZ). No open PRs at preflight; main remains `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`.
- Web JOBSEEKER baseline: current `main` `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, `src/components/CandidateShell.tsx`; authentication/routes in `src/App.tsx` per r373 baseline, read 2026-11-20. Deployed SHA and Web/Native screen captures not authenticated this run. Confirmed mobile primary five: ホーム / 求人を探す / お給料 / 気になる / マイページ, with 応募管理 and メッセージ as secondary destinations, not replacing the current Web product navigation.
- Native reference: `native/src/components/AuthScreen.tsx` uses `AuthSession.makeRedirectUri({ scheme: 'hoikucolor', path: 'sso-callback' })`; `native/src/lib/authInitialLinkReturn.ts` retains the pending private link through signed-out OAuth. Synthetic initial intent: `hoikucolor://application/f27bc132-ced7-4bda-a4de-f81580385e77?focus=messages` (synthetic UUID, no real candidate). OAuth callback variants use synthetic state/code only.

## Confirmed source-level defect and fix
- Baseline r373 callback matcher recognized `hoikucolor://sso-callback?...` and `hoikucolor:///sso-callback#...` but **not** equivalent callback URIs with one trailing slash, such as `hoikucolor://sso-callback/` and `hoikucolor:///sso-callback/?code=...`. Thus receiving one while signed out invoked `rememberSignedOutCandidateLink`, which replaced the previously saved application link with `null` before post-login resume.
- The exact callback predicate now tolerates **one** optional trailing slash before query/fragment/end. Lookalike route names, extra separator paths and external URLs still invalidate old private return hints; only exact OAuth callback URLs are ignored. Existing application, message and candidate authorization is untouched. This hardens URI normalization; actual frequency of slash-normalized callbacks on devices is **not yet established**.
- This is a common-source fix for Android and iOS; it does not establish runtime functionality, rendered parity, canonical Supabase readback, or Store readiness. No privileged API, production DB/RLS/Worker/Clerk change.

## Local real-source test evidence
- Code and regression test directly used GitHub r373 helper blob `89add4d951fdbf5d6963e454e4e3154db586b283`, and prior r370–r373 evidence tests/screen entry source. No mock package shim or fabricated runtime. Node v22.16.0; TypeScript v5.8.3.
- RED against r373 real helper: `node --experimental-strip-types --test native/qa/native-auth-sso-callback-trailing-slash-r374.test.mjs` => **1/5 PASS, 4/5 FAIL** (trailing slash variants).
- GREEN after fix: `node --experimental-strip-types --test native/qa/native-auth-*.test.mjs` => **29/29 PASS** (r370–r374, including r373 pre-hydration and r372 session lease).
- `tsc --noEmit --strict --skipLibCheck --target es2022 native/src/lib/authInitialLinkReturn.ts` => **PASS** for this pure helper only.
- Final GitHub reread blob SHAs match locally tested files: helper `bd6096e968f85a5fbcc204234d73519921275726`, new test `12505382fcc9e402d5e04c40976df545ea7f6951`. Repo-wide Expo TypeScript / CLI runtime tests not executed (dependencies/SDK unavailable).

## Integration / cost gate
- `.github/workflows/ci.yml` on main listens to main pushes and pull_request; no ordinary feature-branch push trigger. Cloudflare Worker `app-hoikucolor-recruit` returned 0 build triggers in both accessible accounts before writes. No new PR/main merge/Actions dispatch/EAS/Cloudflare deploy/Store submission requested. Billing, GitHub Actions quota and signing authority not verified.
- `AGENTS.md` and `native/AGENTS.md` missing (404). Shared HQ #265 MINIMUM_COST_V1 and #467 acceptance contract used.

## Matrix / blockers / next priority
| Workflow | Web baseline | Android | iOS | Canonical E2E / QA |
| --- | --- | --- | --- | --- |
| Signed-out OAuth callback → protected application/message intent | Web source `8c502fdb`; Native redirect source `AuthScreen.tsx` | Source regression PASS only, runtime NOT_VERIFIED | Source regression PASS only, runtime NOT_VERIFIED | No canonical data access; signed build / real callback not verified |
| Job search → detail → apply → applications → messages | Web current main `8c502fdb` | NOT_VERIFIED end-to-end | NOT_VERIFIED end-to-end | Synthetic account/RLS/private Storage write/readback outstanding |

- Android SDK/ADB/emulator: unavailable in this Linux runtime. iOS macOS/Xcode/simulator: unavailable. Android signing and authorized iOS TestFlight/ad-hoc signing/distribution: unverified. Direct public git clone is DNS-blocked. Full Expo project dependencies absent; no native runtime screenshots or signed acceptance artifacts.
- Next independent priority: obtain the existing authorized complete Expo dependency/runner path without new paid jobs; run exact-head full typecheck and the canonical synthetic candidate application→message journey; verify both OS renders and OAuth callbacks before marking `DEVELOPER_VERIFIED`.
- State: **IMPLEMENTING**. This commit is not `READY_FOR_MASA_ACCEPTANCE`.
