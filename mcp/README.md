# Hoiku Color public-job MCP adapter — isolated foundation

## Status / ownership

Independent **read-only adapter** for a future ChatGPT/Claude remote MCP server. This is not a deployed MCP endpoint, OAuth server or submitted plugin. No database migrations and no changes to existing HC Web/Native/LP flows. Owner: HC AI Plugin Build. Initial source base: `app.hoikucolor-recruit` main `c5f7c546893413c6b23652fc04c18328362dd1ce`.

## Verified underlying data contract

The public LP `hoikucolor-lp/src/lib/publicJobs.ts` uses **`hc_public_search_jobs_v2`** and **`hc_public_job_feed_v2`**, not the legacy `hc_public_job_feed` (a separate, older Hoiku Color-internal feed). The final search function definition is under `hoikucolor-lp/docs/sql/hc_public_job_search_performance.sql` (2026-10-07); it joins eligible HC internal jobs with time-limited external source IDs. The app's `hc_jobseeker_search_jobs_v2` and saved/profile RPCs are authenticated-only and deliberately excluded here.

The current (2026-10-16) read-only audit of the older `hc_public_job_feed` returned 0 rows; **that does not measure the v2 published catalog**. Follow-up SQL of v2 was blocked by tool safety checks, so the live v2 row count and production grant state remain unverified. Do not describe local mock tests as live-data tests.

## Usage

Import `publicJobToolDefinitions` and `publicCatalogToolHandlers({supabaseUrl, publishableKey, fetcher, now})` from `public-jobs.mjs`. Integrate these into an official MCP SDK HTTP server **after the isolated tests**. Set `supabaseUrl` to the project HTTPS origin and set `publishableKey` to a **public `sb_publishable_` key or verified legacy `anon` JWT** in the deployment environment; do not use `service_role` or any `sb_secret_` key. The keys are never accepted as model-supplied tool arguments.

Available read-only functions: `search_public_childcare_jobs` (keyword, prefecture, employment_type, bounded offset/limit) and `get_public_childcare_job` (UUID). Output is tightly allowlisted, contains only `https://hoikucolor.jp/jobs/<id>` canonical URLs, and declines expired jobs or external jobs without a verification timestamp within 12 hours. Application submissions, saved jobs, Clerk identity and private candidate information are out of scope.

## Local tests

`node --test mcp/qa/public-jobs.test.mjs`

## Remaining acceptance gates

1. Recheck live v2 RPC anonymous execution/response from a verified isolated client and actual deploy permissions. Stop if permissions differ. Use no privileged key or bypass.
2. Create an isolated **SDK-backed** stateless Streamable HTTP `/mcp` endpoint, compatible with MCP 2026-07-28 and supported legacy clients. Validate Origin, resource permissions, body size, rate limits, upstream timeouts and audit metadata; do not allow arbitrary upstream URLs.
3. Test with MCP Inspector and ChatGPT using public live records only; verify empty, closed, missing, malformed, network failure, source expiry, pagination, candidate/tenant leaks and mobile behavior.
4. Add OAuth Authorization Code + PKCE, audience/scope/issuer checks and Clerk candidate binding **only before adding private saved/profile tools**. No auth bypass via service-role credentials.
5. Deployment, new paid services, DB changes and plugin directory submission require separate approvals. Respect one Cloudflare production release per NZ calendar day per site.

Reference: https://developers.openai.com/plugins/build/mcp-server , https://developers.openai.com/plugins/build/auth , https://developers.openai.com/plugins/build/plugins .

## 2026-10-16 follow-up — official MCP SDK v2 bridge (local only)

The current MCP protocol is **2026-07-28**. The official TypeScript SDK v2 uses `@modelcontextprotocol/server` and `@modelcontextprotocol/node`; its `createMcpHandler` also supports stateless legacy clients. The older `@modelcontextprotocol/sdk` v1 is a maintained but older protocol line. The independent `sdk-bridge.mjs` now registers the same two public tools with strict Zod argument schemas and structured MCP results. `serve-local.mjs` mounts it to `127.0.0.1` with the official Node adapter after dependencies are installed. No production endpoint, registered ChatGPT connection, OAuth, or real data response has been verified.

Run after installing pinned dependencies in an isolated environment with normal package-resolution access (no secrets in source control):

