# Hoiku Color JOBSEEKER Native — r273 region selector parity

## Frozen comparison and ownership
- Web source baseline: `main 5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`, `src/views/CareerCompanion.tsx` (prefecture <select>) and `src/views/CareerView.tsx` (full region <select> with canonical coverage counts); reviewed 2026-11-16 NZ in a **synthetic authenticated jobseeker** state. A deployed SHA and real rendered screenshots are not verified.
- Android/iOS source baseline: `native/color-jobseeker-integration-r216-20261114`, prior HEAD `5c1588766c44a506ac1ad417750f341fadcc6567`. Single COLOR Native writer, no open PRs as checked before this change. No other repository owner path touched.
- Canonical data source remains `getPostedSalaryMarket` -> `hc_jobseeker_salary_market_v1` and existing candidate/session-pinned reads. This patch is presentation only.

## Reproduced gap
- Previous Native `さがす地域` accepted arbitrary free-text prefectures and showed only the **first 12** canonical coverage entries as chips, while Web uses a selected-value control with **all** available reported prefectures and the current saved selection.
- The Native control now opens an OS-accessible modal selection list with `全国の求人` plus **all** reported prefectures, Japanese-language sorting, current selection/checked state and close/Android-back behavior. Web's full `/career` count labels show only safe actual RPC values; a saved prefecture absent from the returned coverage remains selectable but is not claimed to have zero jobs.
- No new market queries, location inference, persistence writes, analytics events, external links, false results, changing RPC parameters, or new dependencies. Existing 5-tab and candidate data permissions remain unchanged. Android/iOS use the same React Native component.

## Focused source verification
- `cd native && node --experimental-strip-types --test qa/native-career-region-web-select-r273.test.mjs`: **6/6 PASS**, based on the identical new helper blob.
- `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext src/lib/careerPrefectureOptions.ts`: **PASS**, only helper; it is **not** full Expo/React Native typing.
- Node 22.16.0, npm 10.9.2, TypeScript 5.8.3 on Linux. No Android SDK, Android emulator, macOS/Xcode/iOS simulator in this runtime. Expo package installation, current signing identities, build/distribution permissions, Cloudflare Worker triggers and billing headroom are not verified. No full app typecheck, real native rendering, canonical integration readback, signed install or device acceptance is claimed.

## Changed paths
- `native/src/components/CareerExperience.tsx`: replace arbitrary region text and top-12 chips with full select control
- `native/src/components/CareerPrefectureSelect.tsx`: compact accessible modal region list
- `native/src/lib/careerPrefectureOptions.ts`: full canonical coverage projection
- `native/qa/native-career-region-web-select-r273.test.mjs`: targeted functional source test
- This delta document

## Web-to-device matrix
| Reference | Android | iOS | Canonical source | Blocking QA |
|---|---|---|---|---|
| Web `/` dashboard `さがす地域` select | IMPLEMENTING; source changes only | IMPLEMENTING; source changes only | salary-market facets + selected private preference | Real Native screenshot, long Japanese labels, text scaling, modal dismiss, empty/error, owner switch |
| Web `/career` region selector with posted count | IMPLEMENTING; source changes only | IMPLEMENTING; source changes only | salary-market coverage returned by RPC, never locally estimated | Native render at small/normal size, actual RPC read, region switch -> details query |
| Signed installable acceptance candidate | BLOCKED_EXTERNAL | BLOCKED_EXTERNAL | Exact future candidate SHA | Android SDK/keystore/build path; iOS Xcode/signing/TestFlight or authorized internal path |

Next: safely run a full Expo `tsc` against installed dependencies if an authorized runtime becomes available, then compare real Web/Android/iOS with the same synthetic jobseeker, including all 47-region-like long lists, close/back, error-state and session-switch behavior. Fix any issues before handoff. No change to main, PR, production, DB/RLS/Workers or store publication.
