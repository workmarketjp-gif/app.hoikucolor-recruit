# COLOR JOBSEEKER Native r275 — quick salary path independent of detailed simulation

## Verified reference and ownership
- JOBSEEKER Web `src/views/CareerPaths.tsx` at main `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`, read 2026-11-16, signed-in synthetic state, no deployed Web screenshot.
- Native single-writer branch `native/color-jobseeker-integration-r216-20261114`; before HEAD `cef7434876a9e864f45e5d683f9db58a58ab9410` (confirmed identical to branch), screen blob `7a12e5373b76196fe1f01ecd0713969ce5dbcfa7`. No open PRs at gate; root/native AGENTS.md absent. HQ #265 MINIMUM_COST_V1 and shared #467 observed.
- Only Native CareerExperience presentation, pure helper and dedicated regression touched. Web/backend/schema/admin/production unchanged.

## Closed source gap
- Web `CareerPaths` always evaluates the quick salary path with `scenarioSalaryLine('keep-income', own, null, desiredMinimum)`, independently of the selected detailed simulator scenario.
- Native quick-search RPC already used that line, but both salary-prompt/result branches incorrectly tested `salaryLine` from the detailed scenario. For `more-holidays` + no current salary + existing desired minimum, the RPC could return valid results while the UI showed the missing-salary prompt.
- Native initially always chose the holidays path even when Web defaults to the salary path for an available current/desired salary line.
- The two quick-path branches now use the quick salary line; the initial tab selection and explanatory copy follow Web. No RPC arguments, account permissions or personal-data persistence changed.

## Focused evidence
- Local isolated Node v22.16.0: `node --experimental-strip-types --test qa/native-career-quick-salary-path-r275.test.mjs qa/native-career-region-web-select-r273.test.mjs qa/native-career-facet-history-r274.test.mjs` — 18/18 PASS (new 4, existing 14).
- `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext src/lib/careerQuickSalaryPath.ts src/lib/careerPrefectureOptions.ts` — PASS, helper-only; NOT full Expo typecheck.
- Actual native screen source checked at the branch and both old conditions replaced; post-push source SHA and wiring verified separately. Test dependencies from previous r274 checked against saved exact source blobs.
- Cost gate: GitHub CI only on main push or any PR (native Android job compiles release APK); no PR or main push. Cloudflare Pages projects count 0 in two connected accounts and target Worker build triggers 0. Billing quota unknown; no paid CI/EAS/build.

## Web → Android/iOS
| Flow | Android | iOS | Required next evidence |
|---|---|---|---|
| Current monthly or desired minimum salary opens quick salary search regardless of detail scenario | IMPLEMENTING (source and focused test only) | IMPLEMENTING (source and focused test only) | Real Native render and canonical RPC result / job detail |
| No salary line shows editable salary input, not an empty-results count | IMPLEMENTING (source and focused test only) | IMPLEMENTING (source and focused test only) | Device keyboard, small screen, text scaling, Web comparison |
| Default exploration path matches available salary line | IMPLEMENTING (source and focused test only) | IMPLEMENTING (source and focused test only) | Device cold/warm load, account switch |
| Installable signed candidate | BLOCKED_EXTERNAL | BLOCKED_EXTERNAL | Android SDK/emulator/signing or iOS Xcode/simulator/TestFlight/ad-hoc authorization |

No Android/iOS runtime evidence, full Expo typecheck or signing/distribution approval is available from this Linux run. State remains IMPLEMENTING, never developer-verified or ready for MASA acceptance. Next is canonical search→detail→apply→message E2E plus two-OS visual parity on authorized runners.
