# COLOR JOBSEEKER Native r169 — manual Search during keyword debounce

**Baseline / role / state:** Web `src/App.tsx` + job search on main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`; 2026-11-12 NZ source inspection; authenticated synthetic jobseeker, Japanese keyword typed then immediate Search tap (no real candidate data). Native parent `9d6cf3edd1331d3d2b79e173eefdd8ff75db8537`.

## Gap and change

Native `JobsScreen.editQuery` invalidated old request generation and cleared old results, but also called `setLoading(true)` for its **250ms client-side debounce**. The visible Search button had `disabled={loading}`, so it could not submit the latest keyword immediately while waiting for the timer. The r162 fresh-draft query helper alone did not remove this disabled-state conflict.

Now the debounce clears `loading` while preserving invalidation of the previous request and removal of old jobs/bookmarks. The scheduled `load(true)` turns loading back on for the real API request. Keyboard search refuses a duplicate submit while the actual request is loading; the Search CTA keeps its existing disabled guard during that request. The progress indicator remains visible during debounce (without treating an unconfirmed state as empty). No new RPC, debounce interval, dependency, API contract, backend or auth change.

## Parity and evidence matrix

| Workflow | Native source | Android rendered QA | iOS rendered QA | Canonical save/readback |
| --- | --- | --- | --- | --- |
| Fast Japanese entry → immediate Search button | New submission behavior; uses current candidate's keyword draft | NOT VERIFIED | NOT VERIFIED | Read-only search RPC not run in this environment |
| Keyboard Search during in-flight RPC | Source guard; no duplicate keyboard submit based on loading state | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Typing during old in-flight response | Existing generation fence reused | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Debounce spinner, loading/empty/error | Source updated; no false confirmed-empty state | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |

**Tests/evidence:** In local Node v22.16.0, current unchanged `jobSearchKeywordDraft.ts` matched GitHub blob `3d5d16b0ba63d0f31b3e8dff6cfcb884f0390383`; the two helper-based focused tests passed (2/2). `node --check qa/native-job-search-debounce-submit.test.mjs` passed. Nine static checks against **GitHub-persisted actual** JobsScreen and test contents passed. New UI contract tests are registered but their two UI-source tests have **NOT** been executed inside a full checkout; no Expo compilation or Native runtime claims.

**Owner and costs:** COLOR Native-only single-writer branch `native/color-search-submit-debounce-r169-20261112`, isolated from main; no open PR found during ownership check. `.github/workflows/ci.yml` is push-main / pull_request, so no PR or main push requested. Non-MCP feature branch push does not match the observed MCP path workflow. Cloudflare Git/production trigger across other accounts unverified; no production write. No paid Actions/EAS, added dependencies, real applications or messages, auto-merge or store action.

**Next QA:** Execute `node --experimental-strip-types --test qa/native-job-search-debounce-submit.test.mjs` from the full source tree when available, then test immediate tap / keyboard / loading + debounce / 200% Japanese text on both installed OS builds. Continue canonical favorites save/unsave/readback and cross-Web comparisons. Incomplete parity remains **IMPLEMENTING**.
