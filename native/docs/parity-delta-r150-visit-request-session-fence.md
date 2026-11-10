# r150 — Candidate visit request session-fence

Date: 2026-11-11 NZ. Owner: COLOR JOBSEEKER Native only.
Web baseline: main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/components/VisitTrialPanel.tsx` and `src/lib/visitRepository.ts`, jobseeker role, synthetic state. Native parent: r149 `a49c0940dc8c2b2f56600d4bfa1e171399e9cd99`.

## Gap and behavior
Native visit request pinned a session before calling `requestVisitDurable`, but then awaited SecureStore receipt preparation, the authorized request RPC, and a canonical readback without rechecking that the pinned session still belonged to the current candidate. A logout or account switch while receipt preparation was in flight could invoke `hc_request_visit_v2` after session invalidation. This is a source-observed risk; no actual affected candidate request has been confirmed.

## Isolated fix
- `native/src/lib/visitRequestSessionLease.ts`: real request workflow with checks before preparing, after preparation / immediately before RPC, after RPC, after canonical readback, before and after receipt clear. No automatic replay of ambiguous RPC results. Existing exact Web-to-Native request identity, time zone, message, job and application proofs are retained.
- `native/src/lib/applicationJourneyApi.ts`: calls this orchestrator, retaining unchanged authorized `hc_request_visit_v2` parameters, durable request ID, and `confirmsRequestedVisit` proof.
- `native/src/app/visits.tsx`: passes pinned `isCurrent`, including on App Lock/session boundaries. No added permissions, no new UI features.
- `native/qa/native-visit-request-session-lease.test.mjs`: behavioral test of actual helper, including revoked before/during prepare, during RPC/readback/confirm/clear, uncertain response, and lack of auto-retry.
- Existing request readback source contract is *strengthened* for the orchestrator and screen wiring; the five canonical proof cases remain.

## Test scope / gates
Focused helper: 10/10 PASS on Node v22.16.0, isolated `tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler` PASS. Source wiring evaluated against the exact branch files using connector reads; full Expo module/typecheck, actual RPC mutation/re-read, Android and iOS rendered QA, signed build and MASA acceptance remain NOT VERIFIED.

Branch-only; no PR/main, Production/DB/RLS/Edge/Worker, paid Actions/EAS or real candidate action. GitHub workflow CI on main push/PR, and two connected Cloudflare accounts' Pages project lists were empty when checked; other integrations/billing cannot be guaranteed. Next: full Expo checkout and platform-synthetic request→readback→cancel→readback plus visual QA.
