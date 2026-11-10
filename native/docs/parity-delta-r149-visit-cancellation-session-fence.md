# r149 — Candidate visit cancellation session-fence

Date: 2026-11-11 NZ. Owner: COLOR JOBSEEKER Native only.
Source baseline: Web main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/lib/visitRepository.ts` (blob `5bc463efe69c1f403f7d0c5bddfa52a0067494fb`), authenticated synthetic jobseeker history.
Native parent: `d6b7983f10289865cd948780f6466216c6d15055` (r148), branch `native/color-visit-cancel-session-fence-r149-20261111`.

## User-visible workflow and issue
The visits screen pinned a candidate session before calling `cancelVisit`, but the adapter awaited candidate history before sending the cancellation RPC. If a logout or account switch happened during that await, the earlier preflight check no longer prevented a cancellation from being sent using the revoked action. A resolved server cancellation is not claimed to have happened; this is a source-observed race.

## Code change
- `native/src/lib/visitCancellationReadback.ts`: `cancelCandidateVisitWithLease` sequences exact owner-session checks **before read**, **after read and immediately before the RPC**, **after RPC**, and **after canonical re-read**. Existing candidate-scoped active-booking + exact cancellation identity proof remain required.
- `native/src/lib/applicationJourneyApi.ts`: adapter now requires `isCurrent` and routes the unchanged `hc_cancel_visit` RPC via this fail-closed orchestration. It does not change backend authorization or retry ambiguous mutations.
- `native/src/app/visits.tsx`: pass the pinned session's `isCurrent` capability; existing UI single-flight, owner state protection and refresh logic retained.
- `native/qa/native-visit-cancellation-session-lease.test.mjs`: synthetic behavior regressions for current session, startup revocation, in-flight pre-read handoff, nonactive booking, during-RPC revocation, post-read revocation, RPC/identity failures.

## Verified locally with exact GitHub helper/test blob SHAs
Node v22.16.0: `cd native && node --experimental-strip-types --test qa/native-visit-cancellation-readback.test.mjs qa/native-visit-cancellation-session-lease.test.mjs`: **13/13 PASS**.
`tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler src/lib/visitCancellationReadback.ts`: **PASS**, isolated helper only.
GitHub helper blob `2174cc718bb4daadfd9ac0094cae5304329be8f0`, new test blob `bb7d7caf40e00a98ee02cf508e59dd9bca599b94`; hashes match the executed files.
Full adapter, screen and dependency-backed Expo typecheck were **not executed**; static source wiring verified separately and is not counted as Native runtime.
No live appointments, applications, messages or candidate data used.

## OS-specific QA status
Android: source available, **no** emulator/device render, canonical API roundtrip or signed APK/AAB for this SHA.
iOS: source available, **no** Xcode/Simulator/device render, canonical API roundtrip or authorized TestFlight/ad-hoc build for this SHA.
Android SDK/emulator absent; iOS development runtime unavailable on Linux. Signing, permitted distribution and synthetic QA identity unconfirmed. Native project dependencies unavailable to the local container (direct GitHub DNS lookup fails). Do not count source tests as two-OS completion.

## Controls / next
The source-only branch write intentionally avoids PR/main CI and production release. Existing CI is triggered by PR and main push; no paid Actions/EAS, DB/RLS/auth/Edge/Worker changes or store submission. CI/billing allowance remains unverified.
Next: run locked Expo typecheck plus the native visit integration contract in an authorized complete checkout, then synthetic visit request → readback → cancellation → readback on both platform runtimes; compare real screens with Web. Keep status IMPLEMENTING until verified installable artifacts and all parity gates exist.
