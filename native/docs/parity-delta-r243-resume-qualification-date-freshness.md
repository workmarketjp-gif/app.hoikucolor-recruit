# r243 — /resume qualification acquisition date freshness (2026-11-15 NZ)

State: **IMPLEMENTING** (Native source-level change and focused tests only; Android/iOS render and canonical live API NOT verified).

## Frozen reference and owner
- JOBSEEKER Web `/resume`, repository `workmarketjp-gif/app.hoikucolor-recruit`, Web `main fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6` and `src/views/ResumeBuilderView.tsx` blob `61859463d2103b8323446a8dbbb1d6297cedc749`. Reviewed from source on 2026-11-15 NZ with *synthetic* signed-in candidate: two declared qualifications, unknown legacy qualification and acquisition dates. Actual deployed Web SHA/screenshots NOT established.
- Native writer: this COLOR Commander, isolated development branch `native/color-jobseeker-integration-r216-20261114`, prior HEAD `d70fc0a1d6dfdf79d374faae2c96062042f3d9e5`. Open PR #113 covers Hello Work documentation only and was not modified. No root or native AGENTS.md was present at verified paths; #467 and HQ #265 minimum-cost/scope gates followed.

## Closed SOURCE gap
- Native `ResumeChildcareEditor` previously built each acquisition-date map from captured `qualificationAcquired` props and passed a whole replacement map to the parent. Rapid picks in different qualification rows could overwrite one another. Removing a qualification and subsequently receiving its old picker event could resurrect an orphan date. Multiple quick qualification chip presses could also calculate selection from stale props.
- A functional draft transform now reaches the parent `edit(current => ...)`, so each date mutation derives from its current canonical résumé draft. Synchronous selected-qualification and acquisition-date refs protect against batched local events; an unselected qualification cannot regain a date. Removing a qualification prunes only unselected dates. The profile RPC and résumé RPC remain distinct unchanged canonical contracts.
- Existing Web qualification catalog, 50-item limit, unknown saved values, 1200ms save policy and no-automatic-retry-on-ambiguous-save are unchanged. No real candidate documents or messages were used.

## Actual verification and remaining gate
- Focused Node 22.16.0 `node --experimental-strip-types --test qa/native-resume-qualification-date-concurrency-r243.test.mjs`: **7/7 PASS** against the exact local helper source, including simultaneous dates, late picker, item removal, unknown qualification, idempotence and 50-item boundary.
- Strict isolated helper TypeScript `tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck src/lib/resumeLinkedProfilePolicy.ts`: PASS with system TypeScript 5.8.3. This is **not** Expo's locked `~5.9.2` whole-app compile.
- Native screen/parent wiring requires GitHub postwrite verification; no React Native component render, iOS simulator, Android emulator, real RPC save/readback or physical device acceptance was performed. The environment lacks a direct GitHub DNS checkout, installed Expo project dependencies, Android SDK/emulator, macOS/Xcode and verified signing/distribution credentials.

| Web /resume workflow | Android | iOS | Required remaining evidence |
| --- | --- | --- | --- |
| Qualification chip/ custom qualification selection | IMPLEMENTING, source only | IMPLEMENTING, source only | Native mounted UI + actual save/readback |
| Qualification acquisition date choice, clearing, rapid edits, removal | IMPLEMENTING, source only | IMPLEMENTING, source only | OS picker/keyboard/render and canonical resume/profile readback |
| Resume privacy, long Japanese labels and text scaling | NOT VERIFIED | NOT VERIFIED | same-state screenshot comparison |
| Installable signed acceptance build | NOT AVAILABLE | NOT AVAILABLE | approved signing/build route |

No main, PR, shared API/schema, DB/RLS/auth, Worker/Cloudflare or Store publication changes. No paid Actions, EAS or external coding agent requested; billing quota unknown. Next work: Expo-integrated typecheck, real UI tests on both OSes and canonical synthetic resume/profile save→readback.
