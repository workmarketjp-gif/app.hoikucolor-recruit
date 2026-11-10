# Hoiku Color Native r129 — candidate-scoped apply document panel

Date: 2026-11-10 NZ. Owner: COLOR JOBSEEKER only.
State: IMPLEMENTING, neither Android nor iOS DEVELOPER_VERIFIED.
Branch: `native/color-jobseeker-apply-owner-fence-r129-20261110`; base commit: `90491b77118b8f601e232bc8f448f0cb6e9b2407` (r128).
Reference: Web main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/components/ApplyDocumentsStep.tsx`, authenticated jobseeker, synthetic A/B identities / document rows. No same-state Web screenshots obtained.

## Source-level defect and action

Prior `ApplyDocumentsPanel` stored requirements, document titles and chosen document IDs in unowned component state. Unlike its embedded vault, it lacked its own candidate/session + App Lock display boundary. If a mounted apply panel survived account/session replacement, a stale panel could briefly show a previous candidate's private document names/choices or expose a stale submit handler. This was a source-level privacy risk; **no confirmed cross-user disclosure or incorrect real application** was observed.

Changes scoped to Native:
- Use Clerk user+session owner key and the existing Private Data Quarantine; hide the entire private panel under App Lock/signed-out/unknown session.
- Associate canonical document requirements with exact owner **and job ID**; when either changes, state is no longer actionable until authenticated canonical re-readback completes.
- Invalidate and clear requirements, document names, selection, errors, and embedded-vault state on identity/shield changes. Pending reads cannot repopulate another identity, via pinned session + generation/owner key recheck.
- Verify every newly read vault row's candidate ownership before displaying it; malformed/foreign data fails closed to a retryable error, never to a successful submission.
- Gate the actual submit handler, not only its disabled visual state, on exact owner/job/foreground.
- Reuse existing `candidateViewOwnerKey`, `assertCandidateDocumentListOwner`, `usePinnedCandidateAction`, and `isApplySubmissionUnavailable`; no new backend contracts or external Web escape.

## Exact verification

Local isolated runtime: Node v22.16.0, npm 10.9.2. The real r128 helper/test blobs were extracted from the prior evidence archive, matched to the connected GitHub baseline, then changed and run:
`cd /mnt/data/color_r129 && node --experimental-strip-types --test native/qa/native-apply-vault-selection.test.mjs` — **14/14 PASS**.
Exact tested and committed helper blob: `e4dad698cf840f9e1857702443a4161a7964853b`.
Exact tested and committed test blob: `d169aa2b773c3adfd1cd1fd2a1c7ed39c5c18491`.
Native TSX panel blob: `343969893fd0326f9d697874dda125874366ef61`. Connector source wiring: **13/13 static checks PASS**, NOT a compiled Expo/React Native test. No complete dependency-backed typecheck, emulator/simulator, authenticated canonical API save/readback or same-state screenshot comparison. Avoid claiming the two platform builds pass.

CI: `.github/workflows/ci.yml` runs on main pushes / PRs; this branch has no PR and no additional paid Actions/EAS runs were launched. Source-only branch commits, no main merge, backend/DB/Cloudflare/Store modification, real applications or messages.

## Incremental Web → Native → platform matrix

| Workflow | Source status at r129 | Android QA | iOS QA |
| --- | --- | --- | --- |
| Job apply: A→B account/session change; App Lock; job switch while choosing files | Candidate-owned state fence + focused helper tests | NOT VERIFIED | NOT VERIFIED |
| Canonical vault select/upload/delete, job submission, application→message end-to-end | Existing source; full dependency-backed integration unresolved | NOT VERIFIED | NOT VERIFIED |
| Screen visual fidelity (narrow/standard, Japanese length, keyboard, loading/error) | Needs rendered Web/Native comparison | NOT VERIFIED | NOT VERIFIED |
| Signed installation for MASA | No installable artifact | NOT AVAILABLE | NOT AVAILABLE |

Current **actual** Web and Native primary mobile tabs match: `ホーム / 求人を探す / お給料 / 気になる / マイページ` at Web main `fa779e73`. Applications and Messages are secondary destinations, not fixed bottom tabs (do not change the existing approved shell based on an older list).

Next highest priority: use an authorized full Native checkout and locked Expo dependencies to run `npm ci && npm run typecheck` and focused apply/document integration tests; repair actual failures before staging PR; then verify real Android/iOS render, authenticated canonical readback, signing and installation. Current Linux runtime cannot resolve github.com for `git clone`; Expo/React Native modules absent, Android SDK/emulator and macOS/Xcode unavailable, signing/distribution unverified. Browser/Node source checks are not platform acceptance. Total CI/EAS/Cloudflare billing and quotas remain unknown; no budget-increasing actions authorized.
