# r269 — career save/delete postwrite canonical read deadline

**Status:** IMPLEMENTING (source-verified; both OS runtime pending). **Checked:** 2026-11-16 NZ. **Owner:** COLOR JOBSEEKER Native-only. No Staff/Family, Web or shared-backend write.

## Baseline and scope
- JOBSEEKER Web `/career`, current `main` SHA `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`; `src/lib/careerRepository.ts` blob `a6d7f6fa73f8278984c2711820eb5ae68dbb5f2d`; inspected 2026-11-16 NZ. Synthetic authenticated candidate, saved salary/conditions and deletion under a stalled postwrite canonical GET. No production-deployed SHA or browser/Native paired render established.
- Native branch `native/color-jobseeker-integration-r216-20261114`; prechange HEAD `cfb6625d61a05266fb223b4cc88b69571e67fa9e`. Source implementation HEAD before this document `ac3e2b2a888d3c24541f4b89bc58757c80967c40`.
- The earlier r263–r268 fixes guarded uncertain writes and bounded Clerk prewrite token acquisition, but `saveCareerConditions` and `deleteCareerConditions` still awaited an unbounded `getCareerConditions` **after** their successful write RPC. A permanently pending read could strand a busy action and leave an ambiguous committed result without a recovery prompt.

## Change and data/permission behavior
- Added `native/src/lib/careerPostwriteReadback.ts` (blob `b95ef6c2bece9f7600e8a332f417419a44896d3b`), using the existing `boundedPrivateRead` with its default 15-second presentation deadline. It confirms all submitted fields after save and a canonical `null` after deletion.
- Modified `native/src/lib/careerApi.ts` (blob `7f3a559f5f8073a5aecdbb65b199936af7c97866`) to use the helper only for the **postwrite canonical read**. The `hc_jobseeker_save_career_conditions` and `hc_jobseeker_delete_career_conditions` RPCs are untouched and never timed out/retried. Client remains owner-pinned by `CareerExperience`.
- Timeout, missing row, inconsistent row or server failure cannot be acknowledged as saved/deleted. The existing `careerMutationFailure(true)` and `recoveryGate` require an explicit owner-pinned canonical reload before another write; late readback cannot become success. Upstream private exception text remains behind the existing safe Japanese notice. No cache, analytics, backend, RLS or identity changes.
- Existing component `CareerExperience` invokes these same two API methods for salary save, conditions save and delete; this fixes all three without altering the visible Web brand/UI or dropping functionality.

## Focused proof and matrix
- Added `native/qa/native-career-postwrite-readback-r269.test.mjs` (blob `197b6ed0dff295e375afeeb4648575d4de482f36`), testing save match/mismatch/null, delete confirmation, stalled/late canonical read, single-read/no auto retry and privacy-safe upstream error presentation.
- Materialized matching helper/test bytes locally; `git hash-object` equals the fetched GitHub blobs above. On Node v22.16.0: `node --experimental-strip-types --test` r263–r269 focused regressions **51/51 PASS** (r269 8 new tests). `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions` on `privateReadDeadline.ts`, `careerPostwriteReadback.ts`, `careerMutationRecovery.ts`: **PASS**. API import/call sites verified from current GitHub `careerApi.ts` source. This is not a dependency-backed full Expo typecheck or mounted RN UI render.
- **Android:** salary/conditions save and delete postwrite readback **IMPLEMENTING / source-verified**; actual Android SDK/emulator, canonical live save/readback, Web-vs-Native screenshot, account/session recovery and signed APK **NOT VERIFIED**.
- **iOS:** same actions **IMPLEMENTING / source-verified**; actual macOS/Xcode/iOS simulator, canonical live save/readback, paired visual, TestFlight/ad-hoc signed installation **NOT VERIFIED**.
- No `DEVELOPER_VERIFIED` or `READY_FOR_MASA_ACCEPTANCE` claim. No real candidate data used.

## Integration, cost, next
- Prewrite ownership checked: no open repository PR, isolated COLOR branch and same-file writer; GitHub CI `.github/workflows/ci.yml` triggers main push or PR, not this branch-only push. No new PR/main/merge, Cloudflare/Worker/DB/Auth/Store, paid Actions/EAS/Codex/Work/Claude. Worker Git automatic trigger is not reverified this run; quota and signing/distribution authorizations remain unknown.
- **Next:** run full Expo dependency-backed typecheck when an authorized dependency environment exists; in Android/iOS runtime with authorized synthetic identity, test save success, postwrite timeout, canonical reread and next edit; capture paired Web/Native screenshots, keyboard and long Japanese text. Continue independently owned Native gaps while hardware/signing remain unavailable. Do not treat source tests as OS acceptance.
