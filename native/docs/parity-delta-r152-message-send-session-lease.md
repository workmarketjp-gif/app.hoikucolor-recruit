# r152 — Candidate message durable-send session/focus fence

Date: 2026-11-11 NZ. Owner: COLOR JOBSEEKER Native only. Source baseline: Web main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/components/ApplicationMessages.tsx` (blob `6275c5e50c3f67eea58a2ecb53d6b984fd34a497`), /applications/:id -> messages panel. Role/state: synthetic logged-in jobseeker and owned application thread. Native parent `953200da2a74fc9417489de2efa66a5eed951c1d`; branch `native/color-message-session-fence-r152-20261111`. No rendered Web/native screenshot or shared production candidate data.

## Gap addressed
Native `sendApplicationMessageDurable` awaited `prepareDurableMutation` / SecureStore and then called `hc_send_message_v2` without rechecking the pinned Clerk session, view focus generation or App Lock. A logout/account change during that await could still start the RPC on an obsolete pinned client. This is a source-detected risk, not proof an incorrect message was sent.

The new `src/lib/messageSendSessionLease.ts` checks current owner/session/private-screen generation BEFORE preparation, AFTER preparation and before RPC, after RPC, after canonical readback, and before/after clearing the durable recovery record. Screen `src/app/application/[id].tsx` passes `pinned.isCurrent() && messageRequestGeneration === generation.current`; existing `src/lib/applicationJourneyApi.ts` retains exact server request ID, canonical row ID/sender/body verification, candidate-scoped RPC/RLS and no automatic retry. Stale or unverified writes remain ambiguous, not silently successful. No Web, backend, auth, RLS or DB changes.

## Developer test evidence and parity matrix
Node.js 22.16.0: `node --experimental-strip-types --test qa/native-message-send-session-lease.test.mjs` **10/10 PASS** on exact GitHub helper/test blob SHA; standalone `tsc --strict --noEmit --target ES2022 --module ESNext --moduleResolution bundler src/lib/messageSendSessionLease.ts` **PASS**. `node qa/native-message-send-session-lease-contract.mjs` **PASS**. Integration source wiring inspected from the branch. Adapter full Expo typecheck and live RPC integration **NOT RUN** (locked Expo dependencies and devices absent).

| Workflow | Web baseline | Android | iOS |
| --- | --- | --- | --- |
| Owned application thread -> durable send -> canonical row readback | main `fa779e73`, `ApplicationMessages.tsx`; no rendered capture | Shared source fence, focused Node test PASS; native render/API E2E NOT VERIFIED | Shared source fence, focused Node test PASS; native render/API E2E NOT VERIFIED |
| Session/App Lock change during SecureStore receipt preparation | Synthetic session switch; Web defect handling not recopied | Async write prevented by source helper; Android runtime NOT VERIFIED | Async write prevented by source helper; iOS runtime NOT VERIFIED |

Signed Android installable artifact **none**. iOS TestFlight/ad-hoc route **not verified**. No PR/main merge, Actions/EAS/build, production mutation or real message. No verified new spend; account-wide quota/cost **unknown**. **IMPLEMENTING**, not READY_FOR_MASA_ACCEPTANCE.

Next: complete-checkout Expo typecheck and targeted private-message adapter integration, same-state Web/Android/iOS rendered and canonical readback QA, safe signed distribution.
