# r256 — Candidate notification bell in the Native tab header

**State: IMPLEMENTING (source verification only).** 2026-11-15 NZ. Owner: COLOR Jobseeker Native UI and dedicated regression; no changes to Web, backend or other Native apps.

**Web reference:** `src/components/CandidateShell.tsx` and `src/components/NotificationCenter.tsx`, current `main` SHA `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`, read on 2026-11-15. Role: signed-in authorized synthetic candidate. State: unknown/zero/positive/100+ notification unread count; no real candidate data or rendered capture. Web's current five fixed mobile tabs are `ホーム / 求人を探す / お給料 / 気になる / マイページ`. The `応募管理 / メッセージ` flows remain secondary mobile destinations under My Page and Home; do not replace the verified Web bottom tabs with an outdated assumption. Web header includes a notification bell and bounded `99+` badge.

**Native base:** `workmarketjp-gif/app.hoikucolor-recruit`, `native/color-jobseeker-integration-r216-20261114` at `38a41118bb43da4815db7615dbb8c22e69da23f3`. Pre-change `native/src/app/(tabs)/_layout.tsx` had title-only navigation headers and no bell; notification screen was accessible via the Home to-do area but absent from the tab header. Existing Native candidate-private NotificationContext and its canonical owner/session-scoped unread count are reused.

**Change:** Add the brand-colored notification bell, with a 48x48 tap target and accessible unread label, to the five main Native tab headers. Press opens the existing in-app Notification screen, never an untrusted push deep link or browser page. Unknown/stale/invalid counts show no false zero; positive counts cap badge text at `99+`, while the screen-reader announcement preserves exact count. Keep all five verified Web tab names/order and existing secondary screens. No new dependency, API, schema, permissions or paid service. Bell outline is drawn from dependency-free RN primitives and is an approximation pending screenshot verification.

**Scoped tests:** Node v22.16.0 with `cd native && node --experimental-strip-types --test qa/native-notification-header-parity-r256.test.mjs`: 6/6 PASS. TypeScript v5.8.3: `tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler src/lib/candidateNotificationHeaderBadge.ts`: PASS for isolated disclosure helper only. The UI is not Expo-compiled or Native-rendered in this environment.

| Workflow | Android | iOS |
| --- | --- | --- |
| Header bell -> in-app Notification list; private unread badge | IMPLEMENTING: source wiring and pure-helper tests only | IMPLEMENTING: same shared source tests only |
| Screen match vs Web (size/typography, long Japanese text, text scale, safe area) | NOT VERIFIED: SDK/emulator unavailable | NOT VERIFIED: macOS/Xcode unavailable |
| Signed install, canonical API readback, app acceptance | BLOCKED_EXTERNAL: SDK/device/signing | BLOCKED_EXTERNAL: simulator/signing/authorized TestFlight/ad-hoc |

**Integration/cost:** GitHub `.github/workflows/ci.yml` listens on `main` push and PR; isolated branch push alone does not match. Cloudflare Workers Build triggers for `app-hoikucolor-recruit` returned none in two connected accounts. No main/PR/Production/DB/RLS/Workers writes, paid CI/EAS or external agent. Actual billing limits and signing/distribution authorization are unknown.

**Next:** Compile full Expo project with locked dependencies when available; run the bell on both OSes, verify header navigation, focused/unknown/100+ badges and live canonical reload against same synthetic Web candidate. Extend the shared bell to secondary native stacks only with explicit route/header evidence. Both OSes and installable builds still required before `READY_FOR_MASA_ACCEPTANCE`.
