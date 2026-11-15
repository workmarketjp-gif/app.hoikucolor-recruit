# r258 — Web Home "選考中の応募" canonical count

**Status:** IMPLEMENTING (source-tested only). 2026-11-15 NZ. COLOR Native owner.

**Web baseline:** `src/App.tsx`, main `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`, `HomeView`. Authenticated synthetic candidate with application statuses new/in_review/interview_scheduled/offer/rejected/withdrawn/hired; Web excludes only rejected/withdrawn/hired from the in-progress count.

**Native delta:** r257 restored actionable interview/scout/message entries but Home had only a generic application link, not a canonical in-progress count. Add `useHomeApplicationProgress` with the existing `hc_jobseeker_list_applications` RPC through `listApplications`, reused `readCandidateApplicationIndex` and owner/session/App Lock freshness gating. Re-read on focus, discard late reads on blur/session switch, retain no stale count, distinguish confirmed zero vs unknown/error, manual retry only. Display `選考中の応募` with count while keeping the existing application navigation. New isolated pure helper applies Web's 3 terminal statuses. No backend/schema/UI privilege increase or real candidate writes.

**QA:** Node v22.16.0 `node --experimental-strip-types --test native/qa/native-home-application-progress-r258.test.mjs` 4/4 PASS for actual pure helper; GitHub screen/hook/RPC connection assertions. No Expo package compile (locked dependencies not installed), signed APK, iOS Simulator, rendered screen, canonical live DB readback or MASA device acceptance.

| Flow | Android | iOS |
| --- | --- | --- |
| Home → owner-pinned in-progress count → application list | IMPLEMENTING: source only | IMPLEMENTING: shared source only |
| Same-state Web and Native UI/accessibility/API persistence | NOT VERIFIED: Android SDK/emulator absent | NOT VERIFIED: macOS/Xcode absent |
| Signed installable candidate | BLOCKED_EXTERNAL: runner/signing | BLOCKED_EXTERNAL: signing/distribution |

**Outstanding:** Confirm Web's calm zero-pending-state layout, full Home screenshot alignment, cross-OS 200% text and canonical save/readback. Preserve Web source SHA delta ledger. No Production, DB/Auth/RLS, main/PR or paid workflow was triggered by branch-only commit. CI main push/PR; quota/credentials unknown.
