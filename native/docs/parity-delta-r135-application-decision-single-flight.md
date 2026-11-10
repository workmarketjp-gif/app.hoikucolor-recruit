# Hoiku Color Native — r135 application decision single-flight
Date: 2026-11-10 NZ | State: IMPLEMENTING | Native jobseeker owner only.

## Baseline and scope
- Repository: `workmarketjp-gif/app.hoikucolor-recruit`, isolated branch `native/color-application-decision-single-flight-r135-20261110`, parent `7d33771921c283ae0e3a396ed3bf9a9136e671a4` (r134). No main, other branch or backend changed.
- Web reference remains authenticated synthetic jobseeker / application detail on main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`; source-only parity evidence. No deployed Web screenshot claim.
- r135 addresses same-frame concurrent actions and stale completions in the Native application detail: accepting an offer, withdrawing an application, repairing document handoff, and reviewing an uncertain sent message. Existing candidate-only canonical API/RPC and durable message idempotency remain unchanged.

## Change
- One shared ref-backed lease acquired synchronously before an async session pin. Duplicate taps/actions cannot open overlapping mutations in one detail route.
- Blur invalidates presentation rights but retains an in-flight lock until the operation settles, so an immediate return does not send a second irreversible decision.
- All four flows check current pinned session and screen generation before updating private state; message send additionally checks generation before starting RPC and before applying confirmed readback.
- Review only reloads canonical messages; never resends. Existing messages, offer, withdrawal and repair behavior stays intact.

## Verification and remaining gates
- Node v22.16.0: `node --experimental-strip-types --test native/qa/native-application-decision-single-flight.test.mjs`: 5/5 PASS (real helper source).
- `tsc --noEmit --target es2022 --skipLibCheck native/src/lib/applicationDecisionGate.ts`: PASS (helper only).
- Connected source replacement assertions: all expected call-site markers, unique handlers and guard present before commit. This is NOT Expo full typecheck/Native UI proof.
- SDK/emulator, Xcode/simulator, signing and authorized distribution absent/unverified in current Linux environment. No Android/iOS device QA, canonical API live data mutation or signed build. Git direct checkout remains DNS-blocked. CI only on main/PR: no PR or merge, no paid builds.
- Next: recover authorized full Expo project and run complete typecheck + same-session duplicate-tap, logout/blur, canonical readback, visual Android and iOS QA, then signed acceptance delivery with separate approval.
