# COLOR Native r282 — Apply document pre-submit readback

- Repository: workmarketjp-gif/app.hoikucolor-recruit; single COLOR writer branch: `native/color-jobseeker-integration-r216-20261114`.
- Parent HEAD: `0e1d3ecf11fbd6427194152296c26f729b668346`.
- Web source baseline: `src/components/ApplyDocumentsStep.tsx` on main `5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59`; inspected 2026-11-16, signed-in synthetic jobseeker with required resume and optional licence. This is source comparison, not paired native rendering.

## Closed source gap
A candidate could select a document, leave the sheet open, and later submit after another device removed the document or the facility revised its required documents. The original parent preflight refreshed job, profile and applications, but the sheet submitted the previously loaded document IDs and requirements without a final canonical vault read.

The Native apply sheet now pins the current Clerk session, reads the fresh job requirements and candidate-owned vault, compares requirements and all selected file IDs/types, and fails closed on a change, private-data boundary transition or read failure. It prompts a full reload/review instead of silently dropping a document or automatically sending an application. Single-flight prevents repeated taps while re-reading. Backend RPC and authorization remain authoritative and unchanged.

## Evidence and remaining gates
Node 22 dependency-free, real-source helper test: 6/6 PASS. SDK-wide TypeScript compile, React Native render, canonical test-account API save/readback, physical-device QA and signed builds are NOT VERIFIED; genuine Expo dependencies not available locally. Android and iOS each remain IMPLEMENTING independently. No real jobseeker action or data used.

GitHub Actions: `.github/workflows/ci.yml` triggers on push to main or PR; separate MCP push workflows have mcp-only path filters. Native development branch does not trigger main CI. PR/main/Cloudflare release withheld under MINIMUM_COST_V1. Cloudflare project-specific external configuration remains unverified. No paid build, EAS, Codex, Work or other agent.

Next: full SDK typecheck and Android/iOS visual and safe synthetic API testing of job detail → document picker → application → messages, followed by authorized signed installable build paths.
