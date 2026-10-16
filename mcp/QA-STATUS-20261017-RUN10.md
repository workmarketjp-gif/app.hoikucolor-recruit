# Hoiku Color MCP — Policy dependency deadline hardening

Scope: anonymous public-job MCP bridge only. No private candidate data, no job publication changes, no production deployment.

- Adds fail-closed, bounded `security.admit` and `security.audit` calls (`2000 ms` default; abort signal forwarded to the trusted delegate).
- Aborted or timed-out policy calls return HTTP 503 before SDK tool dispatch. Failures do not log model prompts, bearer tokens, or client-supplied IP claims.
- Adds timeout, cooperative abort, rejection, config-validation and both accepted/rate-limited audit regression tests.
- Offline suite: 109 / 109 passed; official TypeScript SDK network suite not run (npm DNS EAI_AGAIN).
- GitHub main reviewed at `c5f7c546893413c6b23652fc04c18328362dd1ce` (2026-10-17 NZ). Existing HC MCP branch remains partial and without open PR.
- Attempted fresh isolated GitHub branch `feat/hc-mcp-policy-timeouts-20261017`; created successfully. First file write was blocked by OpenAI safety checks; no code was pushed, no PR created.
- The branch is empty and **not a deployable feature**; local full integration ZIP and cumulative patch remain the source of truth pending an authorized GitHub write path.
- Missing: npm-enabled CI, official SDK, anonymous live HTTP/valid public jobs, isolated HTTPS Preview, ChatGPT E2E, OAuth/private data and plugin review.
