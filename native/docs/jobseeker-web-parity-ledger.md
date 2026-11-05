# Hoiku Color JOBSEEKER Native — source-based parity ledger

Updated: 2026-11-05 (NZ). State: IMPLEMENTING, NOT DEVELOPER_VERIFIED on either platform.

## Versioned reference
- Web source: `workmarketjp-gif/app.hoikucolor-recruit` main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/App.tsx`, `src/components/CandidateShell.tsx`.
- Role/data: authenticated jobseeker; synthetic candidate A/B, synthetic applications and RPC responses; no real candidate records.
- Web routes examined by source: `/`, `/jobs`, `/saved`, `/applications`, `/messages`, `/profile`, `/career`. No same-state deployed Web screenshot was captured.
- **Current authoritative Web mobile five tabs:** `ホーム / 求人を探す / お給料 / 気になる / マイページ`. Applications and Messages are secondary screens accessible from Home/My Page. This supersedes earlier assumed tab ordering; do not promote a sixth tab.

## Branch + ownership
- Sole writer for this isolated candidate: Color Native Commander, `native/color-candidate-session-isolation-20261105`; base `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`.
- Previous detached session-fence fixes (application/saved/job views) attached to this branch without modifying main.
- New work: `native/src/app/messages.tsx`, `native/src/lib/messageInbox.ts`, home/profile entrypoints, message tests and focused test command.
- No shared schema/RLS/Workers/auth changes; no notifications or messages sent.

## Workflow matrix (source integration versus platform verification)

| Web jobseeker workflow | Native branch source | Android rendered + canonical readback | iOS rendered + canonical readback |
| --- | --- | --- | --- |
| Auth, signup, recovery, session restart | Existing source; no new claim this run | NOT VERIFIED for current SHA | NOT VERIFIED for current SHA |
| Search, results, detail, favorites | Existing source; new A/B presentation fence on branch | NOT VERIFIED | NOT VERIFIED |
| Applications/detail/replies | Existing source; new A/B presentation fence on branch | NOT VERIFIED | NOT VERIFIED |
| Messages list, canonical unread, thread entry, scouts link | **Added this run**, source and focused unit tests | NOT VERIFIED | NOT VERIFIED |
| Career + CareerCompanion (Web /career) | Previous isolated candidate, NOT YET integrated | NOT VERIFIED | NOT VERIFIED |
| Profile, resume, documents, privacy, settings, deletion | Existing native source; full parity not asserted | NOT VERIFIED | NOT VERIFIED |
| Navigation Web five-tab equality | **OPEN**: current Native still uses Applications instead of Web Career tab | NOT VERIFIED | NOT VERIFIED |
| Small-screen Japanese visual parity, notifications/deep links | **OPEN** until real runtime comparison | NOT VERIFIED | NOT VERIFIED |

## Tests and environment
- Node v22.16.0, npm 10.9.2. Executed locally against exact SHA-matched new `messageInbox.ts` / `messages.tsx`, existing `attentionApi.ts` and branch owner helper:
  `node --experimental-strip-types --test qa/native-candidate-view-owner.test.mjs qa/native-message-inbox-behavior.test.mjs qa/native-message-attention-adapter.test.mjs` — **22/22 PASS** (synthetic data).
- TypeScript parser: `src/app/messages.tsx`, `src/lib/messageInbox.ts`, `src/lib/candidateViewOwner.ts` — 0 parse errors. This is NOT an Expo/React Native typecheck.
- `git ls-remote` HTTPS checkout blocked by `Could not resolve host: github.com`; project-compatible `node_modules` absent. No full `npm ci` / `npm run typecheck` / emulator or device QA.
- Android SDK, adb and emulator unavailable in this Linux runtime; macOS/Xcode/iOS simulator unavailable. Android/iOS signing and authorized distribution not verified.
- GitHub Actions `ci.yml` triggers on **main** push and PR. Development branch has zero workflow runs after these writes; no PR created. Accessible Cloudflare accounts returned zero Pages projects, but other integrations cannot be excluded; no deploy triggered intentionally.

## Next
Integrate previously preserved `/career` candidate into the checked-out Expo project, then correct the exact Web five-tab order. Run full dependency-backed TypeScript and integration tests before creating a PR/triggering costly CI; then complete both-platform visual/runtime QA and independently signed acceptance artifacts. Never treat source tests as two-platform acceptance.

## Candidate jobs result visibility gate (2026-11-05, same Web baseline)
- Repository branch: `native/color-candidate-session-isolation-20261105`, parent `580f3d5d8127ab1622fcb69481311fbe25e63215`; change scoped only to `native/src/app/(tabs)/jobs.tsx` plus existing owner-test suite.
- Search results and error messages now carry the exact candidate user+session owner key, and old rows, counts and pagination do not render on account/session change or App Lock. Existing search, favorites, detail navigation, backend/RLS remain unchanged.
- Dynamic owner helper regression: Node 22 source tests 9/9 PASS against exact existing helper (previous 9); two expanded tests are committed in the normal owner test suite but **not claimed executed** in complete Expo checkout in this run. Scoped real React Native typecheck, API readback, Android rendering and iOS rendering are all **NOT VERIFIED**.
- Web reference: `src/components/CandidateShell.tsx` and `src/views/CareerCompanion.tsx` at main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, role jobseeker, synthetic test state; actual same-state Web screenshots not yet captured.
- Next: integrate prior tested `/career` UI+RPC candidate with Expo project; restore Web five-tab nav; full dependency typecheck and platform QA remain open. No backend or Production changes.


## Job-search private App Lock/foreground fence (2026-11-05 NZ; same Web baseline)
- Single-writer Color Native branch, parent `aedf98eff26ee4251b1b915654a2901dda0f234b`.
- Source commit `67d312d163c72be7866234229fddbb4f6ab4c590`, regression test commit `6f1aafc77be78c63756ac5afd9d047e44e54f1f6`. Both are **development-branch only**, not merged.
- Workflow: Native 求人を探す → search → App Lock/background privacy shield → unlock. In addition to user/session fences, entry into the shield now invalidates the request generation and clears private query, rows, saved IDs, errors, cursor, counts and pagination. No private search UI renders while private data is unavailable. Unshielding starts a fresh canonical search rather than displaying old cached rows.
- Existing candidate-scoped RPCs and search/detail/save behavior were not changed. No backend/schema/production writes.
- Scoped source verification against GitHub-refetched exact blobs: 11/11 assertions PASS; standalone exact-blob `candidateViewOwner.ts` Node 22 helper tests **9/9 PASS**. Existing unmerged Run 9 career adapter tests run locally **38/38 PASS**, but do not validate these branch changes.
- Two new App Lock-focused regression assertions are committed in `native/qa/native-candidate-view-owner.test.mjs`; **they have not been executed in an exact full Native checkout**. `npm ci`, real Expo SDK typecheck, Android and iOS rendered QA, authenticated readback and signed builds remain **NOT VERIFIED**.
- Local Git HTTPS checkout remains blocked by DNS failure. Push to development branch did not intentionally start Actions (workflows target main/PR or MCP-only paths); Cloudflare Pages list returned no projects in accessible accounts; external integrations and account-specific billing cannot be ruled out. No PR, production action, EAS build or Store action.
- Web-to-platform matrix for this workflow: source lock/reload behavior **IMPLEMENTING**; Android **NOT VERIFIED**; iOS **NOT VERIFIED**. Critical remaining workflow: integrate existing exact-blob-tested `/career` and CareerCompanion Run 9 source candidate with five-tab Web nav, then run dependency-backed tests and per-OS QA.

## Career and Home companion source integrated (2026-11-05 NZ)

- Web baseline: main fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6, CandidateShell.tsx, CareerCompanion.tsx, CareerPaths.tsx, CareerView.tsx, careerRepository.ts, careerSimulation.ts; authenticated jobseeker and synthetic state; NO same-state screenshots.
- Exclusive development writer: Color Commander on native/color-candidate-session-isolation-20261105; starting HEAD 9f3257d3330a653bec2a23f12a5f6d74777a00b8; source candidate 255adb2d1affddd7525237702ca25ea046f4e591 before this ledger update. Main untouched; no PR.
- Closed source gaps: owner-pinned career RPC adapter, canonical conditions save/delete readback, market versus official stats separation, holidays, matching preferences, native career tab, Home companion, native salary-editing and source-referenced histogram. Current verified Web mobile tabs: ホーム / 求人を探す / お給料 / 気になる / マイページ. Applications/messages remain secondary.
- New/edited paths: native/src/lib/careerApi.ts; native/src/components/CareerExperience.tsx; native/src/app/(tabs)/career.tsx; native/src/app/(tabs)/_layout.tsx; native/src/app/(tabs)/home.tsx; native/qa/native-career-api.test.mjs; native/qa/native-web-parity-contract.mjs; native/qa/native-ca01-shell-contract.mjs.
- Private salary display on Home and Career is best-effort screen-capture protected. Async salary queries debounce 300–350ms; generation and pinned owner/session quarantine prevent late results being displayed. This is source intent, NOT OS proof.
- Real execution this run: GitHub blob/commit SHA re-read, V8 execution of extracted type-stripped real-source salary parsers and histogram, canonical save-readback and mismatched-save-rejection function bodies; focused source assertions. Earlier V8 run 17/17 checks and later separate targeted V8 checks passed. Not Node, typecheck, React Native, authenticated RPC, or two-OS QA.
- 13 new Node source regression tests WRITTEN BUT NOT EXECUTED. Intended command from native directory: node --experimental-strip-types --test qa/native-career-api.test.mjs. Container and Python both failed Redis ResponseError. Project-compatible npm, Expo runtime and exact full SDK typecheck NOT VERIFIED.
- Android: rendered parity / canonical readback / signing / APK NOT VERIFIED. iOS: rendered parity / canonical readback / Xcode simulator / TestFlight or ad-hoc delivery NOT VERIFIED. Current state IMPLEMENTING, not DEVELOPER_VERIFIED nor READY_FOR_MASA_ACCEPTANCE.
- CI policy: .github/workflows/ci.yml launches extensive jobs on main push and PR, including Android build. Branch-only commits; no dispatch, PR, main merge, production, EAS, Cloudflare request, Store submission, DB/RLS/Worker or real user action. External Cloudflare Git connection/total billing uncertain; no claim of zero cost.
- Next: dependency-backed npm tests and TypeScript typecheck, correct any compile/runtime failures, same-synthetic-state screenshot Web/Android/iOS comparison, canonical save/readback and account-switch/App Lock, signed Android and authorized iOS installable handoff. Do not create PR or invoke heavy CI before fee/release gate.


## Salary disclosure choice and stale-save fencing (2026-11-05 NZ)
- Source baseline: Web main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/views/CareerCompanion.tsx` SalaryCheck, authenticated jobseeker / synthetic saved salary. Web uses `basis === 'monthly'` to reveal salary only after a choice. Current Native previously auto-selected 月給 when saved conditions existed, revealing private salary on return.
- Native fix: `CareerExperience.tsx` resets the salary basis to unselected on canonical load, uses `disclosedCareerSalary` to gate personal display and save CTA, and checks generation before committing save/delete results. A separate salary-path query can still use owner-only saved conditions, as in Web `CareerPaths.tsx`.
- Local Node v22.16.0 test: `cd native && node --experimental-strip-types --test qa/native-career-salary-disclosure.test.mjs`: **7/7 PASS** for the exact new pure TypeScript helper (null/monthly/hourly/none/unknown/zero/invalid). Component wiring verified by exact-source checks against this branch before writing; **not** React Native behavioral or Expo typecheck.
- Branch-only commit from `0fed601b7bb7105953bbb99ac20551676cc258aa`; main, production, CI dispatch, API/RLS, users' data, paid builds and Store remain untouched. PR/merge withheld because `.github/workflows/ci.yml` runs heavy tests and Android job on PR.
- Android rendered/SDK/readback/signed APK: **NOT VERIFIED**. iOS simulator/readback/TestFlight/ad-hoc: **NOT VERIFIED**. Full Expo dependencies unavailable locally (GitHub DNS). Next: SDK-backed typecheck of this exact branch, same-state Web/Native visual QA and authenticated readback in approved build environment.
