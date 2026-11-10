# Hoiku Color Native r140 — application visits and interview empty-state Web parity

2026-11-11 NZ | **IMPLEMENTING** (source implemented; device/runtime unverified)

## Provenance and ownership
- Real Web source: `src/components/ApplicationDetail.tsx` blob `a07aa957c94a2a2ac80e8e69a58a1e4523149300` on Web main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, observed 2026-11-11 NZ as source only. Route `/applications?application_id=<synthetic UUID>`, authenticated jobseeker with one authorized application; visit empty and visit with confirmed 2h30m booking and candidate note. No Web screenshot.
- Development writer: Color JOBSEEKER Native only; branch `native/color-application-visit-card-web-parity-r140-20261111`, parent `f544470ddb3a7e48b21a4350d70391858099ef25`. Open PR inventory at start: 0. No main write or merge; no shared backend owner touched.
- Target: `native/src/app/application/[id].tsx` blob `62aaa295555632290355aaea7b6694fd95892f12`; `native/src/lib/applicationEventPresentation.ts` blob `13d4107c6e9bad4211132a5689c651b7d39206fe`. Native test blob `96a5e397db98c697f55bc3dafd8953e09f377960`; source contract `124cc39d1e85240e3e985ad7c3f59120ae9a6101`.

## Closed source discrepancies
- Web visit card displays `status ・ duration` and candidate-written visit note, while Native previously displayed only status. Native now uses the **authorized** application detail visit rows for the same duration and note. Duration matches Web's `formatDuration` (elapsed timestamps, rounded minutes, invalid/negative returns empty), without fabricating bookings.
- Empty visit list now explicitly explains that there are no reservations for this job, like Web.
- Interview section heading and no-interview explanatory message now match Web. Existing Native visit booking navigation, scheduled event date, privacy gates, and application RPC remain.
- No Android/iOS-only behavior was presumed; no layout redesign, new data, RLS/API/schema change or real candidate action.

## Genuine tests and limits
- Isolated tested source was reconstructed byte-identically from connected GitHub: original helper blob `c9f6282f4d0a249cd394308bb1e68eb25f8adc5f`, preexisting test blob `aacc9d5aef6f65c5d5aad16e6e448d7e83df94b0`.
- Baseline new Node regression RED: expected missing export; after new implementation, `cd native && node --experimental-strip-types --test qa/native-application-event-presentation.test.mjs qa/native-application-visit-duration-parity.test.mjs` **9/9 PASS** (5 existing and 4 new synthetic tests).
- `tsc --strict --noEmit --target ES2022 --module ESNext --moduleResolution bundler src/lib/applicationEventPresentation.ts` **PASS, pure helper only**.
- Connected GitHub source readback checks **11/11 PASS**, direct text/structure assertions, not a rendered UI test.
- Newly registered `qa/native-application-visit-web-parity-contract.mjs` is auto-discovered by the existing `run-native-contracts.mjs` and Node syntax checked locally. **Full source contract not executed** because full checkout is unavailable. No Expo React Native typecheck, canonical Supabase readback or same-state screenshots.
- `git ls-remote` from Linux failed DNS to github.com; full Expo dependencies not present. Android SDK/emulator/adb unavailable; macOS/Xcode/iOS simulator unavailable; signing credentials and authorized TestFlight/ad-hoc route unverified.

## Platform and acceptance matrix

| Workflow | Native source | Android rendering/canonical readback | iOS rendering/canonical readback |
| --- | --- | --- | --- |
| Application detail: interview / visits / note / duration / empty | Implemented, 9 source-helper tests PASS | **NOT VERIFIED** | **NOT VERIFIED** |
| Search → detail → apply → interviews → messages | Historical source in cumulative branch | **NOT VERIFIED** | **NOT VERIFIED** |
| Installable signed acceptance candidate | Not built | **NONE** | **NONE** |

CI workflow `.github/workflows/ci.yml` is main-push/PR triggered; this branch-only delta intentionally did not open a PR or run paid CI/EAS. Cloudflare/external Git integrations and remaining quota not completely observable. No production, user communication, Store or automation changes.

Next blocker: obtain an existing authorized full Expo checkout with locked deps, execute exact-head component test and `npm run typecheck`, then same-synthetic-state Web/Android/iOS renders and canonical API readback. Use approved signing/distribution only after verification; READY_FOR_MASA_ACCEPTANCE and MASA_ACCEPTED remain **unmet**.
