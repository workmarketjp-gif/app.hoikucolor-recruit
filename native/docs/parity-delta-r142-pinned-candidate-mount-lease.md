# Hoiku Color Native r142 — pinned session StrictMode/re-mount lifecycle safety

2026-11-11 NZ | IMPLEMENTING — source and focused Node verification only.

## Provenance and ownership
- Web jobseeker baseline: `main` `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, role: authenticated synthetic candidate, previous source parity baseline in `jobseeker-web-parity-ledger.md`. No current same-state Web/Android/iOS screenshot.
- Native base: r141 `2fd66bebeb4070077818e836c9861e8ca160c990`. Color-only isolated writer on `native/color-pinned-session-strictmode-r142-20261111`; open PR list empty before change. No main, Web, backend, auth provider configuration, RLS, Production or real candidate writes.
- Scope: Native `usePinnedCandidateAction` hook and a pure effect epoch guard. This is a Native session-lifecycle reliability fix; it is **not** another new Web feature.

## Failure and correction
- Previous shared hook initialized `mountedRef` true but cleanup only set it false. React StrictMode effect setup→cleanup→setup can leave the same mounted hook permanently rejecting candidate reads/writes. Merely setting a boolean true again would allow an action launched in the earlier lifetime to become current after reactivation.
- `createPinnedCandidateMountLease` starts fail-closed, activates on each effect setup, revokes on cleanup and changes epoch; each pinned token acquisition and its returned `isCurrent` closure must retain that launch epoch.
- The effect also replays on Clerk user or session identity changes, revoking operations from the previous identity. A pinned Supabase client still uses one snapshot Clerk token, and `pinCandidateAction` additionally gates access on privacy quarantine. Push metadata `pinCandidateSession` can still operate while App Lock is visible, as before.
- This avoids falsely claiming success for a revoked request. It does not cancel an API mutation already accepted server-side or replace backend authorization.

## Exact scoped evidence
- Node 22.16.0: `cd native && node --experimental-strip-types --test qa/native-pinned-candidate-mount-lease.test.mjs qa/native-pinned-candidate-mount-lease-contract.mjs` — **10/10 PASS** on GitHub SHA-matched files. First six exercise the real pure helper, remaining four inspect actual hook source wiring (not React Native execution).
- `tsc --strict --noEmit --target ES2022 --module ESNext --moduleResolution bundler src/lib/pinnedCandidateMountLease.ts` — **PASS**, pure helper only, not Expo TypeScript.
- Dedicated package script `npm run test:pinned-candidate-mount-lease` added. The static contract also auto-registers in the existing `qa/run-native-contracts.mjs` discovery by suffix. Full historic contract gate, dependency-backed app typecheck and component runtime were **not run**.
- No Android SDK/emulator or macOS/Xcode in current Linux runner; Android and iOS UI, account-switch, document readback, signed installation and physical acceptance **NOT VERIFIED**. No claim of OS screen-capture prevention.
- GitHub `.github/workflows/ci.yml` triggers on PR and main push, not this dedicated branch. PR remains withheld under MINIMUM_COST_V1; no new paid Actions/EAS, Cloudflare release or Store action. Billing/quota unknown.

## Next
Use an authorized full Native dependency checkout for `npm ci`, TypeScript, component lifecycle tests, and end-to-end canonical search→application→document/message readback. Independently validate Android and iOS before signing acceptance builds.
