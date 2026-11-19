# COLOR Native | vault prewrite, identity and action guards (r353, 2026-11-19 NZ)

Owner branch: `native/color-vault-web-default-r341-20261119`; starting HEAD `a6dc7752803d3d255551aa96d632ae4faf27be65`. JOBSEEKER Web reference: `/profile` → 応募書類, `src/components/DocumentVaultPanel.tsx`, verified Web/main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, candidate role, synthetic old-default/new-default/switch-of-session state. This is source correspondence, not a rendered screenshot.

| ID | Web flow | Native integrated source and guard | Android | iOS | Real backend |
| --- | --- | --- | --- | --- | --- |
| JS-VAULT-REPLACE | New upload becomes the default; original private file remains in vault | Picker and camera capture selected canonical owner/revision; prior to a new upload, refresh candidate documents and validate original default identity, path, type and session | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| JS-VAULT-UPLOAD-ACK | Only report a saved upload after canonical confirmation | Compare re-read source against upload API's returned owner/id/type/private path; reject duplicate IDs and same-type double defaults | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| JS-VAULT-ACTION | Open, default and delete require a valid candidate document snapshot | Reject a mixed-owner, duplicate-ID or malformed canonical list instead of trusting one matching row | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |

Existing r345/r346 authoritative finalization and default readback remain unchanged; superseded r344 is NOT applied. Server RLS and private Storage still authorize writes and reads; these are additional presentation/prewrite guards, not a server transaction lock.

Focused Node tests use synthetic only, no real identity or user documents; `node --experimental-strip-types --test qa/native-vault-integration-r353.test.mjs`. Prior offline 52-case r343/r347/r348 tests can be re-run against the packaged exact source; do not treat those tests as full Expo or runtime checks. Signable Android APK, iOS TestFlight/ad-hoc path, simulators, SDK, live canonical Supabase save/readback and Web/Native side-by-side remain unverified.

Release restrictions: no PR/main, Production Worker, DB/RLS, live app/message/Storage writes, paid Actions/EAS or Store submission. GitHub CI main-push / PR events do not run for a native-only branch push; Cloudflare Native-preview auto_build=false was last evidenced by r351, billing allowance is not verified.
