# Hoiku Color Native r139 — canonical withdrawal freshness
2026-11-10 NZ. State: IMPLEMENTING (source only).

Web reference: main fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6, src/components/ApplicationDetail.tsx, authenticated synthetic candidate, observed by source 2026-11-10. No paired rendered Web capture.

Risk: r138 had a two-stage irreversible withdrawal but the displayed status/offer-response snapshot could become stale while the sheet was open. Before the existing withdrawal RPC, Native now reads hc_jobseeker_get_application_detail for the same pinned candidate. Changed or missing application ID/status/offer response cancels confirmation and prevents withdrawal, showing an error and manual canonical refresh action as in Web. Refresh also clears the draft. Backend authorization/atomic status checks remain authoritative; no real candidate action executed.

Exact parent SHA: 6c558d72291f26eb8c2e87643146f57a5ab67de9. Isolated sole-writer Color branch: native/color-withdrawal-canonical-freshness-r139-20261110. No PR/main/production writes. No current open PR at preflight. CI pushes trigger on main, PR triggers on PR; neither used.

Node v22.16.0: existing disclosure and new freshness tests 24/24 PASS against exact local helper; standalone helper tsc PASS. New regression test initially failed due missing helper export (RED), then PASS after code. The screen wiring test is committed but NOT run with a complete Expo project. No Android or iOS runtime/visual QA, canonical authenticated save/readback, signed artifacts; no acceptance. External budget/quota remains unknown.

| Route | Source behavior | Android | iOS | Next gate |
| --- | --- | --- | --- | --- |
| application detail → withdrawal | Canonical re-read before durable withdrawal | NOT VERIFIED | NOT VERIFIED | Expo TypeScript, source wiring tests, same-state device/server verification |
| application detail refresh | Web-aligned manual refresh action, cancels open confirmation | NOT VERIFIED | NOT VERIFIED | Japanese small-screen/keyboard/200% text real UI QA |

Continue search → detail → apply → application → message integrated synthetic-authorized flow, plus signed Android/iOS builds through existing approved paths only.
