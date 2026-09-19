# Hoiku Color Jobseeker Native

This directory is the GitHub materialization target for the dedicated Hoiku Color jobseeker Native app. It is intentionally isolated from the existing HC Web root so the Web/API/DB source of truth remains unchanged.

## Fixed completion inventory
- CA-01: Native registration/login → profile/preferences/documents → job search/compare/save on physical iOS/Android devices.
- CA-02: One canonical application stays consistent across facility Web, jobseeker Web and Native through messages, visit/trial, interview, selection result and withdrawal.
- CA-03: Facility updates → device Push → exact deep-linked screen → read state, with duplicate/cross-user/post-signout leakage prevented.
- CA-04: Document photo/file replace paths, permission denial, offline/retry/restart recovery, and no duplicate application/false completion.
- CA-05: Physical-device iOS/Android coverage for all agreed Native surfaces, auth/privacy/permissions/backend compatibility, with no known P0/P1 functional errors.
- CA-06: Signed-build inputs, compatible backend contract, Store listing assets, privacy declarations, review account, deletion/data-handling paths prepared for Store Release Gate.

## Current recovery/materialization status
The prepared Native Shell v77 / Foundation v93 remains the reviewed cumulative source snapshot. This commit starts recovering that source into `main` without replacing or copying HC Web business logic. The first materialized slice is CA-04 Document Vault camera capture/process-death safety plus Native release configuration. The remainder of v77 must be materialized before this directory is treated as a complete runnable Native checkout.

Prepared snapshot hashes used for recovery:
- Native Shell v77 ZIP: `856ffb48ee8a760461ed791f465f4b53577fccc2bb5ea21ac6e6fcc7580cb351`
- Foundation v93 ZIP: `9608a9001ed8c6f2b401e5b15397b3becd99da12cd90395940272b86014daf07`
- Web/API/DB baseline before Native materialization: `e4d79fd833520e8a993cda2228920678669ce392`

## Verification boundary
`npm run test:camera-document-capture` is a source/contract check and is wired into repository CI for this slice. It is not physical-device or signed-build evidence. iOS/Android device, signed build and Store submission remain explicitly separate.
