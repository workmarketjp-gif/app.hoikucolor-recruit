# r257 — Native Home actionable interviews, scouts and newest messages

**State: IMPLEMENTING — source-tested only.** Owner: COLOR JOBSEEKER; 2026-11-15 NZ.

**Frozen Web reference:** `src/App.tsx` HomeView in `main` SHA `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59` (reviewed 2026-11-15), candidate role, synthetic attention states null/zero/pending, UUID and invalid identity. Web shows pending interview and scout action prompts, and links the next unread message to its precise application thread; errors/unknown counts are not confirmed zeros.

**Native before:** `native/src/app/(tabs)/home.tsx` at `6f3756d9e6cf7d4a71fe4b9a77a0e3a7b9a95483` exposed three noninteractive decorative metric tiles (面接回答, 未読連絡, スカウト), with only a generic messages/applications link below. A candidate could not open the pending interview or scout directly from its Web-equivalent Home prompt.

**Fix:** Replace decorative tiles with 48+-height accessible actionable rows. Pending interviews use existing `nativeAttentionInterviewHref`, pending scouts open the existing owner-checked `/scouts`, newest messages use existing UUID-checked `nativeAttentionMessageHref` with inbox fallback, and the applications row stays available. Null attention stays unknown and displays 未取得; error shows explicit manual refresh; no false counts, external `link_url`, new API or automatic send. Existing Home job/salary/visit/document routes are unchanged. Current five Web tabs remain intact.

**Focused real-source QA:** Node v22.16.0: `node --experimental-strip-types --test native/qa/native-home-attention-web-parity-r257.test.mjs`: 6/6 PASS using the actual `attentionApi.ts` blob `ba1247d466d9a8a214b16f01bca78ccbe96b06b6`. Source screen assertions checked. Full Expo typecheck, RN render, Android/iOS actual navigation/persistence and live API are **not verified**. The test does not prove visual parity.

| Flow | Android | iOS |
| --- | --- | --- |
| Home → exact interview / scouts / latest message, confirmed counts | IMPLEMENTING (source only) | IMPLEMENTING (shared source only) |
| Same-state Web vs installed app; keyboard, safe area, Japanese scaling | NOT VERIFIED (no SDK/emulator) | NOT VERIFIED (no macOS/Xcode) |
| Developer canonical readback / signed installable build | BLOCKED_EXTERNAL (runner, signing) | BLOCKED_EXTERNAL (runner, distribution/signing) |

**Remaining Web difference:** Web Home has independently loaded in-progress application count and conditionally hides to-do section when all reads are confirmed empty; this isolated patch does not assert those are reproduced. Existing generic Home cards also still require visual comparison. Do not mark Home fully closed.

**Integration/cost:** `native/color-jobseeker-integration-r216-20261114` only. `.github/workflows/ci.yml` triggers on `main` push and PR; branch-only push does not match. r256 had no applicable Cloudflare Worker build triggers; not requeried here. No paid CI/EAS, PR/main, production DB/API/RLS/Workers, Store or real applicant write. Billing quota unknown.

**Next:** Complete Web Home's private in-progress application count with session-pinned canonical read, then run real Android/iOS Web-to-Native render and navigation/canonical readback on an authorized build environment, including 200% text and App Lock switching.
