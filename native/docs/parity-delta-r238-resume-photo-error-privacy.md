# r238 — Resume photo OS error presentation privacy (2026-11-14 NZ)
Status: IMPLEMENTING (source-only), not DEVELOPER_VERIFIED on Android or iOS.

## Versioned Web baseline
- Role: JOBSEEKER /resume; main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`; `src/views/ResumeBuilderView.tsx` blob `61859463d2103b8323446a8dbbb1d6297cedc749`.
- Reviewed 2026-11-14; synthetic candidate with local proof photo and malformed OS picker/cache exception.
- Web deployed runtime/capture unknown; this is a privacy correction, not a new UX design.

## Closed source gap
- Native `src/app/resume.tsx` previously surfaced raw Error.message on photo selection/transform/cache/cleanup failures. Expo filesystem/manipulator errors can contain private file URLs or identifiers.
- New `resumePhotoFailurePresentation.ts` only permits exact reviewed Japanese validation strings. Unexpected errors show a neutral, uncertainty-aware message, with no implicit success or retry.
- Photo transformations, private cache storage, secure temporary-file cleanup, photo preview and PDF upload logic remain unchanged. In unknown cache state, the existing UI clears the preview. The prior owner/session gating is retained.

## Exact tested source/evidence
- Direct GitHub development branch, pre-change HEAD `1a8da35e87b949a1eeab675d0f1c32b3e36bdc06`.
- New helper blob `675e7c0da1b9a5ca1e9f10ed1fef517e0ae08b81`; exact blob reproduced locally with `git hash-object`.
- `node --experimental-strip-types --test qa/native-resume-photo-error-privacy-r238.test.mjs`: 6/6 PASS against matching helper content.
- `tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck src/lib/resumePhotoFailurePresentation.ts`: PASS, helper only.
- GitHub post-write review confirms UI imports/calls sanitizer, removes raw photo exception display, and npm script registered. No Expo full-dependency typecheck, runtime UI comparison, live API save/readback, Android or iOS device evidence.
- GitHub Actions broad CI on main push / PR only; other workflows only affect MCP/HelloWork paths. Direct branch updates, no PR/main, no paid CI/EAS initiated. Cloudflare automatic Git-linked builds and billing quota unverified.

## Matrix and next
- Android: IMPLEMENTING, source fix only; simulator/SDK, screenshot, auth/readback and signed installable APK not verified.
- iOS: IMPLEMENTING, source fix only; macOS/Xcode/Simulator, screenshot and authorized TestFlight/ad-hoc route not verified.
- Next: SDK-backed npm ci/typecheck; photo selection, failed manipulation, temp cleanup/cache update, session switch tests on both OSes, then complete Web parity and signed handoff. No release, backend or RLS change.
