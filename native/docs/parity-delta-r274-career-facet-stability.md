# COLOR JOBSEEKER Native r274 — confirmed filter names survive filter changes

## Scope/ownership
- Reference: Web `main 5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`, `src/views/CareerView.tsx` and `src/views/CareerCompanion.tsx`; source compared 2026-11-16 NZ, synthetic signed-in jobseeker. No deployed SHA/paired native screen capture.
- Native base: `native/color-jobseeker-integration-r216-20261114` at `75f5623b5620d47e6221e38d8c844da50f5c7bef`. One COLOR Native writer, no open PRs at gate. AGENTS.md absent at root/native. HQ #265 MINIMUM_COST_V1 and common #467 observed.
- Scope exclusively native `CareerExperience` facet presentation/test. No Web/admin/backend/schema/production change.

## Fixed behavior
- Previously, every region/employment filter edit cleared `selectedMarket`, and the selector derived its choices solely from the cleared response. All previously fetched prefecture and employment type choices disappeared during network loading/error; filtered responses could also shrink the list.
- Keep the *names only* of facets returned by successful, owner-pinned canonical salary-market reads. Merge verified names for region/type changes and preserve selected options. All displayed counts come solely from the current successful RPC; names from prior responses have null/hidden count. No speculative job counts or extra requests.
- Facets cache is strictly in-memory, scoped to the user+session owner key, cleared on `loadBase`, auth/privacy switch/App Lock remount. Stale responses remain guarded by ticket and pinned-session validity. The canonical `hc_jobseeker_salary_market_v1` call and scenario RPC arguments are unchanged.
- Web itself can lose options during a failed/filtered lookup; robust Native interaction preserves the Web's intended selectable facet capabilities without treating transient failure as an empty dataset.

## Validation
- Linux Node v22.16.0 / TypeScript 5.8.3, no Expo packages installed; scoped test of actual helper functions: `node --experimental-strip-types --test qa/native-career-region-web-select-r273.test.mjs qa/native-career-facet-history-r274.test.mjs`: 14/14 PASS.
- `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext src/lib/careerPrefectureOptions.ts`: PASS, helper only.
- Static wiring/provenance assertions against fetched real `CareerExperience.tsx`, to be verified again after push.
- GitHub main-only push CI; PR triggers full CI and Android build, therefore no PR opened. CF Pages project count 0 in both connected accounts, target Worker `app-hoikucolor-recruit` has 0 Workers Build triggers. No paid CI, EAS, Codex, Work, deployment or DB changes.

## Web-to-device matrix
| Flow | Android | iOS | Source and remaining QA |
|---|---|---|---|
| `/career` region reselect after pending/failed filter read | IMPLEMENTING (source only) | IMPLEMENTING (source only) | canonical salary market facets; verify rendered modal, text scaling, real persisted preference, retry |
| `/career` employment type switch/back and error | IMPLEMENTING (source only) | IMPLEMENTING (source only) | confirmed names, canonical counts hidden until new data; verify real device chips, wrapping and readback |
| Signout/account switch/App Lock facet disposal | IMPLEMENTING (source only) | IMPLEMENTING (source only) | owner-key fence + reset; independently verify device session switch |
| Signed installable handoff | BLOCKED_EXTERNAL | BLOCKED_EXTERNAL | Android SDK/emulator + signing / iOS Xcode/simulator + authorized distribution not in this Linux runtime |

Next: actual installed Expo typecheck and Web-vs-Android/iOS synthetic state screenshots, canonical search→detail→apply→message persistence; signed builds only via approved build/signing route. Never call this DEVELOPER_VERIFIED or READY_FOR_MASA_ACCEPTANCE without those gates.
