# r288 — 応募詳細・面接回答・内定判断の内部エラーを表示しない

- Baseline: Web `src/components/ApplicationDetail.tsx`, jobseeker-only, `main 5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59` (2026-11-16 NZ source comparison; deployed SHA / rendered capture NOT verified). Native `native/src/app/application/[id].tsx`, synthetic candidate/session and simulated private transport failures.
- Ownership: COLOR Native UI/error presentation only, new isolated branch `native/color-application-failure-privacy-r288-20261116` based on `836da40154786b26b1f18eee3a1d6ceb87d29752`. No Web, recruitment-admin, shared API, schema, DB/RLS, server deployment or production changes.
- Closed source gap: three raw `String(error)` presentations in canonical application detail loading, interview responses and application decisions could reveal Clerk identifiers, Supabase RPC internals, Storage paths or signed URLs. The source now uses fixed Japanese operation-specific text. For ambiguous mutation responses, it asks for canonical reload, not resending.
- Retains current state fences, canonical data reads, decisions and durable adapters; does NOT claim mutation failure, confirmed success or expanded candidate permissions.

| Web-to-Native route/workflow | Android implementation | iOS implementation | Verified evidence | Remaining |
|---|---|---|---|---|
| Web 応募管理→応募詳細/面接回答/内定判断 errors | Shared Native source redaction; runtime NOT verified | Shared Native source redaction; runtime NOT verified | `node --experimental-strip-types --test qa/native-application-failure-privacy-r288.test.mjs`: 10/10 PASS (local exact-source helper); `tsc --noEmit --strict --target ES2022 --module nodenext --moduleResolution nodenext src/lib/applicationFailurePresentation.ts`: PASS. GitHub source integration to verify after commit. | Installed app errors and Web paired rendered screenshots, live canonical save/readback, both signed builds |

State: **IMPLEMENTING**. No exact-SHA Expo app-wide typecheck, Android emulator QA, iOS simulator QA, signed APK, TestFlight or physical acceptance. No actual applicant data in QA. CI policy: `.github/workflows/ci.yml` push only `main`, PR triggers all; no PR, merge or main write. Cloudflare trigger for this isolated Native branch not independently confirmed; no intentional build or deployment. Additional usage quota/cost unverified.
