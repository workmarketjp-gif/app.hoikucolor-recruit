# r326 — Candidate application document-handoff repair: serial, bounded, quarantined
Date: 2026-11-18 (NZ). Source-level evidence only; not installed-app acceptance.

## Frozen Web / scenario
- Jobseeker Web: `/applications` -> application detail -> `src/components/ApplicationMessages.tsx` document panel, including `未提出の応募時書類をまとめて提出`. Web main: `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`; source reviewed 2026-11-18 NZ, synthetic authenticated candidate whose expected attachment list contains 2 documents. No matched deployed screenshot or real candidate data.
- Native route: `/application/[id]` -> `提出書類を確認してください` -> `提出書類を再確認・復旧`; a separate existing Native recovery action using the same canonical attachment interfaces. Web's parallel default-repair behavior is not treated as a safe reference for ambiguous writes. No Web/source/backend owner files modified.

## Implemented delta (COLOR Native writer)
Previous Native recovery ran `Promise.allSettled` over missing documents, potentially beginning multiple private Storage/RPC writes; no response deadline on this recovery action. A stalled/uncertain earlier attachment could keep UI busy indefinitely while further writes had begun.

- Add `native/src/lib/repairApplicationDocumentsSerial.ts` for distinct expected source IDs in order, count unavailable vault sources but stop immediately on a failed/unknown attachment, enforcing session/foreground/deadline lease between every attempt.
- `native/src/lib/applicationJourneyApi.ts`: replace parallel repair with the serial helper; check `canContinue` before/after canonical reads; pass the same guard into existing `attachJobseekerDocumentToApplication`, which checks before later Storage/RPC stages. Existing canonical data and server authorization are unchanged.
- `native/src/app/application/[id].tsx`: reuse existing 15-second `awaitApplicationDocumentAttachmentAck` for presentation, quarantine a started repair on unknown outcome and require a separately initiated canonical status read before enabling another repair. Do not report rollback or completion, auto-send another write, or reset unrelated message/draft state.
- `native/qa/native-application-document-repair-serial-r326.test.mjs`: 10 focused cases including sequential order, missing/duplicate docs, failed first write, session/lease loss, and late completion after timeout.

## Real focused test evidence
- Linux Node 22.16.0: `node --experimental-strip-types --test native/qa/native-application-document-repair-serial-r326.test.mjs native/qa/native-application-document-ack-r321.test.mjs` => **18/18 PASS**, 10 new + 8 existing compatible cases against actual source helpers.
- Global TypeScript 5.8.3: `tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler native/src/lib/repairApplicationDocumentsSerial.ts native/src/lib/awaitApplicationDocumentAttachmentAck.ts` => **PASS** (helper-only).
- Remote exact-source comparison: GitHub blobs fetched on COLOR branch, SHA matched; call-site wiring inspected separately. This is not an Expo app-wide compilation or rendered UI acceptance.

## Matrix / blocking gates
| Workflow | Android | iOS | Canonical persistence | Visual/runtime |
|---|---|---|---|---|
| Applicant handoff repair of missing uploaded documents; loss/timeout/late acknowledgement; explicit status reread | IMPLEMENTING, common source only | IMPLEMENTING, common source only | Existing `hc_jobseeker`/Storage adapters; live synthetic write/re-read NOT VERIFIED | Emulator/device, Web pairing, large Japanese text, background, duplicate-tap behavior NOT VERIFIED on both |

No Android SDK/emulator, macOS/Xcode/iOS Simulator, signed APK/AAB, iOS TestFlight/ad-hoc access, or full locked Expo dependency install in this runtime. API auth/write tests not executed. Do not infer cross-OS proof from common TypeScript or tests. No stores/publication.

## Ownership, costs and integration
Single COLOR writer on `native/color-focused-document-refresh-r294-20261117` starting at `d9c12082d959ecdeb4dcc0b71d2c9b49b511f0d6`. Root CI triggers `main` push or PR; no open PR detected. Branch files only, no PR/main/Production, DB/RLS/Auth/Workers, paid Actions/EAS/API, external coding agent or real applicant mutation. Cost quota/signing permissions remain unknown. New branch HEAD and source blob identifiers must be verified before reporting handoff.

Next: complete Expo dependency-backed typecheck; Android and iOS independent same-synthetic-state document missing/recovery/refresh with actual backend readback and Web screenshots; signed two-OS candidate only after all parity gates close.
