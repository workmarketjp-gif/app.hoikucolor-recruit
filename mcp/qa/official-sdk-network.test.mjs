/**
 * Transport sanity check: official MCP SDK v2 over real loopback HTTP.
 * Synthetic only. Does not read HC private data or create public endpoints.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { once } from 'node:events';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import * as z from 'zod/v4';

test('official SDK handles modern discovery and read-only tool over HTTP', async () => {
  const handler = createMcpHandler(() => {
    const srv = new McpServer({ name: 'hc-sdk-ci-probe', version: '0.1.0' });
    srv.registerTool('probe_fixture', {
      description: 'Synthetic public-only test, not a production HC tool',
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ count: z.number().int() }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false },
    }, async () => ({
      content: [{ type: 'text', text: '{"count":0}' }],
      structuredContent: { count: 0 },
    }));
    return srv;
  }, { responseMode: 'json', legacy: 'stateless' });
  const listener = http.createServer(toNodeHandler(handler));
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const url = 'http://127.0.0.1:' + listener.address().port + '/mcp';
  async function call(id, method, params = {}) {
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': method,
    };
    if (method === 'tools/call') headers['mcp-name'] = params.name;
    const reply = await fetch(url, {
      method: 'POST', headers,
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params: {
        ...params, _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'hc-ci', version: '0.1.0' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      }}),
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(reply.status, 200, method);
    assert.equal(reply.headers.get('mcp-session-id'), null);
    const body = await reply.json();
    assert.equal(body.id, id);
    assert.equal(body.error, undefined);
    return body.result;
  }
  try {
    const discovered = await call(1, 'server/discover');
    assert.ok(discovered.capabilities?.tools);
    const list = await call(2, 'tools/list');
    assert.deepEqual(list.tools.map(t => t.name), ['probe_fixture']);
    const result = await call(3, 'tools/call', { name: 'probe_fixture', arguments: {} });
    assert.deepEqual(result.structuredContent, { count: 0 });
  } finally {
    await new Promise(resolve => listener.close(resolve));
    await handler.close?.();
  }
});
