# Phase 3 — Runtime QA and device acceptance preparation

Branch `native/color-jobseeker-consolidation-20261107`. Nothing in this document was executed on a device. No build was started, no credential was created or printed, no store submission was made.

## 1. Build cost: what the official Expo pages say (read 2026-11-07)

Sources: expo.dev/pricing; docs.expo.dev/build/introduction, build-reference/apk, build/internal-distribution, app-signing/app-credentials, build-reference/simulators (docs pages dated 2 Nov 2026). The pricing page now calls the service "Expo Build"; the CLI and `eas.json` keep the `eas` names.

| Item | Official statement |
|---|---|
| Free plan allowance | "15 Android and 15 iOS builds" (per platform; the page gives no monthly reset wording) |
| Free plan queue | Low priority; "wait times of 90+ minutes" at peak; 45-minute build timeout; up to 1 concurrent macOS build |
| Paid | Starter $19/month, Production $199/month, plus usage; usage rates Android $1 (medium) / $2 (large), iOS $2 / $4 per build |
| Android APK | Default output is an AAB. An installable APK needs `android.buildType: "apk"` (and/or `distribution: "internal"`) |
| Android signing | With internal distribution Expo "will generate a new Android keystore" or reuse one; no user-supplied keystore is required |
| Local Android SDK | Cloud builds run on Expo's Linux runners; no page says a local SDK is required. `adb` is only needed for `adb install` (the APK can be installed from a URL on the phone) |
| iOS physical device | Ad hoc provisioning: "requires a paid Apple Developer account", at most 100 devices per year; devices are registered by UDID (`eas device:create`); new devices can take 24-72 h to become installable |
| iOS Simulator | A simulator build "without ... an Apple Developer account", but it only runs on a Mac with Xcode |

### Feasibility for this project
- **Android development/acceptance APK within the Free quota: feasible by the published numbers** (1 build of 15). No local Android SDK or JDK is needed for a cloud build. Cost: $0, but the low-priority queue can delay it by 90+ minutes.
- **iOS device build is not free in practice**: it needs the paid Apple Developer Program membership and registered device UDIDs, even though the EAS build itself would consume 1 of the 15 free iOS builds.
- **Not verified (user-only):** the remaining quota on this Expo account, and which Expo account owns the project (needs `eas login`; `eas-cli` is not installed here and I did not log in).

