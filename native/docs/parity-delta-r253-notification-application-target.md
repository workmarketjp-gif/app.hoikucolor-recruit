# r253 — Application notification route must not acknowledge an invalid destination

State: IMPLEMENTING (source-level). Reviewed 2026-11-15 NZ. Web reference: candidate `src/components/NotificationCenter.tsx` on Web main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6` (blob `34a4f274d3e8c7a4c7131030245a6d7e1b0f58bd`); synthetic candidate with an owned application notification, a missing/malformed `applicationId`, and an ordinary valid application ID. No deployed capture or live candidate data.

## Gap and source correction

`nativeNotificationHref` previously returned `/(tabs)/notifications` when an `application_messages`, `application_interview` or `application_detail` RPC route lacked its application ID. Its callers marked a notification read before navigating, so a broken private destination could silently lose its unread status instead of opening the actual message, interview or application detail. Native now requires a syntactically valid UUID for these three canonical application destinations **before** either the push or notification-list flow may launch a read mutation; absence or malformed identity throws `NOTIFICATION_TARGET_UNAVAILABLE`. Existing RLS/recipient ownership checks stay in `hc_jobseeker_resolve_notification_route_v1` and the mark-read RPC; UUID syntax is not an authorization claim. Valid routes and `focusKey` continue unchanged. Scout/spot/visit navigation rules remain unchanged.

The frozen Web NotificationCenter currently falls back to `/applications` for a missing application ID and can acknowledge an unread message without showing its thread; this potential source defect must go to its Web owner, not be copied into the Native flow. No production incident has been proven.

## Verification and handoff

- Node v22.16.0: `node --experimental-strip-types --test native/qa/native-notification-application-route-r253.test.mjs` — **5/5 PASS**, with invalid/missing/array/query-injection ID variants on the real helper.
- TypeScript v5.8.3: `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext native/src/lib/scopedNotificationRoute.ts` — **PASS** (dependency-free helper only).
- Original Native `scopedNotificationRoute.ts` reconstructed with exact Git blob `7100075a2062534ab83c485dd010e5b63544c707` before patch. Confirm committed Native adapter imports/calls the new validation before `markNotificationRead` after integration.
- Expo dependency-backed typecheck, actual canonical RPC readback, Android/iOS rendered navigation/error presentation, platform notifications, installed signed builds **NOT VERIFIED**.

| Web-to-Native synthetic journey | Android | iOS |
| --- | --- | --- |
| Owned message/interview/status notification → resolved valid application route → destination | IMPLEMENTING; source guard tested, actual Native unavailable | IMPLEMENTING; source guard tested, actual Native unavailable |
| Resolved application route missing/invalid ID → no automatic acknowledgment | IMPLEMENTING; source guard tested, actual Native unavailable | IMPLEMENTING; source guard tested, actual Native unavailable |
| Installed candidate + same-state Web parity/security QA | BLOCKED_EXTERNAL: Android SDK/emulator/signing unverified | BLOCKED_EXTERNAL: macOS/Xcode/Simulator/distribution unverified |

COLOR-only writer, `workmarketjp-gif/app.hoikucolor-recruit`, branch `native/color-jobseeker-integration-r216-20261114`, parent `d967b4b2c2e559380a2bf3d28d20179941094120`; unrelated open PR #113 owns Hello Work documentation. Existing `.github/workflows/ci.yml` has push `main` and `pull_request` triggers; do not open PR/merge without CI billing approval. No actual application/message, backend, auth, RLS, Web, Worker or production modification; no extra Actions/EAS/Codex/Claude. Billing quota and signing/distribution permission unverified. Next: current-head integrated Expo typecheck and Android/iOS real render + synthetic authorized notification open→message visibility→readback; then signed installable builds.
