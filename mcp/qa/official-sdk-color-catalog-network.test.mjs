/**
 * Official v2 SDK + actual Hoiku Color public MCP gateway over loopback TCP.
 * Requires npm dependencies; unlike gateway-real-tcp.test.mjs, this test
 * validates the SDK's real MCP transport and schema serialization.
 * Synthetic public-only upstream replies are used: no production keys or PII.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { once } from 'node:events';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import * as z from 'zod/v4';
import { createColorMcpGateway } from '../sdk-bridge.mjs';

const jobId = '11111111-1111-4111-8111-000000000001';
const now = Date.parse('2026-10-16T00:00:00Z');
const fixture = {
  id: jobId, title: '保育士求人', facility_name: '保育園テスト',
  prefecture: '東京都', is_external: false,
  published_at: '2026-10-15T00:00:00Z', closing_at: null,
  total_count: 1, applicant_email: 'should-never-leak@example.invalid',
};

async function rpc(url, id, method, params = {}) {
  const protocolVersion = '2026-07-28';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': protocolVersion,
      'mcp-method': method,
      ...(method === 'tools/call' ? { 'mcp-name': params.name } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': protocolVersion,
        'io.modelcontextprotocol/clientInfo': { name: 'hc-catalog-ci', version: '1.0.0' },
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    } }),
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(response.status, 200, `${method}: HTTP ${response.status}`);
  const data = await response.json();
  assert.equal(data.id, id);
  assert.equal(data.error, undefined, `${method}: ${JSON.stringify(data.error)}`);
  return data.result;
}

test('official MCP v2 serves actual HC anonymous catalog tools and strict public projection', async () => {
  const listener = http.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  const config = {
    supabaseUrl: 'https://kcmmpjyngcysdfbumchk.supabase.co',
    publishableKey: 'sb_publishable_fixture',
    now: () => now,
    fetcher: async target => {
      const path = new URL(target).pathname;
      if (path.endsWith('/hc_public_job_search_facets_v2')) {
        return Response.json([{ prefectures: ['東京都'], employment_types: ['full_time'] }]);
      }
      return Response.json([fixture]);
    },
  };
  const gateway = createColorMcpGateway({ McpServer, createMcpHandler, z }, config, {
    allowedHosts: [`127.0.0.1:${port}`], allowedOrigins: [], allowLocalHttp: true,
  });
  listener.on('request', toNodeHandler(gateway));
  const url = `http://127.0.0.1:${port}/mcp`;
  try {
    const discovery = await rpc(url, 1, 'server/discover');
    assert.ok(discovery.capabilities?.tools, 'modern SDK must discover tools');
    const listed = await rpc(url, 2, 'tools/list');
    assert.deepEqual(listed.tools.map(tool => tool.name), [
      'search_public_childcare_jobs', 'list_public_childcare_job_filters', 'get_public_childcare_job',
    ]);
    for (const tool of listed.tools) {
      assert.deepEqual(tool.securitySchemes, [{ type: 'noauth' }]);
      assert.equal(tool.annotations?.readOnlyHint, true);
      assert.ok(tool.outputSchema?.properties, `${tool.name}: output schema required`);
    }
    const result = await rpc(url, 3, 'tools/call', {
      name: 'search_public_childcare_jobs', arguments: { keyword: '保育士' },
    });
    assert.equal(result.structuredContent.jobs.length, 1);
    assert.equal(result.structuredContent.jobs[0].title, fixture.title);
    assert.equal(JSON.stringify(result).includes('should-never-leak@example.invalid'), false);
    const facets = await rpc(url, 4, 'tools/call', {
      name: 'list_public_childcare_job_filters', arguments: {},
    });
    assert.deepEqual(facets.structuredContent.prefectures, ['東京都']);
    const detail = await rpc(url, 5, 'tools/call', {
      name: 'get_public_childcare_job', arguments: { job_id: jobId },
    });
    assert.equal(detail.structuredContent.job.id, jobId);
    assert.equal(JSON.stringify(detail).includes('applicant_email'), false);
  } finally {
    listener.closeAllConnections();
    await new Promise(resolve => listener.close(resolve));
    await gateway.close?.();
  }
});
