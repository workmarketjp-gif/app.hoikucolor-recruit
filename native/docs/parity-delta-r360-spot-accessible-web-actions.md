# COLOR Native r360 — Spot Web-brand action states and explicit read-failure recovery

**State:** IMPLEMENTING. **Date:** 2026-11-19 NZ. This closes a **Native-source UI/interaction gap**, not Android/iOS rendered parity or an acceptance candidate.

## Single writer / baseline

- Repository: `workmarketjp-gif/app.hoikucolor-recruit`; existing COLOR-only branch `native/color-vault-web-default-r341-20261119`. Starting HEAD: `f12586c9967db1b4d30db569ca82d5181bc47bdd` (r359). Verified before writing: open COLOR PRs 0; no AGENTS.md at root or under native (previous tree audit); HQ #467 and #265 minimum-cost policy preserved. No shared API/schema/Worker writes.
- Candidate Web baseline: `/spot`, `src/views/SpotJobsView.tsx` SHA `aa395794adde80d42d3b0c3c8425ee1744d7974e`, `src/styles.css` SHA `33a11df87de5a89412d6e6aa3b8725d59dda4448`, main commit `8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c`, 2026-11-19. Reference state: synthetic signed-in candidate with an open, full, or pending Spot job; initial loading or read failure. No Web screenshot or live-deployment SHA confirmation.
- Native: `native/src/app/spot-jobs.tsx`; changed blob SHA `6148399a5a5041c8c5995a14ff6bd29ceafb4328`. Dedicated structural regression: `native/qa/native-spot-state-action-web-parity-r360.test.mjs`.

## Concrete UI gaps closed in source

1. Native main Spot apply CTA was solid charcoal (`#191c20`) while approved Web CTA uses accent pink (`--accent: #fb2f52`, CSS gradient). Native now uses the exact Web pink solid fill; an OS-appropriate solid color is used rather than adding a non-approved gradient dependency.
2. Web disabled apply CTA becomes visibly dimmed (`opacity: .6`). Native previously blocked the tap but did not visually disclose disabled/full/busy/locked status. Native now dims the button, provides `accessibilityRole="button"` and `accessibilityState`, and retains the existing distinct Japanese labels.
3. On a failed initial canonical read, Native displayed an error and simultaneously told users the data was still loading. It also offered an unframed text target to retry. Failure and loading now render mutually exclusively, with `accessibilityRole="alert"` for the error and an accessible minimum-height retry button.
4. Background/card colors and border move to the Web's established `#f6f6f5` / `#e7e8eb` palette; buttons gain explicit button semantics. No navigation, RPC, authorization, application dispatch, or session logic changed.

## Evidence / gates

| Verification | Actual evidence |
| --- | --- |
| Real-source Spot helper Node tests | `node --experimental-strip-types --test` against r358/r359 **unchanged and hash-matched** sources from prior evidence ZIPs: **32/32 PASS** (2026-11-19 Linux Node 22.16.0); NOT Expo/native UI runtime |
| New r360 code assertions | **21/21 PASS** against **fresh GitHub-fetched** Native source + Web CSS/view using isolated JS assertions; verifies exact source strings/tokens and preserved dispatch. Structural only, not a Native render |
| New dedicated regression checked into branch | `native/qa/native-spot-state-action-web-parity-r360.test.mjs` created; its standalone Node invocation against a complete checkout is **NOT RUN** in this environment (GitHub clone DNS failure); do not label this as test-pass |
| Full Expo install/typecheck | NOT RUN; no complete checkout and compatible installed node_modules |
| Android SDK/emulator/render/persistence | NOT VERIFIED; SDK/emulator unavailable |
| iOS/macOS/Xcode/render/persistence | NOT VERIFIED; macOS/Xcode and authorized signed TestFlight/ad-hoc route unavailable |
| Signed Android/iOS acceptance builds | NOT AVAILABLE for either OS |

No real candidate data was read or written. No user applications/messages were sent. GitHub Actions workflow `.github/workflows/ci.yml` triggers main push / PR, **not this branch push**; Cloudflare account `Workmarket.jp@gmail.com's Account` worker `app-hoikucolor-recruit` GET build triggers returned an empty list before writes. No new Actions dispatch, EAS, PR, main merge, production publish, other Commander or Store action. Costs/quota not audited and are not asserted zero.

## Next

Run `node --experimental-strip-types --test qa/native-spot-state-action-web-parity-r360.test.mjs` from `native/` on an authorized full checkout, plus `npm ci && npm run typecheck` once the Expo toolchain is available. Compare Web /spot and real Native rendering on both OSes using identical synthetic candidate job states: disabled/full/locked, initial loading, offline/error/retry, 320/375px equivalents, Japanese wrapping, text scaling, and bottom-touch targets. Then validate canonical re-read across Web and Native. The manual/foreground refresh cadence and installed-build QA remain unverified, not declared solved.
