# Hoiku Color Native — r134 canonical vault readback failure recovery

Date: 2026-11-10 NZ. Status: **IMPLEMENTING**. COLOR Jobseeker Native UI/adapters/tests only.

## Source baseline and ownership
- Repo: `workmarketjp-gif/app.hoikucolor-recruit`; isolated branch `native/color-apply-vault-readback-recovery-r134-20261110` from r133 `44743a6d1687e8d28a07f347fc8394bee20bfa25`. One writer on this newly created branch, no open PRs when checked. No main/other owners changed.
- Existing Web reference remains `main` at `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, authenticated synthetic jobseeker; previous r133 ledger records `src/components/ApplyDocumentsStep.tsx` blob `0717ec897eb656d70458d15fb004e65486717f8b`. No deployed visual reference claimed.
- This integrates previously isolated `native/color-apply-vault-recovery-r131-20261110` behavior with r131 document-type locking and the r132/r133 synchronous lease/privacy revocation. Sibling branch not modified. No backend/schema/auth changes.

## Fixed Web/app gap (source level)
A failed canonical document-vault reload after an interrupted upload was previously signaled only by an alert. The parent apply panel could remain in a stale `ready` state or treat a later transient empty-list signal as success. The new `loading/ready/failed` readback state explicitly blocks Apply on failure, presents a Japanese error and a retry action, and requires a successful owner-verified canonical reload before resubmission. Opening the embedded vault immediately blocks submission before React effects load it. Confirmed uploaded IDs are still the only additions preselected. The requirement-row document type remains locked. The r133 operation lease and privacy revocation remain in place.

Changed only:
- `native/src/lib/applyVaultSelection.ts` (explicit readback states, safe event typing)
- `native/src/components/ApplyDocumentsPanel.tsx` (tri-state, retry/notice, immediate open fence; existing lockedType retained)
- `native/src/components/DocumentVaultSection.tsx` (owner/current-session-guarded `'error'` event on a failed canonical read)
- `native/qa/native-apply-vault-readback-recovery.test.mjs` (five previously RED failure/recovery behavioral cases)

## Evidence and platform parity
- Initial new test RED: Node reported `SyntaxError: ... does not provide an export named 'applyVaultReadbackState'` from real r133 blob `2980a2f83ede8048265b0d7d7ece9ba2d015cc22`.
- Local real-source SHA `edc887833f8e7d7d4fecb936f221ca4733b889b0` was produced from that exact GitHub blob. `node --experimental-strip-types --test native/qa/native-apply-vault-selection.test.mjs native/qa/native-apply-vault-readback-recovery.test.mjs native/qa/native-apply-locked-document-type.test.mjs` → **22/22 PASS**.
- `node --experimental-strip-types --test --test-name-pattern='double tap|stale completion|unmatched operation|cancel/rejected picker|revocation|invalid and completed' native/qa/native-vault-operation-lease.test.mjs` → **6/6 PASS** on unchanged r133 module.
- Connected source static wiring assertions **9/9 PASS**. The full TSX wiring test could not run locally: complete component and dependencies were not materialized. No Expo full typecheck or real Native render/E2E claimed. A direct checkout attempt failed at `Could not resolve host: github.com`.
- Android: shared source candidate only; **runtime, pairing, canonical API E2E and signed APK NOT VERIFIED** (SDK/ADB/emulator absent).
- iOS: shared source candidate only; **runtime, pairing, canonical API E2E and TestFlight/ad-hoc build NOT VERIFIED** (macOS/Xcode/simulator absent). Signing/distribution permissions unverified.
- Candidate data, production changes, actual applications/messages, paid agents/builds and Store release: none.

## Cost and next integration gate
- `.github/workflows/ci.yml`: main push / PR only; MCP workflows' branch push paths are MCP-only, not these `native/**` edits. No PR or main write.
- Connected Cloudflare accounts: 0 Pages projects returned for each at 2026-11-10 NZ. No Cloudflare deploy requested. Actual billing/quota not established.
- Do not mark `DEVELOPER_VERIFIED` or `READY_FOR_MASA_ACCEPTANCE`. Next: authorized complete Expo checkout to run whole-project typecheck and TSX wiring, then verify authentic Android/iOS Native screens, private readback, search→detail→document selection→apply→application→message with synthetic canonical accounts. Reconcile this isolated branch only through a reviewed integration route that does not start unbudgeted Actions/production.