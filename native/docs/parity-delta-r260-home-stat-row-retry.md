# r260 — Web Home stat-row error/retry parity

**State:** IMPLEMENTING (source-tested; NOT Native-render-verified). 2026-11-15 NZ.
**Owner:** COLOR jobseeker only; `workmarketjp-gif/app.hoikucolor-recruit` branch `native/color-jobseeker-integration-r216-20261114`.
**Base:** `55cab9cc35d7e20964a63cd71a830459315cab72`.
**Web reference:** `src/App.tsx`, `HomeView` / `StatRow` at Web main `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`, synthetic signed-in candidate; populated, loading, failed application/attention reads. Web's failed value-null row retries the failing resource in place, loading uses an ellipsis, confirmed counts remain navigation actions.

## Change
- Both Native Home statistic rows now match the Web's row-specific retry interaction for an unknown value with a confirmed error; no navigation using stale/failure-as-zero counts.
- Loading/unknown display `…`, confirmed values display exact counts without the duplicate "件", errors say `読み込めませんでした`; the row's accessibility action describes retry.
- Reuses existing pinned, owner-checked canonical `applicationProgress.refresh` and `notifications.refresh`, suppresses unhandled UI callback rejections; no new data privileges, API, backend or dependency changes.
- Removes duplicate application error retry card. Keeps the independent notification partial-warning notice only if the message count has been successfully confirmed.

## Evidence and limits
- Linux Node v22.16.0: new helper behavioral tests **5/5 PASS** before GitHub write. The sixth regression checks real `home.tsx` wiring, source patterns verified by the connector against the modified real file; the full six-test Node command is **not claimed run** without a full checkout.
- Existing exact-`r259` helper regressions **16/16 PASS** using the prior evidence ZIP; **not** a typecheck or runtime result for this new SHA.
- `tsc --noEmit --strict --target es2022 --module esnext --skipLibCheck native/src/lib/homeStatRowPresentation.ts` **PASS** (local isolated file). Expo project/full TypeScript and React Native rendering unavailable, so no Android/iOS source build success claimed.
- GitHub `.github/workflows/ci.yml`: push only `main`, PR event unspecified; this non-PR development branch is not a main push. Cloudflare connected account: the two matching Worker build trigger lists were empty before this write (2026-11-15); Pages projects list empty. No paid CI/EAS/Production triggered deliberately.

| Workflow | Android | iOS |
| --- | --- | --- |
| Home application/message count error → same-row canonical retry | IMPLEMENTING: helper/wiring source checks only | IMPLEMENTING: helper/wiring source checks only |
| Unknown/loading vs confirmed counters, screen-reader label | IMPLEMENTING: source only | IMPLEMENTING: source only |
| Rendered UI, font scaling, keyboard, canonical save/readback | NOT VERIFIED: no Android SDK/emulator | NOT VERIFIED: no macOS/Xcode/simulator |
| Signed acceptance build | BLOCKED_EXTERNAL: runner/signing unavailable | BLOCKED_EXTERNAL: signing/authorized distribution unavailable |

**Next:** full Expo typecheck on locked deps; compare Web and actual Native at 320/375pt, error/retry and confirmed states; then continue the remaining in-scope screens. Store/publication, production DB/RLS/auth/Worker, main and cross-task code untouched. Quota balance not verified.
