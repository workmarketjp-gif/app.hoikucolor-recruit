# r244 — /resume 基本情報：生年月日・郵便番号の Web 入力パリティ（2026-11-15 NZ）

State: **IMPLEMENTING**. Developer Native rendered QA / canonical API save→readback on Android and iOS: **NOT VERIFIED**.

## Versioned Web reference
- `workmarketjp-gif/app.hoikucolor-recruit` Web `main fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/views/ResumeBuilderView.tsx` blob `61859463d2103b8323446a8dbbb1d6297cedc749`.
- Route `/resume` BasicStep; inspected from source on 2026-11-15 NZ; role: synthetic signed-in JOBSEEKER; state: legacy date/paste postal/future date/empty optional fields. Deployed Web SHA and rendered screenshot not established.
- Confirmed Web properties: birth date uses HTML date input with UTC ISO max=today; postal code strips non-ASCII digits and hyphen with maxlength 8; gender max 20; address/kana/contact max 200; empty is optional/null.
- Native writer: COLOR Commander; previous HEAD `9a3fbac615fd6557b32e540cc92fdc7b695f4e41`; only Native UI/test/docs paths; no same-file overlap with open PR #113 (Hello Work documentation).

## Closed SOURCE gap
- Previous Native birth-date Field accepted unrestricted text and could submit impossible dates or future dates, unlike the Web date input. New in-app modal uses numeric year/month/day with calendar validation, UTC Web max and explicit confirm/cancel/clear, preserving older existing legitimate dates. No new Expo dependency or browser escape.
- Previous Native postal code permitted letters and unbounded length. Native now strips exactly as Web and enforces 8-character maximum. Web-equivalent text length limits and hints are included in BasicStep.
- The current canonical résumé RPC, owner/session fencing, autosave guard, profile/RLS boundaries and PDF pipeline are unchanged.

## Focused proof and remaining acceptance
- Node 22.16.0 actual helper test: `node --experimental-strip-types --test qa/native-resume-basic-fields-r244.test.mjs` (5/5 PASS locally against identical isolated policy source before integration).
- System TypeScript 5.8.3 strict isolated policy check: `tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck src/lib/resumeBasicFieldPolicy.ts` PASS. Not the locked Expo ~5.9.2 full compile.
- GitHub source wiring verified post-commit; Native component mount/keyboard/Modal rendering, OS date entry, portrait/screenshots, live save/readback, Expo integrated typecheck, signed builds not verified.

| Web workflow | Android | iOS | Missing evidence |
| --- | --- | --- | --- |
| BasicStep birth date select/clear, past/date/future validation | IMPLEMENTING (source, helper tests) | IMPLEMENTING (source, helper tests) | Native keyboard/modal/render and RPC confirmation |
| Postal filtering/max length and optional field lengths | IMPLEMENTING (source, helper tests) | IMPLEMENTING (source, helper tests) | Device input/paste/text-scaling QA |
| Account switch, lock and resume canonical readback | NOT VERIFIED | NOT VERIFIED | Same synthetic candidate/session QA |
| Signed installable acceptance build | NOT AVAILABLE | NOT AVAILABLE | Authorized Android signing and iOS distribution route |

No PR/main/production/Cloudflare/DB/RLS/Auth/Store mutation. CI `.github/workflows/ci.yml` triggers `main` push and PR; this non-PR development branch push does not meet those triggers. Cloudflare Worker `app-hoikucolor-recruit` trigger lists `branch_includes: [main]` (checked 2026-11-15 NZ). No paid Actions/EAS/agent requested. Billing quota unknown.
