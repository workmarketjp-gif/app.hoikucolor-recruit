# r246 — Notification canonical read deadline (2026-11-15 NZ)

State: **IMPLEMENTING**; no installed Android/iOS runtime evidence or signed delivery.

Baseline: Web JOBSEEKER notification bell `src/components/NotificationCenter.tsx`, Web main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, inspected 2026-11-15 NZ; synthetic signed-in candidate with pending/failed notification read. Native `/(tabs)/notifications` owner-scoped, uses canonical RPCs; no production screenshot/state captured. COLOR single writer branch `native/color-jobseeker-integration-r216-20261114`, parent `1a206d03db935d91e2ec2ec80e316d369e839c05`; unrelated PR #113 Hello Work spec only.

**Closed SOURCE gap:** NotificationProvider's Clerk pre-read pin, list RPC, unread-count RPC, and attention summary could wait indefinitely. Reuse existing `boundedPrivateRead` at 15s per private read. A stuck list/pin produces a recoverable error, never an empty confirmed inbox. Stuck count or attention is unknown with warning while verified list stays visible; no fabricated 0, success, message or badge. Existing generation/owner/session/App Lock checks after awaits are untouched; late RPC settlement cannot mutate this view. No timeout, retry, or cancellation is added to any write/mutation RPC or push registration.

Focused Linux Node 22.16.0 test `node --experimental-strip-types --test qa/native-notification-read-deadline-r246.test.mjs`: 4/4 PASS using real existing helper and canonical resolver. System TypeScript 5.8.3 strict isolated helper check PASS. No React Native mount, Expo full typecheck, live API QA, physical device evidence or screenshot claim.

| Workflow | Android | iOS | Unverified requirement |
| --- | --- | --- | --- |
| Notification load never stays spinning on stuck read | IMPLEMENTING (source only) | IMPLEMENTING (source only) | Real device timer/error/retry UI |
| List/count/attention partial failure preserves canonical distinctions | IMPLEMENTING (focused Node) | IMPLEMENTING (focused Node) | Synthetic app+Web verification and badge permissions |
| Signed acceptance delivery | NOT AVAILABLE | NOT AVAILABLE | Android SDK+signing and authorized iOS Xcode/TestFlight |

No main, PR, Web, production, backend, DB/RLS/auth, Cloudflare, real applications or messages changed. CI configured for main/pull_request, not development branch push. Connected Cloudflare Worker Builds returned zero triggers in current available accounts; quotas and alternative build routes not conclusively verified. No paid CI/EAS/agent started.
