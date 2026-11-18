# r330 — Parent application-document warning follows the Web's canonical copy evidence

**Date (Pacific/Auckland):** 2026-11-18. **Owner:** COLOR JOBSEEKER Native only.
**Source baseline:** Web jobseeker `/applications` → `ApplicationMessages` document panel, `main 8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, `src/components/ApplicationMessages.tsx` blob `6275c5e50c3f67eea58a2ecb53d6b984fd34a497`, source checked 2026-11-18; synthetic candidate with attached, missing and historical deleted-vault document cases. These are Web-source and synthetic-state references, **not rendered Web/Native screen captures**.

## Closed source-level mismatch

Prior Native parent `applicationDocumentHandoffProjection` counted a document as submitted on a matching source-document ID alone. The actual Web document panel and Native child `projectApplicationDocuments` instead recognize the expected **destination copy path**, plus the Web's historical same-document-type exception when the original vault source has disappeared. The parent could therefore show a completed handoff while the child showed a missing expected copy; conversely a legacy copy with a null source link could generate a phantom parent warning.

The parent projection now checks non-empty canonical copy paths, document types and expected destination paths; it applies the historical exception **only when the exact same verified vault list is supplied**. The existing opened panel passes its three-source owner/application-verified snapshot to the projection in both the refreshed and post-submit paths. The unopened parent's two-source read remains conservative: it cannot infer whether an old vault source disappeared. No additional RPCs, candidate mutations, RLS/Storage/backend or Web changes.

**Remaining behavior to verify:** A legacy same-type copy with a missing source link but nonmatching destination can still be conservatively flagged by the unopened Native parent until the user opens the document panel and its saved-vault read succeeds. This is not marked full workflow parity; a Web-owner review is needed if the canonical paths contradict actual attachment state.

## Verification, not platform QA

Actual source from GitHub-matched r329 package, edited in isolation and committed on the existing COLOR writer branch. Focused command:

`node --experimental-strip-types --test native/qa/native-application-document-parent-handoff-r327.test.mjs native/qa/native-application-submit-handoff-r329.test.mjs native/qa/native-application-document-web-handoff-r330.test.mjs` → **24/24 PASS** (10 existing parent, 6 existing post-submit, 8 new Web evidence regressions).

`tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler native/src/lib/applicationDocumentHandoffProjection.ts native/src/lib/applicationDocumentsPresentation.ts` → **PASS**, helper-only. All four helper/test blob SHAs and the two real component call sites were verified after GitHub write. No complete Expo `node_modules`/whole-app compile, no Android SDK/emulator, no macOS/Xcode/iOS Simulator, no live canonical candidate read/write, no installed Native screenshot, no signing or distribution proof.

**Android:** IMPLEMENTING, installed UI/round-trip NOT VERIFIED. **iOS:** IMPLEMENTING, installed UI/round-trip NOT VERIFIED.

**Integration gate:** branch `native/color-focused-document-refresh-r294-20261117`, development-only. CI configuration triggers `main` push or PR; no PR/main/Production/Store/paid Actions/EAS/external coding agents. Billing headroom and Android/iOS distribution credentials not verified. Preserve source SHA evidence; never infer signed installable readiness.
