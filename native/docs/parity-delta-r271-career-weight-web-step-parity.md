# r271 — Career salary/holiday preference weight parity

**State:** IMPLEMENTING. **Date:** 2026-11-16 NZ. **Owner:** COLOR JOBSEEKER Native UI only.
**Single-writer provenance:** `workmarketjp-gif/app.hoikucolor-recruit`, branch `native/color-jobseeker-integration-r216-20261114`, initial HEAD `4909e1e7bdf6e8ca28bf0d2b683f7c9133476a2f`. No open PR reported for this repo at the preflight; only the Native component, dedicated helper/test, and this ledger are changed.

## Versioned Web screen/action reference

- Web source `src/views/CareerView.tsx` at main `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59` (blob `ed5eac2c1777af12205f1518b747556ea2bb41b2`), inspected 2026-11-16 NZ. Route `/career`, authenticated synthetic candidate with `scenario='balance'`, `salary_weight=50`; no deployed Web screenshot captured.
- Web range input supports **0%, 10%, ... 100%** (`min=0`, `max=100`, `step=10`). Earlier Native `CareerExperience.tsx` offered only 0%, 25%, 50%, 75%, and 100%, preventing selection of six valid Web positions and allowing two non-Web increments.

## Implemented gap closure

- Native uses all eleven Web steps, retaining the existing `Choice` component, Japanese label, canonical `salary_weight` field, owner-pinned save/readback, and revision protection for destructive dialogs.
- Previously saved non-step values such as 25% or 75% remain visibly selected until explicitly changed. No implicit canonical write or rounding; only deliberate UI choice changes the draft.
- No new dependencies, external API, backend mutation, data cache, or permission changes.

## QA matrix

| Journey / evidence | Web | Android | iOS |
| --- | --- | --- | --- |
| Balance slider/choices 0..100 step10 | Source-confirmed | Source-confirmed; rendered QA pending | Source-confirmed; rendered QA pending |
| Previously saved 25%/75% readback | Canonical field retained | Pure helper test verified, actual API readback pending | Pure helper test verified, actual API readback pending |
| Narrow-screen density, text scaling, screen-reader selection | Web browser capture pending | Emulator/device comparison pending | Simulator/device comparison pending |
| Save -> canonical readback, account switch and App Lock | Web backend existing | Native installed QA pending | Native installed QA pending |

Focus tests (local Node 22.16.0, real helper source): `node --experimental-strip-types --test native/qa/native-career-weight-web-steps-r271.test.mjs` **5/5 PASS**. Isolated strict TypeScript: `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions native/src/lib/careerSalaryWeightChoices.ts` **PASS**. The full Expo dependency-backed typecheck and Native runtime/render/screenshot verification were NOT executed.

## Safety and next action

Native developer branch only. `.github/workflows/ci.yml` has `push: main` and PR triggers (no PR created); Cloudflare connected account inspection found no Pages project for Color and zero build triggers on Worker `app-hoikucolor-recruit`. No paid Actions/EAS, production release, DB/RLS/auth changes, or real candidate actions. Exact cost quota unconfirmed.

Next: compare the eleven-option UI and selected state on small/standard Android and iOS displays, then run real Expo typecheck and canonical save/readback in authorized synthetic state. Signed installable artifacts and iOS distribution remain blockers to READY_FOR_MASA_ACCEPTANCE.
