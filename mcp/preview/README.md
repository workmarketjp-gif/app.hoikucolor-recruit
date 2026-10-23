# Hoiku Color MCP — independent HTTPS preview (NOT DEPLOYED)

Owner: HC AI Plugin Build. This directory isolates a stateless, anonymous, public-job-only MCP Worker from HC Web/Native, Color LP/blog and Hoiku Poppy. No write tools, candidate information or service-role access. No Cloudflare route, cron, DB migration or existing application changes.

## Verification before any deployment

1. Get explicit approval to create a **new** Worker in the existing Cloudflare account, with no new charges. Do not repurpose an existing Worker, production route, domain or project.
2. Start from wrangler.preview.example.jsonc and choose a distinct Worker name and a real, unique Cloudflare rate-limit namespace ID (the example 1001 is a placeholder). Set the exact dedicated Worker HTTPS hostname in HC_MCP_PUBLIC_HOST. Keep HC_MCP_PREVIEW_ENABLED=false until isolated credentials and permission checks pass.
3. Configure HC_SUPABASE_URL as an exact HTTPS Supabase project root and HC_SUPABASE_PUBLISHABLE_KEY as a public sb_publishable_* key using the preview Worker's own settings/secrets. Never copy a service-role/secret key, user token, account session or OAuth credential. Do not commit values.
4. Set HC_MCP_ALLOWED_ORIGINS only to specifically verified HTTPS origins, comma separated, if an Origin header is actually required; blank rejects all Origin headers. Never use a wildcard.
5. Only after independent approval, enable HC_MCP_PREVIEW_ENABLED=true **for this preview alone**. Deploy to its own workers.dev host, not the HC/HP production paths.
6. Validate HTTPS endpoint with MCP Inspector: POST /mcp server/discover, tools/list, tools/call with a real published anonymous job. Verify missing/closed/stale job and non-authenticated/cookie/bearer/foreign-Origin rejection. Capture only redacted evidence. Then test ChatGPT Work custom MCP, separately from public plugin submission.

## Offline gate

From mcp/preview, install only preview dependencies then run:

    npm install --ignore-scripts --no-audit --no-fund
    npm run build:check
    node --test ../qa/preview-policy.test.mjs

The build:check command invokes Wrangler **--dry-run**: it does not deploy and uses no Cloudflare secrets. CI similarly compiles only.

The preview refuses requests until its explicit enabled flag, hostname, anonymous Supabase key and actual Cloudflare rate-limit binding are supplied. It reuses the existing MCP gateway's exact Host/Origin, HTTPS-only route, no-Authorization/no-Cookie, body size, deadline and public read tool policy. Audit emits decision classes only, not job text, identities, search arguments, headers or credentials.

**Rate limiter limitation:** Cloudflare Workers' binding is approximate and counts per Cloudflare point of presence, not a globally strict distributed limit. Add central quota/WAF controls and a retention policy before public submission. No rate limit alone is an authorization policy.

## Not yet verified

There is no externally reachable HTTPS preview from this source change. Wrangler compile, live anonymous REST/MCP response, Inspector trace, ChatGPT query, OAuth cross-candidate isolation and plugin review remain independent gates. The 7-day DB versus 12-hour MCP job-recency mismatch is untouched and needs separate no-regression remediation; no SQL/RLS changes have been authorized.

References: https://developers.openai.com/plugins/build/mcp-server, https://developers.openai.com/plugins/build/plugins, https://developers.openai.com/plugins/deploy/app-review, https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/, https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/.
