# Color Native r394 — application → visits safe navigation

## Web baseline and scope
- Reference: JOBSEEKER Web `src/App.tsx`, main commit `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, `/applications` ApplicationsView lines ~580–600: `<a href="/visits">見学・体験の予定を見る</a>` is available even while the independent application index has an error or has not loaded. `src/components/CandidateShell.tsx` keeps mobile tabs `ホーム / 求人を探す / お給料 / 気になる / マイページ`, with applications/messages secondary. Source examined 2026-11-21 NZ, role: signed-in jobseeker; synthetic state: candidate A, pending Clerk pin, then logout/App Lock/account B; no deployed or rendered Web screenshot.
- Native starting point: r393 SHA `971ee800594ac34d0f4bf640a155d7b3eba466e1`. Route `native/src/app/(tabs)/applications.tsx`; existing direct `router.push('/visits')` could be invoked after a stale tap and compete with a concurrently pinned application-detail navigation. It never independently checked that the exact candidate/Clerk session was current at launch.
- This is navigation only, not a backend mutation, independent Scout/Family/Staff feature or a replacement for server RLS.

## r394 implementation
- Replaced the direct visits route push with `createApplicationSecondaryRouteGate`, a ref-backed synchronous single-flight and generation guard. A bounded `pinCandidateForRead` must return the same candidate/session before the destination is pushed; a late pin after focus loss, App Lock, sign-out or account switch cannot push the route. A successful push holds the gate until blur; failed pins and router errors allow deliberate retry.
- Visits remains accessible without waiting for the application index, matching the Web. Application detail taps, manual list reads and visits navigation do not race; the UI shows `見学・体験の予定を開いています…` and an actual failure message without inventing a completed visit.
- Both destinations still do their own canonical authorization. Existing application index refresh/readback, visit booking/cancellation and messages unchanged.

## Real source tests, boundary and matrix

| Web screen/action | Web ref | Android source | iOS source | Developer runtime/render | Canonical persistence |
|---|---|---|---|---|---|
| `/applications` → `/visits`, tap, pending token, blur, App Lock, A→B, duplicate tap and failure retry | `src/App.tsx` @ `8c502fdb`; source examined 2026-11-21 NZ | `(tabs)/applications.tsx` and `applicationSecondaryRouteGate.ts`; IMPLEMENTING | Shared Expo implementation; IMPLEMENTING | Both NOT VERIFIED; no Android emulator or iOS Simulator | Navigation only; visits destination/RLS and synthetic account E2E NOT VERIFIED |

- Executed in isolated Linux Node v22.16.0: `node --experimental-strip-types --test qa/native-application-secondary-route-r394.test.mjs` **8/8 PASS**; local test blob SHA `b2323035ea90e8a7d2ae0ad99feff5fbc656b7f0` and helper blob SHA `546a8b615135e1c051fe04197ec692e5868b1d4d` checked against the GitHub branch.
- `tsc --noEmit --strict --skipLibCheck --target es2022 --module nodenext --moduleResolution nodenext --allowImportingTsExtensions src/lib/applicationSecondaryRouteGate.ts`: **PASS (helper only)**.
- GitHub real screen wiring inspected: direct `onPress={() => router.push('/visits')}` removed, new `pinCandidateForRead` and gate wired, concurrent details and refresh excluded, focus cleanup invalidates pending lease, and display label/accessible error are present. This is static source inspection, **not** a real Native build or Web/mobile rendered comparison.
- Full Expo dependencies/typecheck, actual Clerk/Supabase QA login and readback, Android APK, iOS signed TestFlight/ad-hoc/internal route, keyboard/layout/accessibility and physical-device acceptance are NOT VERIFIED. Existing signing rights, EAS quota and Actions billable quota remain unknown.

## Integration and next steps
Single writer: `workmarketjp-gif/app.hoikucolor-recruit`, branch `native/color-application-visits-navigation-lease-r394-20261121`, starting at exact r393 SHA above. Source changes are restricted to Native candidate application-list navigation, one dedicated helper/regression and this ledger. No main edit, no PR, no paid Actions/EAS, no Production DB/RLS/API/Worker, no real applications/messages/visits, no Store publication. GitHub `.github/workflows/ci.yml` runs on PR or main push; neither is triggered by an ordinary isolated branch update. Cloudflare Production release not authorized.
Next most consequential independent step: canonical synthetic candidate search→saved→apply→application→message round-trip and real Android/iOS paired Web screenshots when authorized compatible runners and safe credentials are available. Maintain separate developer verification for both platforms.
