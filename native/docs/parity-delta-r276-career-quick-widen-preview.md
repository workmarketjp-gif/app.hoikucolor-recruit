# COLOR JOBSEEKER Native r276 — Web quick-result nationwide recovery and three-card preview

## Versioned baseline, ownership and scope

- JOBSEEKER Web `src/views/CareerPaths.tsx` main `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59` (blob `ba4267c95850ac0cf2910a8f91d4356251e5164d`), inspected 2026-11-16. Authenticated synthetic candidate; salary or holidays exploration, a selected prefecture, empty/insufficient verified response and six hypothetical canonical rows. **Source comparison only**, not deployed screenshot/actual backend data.
- COLOR Native-only single writer: `native/color-jobseeker-integration-r216-20261114`, original HEAD `35e3d6777f9d8ec971f121ca24391879f27efd85`. No open PRs at pre-write gate. Root and `native/AGENTS.md` absent. Read HQ #265 MINIMUM_COST_V1 and owner #467. Other app, LP/SEO, Hello Work, recruiting administration, shared backend and release paths untouched.
- Prior r275 quick salary logic preserved. No re-audit of historic contract inventory.

## Web → Native source gap closed

- Web quick salary/holiday `PathResult` offers **全国の求人で探す** when a *regional* canonical result is empty; it offers the same recovery for insufficient verified holiday data. Native quick results previously stopped at an empty notice and generic jobs link. The Native action now resets only the selected prefecture to nationwide; existing owner/session-pinned scenario hooks perform the ordinary canonical read again, with stale-response generations discarded.
- Web quick results show at most **three** job cards and a truthful `ほかのN件も求人を探すで見る` link. Native previously displayed the entire returned quick array, obscuring the Web layout. It now shows three quick cards and derives the remaining count from **canonical total minus actually previewed count**. Advanced simulator results remain untruncated.
- Regional positive results visibly show `（県名）`; nationwide shows `（全国）`. No result, salary/holiday metric, ranking or permission is fabricated. Salary-missing input is not treated as an empty search. The existing generic jobs navigation remains available.
- Removed a duplicate, stale `setPath` immediately following the approved helper-based r275 default; no saved data or RPC altered.

## Actual source and focused evidence

- Changed `native/src/lib/careerQuickResultActions.ts` (new), `native/qa/native-career-quick-result-widen-r276.test.mjs` (new), `native/src/components/CareerExperience.tsx` (modified), this delta.
- Isolated Linux Node v22.16.0, real checked-source helpers; `node --experimental-strip-types --test native/qa/native-career-quick-result-widen-r276.test.mjs native/qa/native-career-quick-salary-path-r275.test.mjs native/qa/native-career-scenario-disclosure-r272.test.mjs`: **18/18 PASS** (new r276 7, r275 4, r272 7).
- Global TypeScript `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext native/src/lib/careerQuickResultActions.ts native/src/lib/careerScenarioPresentation.ts native/src/lib/careerQuickSalaryPath.ts`: **PASS, helpers only**.
- New helper and test Git blob SHA were checked against the exact tested local files: `46ccca0a12de53b38887dacf0b71b3d9ef3a4fb9` and `397a896e518e2c16e65f6151a6ee0105a8f44cfe`. Unchanged r272 helper SHA `4d710d3e1c723e8a88e85aa9032ab22558090e6d`. Updated screen SHA `0b57e26b3b011c037552389c682f22557c4e1277`; direct GitHub source wiring verified. This is **not a full Expo TSX compile or Native render**.
- GitHub CI on PR/main only; no PR/main push. Connected Cloudflare accounts: Pages projects 0, `app-hoikucolor-recruit` Worker build trigger list empty; other release hooks/remaining billable quota not established. No Actions/EAS/paid agent/API or release invoked.

## Web → Android / iOS matrix

| Scenario | Android | iOS | Required independent acceptance evidence |
|---|---|---|---|
| Regional quick salary/holiday 0 jobs → widen nationally → canonical refresh | IMPLEMENTING (source 7 new tests) | IMPLEMENTING (same source) | Platform-rendered action; region cleared, fresh RPC and correct result, small screen |
| Regional verified-holiday insufficient → nationwide, missing salary remains editable | IMPLEMENTING | IMPLEMENTING | Authenticated synthetic data, retry, error and keyboard parity |
| Three quick cards, canonical remaining count, real job detail link | IMPLEMENTING | IMPLEMENTING | Same-state Web/Native screenshots, large Japanese text, screen reader |
| Advanced career simulator preserves all existing results | IMPLEMENTING (no behavior change intended) | IMPLEMENTING | Existing advanced flows/regressions on actual platform |
| Signed installable candidate and private persistence/security | BLOCKED_EXTERNAL | BLOCKED_EXTERNAL | Android SDK/emulator/keystore; iOS macOS/Xcode, signing and authorized distribution; canonical backend validation |

## Next and release constraints

- Priority next: canonical `求人検索 → 詳細 → 応募 → メッセージ` integrated synthetic QA, the two-OS Web visual parity matrix, and an Expo SDK-backed whole-app typecheck.
- Linux has Node/npm and isolated writable files, but no Android SDK/emulator or macOS/Xcode. Expo dependencies are not installed; signed Android and iOS artifacts, application IDs/build identities and distribution permissions unverified. **No developer-verified two-OS build or physical acceptance**.
- No production DB/RLS/auth/Storage/Worker change, no real application/message/scout or tester invitations, no PR/merge or release. Status: **IMPLEMENTING**, not `READY_FOR_MASA_ACCEPTANCE`.
