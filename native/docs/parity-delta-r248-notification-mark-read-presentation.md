# r248 — Notification mark-read confirmation and timestamp/brand parity (2026-11-15 NZ)

State: **IMPLEMENTING** — source test only; neither Android nor iOS is developer-verified.

Web source reference (authenticated synthetic jobseeker): `src/components/NotificationCenter.tsx` and `src/lib/notificationRepository.ts`, Web main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, reviewed 2026-11-15 NZ. The Web popover checks the `hc_jobseeker_mark_notification_read` boolean before acknowledging a click and renders relative Japanese dates and pink unread emphasis. Deployed Web SHA and same-state screenshot are not verified.

Native parent: `b975f501a12d7251923cf257c8f511e61ebfb815`. The previous adapter discarded the RPC boolean and could treat an explicit `false` (no candidate-owned row matched) or an unconfirmed scalar as successful, including push-response navigation. The read adapter now accepts only `true` as confirmed; `false` gives `NOTIFICATION_NOT_FOUND`; malformed/missing return gives `NOTIFICATION_MARK_READ_UNCONFIRMED`. The provider no longer suppresses failed mark-read during a push response; its existing safe catch handles definitive missing rows via inbox navigation and leaves uncertain failures unacknowledged for user retry. This does not add mutation retries, change DB/RLS, or use untrusted push URL for routing.

The Native notification screen now uses Web-equivalent Japanese relative time and pink unread styling; no new route, auto-message, backend operation or feature redesign. Native per-row press is explicitly marked as a button for accessibility.

Real-source focused evidence: Node 22.16.0 `node --experimental-strip-types --test qa/native-notification-mark-read-and-time-r248.test.mjs` **7/7 PASS**, helper-only TypeScript 5.8.3 strict `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext` **PASS**. Previous r245-r247 dependency-free regressions **12/12 PASS** in preserved exact-source evidence workspace. React Native screen isn't mounted; Expo full typecheck and real RPC save/readback remain unverified.

| Scenario | Android | iOS |
| --- | --- | --- |
| Mark-read true/false/unknown, push vs in-app tap | IMPLEMENTING — focused source only | IMPLEMENTING — focused source only |
| Relative time, unread color, text enlargement and notification navigation | IMPLEMENTING — screen wiring only | IMPLEMENTING — screen wiring only |
| Signed installable developer-verified artifact | BLOCKED_EXTERNAL — no Android SDK/emulator or verified signing | BLOCKED_EXTERNAL — no macOS/Xcode/simulator or authorized iOS distribution |

Single COLOR writer on `native/color-jobseeker-integration-r216-20261114`, start HEAD `b975f501a12d7251923cf257c8f511e61ebfb815`. PR #113 owns Hello Work spec only, no path collision. Branch-only `[skip ci]`, no main/PR/Production/Cloudflare/DB/auth changes, no paid Actions/EAS/API agent. Linked quota and signing privileges unverified.

Next: permitted complete Expo dependencies for full compile and real Android+iOS in-app notification mark/readback and Web screenshot comparison. Do not treat source checks as platform acceptance.
