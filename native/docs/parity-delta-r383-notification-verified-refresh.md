# COLOR Native r383 — verified notifications survive same-session refresh

## Baseline and single-writer provenance (2026-11-20, NZDT)
- Web: main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`; `src/components/NotificationCenter.tsx` (blob `34a4f274d3e8c7a4c7131030245a6d7e1b0f58bd`) retains `items` during `load(true)` and read failures. `src/lib/useResource.ts` similarly retains prior data. Reference: logged-in synthetic candidate A, two private notification rows, background/explicit refresh pending or failed. Source reference only; deployed SHA and paired screenshots not verified.
- Native before: `NotificationProvider.loadCanonicalSnapshot` unconditionally revoked `verificationRef` and cleared all rows on every refresh; notifications list blanked until readback, even when the same Clerk candidate/session was verified.
- Owner: COLOR Native notification UI/context + dedicated pure helper/QA, branched from r382 `d292afa34210200f65f563191f9c2e4a6ac598b0` onto `native/color-notification-verified-refresh-r383-20261120`. No open PR found at preflight, no root/native AGENTS.md, no shared backend/Web/other-Native files touched.
- HQ #265 MINIMUM_COST_V1 and common #467 remain release/security gates. GitHub `.github/workflows/ci.yml` runs on main pushes/PRs, not isolated Native feature-branch push; no PR created. Cloudflare trigger state not independently fetched in r383.

## Change
- Keep **already verified** private notification rows and target-navigation cards on an ordinary same-owner/same-Clerk-session readback. Preserve the last acknowledged list if a post-pin canonical list request fails; surface the actual error. The current canonical read still determines replacements; no local read success, mutation or unread counts are invented.
- Clear retained rows if a credential pin fails/revokes, the session or candidate changes, App Lock activates, or a new unverified candidate initially loads. Existing generation fences discard obsolete responses.
- A pending reread is still `loading`, even when old cards remain displayed. The notification count presentation becomes unavailable and `すべて既読` stays disabled until verified reconciliation. Error never becomes confirmed empty. Disable repeated user refresh taps while loading.
- Remove an obsolete older-read failure callback which could set `loading=false` while a newer generation remained pending. All actual source reads remain via canonical `listNotifications`, `getUnreadNotificationCount`, `getJobseekerAttentionSummary`; no SQL/RLS/auth/Storage or notification-write contract was changed.

## Web→Android/iOS scoped matrix
| Synthetic state | Web | Shared Native source | Android runtime | iOS runtime |
|---|---|---|---|---|
| Verified two rows, same-session manual/quiet refresh | Old rows remain until next result | Keep verified rows; count unknown while pending; block mark-all | NOT VERIFIED | NOT VERIFIED |
| Verified two rows, post-pin network failure | Rows remain, error shown | Keep rows, error displayed, no empty claim or mark-all | NOT VERIFIED | NOT VERIFIED |
| First load, changed candidate/Clerk session, App Lock | No previous private rows for new viewer | Revoke verified snapshot and gate private view | NOT VERIFIED | NOT VERIFIED |
| Revoked/unavailable authentication pin | Must not expose protected data | Clear verified snapshot; explicit load error | NOT VERIFIED | NOT VERIFIED |
| Confirmed re-read, original owner | Replace with canonical rows/count | Re-enable verified state only after pinned read | NOT VERIFIED | NOT VERIFIED |

## Evidence and next gate
- Executed locally on Node v22.16.0: `node --experimental-strip-types --test native/qa/native-notification-verified-refresh-r383.test.mjs` = **10/10 PASS**; source modules `notificationVerifiedRefresh.ts` (Git blob `c6b85ac99bad5f8d8d64c76a37499ad6027b95df`) and unchanged real `notificationListPresentation.ts` (`af793561101d829bd33cd433ff2162d9441bcbe0`) verified against GitHub; new test Git blob `6a6877b1b2511c802bdcf673b51e42a38f3933d9`.
- `tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler native/src/lib/notificationVerifiedRefresh.ts native/src/lib/notificationListPresentation.ts` = PASS, helper/presentation only. Actual GitHub source wiring was separately checked through 12 static assertions (12/12 PASS). The Native React/Clerk/Expo runtime was NOT compiled or rendered; no assertion of full typecheck or simulator QA.
- Android: Linux lacks Android SDK/adb/emulator; `jp.hoikucolor.jobseeker` versionCode 4 in tracked `native/app.json`. No signed installable APK for this SHA.
- iOS: Linux lacks macOS/Xcode/simulator; `jp.hoikucolor.jobseeker` buildNumber 1. No confirmed Apple signing/TestFlight or ad-hoc distribution permissions, no installable build.
- Synthetic Clerk/Supabase canonical save→readback→Web correspondence, physical Native screenshot comparisons, real email/Google auth and both-platform acceptance remain NOT VERIFIED. No candidate PII in test artifacts.
- No paid CI/EAS invocation, PR, merge, main write, Worker/DB deploy, live messages/applications/scouts, Store submission or production mutation. Actual billing and remaining quotas unknown.
- Next: verify full Expo dependencies/typecheck, exercise same-synthetic-account notification refresh/open/readback and job search→save→apply→application→message on installed Android **and** iOS, resolve any visual/behavioral mismatches, then obtain authorized signed distribution. State `IMPLEMENTING`, not `DEVELOPER_VERIFIED` or `READY_FOR_MASA_ACCEPTANCE`.