```
cd mcp
npm install
npm test
HC_SUPABASE_URL='https://<project>.supabase.co/' HC_SUPABASE_PUBLISHABLE_KEY='<publishable key>' npm run start:local
npx @modelcontextprotocol/inspector
```

The gateway is **anonymous-only**. Authorization and Cookie headers are rejected until candidate OAuth is separately implemented. Origin/Host are allowlisted, HTTP is loopback-only, GET/DELETE are rejected in stateless mode, and request bodies have a 64 KiB upper bound at the MCP SDK parser. The API adapter may only use an `sb_publishable_` key or verified `anon` JWT, never a secret/service-role key. The SDK is not present in this sandbox, so these run instructions are *not* evidence of SDK installation, live MCP Inspector success or an actual ChatGPT connection.

Local verification: `node --test mcp/qa/*.test.mjs`: **22/22 PASS** (11 previous adapter tests + 11 new bridge/policy tests). The new tests validate handler registration through a mocked SDK object; they do not replace an actual Inspector/network/real DB end-to-end test. `mcp/qa/test-results-20261016-followup.txt` records the complete log. Main reference remains `c5f7c546893413c6b23652fc04c18328362dd1ce` and the pre-existing branch initially matched main. GitHub connector accepted the isolated `mcp/package.json` commit but rejected adding the adapter code with an explicit safety check; do not retry via another route or claim a PR exists. The branch must not be merged in its current incomplete state.

## 2026-10-15 verification — public filter facets (local only)

The anonymous `hc_public_job_search_facets_v2()` RPC exists in the shared Supabase project and `anon` has EXECUTE privilege; the public `hc_public_search_jobs_v2()` RPC and `hc_public_job_feed_v2` SELECT also have anonymous privileges. A read-only SQL probe returned **0 visible feed rows and 0 search results** at that instant. Therefore a live positive-result ChatGPT trial must not be marked PASS until approved published sample data exists. No job rows or private account data were obtained in this probe. A separate aggregate check on the source import tables was refused by tool safety checks and was not retried.

A new third anonymous tool, `list_public_childcare_job_filters`, uses only the public `hc_public_job_search_facets_v2` RPC to provide currently available prefecture/employment-type search suggestions. It forbids all user-supplied arguments, handles an object or one-row-table RPC response, keeps only allowlisted public strings, rejects malformed or oversized lists, and never returns unpublished job records or applicant data. This is **an independent local adapter/registration test**, not a real MCP SDK/Inspector/live-endpoint connection. The remote SDK package cannot be installed in the current sandbox because npm registry DNS is unavailable (`EAI_AGAIN`). This run's `node --test qa/*.test.mjs` passed 26/26 cases; no production deployment or GitHub commit is claimed.

## 2026-10-16 — anonymous gateway abuse controls (local QA only)

- `anonymous-guard.mjs` adds a deterministic 30-requests/minute **single-process global** rate limiter for the loopback launcher. It does not trust `X-Forwarded-For` or pretend to identify a user/IP. Production deployment must replace it with a distributed, trusted-edge admission policy.
- `sdk-bridge.mjs` now rejects **any non-loopback host configuration** unless explicit `security.admit` and `security.audit` callbacks are injected. A failed guard or audit is an HTTP 503, and denial is an HTTP 429 with no-store/Retry-After. The guard receives no request headers, tool arguments, account identifiers, or token. Audit logs decision codes only. Host/origin/credential checks still precede the guard.
- `serve-local.mjs` supplies both loopback-only controls and sets the Node adapter's body buffering cap to **64 KiB**, matching the SDK-side cap.
- The local node:test suite passes **35/35** using SDK-shaped fakes, **not** a real SDK, Inspector, HTTPS Preview, or ChatGPT connection. `npm install` is still blocked by registry DNS `EAI_AGAIN`; do not describe this as protocol E2E success.
- Read-only production audit on 2026-10-16 NZDT: `hc_public_job_feed_v2=0`, `hc_public_search_jobs_v2` sample `=0`, external active source records `25,831`, last verification `2026-10-14 18:17:05 UTC`, and no source verified in the past 12h. These are *counts*, not user/candidate records. The existing 12h publication freshness gate is the immediate reason the external public feed is empty. Historical daily patrol setting (2026-10-14) refreshes only a bounded batch daily; do not alter that schedule or relax freshness here. See `qa/read-only-db-audit-20261016.md`.

