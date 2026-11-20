# COLOR Native r381 — Scouts destination remains usable before message index resolves

## Versioned reference, ownership and cost
- Web source: JOBSEEKER `/messages`, `src/App.tsx` `MessagesView` lines 607–663, main `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c` (checked 2026-11-20 NZ). Synthetic logged-in candidate A: initial application index is loading or has failed, private access remains allowed. Web renders its independent `/scouts` link in both states; it does not grant access to unverified message threads. Deployed SHA and paired screenshots not verified.
- Parent: r380 `eb737cdda7eff72c6e9755e05f9e063bde8a9ceb`. Isolated writer branch `native/color-message-scout-during-index-read-r381-20261120`. Open PRs checked: zero. No root or native AGENTS.md. Owner: COLOR Native `messages.tsx`, `messageInboxRefreshPolicy.ts`, dedicated QA; no Web/shared/backend/Staff/Family changes. HQ #265 MINIMUM_COST_V1 and #467 retained.
- Build-trigger preflight: GitHub `.github/workflows/ci.yml` has `push: main` and `pull_request`, so this isolated branch has no configured push-to-main CI. Per r380 Cloudflare evidence, Worker Git build trigger is main-only; no PR, main merge or Production publication authorized. No paid build/agent permitted. Billing and quota unverified.

## Web-to-Native delta / matrix
| Flow/state | Web source behavior | Android shared source | Android runtime | iOS shared source | iOS runtime | Canonical access |
|---|---|---|---|---|---|---|
| `/messages` application-index initial loading → `/scouts` | Link available, independent of applications loading | Available, launches pinned candidate verification | NOT VERIFIED | Same implementation | NOT VERIFIED | Fresh Clerk/candidate pin; Scouts screen owns its read |
| `/messages` application-index first read failed → `/scouts` | Link available, independent of index error | Available without treating error as empty or authorized thread | NOT VERIFIED | Same implementation | NOT VERIFIED | Fresh session pin; no unverified messages exposed |
| Verified same-session message rows during manual refresh → Scouts | Link available | No longer disabled only because inbox refresh is loading; existing verified owner gate | NOT VERIFIED | Same | NOT VERIFIED | Destination remains separately authorized |
| Lock/logout/session switch, duplicate destination taps | Do not grant stale candidate access | Existing synchronous navigation lease, pinned session owner and focus generation retained | NOT VERIFIED | Same | NOT VERIFIED | No backend/schema/permission changes |

## Changes and developer evidence
- `native/src/app/messages.tsx`: removes only the Scout row's `loading` disablement and the unverified Scout branch's `inboxRefreshPending` prohibition; delegates initial/unverified navigation gate to the new helper. Does not relax message-thread navigation or launch messages.
- `native/src/lib/messageInboxRefreshPolicy.ts`: `canOpenScoutsWithoutVerifiedMessageIndex` guards candidate owner, private access, verified index route ownership, and both concurrent navigation flags. Scout destination still awaits `pinCandidateForRead` and checks candidate + Clerk-session + generation before `router.push('/scouts')`.
- `native/qa/native-message-scout-navigation-loading-r381.test.mjs`: positive loading/failed state, negative logout/App Lock, duplicates and verified-index routing.
- Linux Node 22.16.0 exact helper tests: `node --experimental-strip-types --test native/qa/native-message-inbox-manual-refresh-r222.test.mjs native/qa/native-message-inbox-retained-navigation-r380.test.mjs native/qa/native-message-scout-navigation-loading-r381.test.mjs` = **15/15 PASS** in isolated existing-source runtime. Pre-change new test fails on missing export. `tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler native/src/lib/messageInboxRefreshPolicy.ts` = PASS (helper only). Git blob SHA and on-branch screen wiring recheck are required before integration.
- Android: no SDK/adb/emulator available here; no real screen QA, canonical E2E, full Expo typecheck, signed APK. iOS: Linux, no Xcode/macOS/simulator, TestFlight/signing not verified. Source tests do NOT constitute Native runtime QA.

## Next and integration gate
Next: focus canonical synthetic `search → save → apply → applications → messages` save/readback and Web correspondence, plus Expo full dependency/typecheck and Android/iOS rendered comparison when authorized runners exist. No production candidate writes, real application/message/scout, paid CI/EAS or Store submission. State: `IMPLEMENTING`; not `DEVELOPER_VERIFIED` or `READY_FOR_MASA_ACCEPTANCE`.
