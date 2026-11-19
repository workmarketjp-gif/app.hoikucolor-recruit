# COLOR Native r365 — prevent in-flight Spot reads from reopening a confirmed application

**2026-11-20 Pacific/Auckland | IMPLEMENTING | source-level only**

## Ownership / baseline
- Single writer: ChatGPT COLOR JOBSEEKER; branch `native/color-vault-web-default-r341-20261119`. Before-write HEAD `93207de7f0469a4eb083b69b5ab158188f4f62fc` (r364). No open repository PRs found; no root or native `AGENTS.md` found. HQ #265 MINIMUM_COST_V1 and ownership #467 checked.
- Jobseeker Web reference: `/spot`, `src/views/SpotJobsView.tsx`, `main` SHA `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, read 2026-11-20 NZ. Synthetic candidate-owned confirmed-application state, no real candidate records or messages. Web marks a successful submission as applied using a confirmed application ID.
- Native source `native/src/app/spot-jobs.tsx` and `native/src/lib/spotConfirmedApplication.ts` from the development branch. The confirmed/detail handoff from r363/r364 is preserved.

## Gap closed at source level
- A quiet Spot refresh may start **before** the user's application is canonically confirmed and complete **after** the confirmation, replacing the just-confirmed in-memory card with the stale, open card from the older response.
- `createSpotReadConfirmationFence` captures an epoch at read start. After `submitApplication` returns its candidate-owned canonical confirmation, the screen advances that epoch before updating the confirmed card.
- The list read's success and error paths reject responses from earlier epochs. An old read cannot clear the confirmed UI or set a misleading error; its `finally` still releases the in-flight read flag.
- A **new** read started after confirmation is still allowed. Its canonical server data remains authoritative for legitimate later revocation/status changes. This is not a permanent local override of the backend.
- Session, candidate, privacy, generation, durable pending-submission and no-auto-retry guards remain unchanged. No RPC, schema, Web UI, shared backend, production configuration or candidate data changed.

## Verification (precise scope)
- Isolated writable Linux: Node `v22.16.0`, npm `10.9.2`, global `tsc` available. Android SDK/emulator/adb absent; macOS/Xcode/iOS simulator absent. Git HTTPS clone fails DNS; GitHub connector's fetched r364 helper matches local `git hash-object` blob `43f3ce9bdcaa080dccf4cda8753e2461b3e71c57`.
- `cd native && node --experimental-strip-types --test qa/native-spot-confirmed-detail-navigation-r363.test.mjs qa/native-spot-confirmed-cleanup-nonblocking-r364.test.mjs qa/native-spot-confirmation-stale-read-r365.test.mjs`: **17/17 PASS** on real isolated source helper; **5** new r365 test cases including deferred old response.
- `cd native && tsc --noEmit --strict --skipLibCheck --target es2022 src/lib/spotConfirmedApplication.ts`: **PASS for this helper only**. No claim of full Expo typecheck.
- Post-write GitHub blob SHAs: helper `f7c42fd143cd7771620a1b86dcde228ec5b9f8af`, screen `fb7030012ee3ddddf68bbd4985d10c87d2343a18`, new test `bc34f6c737bd9822dd57d6afd91448ccddbe0476`. Helper/test local SHA matches GitHub blob; screen source was read back through GitHub and the read capture → bounded read → epoch rejection → setJobs and confirmed epoch → retain ordering was checked.
- Android installed rendered QA: **NOT_VERIFIED**. iOS installed rendered QA: **NOT_VERIFIED**. Same-account Supabase apply/list/message save-readback and Web comparison: **NOT_VERIFIED**. Signing, iOS TestFlight/ad-hoc permissions, candidate app IDs/build identities and installable artifacts: **NOT_VERIFIED**.

## Safety / cost / next
- `.github/workflows/ci.yml` has `push: main` and `pull_request` triggers, not this dedicated development branch. Prior to writes, Cloudflare Workmarket account's `app-hoikucolor-recruit` Workers Build Trigger endpoint returned **0 triggers**. No PR, main merge, workflow dispatch, EAS build, production deploy, or Store action was requested. Billing totals and remaining quota are unknown.
- Next priority: full Expo dependency graph/typecheck and candidate-owned synthetic apply → canonical application detail/list → messages E2E, followed by matching Web and installed Android/iOS UI and security QA. Do not interpret these Node/TS source tests as platform acceptance.
- State `IMPLEMENTING` until complete parity and developer-verifiable signed builds exist on both OSes.
