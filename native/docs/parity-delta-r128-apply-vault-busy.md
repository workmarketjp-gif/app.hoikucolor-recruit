# Hoiku Color Native r128 — embedded document vault submission gate

Date (NZ): 2026-11-10. Owner: COLOR JOBSEEKER only. State: IMPLEMENTING.
Repository: `workmarketjp-gif/app.hoikucolor-recruit`.
Branch: `native/color-jobseeker-apply-vault-busy-r128-20261110`. Base commit: `cf6bf6beaae82c1261c16fe4b64f42e24c3a2941`.
Web reference: main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/components/ApplyDocumentsStep.tsx` (authenticated jobseeker, synthetic saved documents); this Web step blocks submission during upload. No approved same-state screenshot captured.

## Specific closed source-level gap
Native `ApplyDocumentsPanel` blocked submit while its nested document vault was **reloading** but not while the OS file picker, camera permission/capture, or upload was in flight. As a result, the older selected attachment could be submitted while the user was still trying to replace/add a file. This is a source-level race, **not** evidence of an actual wrong application.

- `DocumentVaultSection` reports `busyId` transitions through an optional `onBusyChanged` callback; existing standalone callers need no change.
- `ApplyDocumentsPanel` disables submit, selection changes, closing the embedded vault and its back control during a pending operation. It uses a single pure `isApplySubmissionUnavailable` gate for both disabled state and submit handler.
- A failed/ambiguous picker or camera upload triggers a fresh candidate-pinned canonical vault reload before submission is re-enabled. If readback fails, the already-existing `loading`/retry path remains fail-closed.
- No change to submission RPC, auth, RLS, private Storage, database, messages, or production. No real application/message sent.

## Focused actual-source verification
- Source helper and regression test were read from the base branch and saved locally. The pre-fix test could not import the missing gate. After applying the update, `node --experimental-strip-types --test native/qa/native-apply-vault-selection.test.mjs` returned **12/12 PASS**, Node v22.16.0.
- Exact tested helper git blob: `acf6a7b6f162769d4c7230338cbf7edbf2b928c6`; exact tested test blob: `a0ab6466035f6a7646b5c49b3a58680659482955`. Both match the GitHub branch. Two TSX components were verified for the new callback/submit wiring as source text; this is **not** Expo typecheck or Native runtime verification.
- SDK-backed `npm ci` / `tsc --noEmit` is blocked by absent full checkout/Expo modules and GitHub DNS in the isolated Linux runtime.
- Current app Web navigation reference remains `ホーム / 求人を探す / お給料 / 気になる / マイページ`. Applications and Messages are secondary screens; no nav redesign was made.

## Web-to-platform workflow delta
| Workflow / acceptance | Native source | Android | iOS |
| --- | --- | --- | --- |
| Open apply step, choose/upload/replace attachment, block accidental submit during picker/upload | Updated, focused helper PASS | NOT VERIFIED in rendered Native | NOT VERIFIED in rendered Native |
| Canonical upload confirmation, required documents and app submit -> application -> message | Existing implementations; integrated live test pending | NOT VERIFIED | NOT VERIFIED |
| Web-matched loading/error/keyboard/text scaling and privacy | Source safety review only | NOT VERIFIED | NOT VERIFIED |
| Signed installable acceptance build | No artifact | NOT AVAILABLE | NOT AVAILABLE |

## Cost/permission boundaries
Read `.github/workflows/ci.yml` (heavy Actions on main push/PR) and MCP/HelloWork path-limited workflows before branch writes. This run created no PR, main merge, workflow dispatch, EAS, Cloudflare deploy, production operation or Store submission. No new paid work requested; total external billing/quota remains unverified. Android SDK/adb/emulator, macOS/Xcode/iOS simulator and signing/distribution access are unavailable/not demonstrated here.

Next: dependency-backed Expo typecheck, then same-synthetic-state Android/iOS document picker -> canonical upload/readback -> application -> message developer QA, visual parity and signed acceptance artifacts. This entry is not READY_FOR_MASA_ACCEPTANCE.
