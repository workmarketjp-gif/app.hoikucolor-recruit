# r161 — Webの「見学・体験」導線を応募可否から分離

**State:** IMPLEMENTING (source patch + focused tests; neither Android nor iOS developer verified).

## Ownership, reference, provenance

- Only COLOR JOBSEEKER Native UI, presentation helper and scoped regression files. Single writer: Color Native Commander, isolated branch `native/color-visit-entry-independent-apply-r161-20261111`; parent r160 `5eed316a6153a9be8bbf8caf900cc3fd7ceef5a6`. No main, no shared backend/API, no PR at start. Root `AGENTS.md` absent. HQ #265 MINIMUM_COST_V1 and #467 remain authoritative.
- Web source: `src/components/JobCard.tsx` on main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6` (blob `f352532f4c8c28888f58d47364dd5c1eba044d29`), and `src/components/VisitTrialPanel.tsx` (blob `590bb872472311c3be3112625bff5f3969af2edf`). Read 2026-11-11. Web route: authenticated jobseeker `/jobs`, expandable internal job, synthetic `is_external=false,can_apply_direct=false` and open deadline. Web's `!isExternal && !isClosed` VisitTrialPanel gate does not consult `can_apply_direct`; settings RPC still determines if a visit form appears. No same-state deployed screenshot.
- Native baseline: `native/src/app/job/[id].tsx` and `native/src/app/(tabs)/saved.tsx` plus `SavedJobPreviewCard.tsx`. Before patch both view-level visit actions depended on `directApply`. Saved Presenter likewise had no independent visit eligibility.

## Functional delta

- Added `canOpenCandidateVisit` with explicit internal-source/authoritative saved-status gate, finite current-time, expiry validity and closed/external rejection. This helper controls navigation only; no promise of reservation availability. `getVisitSettings`, candidate-owned reservation reads, `requestVisitDurable` and server RPC maintain authorization and booking limits.
- Saved card now uses separate `canVisit` for the visit button; Saved route checks the same predicate immediately before navigation, and retains pinned Clerk candidate, generation/owner and private-data quarantine checks. `directApply` still controls application wording; the two actions are not conflated.
- Job detail now presents its separate visit route for canonical internal published jobs even when direct application is unavailable, with safe source and expiry guards. Application button, vault and document/RPC preflight remain unchanged. External/imported postings and closed/invalid-expiry jobs do not gain the visit entry.
- Updated existing Saved/Web wiring assertions and saved presenter regressions; new focused visit tests are included in the existing `test:job-discovery-parity` script.

## Developer evidence (exact committed source)

- Node v22.16.0, `node --experimental-strip-types --test qa/native-candidate-visit-entry.test.mjs qa/native-saved-job-card-presentation.test.mjs`: **15/15 PASS**, isolated original verified-evidence module `20691ac0e736848ed11bad3f52d3be74d54928aa`. Git blob hashes of helper `3a097eb3cfbdffa873a47199c3a797f65b21fbe6`, presenter `fe640746b36a4ff7e9a5066d81a22c422bf3a305`, new test `451e177fb8e222399c8e79fb609164804af5ec53`, amended presenter test `697d9ded9a21ca32d57f2acfa893a1cb9842d80d` matched the fetched GitHub blob SHA.
- `tsc --strict --noEmit --target ES2022 --module ESNext --moduleResolution bundler src/lib/candidateVisitEntry.ts`: **PASS** for isolated standalone helper only. Presenter/full Expo typecheck **NOT VERIFIED** (missing compatible dependency tree and imported type definitions in isolated runtime). Native/Web source wiring checked at GitHub SHA, but dependency-backed JSX/render tests **NOT RUN**.
- GitHub Actions: `.github/workflows/ci.yml` push on main, pull_request on PR; other push workflows restricted to MCP paths. New branch, not PR/main. No paid Actions/EAS, API invocation, DB/Edge/Worker/auth changes or stores. Connected Cloudflare deployment/billing scope not fully verifiable; no production authorization implied.

## Web → Native acceptance matrix

| Synthetic scenario | Web baseline | Native source/test | Android runtime | iOS runtime | Authorized API readback |
| --- | --- | --- | --- | --- | --- |
| Internal open job, direct apply disabled → visit settings | Visit panel can open subject to settings | NEW visit entry, 15/15 focused tests (combined) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Saved internal job → visit navigation + session gate | Visit availability independent from apply | Saved card + pinned route gate rewired | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| External/closed/expired/malformed posting | No internal visit panel; no false actionable flow | helper fail-closed | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Bookable settings → calendar → canonical request/reload | Web panel via RPC | Existing visits flow preserved, not retested in this delta | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Japanese text, touch target, keyboard, small phones, dynamic font, screenshots | Web source available, deployed screen not captured | JSX patched, no native render | NOT VERIFIED | NOT VERIFIED | n/a |

**Next**: finish full Expo dependency-backed typecheck and existing Native wiring contract; Android/iOS real render versus approved Web in same synthetic state, then canonical authenticated visit settings/readback and search→detail→saved→apply→message flow. Signing/distribution access and installable exact-SHA builds remain unverified. READY_FOR_MASA_ACCEPTANCE is **not** reached. No Store publication approval.
