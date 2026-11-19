# COLOR Native r377 — stale application-index rows cannot open detail after failed re-read

## Scoped reference / ownership
- Web JOBSEEKER `/applications` as secondary profile destination, `src/App.tsx`, main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c` (component blob `21bbe8abf51ceee657266ff286593c8af784f399`), inspected 2026-11-20 NZ. Synthetic candidate A with an initially confirmed application list; a later explicit refresh fails. This is a source/state reference, **not** a deployed-SHA capture or paired rendered image.
- Native parent `4ba2bf92dfce5430ce0e0441490658bad79566d6` (r376), isolated writer branch `native/color-application-stale-row-gate-r377-20261120`. Open PR search was empty before editing. No other repo/path ownership was taken. AGENTS.md was not found in the repository root or native root. #467 and HQ #265 MINIMUM_COST_V1 apply.

## Confirmed gap / change
- Before r377, `(tabs)/applications.tsx` preserved its same-session, previously verified rows on manual refresh, and showed a stale-data warning if canonical `listApplications` failed. However `openApplication` rejected only pending loading and could still navigate to one of those unverified rows: the failure catch retained `freshlyVerifiedOwner` for displaying its error. This was inconsistent with the message-inbox rule prohibiting actions after failed canonical refresh.
- Added `src/lib/applicationVerifiedNavigationPolicy.ts`. A row becomes actionable only if the list is present, exact candidate/session is freshly verified, private access remains allowed, no read is in flight, **and the current refresh has not failed**.
- Wired that rule into the application card's enabled/accessibility state and the synchronous press handler, while preserving existing previously confirmed rows and the explicit stale-data warning. A successful manual retry can re-enable the cards; duplicate-tap and pinned-session/detail authorization remain unchanged. No backend, API, database, RLS, document or send mutation.
- `[]` is a valid confirmed empty list, not an error; navigation still requires an individual application ID in the already-existing `messageNavigationLeaseIsCurrent` gate.

## Evidence / per-OS matrix
- Local Linux/Node v22.16.0, global TypeScript 5.8.3; source retrieved from GitHub connector. Real helper test: `node --experimental-strip-types --test qa/native-application-stale-row-navigation-r377.test.mjs` => **7/7 PASS**.
- Scoped helper-only TypeScript: `tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --allowImportingTsExtensions src/lib/applicationVerifiedNavigationPolicy.ts` => **PASS**. This is **not** an Expo app-wide typecheck.
- GitHub-vs-local blob SHA verification: helper `2c7a6757f45c492b7afcd4d5e8948459e1aff1ac`, regression `8d958246bd59b5617974dacd2e81025907273d70` both match local git hash-object; `(tabs)/applications.tsx` changed `7ac7d42f82fd05f857f4fcbefe6e2eff61ab6056` -> `337d89e6243e5c0686cb7613d809547164e5e5be` and its import, derived read-failure gate, press-handler guard and disabled/accessibility state were re-fetched and checked. **Static TSX wiring only; no React Native render.**
- Android: **IMPLEMENTING**; Android SDK, adb, emulator not present here; no installed app, Web comparison, synthetic canonical save/readback, signed APK/AAB proof.
- iOS: **IMPLEMENTING**; Linux runner without macOS/Xcode/simulator; no installed app, Web comparison, synthetic canonical save/readback or authorized TestFlight/ad-hoc artifact.
- Overall: **IMPLEMENTING**, not DEVELOPER_VERIFIED / READY_FOR_MASA_ACCEPTANCE. Full Expo dependency tree, signing/distribution permissions and safe synthetic backend credentials still need verification.

## Cost / release / next
- `.github/workflows/ci.yml` has push: main and pull_request triggers. Work is in an isolated feature branch with **no PR, main write, Production, release, new Actions/EAS dispatch or Store action**. GitHub baseline commit reported no combined statuses and no PR-triggered workflow runs. Cloudflare branch-trigger setting has not been freshly revalidated; no explicit deployment called.
- Additional billable usage, account quotas, signing identity and distribution permissions: **unverified**, not claimed free.
- Next: once Expo dependencies/safe synthetic credentials are available, verify the complete search/saved → apply → applications → messages readback, including failed refresh/retry on both OSes, same-state rendered Web parity and signed installable handoff. Until then continue independent source work without downgrading acceptance.
