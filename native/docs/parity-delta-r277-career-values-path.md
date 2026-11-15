# COLOR JOBSEEKER r277 — values-path Web state and CTA parity

## Frozen Web reference and scope
- Web `src/views/CareerPaths.tsx` at main `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`, blob `ba4267c95850ac0cf2910a8f91d4356251e5164d`, inspected 2026-11-16. Route: dashboard's “大切にしたいことから探す”, values option; synthetic signed-in candidate with 0 / 2 selected values. Source reference only; not a deployed/mobile capture.
- Native owner: `workmarketjp-gif/app.hoikucolor-recruit`, `native/color-jobseeker-integration-r216-20261114`, parent `3f8e5549f6f1ded79401ed57d739ddf49f7661ae` (single writer at read gate; no open PRs).
- Changes limited to Native component, deterministic presentation helper, targeted test and this delta; no backend, public Web, Worker, signing or store changes.

## Gap closed
- Web's no-values state offers only **大切にしたい保育を選ぶ** leading to `/scouts`. Native previously offered a premature match CTA even without selected values. Now the CTA depends solely on the canonical candidate preference list.
- With selected values, Native shows the full original ordered Japanese list as read-only chips, then **保育観に合う求人を見る** → `/matches` and **大切にしたい保育を見直す** → `/scouts`. Previously both states showed the same generic buttons and joined values into one line.
- No recommendation, match count, evidence, user privilege or auto-send is inferred. Existing auth shield and owner-bound preference reads remain unchanged.

## Verified source / remaining gates
- Node 22.16.0: `node --experimental-strip-types --test native/qa/native-career-values-path-r277.test.mjs` → **4/4 PASS**, isolated real helper source.
- TypeScript 5.8.3: `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext native/src/lib/careerValuesPath.ts` → PASS (helper only).
- Local Git object hashes: helper `0ea7716f00c59f6a0ec71c6d25f4e235f77a7b67`; test `2282cf926c6adfd1e10f5bdb22b0eaf1c8bedd91`. GitHub blob/hash and screen source wiring must agree at the target commit.
- GitHub Actions CI triggers on main push and PR, not this isolated branch push. Cloudflare Pages project list (2 accessible accounts) was empty; connected Worker `app-hoikucolor-recruit` build trigger includes only `main` and not this Native branch. Unknown quotas remain unknown.
- Android SDK/emulator, iOS Xcode/simulator, Expo full dependency/typecheck, signed installable builds and canonical live integration are NOT available/verified in this runtime. Not developer-render-verified and not MASA-acceptance-ready.

## Next verification
- Render same candidate states 0/2 values on small and standard Android and iOS screens alongside Web; verify chip wrapping / large font / keyboard / bottom action reachability and deep links. Then resume search → detail → apply → message E2E on a safe synthetic backend, without sending real applications.
