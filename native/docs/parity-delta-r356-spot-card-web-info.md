# COLOR Native r356 — Spot job card information parity

State: IMPLEMENTING. Source inspection: 2026-11-19 NZ. No native render or signed candidate claimed.

## Provenance, ownership and Web baseline

- Owner: COLOR JOBSEEKER ChatGPT Commander, isolated branch `native/color-vault-web-default-r341-20261119`, head before this ledger `6dbc50affe2a2dc89f834cd0d15bc5e5ae1a8656`. GitHub PR query returned zero open PRs; no other paths changed.
- Canonical Web route: `/spot` under jobseeker role, source `src/views/SpotJobsView.tsx` on main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, Web file blob `aa395794adde80d42d3b0c3c8425ee1744d7974e`. **Source inspection only**, not deployed/rendered capture. Synthetic state: spot card with positive remaining slots, optional closing timestamp, and zero/nonzero confirmed assignments; no real candidate details.
- Native screen `native/src/app/spot-jobs.tsx` previous blob `1230973325731666b3c0fadb81d5a99fdf403542`, new blob `c02960b323d50f938a16bdc56d751a53fa918512`.
- Web mobile navigation is currently `ホーム / 求人を探す / お給料 / 気になる / マイページ` as established by `src/components/CandidateShell.tsx` at the same main. This run did **not** redesign the existing navigation. `応募管理` and `メッセージ` remain accessible as Web secondary destinations.

## Delta matrix

| ID | Web baseline | Native source implementation | Android rendered | iOS rendered | Canonical readback |
| --- | --- | --- | --- | --- | --- |
| SPOT-INFO-01 | Open job card shows `募集終了予定` with Tokyo time when `closing_at` exists | Same label, conditional datetime helper, no additional API call | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| SPOT-INFO-02 | Remaining openings read `確定済みを除く残り N枠` | Same Japanese count label from existing canonical `available_count` | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| SPOT-EMPTY-01 | When there are confirmed shifts and no open spots, empty copy points to existing shift section | Conditional identical copy using existing canonical assignment length | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |

## Code/test evidence

- `native/src/lib/spotJobWebPresentation.ts`: code commit `bf40d73f0fa8c120c2d72529c3067e0080882b29`, blob `8ac6463fd0174358db75127f01d1c6bd80279819`.
- `native/qa/native-spot-web-card-presentation-r356.test.mjs`: test commit `53a27ef861f63e8ab00ef5c9fdc2588941416d52`, blob `ef7b58f99cc0a9325cc0c1393db3c01171985c58`.
- `native/src/app/spot-jobs.tsx`: integration commit `6dbc50affe2a2dc89f834cd0d15bc5e5ae1a8656`. Four targeted replacements verified on GitHub re-read, blob as above.
- Real authored helper/test file bytes were materialized in isolated Linux workspace; local `git hash-object` outputs match GitHub blobs exactly. `cd native && node --experimental-strip-types --test qa/native-spot-web-card-presentation-r356.test.mjs`: **4/4 PASS**. `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext src/lib/spotJobWebPresentation.ts`: **PASS**. Initial test expected Japanese month/day ideographs, but the actual Web `Intl.DateTimeFormat('ja-JP')` option combination emits `11/19 14:30`; corrected tests to the Web's actual format before integration.
- No full Expo install/typecheck, no actual React Native render, no synthetic Supabase session, no Android/iOS app or signing evidence. These tests validate presentation functions only, not full Web parity or application runtime.

## Release/cost and follow-up

- `.github/workflows/ci.yml` runs on main push and pull requests, not this isolated branch push. No PR, merge, production DB/Workers, Store publication, paid Actions/EAS or user-facing mutation was triggered by this implementation.
- Cloudflare Native Preview `auto_build=false` is documented in r355. A fresh GET of the particular trigger in this run returned HTTP 404, so current Cloudflare trigger status and actual charges **could not be independently re-confirmed**; do not claim no build without a build-history check. Budget/quota unknown.
- Linux Node v22.16.0, npm 10.9.2 and TypeScript available. Git full clone DNS failed. Android SDK/emulator/adb absent; macOS/Xcode/iOS simulator not available. Android signing, iOS signing and authorized TestFlight/ad-hoc route not verified.
- Next: compare rendered Web /spot with a developer-run Android/iOS candidate for populated/empty/closing/long-Japanese cases; verify canonical Spot RPC readback and continue the next consequential flow gap. Do not mark READY_FOR_MASA_ACCEPTANCE.
