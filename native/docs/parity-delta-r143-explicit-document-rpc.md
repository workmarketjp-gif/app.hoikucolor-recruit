# Hoiku Color Native r143 — explicit document choice cannot downgrade to legacy submit RPC

2026-11-11 NZ. Status: IMPLEMENTING (source implementation and focused Node tests, not app/device QA).

## Canonical evidence and ownership
Web source baseline: `main` `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/components/ApplyDocumentsStep.tsx` (explicitly selected document IDs) and `src/lib/recruitRepository.ts` blob `a5f70398a14e0747f8588cc207f5f6d1b86db10d` (v2 missing-RPC fallback to v1). Synthetic authorized candidate with two different saved documents, only one selected for submission; not a production account or actual submission. Source-only reference; no deployed capture or OS screenshot.

Native baseline r142 `56510da75bc92945c20e38f396b902f908b4f1a0`; Color single-writer isolated `native/color-explicit-document-rpc-no-downgrade-r143-20261111`. No open Native PR at edit check. Native UI/API adapter, candidate-only privacy scope; no shared API, Web, SQL/RLS/Edge, Clerk config, production data or authentication changes.

## Actual defect and changed behavior
The Web/Native pre-application panel explicitly selects files; the legacy v1 submission RPC does not accept `p_document_ids` and may snapshot the user's default document IDs. Previously, when `hc_jobseeker_submit_application_v2` was missing, Native silently invoked v1 and subsequently handed off selected docs. That can record defaults not chosen by the candidate and is not consent-equivalent. This is a privacy and data-contract concern, not just a UI discrepancy.

Native now refuses to downgrade when `documentIds` were explicitly supplied (including `[]`). It returns a visible error instead of invoking v1. Only SQL `42883` and PostgREST `PGRST202` establish that v2 was never invoked; after that narrow proof the pre-submit local receipt may be cleared to let the candidate retry when the service is repaired. For message-only or transport ambiguity, keep the pending write quarantine and canonical reconciliation. The existing v1 route for spot/legacy calls **without explicit selection** is preserved. No automatic retry or duplicate application is sent.

The current Web `src/lib/recruitRepository.ts` has a corresponding fallback; that is **not** fixed by this Native-only branch. It requires the current Web owner's review/remediation, and acceptance on both surfaces must remain blocked until the behavior is aligned.

## Focused evidence and platform matrix
- Node.js 22: `node --experimental-strip-types --test native/qa/native-explicit-document-rpc-safety.test.mjs` — four real helper behavior cases; two actual-source wiring assertions. Full candidate RPC/E2E cannot be verified in this environment.
- TypeScript: `tsc --strict --noEmit --target ES2022 --module ESNext --moduleResolution bundler native/src/lib/explicitDocumentSubmissionSafety.ts` — pure helper only, not Expo project check.
- Web explicit selection → Native v2 application: source fail-closed correction. Android: runtime, screenshots, canonical API readback, signed APK **NOT VERIFIED**. iOS: runtime, screenshots, canonical API readback, TestFlight/ad-hoc **NOT VERIFIED**.
- Existing default-document v1 route: unchanged for requests without explicit `documentIds`; requires real authorized test.
- GitHub `.github/workflows/ci.yml` runs on PR/main push (includes Android build); isolated branch-only commit, no PR/main merge or paid CI/EAS. No Cloudflare or production write. Signing and distribution entitlements still unverified. External billing/quota unknown.

Next: authorized complete Expo checkout/typecheck and duplicate-proof canonical search→detail→choose documents→apply→readback→message in both OSes, then rendered Web comparison and signed acceptance builds. Web owner to resolve the documented v1 fallback before declaring full parity.
