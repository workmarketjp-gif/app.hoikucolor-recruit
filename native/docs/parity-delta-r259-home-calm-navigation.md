# r259 — Web Home calm zero-pending parity

**State:** IMPLEMENTING (source-tested, NOT Native-render-verified). 2026-11-15 NZ. Dedicated COLOR jobseeker owner.

**Exact reference:** `src/App.tsx` / `HomeView` on Web main `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`; authenticated synthetic candidate, no active applications, no unread messages/pending interviews/scouts. Web hides the attention card only on BOTH successful reads and shows accessible `応募管理` / `メッセージ` links *after* `CareerCompanion`. Unknown/error/loading retains the attention section and does not represent zero.

**Native change:** `native/src/lib/homeCalmNavigation.ts` makes both-source verified zero explicit. `native/src/app/(tabs)/home.tsx` hides the busy attention card only under that predicate, restores both navigation actions after `CareerExperience`, and moves the existing generic job-search shortcut card after featured jobs to align the Web content order WITHOUT removing existing native destinations. The notifications header bell remains available in calm state. All reads continue through existing session-owner-pinned hooks/notification context; no mutation/API privilege change. No new paid dependencies.

**QA this change:** Node 22.16.0, `node --experimental-strip-types --test native/qa/native-home-attention-web-parity-r257.test.mjs native/qa/native-home-application-progress-r258.test.mjs native/qa/native-home-calm-navigation-r259.test.mjs` -> **16/16 PASS** against real-source helpers; `tsc --noEmit --strict --target es2022 --module esnext --skipLibCheck native/src/lib/homeCalmNavigation.ts native/src/lib/homeApplicationProgressCount.ts` -> PASS. Expo project's `npm run typecheck` not run: SDK/locked dependencies unavailable. This is NOT evidence of Android/iOS Native rendering.

| Workflow | Android | iOS |
| --- | --- | --- |
| Home confirmed zero → calm links → applications/messages | IMPLEMENTING: source/helper tests only | IMPLEMENTING: shared source/helper tests only |
| Pending/unknown/error and account-switch privacy | IMPLEMENTING: source/state tests; runtime readback unverified | IMPLEMENTING: source/state tests; runtime readback unverified |
| Visual match at small/standard width, long Japanese text, accessibility scaling | NOT VERIFIED: Android SDK/emulator absent | NOT VERIFIED: macOS/Xcode/simulator absent |
| Signed installable handoff | BLOCKED_EXTERNAL: Android runner/signing | BLOCKED_EXTERNAL: signing/TestFlight or approved ad-hoc distribution |

**Next:** real Expo typecheck once locked dependencies available; current synthetic-state Web vs installed Android/iOS screenshots and canonical save→readback→Web comparison; continue other in-scope gaps independently. No real candidate data, production DB/auth/Worker, main, merge, paid CI/build, or Store action. Trigger note: `.github/workflows/ci.yml` runs on main push/PR, not this non-PR development branch; Cloudflare Git configuration and account quotas not reverified; do not claim no build without querying actual Cloudflare.
