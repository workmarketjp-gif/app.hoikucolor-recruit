# COLOR r117 / 2026-11-10 NZ — notification count integrity
- Status IMPLEMENTING, not developer verified. Sole writer COLOR on `native/color-jobseeker-submission-quarantine-20261110-r116`, parent `196183089869c0d1775ded93eddc9fd596e673c6`.
- Web reference: `src/components/NotificationCenter.tsx` at current repository main; candidate role and synthetic empty/nonempty/error/inconsistent state. No same-state deployed screenshots.
- Scope: Native notification labels, conditional empty state, mark-all gating and regression. Existing NotificationContext, API/RPC, candidate owner isolation and private storage are unchanged.
- Unit cases: canonical count 0/nonzero, paginated counts, unread contradiction, missing/failed states. Node 22 with type stripping tests 4 helper cases using isolated exact helper; minimal standalone TypeScript checker. Screen wired by source checks; complete Expo typecheck not done.
- Android Native runtime: NOT VERIFIED. iOS Native runtime: NOT VERIFIED. Same-state Web visual and canonical save/readback: NOT VERIFIED. Signed builds: NONE. No PR/main/Production or paid build.
- Cost: `.github/workflows/ci.yml` main-push or PR-triggered; this development branch does not match push trigger. Other Cloudflare integrations and remaining quotas are not fully known.
- Next: reconcile older r77-r110 source patches on this branch, obtain dependency-backed Expo full typecheck, then independently perform Android and iOS runtime/visual QA.
