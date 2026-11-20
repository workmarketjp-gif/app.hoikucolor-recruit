# COLOR Native r386 — notification read isolation across App Lock epochs

## Baseline / ownership (2026-11-20 NZDT)
- Web JOBSEEKER notification center: `src/components/NotificationCenter.tsx` at main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`; synthetic candidate A signs in, begins list refresh, locks/unlocks and reloads. This is a **source reference**, not a deployed SHA or rendered capture.
- Native basis r385 `e1438780a7a3f964bb768db28eb4ef82d0f72585`; branch `native/color-notification-epoch-isolation-r386-20261120`. No open PR at preflight; root/native AGENTS absent. COLOR Native only, no backend or Web edits.
- HQ #265 MINIMUM_COST_V1 and shared Native issue #467 apply. main diverged from r385 (1069 ahead / 16 behind as compared), so this isolated patch is not a merge approval.

## Closed source-level gap
- r385 coalesced quiet canonical notification requests only by `ownerKey`. The same Clerk session after App Lock/unlock has the **same ownerKey but a new privacy epoch**; its first quiet read wrongly joined an obsolete in-flight request. The obsolete read is fenced from private presentation, but it could delay or fail the unlocked inbox's first canonical re-read.
- The flight slot now includes `privacyEpoch`; new epochs start a separate canonical read without waiting for stale work. Quiet reads inside the same epoch still coalesce. An obsolete completion cannot clear a newer epoch's flight. Existing re-checks in `NotificationContext` continue to protect presentation from the old request.
- No changed authorization, canonical API/RPC, notification mutation, RLS, storage, push registration, account data, notification text, or public Web.

## Web → Android / iOS delta
| Test state | Web expectation | Shared Native source | Android UI/runtime | iOS UI/runtime |
|---|---|---|---|---|
| Candidate A refresh in-flight, App Lock/unlock, quiet reload | Reopen with a fresh valid view, not an obsolete refresh | New privacy-epoch read launches independently | NOT VERIFIED | NOT VERIFIED |
| Same-session same-epoch refresh duplicates | Avoid redundant canonical calls | Same-flight coalescing retained | NOT VERIFIED | NOT VERIFIED |
| Old request resolves after new epoch read starts | Old request may not evict new work or show private data | Slot cleanup is identity-guarded; context has generation and epoch fences | NOT VERIFIED | NOT VERIFIED |
| New owner/locked private access | Do not run private canonical request | Existing `isCurrent` gate maintained | NOT VERIFIED | NOT VERIFIED |

## Evidence / release boundary
- Local Node v22.16.0 on real r385 helper materialization: **RED 2/4 failed** with old helper; **GREEN 13/13 passed** with r386 helper and unchanged r385 tests. Exact commands: `node --experimental-strip-types --test native/qa/native-notification-private-epoch-read-r386.test.mjs` (RED), then `node --experimental-strip-types --test native/qa/native-notification-private-epoch-read-r386.test.mjs native/qa/native-notification-canonical-read-flight-r385.test.mjs` (GREEN).
- `tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler native/src/lib/notificationCanonicalReadFlight.ts`: PASS, **helper only**. React Native/Expo full typecheck and actual UI/runtime/canonical Supabase readback not available here.
- GitHub `.github/workflows/ci.yml` triggers on main pushes and PRs; neither is created in this run. Cloudflare Workers Builds triggers for `app-hoikucolor-recruit` returned zero on two accessible accounts (not conclusive for all deploy paths). No paid CI/EAS, main change, production release, TestFlight, store submission or real application/message.
- Android SDK/emulator unavailable; macOS/Xcode/iOS simulator unavailable. Android signed build and authorized iOS installation/distribution, signing permissions and synthetic authenticated test access unverified.
- Status **IMPLEMENTING** on both OSes. Next: integrate bounded patch against current main with owner/CI gate, then complete Expo typecheck, actual synthetic canonical readback plus Android/iOS side-by-side Web comparison and signed acceptance builds. No `READY_FOR_MASA_ACCEPTANCE`.
