# r163 | JOBSEEKER プロフィールの必須氏名・希望日付のWeb整合性

- Web baseline: 2026-11-11 source capture, candidate-role synthetic state, main fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6, src/App.tsx ProfileForm lines 744–775. Web rejects an empty name before upsertProfile and uses an editable HTML date-only input.
- Native baseline: r162 isolated branch exact HEAD 1b64d4ffe56ffbc405335ee9a87fabae918b80b2, native/src/app/(tabs)/profile.tsx.
- Observed gap: Native allowed Save with a missing name, unlike Web; free-form start date could submit impossible/locale-dependent dates that Web's date-only control cannot. No evidence of actual production incorrect writes.
- Implementation: native/src/lib/profileWebValidation.ts validates required trimmed name and actual Gregorian YYYY-MM-DD date only when specified. Native Save rejects invalid input before acquiring the candidate RPC client, keeping the draft and retry controls untouched. Existing session pin, canonical upsertJobseekerProfile and readback unchanged. Name/date labels align with Web; explicit required cue and text field accessibility labels.
- Regression: native/qa/native-profile-web-validation.test.mjs (5 synthetic Node behavioral tests), native/qa/native-profile-web-validation-contract.mjs (Web baseline + real Native save call-order source contract), and focused npm script; auto-discovered by the existing available-contract runner.
- Verified: Node 22.16.0 --experimental-strip-types --test = 5/5 PASS, standalone strict tsc helper = PASS. Remote blob SHA of locally tested helper 45d174195cc13608f94314a1275d4324f5e37708 and test 6fe4e416206f52817d6b3bdcc4cb64e283ec677b match. Source wiring inspected. Full checkout contract and Expo typecheck NOT EXECUTED.
- Scope/cost: Color Native isolated r163 branch only. No PR/main/production/DB/API change, paid Actions/EAS, or real candidate submits. CI push main-only; pull_request triggers heavy CI, so PR not opened. Signing/distribution permission unknown.

| Parity | Android | iOS | Remaining |
| --- | --- | --- | --- |
| Required name before saving | Shared source and helper verified; OS NOT VERIFIED | Shared source and helper verified; OS NOT VERIFIED | Full Expo, keyboard/accessibility, canonical synthetic Save→readback→Web |
| Desired start date | Invalid date rejected in source; OS NOT VERIFIED | Invalid date rejected in source; OS NOT VERIFIED | Web is date picker; Native still editable text. OS picker/visual parity remains open |
| Session/owner isolation | Existing source retained, runtime NOT VERIFIED | Existing source retained, runtime NOT VERIFIED | Auth/lock/account-switch with test backend |

State IMPLEMENTING. No signed Android or authorized installable iOS build; not READY_FOR_MASA_ACCEPTANCE.
