import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchWithDeadline, PublicMcpDispatchError } from '../dispatch-deadline.mjs';
import { createColorMcpGateway } from '../sdk-bridge.mjs';

const z = { object: () => ({ strict() { return this; } }) };
const config = {
  supabaseUrl: 'https://example.supabase.co',
  publishableKey: 'sb_publishable_synthetic_only',
};
const policy = { allowedHosts: ['mcp.hoikucolor.jp'], allowedOrigins: [],
  toolDeadlineMs: 110, admit: async () => true, audit: async () => {} };
const request = (signal) => new Request('https://mcp.hoikucolor.jp/mcp', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  ...(signal ? { signal } : {}),
});
const makeSdk = (fetch) => ({ McpServer: class { registerTool() {} },
  createMcpHandler: () => ({ fetch }), z });

test('SDK dispatch succeeds within budget and passes an abortable signal', async () => {
  const gateway = createColorMcpGateway(makeSdk(async (received) => {
    assert.equal(received.signal.aborted, false);
    return Response.json({ result: 'public only' });
  }), config, policy);
  const result = await gateway.fetch(request());
  assert.equal(result.status, 200);
  assert.equal((await result.json()).result, 'public only');
});

test('stalled SDK handler times out with 503, and its request signal is cancelled', async () => {
  let signal;
  const gateway = createColorMcpGateway(makeSdk(received => {
    signal = received.signal;
    return new Promise(() => {});
  }), config, policy);
  const start = performance.now();
  const result = await gateway.fetch(request());
  assert.equal(result.status, 503);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(signal.aborted, true);
  assert.ok(performance.now() - start < 1500);
});

test('a late MCP response is never returned after the deadline', async () => {
  let resolveLate;
  const gateway = createColorMcpGateway(makeSdk(() => new Promise(resolve => {
    resolveLate = resolve;
  })), config, policy);
  const response = await gateway.fetch(request());
  assert.equal(response.status, 503);
  resolveLate(Response.json({ private: 'must-never-be-delivered' }));
  assert.equal((await response.text()).includes('must-never-be-delivered'), false);
});

test('SDK exceptions are sanitized and cannot disclose internal details', async () => {
  const gateway = createColorMcpGateway(makeSdk(async () => {
    throw Error('database postgres://password-at-secret-host');
  }), config, policy);
  const response = await gateway.fetch(request());
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('password-at-secret-host'));
});

test('caller disconnect cancels dispatch without returning a late result', async () => {
  const controller = new AbortController();
  let dispatched;
  const gateway = createColorMcpGateway(makeSdk(received => {
    dispatched = received.signal;
    controller.abort();
    return new Promise(() => {});
  }), config, policy);
  const response = await gateway.fetch(request(controller.signal));
  assert.equal(response.status, 503);
  assert.equal(dispatched.aborted, true);
});

test('invalid dispatch budgets are rejected during gateway construction', () => {
  for (const toolDeadlineMs of [0, 99, 30_001, 4.5, NaN, Infinity, '8000']) {
    assert.throws(() => createColorMcpGateway(makeSdk(async () => new Response('ok')),
      config, { ...policy, toolDeadlineMs }), /MCP_TOOL_DEADLINE_CONFIG_INVALID/);
  }
});

test('standalone dispatcher rejects corrupt SDK results and invalid handler setup', async () => {
  await assert.rejects(dispatchWithDeadline({ fetch: async () => 'bad' }, request()), PublicMcpDispatchError);
  await assert.rejects(dispatchWithDeadline({ fetch: async () => new Response('x') }, request(), { deadlineMs: 0 }), /MCP_DISPATCH_CONFIG_INVALID/);
});
