# Hoiku Color Native — r137 canonical selection-timeline parity

Date: 2026-11-10 NZ | **IMPLEMENTING** (source and focused model verification only).

## Reference and exact ownership
- Canonical Web: `workmarketjp-gif/app.hoikucolor-recruit` main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/components/ApplicationDetail.tsx` blob `a07aa957c94a2a2ac80e8e69a58a1e4523149300`; Web CSS `src/components/ApplicationDetail.css` blob `a327f6b0e113ce89be54dd5923036144b77e9bc1`. Source capture 2026-11-10 NZ, authenticated jobseeker synthetic stages `new/reviewing/interview/offered/hired/withdrawn/rejected`. This is NOT an actual deployed/visual Web screenshot.
- Native source baseline: r136 `26a8351cfa00fbede4fae61e2c080127f55836b8` `native/src/app/application/[id].tsx`. At start the repo had no open PR; no `AGENTS.md` was found in this repo's recursive source tree. HQ #467 and #265 instructions were read. Separate Color-only branch `native/color-application-timeline-web-parity-r137-20261110`; no `main` or other-owner writes.
- In-scope route: Web application detail → Native `/application/[id]`, current authorized candidate, canonical application status. Existing messages/visits/interviews/offers/auth and RPC unchanged.

## Closed source gap
- Web has a 5-stage selection/progress timeline showing 応募 → 書類確認 → 面接 → 内定 → 採用 with progress for known canonical statuses and a distinct terminal card for `withdrawn` and `rejected`. Native previously showed only a badge and no timeline.
- Added a pure canonical-status view model and integrated it into Native application detail, including the Web status aliases and terminal explanatory copy. Never synthesizes a facility decision or a job.
- Recreated the Web's bordered white strip, warm pink `#fb2f52` completed nodes, 14sp weighted labels, connecting lines and horizontal scrolling for narrow screens. Explicit accessible stage names and reached/unreached states. Keep private-view/session gating: timeline is rendered only after an authorized detail read.
- Necessary OS difference: horizontal nested Native ScrollView vs CSS grid with horizontal overflow; Android nested scrolling, iOS gesture and dynamic type still require rendered checks.

## Evidence / limits
- Linux Node `v22.16.0`; `node --experimental-strip-types --test native/qa/native-application-selection-timeline.test.mjs` **12/12 PASS** on the same helper/test text that was committed to GitHub, after RED missing-helper reproduction.
- `tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck native/src/lib/applicationSelectionTimeline.ts` **PASS** for this standalone helper only.
- Screen wiring assertions checked against connected GitHub source; new `native/qa/native-application-selection-timeline-wiring.test.mjs` committed. Node execution of that screen-wiring test and full Expo typecheck NOT VERIFIED because the full checkout and locked SDK dependencies are unavailable locally; no fabricated RN stubs.
- No Android emulator/SDK, iOS/macOS/Xcode runner, real Web/Native paired screenshots, canonical saved readback or signed installable artifacts. No action has been executed against a real candidate account.
- CI `.github/workflows/ci.yml`: main push/PR triggers including Android job; branch-only isolated writes to avoid unapproved CI. No PR/main merge, build, EAS, production DB/RLS/auth/Edge/Worker change or Store upload. External service quota/total billing unverified.

## Parity matrix
| Workflow | Web source | Android | iOS | Remaining |
| --- | --- | --- | --- | --- |
| `/application/[id]` selection timeline | 5-step source+CSS frozen above | Native source implemented; runtime NOT VERIFIED | Native source implemented; runtime NOT VERIFIED | Full Expo `npm ci`/typecheck, real 320/375/390/430 equivalent-width screenshots, long labels/200% text, horizontal scroll, both OS; synthetic authorized canonical status readback and Web same-state comparison |
| Rejected/withdrawn terminal outcome | Same Web source | Native source implemented; runtime NOT VERIFIED | Native source implemented; runtime NOT VERIFIED | Verify no falsely completed stage and exact status/terminal text on both OS |

**Next highest-priority work**: dependency-backed TypeScript and screen-wiring regression, then rendered Web→Android/iOS source-matched review of application detail including interview responses and messaging, followed by full search→apply→message same-account integration and signed two-OS handoff.
