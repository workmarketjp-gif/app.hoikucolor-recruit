# r265 — Candidate token preflight read failures no longer strand Career UI in loading

**State:** IMPLEMENTING (source-only). **Checked:** 2026-11-15 NZ. **Owner:** COLOR Jobseeker Native UI / adapters / dedicated regression tests.

## Scoped Web/native delta

- Web JOBSEEKER authenticated synthetic candidate: `/` (CareerCompanion) and `/career` (CareerView); reference Web main `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`, `src/views/CareerView.tsx` blob `ed5eac2c1777af12205f1518b747556ea2bb41b2`. Web visibly provides retry on base/read error. No deployed SHA or paired rendered screenshot verified.
- Native base: `bde13f5deb7a569b09850f5e6e3d01bc1fcd5f23`, branch `native/color-jobseeker-integration-r216-20261114`, source `CareerExperience.tsx` blob `c25e3a0fe002e5c50a072c21299ce62d26f6c2a4`. No root AGENTS.md, HQ #265 and shared #467 read, no open PR in preflight. Protected writer: COLOR Native only. This is not a claim that an external unscheduled writer was disabled.
- Gap: `pinCandidateAction()` can resolve `null` after missing/expired Clerk token. Career base, salary market, scenario and advanced results silently returned with a loading state; market token *rejection* could escape the async callback because token acquisition preceded its read try/catch. This is not an empty-data result.
- Change: report retryable generic Japanese read errors instead of indefinite loading for all four preflight paths. Base/market/scenario/details fail closed and only surface the error if launch candidate+session, request generation and private display permission still match. Late rejection after account switch, App Lock, superseding request or unmount is suppressed. Canonical RPCs, private RLS, saved career mutation protections and visible approved layout remain unchanged.
- Paths: `native/src/components/CareerExperience.tsx`, `native/src/lib/careerReadPreflight.ts`, `native/qa/native-career-read-preflight-r265.test.mjs`, `native/package.json`, this document.

## Test and platform evidence

- Local Linux Node 22.16.0: `node --experimental-strip-types --test qa/native-career-read-preflight-r265.test.mjs`: **7/7 PASS** on helper and test source intended for the exact Git blobs; `tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck src/lib/careerReadPreflight.ts`: **PASS**. These are not Expo/React Native runtime tests or full app typechecks.
- GitHub source patch: four formerly silent token preflight paths now set owner-scoped error states; market token rejection is caught, error reporting has request/owner/privacy gate. Static wiring check performed on current connector file. No actual token or canonical API was called.
- Android: source-only; SDK/emulator not available in this Linux runtime; no installed render, official API save/readback, screenshots or signed installable build.
- iOS: Linux; no macOS/Xcode/Simulator; signing/distribution route not established; no installed render or installable authorized build.
- Cost: `.github/workflows/ci.yml` triggers main push or PR, not isolated feature branch push. No open PR. Cloudflare Pages project list is empty in two connected accounts; Worker Git triggers not independently verified. Do not make a PR/merge/deploy without release/cost gate. No paid runner/agent, Production, DB, RLS, real candidate activity or Store publication.
- Auth/signing distribution and actual remaining quotas unknown. No Web/Android/iOS same-state visual QA, no full Expo typecheck. Status is not DEVELOPER_VERIFIED.

## Next

Run full Native TypeScript plus mounted Android and iOS with synthetic candidate and forced token-null/token-throw; verify retry, App Lock, account switching, network interruption and UI restoration. Then canonical private readback and Web-vs-Native visual comparison, followed by the remaining incomplete Web workflows. Do not mark READY_FOR_MASA_ACCEPTANCE without both installable verified OS candidates.
