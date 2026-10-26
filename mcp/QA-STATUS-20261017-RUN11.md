# Hoiku Color MCP — isolated SDK dispatch deadline (Run 11)

Status on 2026-10-17 (NZ): **offline implementation, not connected or deployed**.

## Read-before-write and ownership
- Inspected current `workmarketjp-gif/app.hoikucolor-recruit` main SHA `c5f7c546893413c6b23652fc04c18328362dd1ce`, directory tree, app scripts, one main CI workflow, MCP branch heads, and HQ Issue #265 using the connected GitHub reader. No main `AGENTS.md` or existing main `mcp/` directory. Existing MCP branch `feat/hc-mcp-policy-timeouts-20261017` still points to main (empty). No open PR. No app, Native, database, Edge, LP, blog or other Commander paths modified.
- Reviewed OpenAI's current plugin MCP/auth/review and official MCP TS SDK v2 API. This work preserves v2 `createMcpHandler` (2026-07-28 with 2025 client fallback) and makes no assumption about actual SDK execution.

## Change
- New `mcp/dispatch-deadline.mjs` bounds gateway dispatch to 8 seconds by default (100–30000 ms accepted). It combines client disconnect and server timeout through `AbortSignal.any` and `AbortController`, discards late results, refuses malformed SDK results, and never forwards raw SDK exceptions.
- `mcp/sdk-bridge.mjs` now validates a trusted-only `security.toolDeadlineMs` at startup and wraps the SDK fetch with that cancellation/deadline. Errors become HTTP 503 with `Cache-Control: no-store`. Other security checks and public read-only tool schemas are unchanged.
- Seven new negative/positive tests in `mcp/qa/dispatch-deadline.test.mjs` cover timeout, late result, abort notification, raw error masking, invalid config, invalid SDK results, and success.
- Important limitation: downstream fetch/database adapters must honor `AbortSignal` to actually stop work, and response-stream lifetime is not necessarily bounded after a `Response` is returned. The default JSON mode should be tested against real SDK for the actual three public tools.

## Tests and release status
- Offline Node tests excluding the two SDK-dependent network tests: **116/116 passed** (109 previous + 7 new). JS syntax checks passed. Independent clean replay of incremental patch and all-new-files patch is required and recorded separately.
- npm official SDK installation is still blocked by `getaddrinfo EAI_AGAIN registry.npmjs.org`. No official SDK TCP, MCP Inspector, Cloudflare Preview, ChatGPT Work plugin, live Supabase call, or OAuth login was verified.
- This is a code-only change; no production DB, Cloudflare, Cloudflare release quota, new charge, applicant operation, or public Directory submission was made.

## Next highest-priority unit
- Apply complete MCP integration to a new authorized branch based on current main, open Draft PR, and let CI install the real official SDK and execute `initialize`→`tools/list`→`tools/call` on synthetic data. Do not release publicly before a separate compliant public catalog feed test and HTTPS Preview security review. Address daily discovery versus 12h freshness separately under HC feed ownership; do not weaken publisher compliance or RLS.
