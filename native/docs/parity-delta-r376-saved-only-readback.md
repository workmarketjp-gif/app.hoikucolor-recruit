# COLOR Native r376 — saved-heart canonical-only retry

## Reference / ownership
- Web JOBSEEKER: repository main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`; `src/components/JobCard.tsx` verified 2026-11-20 NZ; synthetic candidate A with verified search rows and ambiguous saved-heart acknowledgement. Deployed Web SHA and paired screenshots: NOT VERIFIED.
- Native parent `6f310dfdc71e7b078df1f1d9f07064ae8a469c92` (r375); isolated branch `native/color-saved-only-readback-r376-20261120`. No open PR found at preflight. Current Web mobile bottom tabs: ホーム／求人を探す／お給料／気になる／マイページ; applications/messages are secondary.

## Gap / implementation
- The r375 「保存状況を再確認」 button performed `load(true)` and discarded verified search rows, total count, cursor and filters before repeating a job-search RPC, although only the saved-ID state was uncertain.
- The new action calls `readCandidateSavedIdsOnly`, using existing Clerk candidate pin, canonical `listSavedJobIds`, bounded read and strict ID validation. It updates **only** saved IDs and saved-state warning; search rows/count/filter state and result-error channel remain unchanged.
- A confirmed empty saved set is `[]`; malformed/duplicate/timeout/failure is `null` (UNKNOWN). Unknown hearts remain disabled. No replay of an ambiguous saved mutation.
- One concurrent retry; source generation, focus, owner/session, privacy shield, search/filter changes and mutation state fence any late completion. Android and iOS use the same source.

## Evidence and Android/iOS matrix
- Node 22.16.0: `node --experimental-strip-types --test qa/native-job-search-saved-only-refresh-r376.test.mjs` **7/7 PASS**. The GitHub test blob is `a76ef2f64367ad3e50e7cea20028d43f83f050e9` and helper blob `9a5eefb4ea95312b7dd350e0ccbfcdb567bdea05`.
- `tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --allowImportingTsExtensions src/lib/jobSearchSavedOnlyRefresh.ts`: PASS, limited to the production helper and its imports, NOT Expo app-wide typecheck.
- Baseline production helper blobs matched original GitHub exactly: privateReadDeadline `47909bc97cb974508968929c567f4b70dee76512`, pinnedCandidateRead `459e84cfbb8fa705886bc5f36e31dd8278aa4703`, jobDiscoveryCanonicalRead `6c62f3f0bdf8351249e61f79c831d219c8a3ce9f`, jobSearchSavedIndependence `d3e2b5f309b9d738f8bc0f85d46bca593927f711`.
- Screen `native/src/app/(tabs)/jobs.tsx` integration examined against r375 blob `a3a10d1ff2f05fa01249cc7b6d2ff83a05622ef4` before writing; after modification blob `bbc374f2053603d2d585e4c19f9d9f61ea11d5d1`. Static code inspection is not React Native runtime QA.
- **Android: IMPLEMENTING** (shared source only; no emulator/installed screen or canonical E2E).
- **iOS: IMPLEMENTING** (shared source only; no simulator/installed screen or canonical E2E).
- Required: same synthetic candidate Web-vs-Native UI comparison, canonical save/readback, error and cold/warm session handling, whole Expo typecheck, signed Android and authorized iOS test distribution. Not READY_FOR_MASA_ACCEPTANCE.

## Cost / release
- CI `.github/workflows/ci.yml` declares push on main and pull_request; feature-branch-only source writes should not trigger that workflow. No PR/main/Production/DB/RLS/auth/Worker/Store/real candidate operations or paid Actions/EAS started by this task.
- Cloudflare target worker trigger count was reported zero in r375; not independently rechecked in this run. Quota, actual bill, signing and distribution authority unknown. Direct Git clone DNS-blocked, but GitHub connector source retrieval/write and local Node tests worked.
- Next: full Expo SDK runtime plus authorized synthetic canonical search/save/readback, and application→message path; then Android/iOS visual/device and signed build handoff.
