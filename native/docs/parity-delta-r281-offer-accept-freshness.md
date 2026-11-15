# COLOR Native r281 — Candidate offer acceptance freshness

- Repository: `workmarketjp-gif/app.hoikucolor-recruit`; single COLOR writer `native/color-jobseeker-integration-r216-20261114`.
- Parent HEAD: `7c605067e58922bf0907e2731409c8c30e82c621`.
- Web reference: `src/components/ApplicationDetail.tsx` on main `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`, inspected 2026-11-16; JOBSEEKER signed-in synthetic candidate, offered application with optional response message. Source evidence, not paired rendered capture.

## Actual source gap
Native `acceptCurrentOffer` called the irreversible `hc_jobseeker_accept_offer` RPC after the initial Clerk pin, without confirming that a facility-side offer had not changed since rendering. Withdrawal had a fresh preflight, acceptance did not.

## Correction
`acceptCandidateOfferWithFreshReadback` gets a candidate-scoped canonical application readback, checks exact application ID/status/offer response against the card before the existing acceptance RPC, and fences account/session/focus before/after asynchronous operations. Missing, changed, already accepted or unauthorized readback cannot start acceptance. Stale canonical state is shown for review. No backend/schema/RLS changes or automatic duplicate sends. Server-side atomic authorization remains authoritative.

## Evidence boundary
- Node 22 focused real-source tests: 12/12 PASS; standalone strict TypeScript on the dependency-free helpers PASS. Source wiring checked after GitHub commit; no native SDK compilation or actual RPC execution claimed.
- Android: IMPLEMENTING; no emulator, rendered native QA, signed APK or live authorized data readback.
- iOS: IMPLEMENTING; no Xcode/simulator, rendered native QA, signed TestFlight/ad-hoc route or live authorized data readback.
- Isolated Native branch only. GitHub Actions run on main/PR; connected Cloudflare `app-hoikucolor-recruit` build trigger includes main only. No main/PR/production/DB/Worker writes, paid CI/EAS or external agents. Billing and signing permissions unverified.
- Next: test job search → detail → documents → application → messages against an authorized synthetic API and side-by-side Web/Android/iOS renders, then obtain developer-verified signed handoff.
