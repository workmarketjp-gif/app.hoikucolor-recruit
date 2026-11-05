# Hoiku Color JOBSEEKER Native — source-based parity ledger

Updated: 2026-11-05 (NZ). State: IMPLEMENTING, NOT DEVELOPER_VERIFIED on either platform.

## Versioned reference
- Web source: `workmarketjp-gif/app.hoikucolor-recruit` main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/App.tsx`, `src/components/CandidateShell.tsx`.
- Role/data: authenticated jobseeker; synthetic candidate A/B, synthetic applications and RPC responses; no real candidate records.
- Web routes examined by source: `/`, `/jobs`, `/saved`, `/applications`, `/messages`, `/profile`, `/career`. No same-state deployed Web screenshot was captured.
- **Current authoritative Web mobile five tabs:** `ホーム / 求人を探す / お給料 / 気になる / マイページ`. Applications and Messages are secondary screens accessible from Home/My Page. This supersedes earlier assumed tab ordering; do not promote a sixth tab.

## Branch + ownership
- Sole writer for this isolated candidate: Color Native Commander, `native/color-candidate-session-isolation-20261105`; base `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`.
- Previous detached session-fence fixes (application/saved/job views) attached to this branch without modifying main.
- New work: `native/src/app/messages.tsx`, `native/src/lib/messageInbox.ts`, home/profile entrypoints, message tests and focused test command.
- No shared schema/RLS/Workers/auth changes; no notifications or messages sent.

## Workflow matrix (source integration versus platform verification)

| Web jobseeker workflow | Native branch source | Android rendered + canonical readback | iOS rendered + canonical readback |
| --- | --- | --- | --- |
| Auth, signup, recovery, session restart | Existing source; no new claim this run | NOT VERIFIED for current SHA | NOT VERIFIED for current SHA |
| Search, results, detail, favorites | Existing source; new A/B presentation fence on branch | NOT VERIFIED | NOT VERIFIED |
| Applications/detail/replies | Existing source; new A/B presentation fence on branch | NOT VERIFIED | NOT VERIFIED |
| Messages list, canonical unread, thread entry, scouts link | **Added this run**, source and focused unit tests | NOT VERIFIED | NOT VERIFIED |
| Career + CareerCompanion (Web /career) | Previous isolated candidate, NOT YET integrated | NOT VERIFIED | NOT VERIFIED |
| Profile, resume, documents, privacy, settings, deletion | Existing native source; full parity not asserted | NOT VERIFIED | NOT VERIFIED |
| Navigation Web five-tab equality | **OPEN**: current Native still uses Applications instead of Web Career tab | NOT VERIFIED | NOT VERIFIED |
| Small-screen Japanese visual parity, notifications/deep links | **OPEN** until real runtime comparison | NOT VERIFIED | NOT VERIFIED |

## Tests and environment
- Node v22.16.0, npm 10.9.2. Executed locally against exact SHA-matched new `messageInbox.ts` / `messages.tsx`, existing `attentionApi.ts` and branch owner helper:
  `node --experimental-strip-types --test qa/native-candidate-view-owner.test.mjs qa/native-message-inbox-behavior.test.mjs qa/native-message-attention-adapter.test.mjs` — **22/22 PASS** (synthetic data).
- TypeScript parser: `src/app/messages.tsx`, `src/lib/messageInbox.ts`, `src/lib/candidateViewOwner.ts` — 0 parse errors. This is NOT an Expo/React Native typecheck.
- `git ls-remote` HTTPS checkout blocked by `Could not resolve host: github.com`; project-compatible `node_modules` absent. No full `npm ci` / `npm run typecheck` / emulator or device QA.
- Android SDK, adb and emulator unavailable in this Linux runtime; macOS/Xcode/iOS simulator unavailable. Android/iOS signing and authorized distribution not verified.
- GitHub Actions `ci.yml` triggers on **main** push and PR. Development branch has zero workflow runs after these writes; no PR created. Accessible Cloudflare accounts returned zero Pages projects, but other integrations cannot be excluded; no deploy triggered intentionally.

## Next
Integrate previously preserved `/career` candidate into the checked-out Expo project, then correct the exact Web five-tab order. Run full dependency-backed TypeScript and integration tests before creating a PR/triggering costly CI; then complete both-platform visual/runtime QA and independently signed acceptance artifacts. Never treat source tests as two-platform acceptance.
