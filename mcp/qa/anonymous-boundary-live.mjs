/**
 * Read-only, non-credentialed negative HTTP acceptance for a dedicated HC MCP preview.
 * Run only against an explicitly approved preview or loopback QA server.
 * This is not an OAuth cross-candidate test or a ChatGPT connection test.
 */
import { pathToFileURL } from 'node:url';

const PREVIEW_HOST = /^hoikucolor-mcp-preview-only\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.workers\.dev$/i;
const FAILURES = Object.freeze([
  ['bearer', '/mcp', 'POST', { authorization: 'Bearer hc-invalid-test-only' }, 403],
  ['cookie', '/mcp', 'POST', { cookie: 'hc-invalid-test-cookie=1' }, 403],
  ['proxy_authorization', '/mcp', 'POST', { 'proxy-authorization': 'Basic hc-test-only' }, 403],
  ['api_key', '/mcp', 'POST', { 'x-api-key': 'hc-test-only' }, 403],
  ['auth_token', '/mcp', 'POST', { 'x-auth-token': 'hc-test-only' }, 403],
  ['supabase_key', '/mcp', 'POST', { 'x-supabase-api-key': 'hc-test-only' }, 403],
  ['foreign_origin', '/mcp', 'POST', { origin: 'https://untrusted.invalid' }, 403],
  ['query', '/mcp?canary=hc-test-only', 'POST', {}, 403],
  ['wrong_route', '/admin', 'POST', {}, 404],
  ['get', '/mcp', 'GET', {}, 405],
  ['non_json', '/mcp', 'POST', { 'content-type': 'text/plain' }, 415],
]);

export function assertBoundaryPreviewUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('BOUNDARY_URL_INVALID'); }
  const loopback = ['localhost', '127.0.0.1'].includes(parsed.hostname);
  // Workers.dev Preview is only approved on the canonical HTTPS port.
  // An alternate port must not be accepted as the same reviewed endpoint.
  const approvedRemote = parsed.protocol === 'https:' &&
    PREVIEW_HOST.test(parsed.hostname) && !parsed.port;
  if (!(approvedRemote || (parsed.protocol === 'http:' && loopback)) ||
      parsed.pathname !== '/mcp' || parsed.username || parsed.password ||
      parsed.search || parsed.hash || parsed.href !== parsed.origin + '/mcp') {
    throw new Error('BOUNDARY_URL_NOT_APPROVED_PREVIEW');
  }
  return parsed;
}

export async function probeAnonymousMcpBoundary({
  url, fetcher = globalThis.fetch, timeoutMs = 10_000,
} = {}) {
  const endpoint = assertBoundaryPreviewUrl(url);
  if (typeof fetcher !== 'function') throw new Error('BOUNDARY_FETCH_UNAVAILABLE');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) {
    throw new Error('BOUNDARY_TIMEOUT_INVALID');
  }
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  for (const [name, path, method, extraHeaders, expected] of FAILURES) {
    const controller = new AbortController();
    let timer;
    try {
      // AbortSignal alone is insufficient when an injected fetch transport
      // ignores cancellation. Bound every negative check by wall-clock time.
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('BOUNDARY_TRANSPORT_FAILED'));
        }, timeoutMs);
      });
      const response = await Promise.race([
        fetcher(endpoint.origin + path, {
          method,
          headers: { 'content-type': 'application/json', ...extraHeaders },
          ...(method === 'POST' ? { body } : {}),
          redirect: 'error', signal: controller.signal,
        }),
        deadline,
      ]);
      // Never read or print an unexpected response body: it may contain
      // applicant information, credentials or injected instructions.
      if (response?.status !== expected) {
        throw new Error('BOUNDARY_' + name.toUpperCase() + '_NOT_DENIED');
      }
      // A hostile stream can keep cancel() pending indefinitely. Initiate
      // cleanup without waiting; also abort the transport in finally.
      try { void Promise.resolve(response.body?.cancel()).catch(() => {}); }
      catch { /* body already closed or unusable */ }
    } catch (error) {
      if (error?.message === 'BOUNDARY_' + name.toUpperCase() + '_NOT_DENIED') throw error;
      throw new Error('BOUNDARY_TRANSPORT_FAILED');
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  return Object.freeze({ status: 'PASS', checks: FAILURES.length, changes_performed: false });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await probeAnonymousMcpBoundary({ url: process.env.HC_MCP_URL });
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    const code = typeof error?.message === 'string' && /^BOUNDARY_[A-Z_]+$/.test(error.message)
      ? error.message : 'BOUNDARY_UNEXPECTED_FAILURE';
    process.stderr.write('HC_MCP_ANONYMOUS_BOUNDARY_FAILED: ' + code + '\n');
    process.exitCode = 1;
  }
}
