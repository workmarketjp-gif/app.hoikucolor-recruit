/**
 * Hoiku Color anonymous MCP protocol acceptance probe.
 *
 * This probe talks to a real HTTP endpoint, not a mocked SDK, when given
 * HC_MCP_URL. It does not use credentials, ask for candidate data, or mutate.
 * It deliberately emits counts and protocol status only: never job content.
 *
 * Usage: HC_MCP_URL=https://<approved-preview-host>/mcp node qa/mcp-protocol-probe.mjs
 * For an opt-in loopback server, http://127.0.0.1:<port>/mcp is also allowed.
 */
import { pathToFileURL } from 'node:url';

const MAX_HTTP_RESPONSE_BYTES = 1_000_000;
const MAX_TIMEOUT_MS = 15_000;
const TOOL_NAMES = Object.freeze([
  'search_public_childcare_jobs',
  'list_public_childcare_job_filters',
  'get_public_childcare_job',
]);
const CATALOG_KEYS = new Set([
  'jobs', 'returned', 'reported_total', 'offset', 'requested_limit',
  'next_offset', 'possible_more_source_rows', 'scanned_source_rows', 'note',
]);
const JOB_KEYS = new Set([
  'id', 'title', 'facility_name', 'organization_name', 'facility_type',
  'prefecture', 'city', 'employment_type', 'salary_type', 'salary_min',
  'salary_max', 'salary_note', 'required_qualification', 'description',
  'published_at', 'closing_at', 'is_external', 'source_name',
  'source_last_verified_at', 'has_verified_workplace_metrics', 'url',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function check(ok, code) { if (!ok) throw new Error(code); }
function endpointURL(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('PROBE_URL_INVALID'); }
  const loopback = ['127.0.0.1', 'localhost'].includes(url.hostname);
  check((url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) &&
    url.pathname === '/mcp' && !url.username && !url.password && !url.search && !url.hash,
  'PROBE_URL_NOT_ALLOWED');
  return url;
}
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function protocolReply(value, id) {
  check(isObject(value) && value.jsonrpc === '2.0' && value.id === id, 'PROBE_RPC_REPLY_INVALID');
  check(!('error' in value), 'PROBE_RPC_ERROR');
  check(isObject(value.result), 'PROBE_RPC_RESULT_INVALID');
  return value.result;
}

/** Decode a bounded response, including legacy Streamable HTTP SSE messages. */
async function readReply(response, expectedId) {
  const ctype = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  check(ctype === 'application/json' || ctype === 'text/event-stream', 'PROBE_CONTENT_TYPE_INVALID');
  const declared = response.headers.get('content-length');
  if (declared !== null) check(/^\d+$/.test(declared) && Number(declared) <= MAX_HTTP_RESPONSE_BYTES, 'PROBE_RESPONSE_TOO_LARGE');
  check(response.body && typeof response.body.getReader === 'function', 'PROBE_STREAM_REQUIRED');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let total = 0;
  let data = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      check(value instanceof Uint8Array, 'PROBE_STREAM_INVALID');
      total += value.byteLength;
      check(total <= MAX_HTTP_RESPONSE_BYTES, 'PROBE_RESPONSE_TOO_LARGE');
      data += decoder.decode(value, { stream: true });
      if (ctype === 'text/event-stream') {
        // Parse complete SSE frames as they arrive; do not wait for a stream
        // that a server may intentionally keep open for other events.
        data = data.replace(/\r\n/g, '\n');
        let boundary;
        while ((boundary = data.indexOf('\n\n')) >= 0) {
          const event = data.slice(0, boundary);
          data = data.slice(boundary + 2);
          const payload = event.split('\n').filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).trimStart()).join('\n');
          if (!payload) continue;
          let message;
          try { message = JSON.parse(payload); } catch { throw new Error('PROBE_SSE_INVALID'); }
          if (message.id === expectedId) return protocolReply(message, expectedId);
        }
      }
    }
    data += decoder.decode();
    if (ctype === 'application/json') {
      let value;
      try { value = JSON.parse(data); } catch { throw new Error('PROBE_JSON_INVALID'); }
      return protocolReply(value, expectedId);
    }
    throw new Error('PROBE_SSE_REPLY_MISSING');
  } catch (error) {
    if (error instanceof TypeError) throw new Error('PROBE_STREAM_INVALID');
    throw error;
  } finally {
    try { await reader.cancel(); } catch { /* already closed */ }
    reader.releaseLock();
  }
}

