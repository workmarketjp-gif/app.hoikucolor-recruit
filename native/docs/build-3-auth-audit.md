# Build 3 authentication audit — 2026-10-08

Production Web is the sole reference: https://app.hoikucolor.jp/login and https://app.hoikucolor.jp/signup, inspected directly at desktop and 390px mobile widths. Source: src/AppRoot.tsx and src/auth-custom.css. Web was not changed.

PR #59 fixes startup but leaves Native password-only authentication. Native now shares one screen following the Web mobile layout, official logo, labels, role badge, Google mark, email/code fields, pink primary action, account switch and nursery link. Safe areas and keyboard avoidance remain native.

Email follows Web: create with signUpIfMissing, send/verify a code, transfer a verified new account to sign-up, and finalize only completed attempts. Errors are caught, duplicate submissions suppressed, and resend/address change available. Existing MFA handling is retained.

Google uses Clerk Expo useSSO with hoikucolor://sso-callback and activates the returned session. Cancellation leaves the form usable. Auth-session/web-browser dependencies are explicit. API reference: https://clerk.com/docs/reference/expo/native-hooks/use-sso.

Validation executes actual screen handlers with mocked Clerk/browser boundaries: existing/new accounts, send/verify/finalize failure, incomplete sign-up, MFA, Google activation/cancel, resend/address change and duplicate submission. Materialized Native contracts are checked; 71 existing inventory entries have no files and cannot be counted as passed.

Android versionCode remains 3. PR #59 startup timeout, branding and icon configuration remain. No backend, release gate or Store state was changed.

## Device acceptance required after building

No ADB device was connected. Automated tests do not prove production login or native callbacks. Check launcher icon, branded startup, login screen, Google login/cancel/return, existing-account email code, new-account transfer, wrong code/retry, resend/address change, keyboard layout and authenticated home with the Preview APK.

Clerk production must permit hoikucolor://sso-callback. This external admin setting was not verified or changed; verify it with the actual APK. Browser SSO does not use the optional native Google client IDs.
