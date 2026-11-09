# Hoiku Color JOBSEEKER Native — r119 Home saved heart and salary source parity

- Status: **IMPLEMENTING**. GitHub branch: `native/color-jobseeker-submission-quarantine-20261110-r116`; base head for work `890d157b364e6395ce94fe20fc9bc5b3b7f47aa9`.
- Web source baseline: repository `main` at `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/components/JobCard.tsx` (`onToggleSaved`, salaryLabel), `src/components/CandidateShell.tsx`, authenticated jobseeker in synthetic empty/saved/unsaved/error state, inspected 2026-11-10 NZ. No deployed Web screenshot.
- Native changed: `src/components/FeaturedHomeJobs.tsx`; added `src/lib/homeFeaturedSalary.ts`, `qa/native-home-featured-favorites.test.mjs`, `qa/native-home-featured-salary.test.mjs`. No change to shared RPC, auth, RLS, production or administrative flows.

| Web workflow | Native source | Android rendered + canonical data | iOS rendered + canonical data |
| --- | --- | --- | --- |
| Featured Home job card save/remove favorite | **Implemented in branch** with owner/session-pinned `hc_jobseeker_list_saved_job_ids`, `saveJob`/`unsaveJob`, readback confirmation; no optimistic heart; disable if status ambiguous | **NOT VERIFIED** | **NOT VERIFIED** |
| Imported hourly/range salary uses structured pay unit; internal nursery note preserved | **Implemented in branch** with `homeFeaturedSalary` and Japanese unknown salary fallback | **NOT VERIFIED** | **NOT VERIFIED** |
| Home inline selectable documents → apply → canonical status/message | **OPEN**, existing Native job detail workflow still used; do not claim direct in-card parity | **NOT VERIFIED** | **NOT VERIFIED** |
| Visual parity at 320/375/390/430, 200% text, keyboard, App Lock/foreground | source styles only, screenshots **NOT CAPTURED** | **NOT VERIFIED** | **NOT VERIFIED** |

## Source verification

- Node `v22.16.0`, npm `10.9.2`. `node --experimental-strip-types --test qa/native-home-featured-favorites.test.mjs qa/native-home-featured-salary.test.mjs` — **11/11 PASS** against the exact Git-blob-matched source files and existing savedJobsReadback helper.
- Global TypeScript parser `createSourceFile` for TSX + new TypeScript module: **0 syntax diagnostics**. This is not TypeScript typecheck with Expo dependencies.
- No complete checkout or package-compatible npm install in the Linux runtime (GitHub DNS resolution failed). Android SDK/emulator/adb unavailable; macOS/Xcode/iOS simulator unavailable. Signing/distribution route unverified.
- GitHub `.github/workflows/ci.yml` triggers on PR or main push, including Android release build; this branch-only work did not request CI, PR, EAS, Preview, DB/Worker or Store publication. Other Cloudflare integrations/costs cannot be excluded without further authorization evidence.

## Next

Direct in-card application/document-step parity must reuse the existing durable submission and canonical readback; do not duplicate the transaction or weaken uncertainty quarantine. Then integrate other unmerged feature deltas as appropriate, perform full Expo typecheck and both-OS authenticated and visual QA before any acceptance claim. No user data was used.
