# Color Native r395 — visit booking/cancellation same-frame mutation gate

## Baseline and ownership
- Web JOBSEEKER `/visits` at main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`; inspected 2026-11-21 NZ. Role: signed-in candidate; synthetic state: an active visit form, two rapid taps, then App Lock/account switch while the pinned Clerk token or RPC is pending. No deployed Web or Native screenshot was captured.
- Native base `adbab03d3eec8bb37d933e4280e43ac25da741ab`, single-writer branch `native/color-visit-mutation-tap-gate-r395-20261121`. This is candidate Native UI and its screen-local presentation lease only. No Web, shared API, SQL/RLS, Worker, recruitment-admin, Staff or Family modifications.
- Defect: `visits.tsx` previously used React `busy` state alone. Multiple Pressable callbacks in one React frame could pass `!busy` and start concurrent visit request/cancel flows. The token/receipt helper guards sessions and idempotency after invocation, but it did not synchronously gate the screen's first tap.

## Implementation
- New `createVisitMutationTapGate` shares one synchronous lane between request and cancellation, checks the exact attempt after each await, and invalidates the pending attempt on blur, App Lock or account switch.
- Pass the attempt-current predicate into existing `requestVisitDurable` and `cancelVisit` so revoked attempts cannot initiate further RPC or readback. Late finally of an older attempt cannot release a newer one. Successful request holds the lane until blur **or a same-route `visitId` update** (Expo Router can replace the query without blurring). The confirmed-detail route releases the hold; a stale in-flight write is also fenced on a route change.
- Existing server RLS, durable idempotency envelope, canonical confirmation and refusal to auto-resend ambiguous writes are retained.

## Web-to-Android/iOS delta
| Route/action | Android Native | iOS Native | Data/write/real device |
|---|---|---|---|
| `/visits` request/cancel fast taps, App Lock/account switch/blur, verified request handoff | Shared Expo source updated; IMPLEMENTING | Shared Expo source updated; IMPLEMENTING | Real Clerk/Supabase synthetic roundtrip not run; neither installed OS runtime or paired rendered comparison verified |

- Isolated Linux Node v22.16.0: `node --experimental-strip-types --test native/qa/native-visit-mutation-tap-gate-r395.test.mjs` 8/8 PASS. `tsc --noEmit --strict --skipLibCheck --target es2022 --module nodenext --moduleResolution nodenext --allowImportingTsExtensions native/src/lib/visitMutationTapGate.ts` PASS. Source wiring statically inspected. Also re-ran prior r394 8/8 PASS against archived source. These are helper/source checks, not complete Expo compilation.
- Blocked for BOTH Android and iOS: compatible Expo install, respective Native runtime/simulator, signed artifact rights, actual synthetic authorized candidate reads/writes and rendered Web comparison. Production data untouched. No PR/main/paid Actions/EAS/Cloudflare/Store; quota/signing unknown.

## Next independent priority
Run canonical synthetic search → favorite → apply → application → message roundtrip and Web correspondence in an authorized QA environment. Resolve real Android and iOS toolchains and signing separately; no claim of `READY_FOR_MASA_ACCEPTANCE` from source tests.