Outstanding: submit all files on the existing HC-only branch, pass actual SDK/Inspector `initialize → tools/list → tools/call`, configure a trusted distributed limiter/observability, test the real public API with a verified public key, run isolated HTTPS Preview, ChatGPT connector and separate OAuth later. No main merge, Supabase writes, external submissions, or Cloudflare publication in this work.

## 2026-10-16 08:32 NZDT — reproducible anonymous REST smoke probe

Added `qa/anonymous-http-smoke.mjs` (run `npm run test:anon-http`) and 9 isolated tests. This opt-in script only uses the existing public Supabase search, facet and published detail endpoints. It enforces the existing server-side output projection, reports aggregate counts and a detail-availability state, and rejects private keys or attacker-configured upstream domains. Set `HC_REQUIRE_PUBLIC_JOBS=1` to fail when the search is unexpectedly empty. The runner emits no job descriptions, applicant information, job IDs or API keys. **It is a REST acceptance precursor, not an MCP Inspector/ChatGPT connection test.**

The connected project's v2 catalog was observed to have **21 anonymous-view-eligible rows, all external**, with a v2 RPC page of 10 results, compared with the earlier 0-row snapshot. The backend metadata matched the adapter's RPC signature and field projections. These were read-only SQL checks, not remote public-key REST tests. See `qa/catalog-visibility-audit-20261016.md`. The 12-hour freshness window remains in force, so the count may fall again. No automated ingestion changes are authorized from this commander.

## 2026-10-16 — protocol-level HTTP acceptance probe (run 4; offline tests)

Added `qa/mcp-protocol-probe.mjs` and `qa/mcp-protocol-probe.test.mjs`, `qa/mcp-protocol-loopback.test.mjs`, plus `npm run test:protocol`.
This opt-in probe uses only anonymous JSON-RPC/HTTP calls to an independently deployed MCP endpoint:

1. `initialize` (2025-06-18 legacy handshake, compatible with the SDK v2's stateless legacy leg);
2. `notifications/initialized`;
3. `tools/list` (must be exactly the three HC public read-only tools);
4. `tools/call` (`search_public_childcare_jobs`, one result maximum);
5. `tools/call` (`list_public_childcare_job_filters`).

It supports JSON and SSE responses (legacy SDK v2 may use SSE despite `responseMode: 'json'`). It refuses HTTPS downgrade on remote hosts, credential-in-URL, non-MCP paths, bad response codes, oversized responses, unapproved tool exposure, PII-shaped fields in public result envelopes, and mismatched MCP `content` versus `structuredContent`. It checks that external job results were verified within 12 hours and excludes closed jobs. Console output is counts and pass/fail codes only—no job IDs, job text, candidate information, or keys.

```
cd mcp
npm test                         # pure Node tests (no external access)
HC_MCP_URL=http://127.0.0.1:3107/mcp npm run test:protocol
# Or set HC_MCP_URL=https://<approved-isolated-preview-host>/mcp
```

This run has **69/69 PASS** (prior 55 + 13 simulated fetch cases + 1 actual loopback HTTP case using a synthetic JSON-RPC peer). This tests the probe logic, NOT the real MCP server protocol. The actual SDK and MCP Inspector still need normal npm registry connectivity; `npm view @modelcontextprotocol/server` failed `EAI_AGAIN` in this environment. The new protocol probe itself has not successfully connected to a real endpoint, because none has been deployed or started here. HTTPS Preview, ChatGPT invocation, OAuth, Directory review, Supabase writes, main merge, and Cloudflare production remain **not completed**.

GitHub read-only recheck: `workmarketjp-gif/app.hoikucolor-recruit` main `c5f7c546893413c6b23652fc04c18328362dd1ce`, existing MCP branch `feat/hc-mcp-public-catalog-20261016` at `1555656ad0b56514429900351f5517463c8dedf1` with `mcp/package.json` only. No root AGENTS.md in the HC repository. Open PRs: none. This run's code is an isolated local patch; GitHub write permission/safety-check failures in prior runs have not been bypassed. Do not merge a manifest-only branch.

Next acceptance unit: in an isolated npm-enabled CI/Preview environment, install the real SDK, run `npm test`, start `serve-local.mjs` with a **public Supabase publishable key**, then run `npm run test:protocol` and Inspector against the real server, recording the endpoint/version/HTTP evidence. The authless public read-only MVP must pass before adding candidate OAuth tools. Maintain separation from HC Web/Native, HP, and KIWAMI ownership.

## 2026-10-16 — current MCP 2026-07-28 stateless wire acceptance

Current official MCP clients can use the **2026-07-28** stateless lifecycle rather than the 2025 legacy `initialize` handshake. The existing protocol probe only exercised the SDK's backwards-compatible 2025 path, so it could not establish that an endpoint accepts modern `server/discover` requests. That testing gap has been closed **in the acceptance client**, not yet in a deployed service.

`qa/mcp-protocol-probe.mjs` now includes an explicit `runModernHttpMcpProbe` that sends `server/discover → tools/list → tools/call` without `initialize`, `notifications/initialized` or `Mcp-Session-Id`. Every request carries `MCP-Protocol-Version: 2026-07-28`, the `Mcp-Method` header, `Mcp-Name` on tool calls and the required per-request `_meta` protocol envelope. It verifies `resultType: complete`, the three allowlisted read-only tools, published job visibility, 12-hour freshness and minimal output; it refuses silent legacy fallback on authentication or infrastructure errors. JSON and SSE HTTP responses are supported with a 1 MB response cap and 15-second request timeout. Only aggregate outcome metrics are printed.

```sh
npm test                                                          # 80 pure Node tests; no API credentials
HC_MCP_URL=https://<approved-independent-preview>/mcp npm run test:protocol  # strict 2026-07-28
HC_MCP_URL=http://127.0.0.1:3107/mcp npm run test:protocol:legacy    # opt-in 2025 compatibility
```

This run: **80/80 local tests PASS**, including 11 new tests for modern wire shape, actual loopback HTTP sockets with a synthetic server, SSE, zero-result search, forbidden private fields and write tools, closed/stale jobs, session and result-type rejection, HTTP failures and invalid URLs. The real SDK remains uninstalled here (`EAI_AGAIN` for npm registry); therefore this is **not** real SDK/Inspector/Preview/ChatGPT evidence. The next gate is to run both scripts against a real SDK v2 instance behind an isolated HTTPS Preview with a verified *public* Supabase key. No applications or user profiles are modified.

References: https://blog.modelcontextprotocol.io/posts/2026-07-28/ and https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md .

In the same run, a read-only connected Supabase SQL check found 21 published external jobs (0 internal), 10 rows returned by the public search RPC's first page, one facet response row, and `anon` SELECT/EXECUTE permissions on the public feed/search/facets. This is database evidence only, not a real HTTP MCP connection or permission to touch candidate information.

## 2026-10-16 — typed output contracts (local evidence, not a live MCP run)

The official OpenAI plugin guidance requires output schemas for tools returning structured data. The SDK v2 bridge now declares strict Zod **outputSchema** contracts for all three anonymous read-only tools: public job search, public filter suggestions and a single public-job detail. The search and detail job schemas cover only the 21 projected public fields; applicant email, employer administration and raw upstream data are not part of the contract. Nullable fields, pagination totals and the common untrusted-source note are explicit.

`qa/output-schema-contract.test.mjs` tests schema presence, strictness, typed field allowlists, and exact equality between declared properties and actual projected runtime response keys. This protects future refactors against a new output field leaking silently. Entire isolated suite: **84/84 pass** (`node --test qa/*.test.mjs`). The tests record schema metadata with a tiny stub; they do not claim an SDK v2 runtime, npm/Zod schema validation, live Supabase HTTP access, MCP Inspector, HTTPS Preview or ChatGPT connection.

Read-before-write state: HC app main `c5f7c546893413c6b23652fc04c18328362dd1ce`, HC feature branch `1555656ad0b56514429900351f5517463c8dedf1`; root `AGENTS.md` not found; no open HC PRs. The existing feature branch contains only `mcp/package.json`. A connector write attempting to add the response-size reader was rejected by platform safety checks; it was not retried by an alternate route. No GitHub changes or deployments were made. SDK registry access was unavailable from the isolated runner. Priority remains (1) get owner-authorized GitHub PR with all tested source files, (2) CI npm/Zod install and real SDK transport test, (3) independent HTTPS Preview and anonymous public-job E2E, (4) OAuth/private tools only after successful public-only gates and explicit authority.