### Existing project facts (from `app.json` / `eas.json`, no secrets)
- Expo project id in `app.json` `extra.eas.projectId`: `507c2498-2098-4e4c-9699-75c494f00c47` (association with an Expo account/owner NOT verified).
- Identifiers: Android package and iOS bundle id `jp.hoikucolor.jobseeker`; Android `versionCode` 4; iOS `buildNumber` 1; version 0.1.0; scheme `hoikucolor`.
- Profiles: `development` (dev client, internal, Android APK, iOS device), `preview` (internal, Android APK; iOS defaults to ad hoc), `production` (store). `cli.requireCommit: true`, so a build uses the committed Git state; the branch is already pushed.
- Recommended Android profile for acceptance QA: **`preview`** (a standalone APK that does not need a Metro server). `development` is only for debugging.
- Required build-time variables (names only; values come from the owner and must be set as EAS environment variables, not committed): `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` or the Supabase pair `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the app fetches the Clerk key from an edge function), `EXPO_PUBLIC_CLIENT_CONTRACT_VERSION` (required; the release identity throws without it), Google sign-in client ids if Google sign-in is to be tested, and the privacy/terms/deletion/support URLs (must be HTTPS for the store gate). `EXPO_PUBLIC_*` values are embedded in the app and are public by design.
- Open question for the owner: the app config uses a Clerk publishable key; confirm whether the QA build should point at the Clerk **test** instance and a **non-production** Supabase project, so that synthetic candidates never touch production data.

### Exact user-only actions to get an Android APK at $0
1. `npm i -g eas-cli`, then `eas login` with the Expo account that owns project `507c2498-...`; run `eas project:info` to confirm the owner and `eas build:list` / the dashboard to confirm remaining free builds.
2. Set the EAS environment variables listed above for the `preview` environment (or tell me which values may be put in a local, untracked `.env`).
3. Authorize one build: `eas build --platform android --profile preview` (1 of 15 free builds). I will not start it without your approval.
4. Install the APK on a phone with USB debugging or by opening the build URL; or provide an emulator-capable PC (see section 2).

## 2. Android runtime QA plan (NOT EXECUTED)

Local runtime is blocked on this PC (no JDK 17, no SDK components, no emulator, no device, ~7.7 GB free). The cheapest unblock is a physical Android phone plus the free cloud APK above.

Evidence to record for every run: device model, Android version, APK build id (`extra.buildProvenance.easBuildId` is shown by the in-app diagnostics), tested Git SHA, date, tester, synthetic account ids, screenshot file names. Screenshots may only show synthetic data. Never apply to a real job, never message a real facility; use a QA job/facility seeded in the non-production project.

| ID | Check | Pass criterion |
|---|---|---|
| A1 | Cold start signed-out | Sign-in screen, no private runtime mounted, no crash |
| A2 | Sign-up, email verification, login, logout | Login lands on home; logout returns to sign-in |
| A3 | Kill and relaunch while signed in | Session restores; brief status screen, no private data flash |
| A4 | Background > 1 min, return | Token refresh; offline shows OFFLINE, not sign-out |
| A5 | Revoke the session from another device | Next foreground fails closed, then signs out |
| A6 | Job search, filters, pagination, detail | Results equal Web for the same filters; evidence badges correct |
| A7 | Favorite, kill app, reopen | Favorite persists from canonical readback |
| A8 | Compare 3 jobs; 4th is refused | Message "比較できる求人は3件までです。" |
| A9 | Resume: edit every step, wait for autosave, kill, reopen | Values equal the canonical record; same values appear on Web |
| A10 | Pick a landscape, a portrait and an EXIF-rotated photo | Result is a 3:4 crop; orientation correct; output is 600x800 JPEG; GPS removed (inspect the exported bytes) |
| A11 | Pick a transparent PNG | Rejected with the message (see decision D1) |
| A12 | Create resume PDF and career-history PDF | A4 portrait; Japanese glyphs correct (no tofu); photo in the 30x40 mm box; page breaks sane; compare against Web PDF |
| A13 | Register PDFs in the vault | Appear in the vault list after canonical reread; default flag correct; temp PDF removed from the app cache |
| A14 | Apply to the QA job with selected documents; tap submit twice quickly | One application only; documents attached |
| A15 | Airplane mode during submit | Clear error; retry does not duplicate (same request) |
| A16 | Application detail, messages: send and reply with the QA facility account | Message appears after canonical readback; unread counts correct |
| A17 | Interview respond, offer accept, withdraw, visit request/cancel on QA data | Each reflects the canonical state after reload |
| A18 | Push permission deny / allow / later enable in settings | Banner states correct; token registered only when allowed |
| A19 | Notification tap and `hoikucolor://` deep link | Opens the exact application/interview/scout; wrong-account link opens nothing private |
| A20 | App Lock on/off, biometric fail, background lock | Content hidden until unlocked; no private text in recents |
| A21 | Screenshot attempt on profile, resume, application screens | Blocked (FLAG_SECURE); allowed on jobs list/compare |
| A22 | Logout, then login as a second account | No data, photo, documents, drafts, saved jobs from the first account; picker cache and photo cache gone |
| A23 | Account deletion request / cancel | Business UI blocked while requested; cancel works only when requested |
| A24 | Large font, small screen (360 dp), keyboard over fields | No clipped or unreachable controls |

## 3. iOS readiness and separate checklist (NOT EXECUTED; never inferred from Android)

Requirements, per the official pages and the project config:
- Apple Developer Program membership (paid) for any physical-device build; the team must be linked to EAS (`eas credentials`) by the account holder. Distribution certificate, ad hoc provisioning profile and push key are generated and stored by Expo; I will not create or handle them.
- Register each test iPhone's UDID (`eas device:create`); allow up to 24-72 h for new devices.
- Bundle id `jp.hoikucolor.jobseeker` must be registered under that team with the capabilities the app declares: Sign in with Apple (`usesAppleSignIn`), push notifications, Face ID usage string (present in config).
- Sign in with Apple, Google sign-in URL scheme and the Clerk native apps must be configured for iOS in the Clerk dashboard (owner action).
- No Mac is available; the iOS Simulator route would need a Mac with Xcode.
- The `preview` profile already yields an ad hoc internal build for iOS (no `ios` key). No `eas.json` change was necessary, so none was made.

iOS acceptance checklist (run every item independently on iOS; copy the Android IDs A1-A24 and additionally check):

| ID | iOS-specific check | Pass criterion |
|---|---|---|
| I1 | Sign in with Apple, Google, email | Each completes and restores after relaunch |
| I2 | Face ID prompt text and fallback to passcode | Japanese usage text shown; lock works |
| I3 | Photos picker with HEIC and Live Photo | Exported as 600x800 JPEG, correct orientation |
| I4 | expo-print A4 output | Page size exactly A4; Hiragino renders Japanese; photo box correct |
| I5 | Push permission states including provisional | Registration and badge rules as designed |
| I6 | App switcher snapshot | Private screens hidden |
| I7 | Screenshot behaviour on private screens | Document actual iOS behaviour (it cannot block screenshots the way Android does); product decision D2 |
| I8 | Universal/custom-scheme deep link from cold start | Opens the exact target |
| I9 | Low Power Mode, background refresh off | Foreground refresh still correct |

## 4. Web parity: what can and cannot be concluded now
Source comparison (previous phase): tabs, secondary destinations and the photo specification were compared. No same-state screenshots exist for Web or Native, so no visual parity claim is made. The two photo gaps found earlier were closed in source (600x800 JPEG q0.88, 3:4 crop); the white-background gap was replaced by a rejection (D1).

