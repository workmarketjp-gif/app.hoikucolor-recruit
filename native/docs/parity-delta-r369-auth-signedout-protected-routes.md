# COLOR Native r369 — Signed-out private-route mount protection

**2026-11-20 NZ | IMPLEMENTING | GitHub source change, no installed Android/iOS QA**

## Ownership / source reference
- COLOR JOBSEEKER ChatGPT writer only. Repo `workmarketjp-gif/app.hoikucolor-recruit`; continuing branch `native/color-vault-web-default-r341-20261119` from `59cf0a9c1199212a5325bdf72eb944b0e2e63c3a`.
- Web reference: existing jobseeker routes `/spot`, `/applications`, `/messages` and login/session flow, main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, checked 2026-11-20 NZ. Synthetic state: unauthenticated cold incoming link to a private application/Spot route; no real candidate data.
- Neither root nor native `AGENTS.md` exists at the inspected branch. HQ #265 MINIMUM_COST_V1 and common issue #467 remain the gates. Open PR search returned none before the code change.

## Closed source gap
Previously, `AuthScopedRuntime` rendered an unrestricted `<Stack />` when signed out, while the private providers were intentionally absent. A cold private route such as `/application/[id]`, `/spot-jobs` or `/messages` could therefore mount a component whose `usePrivateDataQuarantine` requires `SessionFreshnessProvider`, instead of reaching login safely.

`native/src/app/_layout.tsx` now declares Expo Router SDK 55 `Stack.Protected` groups for all current root-level private routes: `(tabs)`, `application/[id]`, `job/[id]`, `compare`, `matches`, `messages`, `resume`, `scouts`, `spot-jobs`, `visits`. `(auth)` is available while signed out; `index` and `sso-callback` stay public to preserve startup/SSO. The private group is enabled only inside the active-session `PrivateRuntime`. The route boundary changes no canonical API, login policy, data ownership, stored data or backend permissions.

Expo Router's documented behavior is to redirect attempts to open a protected route to the anchor/first available route. We have *not* established that this particular app preserves an originally requested link after authentication. This remains a separate parity acceptance check; no claim of a complete cold-deep-link handoff is made.

## Tests and limitations
- Exact file readback at post-write commit `0cb7b5f3c2b52ba02beb47fff6f24869eb109bbd`; blob `82d5d3895c3d56a6b2b1414604b82c29e02ffa0d`.
- **9/9 focused real GitHub-source assertions PASS:** route inventory (13 total, 10 private), no duplicate entries, signed-out and private guards, intact provider and SSO routing, exact commit/blob.
- Related same-SHA helper regression from prior r368 re-executed in this run: `node --experimental-strip-types --test qa/native-spot-application-navigation-lease-r368.test.mjs` **12/12 PASS**, helper `tsc --noEmit --strict --skipLibCheck --target es2022 src/lib/spotApplicationNavigation.ts` **PASS**; local Git blob matches GitHub. This does **not** typecheck or execute r369's React/Expo root change.
- `git ls-remote` still fails GitHub DNS in the isolated Linux runtime. Full Expo project dependencies and React/Expo typecheck not available; therefore root compilation, cold/warm deep link runtime behavior, Android UI and iOS UI are **NOT VERIFIED**. Linux has Node 22.16.0/npm 10.9.2, but no Android SDK/adb/emulator, macOS/Xcode/iOS simulator, or verified signing/distribution route.
- Official Expo reference: https://docs.expo.dev/router/advanced/protected/ (SDK 53+), checked 2026-11-20 NZ; do not use SDK 58-only `redirectTo` in this SDK 55 project.

## Build/cost and next workflow
- Before write, branch-only pushes do not match `.github/workflows/ci.yml` (push only main, pull_request); no open PR. Workmarket Cloudflare GET `/builds/workers/app-hoikucolor-recruit/triggers` returned 0.
- No new GitHub Actions, PR, merge, paid EAS, Supabase production mutation, application/message send, or Store/public release. Real billing and remaining quotas unverified.
- Next: run full Expo typecheck; execute synthetic signed-out/private-link, OAuth callback, session expiry and signed-in application→message readback on both Android and iOS. Preserve original requested link after login only after checking Web behavior and actual Expo routing; no unverified route-resume claim.
