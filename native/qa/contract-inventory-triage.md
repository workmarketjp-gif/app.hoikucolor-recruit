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

---

# Update 2026-11-07 (consolidation branch on r49)

Verified: all 70 absent files have **zero history in any fetched branch** (`git log --all -- qa/<file>` is empty),
so none can be recovered; they must be written fresh. 62 of the 70 also have a dead `npm run test:*` script in
`package.json` pointing at the missing file. Those scripts fail with MODULE_NOT_FOUND and are **not evidence**.
`--available-only` runs 17 contracts (17 PASS). Behavioural `*.test.mjs` suites (run via named npm scripts, not by the
contract runner) now cover part of the inventory.

## A. Covered in substance by a behavioural suite (inventory entry can be retired once the owner agrees)
| Inventory entry | Covering suite(s) |
|---|---|
| application-canonical-detail | native-application-detail-privacy, native-application-detail-wiring |
| application-list-canonical | native-application-list-freshness |
| application-document-expectation-recovery | native-application-document-status |
| comparison-provenance | native-comparison-selection, native-match-saved-readback |
| job-search-pagination, discovery-read-reliability | native-job-search-pagination-wiring, native-job-search-failure-channel, native-job-search-filters |
| message-read-visibility | native-message-inbox-behavior, native-message-freshness-parity |
| document-vault (privacy, readback only) | native-document-vault-privacy, native-document-write-readback, native-generated-pdf-document |
| notification-deep-link-focus (route scope only) | native-scoped-notification-route, native-notification-private-readback |
| saved-offline-snapshot (readback only) | native-saved-jobs-readback |
| shell | superseded by ca01-shell + web-parity (PASS) |

## B. Still uncovered, privacy/session race behaviour (write ~6 consolidated suites)
signout-local-purge, signout-session-handoff, session-handoff-local-purge, clerk-session-identity-atomicity,
release-gate-session-atomicity, release-gate-continuity, private-data-quarantine, private-read-session-quarantine,
saved-session-quarantine, discovery-session-quarantine, recovery-session-quarantine, candidate-write-session-quarantine,
app-lock-canonical-quarantine, saved-app-lock-quarantine, push-session-quarantine, push-installation-rebind,
push-binding-session-race, push-presentation-session-race, push-state-reconciliation, document-picker-cache,
document-picker-session-quarantine, document-picker-purge-race, private-document-open-session,
document-vault-upstream-rebase, durable-mutation-purge-race, durable-mutation-recovery, durable-mutation-mismatch,
ambiguous-mutation-retry, account-isolation, account-deletion-execution, account-deletion-session-quarantine,
session-foreground-freshness, session-biometric, biometric-strong-policy, screen-privacy-session-handoff.

## C. Still uncovered, journey correctness
signed-out-bootstrap, profile-auth, application-journey, application-confirmation, interview-completion,
interview-durable-recovery, interview-exact-target, interview-push-exact-target, visit-journey, visit-context-binding,
visit-facility-message, notification-permission-recovery, notification-visibility-count, exact-unread-badge,
attention-summary, push-lifecycle, root-notification-scope, canonical-api, offline-save,
foreground-reconciliation-fallback, application-read-reliability.
Acceptance priority: application-journey, application-confirmation, signed-out-bootstrap, push-lifecycle.

## D. Deferred to store release (need signed builds)
release-e2e, store-compliance, store-listing-preparation.

## Recommended hygiene (not yet applied)
Remove the 62 dead npm scripts or point them at real suites, so a green `npm run` is never mistaken for coverage.

## Journey suites written (2026-11-07)
- `native-application-journey.test.mjs` (14 tests, `npm run test:application-journey`): real `applicationJourneyApi.ts` with a
  synthetic RPC client. Covers submit validation, identity-field hygiene, canonical readback gate, ambiguous-result rejection,
  v2->v1 fallback, document dedupe/selection/default handoff, partial attach failure, and handoff repair.
  Retires inventory entries `application-journey` and (submission half of) `application-confirmation`.