function toolContent(result, code) {
  check(result.isError !== true && isObject(result.structuredContent), code);
  check(Array.isArray(result.content) && result.content.length === 1 &&
    result.content[0]?.type === 'text' && typeof result.content[0]?.text === 'string',
  'PROBE_TOOL_CONTENT_INVALID');
  let textValue;
  try { textValue = JSON.parse(result.content[0].text); }
  catch { throw new Error('PROBE_TOOL_CONTENT_INVALID'); }
  check(JSON.stringify(textValue) === JSON.stringify(result.structuredContent), 'PROBE_TOOL_CONTENT_MISMATCH');
  return result.structuredContent;
}

function validateJob(job, now) {
  check(isObject(job), 'PROBE_JOB_INVALID');
  check(Object.keys(job).every(key => JOB_KEYS.has(key)), 'PROBE_PRIVATE_FIELD_DETECTED');
  // Search/result projections are flat public scalars. A nested object can
  // smuggle applicant data inside an otherwise allowlisted field name.
  for (const [key, value] of Object.entries(job)) {
    check(value === null || ['string', 'number', 'boolean'].includes(typeof value), 'PROBE_PRIVATE_FIELD_DETECTED');
    if (typeof value === 'string') check(value.length <= 2_000, 'PROBE_JOB_VALUE_TOO_LARGE');
    if (typeof value === 'number') check(Number.isFinite(value), 'PROBE_JOB_VALUE_INVALID');
    if (key.startsWith('salary_') && ['salary_min', 'salary_max'].includes(key)) {
      check(value === null || (typeof value === 'number' && value >= 0), 'PROBE_JOB_VALUE_INVALID');
    }
  }
  check(typeof job.id === 'string' && UUID.test(job.id), 'PROBE_JOB_ID_INVALID');
  check(job.url === `https://hoikucolor.jp/jobs/${job.id}`, 'PROBE_JOB_URL_INVALID');
  check(job.is_external === true || job.is_external === false, 'PROBE_JOB_VISIBILITY_INVALID');
  const published = Date.parse(job.published_at);
  check(Number.isFinite(published) && published <= now, 'PROBE_JOB_PUBLICATION_INVALID');
  if (job.closing_at !== null) {
    const closing = Date.parse(job.closing_at);
    check(Number.isFinite(closing) && closing > now, 'PROBE_CLOSED_JOB_LEAK');
  }
  if (job.is_external) {
    const verified = Date.parse(job.source_last_verified_at);
    check(Number.isFinite(verified) && verified >= now - 12 * 3_600_000 && verified <= now + 300_000,
      'PROBE_STALE_EXTERNAL_JOB_LEAK');
  }
}

export async function runHttpMcpProbe({ url, fetcher = globalThis.fetch, now = Date.now, requirePublished = false } = {}) {
  const endpoint = endpointURL(url);
  check(typeof fetcher === 'function' && typeof now === 'function', 'PROBE_CONFIG_INVALID');
  let sessionId;
  let protocolVersion;
  async function exchange(id, method, params) {
    const headers = {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;
    if (protocolVersion) headers['mcp-protocol-version'] = protocolVersion;
    const payload = { jsonrpc: '2.0', ...(id === null ? {} : { id }), method, ...(params ? { params } : {}) };
    let response;
    try {
      response = await fetcher(endpoint.toString(), {
        method: 'POST', headers, body: JSON.stringify(payload), redirect: 'error',
        signal: AbortSignal.timeout(MAX_TIMEOUT_MS),
      });
    } catch { throw new Error('PROBE_TRANSPORT_FAILURE'); }
    check(response && (response.status === 200 || (id === null && [202, 204].includes(response.status))), 'PROBE_HTTP_STATUS_INVALID');
    if (id === null) return null;
    const newSessionId = response.headers.get('mcp-session-id');
    if (newSessionId) {
      check(/^[\x21-\x7e]{1,256}$/.test(newSessionId), 'PROBE_SESSION_ID_INVALID');
      if (sessionId) check(newSessionId === sessionId, 'PROBE_SESSION_CHANGED');
      sessionId = newSessionId;
    }
    return readReply(response, id);
  }

  const hello = await exchange(1, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'hoiku-color-anonymous-acceptance', version: '0.1.0' },
  });
  check(isObject(hello) && typeof hello.protocolVersion === 'string' && isObject(hello.capabilities),
    'PROBE_INITIALIZE_INVALID');
  check(hello.protocolVersion.startsWith('2025-'), 'PROBE_PROTOCOL_UNEXPECTED');
  protocolVersion = hello.protocolVersion;
  await exchange(null, 'notifications/initialized');
  return verifyPublicCatalog(exchange, protocolVersion, now, requirePublished);
}

