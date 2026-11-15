# r255 — Canonical notification route RPC integrity (2026-11-15 NZ)

**State: IMPLEMENTING; source-level behavior verified only.** Owner: COLOR Native UI/API adapter and dedicated regression, not public Web, shared backend or other Native apps.

**Versioned reference:** Web JOBSEEKER `src/components/NotificationCenter.tsx`, `main` at `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`; Native `native/src/lib/notifications.ts`, `native/src/lib/scopedNotificationRoute.ts`, `native/src/contexts/NotificationContext.tsx` on `2d009c19587e85dcecfb8da77a8d30f08b1de2c1` (r254). Inspected 2026-11-15 NZ. Synthetic state: authorized candidate, a real server-resolved route or malformed/empty/ambiguous response. No deployed screen capture or private candidate data.

**Gap:** `resolveNotificationRoute` previously selected the first element of any RPC array and blindly cast other response shapes. An array containing multiple destination rows, a malformed record or an unknown route key could fall through to the generic notifications tab, even though the calling push/card flow would mark the notification read first.

**Repair:** `parseCanonicalResolvedNotificationRoute` accepts exactly one RPC row as a record or single-element table, requires a supported current route key and non-empty notification type, validates the optional route-params object shape and rejects ambiguous, malformed or unsupported route responses before the existing mark-read RPC. Existing per-target owned application/scout/spot/visit ID checks remain in place, and the recognized generic `notifications` destination is retained. The parser is a client response contract check only; canonical RPC authorization remains server-side. The route adapter now invokes this parser; the message visibility gate accepts its nullable/unknown typed parameters without changing its `message_received` verification.

**Developer evidence:**
- Node v22.16.0: `cd native && node --experimental-strip-types --test qa/native-notification-route-rpc-integrity-r255.test.mjs qa/native-notification-application-route-r253.test.mjs qa/native-notification-focus-route-integrity-r254.test.mjs qa/native-notification-message-visibility-r252.test.mjs` — **21/21 PASS** on the actual extracted prior GitHub helper plus the new source and the prior r252/r253/r254 test assets.
- TypeScript v5.8.3: `tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler src/lib/scopedNotificationRoute.ts src/lib/notificationMessageReadParity.ts` — **PASS, isolated modules only**.
- Exact Git blob SHA: parsed helper `ca49f059efa7396c1661a34ded4e641339be643a`; r255 test `9880c76d2da670e974f8472237f55bcb57e89bef`; message visibility helper `a449cd75b074859efc58ffae23264c876e289d1f`; adapter `18b28d1e40ff574eda56719c3a755402ec36665d`. Source wiring re-read after changes.
- Expo dependency graph typecheck, actual canonical RPC readback, visual parity, runtime push handling, and Android/iOS app builds **not verified**.

| Candidate workflow | Android | iOS |
| --- | --- | --- |
| Route RPC object/single row vs malformed/ambiguous/unknown route | IMPLEMENTING: shared source unit tests only | IMPLEMENTING: shared source unit tests only |
| Tap notification → authorization → route → persisted read → readback | NOT VERIFIED: emulator/device, QA identity/API unavailable | NOT VERIFIED: simulator/device, QA identity/API unavailable |
| Side-by-side Web appearance, OS interaction, installable signed artifact | BLOCKED_EXTERNAL: SDK/emulator/signing | BLOCKED_EXTERNAL: Xcode/simulator/authorized distribution |

**Cost/release:** Repo `workmarketjp-gif/app.hoikucolor-recruit`, branch `native/color-jobseeker-integration-r216-20261114`, initial parent `2d009c19`. Only this branch changes. Open PR #113 belongs to Hello Work and does not own these paths. `.github/workflows/ci.yml` triggers main push/PR, not development branch-only pushes. Cloudflare `app-hoikucolor-recruit` Worker build triggers returned [] across both connected accounts on this run. No PR, merge, main, Production, DB/RLS, OAuth, paid CI/EAS, external agents or live candidate actions. Additional billing and signing entitlements are unknown.

**Next:** Verify canonical route RPC on an authorized synthetic candidate/readback environment, compile with full Expo dependencies, compare native/Web screenshots on both OSes, and deliver signed Android plus authorized iOS installation only after all acceptance gates pass. Unsupported future server route keys require coordinated Native contract updates before they can be acknowledged.
