# r327 — Open application document refresh reconciles the parent handoff warning

Date: 2026-11-18 NZ. COLOR Native source change only. No Android/iOS installed render or live API acceptance is claimed.

## Frozen Web/reference and state

- Web JOBSEEKER `/applications` → opened application `ApplicationMessages` → `更新`, plus opened `応募書類` panel; main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, `src/components/ApplicationMessages.tsx` blob `6275c5e50c3f67eea58a2ecb53d6b984fd34a497`. Source inspected 2026-11-18; **not** a deployed/mobile rendered capture.
- Synthetic authorized candidate A, 2 expected source documents: before readback missing `b`, after a confirmed submission of `b`, zero missing. All rows and IDs synthetic; no real applicant data.

## Concrete drift fixed at source level

r324's Native manual `更新` already refreshed messages and the opened document panel, but `ApplicationDocumentsSection.refresh()` updated only its child rows. Its parent `/application/[id]` retained the old `提出書類を確認してください` handoff warning, even when the three-source canonical panel snapshot reflected newer submissions.

- `native/src/lib/applicationDocumentHandoffProjection.ts`: a dependency-free, fail-closed projection from the verified application expectations + submitted source IDs, preserving expected-source uniqueness, ignoring null attachment links, rejecting malformed arrays/IDs.
- `native/src/lib/applicationJourneyApi.ts`: existing canonical direct handoff read now uses the **same** projection, avoiding duplicate business logic.
- `native/src/components/ApplicationDocumentsSection.tsx`: after `readApplicationDocumentSnapshot` validates the owner/application arrays and a current focused/foreground lease, publish both child rows **and** projected handoff state through existing `onHandoffReadback`. This applies on explicit/open/quiet refresh; closed panel remains unpolled. No second Storage/RPC read, new mutation or privilege.
- The parent retains its existing `handoffRepairNeedsReview` quarantine after an ambiguous write; a child refresh does not auto-retry or unlock it.

## Developer evidence (not Native runtime evidence)

- Linux Node v22.16.0; npm 10.9.2; global TypeScript 5.8.3.
- `node --experimental-strip-types --test native/qa/native-application-document-parent-handoff-r327.test.mjs native/qa/native-application-document-repair-serial-r326.test.mjs native/qa/native-application-document-ack-r321.test.mjs` → **28/28 PASS** (10 new + 18 exact prior helper source cases).
- `tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler native/src/lib/applicationDocumentHandoffProjection.ts native/src/lib/repairApplicationDocumentsSerial.ts native/src/lib/awaitApplicationDocumentAttachmentAck.ts` → **PASS, helpers only**.
- New helper Git blob `023d85557eddb9e39ac6de103fdcd93fd1f9119d`, regression test blob `14fc8cb2cc9309504ca0727a2a4d91cb699f5b25`; both match the locally tested sources byte-for-byte. Remote adapter/component source wiring re-read. No Expo whole-app typecheck.
- Repo `workmarketjp-gif/app.hoikucolor-recruit`, sole COLOR writer branch `native/color-focused-document-refresh-r294-20261117`. Parent r326 HEAD `34707ee5cab8bafc91ac228792a6bca67fd09785`. r327 first implementation HEAD `0d1d611a46491a419635c0b19932fee9b4afcb87`; final docs HEAD reported separately.

## Web-to-Android/iOS evidence matrix

| Flow / gate | Android | iOS |
|---|---|---|
| Opened document panel `更新` → canonical rows → parent missing-count/readback | IMPLEMENTING; source behavior tested only | IMPLEMENTING; common source tested only |
| Session/background/closed panel safety | Code guards inspected; real app NOT VERIFIED | Code guards inspected; real app NOT VERIFIED |
| Same-synthetic-state rendered Web comparison, long Japanese text, keyboard, screen reader | NOT VERIFIED | NOT VERIFIED |
| Live authorized canonical API save→readback / signed installable candidate | NOT VERIFIED | NOT VERIFIED |

## Scope, cost and next action

No main, PR, release, Store, DB/RLS/Storage/Auth/Worker or other team changes. Root CI triggers `main` push and PR, not a plain development-branch commit; GitHub CI billing remaining and Cloudflare quota unknown. No paid Actions/EAS or external coding agent. Checkout cannot resolve GitHub from Linux runtime; native Expo dependencies, Android SDK/emulator and macOS/Xcode/iOS simulator absent. Signing and authorized iOS distribution not verified.

Next: obtain the existing approved locked Expo dependency/runtime path for full `native` typecheck; independently install on Android/iOS and compare an authorized synthetic document submission → refresh → parent warning state with Web, then continue search→apply→message and two-OS build handoff. Do not treat this source pass as READY_FOR_MASA_ACCEPTANCE.
