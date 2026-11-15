# COLOR Native r280 — Interview response post-SecureStore session fence

- Repository: `workmarketjp-gif/app.hoikucolor-recruit`
- Isolated development branch: `native/color-jobseeker-integration-r216-20261114`
- Parent HEAD: `9ae5b149bccaf80eb978fae6b6d2e8fb85905f84`
- Web reference: `src/App.tsx` plus candidate application/interview components on `main`, source inspection on 2026-11-16; signed-in synthetic candidate, no real application or message data.
- Scope: Native application detail → scheduled interview → 「この日時でOK」 / 「日程変更を希望」. No server-schema change.

## Confirmed gap and fix

The prior Native InterviewCard checked `pinned.isCurrent()` and focus lease **before** calling `respondToInterviewDurable`. That adapter awaited `prepareDurableMutation` (SecureStore) and then invoked `hc_jobseeker_respond_interview` **without rechecking** whether the candidate session or screen was still current. Sign-out, App Lock or blur during SecureStore preparation could therefore initiate an obsolete interview response.

The new `respondCandidateInterviewWithLease` requires the pinned session plus screen decision lease to be current before preparation, immediately after preparation/before RPC, after RPC, after canonical readback and before recovery-receipt deletion. A stale or uncertain result is never presented as a confirmed response and never launches automatic retry. The existing backend candidate-scoped RPC, exact interview status/message confirmation, and durable receipt are retained.

## Verification boundaries (Android / iOS separately)

- Node 22 with `--experimental-strip-types`: new 7 focused source tests pass (normal response, slow SecureStore revocation, RPC-in-flight blur, mismatch, readback revocation, errors/no retry, preflight revocation).
- Strict standalone TypeScript for pure helper: PASS.
- Existing r279 committed helper+test baseline: 3/3 PASS.
- React Native/Expo full compilation and canonical live RPC save/readback: NOT VERIFIED (Native dependencies and signed-in synthetic backend unavailable in execution container).
- Android SDK/emulator/native rendered capture: NOT AVAILABLE; signed APK/AAB: NOT BUILT.
- iOS macOS/Xcode/simulator/native rendered capture: NOT AVAILABLE; authorized TestFlight/ad-hoc route: NOT BUILT.
- Ownership: Color Native only. No Web, Staff, Family, shared schema, RLS, production, store or real candidate operation.
- CI/Cloudflare: GitHub `.github/workflows/ci.yml` triggers on main pushes and PR; isolated branch has no open PR at read time. No paid Actions/EAS triggered deliberately. Cloudflare target Git build trigger not independently verified; no main/PR/production writes.
- Cost: no new paid service invoked; actual quota/billing balance unverified.

## Next independent gap

Test complete interview-response retry/reconciliation with authorized synthetic API session on Android/iOS, including transport timeout, revoked session, slow SecureStore, and canonical status readback; then validate job search → detail → document selection → application → messages, along with small-screen and text-scale visual parity before signed-build handoff.
