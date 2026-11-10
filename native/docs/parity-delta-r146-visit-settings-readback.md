# Hoiku Color Native r146 — fail-closed visit settings readback (2026-11-11 NZ)

## Reference and single writer
- Web baseline: `main` `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/lib/visitRepository.ts` and `src/components/VisitTrialPanel.tsx` under authenticated jobseeker `/jobs`; synthetic test settings use non-real UUIDs, allowed weekdays 1/3/7, 09:00–17:30.
- Native base: `ebc94b029bed7bc4add246725c7c191934804b2b` (r145), isolated branch `native/color-visit-settings-readback-r146-20261111`; open PRs: 0 before write. Owner: Color jobseeker Native; no Web/backend/other app files.
- Web reference also casts the RPC response without shape verification, but this change is Native-only; do not treat Web behavior as authorization proof. Server RPC/RLS remain authoritative.

## Implemented
- Previously `getVisitSettings` took the first array row or cast an arbitrary object. A malformed RPC success could make the form crash or silently hide availability.
- The Native adapter now rejects malformed/multiple rows, missing facility identity, invalid weekday/time/boolean/number fields. `null` and `[]` remain legitimate absence. Valid settings preserve all canonical field values.
- Failure propagates through the existing candidate-owned error/retry and private-data quarantine paths; no new client-side business authorization, no altered RPC, DB or Web.
- Strict seconds field, ISO weekday 1–7; no inferred jobs or reservations.

## Evidence & acceptance matrix
| Action | Native source | Android runtime | iOS runtime | Canonical save/readback |
|---|---|---|---|---|
| Valid visit settings and absent settings | helper + RPC adapter | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Malformed/multiple RPC success -> error, not form | Node helper 6/6 PASS; adapter source wiring must run in full checkout | NOT VERIFIED | NOT VERIFIED | not a write |
| Retry after error and display correct facility setting | existing screen retry path maintained | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |

Local: `node --experimental-strip-types --test native/qa/native-visit-settings-readback.test.mjs` 6/6 PASS; `tsc --strict --noEmit --target ES2022 --module ESNext --moduleResolution bundler native/src/lib/visitSettingsReadback.ts` PASS (helper only). The contract file is auto-discovered by `native/qa/run-native-contracts.mjs` but the complete Expo checkout is absent here; no full Native typecheck, native renderer, signing, or QA device verified. Branch-only commit and no PR/merge/CI dispatch/EAS/production changes.

Next: execute contract and full Expo typecheck in authorized full checkout, test malformed RPC under approved synthetic session, verify Web/Android/iOS visit booking and private failure/retry state. State IMPLEMENTING, not READY_FOR_MASA_ACCEPTANCE.
