# r262 — Web Home independent attention state

**State: IMPLEMENTING.** 2026-11-15 NZ. **Owner:** COLOR Jobseeker Native UI/adapter/regression only.

## Provenance and single-writer boundary

- Repo: `workmarketjp-gif/app.hoikucolor-recruit`
- Branch: `native/color-jobseeker-integration-r216-20261114`
- Pre-change branch HEAD: `ad8cffff8071c7879ea931fc83d96e4ef685fda2`
- Implementation commits: helper `01cd55d8c5c0e0b183fec7d57e3486fd02579239`; regression `d3e0738c2252b6f94f22a203ff3e52e36ce835c9`; Home wiring `b1f90f1ae914d72c473c6fc47dc4c629b859eec0`.
- The GitHub open PR collection was empty when checked. No main, Web, shared API/schema, Staff, Family, DB, Worker or Production writes. No force push.
- `.github/workflows/ci.yml` has push only on main and PR events; this branch-only change does not meet those event conditions. Cloudflare Pages project lists for both connected accounts were empty at this run; Workers Build trigger connection not independently verified, so related cost exposure is not asserted zero. No manual Actions/EAS/Build/external agent was launched.

## Web source of truth and closed gap

- Version: Web main `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`, `src/App.tsx` / `HomeView` / `StatRow`. Comparison date 2026-11-15 NZ; signed-in candidate role, *synthetic* empty, partial failure and pending-item cases.
- Web's Home receives the canonical attention summary independently from the notification center's unread badge count. `HomeView` shows the calm state once both application and attention resources succeed with genuine zero counts.
- Native `NotificationContext` combines failed unread badge count and failed attention reads into a single warning. Before r262 `home.tsx` handed that combined warning to the Home calm gate, so an **independently successful zero attention summary** was incorrectly treated as Home failure. An unrelated badge warning also displayed an extra Home alert not present on Web.
- Added `native/src/lib/homeAttentionReadState.ts`, used by `native/src/app/(tabs)/home.tsx` to treat a current owner-pinned valid attention summary as loaded independently from the aggregate notification warning. Only an absent attention summary receives the error/unknown state. Removed the extra badge-warning-only Home card. Existing message-row retry, all pending counts, error/unknown protection, buttons and routes remain.
- This is a display/interaction correction, **not** a relaxation of canonical permissions or a change to badge state. The notification center still retains its warning and retry.

## Verification and evidence

- `node --experimental-strip-types --test qa/native-home-independent-attention-r262.test.mjs`: **5/5 PASS** using exact GitHub-matching helper/test blobs, with existing `homeCalmNavigation.ts`.
- `tsc --noEmit --strict --target es2022 --module esnext --skipLibCheck src/lib/homeAttentionReadState.ts src/lib/homeCalmNavigation.ts`: **PASS, scoped pure TS only**.
- SHA comparison after GitHub write: helper `62b43d38a1bdfcb0e02ea65c9e61fb185fad4b11`, regression `cfe4f33acad8d85613b97faee447c15679208725`, unchanged gate `b1b0678dde97b0667c51862c7ed083568285ae12`. Home read-after-write blob `3a6db54557fe42865cbcd53c04a41865579cee07`.
- Read-after-write structural checks: helper import, independent loaded/error wiring, message-row error, unchanged message navigation and extra-notice removal were all confirmed.
- Existing `native-home-calm-navigation-r259.test.mjs` still correctly requires a *true attention read error* to block calm. Its existing source was not altered.
- **Not evidence of full Expo TS, actual React Native render, production RPC, physical-device QA or build.** `npm` dependencies are not installed in this runtime, and direct git clone fails DNS. This is a narrow real-source Node test, not a fabricated framework environment.

| Gate | Android | iOS |
| --- | --- | --- |
| New r262 Home attention source behavior | Scoped Node PASS; runtime NOT VERIFIED | Scoped Node PASS; runtime NOT VERIFIED |
| Home rendered visual/density/keyboard/empty/error against Web | NOT VERIFIED; Android SDK/emulator unavailable | NOT VERIFIED; macOS/Xcode/simulator unavailable |
| Canonical save/re-read, auth/account switch and push delivery | NOT VERIFIED on OS | NOT VERIFIED on OS |
| Signed installable handoff artifact | NOT AVAILABLE; signing and distribution unverified | NOT AVAILABLE; TestFlight/ad-hoc/internal permission unverified |

**Next:** continue remaining in-scope Web-to-Native functional gaps and focused tests, then validate Android/iOS Home in actual Native runtime and with owner-pinned synthetic API responses once an authorized runner is available. Do not set READY_FOR_MASA_ACCEPTANCE or imply a signed candidate. No new paid usage authorized.
