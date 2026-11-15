# r261 — Native Home Web hierarchy and glyph parity

**State: IMPLEMENTING**. Inspected on 2026-11-15 NZ. **Owner:** COLOR jobseeker only; repo `workmarketjp-gif/app.hoikucolor-recruit`, branch `native/color-jobseeker-integration-r216-20261114`. Base `1e2fa8e000d63019bc704689f7ee54ace14f4432`, source commits `a1dd07d91c00eec28e1a2082fe2824fd8ef7de51` and `3348b087849e1d9edef278e4e71f0cc2246d9270`, regression commit `a86fa6e3cb0b0a72e6ea26a1b8532f1dff0d53f5`. No other task or shared file written.

## Versioned Web source of truth
- `src/App.tsx` HomeView / StatRow, and `src/components/Icon.tsx` at Web main `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`.
- Role: signed-in candidate; synthetic cases pending interviews/scouts, loading/error/success counts, and confirmed calm zero state.
- Home order: greeting; conditional urgent rows; application/message stats; career companion; conditional calm links; featured jobs. Brand and notification entry already live in the shared shell.

## Closed source differences, not Native runtime sign-off
- Removed duplicated Home logo, promotional greeting, redundant notifications shortcut/count and three non-Web marketing cards. The destinations remain functional via existing Jobs (search, matching, spot), Saved, and My Page (profile, resume, documents), confirmed in current source.
- Action rows now sit outside the generic card and use Web briefcase/chat glyphs, including calm links. Original five navigation glyphs and labels remain.
- Retained canonical count semantics, failed-read same-row retry, interview/scout/message deep routes and active application route. No new backend requests, dependency, privileges or mutation behavior.

## Verification
- Read-after-write GitHub source structure checks: **8/8 PASS**, preserving route and safe retry anchors. Git diff vs base contains only intended 2 changed source paths before regression/docs changes.
- Node v22.16.0: `node --experimental-strip-types --test qa/home-glyphs.test.mjs` **3/3 PASS** in isolated runtime, using exact GitHub blob counterparts of `candidateTabGlyphs.ts` (`c8b2c24b4d6aaf6f73863c0fb3f9793bfd8579b2`) and `homeStatRowPresentation.ts` (`e7fd92f22baff180758d2034efb4a8dfe4ed927f`). Equivalent test was committed as `native/qa/native-home-web-layout-r261.test.mjs`.
- Isolated `tsc --noEmit --strict --target es2022 --module esnext --skipLibCheck` **PASS** for two pure TS files, **not full Expo typecheck**.
- CI workflow `.github/workflows/ci.yml`: pushes to main or pull requests launch Actions. No PR/main write here. Cloudflare Pages list empty in two connected accounts; Worker triggers and paid quota not freshly confirmed. No manual CI/EAS/build/external coding agents or production changes.

| Gate | Android | iOS |
| --- | --- | --- |
| Source UI hierarchy/icons/paths | IMPLEMENTING, source checks only | IMPLEMENTING, source checks only |
| Actual Web-vs-Native render, text scaling, keyboard/empty/error | NOT VERIFIED — Android SDK/emulator unavailable | NOT VERIFIED — macOS/Xcode/simulator unavailable |
| Canonical API readback, session expiry, deeplink | NOT VERIFIED on OS | NOT VERIFIED on OS |
| Signed installable build | BLOCKED_EXTERNAL — build/signing unverified | BLOCKED_EXTERNAL — authorized signed distribution unverified |

**Next:** render Home at small/standard sizes in Android and iOS, compare with same Web synthetic state, verify full Expo TS and canonical data, then continue incomplete jobseeker paths. Do not mark READY_FOR_MASA_ACCEPTANCE. AGENTS.md root/native absent; HQ #265 MINIMUM_COST_V1 and #467 govern.
