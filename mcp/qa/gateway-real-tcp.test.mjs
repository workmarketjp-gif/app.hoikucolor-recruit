/**
 * Real loopback TCP integration for the production gateway policy and HC
 * public catalog projection, without third-party SDK or live credentials.
 *
 * The injected MCP dispatcher is deliberately a TEST DOUBLE: this test does
 * not establish MCP wire-protocol or official SDK compatibility. That remains
 * the responsibility of official-sdk-network.test.mjs in network-enabled CI.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { createColorMcpGateway } from '../sdk-bridge.mjs';

const ID = '11111111-1111-4111-8111-000000000001';
const clock = Date.parse('2026-10-16T08:00:00Z');
const fixtures = [{
  id: ID, title: '保育士募集', prefecture: '東京都', is_external: false,
  published_at: '2026-10-15T06:00:00Z', closing_at: '2026-10-30T00:00:00Z',
  internal_notes: 'PRIVATE_INTERNAL_NOTES', applicant_email: 'private@example.invalid',
  total_count: 1,
}];

function zStub() {
  const chain = () => ({
    max() { return this; }, min() { return this; }, int() { return this; },
    optional() { return this; }, strict() { return this; }, uuid() { return this; },
    nullable() { return this; }, finite() { return this; }, nonnegative() { return this; },
    url() { return this; },
  });
  return { object: chain, string: chain, number: chain, boolean: chain, array: chain };
}

async function withTcpGateway(callback) {
  const seen = { sdkRequests: 0, upstreamCalls: 0, audits: [], admitted: 0 };
  const config = {
    supabaseUrl: 'https://kcmmpjyngcysdfbumchk.supabase.co',
    publishableKey: 'sb_publishable_isolated_fixture',
    now: () => clock,
    fetcher: async (url) => {
      seen.upstreamCalls++;
      const route = new URL(url).pathname;
      const body = route.endsWith('/hc_public_search_jobs_v2') ? fixtures :
        route.endsWith('/hc_public_job_search_facets_v2')
          ? [{ prefectures: ['東京都'], employment_types: ['full_time'] }]
          : fixtures;
      return Response.json(body);
    },
  };
  const sdkStub = {
    McpServer: class {
      constructor() { this.tools = new Map(); }
      registerTool(name, meta, run) { this.tools.set(name, { meta, run }); }
    },
    createMcpHandler(factory) {
      return {
        async fetch(request) {
          seen.sdkRequests++;
          const p = await request.json();
          const tools = factory().tools;
          let result;
          if (p.method === 'tools/list') {
            result = { tools: [...tools].map(([name, { meta }]) => ({ name, description: meta.description })) };
          } else if (p.method === 'tools/call') {
            const tool = tools.get(p.params?.name);
            if (!tool) return Response.json({ jsonrpc: '2.0', id: p.id, error: { code: -32601, message: 'Unknown test tool' } });
            result = await tool.run(p.params.arguments ?? {});
          } else {
            return Response.json({ jsonrpc: '2.0', id: p.id, error: { code: -32601, message: 'Unknown test method' } });
          }
          return Response.json({ jsonrpc: '2.0', id: p.id, result });
        },
      };
    },
    z: zStub(),
  };
  // Socket port is selected dynamically, then policy constructed with its
  // exact port; no wildcard host and never a non-loopback listener.
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const gateway = createColorMcpGateway(sdkStub, config, {
    allowedHosts: [`127.0.0.1:${port}`], allowedOrigins: [], allowLocalHttp: true,
    admit: async () => { seen.admitted++; return true; },
    audit: async ({ decision }) => { seen.audits.push(decision); },
  });
  server.on('request', async (incoming, outgoing) => {
    const cancelled = new AbortController();
    incoming.on('aborted', () => cancelled.abort());
    try {
      const req = new Request(`http://127.0.0.1:${port}${incoming.url}`, {
        method: incoming.method,
        headers: incoming.headers,
        ...(['GET', 'HEAD'].includes(incoming.method) ? {} : { body: Readable.toWeb(incoming), duplex: 'half' }),
        signal: cancelled.signal,
      });
      const response = await gateway.fetch(req);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (!outgoing.headersSent) outgoing.writeHead(500);
      outgoing.end();
    }
  });
  try {
    return await callback({ port, url: `http://127.0.0.1:${port}/mcp`, seen });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await gateway.close?.();
  }
}

async function call(url, method, params = {}, opts = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...opts.headers },
    body: JSON.stringify({ jsonrpc: '2.0', method, id: 7, params }),
    signal: AbortSignal.timeout(8_000),
  });
  return { status: response.status, body: await response.text() };
}

test('real HTTP listener reaches all three allowlisted public tools, never private job fields', async () => {
  await withTcpGateway(async ({ url, seen }) => {
    const listing = await call(url, 'tools/list');
    assert.equal(listing.status, 200);
    assert.deepEqual(JSON.parse(listing.body).result.tools.map(x => x.name), [
      'search_public_childcare_jobs', 'list_public_childcare_job_filters', 'get_public_childcare_job',
    ]);
    const search = await call(url, 'tools/call', { name: 'search_public_childcare_jobs', arguments: { keyword: '保育士' } });
    assert.equal(search.status, 200);
    const jobs = JSON.parse(search.body).result.structuredContent.jobs;
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].title, '保育士募集');
    assert.equal(search.body.includes('private@example.invalid'), false);
    assert.equal(search.body.includes('PRIVATE_INTERNAL_NOTES'), false);
    const filters = await call(url, 'tools/call', { name: 'list_public_childcare_job_filters', arguments: {} });
    assert.equal(JSON.parse(filters.body).result.structuredContent.prefectures[0], '東京都');
    const detail = await call(url, 'tools/call', { name: 'get_public_childcare_job', arguments: { job_id: ID } });
    assert.equal(JSON.parse(detail.body).result.structuredContent.job.id, ID);
    assert.equal(seen.sdkRequests, 4);
    assert.equal(seen.upstreamCalls, 3);
  });
});

test('real TCP HTTP denies bearer tokens, untrusted Origins and wrong routes before tool dispatch', async () => {
  await withTcpGateway(async ({ url, seen }) => {
    assert.equal((await call(url, 'tools/list', {}, { headers: { authorization: 'Bearer injected' } })).status, 403);
    assert.equal((await call(url, 'tools/list', {}, { headers: { origin: 'https://evil.invalid' } })).status, 403);
    const wrongPath = await fetch(url.replace('/mcp', '/admin'));
    assert.equal(wrongPath.status, 404);
    assert.equal(seen.sdkRequests, 0);
    assert.equal(seen.upstreamCalls, 0);
  });
});

test('real HTTP chunked upload over 64 KiB is rejected without invoking MCP dispatcher', async () => {
  await withTcpGateway(async ({ url, seen }) => {
    const huge = new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(65_537)); controller.close();
    } });
    const response = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: huge,
      duplex: 'half', signal: AbortSignal.timeout(7_000),
    });
    assert.equal(response.status, 413);
    assert.equal(seen.sdkRequests, 0);
  });
});

test('real chunked socket that stalls after partial body returns 408 and never executes tools', async () => {
  await withTcpGateway(async ({ port, seen }) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    await once(socket, 'connect');
    let raw = '';
    socket.on('data', chunk => { raw += chunk.toString('utf8'); });
    socket.write(`POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n` +
      'Content-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n' +
      '2\r\n{}\r\n'); // Do not send the terminating 0-chunk.
    const timer = setTimeout(() => socket.destroy(new Error('socket-timeout')), 8_000);
    try { await once(socket, 'end'); }
    finally { clearTimeout(timer); socket.destroy(); }
    assert.match(raw, /^HTTP\/1\.1 408 /);
    assert.equal(seen.sdkRequests, 0);
  });
});
