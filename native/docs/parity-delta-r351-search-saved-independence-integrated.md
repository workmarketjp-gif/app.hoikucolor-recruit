# COLOR Native r351 — job search independent of favorites (integrated source, NOT developer verified)

Date inspected: 2026-11-19 NZ. Owner: COLOR JOBSEEKER only. GitHub source branch `native/color-vault-web-default-r341-20261119`, implementation commit `921f8120a77bf59a8811bdf0d97de9870d108f03`. No root Web, Staff, Family, shared backend or production modifications.

## Versioned Web baseline / affected workflow
- Jobseeker Web: `/jobs`, source `src/App.tsx`, main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, jobseeker/candidate role, synthetic state: verified first job search page with saved-ID read failure, then next-page failure. Web job discovery is independent of saved-heart retrieval. No deployed visual screenshot captured this run.
- Native: `native/src/app/(tabs)/jobs.tsx` at implementation commit above; separate canonical `searchJobseekerJobs` and candidate-private `listSavedJobIds` reads, with existing owner/session/generation/privacy guards.
- No real candidate or invented job result used; tests use synthetic UUIDs and a synthetic job row.

## Web-to-Android/iOS parity delta (r349 + r350)
| ID | In-scope action / failure state | Source behavior implemented | Android QA | iOS QA | Persisted backend / Web readback |
| --- | --- | --- | --- | --- | --- |
| JS-SEARCH-01 | Search results while saved IDs read fails/timeouts/malformed | Keep verified job page; show warning, disable unverified heart, allow explicit recovery | NOT_VERIFIED (no emulator) | NOT_VERIFIED (no simulator) | NOT_VERIFIED |
| JS-SEARCH-02 | Next page fails when prior results verified but bookmarks UNKNOWN | Preserve visible results and show pagination-scoped error instead of wiping search | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| JS-SEARCH-03 | Session switch, shield, stale request, saved-ID UUID integrity | Fail closed before private favorites can mutate; reject duplicates/malformed results | Source regression only | Source regression only | NOT_VERIFIED |

## Integration and tests
- Code commit `921f8120a77bf59a8811bdf0d97de9870d108f03`: 2 modified Native files + 1 new helper + 2 dedicated Node regressions.
- At new commit, helper blobs `d3e2b5f309b9d738f8bc0f85d46bca593927f711` and `1e334c43e412b25034c1f2b7bf9b3a70de6ac58a`; tests `0b7f5e796d9a2d565e30eac103587ce10878fcf4` and `49ab030501bf476fb92a8151894ca48085996ba6` exactly match the offline test source in the earlier r350 evidence package (blob hashes verified after GitHub commit).
- Actual isolated command: `cd native && node --experimental-strip-types --test qa/native-job-search-independent-bookmarks-r349.test.mjs qa/native-job-search-failure-channel-r350.test.mjs` — 20/20 PASS.
- Focused strict helper command: `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions src/lib/jobSearchFailureChannel.ts src/lib/jobSearchSavedIndependence.ts src/lib/privateReadDeadline.ts` — PASS.
- These commands executed against matching helper/test blobs extracted to the Linux sandbox; **not** against a complete installed Expo checkout or an emulator. The screen JSX could not receive the whole-app compile check. React Native rendered UI, canonical backend readback, Android/iOS signing, installs and captures are NOT VERIFIED.

## Cost / ownership / next gate
The exact COLOR Preview `0b6812dd43dd4b9ba55856bf6b604198` was changed from `auto_build=true` to `false` on 2026-11-19 before the branch push. Readback confirms disabled; other preview settings were unchanged. The Worker production configuration remained unchanged. The GitHub CI workflow triggers on main push / pull request (this branch is neither). The observed Preview build list contained only historical builds; no new Preview build observed after the code push. Actual Cloudflare billing remains unknown; disabling auto-build does not prevent manual builds/hooks.
Existing r343/r345-r348 private-document patches are still **unintegrated** and require a refreshed application against the new branch HEAD. Superseded r344 must not be applied.
Next: get full dependency-installed Expo checkout and independent Android/iOS native runners and signing/distribution, resolve root shared QA contract with owner, then test synthetic canonical save/readback plus real rendered side-by-side and signed candidate. No PR, main merge, Production deploy or Store publication was authorized.
