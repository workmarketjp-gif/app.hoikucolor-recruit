/**
 * Hoiku Color public catalog — MCP TypeScript SDK v2 bridge.
 *
 * Only anonymous, published jobs. No authentication, saved jobs, applications,
 * applicant data, job edits, or service-role access can be reached here.
 *
 * The dependency-injected factory makes its authorization and registration
 * policy independently testable without using production credentials.
 */
import { publicCatalogToolHandlers, publicJobToolDefinitions } from './public-jobs.mjs';
import { PublicMcpBodyError, readBoundedPublicMcpBody } from './request-body-deadline.mjs';
import { runPolicyWithDeadline } from './policy-deadline.mjs';
import { dispatchWithDeadline } from './dispatch-deadline.mjs';
import { ensurePublicToolAuthWire } from './tool-list-auth-wire.mjs';

const MAX_TOOL_TEXT_BYTES = 50_000;
const TOOL_ERRORS = new Map([
  ['INVALID_ARGUMENTS', '検索条件が正しくありません。'],
  ['INVALID_JOB_ID', '求人IDが正しくありません。'],
  ['UNSUPPORTED_ARGUMENT', '利用できない検索条件です。'],
]);

function toolSchema(name, z) {
  if (name === 'search_public_childcare_jobs') {
    return z.object({
      keyword: z.string().max(100).optional(),
      prefecture: z.string().max(32).optional(),
      employment_type: z.string().max(50).optional(),
      limit: z.number().int().min(1).max(20).optional(),
      offset: z.number().int().min(0).max(500).optional(),
    }).strict();
  }
  if (name === 'list_public_childcare_job_filters') return z.object({}).strict();
  if (name === 'get_public_childcare_job') {
    return z.object({ job_id: z.string().uuid() }).strict();
  }
  throw new Error('UNKNOWN_TOOL');
}

/**
 * Explicit typed outputs make tools/list useful to ChatGPT and Claude clients.
 * Schemas mirror the *allowlisted* publicProjection, not the upstream SQL row.
 * Strict object shapes prevent future DB fields from becoming tool contracts.
 */
function publicJobOutputSchema(z) {
  const maybeText = () => z.string().nullable();
  const maybeNumber = () => z.number().finite().nonnegative().nullable();
  return z.object({
    id: z.string().uuid(),
    title: z.string(),
    facility_name: maybeText(),
    organization_name: maybeText(),
    facility_type: maybeText(),
    prefecture: maybeText(),
    city: maybeText(),
    employment_type: maybeText(),
    salary_type: maybeText(),
    salary_min: maybeNumber(),
    salary_max: maybeNumber(),
    salary_note: maybeText(),
    required_qualification: maybeText(),
    description: maybeText(),
    published_at: z.string(),
    closing_at: maybeText(),
    is_external: z.boolean(),
    source_name: maybeText(),
    source_last_verified_at: maybeText(),
    has_verified_workplace_metrics: z.boolean().nullable(),
    url: z.string().url(),
  }).strict();
}

function publicToolOutputSchema(name, z) {
  if (name === 'search_public_childcare_jobs') {
    return z.object({
      jobs: z.array(publicJobOutputSchema(z)).max(20),
      returned: z.number().int().min(0).max(20),
      reported_total: z.number().int().min(0).nullable(),
      offset: z.number().int().min(0).max(500),
      requested_limit: z.number().int().min(1).max(20),
      next_offset: z.number().int().min(0).max(500).nullable(),
      possible_more_source_rows: z.boolean(),
      scanned_source_rows: z.number().int().min(0).max(80),
      note: z.string(),
    }).strict();
  }
  if (name === 'list_public_childcare_job_filters') {
    return z.object({
      prefectures: z.array(z.string()).max(47),
      employment_types: z.array(z.string()).max(60),
      note: z.string(),
    }).strict();
  }
  if (name === 'get_public_childcare_job') {
    return z.object({ job: publicJobOutputSchema(z).nullable(), note: z.string() }).strict();
  }
  throw new Error('UNKNOWN_TOOL');
}

// Upstream public text redaction can hide an IDN domain yet leave an
// SMTPUTF8 (Japanese) mailbox local part, such as "山田@[連絡先省略]".
// Fail closed at the MCP serialization boundary for BOTH tool response forms.
const RESIDUAL_UNICODE_MAILBOX = /[\p{L}\p{N}._%+-]{1,64}[@＠]\[連絡先省略\]/gu;
function scrubResidualPublicContacts(value) {
  if (typeof value === 'string') return value.replace(RESIDUAL_UNICODE_MAILBOX, '[連絡先省略]');
  if (Array.isArray(value)) return value.map(scrubResidualPublicContacts);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, scrubResidualPublicContacts(item)]));
  }
  return value;
}
export function publicToolResult(result) {
  const safeResult = scrubResidualPublicContacts(result);
  const text = JSON.stringify(safeResult);
  if (Buffer.byteLength(text, 'utf8') > MAX_TOOL_TEXT_BYTES) throw new Error('OUTPUT_TOO_LARGE');
  return {
    content: [{ type: 'text', text }],
    structuredContent: safeResult,
  };
}

