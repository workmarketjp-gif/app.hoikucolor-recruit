# COLOR Native r385 — single-flight canonical notifications and post-write readback

## Source / ownership (2026-11-20 NZDT)
- Web JOBSEEKER `/notifications`, Web main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, `src/components/NotificationCenter.tsx` blob `34a4f274d3e8c7a4c7131030245a6d7e1b0f58bd`. Synthetic signed-in candidate A with two notifications, concurrent foreground/timer/explicit refresh, then mark-read and canonical reread. Source reference, NOT a verified deployed SHA or paired capture.
- Native parent: r384 `5a3ffec7147d4bac4cb0cb48c4a98ef7e959eb8d`. Branch: `native/color-notification-canonical-read-flight-r385-20261120`. Single COLOR writer; the open-PR search returned none at preflight, root/native `AGENTS.md` absent. Do not cherry-pick the abandoned r377 restriction.
- Relevant existing work: r383 same-session notification retention and r384 private row session-pin quarantine. No change to either contract. HQ #265 `MINIMUM_COST_V1` and #467 remain controlling.

## Real-source gap / bounded implementation
- The existing notification provider called `loadCanonicalSnapshot` independently from mount, active-window timer, foreground, push invalidation and explicit reload. When simultaneous, each call launched a new Clerk pin and three canonical read requests (list/count/attention), then invalidated previous generation. This wastes queries and creates avoidable state races.
- New `notificationCanonicalReadFlight.ts` coalesces *quiet* reads for the exact candidate/Clerk session. Its promise is released after both success and failure. A `fresh` refresh (user request and post-mark-read mutation) runs after any older in-flight read rather than treating pre-write data as a new confirmation. Concurrent fresh requests join a single subsequent read.
- The `NotificationContext` now tracks a render-time private-owner epoch and refuses queued reads after candidate/session switch or App Lock, including lock/unlock to the same owner key. Ongoing Clerk/RPC reads still use their preexisting pin, generation and privacy checks; an additional epoch check protects post-await presentation.
- No new canonical API, RLS, DB, push registration, user-specific caching, permissions, application/message/scout write, or Web source changes. This is a bounded read-concurrency fix, not a new notification feature.

## Web → Android/iOS scoped delta
| Synthetic workflow | Web intent | Shared Native implementation | Android runtime | iOS runtime |
|---|---|---|---|---|
| Two same-session quiet invalidations in one read window | Refresh authoritative data without false state | Single in-flight read instead of redundant RPC triples | NOT VERIFIED | NOT VERIFIED |
| Explicit reload/after-read mutation during older read | New result must reflect post-mutation server state | Queue a fresh canonical read; never relabel old count as current | NOT VERIFIED | NOT VERIFIED |
| Old canonical request fails, later explicit refresh | Show an error and allow canonical recovery | New read starts after failure | NOT VERIFIED | NOT VERIFIED |
| Candidate switch / lock-unlock while queued | No private cross-session presentation | Privacy epoch rejects queued read; stale response fenced | NOT VERIFIED | NOT VERIFIED |

## Exact test evidence, integration and limits
- Node v22.16.0, isolated actual helper source: `node --experimental-strip-types --test native/qa/native-notification-canonical-read-flight-r385.test.mjs`: **9/9 PASS**. The prior unchanged r383 test was rerun together with the new regression: **19/19 PASS**.
- `tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler native/src/lib/notificationCanonicalReadFlight.ts native/src/lib/notificationVerifiedRefresh.ts native/src/lib/notificationListPresentation.ts`: **PASS**, strictly *helper-only*. GitHub blob SHA `add15f25c16037ac559f22e9765ceeae186e85f9` matches locally executed helper, test blob `46711ba2c423010f2b06f9fe81709dc23d882176` matches locally executed test. Context blob after change `4ac7000c0145587c657bc288f331e811f0cebce5`, GitHub re-read and static wiring inspected.
- **NOT VERIFIED:** whole Expo/Clerk/React Native typecheck and installed Android/iOS runtime; no local compatible `node_modules`, Android SDK/adb/emulator, macOS/Xcode/iOS simulator. No canonical synthetic Supabase save/re-read or Web↔Native rendered comparison. Android signed APK and iOS signed TestFlight/ad-hoc route not available; no acceptance builds for this SHA.
- `.github/workflows/ci.yml` runs on push to main or pull_request, not this isolated branch. Before branch writes the Cloudflare read-only GET for `app-hoikucolor-recruit` Workers Builds triggers returned 0 on each of two accessible accounts (does not prove all deployment routes or billing). No PR, main merge, paid Actions/EAS, production deploy, live user mutation, real-candidate screenshot, external agent, or Store submission.
- **State: IMPLEMENTING** on both OSes, not DEVELOPER_VERIFIED or READY_FOR_MASA_ACCEPTANCE. Pending: full dependency install and TSX typecheck, real native Web-comparison QA, canonical synthetic application/message end-to-end, signing and authorized distribution. Cost and quota unknown.
