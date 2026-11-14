# r241 — Resume row editing uses current state and stable identity (2026-11-15 NZ)

Status: IMPLEMENTING, **source-only**; no Android/iOS developer rendered acceptance evidence.

## Frozen Web reference
- Role: JOBSEEKER; Web route `/resume`, `src/views/ResumeBuilderView.tsx` from Web `main fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6` (reviewed 2026-11-15).
- Synthetic state: two school/work history rows; quick adjacent field edits, row reorder, age-group toggle, duplicate add tap. No real candidate data used. Deployed Web runtime capture not available; baseline is source, not a visual acceptance screenshot.
- Web also uses render-captured arrays in its `EducationStep` and `EmploymentStep`; potential Web-side defect belongs to its separate owner. This Native fix does not change Web code.

## Source fix
- On Native `/resume`, row edit callbacks had built the complete `education` or `employment` array from a render-captured `view`. Rapid edits could write the earlier array over an already queued edit; stale index callbacks could update the wrong row after a reorder.
- `patchResumeEntryById` and `moveResumeEntryById` now apply mutations to the **functional latest resume state**, using unique stable row IDs. Missing/duplicate IDs remain unchanged. Current-row derived status, employment-current flag and age-group chips no longer reuse old values.
- New-row addition checks the current row count inside the functional update, preserving the Web limits under quick repeat taps.
- Existing owner/session fences, autosave/readback, deletion confirmation, PDF/privacy and backend APIs are unchanged. No arbitrary data copied from an earlier render.

## Evidence and limits
- Base branch head `f6860996e7f661f396dcaaab751fa5af422f7b14`; GitHub blob `native/src/lib/resumeEditor.ts` `3039ca6d962ff2ab442edf097180f6505eb0470c`, standalone Node test blob `47d1027e9d760c2b3e14ad1e60567d8925f4cef9`, UI screen blob `9606205dc29e7c532ef7f6946fbc96620a9e5035`.
- Node v22.16.0 `node --experimental-strip-types --test qa/native-resume-row-stale-callback-r241.test.mjs`: **6/6 PASS** against matching tested helper/test blob content.
- `tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck src/lib/resumeEditor.ts`: **PASS**, TypeScript 5.8.3 dependency-free helper only.
- Must still run full Expo typecheck and real Android/iOS UI with duplicate taps, date picker/keyboard, reordered rows, long Japanese text and canonical save/readback. No simulator, actual signed candidate, or signed distribution evidence is claimed.
- GitHub CI: broad workflow runs on main push or PR, not direct development-branch push. Cloudflare Worker `app-hoikucolor-recruit` build trigger includes main only (read-only configuration check this run). No paid CI/EAS, PR/main or Production write authorized.

## Matrix
- `/resume` row edits, reorder, add limit, age-group chips: Android **IMPLEMENTING** (Node helper tests only); iOS **IMPLEMENTING** (same code tests only); canonical readback/real visuals both NOT VERIFIED.
- Next highest priority: complete Expo integration compile and Native rendered/authorized test journeys; verify potential Web defect with Web owner and avoid copying it as intended behavior.
