# COLOR Native r370 — Safe signed-out deep-link return through active-session entry

**2026-11-20 NZ | IMPLEMENTING | Source-verified only; Android/iOS runtime NOT_VERIFIED**

## Owner, baseline, version
- Sole COLOR JOBSEEKER ChatGPT writer on `workmarketjp-gif/app.hoikucolor-recruit`, development branch `native/color-vault-web-default-r341-20261119`. Base HEAD `b206d2a099bf2597fa848326ca208b89d67b0bdf`; no PR open on preflight. Main/Web reference `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, candidate routes `/spot`, `/applications`, `/messages`, private candidate detail, checked 2026-11-20 NZ. The cold-link behavior in the deployed Web was not tested; this closes a Native auth/route failure, not proof of exact rendered parity.
- HQ #265 MINIMUM_COST_V1 and #467 apply. No root/native AGENTS.md found. Synthetic state: an unauthenticated cold or warm link to an application-owned UUID; no real candidate identity or data.

## Fixed Native source gap
r369 introduced fail-closed `Stack.Protected` for private routes. A signed-out cold/warm private link was correctly prevented from mounting, but the original intended destination was lost at sign-in; email, new-account and Google success navigated straight to Home. The app now:
1. Captures the initial `hoikucolor://` URL once before Clerk's protected redirect, and captures new links only while the signed-out auth boundary is active.
2. Restricts the return target to materialized candidate routes and well-formed IDs. Preserves only bounded, validated query fields required for notification/application interview/visit/scout/spot context. External hosts, unknown routes, path escaping, bad or duplicate query keys cannot become navigation targets.
3. Discards the cold target when the app was **initially signed in**, prevents stale cold captures overriding a later warm link, and consumes the target at most once. No SecureStore or persisted return URL; the OS initial-URL call is bounded to 800 ms.
4. Sends completed email, sign-up and Google auth, plus the signed-in auth group, through `/`. The entry screen waits for a matching `active` Clerk session ID before redirecting to the one-shot target or Home. Protected screen, pinned candidate identity, and server RLS remain authoritative.
5. Updates existing root/CA-01 contracts to assert **stronger** guarded routing instead of obsolete unguarded pre-r369 Home navigation.

## Changed paths
- `native/src/lib/authInitialLinkReturn.ts` — in-memory link intent, whitelist and concurrency/timeout.
- `native/qa/native-auth-initial-link-return-r370.test.mjs` — dedicated behavioral regression.
- `native/src/app/_layout.tsx` — initial URL and warm-listener capture, initial auth state, existing private guard unchanged.
- `native/src/app/index.tsx` — exact-session post-auth destination resolution.
- `native/src/app/(auth)/_layout.tsx` — sign-in redirect via entry.
- `native/src/components/AuthScreen.tsx` — existing/new/Google success via entry without changing Clerk authorization.
- `native/qa/native-root-runtime-contract.mjs`, `native/qa/native-ca01-shell-contract.mjs` — route safety assertions adjusted to actual protected routing; other contracts left intact.

## Actual scoped validation
- Local Node 22.16.0: `node --experimental-strip-types --test native/qa/native-auth-initial-link-return-r370.test.mjs` **8/8 PASS**, including safe UUID routes, notification focus query, invalid/external routes, one-shot consumption, warm/cold races, initially signed-in suppression and bounded nonresolving URL.
- Local TypeScript 5.8.3: `tsc --noEmit --strict --skipLibCheck --target es2022 native/src/lib/authInitialLinkReturn.ts` **PASS**. This is only the pure helper, not Expo/React typecheck.
- Connected GitHub: helper/test blob SHAs matched the exact local files; screen-source links and exact post-write blobs independently read. Source-level wiring assertions passed (not React/Native execution).
- Full Expo `npm run typecheck`, actual root/CA-01/Clerk harness execution, Android and iOS render, cold/warm OS link handling and synthetic canonical application/message readback are **NOT VERIFIED**. Git HTTPS cannot resolve github.com from the isolated Linux runtime. No Android SDK/adb/emulator or macOS/Xcode/simulator there; signing, TestFlight/internal distribution credentials and valid build IDs have not been verified.
- No private user data, real applications, messages, push operations, database/schema/RLS/auth service writes or release operations.

## Cost/release and next
- `.github/workflows/ci.yml`: GitHub push CI only on main and PR CI on pull requests. Working branch push alone does not match these CI triggers. Workmarket Cloudflare worker `app-hoikucolor-recruit` build triggers read back as `[]`. No PR, main merge, new paid Actions/EAS, Cloudflare production deployment or Store submission requested.
- Actual billing/remaining quota unknown.
- Next: full Expo typecheck plus existing Root/CA-01/auth harnesses in authorized complete checkout; synthetic sign-in/email/Google and signed-out cold/warm application/interview/visit link tests, including account switch and session expiry; canonical application → messages save/readback; independent Android/iOS installed QA, screenshot parity, signed artifact and approved iOS distribution.

**Android: NOT_VERIFIED. iOS: NOT_VERIFIED. READY_FOR_MASA_ACCEPTANCE: NO.**
