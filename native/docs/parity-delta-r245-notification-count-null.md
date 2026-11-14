# r245 — Notification unread-count null integrity (2026-11-15 NZ)

State: **IMPLEMENTING**. No Android/iOS rendered runtime QA or signed acceptance build.

## Web baseline and ownership
- Web JOBSEEKER main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/components/NotificationCenter.tsx` (notification bell/inbox, unread vs all-read and empty states), inspected from source 2026-11-15 NZ. Role: synthetic signed-in candidate, synthetic unread-count unavailable; no deployed Web screenshot or real API dataset.
- Native candidate notification tab and canonical RPC `hc_jobseeker_get_unread_notification_count_v1`. COLOR owner branch `native/color-jobseeker-integration-r216-20261114` parent `a471ab9412adc01a99ea5c999562adc7b48683a0`; PR #113 changes only Hello Work QA/spec; no overlapping Native paths.

## Closed source gap
- Native RPC adapter used `Number(data)`, which silently turned a `null` or empty scalar into 0. This could report all-read/empty despite an unknown canonical unread count.
- Parse only finite safe nonnegative integers or unambiguous decimal integer strings. `null`, `undefined`, boolean, whitespace, fractions, overflow, objects and malformed strings throw fixed `NOTIFICATION_UNREAD_COUNT_UNAVAILABLE` (no raw backend data).
- The established `Promise.allSettled` pipeline then preserves verified list rows, flags count unknown, shows recoverable warning and disables unsafe 'すべて既読' action. True zero is preserved. No new RPC, persistence, roles, push subscription or business policy.

## Evidence
- Linux Node v22.16.0 `node --experimental-strip-types --test qa/native-notification-count-parser-r245.test.mjs`: 4/4 focused cases PASS against actual TypeScript helpers; system TypeScript 5.8.3 strict isolated check PASS. Full Expo SDK typecheck and Native installed QA NOT RUN.
- Canonical save/readback, OS-specific push permission, Android and iOS UI: NOT VERIFIED. No real candidate information used.

| In-scope flow | Android | iOS | Missing evidence |
| --- | --- | --- | --- |
| Unavailable/null unread count not treated as 0 | IMPLEMENTING (source + focused Node test) | IMPLEMENTING (source + focused Node test) | Native render and RPC failure replay on each OS |
| Verified notification list retained, all-read action disabled on unknown count | IMPLEMENTING | IMPLEMENTING | Synthetic account canonical reload and Web comparison |
| Installed signed handoff | NOT AVAILABLE | NOT AVAILABLE | Signing + Android SDK/emulator + iOS Xcode/TestFlight permissions |

Only COLOR Native app/adapters/qa/docs modified. No Web/main/PR/prod/DB/RLS/auth/Cloudflare/Store or real user mutation. GitHub CI triggers main/PR, not isolated branch push; connected Cloudflare Worker Builds trigger GET returned [] in both visible accounts on 2026-11-15; other build routes and quota not exhaustively verified. No paid Actions/EAS agents started.
