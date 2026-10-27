/**
 * Run the ACTUAL isolated Worker entrypoint and Cloudflare Agents MCP handler.
 * No network, Supabase key, Cloudflare deployment or candidate data is used.
 * These checks supplement, but never replace, HTTPS Preview + Inspector E2E.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.mjs';

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


/**
 * Unlike a schema-only smoke check, these execute tools/call through the
 * actual Cloudflare Worker entrypoint and installed MCP SDK. Only the
 * outbound public Supabase REST boundary is replaced with synthetic records.
 * This is NOT a deployed Preview, a real DB RLS check, or ChatGPT E2E.
 */
async function withSyntheticPublicSource(source, run) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const target = new URL(String(input));
    if (target.origin !== 'https://abcdefgh.supabase.co' ||
        !target.pathname.startsWith('/rest/v1/')) {
      throw new Error('UNEXPECTED_OUTBOUND_REQUEST');
    }
    assert.equal(options?.headers?.apikey, 'sb_publishable_test_fixture_only');
    assert.equal(options?.headers?.Authorization, undefined);
    assert.equal(options?.redirect, 'error');
    return source(target, options);
  };
  try { return await run(); }
  finally { globalThis.fetch = original; }
}

test('real Worker tools/call returns two published facilities while excluding private, closed and future rows', async () => {
  const published = new Date(Date.now() - 86_400_000).toISOString();
  const closed = new Date(Date.now() - 3_600_000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const ids = [
    '11111111-1111-4111-8111-000000000001',
    '22222222-2222-4222-8222-000000000002',
    '33333333-3333-4333-8333-000000000003',
    '44444444-4444-4444-8444-000000000004',
  ];
  const rows = [
    { id: ids[0], facility_name: '施設A', title: '保育士募集A',
      prefecture: '東京都', is_external: false, published_at: published,
      description: '公開説明 recruit@example.com', applicant_email: 'CANDIDATE_A_PRIVATE',
      internal_notes: 'FACILITY_A_PRIVATE', total_count: 4 },
    { id: ids[1], facility_name: '施設B', title: '保育士募集B',
      prefecture: '大阪府', is_external: false, published_at: published,
      applicant_email: 'CANDIDATE_B_PRIVATE', internal_notes: 'FACILITY_B_PRIVATE',
      total_count: 4 },
    { id: ids[2], facility_name: '終了済み施設', title: '終了求人',
      is_external: false, published_at: published, closing_at: closed, total_count: 4 },
    { id: ids[3], facility_name: '掲載予定施設', title: '未公開求人',
      is_external: false, published_at: future, total_count: 4 },
  ];
  let upstreamCalls = 0;
  await withSyntheticPublicSource(async (target, options) => {
    upstreamCalls++;
    if (target.pathname.endsWith('/hc_public_search_jobs_v2')) {
      assert.equal(options.method, 'POST');
      assert.equal(JSON.parse(options.body).p_ho_verified, false);
      return Response.json(rows);
    }
    if (target.pathname.endsWith('/hc_public_job_search_facets_v2')) {
      return Response.json([{ prefectures: ['東京都', '大阪府'],
        employment_types: ['full_time', 'part_time'] }]);
    }
    if (target.pathname.endsWith('/hc_public_job_feed_v2')) {
      assert.equal(options.method, 'GET');
      const requested = target.searchParams.get('id');
      return Response.json(rows.filter(row => requested === 'eq.' + row.id));
    }
    throw new Error('UNREVIEWED_PUBLIC_API_PATH');
  }, async () => {
    const searchResponse = await call(rpc(20, 'tools/call', {
      name: 'search_public_childcare_jobs', arguments: { limit: 10 },
    }));
    assert.equal(searchResponse.status, 200);
    const search = (await searchResponse.json()).result;
    assert.equal(search.isError, undefined);
    assert.deepEqual(search.structuredContent.jobs.map(row => row.id), ids.slice(0, 2));
    assert.deepEqual(search.structuredContent.jobs.map(row => row.facility_name), ['施設A', '施設B']);
    for (const row of search.structuredContent.jobs) {
      assert.equal(row.url, 'https://hoikucolor.jp/jobs/' + row.id);
      assert(!Object.hasOwn(row, 'applicant_email'));
      assert(!Object.hasOwn(row, 'internal_notes'));
    }
    for (const secret of ['CANDIDATE_A_PRIVATE', 'CANDIDATE_B_PRIVATE',
      'FACILITY_A_PRIVATE', 'FACILITY_B_PRIVATE', 'recruit@example.com']) {
      assert.equal(JSON.stringify(search).includes(secret), false);
    }
    const facetsResponse = await call(rpc(21, 'tools/call', {
      name: 'list_public_childcare_job_filters', arguments: {},
    }));
    assert.equal(facetsResponse.status, 200);
    assert.deepEqual((await facetsResponse.json()).result.structuredContent.prefectures,
      ['東京都', '大阪府']);
    for (const id of ids) {
      const detailResponse = await call(rpc(22, 'tools/call', {
        name: 'get_public_childcare_job', arguments: { job_id: id },
      }));
      assert.equal(detailResponse.status, 200);
      const detail = (await detailResponse.json()).result.structuredContent;
      if (ids.slice(0, 2).includes(id)) {
        assert.equal(detail.job.id, id);
      } else {
        assert.equal(detail.job, null, 'closed or unpublished detail must be unavailable');
      }
      assert(!JSON.stringify(detail).includes('PRIVATE'));
    }
    // The two candidate identities cannot upgrade the anonymous public MCP:
    // there is no candidate tool and bearer data must be denied at the edge.
    const beforeDenials = upstreamCalls;
    for (const candidate of ['synthetic-candidate-A', 'synthetic-candidate-B']) {
      const req = rpc(23, 'tools/list');
      req.headers.set('authorization', 'Bearer ' + candidate);
      const denied = await call(req);
      assert.equal(denied.status, 403);
    }
    assert.equal(upstreamCalls, beforeDenials);
  });
  assert(upstreamCalls >= 6);
});

test('real Worker public tool returns zero matches and sanitizes upstream failures', async () => {
  let fail = false;
  await withSyntheticPublicSource(async () => {
    if (fail) throw new Error('SENSITIVE_UPSTREAM_FAILURE');
    return Response.json([]);
  }, async () => {
    const emptyResponse = await call(rpc(30, 'tools/call', {
      name: 'search_public_childcare_jobs', arguments: { keyword: '該当なし' },
    }));
    assert.equal(emptyResponse.status, 200);
    const empty = (await emptyResponse.json()).result;
    assert.equal(empty.structuredContent.returned, 0);
    assert.deepEqual(empty.structuredContent.jobs, []);
    fail = true;
    const failureResponse = await call(rpc(31, 'tools/call', {
      name: 'search_public_childcare_jobs', arguments: {},
    }));
    assert.equal(failureResponse.status, 200);
    const failure = (await failureResponse.json()).result;
    assert.equal(failure.isError, true);
    assert.equal(JSON.stringify(failure).includes('SENSITIVE_UPSTREAM_FAILURE'), false);
  });
});
