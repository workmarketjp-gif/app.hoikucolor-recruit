# r328 — Silent document refresh failure must quarantine action authority

Date: 2026-11-18 NZ. Scope: COLOR JOBSEEKER Native `/application/[id]` → opened 応募書類 panel only.

## Frozen source baseline and gap

Web JOBSEEKER `/applications` → `ApplicationMessages` → opened 応募書類; Web main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, component blob `6275c5e50c3f67eea58a2ecb53d6b984fd34a497`. Authenticated synthetic candidate with a previously verified submitted document; a background 60-second three-source refresh later fails. Web and Native source comparison only, not a paired rendered capture. Reviewed on 2026-11-18 NZ.

Native prior source kept the last verified rows after a quiet refresh failure, but cleared the visible `error` and left `freshlyVerifiedOwner` unchanged. Once `readPending` cleared, the old rows could become actionable again without a successful canonical re-read, contradicting the existing comment and allowing an attempt to open or attach under obsolete status.

## Implemented

- `ApplicationDocumentsSection`: invalidate document action freshness when any canonical read begins, when it fails or changes owner/route/focus/panel, and when a mutation begins. Restore action freshness **only after** the complete 3-source canonical read and owner/application validation succeeds.
- Continue displaying the already authorized rows in read-only form on silent failure, with a short Japanese update-required notice. Keep manual `最新の応募書類を確認` usable for explicit recovery. Both attach and OS-viewer handlers and the visible buttons share the same predicate.
- No new writes, auto-retries, backend or Auth/RLS/Storage changes. Failed read is not treated as `[]` or proof of submission.

## Evidence and limits

- New dependency-free policy tested with Node 22: `node --experimental-strip-types --test native/qa/native-application-document-quiet-refresh-r328.test.mjs` — 8/8 PASS in isolated real-source local runtime before GitHub integration.
- `tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler native/src/lib/applicationDocumentReadFreshness.ts` — PASS, policy helper only. Screen wiring verified by exact GitHub source markers after patch. No Expo full-app typecheck or React Native executable.
- Android: **IMPLEMENTING** — common source integration only. No installed screen/signed APK on new SHA, no actual canonical readback.
- iOS: **IMPLEMENTING** — common source integration only. No installed screen/authorized TestFlight or IPA, no actual canonical readback.
- No same-state Web/Native screenshots, 200% text, keyboard, expired session or real device OS-viewer evidence. No production data used.

## Ownership and next

Repo `workmarketjp-gif/app.hoikucolor-recruit`; sole COLOR writer branch `native/color-focused-document-refresh-r294-20261117`. Branch base before r328: `61aeb6bc1bcabde30e3a482b4ba04c5d734bb8c7`. No main/PR/Production/Store, shared API, paid CI/EAS or external agent. Existing main/PR-only CI and unknown signing/distribution/Cloudflare quotas continue to block end-to-end acceptance.

Next: full locked Expo dependency typecheck in an authorized environment; Android/iOS installed Web-equivalent failing quiet refresh → read-only rows → explicit reload → action recovery; synthetic canonical save/readback; both signed install routes.