function sanitizedToolError(error) {
  const code = typeof error?.message === 'string' ? error.message : '';
  let message = TOOL_ERRORS.get(code);
  if (!message && /^INVALID_[A-Z_]+$/.test(code)) message = '検索条件が正しくありません。';
  if (!message) message = '公開求人情報を取得できませんでした。時間をおいて再試行してください。';
  return { isError: true, content: [{ type: 'text', text: message }] };
}

export function registerPublicCatalogTools(server, z, config) {
  if (typeof server?.registerTool !== 'function' || typeof z?.object !== 'function') {
    throw new Error('MCP_SDK_REQUIRED');
  }
  const handlers = publicCatalogToolHandlers(config);
  for (const { name, title, description, annotations } of publicJobToolDefinitions) {
    server.registerTool(name, {
      title, description,
      inputSchema: toolSchema(name, z),
      outputSchema: publicToolOutputSchema(name, z),
      // ChatGPT plugin auth discovery needs an explicit, per-tool declaration.
      // This adapter is public-only: never advertise OAuth scopes or imply
      // that sending an account token unlocks private candidate records.
      securitySchemes: [{ type: 'noauth' }],
      annotations,
    }, async (args) => {
      try { return publicToolResult(await handlers[name](args || {})); }
      catch (error) { return sanitizedToolError(error); }
    });
  }
  return server;
}

const SERVER_NAME = 'hoiku-color-public-jobs';
const MAX_REQUEST_BODY_BYTES = 64 * 1024;

