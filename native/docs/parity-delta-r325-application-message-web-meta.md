# COLOR Native r325 — Application message metadata Web parity

Web baseline: `src/components/ApplicationMessages.tsx` on main at blob `6275c5e50c3f67eea58a2ecb53d6b984fd34a497`, inspected 2026-11-18. Route: JOBSEEKER `/applications`, opened message panel. Role: synthetic authenticated candidate; populated message with sender and timestamp. Source reference only; deployed SHA/screenshots unverified.

Web message card renders `あなた／園 ・ month/day hour:minute` **above** the body in one muted 14px metadata line. Native previously used a bold sender above the body and a separate full-locale date **below** the body. This delta moves the date to the metadata line using the same Japanese `Intl.DateTimeFormat` locale/options as the Web, keeps local-device timezone, and removes duplicate trailing timestamp. Invalid date values are hidden, not shown as raw server strings. Canonical message ID/body/timestamp and send/readback/attention logic are unchanged.

Changed paths: `native/src/app/application/[id].tsx`, `native/src/lib/applicationMessageWebMeta.ts`, `native/qa/native-application-message-web-meta-r325.test.mjs`, `native/qa/native-application-message-web-visual-r289.test.mjs`, this delta note. The prior visual contract is updated to assert the *approved Web metadata placement*, not suppressed.

Source-level verification: Node 22.16.0 with actual helper: `node --experimental-strip-types --test native/qa/native-application-message-web-meta-r325.test.mjs`; strict TypeScript 5.8.3 helper-only check: `tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --allowImportingTsExtensions native/src/lib/applicationMessageWebMeta.ts`. Both run in an isolated local directory with real retrieved Web/Native source references; full Expo graph not available.

Matrix HC-COLOR-APPLICATION-MESSAGE-META-325:
- Android IMPLEMENTING: source change + isolated test only. Requires actual app render, two device widths, Japanese text scaling, screen reader, and Web side-by-side same synthetic messages.
- iOS IMPLEMENTING: same pending genuine Simulator/iPhone QA and signed install path.
- Persistence/E2E not tested: no canonical candidate writes or real application/messages generated.
- No production/main/PR/Store/API/DB/RLS/Auth/Worker changes, no paid Actions/EAS/agents. Native Android/iOS toolchains and signing/distribution remain unverified.
