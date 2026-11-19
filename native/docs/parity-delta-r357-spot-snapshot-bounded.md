# COLOR Native r357 — bounded Spot read and single-candidate snapshot

Status: **IMPLEMENTING** (source integrated, no Android/iOS runtime acceptance). Date: **2026-11-19 NZ**.

## Provenance / owner / scope
- Writer: COLOR JOBSEEKER ChatGPT Commander; dedicated branch `native/color-vault-web-default-r341-20261119`; source parent before this run `312e51f155769dbe840e047c2380114da9a786f9`. GitHub query found **zero open PRs**. Current AGENTS.md at repo root/native not present (404). Paths limited to `native/src/app/spot-jobs.tsx`, `native/src/lib/spotSnapshotRead.ts`, `native/qa/native-spot-snapshot-deadline-r357.test.mjs` and this ledger.
- Web baseline: JOBSEEKER `/spot`, `src/views/SpotJobsView.tsx` blob `aa395794adde80d42d3b0c3c8425ee1744d7974e`, `main 8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`. Inspected 2026-11-19, **source-only**, synthetic open spots/assignments, hanging Clerk token, hanging/rejected RPC and candidate A→B; no deployed screenshots.
- Web obtains `hc_jobseeker_list_spot_jobs` and private `hc_jobseeker_list_my_spot_assignments`. Native preserves these exact RPCs, the existing authorization, job/assignment parser, UI and application submission. Web's quiet-refresh failure does not imply a correctly bounded Native request.
- No changes to Web, schema, RLS, API, shared backend, Store, or staff/family owners.

## Parity matrix
| ID | Web route/action | Native source delta | Android real render | iOS real render | Canonical live readback |
| --- | --- | --- | --- | --- | --- |
| SPOT-READ-01 | `/spot` visible open list and private confirmed-shift history | Both reads must succeed in the same pinned Clerk owner/session before either snapshot is published; preexisting canonical RPCs unchanged | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| SPOT-READ-02 | Load/reload and focus reconciliation | Clerk pin and paired RPCs each have a 15-second presentation deadline via existing `pinCandidateForRead` and `boundedPrivateRead`. A hung result becomes blocked retry, not indefinite spinner or invented zero | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| SPOT-READ-03 | Candidate switch/lock/blur while pending | Pre-microtask check, before-RPC check and after-RPC owner/session/generation checks; late results cannot authorize old rows | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| SPOT-INFO-01/02 | Existing opening deadline and slot labels | r356 unchanged | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |

## Evidence
- GitHub `native/src/lib/spotSnapshotRead.ts`: blob `c6e4ab65dca5538bbb978d914b874c0b7dc1eb01`, new source commit `2af736512ac1f551d2e4d74c5aace3749fcdb29d`.
- GitHub `native/qa/native-spot-snapshot-deadline-r357.test.mjs`: blob `dfe63195dca9d7d3c3af3ccf12b8e058f2c95c7c`, test commit `988b1a5dc513a20ce00190796d8d45fd9fe5c36a`.
- GitHub `native/src/app/spot-jobs.tsx`: updated blob `a8063c3d1406f8c1d9ac0995514d2010f0a653d6`, code integration `2a058b5d6981503d6438b77b9e07697e7814cc7b`.
- Local Linux: `node v22.16.0`, `npm 10.9.2`, `tsc` available. Exact prior helper blobs `privateReadDeadline.ts 47909bc97` and `pinnedCandidateRead.ts 459e84cf` were copied from GitHub and verified by `git hash-object`. Both new file blobs also match current GitHub content.
- `cd native && node --experimental-strip-types --test qa/native-spot-snapshot-deadline-r357.test.mjs`: **11/11 PASS**. Tests cover happy/true empty, Clerk timeout, one-RPC timeout, denied RPC, owner/session mismatch, blur before pin/before RPC, stale RPC completion, late token resolution, and late error observation.
- `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions src/lib/spotSnapshotRead.ts`: **PASS** (real helper + real dependencies, not Expo app). No full checkout, Expo typecheck or Native runtime verification.
- Android SDK/adb/emulator: unavailable in this Linux container; installed render not run. iOS macOS/Xcode/simulator: unavailable; installed render not run. Signing/authorized Android APK and iOS TestFlight/ad-hoc credentials: not verified.

## Cost/release boundary
- GitHub `.github/workflows/ci.yml` triggers on main push or PR, not direct dedicated-branch pushes. No PR, main merge, workflow_dispatch, EAS, Store, or production deployment.
- Cloudflare linked account Worker `app-hoikucolor-recruit` currently reports **zero registered Workers Build triggers** (GET list for worker); previous Native Preview auto_build=false was documented in r355. This is not invoice proof. Quotas/current billable amount unknown; no Cloudflare changes were made.
- Next developer QA: get a genuine runnable Expo checkout + Android/iOS authorized runners; verify synthetic Spot refresh timeout, retry and successful re-read, account switching, assignment deep-link, both OS visual comparisons. Continue remaining unrelated workflows without overstating readiness.

**No READY_FOR_MASA_ACCEPTANCE claim.**
