# r120 — Home one-tap direct application entry (source-stage)
Date: 2026-11-10 NZ. State: IMPLEMENTING. Owner: COLOR Native UI only.
Branch: native/color-jobseeker-submission-quarantine-20261110-r116. Base: 57d122244ee9cb8d7bce13d4e5f111c1141457f3.
Web baseline: main source src/components/JobCard.tsx and src/App.tsx, jobseeker /, authenticated synthetic open/closed/external/existing/profile-incomplete states; current main SHA must be reconciled before rendered comparison. Source reference, not deployed screenshot.

## Matrix
| Workflow | Native source | Android rendered / canonical readback | iOS rendered / canonical readback | Remaining mismatch |
| --- | --- | --- | --- | --- |
| Home featured card: open direct job → tap 応募する → select required/optional documents | Button routes to native job detail ?apply=1; pinned canonical job/profile/application/pending-receipt readback one-shot opens the SAME ApplyDocumentsPanel and guarded submit; no extra submit logic | NOT VERIFIED | NOT VERIFIED | Web picker appears inline inside JobCard; Native shows picker near the top of the job detail page, not within Home card |
| Closed, external, unknown status, existing application, uncertain submission, missing name | Auto-picker fails closed; existing application remains viewable; missing profile prompts registration. No auto-send from URL. | NOT VERIFIED | NOT VERIFIED | Web/source difference: link-navigation/OS layout remains |
| UI density, long Japanese text, safe-area/keyboard, 320–430dp and 200% scaling | Source-stage only | NOT VERIFIED | NOT VERIFIED | Real screenshot pairing required |

## Scope and cost
No shared backend/API/schema/auth/RLS change, no real applications or messages, PR, main merge, CI dispatch, EAS, Production or Store. Existing durable submission and readback reused. CI workflow runs on PR or main push, not this native branch. External Cloudflare linkage/actual billing uncertain.

Focused local source behavior: Node v22.16.0, npm v10.9.2; canPreopenHomeDocuments + real homeInlineApplyDecision and featured component wired in synthetic tests; additional JobDetail source contract awaits full checkout (unavailable via container git DNS). Full Expo/React Native dependency-backed typecheck, Android SDK/emulator, macOS/Xcode, signed installs and real API QA NOT VERIFIED.

Next: complete SDK-backed typecheck and job-detail screen tests, review Web vs both Native renders and account/session races; finish true in-card presentation if product requires exact placement without duplicating submission.
