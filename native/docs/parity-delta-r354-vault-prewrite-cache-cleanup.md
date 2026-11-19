# COLOR Native r354 | registered picker-cache cleanup when prewrite is refused

2026-11-19 NZ; COLOR Native only. Branch `native/color-vault-web-default-r341-20261119`; parent `2d68f731f4198fab07c5f95e7bbd26790de807ca`. Approved Web JOBSEEKER `/profile` → 応募書類; main baseline `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c` (synthetic old-default / session-revoked state).

r353 added a fresh canonical pre-upload default check. Its rejection or network failure could occur *after* `registerPendingDocumentPickerCache` but *before* the uploader responsible for consuming the pending asset starts. The new `runVaultPrewriteWithCleanup` wrapper releases the previously registered picker/camera cache entry on those preflight failures, preserves the original error and prevents a new Storage upload. On success, the existing uploader retains control and existing Web-approved replacement semantics are unchanged.

Focused test: `node --experimental-strip-types --test qa/native-vault-prewrite-cache-cleanup-r354.test.mjs`, four synthetic failure/success cases. Additional archived privacy suites belong to the r353 source identity proof and remain compatible. Server private Storage/RLS unchanged. Android runtime/visual and iOS runtime/visual NOT_VERIFIED, full Expo TSX typecheck NOT_RUN, real candidate save/re-read NOT_VERIFIED. Signatures and distribution not verified; no signed builds. Do not infer that this client-side cleanup guarantees OS-level file erasure beyond the verified adapter contract.

No main/PR, paid Actions/EAS, Production, Worker/DB/RLS/Store changes. Cloudflare latest Worker build was main 2026-11-17, dedicated Native Preview auto_build=false prior r351; consumption/quota unknown.
