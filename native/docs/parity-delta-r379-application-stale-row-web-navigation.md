# COLOR Native r379 — retain Web-equivalent application-detail navigation during list refresh

## Exact reference / ownership
- Web JOBSEEKER /applications, src/App.tsx at main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, blob `21bbe8abf51ceee657266ff286593c8af784f399`, inspected 2026-11-20 NZ; source shows buttons rendered from retained `applications.data` are not disabled by loading/error. Role: signed-in synthetic candidate A with previously confirmed application rows while manual reload is pending/fails. Deployed SHA and paired screenshots NOT VERIFIED.
- Native source baseline r378 `503acf762011719a25b48a751aed1bc7948c5c09`; `applications.tsx` blob `e74a72e8311dc04e4c2e8e3129fbc3f3b21b3c22`. Open PR search: 0 before edit. No root or native AGENTS.md. MINIMUM_COST_V1/#467 read; only COLOR Native source/QA changed.

## Closed source gap
- Before: retained, previously verified same-owner application cards were visibly disabled whenever a manual reload was pending (`loading`), whereas Web permits opening those cards while the resource refreshes.
- Now: card navigation remains enabled during same-session manual refresh/after a failed refresh *only while* visible rows and the exact current user+Clerk-session canonical-read lease remain valid. Initial loading without verified rows, App Lock, background, logout, account/session change, and double tap remain blocked. Each detail route still pins the candidate and independently re-fetches the authorized application. An in-flight detail navigation prevents same-frame extra list refresh. No browser-link fallback and no mutation/backend/authorization changes.
- Existing r377 nonintegration correction and r378 refresh single-flight are preserved.

## Actual scoped QA / matrix
- Isolated Linux Node v22.16.0 `node --experimental-strip-types --test qa/native-application-stale-row-navigation-r379.test.mjs`: **10/10 PASS** on real helper source.
- TypeScript 5.8.3 `tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler src/lib/applicationListRefreshPolicy.ts`: PASS for helper only.
- Android: IMPLEMENTING, shared source only; emulator/SDK, rendered app/Web side-by-side and canonical synthetic E2E NOT VERIFIED.
- iOS: IMPLEMENTING, shared source only; macOS/Xcode/simulator, signed distribution, UI/Web side-by-side and canonical synthetic E2E NOT VERIFIED.
- Also outstanding: Expo full-app typecheck, Web deployment SHA verification and current candidate session save/readback. No new candidate data, screenshots or actual applications/messages.

## Release/cost
- Branch-only development; no PR/main/production/Store/paid EAS/CI/external code agent. The checked GitHub CI listens on main push and PR. Cloudflare Worker app-hoikucolor-recruit auto build triggers returned [] in both connected accounts immediately before this change; other billing/preview paths and quota remain uncertain.
- Next: full Expo TypeScript once dependencies available; canonical synthetic apply→applications→messages integration and paired real Android/iOS visual/accessibility tests; signed installables before MASA acceptance.
- Overall state: IMPLEMENTING; NOT READY_FOR_MASA_ACCEPTANCE.
