# COLOR Native parity delta r373 — warm deep links during Clerk hydration

## Versioned source and synthetic state
- JOBSEEKER Web baseline: `main` commit `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, `src/App.tsx` (jobseeker auth / `/applications` / `/messages`), `src/components/CandidateShell.tsx` (mobile navigation). Source read 2026-11-20 NZ; no Web deployed SHA or screenshot was authenticated in this run.
- Native base: r372 commit `d32f2b4866b6174fea8e0e171b31f5499cfed26e`; `native/src/app/_layout.tsx`, `native/src/lib/authInitialLinkReturn.ts`; signed-out Expo Router/Clerk candidate state.
- Synthetic state: the OS delivers `hoikucolor://application/f27bc132-ced7-4bda-a4de-f81580385e77?focus=messages` **after RootLayout mounts but before Clerk hydrates**. It is a synthetic UUID, not a real job/candidate. No Supabase connection is made.

## Source-level gap closed (both Android and iOS source)
- Before: the private-route auth guard can redirect the URL while `AuthScopedRuntime` is still waiting for Clerk. Only the later signed-out listener received warm URL events, so an event in this pre-hydration window was not preserved for post-login navigation.
- After: RootLayout registers a short-lived in-functionality bootstrap listener using `Linking.addEventListener('url', ...)` and removes the listener on unmount. Its callback records only while the **first Clerk auth result is still unknown**; afterward the existing signed-out listener is the sole effective recorder. Cold `getInitialURL` and pre-hydration warm links use the same existing last-event-wins generation fence. Existing SSO callback filtering and candidate route allowlist remain in force; an already signed-in initial state drops the early hint.
- No backend/schema/Clerk/RLS/storage changes; no automatic applications, messages, or scouts. Private screen authorization is still enforced at the route and canonical backend.

## Focused local evidence (source from GitHub blobs)
- Baseline helper blob `ab9e4796d030bc0eb7d80e653bd032f269f8dbfc`, entry blob `76e81ec7ab5881b594667ffd116a2c805fb1a6cd`, and RootLayout baseline blob `64746c042cb37ff80c0352c5cf4abfe100f83bf6`.
- RED: `node --experimental-strip-types --test native/qa/native-auth-hydration-warm-link-r373.test.mjs` — 0/6 PASS before fix, because the bootstrap recorder was not implemented.
- GREEN: `node --experimental-strip-types --test native/qa/native-auth-hydration-warm-link-r373.test.mjs native/qa/native-auth-initial-link-return-r370.test.mjs native/qa/native-auth-sso-return-intent-r371.test.mjs native/qa/native-auth-post-login-session-lease-r372.test.mjs` — **24/24 PASS**, including six new pre-hydration, SSO, late cold URL, allowlist and already-authenticated cases.
- `tsc --noEmit --strict --skipLibCheck --target es2022 native/src/lib/authInitialLinkReturn.ts` — PASS for **pure helper only**.
- Connector reread confirmed new helper, entry wiring and unmount cleanup in the genuine GitHub blobs. Local source-test blob hashes match GitHub for helper and new test. RootLayout's Expo/Clerk typecheck, event integration and both OS runtime were NOT performed.

## Ownership / no-cost release boundary
- Single isolated branch `native/color-auth-hydration-early-warm-link-r373-20261120` from exact r372 parent; primary repo `workmarketjp-gif/app.hoikucolor-recruit`. Open PRs: zero at preflight; no known same-file writer; no main write, force push, PR or merge.
- GitHub `.github/workflows/ci.yml` listens to main pushes and pull_request, not ordinary feature-branch pushes. Cloudflare `app-hoikucolor-recruit` build trigger GET returned zero triggers in two connected accounts before the code writes. No manual Actions or EAS requested. Billing amounts and quota unverified; actual absence of charge cannot be inferred.
- Root `AGENTS.md` and `native/AGENTS.md` returned 404; shared HQ #265 MINIMUM_COST_V1 and Native #467 observed.
- Runtime: Linux Node v22.16.0, npm v10.9.2, TypeScript v5.8.3. Direct git clone blocked by DNS. Android SDK/emulator/ADB: not present. iOS macOS/Xcode/Simulator: not present. Android/iOS signing and distribution: unverified.

## Still unverified / next independent gap
- Native Android/iOS screenshots, Clerk live boot event timing, SSO redirect, full Expo typecheck and canonical application→message save/re-read remain unverified. Developer signed installables and safe test accounts do not exist for this SHA.
- Next priority: full Expo dependencies + synthetic candidate application→message canonical readback and actual Android/iOS rendered parity. Do not mark READY_FOR_MASA_ACCEPTANCE.

State: **IMPLEMENTING**.
