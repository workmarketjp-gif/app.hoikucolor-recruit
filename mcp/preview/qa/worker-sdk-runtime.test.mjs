/**
 * Run the ACTUAL isolated Worker entrypoint and Cloudflare Agents MCP handler.
 * No network, Supabase key, Cloudflare deployment or candidate data is used.
 * These checks supplement, but never replace, HTTPS Preview + Inspector E2E.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.mjs';
import { McpServer } from '@modelcontextprotocol/server';
import { createMcpHandler } from 'agents/mcp/server';
import * as z from 'zod/v4';
import { bindWorkerMcpSdk } from '../preview-policy.mjs';
import { registerPublicCatalogTools, createColorMcpGateway } from '../../sdk-bridge.mjs';

const host = 'hoikucolor-mcp-preview-only.example.workers.dev';
const url = `https://${host}/mcp`;
const protocolVersion = '2026-07-28';

function environment(overrides = {}) {
  return {
    HC_MCP_PREVIEW_ENABLED: 'true',
    HC_MCP_PUBLIC_HOST: host,
    HC_MCP_ALLOWED_ORIGINS: '',
    HC_SUPABASE_URL: 'https://abcdefgh.supabase.co/',
    HC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_fixture_only',
    HC_MCP_RATE_LIMITER: {
      async limit({ key }) {
        assert.equal(key, 'hoikucolor-anon-preview');
        return { success: true };
      },
    },
    ...overrides,
  };
}

function rpc(id, method, params = {}) {
  return new Request(url, {
    method: 'POST',
    headers: {
      host,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': protocolVersion,
      'mcp-method': method,
      ...(method === 'tools/call' ? { 'mcp-name': params.name } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id, method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': protocolVersion,
          'io.modelcontextprotocol/clientInfo': { name: 'hc-preview-ci', version: '1.0.0' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  });
}

async function call(request, env = environment()) {
  const result = await worker.fetch(request, env, { waitUntil() {} });
  return result;
}

test('real Worker entrypoint serves modern stateless MCP discovery and public-only tools', async () => {
  const discoveryResponse = await call(rpc(1, 'server/discover'));
  if (discoveryResponse.status !== 200) {
    // Diagnostic uses fixture-only inputs, never real credentials or applicant data.
    const env = environment();
    const sdk = bindWorkerMcpSdk({ McpServer, createMcpHandler, z }, env, { waitUntil() {} });
    const h = sdk.createMcpHandler(
      () => registerPublicCatalogTools(new McpServer({ name: 'hc-preview-ci', version: '0.1.0' }), z, {
        supabaseUrl: env.HC_SUPABASE_URL, publishableKey: env.HC_SUPABASE_PUBLISHABLE_KEY,
      }),
      { maxRequestBodySize: 65536, responseMode: 'json', legacy: 'stateless' },
    );
    try {
      const direct = await h(rpc(101, 'server/discover'));
      console.error('SYNTHETIC_HANDLER_HTTP', direct.status);
      console.error('SYNTHETIC_HANDLER_RESPONSE', (await direct.text()).slice(0, 350));
    } catch (error) {
      console.error('SYNTHETIC_HANDLER_EXCEPTION', String(error).slice(0, 350));
    }
    const gateway = createColorMcpGateway(sdk, {
      supabaseUrl: env.HC_SUPABASE_URL, publishableKey: env.HC_SUPABASE_PUBLISHABLE_KEY,
    }, {
      allowedHosts: [host], allowedOrigins: [], allowLocalHttp: false,
      admit: async () => true, audit: async () => {},
    });
    const response = await gateway.fetch(rpc(102, 'server/discover'));
    console.error('SYNTHETIC_GATEWAY_HTTP', response.status);
    console.error('SYNTHETIC_GATEWAY_RESPONSE', (await response.text()).slice(0, 250));
  }
  assert.equal(discoveryResponse.status, 200, 'Worker SDK discovery must work without Cloudflare deployment');
  const discovery = await discoveryResponse.json();
  assert.equal(discovery.jsonrpc, '2.0');
  assert.equal(discovery.id, 1);
  assert.ok(discovery.result?.capabilities?.tools, 'MCP modern tools capability required');

  const listResponse = await call(rpc(2, 'tools/list'));
  assert.equal(listResponse.status, 200, 'Worker SDK tools/list must work without Cloudflare deployment');
  const listed = await listResponse.json();
  assert.equal(listed.jsonrpc, '2.0');
  assert.equal(listed.id, 2);
  assert.deepEqual(listed.result?.tools?.map(tool => tool.name), [
    'search_public_childcare_jobs',
    'list_public_childcare_job_filters',
    'get_public_childcare_job',
  ]);
  for (const tool of listed.result.tools) {
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.deepEqual(tool.securitySchemes, [{ type: 'noauth' }]);
  }
});

test('real Worker entrypoint fails closed without activation, rate binding or public key', async () => {
  for (const env of [
    environment({ HC_MCP_PREVIEW_ENABLED: 'false' }),
    environment({ HC_MCP_RATE_LIMITER: undefined }),
    environment({ HC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_not_allowed' }),
  ]) {
    const result = await call(rpc(3, 'tools/list'), env);
    assert.equal(result.status, 503);
    assert.equal(await result.text(), 'Service Unavailable');
  }
});

test('real Worker entrypoint rejects cross-origin/credentials before any SDK tool', async () => {
  const original = rpc(4, 'tools/list');
  for (const [header, value] of [
    ['origin', 'https://attacker.invalid'],
    ['authorization', 'Bearer untrusted'],
    ['cookie', 'hc_session=untrusted'],
  ]) {
    const headers = new Headers(original.headers);
    headers.set(header, value);
    const response = await call(new Request(url, {
      method: 'POST', headers, body: await original.clone().text(),
    }));
    assert.equal(response.status, 403, header);
  }
});
