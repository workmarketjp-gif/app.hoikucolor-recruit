# COLOR JOBSEEKER r278 — job-search facet retry continuity

## Frozen Web and Native reference
- Web job-search filters: `src/App.tsx` and `src/lib/recruitRepository.ts` at main `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`, signed-in synthetic candidate choosing prefecture/employment type; source reference 2026-11-16, not deployed screenshot.
- Native `native/src/app/(tabs)/jobs.tsx` and `native/src/lib/jobSearchReadback.ts`, parent `37d57a1c18ef8bdcae85f28f369701930a9d6bba`, owner `native/color-jobseeker-integration-r216-20261114`. Open PRs 0 before first write; no competing Native writer observed.

## Gap closed in Native
- Prior facet refresh set `ownedFacets = null` immediately, so a transient failed reload removed all previously authenticated prefecture/employment choices, even while the same candidate remained on the search screen.
- Retry now retains only the same owner+session's previously confirmed **facet names**, while canonical search rows, counts, ranking and selected filters remain controlled by the existing APIs. The same RPC is still executed; errors and explicit retry remain visible.
- On account/session change, signout or App Lock, the existing screen privacy effect still clears `ownedFacets`, and `retainedJobSearchFacets` independently refuses retention across the boundary. No cross-user fallback; no counts invented; no schema/auth/Worker changes.

## Focused evidence and limits
- Real helper runtime: `node --experimental-strip-types --test native/qa/native-job-search-facet-retention-r278.test.mjs` — 3/3 PASS, Node v22.16.0.
- Strict helper typecheck `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext native/src/lib/jobSearchFacetRetention.ts` — PASS, TS 5.8.3. Git blob hashes: helper `cf22b3c69ae8412400cc4cf3ed8958b7cff72c2a`, test `386a361229ed0b3a4e7b3131dba6ffce2dab1e57`.
- Component integration checked by exact-source wiring and retention of privacy-clear effect; Expo full typecheck/render unavailable. Android and iOS UI, live canonical API, signed builds and user-device acceptance are still NOT VERIFIED.
- GitHub Actions only main push/PR; connected Cloudflare Worker build trigger is main-only; Native development branch push does not trigger these. Quota and signing remain unconfirmed.

## Next
Render filter modal with confirmed options → retry pending → failed refresh, then owner/session switch, on both OSes; confirm preserved names but no stale result count, and fresh API read on retry. Follow search → detail → apply → message on a synthetic account, with no production sends.
