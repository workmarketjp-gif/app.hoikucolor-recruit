# r247 — Notification list canonical response integrity (2026-11-15 NZ)

State: **IMPLEMENTING** (source test passed; neither Android nor iOS runtime developer-verified).

## Reference and source of truth

- Web JOBSEEKER notification bell: `src/components/NotificationCenter.tsx`, `src/lib/notificationRepository.ts`, `main fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, reviewed 2026-11-15 NZ, signed-in synthetic candidate with empty/populated/failed notification RPC state. The deployed Web SHA, rendered Web capture and a genuine backend failure occurrence are **not verified**.
- Native `/(tabs)/notifications`: `native/src/contexts/NotificationContext.tsx`, `native/src/lib/notifications.ts`, `native/src/lib/notificationReadSnapshot.ts`; Native baseline commit `405a67069dceff54fced7b116f5be0b7d90038f3`.
- Contract: `supabase/migrations/20260914030000_hc_jobseeker_notification_read_boundary_v1.sql` defines `hc_jobseeker_list_notifications` as `RETURNS TABLE`, meaning a successfully empty list is `[]`, not `null`.

## Closed source gap

Before this change, Native `listNotifications` returned `(data ?? [])`. An RPC response with no transport error but a null/malformed payload therefore became a false confirmed empty inbox, potentially masking the existence and read state of notifications.

The list boundary now rejects null/scalars/malformed rows and duplicate row IDs with `NOTIFICATION_LIST_UNAVAILABLE`. It accepts a genuine empty array and preserves valid rows without filtering or changing their read status. `NotificationProvider` already treats a rejected list read as a recoverable failure, displays its safe Japanese error and never treats it as canonical empty. The prior unknown-count, App Lock/session lease and failed-write safeguards remain unchanged. No RPC, backend, private data access, push registration, mark-read mutation, or Web source changed.

The Web repository currently also uses `(data || [])` in `listJobseekerNotifications`; this is flagged as a **potential source-level Web defect** for the Web owner, not copied into Native or claimed as reproduced under live backend conditions.

## Evidence and limitations

- Linux Node v22.16.0, npm 10.9.2, TypeScript 5.8.3; no complete Expo SDK install/working Native runner.
- Real-source `node --experimental-strip-types --test native/qa/native-notification-list-integrity-r247.test.mjs`: **4/4 PASS**.
- `tsc --strict --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck src/lib/notificationReadSnapshot.ts` from `native/`: **PASS**.
- Exact new helper blob `ae4eef3dc9b2b13f635cee9ecf47b39e5c9d341f`; test blob `16b2a89e7fe00fb803933a74e31e690b43ba0cc6`, verified against locally executed files; integration wiring blob `3d9006bb78a97777eaa02d14af246b0a0718f9b1` confirmed via GitHub connector. Source-level test, not mounted React Native or real API integration.

| Workflow | Android | iOS | Further acceptance work |
| --- | --- | --- | --- |
| Genuine empty notification response vs null/malformed response | IMPLEMENTING (source-only PASS) | IMPLEMENTING (source-only PASS) | Synthetic canonical API responses in installed Native UI; validate error/retry and no false all-read |
| Valid list with unread/read timestamps, badge and navigation | IMPLEMENTING | IMPLEMENTING | Same-state Web and Native screenshots, session changes, actual canonical save/readback |
| Signed candidate installation | BLOCKED_EXTERNAL | BLOCKED_EXTERNAL | Android SDK/emulator plus permitted signing route; authorized Xcode/TestFlight or ad-hoc/iOS internal distribution |

At this run Android SDK/emulator, macOS/Xcode/iOS Simulator were not present; Android signing and iOS distribution permissions not verified. Direct `git ls-remote` failed to resolve github.com; read/writes used the authorized GitHub connection. There is no physical acceptance evidence. No paid Actions/EAS, external coding agent, PR, main, Web, production DB/RLS/auth/Edge/Worker or store publication was started.

Repo CI only triggers on `main` push and `pull_request`; branch-only commits use `[skip ci]`. Cloudflare Workers Builds triggers for `app-hoikucolor-recruit` returned empty in both connected accounts; other billing routes/limits remain unknown. PR #113 is an unrelated Hello Work draft-spec path. Color is sole verified writer of these Native paths at the prewrite branch HEAD; this does not assert external schedulers are disabled.

Next: run the full locked Expo typecheck when dependencies are genuinely available, then verify real backend read/error/retry, badge and Web-equivalent display in Android and iOS. Keep platform statuses separate until signed QA candidates exist.
