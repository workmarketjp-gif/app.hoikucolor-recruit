# COLOR Native parity delta r375 — saved-heart mutation failure is not a search failure

## Versioned reference / single-writer provenance
- Repository: `workmarketjp-gif/app.hoikucolor-recruit`; isolated branch `native/color-saved-heart-failure-parity-r375-20261120`, based on verified r374 SHA `6ac0388c1f306d354580e472541ab3decad8c4ed`. No open PRs at preflight.
- Web JOBSEEKER reference: main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, `src/components/JobCard.tsx` (saved heart and actions), read 2026-11-20 NZ; synthetic signed-in candidate with existing authorized search rows, saved-ID write with lost acknowledgement. Web deployed SHA / rendered capture are not authenticated.
- Native source: `native/src/app/(tabs)/jobs.tsx` and `native/src/lib/jobSearchSavedIndependence.ts`, r374 baseline. Current Web mobile navigation confirmed in r374: ホーム / 求人を探す / お給料 / 気になる / マイページ; 応募管理 and メッセージ secondary. No navigation change.

## Confirmed defect and bounded correction
- Before fix, an ambiguous save/unsave or failed canonical saved-ID re-read in `toggleSaved` cleared saved IDs correctly, but reported the error via `setOwnedError` (job-search failure channel), making a verified search appear failed and hiding its trustworthy count. Separate `savedError` UI already existed but was not used for this case.
- After fix, uncertain saved-heart results use `setOwnedSavedIds(null)` + `setOwnedSavedError(notice)` only. Existing verified job cards and counts remain, while all saved hearts are disabled until the user explicitly re-reads canonical saved IDs. Do not infer success or failure, auto-retry a possibly committed mutation, or change server auth/RLS.
- A pure `savedJobMutationFailureNotice` gate rejects late errors after a different request generation, another mutation, account/Clerk-session change, or App Lock. The late post-blur saved refresh is additionally fenced by the current owner key.
- Existing re-read button `保存状況を再確認` remains wired to a canonical job/saved-ID refresh; no new backend or placeholder.

## Actual execution evidence (source-level only)
- Node v22.16.0; TypeScript v5.8.3. Local source files match GitHub blob SHA exactly:
  - `native/src/lib/jobSearchSavedMutationFailure.ts`: `11dd18c4ed8692e9c458bdb3f1688682abda005c`.
  - `native/qa/native-job-search-saved-mutation-failure-r375.test.mjs`: `56873e1049be8762722f7a110ff5af4766f81055`.
- `node --experimental-strip-types --test native/qa/native-job-search-saved-mutation-failure-r375.test.mjs` => **5/5 PASS**: verified same-session warning, account switch, same-owner/new-Clerk-session, stale mutation/generation, privacy lock/missing owner.
- `tsc --noEmit --strict --skipLibCheck --target es2022 src/lib/jobSearchSavedMutationFailure.ts` => **PASS** for the pure helper only.
- Fresh GitHub `jobs.tsx` blob `a3a10d1ff2f05fa01249cc7b6d2ff83a05622ef4`: source integration assertions 7/7 PASS for dedicated saved error channel, disabled unknown hearts, preserved job rows and owner fence. These are static source checks, not rendered Native tests.
- Direct repository clone remains DNS-blocked; complete Expo dependencies, React Native screen integration runtime, full-project TypeScript and canonical Supabase E2E were **not** executed. No fabricated test/runtime success.

## Android/iOS parity matrix for this workflow
| Workflow | Android | iOS | Canonical re-read / visual evidence |
| --- | --- | --- | --- |
| Search results after saved-heart write acknowledgement is lost | Shared-source fix and pure helper PASS; Native runtime NOT_VERIFIED | Shared-source fix and pure helper PASS; Native runtime NOT_VERIFIED | Canonical saved IDs re-read and Web-to-Native render NOT_VERIFIED |
| Search → detail → apply → applications → messages | NOT_VERIFIED E2E | NOT_VERIFIED E2E | Synthetic candidate/RLS/private Storage persistence and visual pair still required |

## Cost, release and next handoff
- CI `.github/workflows/ci.yml` listens to `push: main` and `pull_request`; this isolated feature-branch push alone does not match those declared CI triggers. Both connected Cloudflare accounts returned **zero** build triggers for Worker `app-hoikucolor-recruit` at preflight. This does not prove future PR/merge cost, signed-build availability or billing totals.
- No PR, paid Actions/EAS, production DB/RLS/auth/Workers, Store submission or actual candidate mutation.
- Missing: complete Expo runtime/dependencies; Android SDK/ADB/emulator; iOS macOS/Xcode/simulator; signing/test distribution authority and a safe synthetic canonical E2E route. Direct clone DNS failure is a source-access limitation, not permission to treat source checks as device QA.
- Next priority: real-source Expo screen typecheck, synthetic search/save/readback and application→message E2E in an authorized QA environment, then separate Android and iOS visual/keyboard/error tests.
- **State: IMPLEMENTING**, not DEVELOPER_VERIFIED or READY_FOR_MASA_ACCEPTANCE.
