# r160 — 保存求人の実績バッジ／記録単位を詳細表示と整合

- **Scope / single writer:** Color JOBSEEKER Native UI / presentation and its regression only. Base `225b46a16ebe1bb3cc6ab1e6b14ec54d1b407450` (r159), isolated branch `native/color-saved-evidence-source-unit-parity-r160-20261111`. Open PR 0 at start, no main or Web edit; no active same-path PR found. Root AGENTS.md absent; HQ #265 MINIMUM_COST_V1 and #467 remain authoritative.
- **Web reference:** `src/components/JobCard.tsx` on main `fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6`, 2026-11-11, jobseeker, synthetic evidence: known metric / unrelated metric / finance sample. Web source count-only tag verification remains open with Web owner in #111; do not claim Web defect resolved.
- **Source difference closed:** Saved card badges used a separate all-metric validator which could claim “勤務実績あり” for an arbitrary metric key not shown by Saved's expanded evidence detail, Job Search, Job Detail or Compare. Saved card now calls the same `verifiedEvidence()` eligibility as the other surfaces, so a badge requires displayable canonical evidence. Does not invent data or alter authorization.
- **Source difference closed:** Saved expanded finance section displayed sample count as `件の記録` even when canonical finance units represent months. Saved evidence now uses `か月分の記録` for finance and `件の記録` for workplace, following the type split in Compare r159; invalid sample values render no count.
- **Preserved:** Search, salary, saved/unsave RPC, session fencing, user-owned readback, source attribution, apply and visits; no production data/schema/RLS/auth/Edge edits.
- **Scoped actual runtime:** Node v22.16.0 `node --experimental-strip-types --test qa/native-saved-job-card-presentation.test.mjs` **9/9 PASS** in local patch using original verifiedEvidence.ts blob `20691ac0e736848ed11bad3f52d3be74d54928aa` and candidate presentation helper blob `d0ccdbffee6dd1acfcc171ac276a8936ceb4a7ed`; new regression registered under existing `test:job-discovery-parity`. Test file Git blob was built via the same targeted source transforms; its bitwise local/runtime identity and complete Expo test remain unverified.
- **Limits:** This is a pure Node presenter test, not React Native render, visual QA or API E2E. Android/iOS emulators, macOS/Xcode, signing/distribution, safe candidate QA auth and full Expo dependency tree unavailable/unverified. Android NOT_VERIFIED; iOS NOT_VERIFIED. No paid CI/EAS/agents, no PR/main merge, no Store publication. CF connected account Pages listings show 0 projects (other deployments unknown). Status IMPLEMENTING, not READY_FOR_MASA_ACCEPTANCE.

| Synthetic state | Presenter test | Android actual screen | iOS actual screen | Canonical/Web E2E |
| --- | --- | --- | --- | --- |
| Correct workplace/finance metric | PASS | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| Count-only, arbitrary key, wrong source, fractional count | PASS (no false badge) | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| Finance sample vs workplace sample units | PASS (8か月分 vs 12件) | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| Favorite save → canonical readback → remove → compare | Existing source preserved; full run NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |

**Next:** Native runtime/UI compare and authenticated synthetic saved-job flow, then application documents → send → message; finish OS builds through authorized distribution once signing/dependency environment is available.
