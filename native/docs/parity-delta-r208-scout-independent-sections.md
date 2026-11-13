# r208 — Scout inbox / privacy / matching independently verified reads (2026-11-13 NZ)

## Fixed source reference and scope
- Web: `src/components/ScoutInbox.tsx` (main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, blob `0550682098ba152b73e40cd11029778763e83112`) and `src/components/ScoutPrivacyPanel.tsx` (blob `00011387ee8861bd665202294561ccdd2eec3498`). Role: authenticated synthetic jobseeker, populated and one-section RPC failure; source inspected 2026-11-13 NZ, no paired rendered capture.
- Native: parent detached integration candidate `c4e6fde4158596975f8ae0e9f5c88e01aefe8b37`, `native/src/app/scouts.tsx` old blob `c214721772a752e450ae1e36b3d38e5e3d4722ad`. No open Native-path PR at owner inspection; open #113 is Hello Work documentation only.
- Previously, `Promise.all` of inbox / privacy / matching meant any one failure hid all verified sections behind a retry spinner indefinitely on a hung RPC. Web renders these sections independently.

## Native correction and data/privacy semantics
- Candidate token/read is time-bounded through existing `pinCandidateForRead`; three **canonical** reads run independently with a 15s presentation deadline. No new RPC, no polling, no auto-retry and no permissions change.
- A success is published only for the same pinned user, session, focus generation and still-allowed private view. Failed sections remain **unknown**, not empty or default values.
- A confirmed inbox stays visible and answerable if privacy/preferences fail. A failed inbox is explicitly unavailable (never "0件" or "まだ届いていません"), while individually confirmed privacy/preferences panels stay available.
- Preferences editor/save is hidden when its canonical read failed. Privacy toggle/block actions require an actual returned privacy object. Reply actions require an independently confirmed inbox. A visible full reload warns that drafts are reset; the original list-only refresh still preserves current editable forms after a successfully loaded inbox.
- Failed mutations continue to trigger the existing uncertain-write quarantine and canonical re-read policy. No real application/scout/message was sent.

| Workflow / parity state | Android | iOS | Evidence / remaining |
|---|---|---|---|
| All three private reads succeed | source candidate | source candidate | helper 9/9 Node PASS and strict helper-only TypeScript PASS |
| One private read fails / hangs | source candidate | source candidate | confirmed others retain data; failure never turns into empty, no invented count |
| App Lock/account/focus revocation | source candidate | source candidate | no result published after lease loss; candidate RLS remains authoritative |
| Real Native rendered comparison to Web | NOT VERIFIED | NOT VERIFIED | emulator/Simulator unavailable |
| Actual Clerk/Supabase read/write E2E | NOT VERIFIED | NOT VERIFIED | authorized synthetic credentials and runtime not available |
| Signed installable acceptance artifact | NOT VERIFIED | NOT VERIFIED | Android signing and iOS TestFlight/ad-hoc route unconfirmed |

## Evidence, gates and cost
- Node v22.16.0: `node --experimental-strip-types --test qa/native-scout-independent-sections-r208.test.mjs`: **9/9 PASS** on newly authored real helper and the existing unchanged `privateReadDeadline.ts`.
- TypeScript 5.8.3: `tsc --noEmit --strict --skipLibCheck --allowImportingTsExtensions --target es2022 --module esnext --moduleResolution bundler --lib es2022,dom src/lib/privateReadDeadline.ts src/lib/scoutIndependentSections.ts`: PASS.
- GitHub source-wiring conditions checked against the exact transformed Native TSX blob. **Full Expo TypeScript/React Native compile and mounted Native QA NOT EXECUTED**, so this is not developer-verified two-OS parity.
- PR/main pushes trigger .github/workflows/ci.yml, including Android compile and Playwright. Cloudflare Preview and build quota safety is not independently confirmed; keep candidate detached and do not start CI/EAS/production.
- Next: fully materialize Expo dependencies in an authorized environment, reconcile detached commits, run actual source typecheck and both-OS QA before creating a safe branch/PR. No automatic third-party coding session.
