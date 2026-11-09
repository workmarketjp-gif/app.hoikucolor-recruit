# Color Native r127 — explicit uploaded document identity

Date: 2026-11-10 NZ. State: IMPLEMENTING.
Owner/repo: COLOR JOBSEEKER / workmarketjp-gif/app.hoikucolor-recruit.
Branch: native/color-jobseeker-explicit-upload-id-r127-20261110; parent SHA 1e9dd46cea53e2ab7e8692cb5b7e5518056b639d.

Web reference: `src/components/ApplyDocumentsStep.tsx` at parent SHA (jobseeker role, synthetic saved documents); actual deployed UI screenshot and Android/iOS rendered parity NOT VERIFIED.

## Defect / fix
Prior Native apply picker inferred the uploaded attachment from the difference between two canonical document lists. If a different-device save occurred during an upload, the only new ID on that list could belong to another action. This is a source-level race risk; no wrong attachment submission is known to have occurred.

DocumentVaultSection already confirms the actual uploaded saved.id through canonical post-write readback. It now passes that exact ID to ApplyDocumentsPanel. The reconciliation helper selects only that ID when it matches the explicitly open type and is a newly confirmed canonical document. List-only 'uploaded' events cannot preselect. Normal reloads preserve valid choices, confirmed deletion clears missing selected IDs. This preserves existing auth, RLS, submit API, privacy quarantine, and no autonomous application sending.

## Verification
Local Node v22.16.0, original helper blob ef1beb04eda7b16a979d86f35c5b68f60c2aaedf from r126 evidence ZIP matched GitHub blob. Regression demonstrated 2 failing tests before change; after change `node --experimental-strip-types --test native/qa/native-apply-vault-selection.test.mjs`: 11/11 PASS (common helper + synthetic candidate IDs, no Expo stubs). Updated TypeScript/TSX component wiring is source-level only; no full Expo SDK typecheck.

Android SDK/emulator and macOS/Xcode/iOS simulator unavailable in this Linux run; no signed APK, iOS TestFlight, production API save/readback or real Native visual evidence. No existing candidate data was accessed.

Automatic CI: `.github/workflows/ci.yml` main push / PR; other workflows only MCP/HelloWork paths. Cloudflare Workers builds: zero triggers found for app-hoikucolor-recruit under two connected accounts. Isolated branch-only change; no PR/merge/deploy. External billing/quota not proved free.

Next: full Expo typecheck and candidate document upload/select→submit→confirmed application→message on both Android/iOS with synthetic accounts.