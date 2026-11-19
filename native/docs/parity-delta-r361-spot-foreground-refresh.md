# COLOR Native r361 — Spot foreground cadence and background snapshot preservation

**State:** IMPLEMENTING. **Date:** 2026-11-19 NZ. **Scope:** COLOR jobseeker Spot Native UI + local read gating. No shared backend/auth/RLS/schema changes.

## Single writer / frozen Web reference

- Repository: `workmarketjp-gif/app.hoikucolor-recruit`; COLOR-only development branch: `native/color-vault-web-default-r341-20261119`. Starting HEAD: `d092db614719b7a34083c2a9a45b247e90f45263` (r360). Open PRs 0 at start. Applicable ancestor AGENTS.md not present. Previous COLOR writer already owned this branch; no other active writer confirmed. No merge or force-push.
- Web source: `src/views/SpotJobsView.tsx` blob `aa395794adde80d42d3b0c3c8425ee1744d7974e`, route `/spot`, main, inspected **2026-11-19**. Reference behavior: signed-in synthetic candidate; visible open/confirmed spot listings, background refresh failure, activity resume. Web refreshes on window focus, pageshow, visibilitychange, a custom event and every 60 seconds while visible; a quiet failure retains the last verified listings. Exact deployed SHA and same-state screenshots not obtained.
- Native: `native/src/app/spot-jobs.tsx`, `native/src/lib/spotForegroundRefresh.ts`. Shared auth and canonical read functions unchanged; both Android/iOS use these source files.

## Gap closed in Native source

- Prior Native focus-only read left an already-open Spot screen stale after 60 seconds or when the app became active again. A quiet read also erased its ownership-verified snapshot before resolving, which could hide existing cards and show a spinner.
- A focused Native screen now attempts a quiet canonical re-read on a 60-second interval and when `AppState` returns `active`. It **skips** reads in the background, on private lock/signout/account switch, while a read is in progress, or while an application is in progress. Listener and timer are removed on blur.
- Quiet re-reads keep existing verified cards visible; transient quiet read failures do not misleadingly replace existing cards with an empty state/error. Initial/manual reads retain their explicit error + retry. Candidate pin, owner/session generation fence, bounded reads, and duplicate application quarantine remain in place.
- This only closes **source-level refresh behavior**, not runtime visual parity or canonical persistence E2E. Web's custom event mechanism is not replicated verbatim because Native has a distinct lifecycle. Other Spot gaps remain subject to Web/device QA.

## Exact commits and test evidence

1. Eligibility helper: `bd76672f86d87d1e69e40ad0b6661ec1c75a1f44`.
2. Behavioral regression: `735972666691cf9c795f8b3b17a3fe135e97063b`.
3. Native Spot screen: `b469252c6974a16cb9f820de3181905dbfca2dec`.
4. Real-source Node behavioral test: from local checked-out helper/test artifact whose Git blob SHAs match GitHub `c3a1ee4c0f54ee0f0ac238444fa11566e5447436` / `d4b08ff0fa316c043a9c52c2f82a33664a78526e`: `cd native && node --experimental-strip-types --test qa/native-spot-foreground-refresh-r361.test.mjs` => **9/9 PASS**. Covers active session, background, account handoff, missing verified snapshot, signed-out, app lock, active read, active application.
5. `tsc --strict --noEmit --skipLibCheck --target es2022 src/lib/spotForegroundRefresh.ts` => PASS, only for the isolated helper.
6. Structural checks of freshly fetched `spot-jobs.tsx` => 9/9 PASS for timer, AppState subscription/cleanup, quiet snapshot preservation, initial read errors, bounded candidate read, and dispatch wiring. These are source assertions, **not** a Native render.
7. Remote GitHub source round-trip after write: screen blob `532b19d85586c9d22df21c2bb98256921c731bc2`; helper and test match locally verified Git blob SHAs above.

**Unverified:** complete Expo checkout / framework TypeScript, actual Android AppState/React runtime and screenshots, actual iOS runtime, expired sessions, Supabase synthetic save/readback/Web correspondence, signing and installable builds. Earlier APK or source assertions do not substitute.

## CI/cost/release

- GitHub workflow `.github/workflows/ci.yml` runs on `main` push and PR, **not** branch-only push. No PR was opened, no workflow dispatch attempted. GitHub combined status for source commit had no reported statuses; this is not proof of a fully passing CI.
- Cloudflare account `Workmarket.jp@gmail.com's Account` Worker `app-hoikucolor-recruit` GET build triggers returned `[]` before writes. Worker production unchanged; no additional build requested. The build-minute availability response was empty; actual billing/quota not verified. No paid EAS, new agent, public deployment or Store submission.

## Next gated work

Run the checked-in `native/qa/native-spot-state-action-web-parity-r360.test.mjs` and this r361 test in a **complete** authorized checkout. Perform `npm ci && npm run typecheck` against the actual Expo dependencies when accessible; do not claim standalone helper typecheck is full project. Compare identical synthetic candidate Spot states in Web and installed Android/iOS: normal/empty/failed background refresh, foreground transition, locked account switch, full/busy apply button, 320/375-width equivalents, text scaling and keyboard/bottom targets. Verify actual authorization-backed readback before calling the workflow developer-verified.

Android SDK/emulator and macOS/Xcode/signed iOS distribution still unavailable in this Linux session. These block OS QA but not safe source work. Further activity-resume automatic retry after an **initial** failed unverified read is a known remaining parity point; no completion claim for that condition.