## 5. Decisions needed from the owner
- **D1 Transparent PNG:** keep rejecting (current), or add a pixel-level step so a transparent PNG is flattened onto white like the Web. Rejecting avoids black backgrounds but also rejects opaque PNGs saved with an alpha channel.
- **D2 Screenshots:** job detail currently blocks screenshots because it embeds private documents, while the product spec says public discovery stays shareable. Choose: keep blocked, or split public job content from the private apply panel. iOS cannot technically block screenshots; confirm the intended iOS behaviour (hide in app switcher only).
- **D3 External career link:** the career screen opens one https statistics source link in the browser. Keep it (current) or show the source inside the app.
- **D4 QA backend:** which non-production Clerk instance and Supabase project the QA build should use, and the synthetic accounts and QA facility account to test messages and interviews safely.

---

## 6. Decisions finalised (owner, 2026-11-08) and what changed in source

| ID | Decision | Implementation |
|---|---|---|
| D1 | Match Web: transparent PNG is flattened onto white; output 600x800 JPEG q0.88; EXIF removed | `src/lib/pngFlattenOnWhite.ts` (pure JS, `fflate@0.8.2` added as an exact-pinned dependency). A PNG with alpha is oriented as PNG, cropped 3:4 and resized to 600x800 as PNG, flattened onto white in JS, written to the app-private cache and encoded ONCE to JPEG at 0.88. The earlier rejection of transparent PNGs is removed. 8 new tests decode the real output bytes with Node's own zlib (independent of fflate): transparent -> 255,255,255, opaque unchanged, half-alpha blends, all five PNG filters, grey+alpha / tRNS / palette / 4-bit / 16-bit, CRC validation. Five guards mutation-checked. |
| D2 | Public discovery and comparison stay shareable; private content protected | `usePrivateScreenCapture(key, active)`; job detail blocks capture only while the private documents chooser (`ApplyDocumentsPanel`) is mounted. Job list and compare never block capture. Application, messages, profile, resume, scouts, visits, notifications, career, home keep blocking. iOS cannot prevent screenshots the way Android can: iOS protection is the app-switcher privacy shield and App Lock; the actual iOS behaviour of `preventScreenCaptureAsync` must be recorded on a device (I7). |
| D3 | Keep the external browser link | No change. |
| D4 | Dedicated non-production Clerk and Supabase with synthetic accounts | NOT SATISFIED YET, see section 7. |

Plan items changed by D1/D2: **A11** now reads "pick a transparent PNG: the exported photo has a white background (no black/transparent area), is 600x800 JPEG"; **A21** now reads "job detail is capturable until 'この求人に応募する' opens the documents chooser, which blocks capture; the jobs list and compare screens are always capturable".

## 7. Build prerequisite status (2026-11-08)

| Prerequisite | Status | Evidence |
|---|---|---|
| GitHub HEAD matches local | OK | `origin/native/color-jobseeker-consolidation-20261107` = `bb8ae36` at start of this step |
| EAS project ownership | OK | `eas project:info`: `@workmarketjp/hoiku-color`, id `507c2498-2098-4e4c-9699-75c494f00c47` (matches `app.json`); logged-in accounts `workmarket` and `workmarketjp`, role Owner |
| Free build quota | OK (by history) | `eas build:list`: 5 Android builds in total, 0 created in 2026-11; one more is inside the Free "15 Android builds". The CLI does not report remaining quota; the Expo dashboard billing page is the authoritative check |
| Dedicated non-production Clerk | EXISTS, not wired | The Clerk application "Hoiku Color" has a `development` instance (`pk_test_...`) separate from its `production` instance. The EAS `preview` environment currently holds a different value set |
| Dedicated non-production Supabase | NOT CONFIRMED | `preview` currently points at project `kcmmpj...` = "Hoiku Poppy AI" (the main project). The only other active project, `hoiku-poppy-finance330-restore-qa`, has the `hc_*` schema but also contains rows (1 profile, 1 application, 9 messages, 2 documents, 9 jobs); I did not read them and cannot tell whether they are real or synthetic, and I cannot tell whether that project trusts the Clerk development instance |
| QA variables in a separate EAS environment | NOT DONE | Creating a `qa` environment needs the confirmed Supabase URL and publishable key; the build must not use the `preview` values |
| Android physical device | NOT AVAILABLE | `adb devices` lists none |
| Regression after source changes | see section 8 | |

The build is therefore NOT started.

## 8. Regression after the D1/D2 source changes (HEAD before commit: `bb8ae36`)
- `npm run typecheck`: 0 errors
- `npm run test:behavioural`: 515 of 515 pass (was 503; +8 PNG flatten, +4 transparent-PNG export tests)
- `npm run test:contracts:available`: 17 pass, 0 fail (the screen-privacy contract now has 15 checks)
- Device behaviour of the new code (manipulator PNG output, alpha handling by the real image module, file write to cache): NOT RUN, no device.
