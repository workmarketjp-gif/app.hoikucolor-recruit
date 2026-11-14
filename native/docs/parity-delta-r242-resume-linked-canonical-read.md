# r242 — /resume linked profile / childcare canonical-read recovery (2026-11-15 NZ)

Status: **IMPLEMENTING (source tested; both Native OS runtimes NOT VERIFIED)**.

## Frozen Web reference / scope
- JOBSEEKER Web `/resume`, current `main fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, `src/views/ResumeBuilderView.tsx` blob `61859463d2103b8323446a8dbbb1d6297cedc749`. Source read on 2026-11-15 NZ; deployed SHA and actual Web capture NOT VERIFIED.
- Synthetic state only: signed-in candidate with declared qualification(s), qualification acquisition year/month, and editable classroom/leadership experience. Never use real jobseeker data.
- In-scope: Native `ResumeChildcareEditor` mounted for 基本情報/資格/保育経験 in the seven-step resume wizard. Shared canonical profile and matching preferences stay distinct datasets, with unchanged server authorization and save-RPC contracts.

## Implemented source change
- Prior linked editor `load()` awaited an unbounded Clerk candidate pin and parallel profile/preferences reads. A hung token or either RPC could strand the entire editable section on a spinner; a returned null candidate could silently return before clearing loading.
- New `readResumeLinkedProfileSnapshotBounded` uses existing production source `readCandidateJobDiscoveryBounded`: **separate 15 s** token and read-only pair deadlines, single pinned account+session, all-or-nothing data, revoked-generation/lock quarantine. The UI keeps its explicit error/reload behavior, never turns a failed read into empty profile or fabricates verified qualifications.
- Prewrite Clerk pin in both profile and preferences autosave now uses existing `pinCandidateProfilePrewrite` with a deadline and live generation guard. The actual upsert and preference save remain **unbounded and never auto-retried**. Both post-write canonical confirmation **reads only** use existing `readCandidateProfileAfterWrite` with a deadline; ambiguous readback still pauses automatic writes until user-directed canonical reload.
- No Web, auth, RPC, RLS, Storage, candidate records, recruitment admin, LP/SEO, Cloudflare, production or release changes.

## Real evidence
- First development HEAD: `fd782e4dc24b0f80f4ae0b8d33ce3ca699692735`. Current integration head must be re-read from GitHub; `main` untouched, unrelated open PR #113 only at initial ownership check. One COLOR Native writer on branch `native/color-jobseeker-integration-r216-20261114`.
- Node 22.16.0: `node --experimental-strip-types --test qa/native-resume-linked-bounded-read-r242.test.mjs` **7/7 PASS** on actual new helper/test blobs `8e880bf7ee96d606ba2dcf15bbcbacab54e6326b`/`870b935b5574b44b08c7c83e280eeccfad51ccbc` and exact previously committed dependency blobs `6c62f3f0`, `459e84cf`, `47909bc9`.
- `tsc --noEmit --strict --allowImportingTsExtensions --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck src/lib/resumeLinkedCanonicalRead.ts` **PASS**, dependency-free helper tree only.
- GitHub connector postwrite confirmed the Native screen uses bounded paired reads, prewrite pin, and *two* bounded readbacks, with raw pin paths absent. This is a **source assertion**, NOT SDK-backed Expo UI compilation or Native runtime QA.
- Full `npm ci`/Expo typecheck not executed due no usable project checkout/installed locked dependencies and direct clone DNS failure. Android SDK/emulator, macOS/Xcode simulator, signing and approved distribution were not available/verified.

## Web-to-OS matrix / acceptance
| Flow | Android | iOS | Live canonical / rendered evidence |
| --- | --- | --- | --- |
| Resume 基本情報/資格/保育経験 load, read error/retry | IMPLEMENTING | IMPLEMENTING | Source helper 7/7, NO installed Native render/canonical live readback |
| Profile/preference autosave pin and result confirmation | IMPLEMENTING | IMPLEMENTING | Source wiring only, NO installed RPC save/readback |
| Web visual parity (small/standard, Japanese long text, keyboard and scaling) | NOT VERIFIED | NOT VERIFIED | No paired screenshots |
| Signed installable acceptance build | NOT AVAILABLE | NOT AVAILABLE | Android keystore and iOS TestFlight/ad-hoc permission not verified |

Next: full Expo dependency typecheck on a checkout, run focused editor integration tests and synthetic canonical save/readback on both OSes, compare actual Web and Native screens. Do not advance to READY_FOR_MASA_ACCEPTANCE. No paid CI/EAS/agents, new PR or Production trigger were intentionally started; billing quota remains unknown.
