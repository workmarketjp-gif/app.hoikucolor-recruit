# COLOR Native r387 — exact-job deep-link failure must not erase successful search results

## Source baseline and ownership — 2026-11-20 NZ
- Repository: `workmarketjp-gif/app.hoikucolor-recruit`; isolated Color Native writer branch `native/color-job-specified-failure-isolation-r387-20261120`, parent `12406b8b1b81fec745dddcd879313a52a7d686b6` (r386); main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c` at preflight. No conflicting open PR at this check; no root or native AGENTS.md.
- JOBSEEKER Web source reference: `src/App.tsx` main blob `21bbe8abf51ceee657266ff286593c8af784f399`, `/jobs?job_id=<valid-UUID>`, authenticated **synthetic** candidate, initial empty keyword/no filters, exact job RPC error/hang with an otherwise successful canonical search. Source read on 2026-11-20 NZ; no deployed Web build SHA or paired rendering verified.
- Web itself currently uses `Promise.all([searchJobs, getRankedJob])` in this state and can fail the whole page when the optional exact lookup rejects. Record this as a Web owner defect; this Native fix does not authorize editing or shipping Web.

## Concrete Native source-level correction
- Before: `(tabs)/jobs.tsx` awaited a `Promise.all` of canonical search, optional saved IDs and optional `getCandidateJob`. A rejected or hung exact job lookup rejected/delayed the entire search despite an independently confirmed valid page.
- After: `readOptionalSpecifiedJob` independently handles optional exact-job lookup with a 5-second *presentation-only* bound. It distinguishes `verified`, canonical `unavailable` (null), `failed`, and `skipped`. A failed exact lookup keeps verified search jobs, total count, cursor, and independent saved-heart verification; it shows a fixed Japanese unknown-state notice, NOT a false "募集終了" claim. A valid exact job still pins first without duplication; no direct grant from the URL.
- All lookups use the pre-existing pinned candidate Supabase client. No duplicate RPC, automatic retry, real candidate write, new permission, schema/RLS/auth/Storage/Edge/Worker or external-browser fallback. The existing generation/foreground/session guard remains the publication authority.

## Web → Android / iOS delta
| Synthetic workflow | Web/source expectation or defect | Shared Native code | Android runtime | iOS runtime |
|---|---|---|---|---|
| `/jobs?job_id=valid`, exact job RPC succeeds | Canonical specified job pinned once | Existing ranking preserved | NOT VERIFIED | NOT VERIFIED |
| Exact lookup returns canonical null | Unavailable notice; no forged row | Existing unavailable notice preserved | NOT VERIFIED | NOT VERIFIED |
| Exact lookup rejects but search succeeds | Web source currently fails the page (owner defect); desired safe UI retains verified jobs | Search rows/count/cursor preserved; distinct unknown-state notice | NOT VERIFIED | NOT VERIFIED |
| Exact lookup hangs, search succeeds | Should not hang entire discovery | Bound optional read at 5s; late failure observed, no auto-retry | NOT VERIFIED | NOT VERIFIED |
| Invalid/filtered deep link | URL must not grant access or create a job | Existing validated route/filters and shared pinned session unchanged | NOT VERIFIED | NOT VERIFIED |

## Executed developer evidence and gates
- Exact-source local materialization: existing `privateReadDeadline.ts` blob `47909bc97cb974508968929c567f4b70dee76512`, `jobSearchSpecifiedEntry.ts` blob `1c639f40ca84282cdddce9da89c36dadd72f1cf1`, existing r302 test blob `c5647e94f60597c5f67ed8c4f34ae175230aa589`; all matched local `git hash-object`.
- `node --experimental-strip-types --test native/qa/native-job-search-specified-entry-r302.test.mjs native/qa/native-job-search-specified-independent-r387.test.mjs`: **14/14 PASS** (5 existing + 9 new). Synthetic fake IDs and rejected/hung callbacks only, not live backend.
- `tsc --noEmit --strict --skipLibCheck --target es2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions native/src/lib/jobSearchSpecifiedLookup.ts`: **PASS, helper plus dependency source only**. Screen source patch has four unique verified anchors; **NOT** full Expo TSX compile, Native run or canonical readback.
- New tested helper blob `cf5598737884e9b98f53cf936801ee5a258c4dc2`; new test blob `a5350407e711a09f9fa4e12da522f15cf5f7954b`; patched screen blob `b04c5244474dd859969f6499abc10b23433ea5bd`.
- Android SDK/emulator: unavailable in current Linux runtime. Android rendered/screenshot QA and signed build **NOT VERIFIED**.
- iOS/macOS/Xcode/simulator: unavailable in current Linux runtime. iOS rendered/screenshot QA, TestFlight/ad-hoc/internal signed installation **NOT VERIFIED**.
- CI: repo broad `.github/workflows/ci.yml` main-push and PR triggers; other workflows are HelloWork or MCP path-limited. No PR or main write. Cloudflare Workers Builds target `app-hoikucolor-recruit` triggers `[]` on two connected accounts at this check, not a guarantee about every deploy path. No new paid Actions/EAS/agents/production/Store. Actual billing/quota and signing access unknown.
- Status: **IMPLEMENTING** (both OS). Do not tag as `DEVELOPER_VERIFIED` across the whole workflow or `READY_FOR_MASA_ACCEPTANCE`. Next: integrate with current main only after owner/cost gate, full Expo typecheck and synthetic canonical search→save→apply→messages plus paired Android/iOS UI and signed handoff.
