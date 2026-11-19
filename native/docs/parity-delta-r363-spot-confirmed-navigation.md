# COLOR Native r363 — Confirmed Spot application survives an independent list-read failure

**2026-11-19 NZ | IMPLEMENTING.** This is shared Android/iOS source behavior, not installed Native acceptance.

## Provenance and ownership
- Owner: ChatGPT COLOR JOBSEEKER, single writer on `native/color-vault-web-default-r341-20261119`. Starting head `04861b6a581d3d57c34bb6348dc27a95a3fedb88` (r362). Open PR search returned none. No same-path external owner found; no `AGENTS.md` in repository root or `native/`.
- Web reference: candidate `/spot`, `src/views/SpotJobsView.tsx`, main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, blob `aa395794adde80d42d3b0c3c8425ee1744d7974e`, inspected 2026-11-19, synthetic signed-in candidate with a confirmed application and a subsequent failed Spot refresh. Web immediately projects the confirmed application ID into the local card and signals applications refresh. Source-only, no paired Web/device screenshots or verified deployed SHA.
- Native defect: after `submitApplication` already verified a candidate-owned canonical application detail, the Spot screen awaited a **second unrelated Spot list read** before navigating to application detail. If that read failed, the screen retained an available-looking old job card and offered the apply action again after clearing the durable submission quarantine.

## Implemented source correction
- `native/src/lib/spotConfirmedApplication.ts`: projects the **already-confirmed** application ID into the matching old Spot card. It leaves unrelated cards and conflicting confirmed application IDs unchanged, replaces old unrelated status with `new`, rejects malformed IDs, and does not fabricate missing jobs. This helper never submits or assumes a successful server write.
- `native/src/app/spot-jobs.tsx`: after `submitApplication` verifies its own canonical detail, fence the session and project its proof before local marker cleanup, then navigate directly to the application page. A separate Spot list is no longer a prerequisite for that navigation. Cleanup failure retains the local quarantine but does not falsely demote a confirmed submission into an unconfirmed result. Existing focus-triggered read restores canonical list on revisiting Spot.
- Backend/RPC/Storage/RLS and Web remain unchanged; no real application was sent. Any genuine ambiguity **before** the `submitApplication` canonical detail remains quarantined under r358/r359.

## Web-to-Native delta
| ID / workflow | Web reference | Native source after r363 | Android installed UI | iOS installed UI | Real canonical E2E |
| --- | --- | --- | --- | --- | --- |
| SPOT-CONFIRM-01 / successful spot apply | `/spot` locally records confirmed application ID | Candidate-owned detail proof retained in old Spot card before cleanup, then app-detail navigation | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| SPOT-CONFIRM-02 / independent Spot list failure | Web keeps locally applied state after submit | Does not require unrelated list success to navigate; cannot show old open card as successful un-applied state | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| SPOT-CONFIRM-03 / other owner or conflicting ID | Only candidate-owned details are navigable | Existing exact session fence plus conservative projection; no conflicting ID overwrite | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |

## Local, GitHub, and toolchain evidence
- Verified local runtime: Node 22.16.0, npm 10.9.2, `tsc` available; real helper and dedicated test copied identically to GitHub blobs `17005bd59f745d3ac3b35fc404895e2cc69601e1` and `3e3d20534444df6849c1545f824dfafa90272949`.
- `cd native && node --experimental-strip-types --test qa/native-spot-confirmed-detail-navigation-r363.test.mjs`: **7/7 PASS**, covers stale card confirmation, unrelated list, existing later status, stale status, conflicting ID, invalid IDs and removed jobs.
- `tsc --noEmit --strict --skipLibCheck --target es2022 src/lib/spotConfirmedApplication.ts`: **PASS**, helper only.
- Post-write GitHub screen blob `e13b53d58f8707c89885ee7a817b93fade7544e3`; source assertions verified canonical proof projection follows `submitApplication`, blocking second list-read dependency is absent, local cleanup is guarded and canonical navigation remains.
- Complete Expo TypeScript/framework load, Android SDK/emulator/render, macOS/Xcode/iOS simulator/render, same synthetic account Supabase save-readback/Web reconciliation and signed build evidence: **NOT VERIFIED**. Android and iOS signing/distribution remain separately unverified.

## Release, cost and next gate
- `.github/workflows/ci.yml` runs on main push and PR, not this dedicated development branch. Cloudflare `app-hoikucolor-recruit` build triggers returned `[]` on the Workmarket account before writes. No additional paid GitHub Actions, EAS, deployment, production DB/auth/Worker, main merge, PR, external coding agent, Store or candidate-message changes. Exact billable usage/remaining quota unknown.
- Next: full Expo checkout with compatible dependencies, then synthetic Spot submit → canonical application detail → application list/messages ↔ Web, including a timed-out follow-up list and owner switch. Android SDK and authorized macOS/Xcode + iOS signing route are required for independent runtime/device evidence and installable handoff. Keep `IMPLEMENTING`; do not claim `DEVELOPER_VERIFIED` or `READY_FOR_MASA_ACCEPTANCE`.
