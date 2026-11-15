# COLOR JOBSEEKER r279 — Native filter choice selected-state parity

## Frozen reference / ownership
- Web: `src/App.tsx` on `main` SHA `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`, signed-in synthetic candidate selecting prefecture/employment type, source reviewed 2026-11-16. Native reference: `native/src/app/(tabs)/jobs.tsx` at HEAD `41d0792ca210c57f9614671b4f038e06d804d2a1` before this patch.
- Writer: COLOR ChatGPT-side Native implementer, branch `native/color-jobseeker-integration-r216-20261114`. Open PR search returned 0; source SHA and branch HEAD rechecked before ref update. No other paths/owners touched.

## Gap closed
- Web `<select value>` exposes the active choice; Native picker previously rendered identical rows without indicating which current filter was selected. With many prefectures, it was easy to clear or change the wrong filter. The Native modal now visibly marks exactly the current candidate-owned filter choice, including `指定しない`, and exposes selection through React Native accessibility state. The two filter chips and keyword input also expose persistent Japanese accessibility labels.
- Adds a pure selection helper and focused source tests. Existing authenticated facet sources, search/permission rules, canonical RPC, and selection-triggered search remain unchanged. A stale, dismissed modal choice is ignored when `picker` is `null`.

## Verified / not verified
- Local Node 22.16 real helper test: `node --experimental-strip-types --test native/qa/native-job-search-facet-selection-r279.test.mjs`: 3/3 PASS.
- Strict helper TypeScript: `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext native/src/lib/jobSearchFacetSelection.ts`: PASS.
- Native jobs.tsx component source wiring inspected after transformation; no Expo packages available to compile/render screen. Existing r278 real helper tests also run in this environment (3/3 PASS, prior source checkpoint).
- Android SDK/emulator, macOS/Xcode/iOS simulator unavailable. No Android/iOS screenshots, native interactive testing, canonical live API readback, signed APK/AAB/IPA/TestFlight. Native runtime and MASA acceptance remain unverified.
- `ci.yml` main pushes and pull requests only; no PR/main/production changes. No paid runners or agents invoked. Cloudflare deployment is not performed; release/build quota and signing access remain unverified.

## Next
- On real Android and iOS: open both filter modals with a synthetic candidate, check selected state across scroll, 200% text, empty, error and retries, screen reader, keyboard and bottom safe area. Compare with frozen Web state, then test search → job detail → document selection → application → message with canonical test account (never send to live users).
