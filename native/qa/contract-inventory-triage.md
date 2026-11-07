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
- `native-signed-out-bootstrap.test.mjs` (10 tests, `npm run test:signed-out-bootstrap`, which also runs the startup contract): entry
  routing, Clerk config failure vs instance mismatch, signed-out never mounts PrivateRuntime, inactive identity holding state,
  sign-in / account-switch / sign-out transitions, diagnostics carry no identifiers. Retires inventory entry `signed-out-bootstrap`.
  Mutation-checked: forcing the entry redirect to home fails the suite.
- `native-push-lifecycle.test.mjs` (18 tests, `npm run test:push-lifecycle`; fixture `qa/fixtures/push-platform.stub.mjs`): real `notifications.ts`
  with a synthetic platform. Mutation-checked (removing generation guards fails 2 tests). Retires `push-lifecycle`; covers the registration half
  of `push-session-quarantine` / `push-binding-session-race`. Real push delivery needs a device.

---

# npm script disposition (2026-11-07, Phase 1)

Before: 58 `test:*` scripts pointed at contract files that never existed on any branch (MODULE_NOT_FOUND = no evidence).
After: **0 dead scripts**. `npm run test:behavioural` runs every `qa/*.test.mjs` (469 tests, 469 pass); `test:contracts:available` runs 17 contract files (17 pass).

## Repointed to real suites (full = the original topic is exercised; partial = only part is, remainder is backlog)
| Script | Coverage |
|---|---|
| `test:ambiguous-retry` | full |
| `test:account-isolation` | partial |
| `test:document-vault` | partial |
| `test:push-session-quarantine` | full |
| `test:durable-mutation-recovery` | full |
| `test:push-installation-rebind` | partial |
| `test:durable-mutation-mismatch` | full |
| `test:job-search-pagination` | full |
| `test:visit-journey` | partial |
| `test:application-confirmation` | partial |
| `test:application-canonical-detail` | full |
| `test:application-list-canonical` | full |
| `test:comparison-provenance` | full |
| `test:notification-deep-link-focus` | partial |
| `test:application-document-expectation-recovery` | full |
| `test:message-read-visibility` | full |
| `test:visit-context-binding` | partial |
| `test:saved-offline-snapshot` | partial |
| `test:signout-local-purge` | full |
| `test:app-lock-canonical-quarantine` | partial |
| `test:saved-app-lock-quarantine` | partial |
| `test:private-data-quarantine` | partial |
| `test:document-picker-cache` | full |
| `test:document-picker-session-quarantine` | full |
| `test:candidate-write-session-quarantine` | full |
| `test:push-binding-session-race` | full |
| `test:discovery-read-reliability` | full |
| `test:recovery-session-quarantine` | partial |
| `test:private-read-session-quarantine` | partial |
| `test:saved-session-quarantine` | partial |
| `test:document-picker-purge-race` | full |
| `test:durable-mutation-purge-race` | full |
| `test:session-handoff-local-purge` | full |
| `test:discovery-session-quarantine` | partial |
| `test:push-presentation-session-race` | full |

## Removed: no real test exists yet (backlog, NOT obsolete)
The feature exists in `src`; the script was removed only because a script that cannot run is not a test. These stay listed in `native-contract-inventory.json` as UNMATERIALIZED so the gap remains visible.

- `test:notification-permission`
- `test:interview-completion`
- `test:document-vault-upstream`
- `test:account-deletion-execution`
- `test:exact-unread-badge`
- `test:notification-visibility-count`
- `test:interview-durable-recovery`
- `test:release-gate-continuity`
- `test:biometric-strong-policy`
- `test:visit-facility-message`
- `test:attention-summary`
- `test:foreground-reconciliation-fallback`
- `test:interview-exact-target`
- `test:interview-push-exact-target`
- `test:store-listing-preparation`
- `test:account-deletion-session-quarantine`
- `test:private-document-open-session`
- `test:session-foreground-freshness`
- `test:screen-privacy-session-handoff`
- `test:application-read-reliability`
- `test:signout-session-handoff`
- `test:clerk-session-identity-atomicity`
- `test:release-gate-session-atomicity`

Phase 2 priority: interview-*, notification-permission, exact-unread-badge, account-deletion-*, session-foreground-freshness, clerk-session-identity-atomicity.

