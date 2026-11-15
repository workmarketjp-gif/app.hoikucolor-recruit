# r264 — Career save/delete single-flight across rapid taps and session replacement

**State:** IMPLEMENTING. **Checked:** 2026-11-15 (NZ). **Owner:** COLOR Jobseeker Native UI/adapters/regressions only.

## Versioned Web and Native reference

- Web JOBSEEKER authenticated synthetic candidate, `/` CareerCompanion and `/career` CareerView, main `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`. Web source refs `src/views/CareerCompanion.tsx` blob `65a1e1fee3052dba21a9d61de00938e2ef2292c9`, `src/views/CareerView.tsx` blob `ed5eac2c1777af12205f1518b747556ea2bb41b2`. No deployed Web SHA or same-state browser screenshot was verified.
- Native base HEAD `b4d56e8eecb777e3f884f24c6759a7150e6ea385` on `native/color-jobseeker-integration-r216-20261114`. No AGENTS.md in recursive repo tree; latest HQ #265/#467 read. Open PR list was empty at preflight. One writer in this run; no overlap with Staff, Family, shared backend, SEO or Web ownership.
- Gap: `CareerExperience` used asynchronous React `busy` state alone to prevent simultaneous salary save, conditions save and conditions delete. Two immediate taps before the next render could start duplicate owner-private RPC writes. The previously added ambiguous-write recovery gate does not itself stop this pre-RPC race.
- Fix: one synchronous owner+session-keyed lease shared by all three mutation handlers. Acquire before any awaited token/RPC; reject a second same-session mutation while a lease is outstanding. Release in `finally` even on failure or cancelled token preflight. Late completion for a replaced account/session cannot release the new session's flight. Each handler also verifies `pinned.isCurrent()` immediately before its RPC. Existing canonical save/readback, uncertainty quarantine, error privacy and Web-approved form/UI behavior remain unchanged.
- Paths: `native/src/lib/careerWriteFlight.ts`, `native/src/components/CareerExperience.tsx`, `native/qa/native-career-write-single-flight-r264.test.mjs`, `native/package.json`. No schema/RPC/Auth/Storage/Worker change.

## Tests and platform evidence

- Linux Node 22.16.0: `node --experimental-strip-types --test qa/native-career-write-single-flight-r264.test.mjs qa/native-career-mutation-recovery-r263.test.mjs` **11/11 PASS** on local materialized helper/test exactly matching GitHub blob SHA, plus prior r263 helper/test preserved from the same base SHA evidence.
- TypeScript 5.8.3: `tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck src/lib/careerWriteFlight.ts` **PASS**. This is an isolated helper check, **not** an Expo project typecheck.
- GitHub post-write checks: helper blob `8ec779cc271fb435d4a223f40c79e702b8449277`, test blob `f2bf1b97d8e91e08a10a4e1c22b4e1f6b7ab2e0e` equal local `git hash-object`. Native screen has **three** synchronous acquisitions, **three** matched `finally` releases, and **three** immediate pinned-current pre-RPC checks. These are supplementary wiring assertions, **not** mounted UI/runtime evidence.
- **Android:** IMPLEMENTING, source-only. No Android SDK/emulator, tested installed candidate, UI screenshots, live canonical API save/re-read, or signed APK in this environment.
- **iOS:** IMPLEMENTING, source-only. Linux has no macOS/Xcode/Simulator, TestFlight/ad-hoc signing/distribution credentials unverified, no mounted UI/API QA or installable build.
- Android/iOS same-state Web-vs-Native rendered comparison, text scale/keyboard/safe-area/error states, and actual canonical save/readback **NOT VERIFIED**; physical acceptance **NOT DONE**.
- Push gating: repository `.github/workflows/ci.yml` triggers on main push or pull_request; no open PR when checked. Connected Cloudflare accounts listed **zero Pages projects**; prior r263 worker trigger check reported zero, not re-proved in this step. No auto-merge, paid Actions/EAS/agents, DB/RLS/Production or real candidate writes. Usage quota still unverified.

## Next

Verify all three mutations in a mounted Android/iOS native runtime with rapid double taps, session change, intentionally interrupted network and owner-scoped canonical readback against the same synthetic Web candidate. Then resume the next incomplete Web app UI/behavior parity gap. Do not classify r264 as DEVELOPER_VERIFIED or READY_FOR_MASA_ACCEPTANCE on source-only evidence.
