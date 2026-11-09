# Color Native r126 — application document choice quarantine

Date: 2026-11-10 NZ. State: IMPLEMENTING.
Repository: workmarketjp-gif/app.hoikucolor-recruit
Single-writer branch: native/color-jobseeker-submission-quarantine-20261110-r116
Parent: 98cbf7d556a2f7b475b8db0379122905e1d1b58c.

Web reference: src/components/ApplyDocumentsStep.tsx and src/lib/documentTypes.ts; jobseeker with synthetic candidate documents; source snapshot, no deployed screenshot. Native source: ApplyDocumentsPanel.tsx + DocumentVaultSection.tsx.

## Source defect and fix
The embedded vault published an interim empty [] during each candidate-owned re-read, then published the verified document list. The parent picker interpreted all returned documents as newly created and could override the candidate's selected attachment(s), despite no explicit upload. The source defect is confirmed; **no actual incorrect submission is claimed**.

Separate 'loading' from canonical 'loaded' and verified 'uploaded'. Preserve choices across a reload; only a single newly verified upload of the explicitly opened document type may auto-select. Clear choices that were canonically deleted. Submission stays blocked while the embedded vault is unverified; closing a stalled vault initiates fresh requirements/documents read. Retrying the parent read clears stale rows and choices. Existing RPCs, auth, RLS, Storage, and backend remain unchanged.

## Verification and acceptance
Node v22.16.0: `cd native && node --experimental-strip-types --test qa/native-apply-vault-selection.test.mjs` => 8/8 PASS in isolated real helper + synthetic fixture, no Expo stubs. Source wiring inspected against pinned HEAD; no full SDK project typecheck or Native runtime QA. Android and iOS rendered, real API save/readback, signed APK and authorized iOS distribution NOT VERIFIED.
GitHub .github/workflows/ci.yml triggers main pushes and PRs; branch-only source commit, no PR, paid CI, EAS, Production, actual applications, or Store action. External billing connections unverified.

Next: dependency-backed Expo typecheck and same-state Web/Native document selection + upload + application + message validation on Android and iOS.
