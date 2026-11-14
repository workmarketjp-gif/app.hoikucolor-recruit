# r252 — Message notification read only after actual thread visibility

State: IMPLEMENTING (source-only). Review date: 2026-11-15 NZ. Web reference: JOBSEEKER `src/components/NotificationCenter.tsx` and `src/components/ApplicationMessages.tsx`, `main fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`; Native parent `22b76bb24a28690544c11abfc8969d2c95da5b3e`. Synthetic candidate A receives an owned `message_received` push/card; thread is initially below the fold. Source comparison, not deployed Web/mobile screenshots.

## Gap and repair
Web deliberately defers marking a `message_received` notification read when its destination is the application-messages panel. Native push and notification list-card both previously called `hc_jobseeker_mark_notification_read` before the message was visible, misleadingly removing unread badges. Existing `hc_jobseeker_mark_application_messages_read` RPC updates the candidate-owned `hc_notifications` rows only when the facility message is visibly rendered; verified in `20260912125500_hc_jobseeker_attention_summary_v1.sql` lines 119–155.

Native now defers the notification-specific mark-read RPC **only** for server-resolved `notification_type=message_received`, `route_key=application_messages`, a valid application UUID and the exact focused Native message path. Other notifications retain explicit canonical read before navigation. After an actually visible message triggers the existing authorization-checked mark-messages-read RPC and confirms >0 affected rows, the app requests a fresh owner-pinned notification count/list read, without faking a zero count or retrying writes. Both push and list-card flows use the same policy; untrusted push `data`/`link_url` do not decide the policy.

## Verification and boundary
- Node 22.16.0: `node --experimental-strip-types --test native/qa/native-notification-message-visibility-r252.test.mjs` — 6/6 PASS on the actual new helper.
- Global TypeScript 5.8.3: `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext native/src/lib/notificationMessageReadParity.ts` — PASS (helper-only).
- Native context, application message-visibility source wiring and GitHub blobs must be checked after commit. Expo full typecheck and dependency-loaded components NOT VERIFIED. No canonical live readback, actual push delivery or screenshot completed.

| Journey | Android | iOS |
| --- | --- | --- |
| `message_received` card/push → focused thread → real visible message → unread refresh | IMPLEMENTING, source tests only, installed runtime NOT VERIFIED | IMPLEMENTING, source tests only, installed runtime NOT VERIFIED |
| Other notification types read and navigate | Existing implementation preserved; native runtime NOT VERIFIED | Existing implementation preserved; native runtime NOT VERIFIED |
| Signed installable developer handoff | BLOCKED_EXTERNAL: Android runner and signing/distribution unverified | BLOCKED_EXTERNAL: Xcode/iOS runner and distribution unverified |

COLOR single writer: `workmarketjp-gif/app.hoikucolor-recruit` branch `native/color-jobseeker-integration-r216-20261114`. Open PR #113 owns Hello Work spec; no path overlap. `ci.yml` triggers main push/PR; this isolated branch write is not a PR/main release. No Web/shared API/SQL/RLS/Workers/production, real message or user mutation, added paid CI/EAS, external agent or store submission. Remaining billing quota and signing permissions unknown. Next: Expo integrated compilation, synthetic test-account readback across Web and both native OSes, then verified installable builds.
