# COLOR Native r341 — Web-equivalent safe document replacement

**State: IMPLEMENTING.** Source-level fix on an isolated non-production branch; not an Android/iOS developer-verified build.

## Verified Web reference (2026-11-19 NZ)

- Jobseeker role, Web route `/profile` → `応募書類`.
- Web source `src/components/DocumentVaultPanel.tsx`, main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, blob `d262729d9fdf8065432a058fe727898346bc9192`.
- **Important correction to the unintegrated r340 patch:** Web `差し替え` is offered on the *default* document and explicitly supplies `makeDefault:true`. `uploadJobseekerDocument` saves a distinct private vault object and changes the default, but **retains the old source**. It does not delete existing submitted copies. r340 incorrectly described replacement as not switching the default; its ZIP must **not** be applied as-is.
- Synthetic QA state: candidate A, current default resume A-old, new resume A-new; after replacement A-new is the default and A-old remains non-default. No actual candidate PII was inspected.

## Scope and ownership

- Repo `workmarketjp-gif/app.hoikucolor-recruit`, base `bd9ddf429fc29f8666ceac5b46617133a03c1549`.
- Isolated branch `native/color-vault-web-default-r341-20261119`, created from the previous COLOR owner branch at exact base. No unrelated path writes.
- `native/src/components/DocumentVaultSection.tsx`: replacement requests Web-equivalent default switch; canonically confirms both saved rows; never automatically deletes old source; replacement CTAs only on default entries; signed source storage and application copies are untouched.
- `native/src/lib/confirmCandidateVaultReplacement.ts`: session/owner/type/private path/row ID/default/duplicate canonical readback confirmation; client-side defense only, not a substitute for server RLS.
- `native/qa/native-vault-replacement-web-default-r341.test.mjs`: 23 synthetic privacy and mutation result cases.
- `native/qa/native-ca04-document-replacement-contract.mjs`: updates obsolete assertions expecting automatic deletion to the verified Web contract; does not weaken privacy assertions.
- No Web admin/LP, shared backend/schema, Worker, production DB, RLS, Clerk, or Storage change.

## Focused evidence (current source, not native runtime)

- Node v22.16.0, npm 10.9.2.
- `node --experimental-strip-types --test qa/native-vault-replacement-web-default-r341.test.mjs`: **23/23 PASS** using helper/test files verified by GitHub blob SHA `00b58b43a687906aeea401cac2d13d1ae9a61074`/`03f774ea8c21da918a781c0309555c3a4600f7e8`.
- `tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --allowImportingTsExtensions src/lib/documentVaultPrivacy.ts src/lib/confirmCandidateVaultReplacement.ts`: PASS. This is a **two-file isolated type check**, not Expo app-wide type checking.
- Current native component and Web counterpart plus uploader were directly inspected with connected GitHub tools. 17 source assertions matched. The rewritten committed CA-04 contract has **not** been run by Node against a full checkout.
- Android / iOS SDK-backed runtime, visual side-by-side, real synthetic Clerk+Supabase persistence, sign/install/builds: **NOT VERIFIED** for both OSes.

## GitHub and Cloudflare cost / integration gate

- Existing `.github/workflows/ci.yml` runs on main pushes and PRs. Other push-triggered workflows path-filter `mcp/**`; this Native feature branch was not opened as a PR.
- Cloudflare worker build ID `36f3cf5e-c449-4dce-8e27-2f1e75b6fd0c` conclusively shows the **old branch** push at `bd9ddf...` triggered a failed build. Build trigger `b98e172f-602d-4dbd-bbf1-6bac0b294963`, external script `7eb45a09629543f0a8c3590b25a7276e`, `branch_includes: [native/color-focused-document-refresh-r294-20261117]`, `path_includes: [*]`, `deploy_command: npx wrangler preview`. A production publication was **not established** from this failed build.
- The new r341 branch is not the old branch exact allowlist. GitHub commit check runs were 0 at inspection; this is not proof of zero downstream cost. No trigger config/billing changes or new paid build were authorized/executed. Actual billing quota remains unknown.
- No merge, PR, production release, store submission or user communication was performed.

## Next gate

1. Obtain and run real Expo dependency typecheck / candidate-scoped canonical readback and corrected CA-04 contract on an authorized source checkout.
2. Compare rendered Native with approved Web on both OSes, using identical synthetic owner, normal/long Japanese text, scaling, empty/error, keyboard and account switch.
3. Review branch integration against the 16-or-more main-side commits, avoiding auto-rebase/overwrite. Control Worker and Actions triggers before PR. Produce Android signed APK and authorized installable iOS route when genuinely available; await MASA acceptance separately.
