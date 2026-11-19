# COLOR Native r371 — Preserve signed-out return link through Google SSO callback

**2026-11-20 NZ | IMPLEMENTING | Source-level regression only**

## Web reference / provenance
- Existing approved JOBSEEKER Web at main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, candidate application and messages routes (source baseline from r370; not a new rendered Web capture). Synthetic, signed-out candidate: application UUID `f27bc132-ced7-4bda-a4de-f81580385e77`, then Google sign-in.
- Exact Native baseline `c68cb5e627862fbc4f457158f2a1d45487256579`, branch `native/color-auth-sso-return-intent-r371-20261120`, original helper blob `2f7ca930b311ba615c036bed3f33375a4d5651d1`.
- Observed source route: `AuthScreen.tsx` builds Google SSO return URL using `AuthSession.makeRedirectUri({ scheme: 'hoikucolor', path: 'sso-callback' })`. While signed out, `src/app/_layout.tsx` forwards *all* Linking URL events to `rememberSignedOutCandidateLink`. Before this change the callback was rejected as a candidate URL and **cleared the pending deep-link intent**, so sign-in returned to Home instead of the original application/message screen.

## Implemented, not rearchitected
- The candidate link window ignores only the app's exact `hoikucolor://sso-callback` / `hoikucolor:///sso-callback` callback (with query/fragment), retaining the original one-shot route. It never copies OAuth code/state into pending state or logs.
- Unrelated or malformed candidate links still clear pending intent as before; unrelated SSO-like paths remain invalid. Existing Clerk exact-session route entry, per-screen pins and server-side authorization unchanged.
- Files: `native/src/lib/authInitialLinkReturn.ts` and `native/qa/native-auth-sso-return-intent-r371.test.mjs`.

## Focused developer evidence
- Actual baseline helper/test files from r370 evidence ZIP matched GitHub blob SHAs. r370 real-source Node test: 8/8 PASS.
- Red regression before fix: r371 test 2 failing / 2 passing (Google SSO and slash callback failures reproduced).
- After fix: `node --experimental-strip-types --test native/qa/native-auth-initial-link-return-r370.test.mjs native/qa/native-auth-sso-return-intent-r371.test.mjs` 12/12 PASS; `tsc --noEmit --strict --skipLibCheck --target es2022 native/src/lib/authInitialLinkReturn.ts` PASS (pure helper only).
- No full Expo typecheck or React/Clerk auth execution, synthetic canonical write/readback, actual Android/iOS link handling, Web↔Native screenshot, signed app build or physical-device acceptance. Android: NOT_VERIFIED. iOS: NOT_VERIFIED.

## Ownership and release
- Sole COLOR Native UI/adapters/test writer; distinct r371 branch to avoid r370 same-file races, no open PR at preflight. `.github/workflows/ci.yml` only push-main or PR CI; Cloudflare Worker `app-hoikucolor-recruit` GET build triggers returned 0 on 2026-11-20 NZ. No PR/main/production/deploy/Store, paid CI/EAS or external coder requested. Billing/quotas unknown.
- Next: run Expo full typecheck and SSO/cold-warm authentication harness on authorized complete checkout; verify email/Google return with synthetic candidate on each OS; test canonical application → messages readback. Signing/distribution credentials and native runners remain unverified/unavailable.

**READY_FOR_MASA_ACCEPTANCE: NO.**