function forbidden(message = 'Forbidden') {
  return new Response(message, { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}

/**
 * Create an SDK-backed Streamable HTTP fetch handler with fail-closed origin,
 * host, route, credential and request-size rules. This does not itself listen
 * or deploy and is limited to anonymous catalog queries.
 */
export function createColorMcpGateway({ McpServer, createMcpHandler, z }, config, security) {
  if (!config || !security || typeof McpServer !== 'function' || typeof createMcpHandler !== 'function') {
    throw new Error('MCP_GATEWAY_CONFIG_REQUIRED');
  }
  const allowedHosts = new Set(security.allowedHosts || []);
  const allowedOrigins = new Set(security.allowedOrigins || []);
  if (!allowedHosts.size || [...allowedHosts].some(x => typeof x !== 'string' || x.includes('://') || x === '*')) {
    throw new Error('MCP_ALLOWED_HOSTS_REQUIRED');
  }
  if ([...allowedOrigins].some(x => typeof x !== 'string' || !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(x))) {
    throw new Error('MCP_ALLOWED_ORIGINS_INVALID');
  }
  // Remote use is fail-closed until an independent edge supplies both controls.
  // Do not accept forwarded IP headers or untrusted model fields as rate-limit keys.
  const remoteHosts = [...allowedHosts].filter((host) => !/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(host));
  if (remoteHosts.length &&
      (typeof security.admit !== 'function' || typeof security.audit !== 'function')) {
    throw new Error('MCP_REMOTE_CONTROLS_REQUIRED');
  }
  // Trusted launcher may tighten the policy deadline in isolated QA, but
  // remote endpoints may never disable it or increase it above ten seconds.
  const policyDeadlineMs = security.policyDeadlineMs ?? 2_000;
  if (!Number.isSafeInteger(policyDeadlineMs) || policyDeadlineMs < 1 || policyDeadlineMs > 10_000) {
    throw new Error('MCP_POLICY_DEADLINE_CONFIG_INVALID');
  }
  const toolDeadlineMs = security.toolDeadlineMs ?? 8_000;
  if (!Number.isSafeInteger(toolDeadlineMs) || toolDeadlineMs < 100 || toolDeadlineMs > 30_000) {
    throw new Error('MCP_TOOL_DEADLINE_CONFIG_INVALID');
  }
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: SERVER_NAME, version: '0.1.0' });
    return registerPublicCatalogTools(server, z, config);
  }, { maxRequestBodySize: MAX_REQUEST_BODY_BYTES, responseMode: 'json', legacy: 'stateless' });
  return {
    close: () => handler.close?.(),
    async fetch(request) {
      const target = new URL(request.url);
      if (target.pathname !== '/mcp') return new Response('Not Found', { status: 404 });
      // Never accept credentials, tracking data or transport state in the URL.
      // Reject even an empty '?' or '#' before admission, auditing or SDK dispatch.
      // A canonical MCP endpoint is exactly https://<dedicated-host>/mcp.
      if (target.href !== `${target.origin}/mcp`) return forbidden();
      if (request.method === 'GET' || request.method === 'DELETE') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
      if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
      // HTTPS at the public edge. Plain HTTP is only allowed for loopback QA.
      const isLoopback = target.hostname === 'localhost' || target.hostname === '127.0.0.1';
      if (target.protocol !== 'https:' && !(isLoopback && security.allowLocalHttp === true)) return forbidden();
      if (!allowedHosts.has(target.host)) return forbidden();
      const claimedHost = request.headers.get('host');
      if (claimedHost && claimedHost !== target.host) return forbidden();
      const origin = request.headers.get('origin');
      if (origin && !allowedOrigins.has(origin)) return forbidden();
      // This phase is intentionally anonymous-only. No hidden private access
      // paths should be created by supplying credentials or cookie sessions.
      // Reject alternate credential-bearing headers before admission, audit or
      // SDK dispatch. This server intentionally supports anonymous public jobs
      // only; forwarding credentials to a generic MCP handler is unnecessary.
      // Candidate OAuth is a separate future endpoint and consent boundary.
      const credentialHeaders = [
        'authorization', 'cookie', 'proxy-authorization', 'x-api-key',
        'x-auth-token', 'x-supabase-api-key',
      ];
      if (credentialHeaders.some(name => request.headers.has(name))) return forbidden();
      const ctype = request.headers.get('content-type') || '';
      if (!/^application\/json(?:\s*;|$)/i.test(ctype)) return new Response('Unsupported Media Type', { status: 415 });
      const contentLength = request.headers.get('content-length');
      if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_REQUEST_BODY_BYTES)) {
        return new Response('Payload Too Large', { status: 413 });
      }
      // The official SDK also enforces streaming body limits and protocol
      // validation; never parse / reflect untrusted model content here.
      if (typeof security.admit === 'function') {
        // Only a trusted edge/launcher provides the policy; no model or request
        // header controls the limiter identity, cost, or protected data scope.
        let admitted;
        try { admitted = (await runPolicyWithDeadline(
          (signal) => security.admit(signal),
          { deadlineMs: policyDeadlineMs, parentSignal: request.signal },
        )) === true; }
        catch { return new Response('Service Unavailable', { status: 503, headers: { 'cache-control': 'no-store' } }); }
        if (!admitted) {
          try { await runPolicyWithDeadline(
            (signal) => security.audit?.({ decision: 'rate_limited' }, signal),
            { deadlineMs: policyDeadlineMs, parentSignal: request.signal },
          ); }
          catch { return new Response('Service Unavailable', { status: 503, headers: { 'cache-control': 'no-store' } }); }
          return new Response('Too Many Requests', { status: 429,
            headers: { 'retry-after': '60', 'cache-control': 'no-store' } });
        }
      }
      try { await runPolicyWithDeadline(
        (signal) => security.audit?.({ decision: 'accepted' }, signal),
        { deadlineMs: policyDeadlineMs, parentSignal: request.signal },
      ); }
      catch { return new Response('Service Unavailable', { status: 503, headers: { 'cache-control': 'no-store' } }); }
      // Read once under an absolute deadline before entering the SDK. A caller
      // can otherwise send an endless chunked body without Content-Length and
      // monopolise connections despite SDK byte-limit checks.
      let body;
      try { body = await readBoundedPublicMcpBody(request, { maxBytes: MAX_REQUEST_BODY_BYTES }); }
      catch (error) {
        const status = error instanceof PublicMcpBodyError ? error.status : 400;
        return new Response(status === 413 ? 'Payload Too Large' :
          status === 408 ? 'Request Timeout' : 'Bad Request', {
          status, headers: { 'cache-control': 'no-store' },
        });
      }
      const headers = new Headers(request.headers);
      headers.delete('content-length');
      const forwarded = new Request(request.url, {
        method: 'POST', headers, body, signal: request.signal,
      });
      try {
        const response = await dispatchWithDeadline(handler, forwarded, { deadlineMs: toolDeadlineMs });
        return await ensurePublicToolAuthWire(body, response);
      } catch {
        // Never forward an SDK exception, partial result or late tool output.
        return new Response('Service Unavailable', {
          status: 503, headers: { 'cache-control': 'no-store' },
        });
      }
    },
  };
}
