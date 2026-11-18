# COLOR Native r334 — Application-document copy lease fence

Date: 2026-11-18 NZ. Repo `workmarketjp-gif/app.hoikucolor-recruit`. Branch `native/color-focused-document-refresh-r294-20261117`.
Web baseline: authenticated JOBSEEKER `/applications` → application detail → 応募書類; current Web main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c` (source reference, NOT deployed capture). Synthetic candidate A submits an existing document, then logs out or switches to B while Storage copy or destination-existence probe is pending.

## Repaired discrepancy
`ensureApplicationCopy` previously called `assertContinue` before its destination-existence check but **not after the awaited check before a retry**. An A→B switch during that probe could therefore launch a second private Storage copy after the prior candidate lease was revoked. Reuse the existing, tested `ensureLeaseFencedStorageUpload` operation-fence for application-copy calls as well: it checks the same caller lease before/after copy and existence-check awaits, and before any retry. The deterministic destination path, once-only retry, no-upsert source upload, RPC registration and canonical readback remain unchanged. A previously in-flight server copy cannot be cancelled, and completion must never be inferred from a lost response.

Source: `native/src/lib/documentVaultApi.ts`; targeted test: `native/qa/native-application-copy-session-fence-r334.test.mjs`. No Web/recruitment admin/shared schema/RLS/Auth/Workers/production modification.

## Scoped QA and matrix
Node v22.16.0: `node --experimental-strip-types --test native/qa/native-application-copy-session-fence-r334.test.mjs native/qa/native-upload-retry-session-fence-r333.test.mjs`: **17/17 PASS** (9 new + 8 existing). Helper-only strict TS: `tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler native/src/lib/leaseFencedStorageUpload.ts`: PASS. Actual helper source from r333 checked by Git blob; new documentVaultApi integration verified by exact GitHub source-match after commit. This does not validate Expo-wide compilation or actual Supabase Storage.

| Workflow | Android | iOS | Canonical readback | Web visual comparison |
|---|---|---|---|---|
| 応募管理 → 応募書類コピー → 登録, A→B interrupted copy | IMPLEMENTING (source contract only) | IMPLEMENTING (source contract only) | NOT VERIFIED (authorized synthetic Storage/RPC pending) | NOT VERIFIED (both real Native renders pending) |

Outstanding: full Expo SDK typecheck; real-device/simulator QA on each OS; safe synthetic source-copy/registration/readback; signed Android installable and authorized iOS TestFlight/ad-hoc path. Signing/distribution and billed quotas unverified. CI primary workflow runs on main push/PR; branch update is not main, PR, release or Store publication. Cloudflare read-only check on 2026-11-18 found no trigger on `app-hoikucolor-recruit` in two connected accounts, but unconnected accounts are not proven absent. No paid CI/EAS or external agent.
Next independent safety issue: `storageObjectExists` maps signed-URL errors to false; an existence-check error must not be mistaken for verified absence and authorize blind retry. Confirm Supabase error semantics before further mutation.
