import test from 'node:test';
import assert from 'node:assert/strict';
import { createColorMcpGateway } from '../sdk-bridge.mjs';

// Synthetic headers only. No credentials, account data, or upstream requests.
const host = 'hoikucolor-mcp-preview-only.hc-test.workers.dev';
function harness() {
  const seen = { admit: 0, audit: 0, dispatch: 0 };
  const gateway = createColorMcpGateway({
    McpServer: class StubMcpServer {},
    z: {},
    createMcpHandler: () => ({
      async fetch() {
        seen.dispatch++;
        return Response.json({ jsonrpc: '2.0', id: 1, result: {} });
      },
    }),
  }, {}, {
    allowedHosts: [host],
    allowedOrigins: [],
    async admit() { seen.admit++; return true; },
    async audit() { seen.audit++; },
  });
  return { gateway, seen };
}
function call(headers) {
  return new Request('https://' + host + '/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
}

test('anonymous MCP rejects alternate credential-bearing headers before any edge policy or SDK dispatch', async () => {
  const { gateway, seen } = harness();
  for (const headers of [
    { 'proxy-authorization': 'Basic synthetic-only' },
    { 'x-api-key': 'synthetic-only' },
    { 'x-auth-token': 'synthetic-only' },
    { 'x-supabase-api-key': 'synthetic-only' },
    { 'PrOxY-AuThOrIzAtIoN': 'Basic synthetic-only' },
  ]) {
    const response = await gateway.fetch(call(headers));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.text()).includes('synthetic-only'), false);
  }
  assert.deepEqual(seen, { admit: 0, audit: 0, dispatch: 0 });
});

test('anonymous MCP continues to reject standard Authorization and Cookie credentials', async () => {
  const { gateway, seen } = harness();
  for (const headers of [
    { authorization: 'Bearer synthetic-only' },
    { cookie: 'candidate_session=synthetic-only' },
  ]) {
    assert.equal((await gateway.fetch(call(headers))).status, 403);
  }
  assert.deepEqual(seen, { admit: 0, audit: 0, dispatch: 0 });
});
