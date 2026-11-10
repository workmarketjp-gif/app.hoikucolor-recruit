# Hoiku Color Native r145 — 見学予約のカレンダー選択（2026-11-11 NZ）

## Reference/owner
- Web baseline: `main` `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/components/VisitTrialPanel.tsx` blob `590bb872472311c3be3112625bff5f3969af2edf`, `/jobs` の認証済み求職者向け見学フォーム。Web `<input type="date">` をソースで確認。実画面撮影・同一状態比較はなし。
- Synthetic QA state: Japan timezone, 2028-02-27 JST, allowed weekdays 1–7, 3日先、同一求人の未予約状態。実在の求人・求職者・予約データは使わない。
- Native only: Color Commander, new branch `native/color-visit-calendar-web-parity-r145-20261111` from r144 `701ded19af6f235f09412f38b606b2e199d84d90`; before write, open PR 0, r144 ref identical to base. No Staff/Family/Web/DB/auth/RPC/production edits.
- MINIMUM_COST_V1: `.github/workflows/ci.yml` PR/main-push triggers checked, branch-only commits. No PR/merge/Actions dispatch/EAS/cloud build. Whole-account charges/quotas unverified.

## Closed source-level gap
- Removed free-form `YYYY-MM-DD` date input in `native/src/app/visits.tsx`; imported `VisitDateCalendar` with month browsing, accessible day labels/selected state, 46pt cells and horizontal scrolling at narrow widths, pink selection.
- Day list follows **JST venue date** (not NZ/device timezone), Monday-first grid, leap years, facility allowed weekdays and max-days window. 1–7 Monday–Sunday matches existing Web/API semantics. Disabled dates cannot be tapped. Display retains the existing Web-facing labels and server-owned visit mutation.
- Date eligibility is checked again in the form submit gate. Exact notice hours, free slots and candidate authorization **remain server-owned**; calendar selection does not guarantee successful booking. Existing visit list, active-booking guard, readback and privacy session fences are preserved.
- No new dependency: self-rendered calendar, **not** an OS-native date-picker. Native OS-specific accessibility/gesture and visual differences are still unverified.

## Matrix
| Web action | Native change | Android renderer | iOS renderer | Canonical save/readback |
|---|---|---|---|---|
| Select visit day with date control | In-app calendar and date-window guard implemented in source | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Change months and choose enabled venue day | 6 focused source-test cases PASS | NOT VERIFIED | NOT VERIFIED | n/a |
| Small width, TalkBack/VoiceOver, keyboard, 200% scale | 46pt day targets and horizontal scroll in source | NOT VERIFIED | NOT VERIFIED | n/a |
| Submit reservation/cancel/history and compare Web | Existing durable RPC and owner-aware readback retained | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |

## Exact tests and unverified gates
- Local Node 22.16.0: `node --experimental-strip-types --test native/qa/native-visit-calendar-selection.test.mjs` **6/6 PASS**. The tested helper and test-file blob SHAs match GitHub: `b6f264aac1cc16a7cc8a28ab1b53125afc169bc5`, `a702278e324965e20ec4a7fb805b8a18da5aaf51`.
- Local TypeScript CLI 5.8.3: `tsc --strict --noEmit --target ES2022 --module ESNext --moduleResolution bundler native/src/lib/visitBookingForm.ts` **PASS** (helper only). TSX parser 0 diagnostics for the calendar component (no framework typecheck).
- Connected GitHub remote-source assertions: 12/12 PASS for screen/calendar wiring. `native/qa/native-visit-calendar-contract.mjs` committed for full checkout, **not executed here**. No complete Expo typecheck, react-native renderer, emulator/simulator, authenticated mutation/readback or new signed artifacts.
- Native screen `src/app/visits.tsx` has remote blob `b99d286efcce4666e714b73b976f0d857b7a98c7`; calendar component blob `7a0f278e9267f884231dd16d97a27fe40699d5a7`.

## Next
- In authorized complete Expo checkout run the registered calendar contract, Expo typecheck, component QA, then same-state Web-vs-Android/iOS real-screen comparisons and canonical save → re-read. Android SDK/emulator and macOS/Xcode/simulator/signing/distribution route are unavailable or unverified here.
- Reconcile Web's `<input type="date">` versus the custom Native grid for VoiceOver/TalkBack and compact screens; do not declare platform parity without runtime evidence.
- State **IMPLEMENTING**; signed Android and authorized installable iOS acceptance builds not produced. No store submission/publication.
