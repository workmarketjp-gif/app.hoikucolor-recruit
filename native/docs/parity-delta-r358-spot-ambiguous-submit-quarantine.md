# COLOR Native r358 — Spot application single-dispatch quarantine

**Status:** IMPLEMENTING (GitHub branch integrated; real Android/iOS and canonical live QA still NOT VERIFIED). **Date:** 2026-11-19 NZ.

## Owner, baseline and scope

- Single writer: ChatGPT COLOR JOBSEEKER Commander, branch `native/color-vault-web-default-r341-20261119`. Starting branch HEAD `99e9c530566961da5719ec7ddfc3f0ce589a1c0e` (r357); open PRs 0; no other path owner found. Root and `native/AGENTS.md` not present when checked. HQ #467 and HQ #265 MINIMUM_COST_V1 read.
- Web reference: candidate Web `/spot`, `src/views/SpotJobsView.tsx`, main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, blob `aa395794adde80d42d3b0c3c8425ee1744d7974e`; inspected 2026-11-19, source-only, synthetic authenticated candidate, listed/open job and uncertain submit state. Web's current submit and refresh paths are behavioral context, not permission to copy an ambiguous retry bug.
- Native scope: `native/src/app/spot-jobs.tsx`, `native/src/lib/spotApplicationDispatch.ts` and dedicated test. Reuses existing `homeApplyPending.ts` / `durableMutation.ts`, not new Storage/backend/RPC. No schema, permissions, Web, staff, family, production or Store change.

## Closed source gap

A spot application previously called `submitApplication` directly. If its RPC committed but a later network/detail/attachment check failed, the UI reset its in-memory busy flag. The same stale unapplied card could then send another application. The screen now **arms the existing candidate+job durable pending registry before submission**. The already-serialized Home arm means Home and Spot cannot independently launch another request for the same candidate/job while unresolved. Existing local markers are not backend idempotency keys and MUST NOT be resent. A lost owner/session after arming leaves the marker quarantined. After `submitApplication` returns a candidate-owned canonical application detail, the marker may be cleared; no catch/finally clears it after uncertain results. The UI sends no automatic retry and instructs the candidate to check 応募管理. There is no guarantee of process-/device-global server idempotency from this client change.

| Matrix | Web behavior | Native source | Android render/action | iOS render/action | Live canonical cross-read |
| --- | --- | --- | --- | --- | --- |
| SPOT-SUBMIT-01 | `/spot` apply from vacancy; subsequent application management | Durable reservation before `submitApplication`; prevents one-screen and same-local-registry cross-entry duplicates | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| SPOT-SUBMIT-02 | Retrying after uncertain result must not imply unsent or saved | Existing marker blocks re-dispatch; manual 応募管理 reconciliation; only confirmed detail clears marker | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| SPOT-SUBMIT-03 | Candidate account/privacy switch while pending | Exact session predicate before and after arm, before server call; leave stale receipts quarantined | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |

## Test and provenance

- `node --experimental-strip-types --test qa/native-spot-application-dispatch-r358.test.mjs`: **6/6 PASS**, Node 22.16.0 in Linux isolated source directory. Cases: new reservation, existing receipt, stale before/during arm, reused stale receipt, Storage rejection. No fabricated framework pass.
- `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions src/lib/spotApplicationDispatch.ts`: **PASS**. Only helper typecheck; Expo TSX/framework typecheck NOT RUN.
- GitHub reread verified exact helper blob `0193365e578104417025435ec56c01fe4cfc4cd2`, regression blob `73779b3cc6ed86d26743fa469345879e128a4cdc`; screen blob `6581ca27983f49648e0c066a1358d95932a4fa73`. Static screen wiring/order check: 5/5 PASS (not a rendered functional test).
- Commits: helper `7acd3ec726b6aa1c81a25ba24d8624586af26cfc`, tests `bd4be160f3ec72fb6fe6c33ed28b7a68880afc43`, screen `a71149d480467e599ff8a8f279d9166e3c74c2e7`.
- Android SDK/emulator/adb unavailable; iOS Xcode/macOS/simulator unavailable. Android signing and iOS authorized distribution remain unverified. Full Expo checkout and real Supabase synthetic candidate readback still unavailable.

## Release/cost

- Repository CI at this SHA: `.github/workflows/ci.yml` runs for **main push or pull_request**, not direct dedicated branch push. No PR, Actions dispatch, EAS build, main merge, Production or Store update. Last prior Cloudflare check found zero Build triggers on relevant Worker; no fresh invoice/quota evidence. Cost remains unknown, no paid resources started.
- Next: reproduce uncertain submit on an actual Expo install using only synthetic candidate and verify **search/spot → submit → canonical applications and messages**. If the durable marker is legitimately unresolved without a confirmed application, reconciliation must be performed by a deliberately authorized recovery flow, never a blind resubmit; resolve broader full-Web parity on both OSes before owner acceptance.

**No READY_FOR_MASA_ACCEPTANCE claim.**
