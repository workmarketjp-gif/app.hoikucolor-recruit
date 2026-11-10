# Hoiku Color Native r138 — deliberate withdrawal confirmation

2026-11-10 NZ. State: IMPLEMENTING (source/test only).

**Reference:** Web main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/components/ApplicationDetail.tsx` (blob `a07aa957c94a2a2ac80e8e69a58a1e4523149300`), candidate role, synthetic statuses new/reviewing/interview/offered/accepted/withdrawn; source captured 2026-11-10. No paired rendered Web capture.

**Problem:** Native `/application/[id]` previously invoked permanent `hc_jobseeker_withdraw_application` directly from the first visible “辞退” button. Web has an explicit disclosure → warning/reason editor → cancel or “辞退を確定する” second stage, including accepted-offer reversal. One mistaken tap could request cancellation of interviews/visits.

**Native change:** one Web-equivalent decision panel after selection timeline, with canonical status/offer response labels; first tap only reveals irreversible warning, cancel resets draft, second tap calls existing pinned-session and same-frame single-flight RPC. Guard additionally requires confirm-open and withdrawable status. Accepted offers retain the specific “承諾を取り消して辞退する” wording; offer acceptance is unchanged. Confirmation/draft reset on navigation blur. No schema/RLS/auth/API/production change. Does not claim OS-specific UI verified.

**Source and verification:** isolated Color-only branch from r137 `778b40e272ffd0efad76437cd05d498cefb86897`, no open PR at preflight, no AGENTS.md in tree; no main writes or PR. Linux Node 22 `node --experimental-strip-types --test native/qa/native-application-decision-disclosure.test.mjs` 14/14 PASS; helper-only `tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck native/src/lib/applicationDecisionDisclosure.ts` PASS. GitHub screen wiring assertions are new and **not Node-run** in full checkout due GitHub DNS/no full SDK. No Native runtime/API/Android/iOS visual or signed build. CI workflow on main/PR has Android build; branch-only commit does not intentionally trigger it; external quotas uncertain.

| Workflow | Web source reference | Native source | Android | iOS | Blocking QA |
| --- | --- | --- | --- | --- | --- |
| Applicant withdraw/accepted-offer reversal | Two-stage Web decision card | Two-stage source added; real-source helper tested | NOT VERIFIED | NOT VERIFIED | Full Expo typecheck + wiring test; accidental-tap/cancel/confirm state on real app, canonical readback, same-state screenshots |
| Offer acceptance | Existing Web decision card | Existing pinned RPC preserved | NOT VERIFIED | NOT VERIFIED | App/API readback |
| Selection timeline / interview | r137 source baseline | Existing source unchanged | NOT VERIFIED | NOT VERIFIED | Paired Native QA |

**Next:** run `cd native && node --experimental-strip-types --test qa/native-application-decision-disclosure*.test.mjs` and `npm run typecheck` in locked Expo checkout; then priority search→detail→apply→application→message end-to-end (synthetic account) and both OS signed release gates. No real withdrawal/application/message was sent. No paid CI/EAS/Store action.
