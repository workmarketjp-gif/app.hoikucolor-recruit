import assert from 'node:assert/strict';
import test from 'node:test';
import { runPolicyWithDeadline, PublicMcpPolicyError } from '../policy-deadline.mjs';
import { createColorMcpGateway } from '../sdk-bridge.mjs';

const z = { object: () => ({ strict() { return this; } }) };
const sdk = { McpServer: class { registerTool() {} }, createMcpHandler: () => ({ fetch: async () => new Response('ok') }), z };
const config = { supabaseUrl: 'https://kcmmpjyngcysdfbumchk.supabase.co', publishableKey: 'sb_publishable_test' };
const mkRequest = () => new Request('https://mcp.hoikucolor.jp/mcp', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
});
const policy = { allowedHosts: ['mcp.hoikucolor.jp'], allowedOrigins: [], policyDeadlineMs: 25,
  admit: async () => true, audit: async () => {} };

test('policy deadline aborts stalled dependency without permitting access', async () => {
  let observedSignal;
  const before = Date.now();
  await assert.rejects(runPolicyWithDeadline(async (signal) => {
    observedSignal = signal;
    return new Promise(() => {});
  }, { deadlineMs: 20 }), PublicMcpPolicyError);
  assert.equal(observedSignal.aborted, true);
  assert.ok(Date.now() - before < 1000);
});

test('policy deadline preserves successful dependency return value', async () => {
  assert.equal(await runPolicyWithDeadline(async (signal) => {
    assert.equal(signal.aborted, false);
    return 'allowed';
  }, { deadlineMs: 100 }), 'allowed');
});

test('policy deadline stops when HTTP request is already aborted', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runPolicyWithDeadline(() => true, { parentSignal: controller.signal }), PublicMcpPolicyError);
});

test('invalid policy timeout configuration is rejected before service setup', () => {
  for (const deadline of [0, 11_000, '2000', Number.NaN]) {
    assert.throws(() => createColorMcpGateway(sdk, config, { ...policy, policyDeadlineMs: deadline }), /MCP_POLICY_DEADLINE_CONFIG_INVALID/);
  }
});

test('stalled admission returns 503 without reaching MCP tools', async () => {
  const gateway = createColorMcpGateway(sdk, config, {
    ...policy, admit: async () => new Promise(() => {}),
  });
  const result = await gateway.fetch(mkRequest());
  assert.equal(result.status, 503);
  assert.equal(result.headers.get('cache-control'), 'no-store');
});

test('stalled accepted audit returns 503 before MCP dispatch', async () => {
  const gateway = createColorMcpGateway(sdk, config, {
    ...policy, audit: async () => new Promise(() => {}),
  });
  const result = await gateway.fetch(mkRequest());
  assert.equal(result.status, 503);
});

test('stalled rate-limit audit returns 503, not a bypass or unlogged 429', async () => {
  const gateway = createColorMcpGateway(sdk, config, {
    ...policy, admit: async () => false, audit: async () => new Promise(() => {}),
  });
  const result = await gateway.fetch(mkRequest());
  assert.equal(result.status, 503);
});