async function verifyPublicCatalog(exchange, protocolVersion, now, requirePublished = false) {
  const listed = await exchange(2, 'tools/list', {});
  check(Array.isArray(listed.tools), 'PROBE_TOOLS_INVALID');
  check(listed.tools.length === TOOL_NAMES.length &&
    TOOL_NAMES.every(name => listed.tools.some(tool => tool?.name === name)) &&
    listed.tools.every(tool => tool.annotations?.readOnlyHint === true &&
      tool.annotations?.destructiveHint === false &&
      JSON.stringify(tool.securitySchemes) === '[{"type":"noauth"}]'),
  'PROBE_UNEXPECTED_TOOL_EXPOSURE');
  const search = await exchange(3, 'tools/call', {
    name: 'search_public_childcare_jobs', arguments: { limit: 1, offset: 0 },
  });
  const catalog = toolContent(search, 'PROBE_SEARCH_FAILED');
  check(Object.keys(catalog).length === CATALOG_KEYS.size &&
    Object.keys(catalog).every(k => CATALOG_KEYS.has(k)), 'PROBE_PRIVATE_FIELD_DETECTED');
  check(Number.isSafeInteger(catalog.offset) && catalog.offset >= 0 && catalog.offset <= 500 &&
    Number.isSafeInteger(catalog.requested_limit) && catalog.requested_limit >= 1 && catalog.requested_limit <= 20 &&
    Number.isSafeInteger(catalog.returned) && catalog.returned >= 0 && catalog.returned <= catalog.requested_limit &&
    (catalog.reported_total === null || (Number.isSafeInteger(catalog.reported_total) && catalog.reported_total >= 0)) &&
    (catalog.next_offset === null || (Number.isSafeInteger(catalog.next_offset) && catalog.next_offset >= 0 && catalog.next_offset <= 500)) &&
    typeof catalog.possible_more_source_rows === 'boolean' &&
    Number.isSafeInteger(catalog.scanned_source_rows) && catalog.scanned_source_rows >= 0 && catalog.scanned_source_rows <= 80 &&
    typeof catalog.note === 'string' && catalog.note.length <= 4_000,
  'PROBE_SEARCH_METADATA_INVALID');
  check(Array.isArray(catalog.jobs) && catalog.jobs.length <= 1 &&
    catalog.returned === catalog.jobs.length, 'PROBE_SEARCH_SHAPE_INVALID');
  for (const job of catalog.jobs) validateJob(job, now());
  // Monitoring may legitimately see zero results. Live acceptance instead
  // demands at least one real published listing over MCP.
  if (requirePublished) check(catalog.jobs.length > 0, 'PROBE_PUBLIC_CATALOG_EMPTY');
  const filters = await exchange(4, 'tools/call', {
    name: 'list_public_childcare_job_filters', arguments: {},
  });
  const facets = toolContent(filters, 'PROBE_FILTERS_FAILED');
  check(Array.isArray(facets.prefectures) && Array.isArray(facets.employment_types), 'PROBE_FILTERS_SHAPE_INVALID');
  check(Object.keys(facets).every(k => ['prefectures', 'employment_types', 'note'].includes(k)),
    'PROBE_PRIVATE_FIELD_DETECTED');

  // Cross-check public search -> public detail over the same MCP transport.
  // The listing may close between the two anonymous reads.
  let detailState = 'not_attempted';
  if (catalog.jobs.length) {
    const selected = catalog.jobs[0];
    const detailReply = await exchange(5, 'tools/call', {
      name: 'get_public_childcare_job', arguments: { job_id: selected.id },
    });
    const detail = toolContent(detailReply, 'PROBE_DETAIL_FAILED');
    check(Object.keys(detail).length === 2 && Object.hasOwn(detail, 'job') &&
      typeof detail.note === 'string' && detail.note.length <= 4_000,
    'PROBE_DETAIL_SHAPE_INVALID');
    if (detail.job === null) {
      detailState = 'disappeared';
    } else {
      validateJob(detail.job, now());
      check(detail.job.id === selected.id, 'PROBE_DETAIL_ID_MISMATCH');
      detailState = 'found';
    }
  }
  // Non-strict monitoring reports a vanished listing without failing.
  // Strict live acceptance, however, must prove search -> detail succeeded:
  // a search hit alone is insufficient evidence for the ChatGPT review gate.
  if (requirePublished) check(detailState === 'found', 'PROBE_PUBLIC_DETAIL_MISSING');
  return Object.freeze({
    status: 'PASS', protocol: protocolVersion, tools: listed.tools.length,
    anonymous_search_returned: catalog.jobs.length,
    public_prefectures: facets.prefectures.length,
    public_employment_types: facets.employment_types.length,
    detail_state: detailState,
  });
}

