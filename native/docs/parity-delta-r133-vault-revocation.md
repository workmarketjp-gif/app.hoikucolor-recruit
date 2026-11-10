# Hoiku Color Native — r133 privacy-boundary operation revocation

Date: 2026-11-10 NZ. State: **IMPLEMENTING**. Owner: COLOR Jobseeker Native UI/helpers/tests only.

## Immutable reference / writer boundary

- Repo: `workmarketjp-gif/app.hoikucolor-recruit`; isolated branch `native/color-vault-lease-revocation-r133-20261110`; parent/base `4ac8e264d9ba11a3f953496ce4ab4c6b6fa6b0af` (r132).
- Web source reference: `main` at `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/components/ApplyDocumentsStep.tsx` blob `0717ec897eb656d70458d15fb004e65486717f8b`. Reference date 2026-11-10, authenticated **synthetic jobseeker** state; no claim of deployed production SHA or rendered UI screenshot. This is a Native-specific lifecycle divergence, not a new Web feature.
- Pre-write: no open PRs; r132 branch HEAD compared identical to the pinned base. Historical sibling `native/color-apply-vault-recovery-r131-20261110` is left untouched. No main write, merge, force-push or shared API/backend change.
- Root and `native/AGENTS.md` are not present at checked paths (404). HQ #467 and #265 MINIMUM_COST_V1 reviewed. `.github/workflows/ci.yml` triggers on `main` push or PR; no PR or main merge made.

## Actual code change

The r132 single-flight lease prevented duplicate taps, but did not reject **a completion continuing after the token had been reset by owner/session or App Lock changes**. An old external picker/camera callback could arrive after privacy was restored and try to start an upload or show an outdated completion. The fix is scoped to Native, with no invented data:

1. `native/src/lib/vaultOperationLease.ts`: `isCurrent(token)` checks current lease identity after a reset/release.
2. `native/src/components/DocumentVaultSection.tsx`: transmit that token through picker/camera -> temporary cache -> canonical upload, gate new uploads on valid lease, discard stale unregistered/pending picker caches and gate continuation after awaits (including open/default/delete, alerts and readbacks). An RPC **already dispatched before** privacy revocation may still finish server-side; do not claim network cancellation. Existing canonical readback/recovery and RLS remain required.
3. `native/qa/native-vault-operation-lease.test.mjs`: two RED-before-fix / GREEN-after-fix behavioral cases; expanded real-TSX wiring assertion to cover lease forwarding/cache guard. TSX wiring test exists on GitHub but **was not executed** in an incomplete local checkout.

Remote blob provenance after patch:
- helper: `c7043c77dfe0595b6d09fed27201f235a1f41f2c`
- component: `a922283327ed85482d49343e4b48b550ed439335`
- test: `f18fc844298d777c7aa5b097ac3bafc08fcb1319`

## Executed, bounded verification

- Real r132 GitHub helper blob and tests were retrieved as byte-matching source from existing local evidence and updated. No invented mock framework, no dependency install.
- Before adding `isCurrent`: two new actual module tests failed (`TypeError: gate.isCurrent is not a function`).
- With the new helper and test blob: `cd /mnt/data/color_r133/native && node --experimental-strip-types --test --test-name-pattern='double tap|stale completion|unmatched operation|cancel/rejected picker|revocation|invalid and completed' qa/native-vault-operation-lease.test.mjs` → **6/6 PASS**.
- `tsc --strict --noEmit --target ES2022 --module ESNext src/lib/vaultOperationLease.ts` → PASS (**helper only**, not Expo full typecheck).
- GitHub connected source readback: **9/9 static wiring checks PASS** including 5 acquire/release pairs and both upload-token paths. This is inspection, **not a rendered Native test**.
- Latest commit/branch SHA must be taken from live branch readback after this ledger write. Local source package excludes the full TSX component: it exists at the above GitHub blob.

## Incremental Web → Android/iOS parity matrix

| Workflow / state | Source-level status | Android runtime / Web pairing / persistence | iOS runtime / Web pairing / persistence |
| --- | --- | --- | --- |
| Picker/camera resumes after account switch or App Lock | Revoked token now gates upload start and readback; helper tests PASS | NOT VERIFIED | NOT VERIFIED |
| Open/default/delete completion after privacy boundary | Await continuations and notices gated | NOT VERIFIED | NOT VERIFIED |
| Search → detail → required documents → apply → application → message | Previously implemented segments; full canonical E2E **not performed** | NOT VERIFIED | NOT VERIFIED |
| Layout parity / signing / acceptance installables | Not addressed by this limited fix | No Android emulator or signed APK | No macOS/Xcode/simulator, valid iOS distribution unverified |

## Continuing blockers / costs

Linux has Node 22/npm 10/TypeScript; `git ls-remote` against github.com fails DNS. The complete Expo checkout/lockfile dependencies were not available to the local runtime. Android SDK/ADB/emulator and macOS/Xcode/iOS simulator are unavailable. Signing, test distribution permission, authenticated synthetic test accounts and canonical API readbacks remain unverified. Do not mark `DEVELOPER_VERIFIED` or `READY_FOR_MASA_ACCEPTANCE`.

No new Codex/Work/Claude, paid CI/EAS, production DB/auth/Edge/Workers/Cloudflare/Store change, real application/message or new spending approved/performed by this run. Actual billing and available quotas were not verified. Isolated branch only; previous conflicting branch remains untouched.

**Next**: obtain authorized whole-project checkout or existing free SDK runner; execute the pending TSX wiring and full Expo typecheck on this exact SHA, reconcile the diverged r131 recovery branch with this isolated change under single-writer ownership, then developer-run Android and iOS screen/API/E2E QA and signed builds. Do not open a PR that triggers paid Actions without checking billing/approval first.
