# Android startup / launcher incident: Build 4 correction

## Observed APK evidence

The user supplied EAS Build `baad8a85-7ca9-4b47-94d8-7cbdaec216ac`.
EAS reports **preview, version 0.1.0, versionCode 2**, commit
`346626e0ceb8b2d559d49ed1e81eb21e16efd4db`, completed 2026-10-07.
It is not the PR #60 / versionCode 3 main
`819719ea7e7b0c6f7e7bdc0df9ecca293d6b7a0f`.

The downloaded APK's binary AndroidManifest independently confirms package
`jp.hoikucolor.jobseeker`, versionCode 2. Its icon resource resolves through
resources.arsc to five density WebP resources; the extracted launcher image is
the generic Android robot. That commit has neither `icon` nor `adaptiveIcon`.
The icon defect is an APK built before the branding config was introduced.

The APK's embedded Hermes bundle has no `clerk-load-timeout` or canonical Clerk
config endpoint string. Its commit's Root Layout waits on Clerk/session hydration
without any timer or error/retry branch. This directly explains why the 10-second
timeout in later main could not appear on this APK. The APK contains a live Clerk
publishable key for `clerk.hoikucolor.jp`; its SHA-256 prefix `1f2ab53c8e76` matches
the canonical Web config endpoint. No key-instance mismatch was found.

The network/SDK/device condition that originally prevented Clerk hydration is
not yet established: no device was attached to ADB and no runtime logcat was
provided. Do not claim that a wrong key, SDK incompatibility or SecureStore fault
caused that initial condition. Build 4 bounds the wait even when hydration fails.

## Changes and boundaries

- VersionCode 4; dedicated opaque launcher and transparent adaptive 1024px assets
  derived from the canonical Web clover, inside the 66/108 safe circle.
- Root deadline of 17 seconds outside Clerk, cache reconciliation and Suspense;
  inner hydration/inactive-session deadline of 10 seconds. Both fail closed with
  explanatory Japanese UI and retry. Provider render errors have a safe boundary.
- Retry calls Expo `reloadAppAsync` to restart JS and Clerk's module-level singleton,
  rather than remounting the same instance/load promise. Token cache is preserved.
- Canonical remote/static Clerk instance mismatch fails closed; safe fixed logs
  identify config/provider/cache/session/private-runtime/release-gate stages.
- Signed-out routes mount no private runtime. Signed-in runtime still requires the
  exact active session and preserves freshness → release → lock → deletion → push.
- Collapsed QA provenance on Preview/development auth/status screens: installed
  app version/build, contract, profile, commit, EAS build ID and project ID.
  expo-updates is not installed, so the identity explicitly says embedded bundle.
  Production hides QA UI. EAS requires committed sources; its post-install check
  records resolved identity, and CI uploads the same provenance artifact.
- Web login/signup were read live and compared. Native auth wording, email/Google
  handlers, OTP/resend/change-email and brand stay aligned. Inputs are ≥16px;
  actionable controls are ≥48px and the content scrolls on narrow screens.

## Validation

Real Native SDK TypeScript, stub TypeScript, startup executable fake-clock tests,
Clerk config tests and AuthScreen event-handler tests pass. All 16 materialized
Native contracts pass. The historical inventory contains 71 absent files; they
remain explicitly UNMATERIALIZED, and the strict inventory command still fails
on their absence. No existing safety assertion was removed or weakened.

Expo resolved public config, clean Android prebuild, launcher/round manifest
references, adaptive XML/background and all five mipmap densities pass. Asset
and generated resource pixel checks require Hoiku Color pink; foreground pixels
must stay in the adaptive safe circle. Local Android export passes. Web build
and all 35 mobile/desktop Web E2E tests pass. CI additionally compiles the release
APK for arm64 and runs every materialized Native contract.

## Next Preview / device acceptance

From clean merged main's `native/`:

```powershell
npx eas-cli build --platform android --profile preview --clear-cache
```

Use EAS preview environment (canonical live Clerk key, canonical Supabase URL and
publishable key, client contract 1 were found configured). Check the resulting
EAS build commit and QA identity against merged main. Do not reinstall the
supplied versionCode 2 APK. No Store release or Production Release State changes.

Only allow Android Build 4 in the prelaunch allowlist after Green CI; keep older
builds blocked. This patch does not change the live allowlist or deploy database
changes. An authenticated Build 4 must still pass the backend release gate.

1. Launcher, recent-apps and app-info show the clover; QA says versionCode 4 and
   the expected merge SHA / EAS Build ID.
2. Fresh signed-out install reaches login on working network; email OTP and
   Google cancellation/success behave as Web.
3. Start offline / block Clerk: a reason and retry appear within the bounded wait;
   reconnect and retry starts a fresh boot and reaches login.
4. Restore a valid session, expired session and interrupted hydration; only a
   confirmed active session can enter the private release/lock/deletion/push gates.
5. Capture `adb logcat` filtered for `HC_` and `ReactNativeJS` to identify the first
   missing boot stage. Do not share full SDK dumps containing tokens/user data.

These physical-device checks remain acceptance items, not completed evidence.
