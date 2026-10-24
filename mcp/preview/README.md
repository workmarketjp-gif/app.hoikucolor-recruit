# Hoiku Color MCP — independent HTTPS preview (NOT DEPLOYED)

Owner: HC AI Plugin Build. This directory isolates a stateless, anonymous, public-job-only MCP Worker from HC Web/Native, Color LP/blog and Hoiku Poppy. No write tools, candidate information or service-role access. No Cloudflare route, cron, DB migration or existing application changes.

## Verification before any deployment

1. Get explicit approval to create a **new** Worker in the existing Cloudflare account, with no new charges. Do not repurpose an existing Worker, production route, domain or project.
2. Start from wrangler.preview.example.jsonc and choose a distinct Worker name and a real, unique Cloudflare rate-limit namespace ID (the example 1001 is a placeholder). Set the exact dedicated Worker HTTPS hostname in HC_MCP_PUBLIC_HOST. This MVP accepts only dedicated `hc-preview.<account>.workers.dev` or `hoikucolor-mcp-preview[-suffix].<account>.workers.dev` names; arbitrary custom domains, production HC/Poppy hosts and unrelated Workers are refused until separately reviewed. Keep HC_MCP_PREVIEW_ENABLED=false until isolated credentials and permission checks pass.
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


## Offline independent-Worker configuration gate (2026-10-24)

To minimize the still-blocked Cloudflare setup step, generate a **local-only** Worker configuration for a single dedicated `workers.dev` name. This does **not** connect to Cloudflare, create a Worker, incur charges, deploy code or modify existing DNS/routing.

```sh
cd mcp/preview
node --test prepare-standalone.test.mjs
node prepare-standalone.mjs <your-workers-dev-subdomain> <unused-integer-rate-namespace>
# Generates wrangler.preview.local.json (disabled; gitignored; fails if already present).
npm install --ignore-scripts --no-audit --no-fund
npx wrangler deploy --dry-run --config wrangler.preview.local.json
```

The supplied subdomain must be the **Cloudflare account's workers.dev subdomain only**, not a complete URL. Choose a rate-limit namespace integer that is genuinely unused in that account; the script rejects the example `1001` but **cannot query Cloudflare to verify uniqueness**. The dedicated Worker name is fixed as `hoikucolor-mcp-preview-only`. The generated config has `workers_dev: true`, no routes/custom domain, and `HC_MCP_PREVIEW_ENABLED=false`. It never embeds credentials. Existing HC, Poppy, or blog Cloudflare deployments are out of scope.

**Do not activate or deploy without an authorized isolated Worker account connection and a separate check that this name is unused.** Only the owner should prepare the public `HC_SUPABASE_URL` root and `sb_publishable_`-only `HC_SUPABASE_PUBLISHABLE_KEY` as Cloudflare Worker secret bindings; do not store them in JSON or GitHub. The source URL must match the verified shared HC project and anonymous RPC permissions. Before any authorized deployment, revalidate exact workers.dev hostname, absence of production routes, unique rate namespace, safe account plan/cost, credential scope and no concurrent Worker deployment. Set the enable flag to `true` **only after those gates**, and rerun `verifyStandalonePreviewConfig(config, {requireEnabled:true})` from the generator module; this static check does not prove Cloudflare account isolation or genuine key validity. Keep the feature PR Draft. 

CI runs the six offline safety cases, real Workers bundling with both the example and a generated inactive standalone config, and Worker MCP SDK tests **without any Cloudflare authentication or deploy**. These are preparation gates, not a live HTTPS Preview or ChatGPT test. Only the latter can satisfy the real-job-search acceptance condition.
