# r151 — Visit related-link focus/owner navigation lease

Date: 2026-11-11 NZ. Owner: COLOR JOBSEEKER Native only. Web source baseline: main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, jobseeker visit history to job/application detail, synthetic candidate with one reservation. No rendered Web capture.

## Source gap and fix
Previous Native visit-card `求人を見る` / `応募状況を見る` verified the visible reservation BEFORE awaiting Clerk session pin, then navigated without post-pin focus-generation or App Lock freshness validation. A late pin could navigate from an inactive/stale view. New `src/lib/visitRelatedNavigationLease.ts` requires unique owned reservation→exact job/application target, same owner, valid pinned session and current view both before and after pin. `src/app/visits.tsx` uses generation/fresh-view/privacy checks for both links. No backend permission change, Web edit or new feature. No actual user incident claimed.

## Evidence and remaining work
Parent `045512c08312c9cf1672a018fc4e517ad2727ebf`, branch `native/color-visit-related-navigation-lease-r151-20261111`. Local Node 22: `node --experimental-strip-types --test qa/native-visit-related-navigation-lease.test.mjs` **8/8 PASS** with source-matching helper; `tsc --strict --noEmit --target ES2022 --module ESNext --moduleResolution bundler src/lib/visitRelatedNavigationLease.ts` PASS. GitHub source wiring checks 8/8 PASS. Full locked Expo typecheck and UI/runtime QA NOT RUN. Android and iOS rendered/functional Web parity NOT VERIFIED; signed Android APK and iOS authorized TestFlight/ad-hoc NOT AVAILABLE. No PR/main/production, paid CI/EAS, or real candidate actions. Cost/quota unknown. State **IMPLEMENTING**.
