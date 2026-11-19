# COLOR Native r355 — document-vault action/default snapshot consistency

Date of source inspection: 2026-11-19 (NZ). State: IMPLEMENTING, **not** developer-verified.

## Reference and ownership

- Canonical jobseeker Web baseline: `/profile` document-vault panel, `src/components/DocumentVaultPanel.tsx`, main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, file blob `d262729d9fdf8065432a058fe727898346bc9192`. Viewed from source on 2026-11-19, **not** a deployed/rendered capture.
- Web presents `応募時に使用` and `差し替え` when a document is default; otherwise `応募時に使う`. Each type may select its own default.
- Role: authenticated jobseeker/candidate. Synthetic test state: two résumé rows and a nursery-teacher-license row, one candidate, one session; no real candidate records.
- Owner: COLOR JOBSEEKER only. Repo `workmarketjp-gif/app.hoikucolor-recruit`; branch `native/color-vault-web-default-r341-20261119`. Base before edit `f2157f4872db6eea7cdab65d12c423c15904d733`. No other app, Web, RLS, Storage or production changes.

## Delta matrix

| ID | Web / expected action | Native source outcome | Android rendered QA | iOS rendered QA | Canonical save/readback |
| --- | --- | --- | --- | --- | --- |
| DV-ACTION-01 | A document's default status determines which action is offered | `canActOnCandidateDocument` refuses a stale displayed `is_default` flag if the freshly verified canonical row differs | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| DV-ACTION-02 | A document type has no more than one default, while different types have independent defaults | Ambiguous same-type default snapshots refuse actions; valid different-type defaults remain usable | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| DV-ACTION-03 | Malformed private document rows must not permit an action or a success state | Blank/whitespace-only ID, path, or type fails client-side canonical owner-list preflight; server RLS remains authoritative | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |

## Implementation and evidence

- `native/src/lib/documentVaultPrivacy.ts`: code commit `c16864fe106c3613b12318b903d9cbf082e71a6f`, exact GitHub blob `cd21ee87b3620c02f6c9bf88284cbcc7023163b2`.
- `native/qa/native-vault-action-default-revision-r355.test.mjs`: regression commit `c7f8e6217121d8c5ab807460f5f1d62a462051dd`, exact blob `d98a151bf45e6bb422c3b695b2f51cd56230df99`.
- The new seven-test suite failed **5/7** on the pre-fix real source (expected reproduction) and passed **7/7** after the fix.
- Focused compatibility run: `cd native && node --experimental-strip-types --test qa/native-vault-action-default-revision-r355.test.mjs qa/native-vault-delete-authoritative-finalize-r345.test.mjs qa/native-vault-mutation-unique-readback-r346.test.mjs qa/native-vault-action-canonical-identity-r348.test.mjs qa/native-vault-integration-r353.test.mjs qa/native-vault-replacement-prewrite-r343.test.mjs qa/native-vault-upload-visible-readback-r347.test.mjs qa/native-vault-prewrite-cache-cleanup-r354.test.mjs` -> **103/103 PASS** on isolated source files with matching GitHub blob hashes. `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions src/lib/documentVaultPrivacy.ts src/lib/requireFreshVaultReplacement.ts src/lib/runVaultPrewriteWithCleanup.ts` -> exit 0.
- No full Expo dependency-installed checkout/typecheck, live synthetic Supabase RLS session, Android/iOS app render, signed installable artifact, or device acceptance in this Linux runtime. Neither test count nor GitHub commits constitute Web parity completion.

## Cost/release boundary and next action

At the write gate `.github/workflows/ci.yml` triggers on main push / pull requests, not this Native development-branch push. Cloudflare COLOR branch Preview `0b6812dd43dd4b9ba55856bf6b604198` was read and had `auto_build=false`. No extra paid build, Actions dispatch, main merge, Worker publish, candidate mutation or Store submission authorized. Actual billing/quota is unknown.

Next: obtain complete dependency-installed Expo source for application-level typecheck, synthetic candidate canonical Web/native default-change readback and a real Android + iOS rendered comparison. Signing and authorized iOS distribution remain unverified; keep IMPLEMENTING.
