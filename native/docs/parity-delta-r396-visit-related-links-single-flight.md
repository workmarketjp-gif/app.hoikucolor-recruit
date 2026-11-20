# Color Native r396 — visit card link single-flight / bounded Clerk pin

## Reference and ownership
- Web JOBSEEKER `/visits` reference: existing r395 baseline, Web main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, candidate role, source inspected 2026-11-21 NZ. Synthetic state: one candidate-owned visit card with an application/job link, two immediate taps, delayed or revoked Clerk token. No deployed screenshot or actual Native render captured.
- Native parent: `36f080531d9fa4f557aa194e731adf1d329a9686`, sole-writer branch: `native/color-visit-related-link-gate-r396-20261121`. Open PR search returned none at start. Scoped to Native visits UI, navigation helper and regression test. No Web, shared API, database, Staff or Family changes.

## Defect and correction
- The canonical visit card links could independently start asynchronous Clerk token requests on rapid taps, then issue duplicate `router.push`; indefinitely pending tokens had no bounded presentation deadline.
- Reuse the existing private-read pin deadline (default 15 seconds) for **navigation token acquisition only**, not mutations. Verify one canonical visit row, exact linked target, owner/session and current screen before routing. A synchronous gate prevents same-frame duplicate pins/navigation, holds confirmed navigation until focus cleanup, and invalidates on logout, privacy shield or blur. Rejected/timed-out tokens surface only static retry guidance; no private errors/IDs.
- The two link buttons reflect disabled/busy state while routing. Existing visit request/cancel RLS, receipt idempotency, canonical reads and Web visual identity are untouched.

## Evidence / status
- Isolated real-source Node v22.16.0 before fix: new test RED (two navigations on double tap, indefinite pin). After fix: `node --experimental-strip-types --test native/qa/native-visit-related-navigation-single-flight-r396.test.mjs native/qa/native-visit-mutation-tap-gate-r395.test.mjs` **13/13 PASS**.
- `tsc --noEmit --strict --skipLibCheck --target es2022 --module nodenext --moduleResolution nodenext --allowImportingTsExtensions native/src/lib/visitRelatedNavigationLease.ts` **PASS**. Re-fetched GitHub blob SHA matched tested local helper. Native JSX integration was statically reviewed, not full Expo typechecked.
- Android: shared Native source prepared; emulator/render, actual Clerk/Supabase integration, Web screenshot comparison, signing **NOT VERIFIED**.
- iOS: shared Native source prepared; simulator/render, actual Clerk/Supabase integration, Web screenshot comparison, signing **NOT VERIFIED**.
- State: **IMPLEMENTING**. No PR/main merge, Actions/EAS trigger, Worker/DB/Store publication. Actual billing/quota remains unknown.
- Next: synthetic candidate canonical search → favorite → apply → application → messages readback, then both-OS developer-owned runtime/visual QA and authorized installable signing.
