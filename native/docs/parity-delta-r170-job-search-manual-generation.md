# COLOR Native r170 — manual IME search generation race (2026-11-12 NZ)
Web reference: authenticated synthetic jobseeker, `src/App.tsx` main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`; Native parent `054d88567d00c435b2b871fea33bc250203268b4` (r169). Source inspection, not Web/Native rendered capture.

**Observed source gap:** r169 allowed button search during debounce, but the keyboard's `if (loading) return` still referenced React's previous render. During an outstanding request, an IME `onChangeText` invalidated its generation before React re-rendered; immediate keyboard submit could still be rejected as loading. Consequent debounce would search later, so this is a source-level immediate-submit gap, not proof of a user incident.

**Change:** track the active search's generation synchronously at request creation and clear it only for the same generation on settlement. Both manual keyboard and CTA check current generation + private owner gate; old in-flight requests cannot block a new keyword, and duplicate same-generation taps cannot fire new requests. Reuse latest candidate-scoped keyword draft and existing pinned canonical search RPC. No backend/schema/permissions/paid dependencies or ranking changes.

| Web flow / state | Android | iOS | Canonical evidence |
|---|---|---|---|
| Japanese IME edit during old RPC → immediate keyboard submit | Native source updated; real runtime NOT VERIFIED | Native source updated; real runtime NOT VERIFIED | Not run |
| Same-generation duplicate keyboard/CTA submit | Pure helper test PASS; UI NOT VERIFIED | Pure helper test PASS; UI NOT VERIFIED | No network run |
| Lock / session handoff during input | Existing auth + new private gate; NOT VERIFIED | Existing auth + new private gate; NOT VERIFIED | No real account used |
| Search→detail→favorite save/readback→compare | NOT E2E VERIFIED | NOT E2E VERIFIED | Not run |

**Evidence:** Node 22.16.0 `node --experimental-strip-types --test qa/native-job-search-manual-submit.test.mjs` **5/5 PASS** using exact new helper; helper-only strict `tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler src/lib/jobSearchManualSubmit.ts` PASS. Source wiring reviewed against fetched GitHub code; full-checkout `qa/native-job-search-manual-submit-contract.mjs` and updated r169 TSX regression registered but NOT RUN in current isolated runtime. No installed Android/iOS screens, complete Expo typecheck, canonical API test or signed builds.

Owner COLOR Native-only branch `native/color-job-search-manual-generation-r170-20261112`; no open PR at check; .github/workflows/ci.yml is main-push/PR triggered. No PR/main/production, new paid Actions/EAS, external agent, real applications/messages, or Store upload. Cloudflare linkage and billing quota unknown. Status **IMPLEMENTING**. Next: full repository dependency-backed checks and dual-OS keyboard/visual/canonical QA, then signed approved acceptance builds.
