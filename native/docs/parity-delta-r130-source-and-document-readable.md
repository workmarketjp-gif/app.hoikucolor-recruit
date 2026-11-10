# Hoiku Color Native r130 — external source provenance and readable application documents

Date/role: 2026-11-10 NZ; COLOR JOBSEEKER only. Status: IMPLEMENTING. No Android/iOS developer-verified build.
Single-writer branch: `native/color-job-detail-source-and-doc-labels-r130-20261110`. Base exact commit: `c7a90e3365ddbf4dcad43939d9c118eba886d9c9` (r129). Branch-only changes; no PR/main push/merge.
Web baseline: main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/components/JobCard.tsx` (external source footer), `src/components/ApplyDocumentsStep.tsx` (document radio labels and file restrictions), authenticated synthetic jobseeker, sample imported source and long Japanese document filename. Web/Native same-state screenshots NOT captured.

## Actual user-facing gaps fixed in Native source
1. **External job detail provenance:** expanded Web JobCard shows source publisher, original posting number and last verified date; Native job detail previously showed only source/number. Native now reuses the already-existing `presentSavedJobSource(job)` from the saved-jobs implementation, including date validation/JST standardization, and displays the canonical `最終確認` only when credible. No inferred source or verification date. The existing HTTPS-only external link policy remains unchanged; no external applications are sent.
2. **Choosing application documents:** Native radio row previously truncated the selected file title to one line, potentially obscuring differences between long, similar Japanese resume/qualification filenames. Allow wrapped full titles at accessible font scales, preserve the existing exact-ID selection and candidate-owner fences, label `別のファイルを追加` when existing choices are present, and show Web's PDF/JPEG/PNG and 10MB limits. No change to RPC, user privilege, upload storage, document identity or submission semantics.

## Files / exact source identity
- `native/src/app/job/[id].tsx` — blob `43ad7bff8e86fff92b9359c956269762af4d0e79`; commit `54db2ba2c931736ccd2eee6b95cfa150e135eb45`.
- `native/src/components/ApplyDocumentsPanel.tsx` — blob `7db00a7bc6def9f96f8cc6a0e06e1425cbf5534e`; commit `d7fb34c4e5c7137ea8108aac22c5a0b6834adb42`.
- `native/qa/native-job-detail-source-and-apply-labels.test.mjs` — integration/source-wiring regression committed at `e176dd74365b73846f629d0be71f54955b0e7814`; **not executed in complete checkout**, no false PASS.
- Reused unchanged `native/src/lib/savedJobSourcePresentation.ts` — blob `aa5dca84b65f35b3a70c9835afb0cd553da2f745`.

## Execution evidence
- Available local runtime: Linux Node v22.16.0, npm 10.9.2, git. Repository git clone failed: `Could not resolve host: github.com`; no complete Expo checkout/dependencies.
- Reconstructed the **byte-identical** current GitHub canonical helper locally and verified `git hash-object` = `aa5dca84b65f35b3a70c9835afb0cd553da2f745`. Executed `node --experimental-strip-types --test qa/job-detail-source-helper.test.mjs` from isolated evidence folder: **6/6 PASS**, covering actual source provenance, invalid dates, internal jobs, unknown publisher.
- Re-executed the exact r129 helper/test pair from previously saved evidence, `node --experimental-strip-types --test native/qa/native-apply-vault-selection.test.mjs`: **14/14 PASS**, prior behavior only (not an r130 Native UI render).
- Checked 12 specific current GitHub Web/Native source integration invariants using fetched actual source: **12/12 PASS**; these are static inspections, NOT React Native runtime verification.
- New committed combined wiring contract: not executed because the full source checkout is unavailable. No Expo full typecheck, rendered UI tests, signed build or canonical authenticated readback was performed.
- GitHub Actions: repo CI configured for main push and PR; this dedicated branch had **0 workflow runs** when checked. Cloudflare source/build linkage, billing and signing permissions are not fully known. No PR, EAS, paid API/Actions, production DB/Auth/RLS/Worker, user application/message or Store changes.

## Incremental Web → Android/iOS matrix
| Flow | Source parity | Android developer QA | iOS developer QA |
| --- | --- | --- | --- |
| External job detail → source publisher/number/verified date → approved external link | UI + existing validated helper wired; URL policy unchanged | NOT VERIFIED | NOT VERIFIED |
| Apply documents → view full Japanese file title → select exact authorized ID → continue | Text wrapping/labels done; r129 state isolation preserved | NOT VERIFIED | NOT VERIFIED |
| Canonical job search→detail→apply→application→message | Existing code; complete device/API E2E still required | NOT VERIFIED | NOT VERIFIED |
| Signed installable handoff | No signed candidate | NOT AVAILABLE | NOT AVAILABLE |

## Next unblocked/blocked work
On an authorized full source checkout with locked Expo packages, run `npm ci && npm run typecheck` plus `node --experimental-strip-types --test qa/native-job-detail-source-and-apply-labels.test.mjs` (from `native/`). Then use a genuine Android emulator and macOS/Xcode/iOS simulator with the same synthetic account/job/long-filename state for paired Web/Native screenshots (including dynamic text and bottom actions), real canonical readback and search→apply→message. Inspect existing signing, TestFlight/ad-hoc path, and cost permissions before producing artifacts. A missing device is not an excuse to mark source implementation complete. READY_FOR_MASA_ACCEPTANCE and MASA_ACCEPTED remain false.
