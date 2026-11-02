# Native contract inventory triage (2026-11-02)

Basis: `native-contract-inventory.json` lists 87 contracts; 16 existed on main, `native-screen-privacy-contract.mjs`
was added in this change (17 PASS, 70 UNMATERIALIZED). Triage is by contract name checked against the present
`native/src` modules. The absent files were never committed, so their original assertions are unknown. Do not
bulk-generate them. Write each group as a behavioural suite against the current code.

## 1. Required, privacy/session safety (features exist in `src`)
Already partly asserted by `native-private-session-core-contract.mjs` (app lock, freshness, local purge, pinned
actions). Missing: race and ordering behaviour. Consolidate into about six executable suites instead of ~30 files:

- sign-out / session handoff / local purge: `signout-local-purge`, `signout-session-handoff`, `session-handoff-local-purge`, `clerk-session-identity-atomicity`, `release-gate-session-atomicity`, `release-gate-continuity`
- quarantine on read/write: `private-data-quarantine`, `private-read-session-quarantine`, `saved-session-quarantine`, `discovery-session-quarantine`, `recovery-session-quarantine`, `candidate-write-session-quarantine`, `app-lock-canonical-quarantine`, `saved-app-lock-quarantine`
- push races: `push-session-quarantine`, `push-installation-rebind`, `push-binding-session-race`, `push-presentation-session-race`, `push-state-reconciliation`
- documents: `document-picker-cache`, `document-picker-session-quarantine`, `document-picker-purge-race`, `private-document-open-session`, `document-vault`, `document-vault-upstream-rebase`
- durable mutations: `durable-mutation-purge-race`, `durable-mutation-recovery`, `durable-mutation-mismatch`, `ambiguous-mutation-retry`
- account: `account-isolation`, `account-deletion-execution`, `account-deletion-session-quarantine`, `session-foreground-freshness`, `session-biometric`, `biometric-strong-policy`, `screen-privacy-session-handoff`

## 2. Required, candidate journey correctness
`signed-out-bootstrap`, `profile-auth`, `application-journey`, `application-confirmation`,
`application-canonical-detail`, `application-list-canonical`, `application-document-expectation-recovery`,
`interview-completion`, `interview-durable-recovery`, `interview-exact-target`, `interview-push-exact-target`,
`visit-journey`, `visit-context-binding`, `visit-facility-message`, `notification-permission-recovery`,
`notification-deep-link-focus`, `notification-visibility-count`, `exact-unread-badge`, `message-read-visibility`,
`attention-summary`, `push-lifecycle`, `root-notification-scope`, `canonical-api`, `job-search-pagination`,
`discovery-read-reliability`, `application-read-reliability`, `comparison-provenance`, `offline-save`,
`saved-offline-snapshot`, `foreground-reconciliation-fallback`.
Priority for Build 4 acceptance: `signed-out-bootstrap`, `profile-auth`, `push-lifecycle`, `notification-permission-recovery`.

## 3. Intentionally deferred (Phase 5, store release)
`release-e2e`, `store-compliance`, `store-listing-preparation`. They need signed builds and store metadata.

## 4. Obsolete candidates (need owner confirmation before removal from the inventory)
`shell` is superseded by `ca01-shell` and `web-parity`.

## Done in this change
`screen-privacy`: `usePrivateScreenCapture` on profile, applications, application detail, messages, scouts, visits.
