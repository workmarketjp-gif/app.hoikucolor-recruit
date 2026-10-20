import assert from 'node:assert/strict';
import test from 'node:test';
import { PublicMcpBodyError, readBoundedPublicMcpBody } from '../request-body-deadline.mjs';
import { createColorMcpGateway } from '../sdk-bridge.mjs';

function streamed(chunks, opts = {}) {
  return new Request('https://mcp.hoikucolor.jp/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: new ReadableStream({
      start(controller) { for (const v of chunks) controller.enqueue(new TextEncoder().encode(v));
        if (!opts.stall) controller.close(); },
      cancel() { opts.cancelled?.(); },
    }), duplex: 'half',
  });
}

const zProxy = new Proxy({}, { get(_, key) { if (key === 'object' || key === 'string' || key === 'number' || key === 'boolean' || key === 'array') return () => chain(); } });
function chain() { return new Proxy({}, { get(_, key) { if (key === 'strict' || key === 'max' || key === 'min' || key === 'optional' || key === 'int' || key === 'nullable' || key === 'finite' || key === 'nonnegative' || key === 'url' || key === 'uuid') return () => chain(); } }); }
function gateway(handle) {
  return createColorMcpGateway({
    McpServer: class { registerTool() {} },
    createMcpHandler: () => ({ fetch: handle }), z: zProxy,
  }, { supabaseUrl: 'https://test.supabase.co', publishableKey: 'sb_publishable_test' }, {
    allowedHosts: ['mcp.hoikucolor.jp'], allowedOrigins: [],
    admit: async () => true, audit: async () => {},
  });
}

// Unit-level stream handling, without requiring SDK or network.
test('a finite chunked JSON body returns the exact bytes', async () => {
  const request = streamed(['{"json', 'rpc":"2.0"}']);
  const value = await readBoundedPublicMcpBody(request, { deadlineMs: 200 });
  assert.equal(new TextDecoder().decode(value), '{"jsonrpc":"2.0"}');
});

test('64 KiB cap rejects a chunked body without Content-Length', async () => {
  const request = streamed(['x'.repeat(65_537)]);
  await assert.rejects(readBoundedPublicMcpBody(request), e => e instanceof PublicMcpBodyError && e.status === 413);
});

test('absolute deadline rejects a stalled client and cancels the reader', async () => {
  let cancelled = false;
  const request = streamed(['{"jsonrpc":'], { stall: true, cancelled: () => { cancelled = true; } });
  await assert.rejects(readBoundedPublicMcpBody(request, { deadlineMs: 20 }), e => e instanceof PublicMcpBodyError && e.status === 408);
  assert.equal(cancelled, true);
});

test('missing and already-used body are rejected', async () => {
  await assert.rejects(readBoundedPublicMcpBody(new Request('https://example.com')), e => e.status === 400);
  const request = streamed(['{}']);
  await request.text();
  await assert.rejects(readBoundedPublicMcpBody(request), e => e.status === 400);
});

test('reader configuration rejects unsafe limits', async () => {
  const request = streamed(['{}']);
  await assert.rejects(readBoundedPublicMcpBody(request, { deadlineMs: Infinity }), /MCP_BODY_READER_CONFIG_INVALID/);
  await assert.rejects(readBoundedPublicMcpBody(request, { maxBytes: 0 }), /MCP_BODY_READER_CONFIG_INVALID/);
});

test('gateway sends the fully buffered bytes to the SDK once', async () => {
  let sends = 0;
  const g = gateway(async (request) => {
    sends++;
    assert.equal(request.headers.get('content-length'), null);
    assert.equal(await request.text(), '{"jsonrpc":"2.0"}');
    return new Response('ok');
  });
  const response = await g.fetch(streamed(['{"jsonrpc":', '"2.0"}']));
  assert.equal(response.status, 200);
  assert.equal(sends, 1);
});

test('gateway rejects chunked oversized body before SDK execution', async () => {
  let sends = 0;
  const g = gateway(async () => { sends++; return new Response('should never execute'); });
  const response = await g.fetch(streamed(['x'.repeat(65_537)]));
  assert.equal(response.status, 413);
  assert.equal(sends, 0);
});