## New suites this phase
- `native-session-isolation.test.mjs` (17): session fence, queue serialization, purge draining, cross-account independence, five-surface sign-out purge that fails closed.
- `native-document-photo-cache.test.mjs` (16): picker temp-cache ownership/generation/purge; photo cache owner binding and tamper rejection.
- `native-durable-mutation.test.mjs` (17): idempotent recovery envelopes, no plaintext, expiry, owner purge, message send and interview response readback gates.
All three were mutation-checked against their production modules.

---

# Phase 2 coverage update

New suites (all mutation-checked: a production guard was removed and the suite failed, then the source was restored):
- `native-session-freshness.test.mjs` (16): real `sessionLifecycle.ts` hooks in a hook runtime + `accountDeletionPolicy.ts`. Guards checked: post-await identity comparison, offline-vs-revoked handling, `skipCache` token refresh, deletion `canCancel`.
- `native-application-lifecycle.test.mjs` (18): offer acceptance, withdrawal, visit request/cancel with durable request ids, attention summary normalisation, exact-target links, partial notification reads. Guards checked: offer readback, visit readback, UUID validation of interview id, unread-count-unknown-not-zero.

## Scripts repointed this phase
| Script | Coverage | Result |
|---|---|---|
| `test:session-freshness` | new | 16 pass, 0 fail (re-run in Phase 3) |
| `test:application-lifecycle` | new | 18 pass, 0 fail (re-run in Phase 3) |
| `test:session-foreground-freshness` | full | 16 pass, 0 fail (re-run in Phase 3) |
| `test:clerk-session-identity-atomicity` | full | 16 pass, 0 fail (re-run in Phase 3) |
| `test:signout-session-handoff` | partial | 33 pass, 0 fail (re-run in Phase 3) |
| `test:account-deletion-session-quarantine` | partial | 33 pass, 0 fail (re-run in Phase 3) |
| `test:account-deletion-execution` | partial | 16 pass, 0 fail (re-run in Phase 3) |
| `test:exact-unread-badge` | partial | 36 pass, 0 fail (re-run in Phase 3) |
| `test:notification-visibility-count` | partial | 26 pass, 0 fail (re-run in Phase 3) |
| `test:notification-permission` | partial | 18 pass, 0 fail (re-run in Phase 3) |
| `test:interview-durable-recovery` | full | 35 pass, 0 fail (re-run in Phase 3) |
| `test:interview-completion` | partial | 22 pass, 0 fail (re-run in Phase 3) |
| `test:interview-exact-target` | full | 18 pass, 0 fail (re-run in Phase 3) |
| `test:interview-push-exact-target` | full | 36 pass, 0 fail (re-run in Phase 3) |
| `test:attention-summary` | full | 21 pass, 0 fail (re-run in Phase 3) |

"full" = the original contract topic is exercised by the suite; "partial" = only the logic layer (UI/OS behaviour not covered).

## Still backlog (no real test; scripts remain removed)
- `test:release-gate-continuity`
- `test:release-gate-session-atomicity`
- `test:biometric-strong-policy`
- `test:foreground-reconciliation-fallback`
- `test:application-read-reliability`
- `test:private-document-open-session`
- `test:screen-privacy-session-handoff`
- `test:visit-facility-message`
- `test:store-listing-preparation`
- `test:document-vault-upstream`

These need React context harnesses (ReleaseCompatibilityContext, AppLockContext, SessionFreshnessContext) or device APIs (LocalAuthentication, screen-capture). Not attempted with string-grep tests on purpose.

## Not covered by any automated test in this repository
- Orchestration in `resume.tsx` (edit -> save -> readback -> photo -> A4 PDF -> vault upload): its parts are unit-tested (`resume-*`, `generated-pdf-vault`, `document-write-readback`, `resume-photo-export`) but the screen itself is not executed.
- Real expo-print output (A4 size, Japanese glyph rendering, photo orientation), real image-manipulator output, SecureStore, file permissions: BLOCKED, needs a device or emulator.

**Phase 3 correction:** the "FAIL" cells in the Phase 2 table above were a reporting error. They were captured by a verification loop that ran before `package.json` was saved, so `npm run` found no script. The scripts were re-run after saving (all passed in the Phase 2 execution report) and again in Phase 3; the cells above now show the verified counts. Still failing: none.
