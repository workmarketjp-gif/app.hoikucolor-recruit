# r329 — Post-submit document status comes from the same verified readback

Date: 2026-11-18 NZ. Scope: COLOR JOBSEEKER Native `/application/[id]` → 応募書類 → この応募に提出 / 未提出書類をまとめて提出.

## Source baseline, user-visible gap

- JOBSEEKER Web `/applications` → `ApplicationMessages` document panel; Web main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, component blob `6275c5e50c3f67eea58a2ecb53d6b984fd34a497`, reviewed 2026-11-18 NZ, synthetic candidate with two expected document sources. Source reference only, not visual/native-runtime capture.
- Native prior `submitDocuments` confirmed writes through its bounded owner/application-verified three-source read, but then launched another two-source read for the parent warning. An independent failure in that redundant request could publish `onHandoffReadback(null)` after a successful canonical readback, leaving the parent warning unknown despite a confirmed document submission. The extra request also incurred needless private reads and polling risk.

## Implemented in the existing COLOR writer branch

- Reuse the existing `applicationDocumentHandoffProjection(expectations, submitted)` after the **same verified three-source** post-write readback that updates the submitted document rows and the already-present canonical `hasCanonicalApplicationAttachment` acknowledgment.
- Publish the parent status only if the existing `canPublishHandoff()` owner/session/focus/App Lock/presentation lease is still valid. No second `getApplicationDocumentHandoffState` RPC and no fallback-to-null when an independent request fails. Malformed canonical input still fails closed; an unresolved or partial write still requires explicit reload.
- This changes no document contents, real candidates, storage keys, DB schema, RLS, auth, Worker, Store or public Web route. No automated document submission or retry was introduced.

## Focused QA and platform matrix

- Local isolated Node 22.16.0 on real GitHub `applicationDocumentHandoffProjection.ts` blob `023d85557eddb9e39ac6de103fdcd93fd1f9119d` plus functionally matched local `applicationDocumentsPresentation.ts` copy: `node --experimental-strip-types --test native/qa/native-application-submit-handoff-r329.test.mjs` → **6/6 PASS**. Exact test blob `b3ac58601ec91036c2f1cf9b78234acbb919b723` matches GitHub; coverage includes complete/partial submission, wrong app, empty file path, malformed expectation and duplicate rows.
- `tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler native/src/lib/applicationDocumentHandoffProjection.ts native/src/lib/applicationDocumentsPresentation.ts` → isolated helper-only PASS. The local presentation module was functionally reconstructed for isolation, **not** a complete Expo checkout/typecheck.
- GitHub post-write source inspections: exactly one post-write handoff projection, valid `canPublishHandoff()` gating, no second post-submit read; parent/child readback from the same canonical snapshot. These are wiring assertions, **not** Native rendered tests.
- Android: **IMPLEMENTING** — source fix common to Android, no emulator, installed screenshot, real backend round trip, signed APK or device proof.
- iOS: **IMPLEMENTING** — source fix common to iOS, no macOS/Xcode/Simulator, real backend round trip or authorized signed TestFlight/ad-hoc artifact.

## Owner, provenance, cost and next

- Repository `workmarketjp-gif/app.hoikucolor-recruit`; sole COLOR branch `native/color-focused-document-refresh-r294-20261117`; initial HEAD `a0887ed6d793bc20aa627e9174ff8f671814b508`. Implementation commit `b50217c78ab94d7ec0aa90c0b14335b174ce07af`; regression commit `9248ec40dd74aab531913992a422757fe49db930`. No open PR at preflight; CI `main` push / PR triggers; Cloudflare Pages project list found no projects on two connected accounts. Billing quotas, signing and distribution remain unverified; no paid CI/EAS/API agent, main/production changes or Store submission.
- Next: whole-Expo locked dependency typecheck in authorized environment; for **both** OSes, use a consented synthetic candidate to verify submit → canonical reread → parent status and Web counterpart, plus pending unread/error/long text and signed handoff. No existing device or full checkout verified.
