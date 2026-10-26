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
  if (!((parsed.protocol === 'https:' && PREVIEW_HOST.test(parsed.hostname)) ||
      (parsed.protocol === 'http:' && loopback)) ||
      parsed.pathname !== '/mcp' || parsed.username || parsed.password ||
      parsed.search || parsed.hash || parsed.href !== parsed.origin + '/mcp') {
    throw new Error('BOUNDARY_URL_NOT_APPROVED_PREVIEW');
  }
  return parsed;
}

export async function probeAnonymousMcpBoundary({ url, fetcher = globalThis.fetch } = {}) {
  const endpoint = assertBoundaryPreviewUrl(url);
  if (typeof fetcher !== 'function') throw new Error('BOUNDARY_FETCH_UNAVAILABLE');
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  for (const [name, path, method, extraHeaders, expected] of FAILURES) {
    let response;
    try {
      response = await fetcher(endpoint.origin + path, {
        method,
        headers: { 'content-type': 'application/json', ...extraHeaders },
        ...(method === 'POST' ? { body } : {}),
        redirect: 'error', signal: AbortSignal.timeout(10_000),
      });
    } catch { throw new Error('BOUNDARY_TRANSPORT_FAILED'); }
    // Never read or print an unexpected response body: it could contain PII,
    // credentials, injected instructions or an upstream error trace.
    if (response?.status !== expected) {
      throw new Error('BOUNDARY_' + name.toUpperCase() + '_NOT_DENIED');
    }
    try { await response.body?.cancel(); } catch { /* no content required */ }
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
