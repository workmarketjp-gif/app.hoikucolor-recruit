# r164 | 求職者プロフィールの都道府県選択をWebと揃える

- Web baseline: candidate ProfileForm, src/App.tsx at main fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6, source inspected 2026-11-11 NZ; synthetic authenticated role. Web has a native HTML select of 47 named prefectures plus blank and any previous unrecognized saved value.
- Native parent: r163 HEAD 2eb6f85fe2d3ea96dee9888d16d5c2645b432df2. Existing Native profile used an unconstrained free-text entry labeled 希望都道府県; Web label is お住まいの都道府県. This source divergence could allow inconsistent preference strings, but production erroneous data is not established.
- Implementation: Existing React Native Modal/Pressable/ScrollView picker pattern (reused from Native job filters) replaces the free-text field. It offers the same 47 values in order, an explicit 選択しない entry, and retains an unrecognized existing value for correction. On tap, it updates the *same* editable profile draft, never sends a network request; the existing user-confirmed Save → pinned canonical upsert → readback remains intact. Modal closes on dismiss, Android back, or privacy/edit disable. Trigger and each option expose accessibility labels/state. No third-party dependencies.
- Files: native/src/app/(tabs)/profile.tsx, native/src/lib/profilePrefectureOptions.ts, native/qa/native-profile-prefecture-options.test.mjs, native/qa/native-profile-prefecture-web-contract.mjs, native/package.json, this document and parent parity ledger.
- Focused evidence: Node v22.16.0 --experimental-strip-types --test native/qa/native-profile-prefecture-options.test.mjs **3/3 PASS**; isolated strict tsc helper PASS. Local exact helper blob SHA f371a34f22f1ace637b32e04d480b64533d3d7d4; test SHA 7d0420e681dd80b24042cc79c350bf57ae7d9833. Full repository Node contract is registered and auto-discovered but NOT RUN under a complete checkout. Source wiring and same Web 47-option order checked against actual fetched source. No Expo/JSX compile or Native runtime screenshot.
- Ownership/cost: Branch native/color-profile-prefecture-select-r164-20261111 only, no PR, main writes, Production, RLS/auth changes, real applicants, new paid Actions/EAS or Store work. PR-triggered CI is kept gated for cost. Signing/distribution remains unverified.

| Workflow | Android | iOS | Open evidence |
| --- | --- | --- | --- |
| Profile prefecture selection and existing-value preservation | Common Native source updated; actual installed behavior NOT VERIFIED | Common Native source updated; actual installed behavior NOT VERIFIED | Full Expo typecheck, keyboard, modal scrolling at scaling, safe area/back, canonical synthetic save→re-read→Web screenshot |
| Profile name/date validity (r163 inherited) | Source helper PASS, installed behavior NOT VERIFIED | Source helper PASS, installed behavior NOT VERIFIED | Web-style native OS date picker still open; full end-to-end and side-by-side QA |

**State: IMPLEMENTING**, not DEVELOPER_VERIFIED for either OS and not READY_FOR_MASA_ACCEPTANCE.
