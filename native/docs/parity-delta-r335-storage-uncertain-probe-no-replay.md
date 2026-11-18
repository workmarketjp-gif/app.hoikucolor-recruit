# COLOR Native r335 — ambiguous private Storage probe fails closed

2026-11-18 NZ. Repo `workmarketjp-gif/app.hoikucolor-recruit`, COLOR sole-writer branch `native/color-focused-document-refresh-r294-20261117`, base `f75bffe33c8ca4a432f81990c0cbd0026b9e30b6`. Web source baseline: JOBSEEKER `/applications` → 応募書類, Web main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c` (source only, not deployed render). Synthetic A, Storage copy/upload response lost then 404/403/429/5xx signed-URL probe or A→B switch.

## Repaired
Before r335, `storageObjectExists` mapped any signed-URL error to `false`, leading to an automatic second private write through the r333/r334 helper. Even 404/not_found can mean permission denial, not proven absence (Supabase Storage error-code documentation). Now an error or missing URL is quarantined rather than treated as absence. The shared source-upload/application-copy helper **never silently replays a private write after an ambiguous first response**; it can reconcile via a positive signed URL under the original candidate lease. A signed URL is a positive signal, not canonical RPC/row proof. Successful first responses and post-write canonical registration/readback remain.

A deliberate functional change is removal of hidden transient retry: candidates can reconcile state via existing list refresh and explicitly retry. No backend/RLS/auth/DB/Workers, Web, recruitment-admin, real application/message, main, production or Store changes.

Source: `native/src/lib/documentVaultApi.ts`, `native/src/lib/storageSignedUrlPresence.ts`, `native/src/lib/leaseFencedStorageUpload.ts`. The existing r333/r334 regression assertions were updated to enforce fail-closed behavior rather than being disabled.

## Test and parity matrix
Node v22.16.0:
`node --experimental-strip-types --test native/qa/native-upload-retry-session-fence-r333.test.mjs native/qa/native-application-copy-session-fence-r334.test.mjs native/qa/native-storage-ambiguous-probe-r335.test.mjs` = **25/25 PASS**.
`tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler native/src/lib/leaseFencedStorageUpload.ts native/src/lib/storageSignedUrlPresence.ts` = PASS (two production helpers only).

| Workflow | Android | iOS | Canonical Storage/RPC readback | Web paired render |
|---|---|---|---|---|
| Private source upload / application copy; ambiguous probe, candidate switch | IMPLEMENTING (source test only) | IMPLEMENTING (source test only) | NOT VERIFIED | NOT VERIFIED |

Expo full typecheck, real synthetic private Storage→RPC, installed Android/iOS runtime, signing/distribution/physical acceptance: NOT VERIFIED. Existing `.github/workflows/ci.yml` triggers main push or PR; this branch-only commit will not intentionally trigger it. Cloudflare prior r334 read-only check: 0 Worker triggers across two accounts only; unseen deployments, billing quota and signing rights unverified. Next: full Expo typecheck in authorized environment, actual synthetic save/readback, paired Android and iOS renders and safe installable handoff.