/**
 * Strict MCP 2026-07-28 acceptance probe.
 *
 * Modern MCP is stateless: it does NOT send initialize/initialized or use
 * session IDs. Each call carries Mcp-Method/Mcp-Name and the full _meta
 * protocol envelope. This is intentionally a separate, non-fallback probe;
 * a legacy-only endpoint must fail rather than be declared modern-ready.
 */
export async function runModernHttpMcpProbe({ url, fetcher = globalThis.fetch, now = Date.now, requirePublished = false } = {}) {
  const endpoint = endpointURL(url);
  check(typeof fetcher === 'function' && typeof now === 'function', 'PROBE_CONFIG_INVALID');
  const protocolVersion = '2026-07-28';
  const clientInfo = Object.freeze({ name: 'hoiku-color-modern-acceptance', version: '0.2.0' });
  async function exchange(id, method, params = {}) {
    const headers = {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': protocolVersion,
      'mcp-method': method,
    };
    if (method === 'tools/call') headers['mcp-name'] = params.name;
    const payload = {
      jsonrpc: '2.0', id, method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': protocolVersion,
          'io.modelcontextprotocol/clientInfo': clientInfo,
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    };
    let response;
    try {
      response = await fetcher(endpoint.toString(), {
        method: 'POST', headers, body: JSON.stringify(payload), redirect: 'error',
        signal: AbortSignal.timeout(MAX_TIMEOUT_MS),
      });
    } catch { throw new Error('PROBE_TRANSPORT_FAILURE'); }
    check(response?.status === 200, 'PROBE_HTTP_STATUS_INVALID');
    check(!response.headers.has('mcp-session-id'), 'PROBE_MODERN_SESSION_INVALID');
    const result = await readReply(response, id);
    check(result.resultType === 'complete', 'PROBE_MODERN_RESULT_TYPE_INVALID');
    return result;
  }
  const discovery = await exchange(1, 'server/discover');
  check(isObject(discovery.capabilities) && isObject(discovery.capabilities.tools), 'PROBE_DISCOVERY_INVALID');
  return verifyPublicCatalog(exchange, protocolVersion, now, requirePublished);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const runner = process.env.HC_MCP_PROTOCOL === 'legacy' ? runHttpMcpProbe : runModernHttpMcpProbe;
    const result = await runner({ url: process.env.HC_MCP_URL || 'http://127.0.0.1:3107/mcp',
      requirePublished: process.env.HC_REQUIRE_PUBLIC_JOBS === '1' });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error?.message;
    process.stderr.write(`HC MCP protocol probe: ${/^PROBE_[A-Z_]+$/.test(code) ? code : 'PROBE_UNEXPECTED_FAILURE'}\n`);
    process.exitCode = 1;
  }
}
