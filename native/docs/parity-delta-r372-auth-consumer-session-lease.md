# COLOR Native r372 — Session-lease fence on post-login return intent

**2026-11-20 NZ | IMPLEMENTING | Source-level developer verification only**

## Versioned Web / Native reference
- JOBSEEKER Web source baseline: `main` `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, private candidate `/applications` / `/messages` flows; no new rendered capture, not evidence of production deployment.
- Native baseline: `d8b8ea6a84ef0a0f39fcd21c4cf2164a4b82825b` (r371); `native/src/app/index.tsx`, `native/src/lib/authInitialLinkReturn.ts`.
- Synthetic scenario: an EntryScreen effect is revoked during a same-session re-entry while an OS cold deep-link read is pending; alternatively, session A is replaced by session B and old pending intent must be discarded. Test return URL `hoikucolor://application/f27bc132-ced7-4bda-a4de-f81580385e77?focus=messages`, not a real candidate record.

## Gap closed at source level
- Before: EntryScreen cleanup prevented stale UI state updates, but an obsolete `consumePostAuthCandidateRoute()` call could still clear the shared pending return intent before the new session's call could read it.
- After: EntryScreen passes its live effect lease and exact Clerk session ID; a revoked same-session effect cannot steal the link from its replacement. Direct account switches reject cross-session pending intent, and sign-out clears claimed intent before accepting any fresh warm link. No authorization, persisted identity, backend or notification writes changed.

## Focused QA
- Genuine GitHub r371 blobs verified before modification: helper `c69adaf51752b2f7e110764e383c97cf85d6b00d`, entry `29ba58a9c81e45d33f1bb67ca6537a7e0c4ee37b`.
- RED test before fix: new r372 tests 1 PASS / 3 FAIL (cross-session stale consumption + missing route integration).
- GREEN: `node --experimental-strip-types --test native/qa/native-auth-initial-link-return-r370.test.mjs native/qa/native-auth-sso-return-intent-r371.test.mjs native/qa/native-auth-post-login-session-lease-r372.test.mjs` — 18/18 PASS (6 r372).
- `tsc --noEmit --strict --skipLibCheck --target es2022 native/src/lib/authInitialLinkReturn.ts` — PASS (pure helper only).
- Still unverified: complete Expo project typecheck, actual Clerk lifecycle in RN, Android/iOS runtime/visual parity, canonical Supabase save/readback, signed installables, MASA device acceptance.

## Ownership and costs
- COLOR Native UI and dedicated regression only. Single new r372 branch from exact r371 HEAD; no same-file concurrent writer identified, open PRs 0 at preflight. GitHub CI push-main/PR triggers, not branch pushes; Cloudflare Worker `app-hoikucolor-recruit` build triggers 0 at preflight. No CI dispatch, PR, merge, production, EAS, Store or paid agent.
- Android SDK/emulator absent; iOS macOS/Xcode/Simulator absent; signing and distribution unverified. Billing quota/actual spend unknown. Next: full Expo typecheck on an authorized complete checkout, synthetic sign-in return flow with real Clerk on both OS, then application→messages canonical readback.

**READY_FOR_MASA_ACCEPTANCE: NO.**
