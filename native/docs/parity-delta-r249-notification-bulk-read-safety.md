# r249 — Notification bulk-read confirmation and duplicate-tap safety (2026-11-15 NZ)
State: **IMPLEMENTING** — Android/iOS runtime not developer verified.

**Frozen Web reference:** authenticated jobseeker `src/components/NotificationCenter.tsx` and `src/lib/notificationRepository.ts`, main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, reviewed 2026-11-15. SQL authority: `supabase/migrations/20260914030000_hc_jobseeker_notification_read_boundary_v1.sql`: `hc_jobseeker_mark_all_notifications_read() RETURNS integer` (candidate-owned unread row count). Synthetic state: candidate A with unread notifications; duplicate taps; candidate/session switch; null and zero-return read outcomes. Source inspection only, no rendered Web capture or live RPC.

**Difference repaired in Native source:** previous bulk-read adapter ignored `data` and treated HTTP success with null/bad shape as confirmed. Now only exact signed 32-bit nonnegative integers (or exact decimal strings) are accepted; zero is valid but never treated as proof of a fresh list. Existing canonical refresh remains mandatory after success. Owner/session-scoped immediate single-flight prevents duplicate mark-all writes; pre-write Clerk pin is bounded and reconfirmed before mutation. The RPC itself is not timed out or retried; post-RPC ambiguous result surfaces a generic error and requires user refresh. Existing RLS and private Storage remain untouched.

**Focused tests:** `node --experimental-strip-types --test qa/native-notification-mark-all-confirmation-r249.test.mjs` (new helper behavior and source wiring). Helper-only TypeScript: `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext src/lib/notificationMarkAllConfirmation.ts src/lib/notificationMarkAllSingleFlight.ts`. No claim of Expo SDK-backed typecheck.

| Requirement | Android | iOS |
| --- | --- | --- |
| Bulk read integer confirmation, zero/unknown outcomes, repeated taps, account switch | IMPLEMENTING — helper behavior and source wiring; native runtime/API save→readback unverified | IMPLEMENTING — helper behavior and source wiring; native runtime/API save→readback unverified |
| Pink Web visual parity, Japanese labels, small/standard and scaled text | IMPLEMENTING — screen source unchanged except pending disable; rendered screenshots absent | IMPLEMENTING — screen source unchanged except pending disable; rendered screenshots absent |
| Signed installable acceptance artifact | BLOCKED_EXTERNAL — SDK/emulator/signing route absent in current Linux runtime | BLOCKED_EXTERNAL — macOS/Xcode and authorized distribution absent |

COLOR-only branch `native/color-jobseeker-integration-r216-20261114` base `5e540b2f49ac256d62c48b60ac0a41bd174c6fc8`. PR #113 owns unrelated Hello Work documentation. No main/PR/Production/DB/Auth/Worker/EAS/paid Actions changes. Source/parity still incomplete; do not promote READY_FOR_MASA_ACCEPTANCE.
