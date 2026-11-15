# r270 — Career conditions delete dialog owner/session lease

**State:** IMPLEMENTING (real-source helper tests; Android/iOS rendered QA still pending). **Date:** 2026-11-16 NZ. **Owner:** COLOR JOBSEEKER Native UI only.

## Versioned Web baseline and gap
- Web jobseeker route: \`/career\`, \`src/views/CareerView.tsx\` blob \`ed5eac2c1777af12205f1518b747556ea2bb41b2\`, main \`5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59\`. Source inspected 2026-11-16 NZ, synthetic logged-in candidate with saved career conditions; no deployed capture.
- Web action: \`window.confirm('保存した条件を削除しますか？')\` → canonical \`deleteCareerConditions()\`. Native has an OS \`Alert.alert\` plus canonical \`hc_jobseeker_delete_career_conditions\` and readback.
- Gap: delayed Native destructive-dialog callback previously invoked \`clear()\` without retaining the session/data/draft generation from when the dialog opened. A switch A→B→A, a refreshed canonical state, or a changed input could make an old confirmation applicable to later state.

## Implementation
- Added \`native/src/lib/careerDeleteConfirmation.ts\`: capture exact owner+Clerk session key, loaded-data generation and form revision, and refuse stale/unlocked-context mismatch; no private data is persisted.
- Updated \`CareerExperience.tsx\` to verify the captured context both when the confirmation callback fires, on \`clear\` entry, and before calling the existing delete RPC after the asynchronous Clerk pin. Existing write single-flight, uncertain-result gate and readback remain unchanged.
- Native OS alert text and Web deletion semantics are preserved, with no new permissions, backend changes or automated deletion.

## Focused developer evidence / per-OS matrix
- Node 22.16.0 actual helper tests: \`node --experimental-strip-types --test native/qa/native-career-delete-confirmation-r270.test.mjs\` — **9/9 PASS**. Strict isolated TypeScript: \`tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions native/src/lib/careerDeleteConfirmation.ts\` — **PASS**. Source wiring and GitHub blobs checked; **no** Expo dependency-backed full typecheck or native rendered test.
- **Android:** /career → destructive confirmation remains IMPLEMENTING, source-verified only. Emulator/device alert, account switch, keyboard and formal RPC readback NOT VERIFIED; signed APK unavailable.
- **iOS:** same workflow IMPLEMENTING, source-verified only. Simulator/TestFlight, screen comparison and canonical readback NOT VERIFIED; signed installation unavailable.
- Existing Web/Natives same-state screenshots, real synthetic API verification, signing and distribution remain external QA prerequisites; not READY_FOR_MASA_ACCEPTANCE.

## Cost and integration
- Isolated branch only; no PR, main, Cloudflare Production, DB/RLS/Auth, real candidate mutation, paid Actions/EAS, Codex/Work/Claude, or store action. \`.github/workflows/ci.yml\` runs on main push/PR, not the development branch. Connected Cloudflare accounts show no Pages projects and zero build triggers for \`app-hoikucolor-recruit\` Worker. Other external integrations and quota remain unverified.
- Next: independent Android/iOS installed dialog validation and full Expo typecheck when SDK/dependencies/authorized signing/distribution are available, then continue the highest-impact unsatisfied parity flow.
