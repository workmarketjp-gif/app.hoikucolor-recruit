# Hoiku Color Native — r136 interview-response session and focus lease

Date: 2026-11-10 NZ | State: IMPLEMENTING (source-scoped, not Android/iOS developer-verified).

## Versioned Web reference and ownership
- Web: `workmarketjp-gif/app.hoikucolor-recruit` main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/components/ApplicationDetail.tsx`, `InterviewCard`; authenticated jobseeker / synthetic scheduled interview, accepted and reschedule states. This is source reference, **not** a deployed side-by-side screenshot.
- Existing Web actions `この日時でOK` / `日程変更を希望` / `日程変更を送信`, note validation and canonical refresh remain unchanged.
- Source writer: dedicated Color Native Commander only; new isolated branch `native/color-interview-response-lease-r136-20261110` from r135 `94a41d77ff10c2f6022c0635589a144bf9b0a30a`. No PR, main write, shared API/schema, production or real interview response.

## Concrete Native gap closed in source
- Original `InterviewCard` had a same-frame local `actionPending` flag but **did not check** `pinned.isCurrent()` before starting the durable interview response, and did not revoke the operation after screen blur.
- Reuse the parent `ApplicationDetailContent`'s existing `createApplicationDecisionGate` for both answer types, so its lease survives `InterviewCard` unmount/remount during a canonical refresh or navigation blur. Parent blur revokes presentation while retaining the in-flight lock until settlement. Complete parent unmount/App Lock does **not** preserve an in-memory lock across a new component instance; pinned-session checks and server-side durable mutation authorization remain essential.
- Verify pinned Clerk session **and** current screen lease before the durable RPC, after its canonical result, and after the parent refresh. Never display old success or failure after revoke.
- Snapshot the reschedule message before async pin; lock all three answer/toggle buttons even before React commits busy state. On an old answer's completion, notify the retained parent to rerender remounted cards so controls do not remain disabled indefinitely, without exposing stale private results.
- Existing candidate-only RPC, durable mutation/recovery, current session gate, backend/RLS, and Web-approved UI copy are unchanged. In-flight network requests cannot be unsent, and server-side auth still governs.

## Evidence and verification
- **RED on base r135**: source assertions for synchronous interview lease, pre-RPC pinned session, blur revocation and stale completion: 0/4 passed.
- Local Node v22.16.0 / exact Git blob `applicationDecisionGate.ts` (`e6959475215b4bbb0514509900cf52da939da074`) and exact newly committed `native-interview-response-lease.test.mjs` (`872ed1764b29a863309c61f52a767f1a86ef5004`):
  `node --experimental-strip-types --test native/qa/native-application-decision-single-flight.test.mjs native/qa/native-interview-response-lease.test.mjs`: **9/9 PASS**.
- `tsc --noEmit --target es2022 --skipLibCheck native/src/lib/applicationDecisionGate.ts`: PASS **only for existing standalone helper**.
- Connected GitHub re-read of changed `application/[id].tsx`: initial 11/11 source wiring checks PASS; a second connected check for parent-owned lease/remount wiring was also performed. The committed `native-interview-response-wiring.test.mjs` awaits Node execution in a full checkout. These are static source checks, not React Native behavior proof. No claim of RN component test, full Expo typecheck, canonical live-RPC QA or physical-device acceptance.

## Platform / cost / next
| Gate | Android | iOS |
| --- | --- | --- |
| Native source guard | Implemented, not runtime verified | Implemented, not runtime verified |
| Actual screen, old-session, re-entry, canonical readback | NOT VERIFIED | NOT VERIFIED |
| Web-matched screenshot, safe-area/keyboard/200% Japanese text | NOT VERIFIED | NOT VERIFIED |
| Signed installation artifact | NOT AVAILABLE | NOT AVAILABLE |

- Container: Node/npm/standalone TS available; direct Git checkout fails DNS, project-locked Expo dependencies missing. No Android SDK/emulator/adb or macOS/Xcode/simulator. Signing/distribution authority not confirmed.
- CI `.github/workflows/ci.yml` is triggered on main push or PR; branch-only commits were selected to avoid unapproved paid CI. Cloudflare/other integrations and billing remain partially unverified; no CI/EAS/build/API fees deliberately initiated.
- Next: run the committed wiring regression plus dependency-backed full Expo typecheck in an authorized checkout; fix any errors; then verify the entire search→detail→apply→applications→interview→message path with synthetic authorized backend data and separately rendered Android/iOS screens before signed acceptance handoff. No store submission.
