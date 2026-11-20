# COLOR Native r382 — Saved jobs stay viewable during same-session refresh

## Ownership and frozen reference (2026-11-20 NZ)
- Source of truth: JOBSEEKER Web `/saved`, `src/App.tsx` `SavedView` near lines 570–596, main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`. Synthetic Clerk candidate A with two saved published jobs, manually refreshing or receiving a read error while previously confirmed cards remain. Web renders JobCard links/expand and compare whenever `saved.data` exists; a failed/slow read does not remove the previously loaded resource. Reference is source-based; deployed version, paired Web screenshot and running browser state were not verified.
- Candidate API: `hc_jobseeker_list_saved_jobs_with_status_v2`; independently authorized target routes `/job/{id}`, `/compare?job_id=...`, `/visits`. Never treat an old list as permission to submit a new application or mutate saves.
- Owner: COLOR Native UI `native/src/app/(tabs)/saved.tsx`, `SavedJobPreviewCard.tsx`, helper/QA only. From prior COLOR r381 commit `840f1a425732d7b1f6b409d3955bf0480d6b0c20` on isolated `native/color-saved-retained-navigation-r382-20261120` branch. At preflight no open PRs found; no Staff/Family/Web/backend owner paths written. No root/native AGENTS.md.
- HQ #265 `MINIMUM_COST_V1` and issue #467 acceptance gates respected. CI config has push-to-main and PR events; no PR/main merge here. Cloudflare trigger was recorded main-only at r381; not independently fetched this run.

## Actual gap and corrected workflow
- Before: the same `canAct` gate disabled unsave, expand, job detail, direct-apply destination, visit destination and Compare during manual Saved refresh and after a failed read, even when the two cards belonged to a previously verified still-active same-candidate session.
- Now: `canNavigateVerifiedSavedJob` separately permits *view/route navigation* from still-verified, same-Clerk-session rows during refresh or failed read. All target screens retain their own canonical read and submission authorization. The existing `canActOnSavedJobs` still denies unsave while server saved state is unknown, during mutation, or while refresh is active. An uncertain write is never retried or reported as successful. Card's expanded details and user-initiated view/apply/visit destinations share the navigation gate; the heart uses the mutation gate.
- A pending navigation keeps a synchronous single-flight ref until blur; delayed Clerk response requires original generation, still-verified owner, current session, non-locked state, non-mutating state and token identity. No stale data on account switch, App Lock, logout or first-read failure. Existing routes are not replaced with browser links.
- `native/qa/native-saved-jobs-refresh-r229-wiring.test.mjs` now checks the split gates rather than an obsolete broad read-only ban. The already-stale `native-saved-web-card-wiring.test.mjs` removal-helper assertion now names the existing `confirmSavedJobRemovalWithinDeadline`, without changing actual removal code.

## Versioned Web → Android/iOS matrix

| Scenario | Web `/saved` | Android shared implementation | Android runtime | iOS shared implementation | iOS runtime |
|---|---|---|---|---|---|
| Verified candidate, two saved cards, manual refresh pending | Expand/Open/Compare remain usable | Navigation allowed; saved heart disabled | NOT VERIFIED | Same source | NOT VERIFIED |
| Verified candidate, manual refresh failed | Previously confirmed cards available | Navigation allowed with stale notice; save removal stays blocked until canonical reread | NOT VERIFIED | Same source | NOT VERIFIED |
| First load failed or index unverified | No known saved cards to open | Deny navigation and removal | NOT VERIFIED | Same | NOT VERIFIED |
| Different candidate/Clerk session, App Lock, blur | No cross-account cards | Revoke verified owner and screen generation | NOT VERIFIED | Same | NOT VERIFIED |
| Pending saved mutation or duplicate navigation | Must not duplicate writes or stack pushes | Both gates deny mutations; synchronous navigation lease prevents repeated pushes | NOT VERIFIED | Same | NOT VERIFIED |

## Evidence and limitations
- Linux Node 22.16.0, npm 10.9.2, global TypeScript 5.8.3. `node --experimental-strip-types --test native/qa/native-saved-jobs-refresh-r229.test.mjs native/qa/native-saved-retained-navigation-r382.test.mjs` = **8/8 PASS** on exact Git-blob-matched helper/tests. Before new helper: missing export, RED. `tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler native/src/lib/savedJobsRefreshPolicy.ts` = PASS, **helper only**.
- On-branch source connections checked for split disabled props, session checks, synchronous navigation request fence, canonical list read, and no new server writes. The updated screen's React Native JSX was **not** rendered or compiled by Expo in this run. Full `npm install`, Expo typecheck and the legacy source-wiring tests remain unexecuted here; no repo-wide claim.
- Android: SDK/adb/emulator absent; app ID `jp.hoikucolor.jobseeker`, `versionCode 4` per current `native/app.json`; no signed APK for this SHA.
- iOS: Linux, no Xcode/macOS/simulator; bundle `jp.hoikucolor.jobseeker`, `buildNumber 1`; no verified TestFlight/ad-hoc entitlement or installable iOS artifact.
- Synthetic Supabase save→readback→Web correspondence, real Google/email auth and physical device UI have NOT been executed. No production account data/artifacts/screenshots.

## Next
Run complete Expo dependency/typecheck in an authorized compatible runtime, test real synthetic canonical Saved → detail/compare → apply → applications → messages on BOTH installed OSes, and compare corresponding Web/mobile sizes. Investigate branch ancestry before integration: r381 diverges substantially from current main and automatic CI could be billable. Do not auto-merge, force-push, trigger paid build, or publish. State `IMPLEMENTING`, not `DEVELOPER_VERIFIED` or `READY_FOR_MASA_ACCEPTANCE`.
