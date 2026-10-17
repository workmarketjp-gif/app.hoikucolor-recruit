/**
 * Real SDK + real localhost TCP regression, with synthetic PUBLIC-only data.
 * No Supabase key, external networking, client identity, or personal data.
 * Run only after installing @modelcontextprotocol/server/node and zod.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { once } from 'node:events';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import * as z from 'zod/v4';

const fixture = Object.freeze({ status: 'public', total: 0 });
const handler = createMcpHandler(() => {
  const server = new McpServer({ name: 'hoiku-color-sdk-contract-probe', version: '0.1.0' });
  server.registerTool('read_public_fixture', {
    title: 'Read synthetic public fixture',
    description: 'SDK conformance test only; exposes no real or private HC data.',
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({ status: z.literal('public'), total: z.number().int() }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, async () => ({ content: [{ type: 'text', text: JSON.stringify(fixture) }], structuredContent: fixture }));
  return server;
}, { responseMode: 'json', legacy: 'stateless', maxRequestBodySize: 65_536 });

async function rpc(url, id, method, params, modern) {
  const version = modern ? '2026-07-28' : '2025-06-18';
  const headers = { accept: 'application/json, text/event-stream', 'content-type': 'application/json', 'mcp-protocol-version': version };
  if (modern) { headers['mcp-method'] = method; if (method === 'tools/call') headers['mcp-name'] = params.name; }
  const args = modern ? { ...params, _meta: {
    'io.modelcontextprotocol/protocolVersion': version,
    'io.modelcontextprotocol/clientInfo': { name: 'hc-isolated-transport-ci', version: '0.1.0' },
    'io.modelcontextprotocol/clientCapabilities': {},
  }} : params;
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id, method, params: args }), signal: AbortSignal.timeout(5_000) });
  assert.equal(response.status, 200, `${method}: HTTP ${response.status}`);
  assert.equal(response.headers.get('mcp-session-id'), null, 'stateless mode must not issue session IDs');
  const ctype = response.headers.get('content-type') || '';
  assert.match(ctype, /application\/json/);
  const body = await response.json();
  assert.equal(body.id, id);
  assert.equal(body.jsonrpc, '2.0');
  assert.equal(body.error, undefined, `${method}: JSON-RPC error`);
  return body.result;
}

test('installed official MCP v2 SDK serves both protocol generations over real TCP', async () => {
  const nodeHandler = toNodeHandler(handler);
  const listener = http.createServer((req, res) => nodeHandler(req, res));
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const url = `http://127.0.0.1:${listener.address().port}/mcp`;
  try {
    const legacyInit = await rpc(url, 1, 'initialize', {
      protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'hc-legacy-ci', version: '1.0.0' },
    }, false);
    assert.match(legacyInit.protocolVersion, /^2025-/);
    const legacyTools = await rpc(url, 2, 'tools/list', {}, false);
    assert.deepEqual(legacyTools.tools.map(tool => tool.name), ['read_public_fixture']);
    const discovered = await rpc(url, 3, 'server/discover', {}, true);
    assert.ok(discovered.capabilities?.tools);
    const modernTools = await rpc(url, 4, 'tools/list', {}, true);
    assert.deepEqual(modernTools.tools.map(tool => tool.name), ['read_public_fixture']);
    const call = await rpc(url, 5, 'tools/call', { name: 'read_public_fixture', arguments: {} }, true);
    assert.deepEqual(call.structuredContent, fixture);
    assert.equal(call.isError, undefined);
  } finally {
    await new Promise(resolve => listener.close(resolve));
    await handler.close?.();
  }
});
