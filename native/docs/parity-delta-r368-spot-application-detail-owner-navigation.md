# COLOR Native r368 — Spot application-detail navigation owner fence

**2026-11-20 (NZ) | IMPLEMENTING | source verified, not installed Android/iOS QA**

## Exact source and ownership
- Owner: ChatGPT COLOR JOBSEEKER only; branch `native/color-vault-web-default-r341-20261119`; starting HEAD `f43cc1f9816898f59e0fe542522aec1177a2b523`. GitHub repo push permission confirmed; no open PR at pre-write check. No root/native `AGENTS.md` found.
- Web reference: candidate `/spot`, `src/views/SpotJobsView.tsx` on `main` `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, fetched 2026-11-20 NZ. Synthetic state: current-owner populated spot jobs and owned assignments, session switch/lock during private detail tap. No real candidate data.
- Related Web navigation baseline: `src/components/CandidateShell.tsx` at the same main (blob `15727b190e8c3a6a3fdbf6f0964a2d4e448273dc`) defines **ホーム / 求人を探す / お給料 / 気になる / マイページ** as the actual current five mobile tabs, with 応募管理 and メッセージ under マイページ and contextual menus. Native tab layout already follows this current canonical order; do not replace it with the obsolete proposed five-tab grouping without Web owner approval.

## Closed source gap / preserved behavior
- Prior Spot assignment and applied-job card actions directly routed to `/application/{id}` on tap. They had no fresh same-session token pin and no post-await owner/session/lock/generation validation, unlike the candidate Applications and Messages flows.
- Both actions now share `openApplication`: only IDs present in the latest verified Spot snapshot are eligible; a synchronous navigation lock suppresses duplicate taps; a deadline-bounded Clerk pin must still belong to the same active candidate/session before navigation. Re-querying, screen blur, session change or App Lock revoke the navigation lease. A failure is shown with non-sensitive retry copy, not as an empty list or confirmation.
- Accessible, contextual labels distinguish repeated `応募状況を見る` and `応募内容を見る` actions, and the buttons disable during a pending navigation or Spot submission.
- Existing Spot application submit (no automatic retry), its durable ambiguity quarantine, confirmed read fences, canonical application detail/RLS, Web API/schema and all production data remain untouched.

## Actual validation and limits
- Local genuine Node 22.16.0 and global TypeScript 5.8.3:
  - `cd native && node --experimental-strip-types --test qa/native-spot-application-navigation-lease-r368.test.mjs`: **12/12 PASS**. The standalone test imports the actual new `spotApplicationNavigation.ts`, not an invented Native framework stub.
  - `cd native && tsc --noEmit --strict --skipLibCheck --target es2022 src/lib/spotApplicationNavigation.ts`: **PASS** for this pure helper only.
  - Post-write GitHub connector readback: new helper blob `bf1627ef924672fa742e3d9b7287889d65995fb0`; new test blob `600a8738be43f2f7c4fe9f300ea256c24913d647`, both identical to locally tested `git hash-object`; screen blob `1c7204b009dd32234bf478449cf53941dccd5f65`. 11/11 focused source wiring assertions passed.
- **Not verified:** full Expo TypeScript/build, rendered Android/iOS UI, real Clerk/Supabase save/readback, Web-to-native same synthetic state E2E, signed APK/IPA. Linux lacks adb/SDK/emulator and macOS/Xcode; signed distribution/access not confirmed. Git clone fails Github DNS; full native dependencies not accessible in this environment.
- Pre-write CI `.github/workflows/ci.yml`: push only `main`, and `pull_request`. This branch push does not trigger that workflow; no PR created. Cloudflare read-only GET for `app-hoikucolor-recruit` Workers build triggers: **0** under current linked Workmarket Cloudflare account. Paid Actions/EAS, Worker deploy, real messages/applications, main write, merge, and Store submission not performed. Bill/quota unverified.

## Next priority
- Obtain an authorized full Expo checkout/dependency environment to run app-level typecheck and existing r366+r368 screen regressions.
- Using a synthetic candidate, verify Spot → application detail/list → messages, owner/account switch and lock during pending card navigation on Android and iOS separately; compare same-state Web mobile screenshots and perform canonical readback.
- Obtain an authorized Android SDK/emulator and iOS macOS/Xcode/signing/TestFlight or ad-hoc route; do not mark `READY_FOR_MASA_ACCEPTANCE` until both installed runs and signed handoff are evidenced.
