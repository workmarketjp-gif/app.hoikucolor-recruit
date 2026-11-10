# Hoiku Color Native r131 — job requirement type-lock for embedded document upload

Date: 2026-11-10 NZ; role: authenticated synthetic jobseeker. Status **IMPLEMENTING** (not device-verified).
Web reference: main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/components/ApplyDocumentsStep.tsx` lines 149-159/183-219: a file upload launched from a particular requirement row uses that row's fixed `document_type`. This is a source comparison, not rendered Web evidence.

Ownership: COLOR Native UI/adapter/test only. The repo had zero open PRs at edit preflight. Isolated single-writer branch `native/color-apply-locked-document-type-r131-20261110` from r130 exact SHA `49e556f095ef69a06ea16eb454b9054359f3fe39`. No main/PR/shared API/DB changes; no force push. GitHub CI `.github/workflows/ci.yml` only triggers on main push and PR, not an isolated branch push. Cloudflare billing/other hooks still not fully observable.

## User workflow gap closed in source
The embedded `DocumentVaultSection` previously exposed the general vault's editable category selector even though the user had tapped `○○を追加` inside one job requirement row. Selecting a different category there could save under that other category and fail to auto-select the row's required document. The Web file-picker flow fixes the category to that row. Native embedded usage now passes `lockedType={row.type}` and shows an explicit read-only category instead of the general selector. File picker and camera both resolve the exact row type. Empty-vault first-upload label/handler follows the locked category, instead of always saying `履歴書を追加`. Standalone document vault retains all editable type selection; replacement of an existing file retains its actual saved category, not the enclosing row.

## Files
- `native/src/components/ApplyDocumentsPanel.tsx`: passes fixed category to child in each requirement row.
- `native/src/components/DocumentVaultSection.tsx`: optional locked type; selector/label, picker/camera, empty-state action.
- `native/src/lib/applyVaultSelection.ts`: dependency-free `resolveVaultUploadType` with replacement > locked > explicit > chosen ordering.
- `native/qa/native-apply-locked-document-type.test.mjs`: pure helper scenarios plus real-source parent/child wiring contract; the latter requires full source checkout.

## Test evidence (scoped, honest)
- Local source provenance: pre-edit `native/src/lib/applyVaultSelection.ts` from prior recorded evidence had `git hash-object=e4dad698cf840f9e1857702443a4161a7964853b`, equal to current r130 GitHub blob.
- In isolated Linux Node 22.16.0 workspace, ran `node --experimental-strip-types --test qa/native-apply-vault-selection.test.mjs qa/native-apply-locked-document-type.test.mjs` against the actual helper plus new regression scenarios: **17/17 PASS** (14 existing + 3 new pure helper tests).
- The full 4th committed test checks TSX source wiring. It was NOT run in a complete checkout. Connector readback verified the current on-GitHub Native source with seven specific wiring assertions: all PASS; source inspection is not UI/runtime QA.
- Tried isolated `tsc --strict --noEmit --target ES2022 --module ESNext --moduleResolution bundler native/src/lib/applyVaultSelection.ts`: BLOCKED (TS2307: `./documentTypes` unavailable in partial checkout). Do not call this a typecheck PASS. Full Expo `npm ci && npm run typecheck` not run.
- Git direct clone in Linux still failed with `Could not resolve host: github.com`. The connected GitHub action can read and write source, but not supply a complete local Expo checkout in this runtime.

## Web → Android/iOS matrix (incremental)
| Workflow | Source change | Android real run/readback/visual | iOS real run/readback/visual |
| --- | --- | --- | --- |
| Required qualification row → add file or take photo → category preserved → choose exact saved ID | Linked UI/helper in Native, existing selection and owner verification preserved | NOT VERIFIED | NOT VERIFIED |
| Standalone document vault → freely select type; replacing existing retains its type | Existing behavior retained in code; pure helper tested | NOT VERIFIED | NOT VERIFIED |
| Search→detail→apply→message E2E and account isolation | Outstanding complete integrated QA | NOT VERIFIED | NOT VERIFIED |
| Signed installable candidate | No current build | NOT AVAILABLE | NOT AVAILABLE |

Android SDK/emulator, iOS simulator/macOS/Xcode and signing/distribution permissions absent or unconfirmed. No actual application/message sent, no real personal candidate data, no EAS/paid Actions/API, production DB/RLS/Auth/Worker, Cloudflare production, PR/merge or Store actions. CI/Cloudflare quota and invoices remain unverified. **READY_FOR_MASA_ACCEPTANCE: false**.

Next: in an authorized full source checkout, execute `node --experimental-strip-types --test qa/native-apply-vault-selection.test.mjs qa/native-apply-locked-document-type.test.mjs` (including the 4th source-wiring test), `npm ci && npm run typecheck`; test same synthetic state in actual Android/iOS with the input method, long Japanese names, data readback and private-document upload followed by complete search→apply→message. Never treat source parity as two-OS acceptance.
