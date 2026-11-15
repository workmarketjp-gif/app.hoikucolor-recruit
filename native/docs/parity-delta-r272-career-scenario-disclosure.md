# r272 — Scenario result Web disclosure parity

**State:** IMPLEMENTING. **Date:** 2026-11-16 NZ. **Owner:** COLOR JOBSEEKER Native UI only.
**Provenance:** `workmarketjp-gif/app.hoikucolor-recruit` branch `native/color-jobseeker-integration-r216-20261114`; pre-edit HEAD `16bdbf95662b3b119ee972da0bcb9b6b6892f70c`. No open PR on preflight; CI `push: main` / `pull_request`, and no PR opened. No main or production changes.

## Canonical Web reference

Web `src/views/CareerView.tsx`, `/career`, main `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`, inspected 2026-11-16 NZ, authenticated synthetic candidate; zero results, salary missing, unverified holiday data, and populated partial result. No browser screenshot or deployed SHA verification.

The Web `ScenarioResult` distinguishes missing salary input (`salary_line`) from insufficient verified annual holidays (`verified_holidays`) and real zero-match results. Web also discloses the server-returned number of jobs without verified holiday days and the number omitted from the initial results list. Native previously collapsed every not-ready state into one generic no-results sentence and omitted those two notices.

## Change, API and security

- `native/src/lib/careerScenarioPresentation.ts`: pure formatter for canonical RPC discriminant and returned counts; no invented data or extra API requests.
- `native/src/components/CareerExperience.tsx`: both quick salary/holiday and detailed career results use the formatter; preserves native job-detail navigation and source-provided job rows.
- `native/qa/native-career-scenario-disclosure-r272.test.mjs`: seven cases for missing salary, verified-holiday shortage, genuine empty results, unknown holidays and truncated lists.
- Unchanged: account identity, RLS, RPCs, document storage, save/delete and source-of-truth job values.

## Verification matrix

| Journey | Web | Android | iOS |
| --- | --- | --- | --- |
| Salary input missing vs. zero matches | Source-confirmed `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59` | Real-source Node unit PASS; rendered QA pending | Real-source Node unit PASS; rendered QA pending |
| Insufficient verified holidays | Web source-confirmed | Unit PASS, no native runtime | Unit PASS, no native runtime |
| Returned count, unknown holidays and more-results count | Web source-confirmed | Unit PASS, canonical E2E pending | Unit PASS, canonical E2E pending |
| Job detail navigation | Web link `/jobs?job_id=` | Existing Native `/job/[id]` maintained; device QA pending | Existing Native route maintained; device QA pending |

Local Node 22.16.0: `node --experimental-strip-types --test native/qa/native-career-scenario-disclosure-r272.test.mjs` **7/7 PASS**. Isolated genuine-helper `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext native/src/lib/careerScenarioPresentation.ts` **PASS**. Native full Expo typecheck, rendered QA, canonical save/readback, and both signed OS builds **not performed**.

## Cost, handoff and next

No new dependencies, paid Actions/EAS, CI reruns, auth/DB/RLS/Worker writes, main write or store submissions. Current connected runtime has Node/npm but no usable Android emulator or macOS/Xcode; signing/distribution not verified. Previous r271 ledger recorded zero Cloudflare Worker build triggers for this repo. Remaining cost quota unconfirmed.

Next: test actual Web/Android/iOS synthetic-result screens; verify returned-state labels, long Japanese text, text scaling, missing-data retry and search→detail in real Native runtime; then canonical data readback. `READY_FOR_MASA_ACCEPTANCE` remains blocked on complete two-OS parity plus signed delivery.
