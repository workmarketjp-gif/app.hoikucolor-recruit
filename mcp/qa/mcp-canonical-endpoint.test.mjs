import assert from 'node:assert/strict';
import test from 'node:test';
import { createColorMcpGateway } from '../sdk-bridge.mjs';

// HTTP-only route checks: no account identity, Supabase network or fake
// candidate records. A failed URL must never reach policy or SDK dispatch.
const host = 'hc-preview.example.workers.dev';
function gatewayHarness() {
  const seen = { admitted: 0, audited: 0, dispatched: 0 };
  const gateway = createColorMcpGateway({
    McpServer: class StubMcpServer {},
    z: {},
    createMcpHandler: () => ({
      async fetch() {
        seen.dispatched += 1;
        return Response.json({ jsonrpc: '2.0', id: 1, result: {} });
      },
    }),
  }, {}, {
    allowedHosts: [host],
    allowedOrigins: [],
    async admit() { seen.admitted += 1; return true; },
    async audit() { seen.audited += 1; },
  });
  return { gateway, seen };
}
function post(url) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}',
  });
}

test('MCP canonical URL refuses query values, including candidate data or token parameters', async () => {
  const { gateway, seen } = gatewayHarness();
  for (const url of [
    `https://${host}/mcp?access_token=placeholder`,
    `https://${host}/mcp?candidate_id=untrusted`,
    `https://${host}/mcp?%61ccess_token=placeholder`,
    `https://${host}/mcp?`,
  ]) {
    const response = await gateway.fetch(post(url));
    assert.equal(response.status, 403, url);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.deepEqual(seen, { admitted: 0, audited: 0, dispatched: 0 });
});

test('MCP canonical URL refuses fragments, including an empty fragment marker', async () => {
  const { gateway, seen } = gatewayHarness();
  for (const url of [`https://${host}/mcp#session`, `https://${host}/mcp#`]) {
    const response = await gateway.fetch(post(url));
    assert.equal(response.status, 403, url);
  }
  assert.deepEqual(seen, { admitted: 0, audited: 0, dispatched: 0 });
});

test('MCP canonical URL refuses URL-embedded username or password before body read', async () => {
  const { gateway, seen } = gatewayHarness();
  // Fetch Request constructors reject embedded credentials. Use an
  // isolated Request-shaped value to exercise the gateway's URL gate.
  for (const url of [
    `https://user:pass@${host}/mcp`,
    `https://user@${host}/mcp`,
  ]) {
    const response = await gateway.fetch({
      url, method: 'POST', headers: new Headers({ 'content-type': 'application/json' }),
    });
    assert.equal(response.status, 403);
  }
  assert.deepEqual(seen, { admitted: 0, audited: 0, dispatched: 0 });
});

test('MCP canonical route still proceeds to existing content-type and method policy', async () => {
  const { gateway, seen } = gatewayHarness();
  assert.equal((await gateway.fetch(new Request(`https://${host}/mcp`, {
    method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x',
  }))).status, 415);
  assert.equal((await gateway.fetch(new Request(`https://${host}/mcp`, {
    method: 'GET',
  }))).status, 405);
  assert.equal((await gateway.fetch(post(`https://${host}/other`))).status, 404);
  assert.deepEqual(seen, { admitted: 0, audited: 0, dispatched: 0 });
});
