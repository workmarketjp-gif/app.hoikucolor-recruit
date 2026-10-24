import test from 'node:test';
import assert from 'node:assert/strict';
import { runModernHttpMcpProbe, runHttpMcpProbe } from './mcp-protocol-probe.mjs';

// Contract tests for a real JSON-RPC exchange over HTTP, with synthetic
// anonymous catalog pages. They are NOT proof of external Cloudflare/ChatGPT.
const now = Date.parse('2026-10-25T06:00:00Z');
const id = '11111111-1111-4111-8111-000000000123';
const job = Object.freeze({
  id, title: '保育士募集', published_at: '2026-10-24T00:00:00Z',
  closing_at: null, is_external: true,
  source_last_verified_at: '2026-10-25T05:55:00Z',
  url: `https://hoikucolor.jp/jobs/${id}`,
});
const tools = ['search_public_childcare_jobs', 'list_public_childcare_job_filters', 'get_public_childcare_job']
  .map(name => ({ name, securitySchemes: [{ type: 'noauth' }],
    annotations: { readOnlyHint: true, destructiveHint: false } }));

function peer({ freshAt = 3, moreThrough = 4, brokenCursor = false,
  detailMissing = false, failureAt = null } = {}) {
  const calls = [];
  const fetcher = async (_url, options) => {
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.authorization, undefined);
    assert.equal(options.headers.cookie, undefined);
    const rpc = JSON.parse(options.body);
    calls.push(rpc);
    let result;
    if (rpc.method === 'notifications/initialized') {
      return new Response(null, { status: 202 });
    }
    if (rpc.method === 'initialize') {
      result = { protocolVersion: '2025-06-18', capabilities: { tools: {} } };
    } else if (rpc.method === 'server/discover') {
      result = { capabilities: { tools: {} } };
    } else if (rpc.method === 'tools/list') {
      result = { tools };
    } else if (rpc.method === 'tools/call') {
      const { name, arguments: args } = rpc.params;
      let data;
      if (name === 'search_public_childcare_jobs') {
        assert.equal(args.limit, 1);
        const offset = args.offset;
        if (failureAt === offset) return new Response('backend failure', { status: 503 });
        const jobs = offset === freshAt ? [job] : [];
        const canContinue = offset < moreThrough;
        data = {
          jobs, returned: jobs.length, reported_total: 100,
          offset, requested_limit: 1,
          next_offset: canContinue ? (brokenCursor ? offset : offset + 1) : null,
          possible_more_source_rows: canContinue,
          scanned_source_rows: 1, note: '公開情報のみ',
        };
      } else if (name === 'list_public_childcare_job_filters') {
        data = { prefectures: ['東京都'], employment_types: ['正社員'], note: '公開' };
      } else if (name === 'get_public_childcare_job') {
        assert.equal(args.job_id, id);
        data = { job: detailMissing ? null : job, note: '公開' };
      } else throw Error('Unexpected anonymous tool');
      result = { structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] };
    } else throw Error('Unexpected MCP method');
    return Response.json({
      jsonrpc: '2.0', id: rpc.id,
      result: rpc.method === 'initialize' ? result :
        { resultType: 'complete', ...result },
    });
  };
  return { calls, fetcher };
}

const runModern = (f, requirePublished = true) => runModernHttpMcpProbe({
  url: 'https://hc-preview.account.workers.dev/mcp',
  fetcher: f, now: () => now, requirePublished,
});
const runLegacy = (f, requirePublished = true) => runHttpMcpProbe({
  url: 'https://hc-preview.account.workers.dev/mcp',
  fetcher: f, now: () => now, requirePublished,
});

test('modern strict acceptance follows stale-only search pages to real job detail', async () => {
  const p = peer();
  const result = await runModern(p.fetcher);
  assert.equal(result.status, 'PASS');
  assert.equal(result.detail_state, 'found');
  assert.equal(result.anonymous_search_returned, 1);
  assert.deepEqual(p.calls.filter(x => x.params?.name === 'search_public_childcare_jobs')
    .map(x => [x.id, x.params.arguments.offset]), [[3, 0], [6, 1], [7, 2], [8, 3]]);
  assert.equal(p.calls.filter(x => x.params?.name === 'get_public_childcare_job').length, 1);
  assert.equal(JSON.stringify(result).includes(id), false);
});

test('legacy strict acceptance follows the same raw-offset search contract', async () => {
  const p = peer({ freshAt: 2 });
  const result = await runLegacy(p.fetcher);
  assert.equal(result.status, 'PASS');
  assert.equal(result.protocol, '2025-06-18');
  assert.deepEqual(p.calls.filter(x => x.params?.name === 'search_public_childcare_jobs')
    .map(x => x.params.arguments.offset), [0, 1, 2]);
});

test('four stale-only MCP pages are INCONCLUSIVE, never empty or passing', async () => {
  const p = peer({ freshAt: 99, moreThrough: 99 });
  await assert.rejects(runModern(p.fetcher), /PROBE_PUBLIC_CATALOG_INCONCLUSIVE/);
  assert.equal(p.calls.filter(x => x.params?.name === 'search_public_childcare_jobs').length, 4);
  assert.equal(p.calls.filter(x => x.params?.name === 'get_public_childcare_job').length, 0);
});

test('complete empty catalog is distinguished from the upstream search-window cap', async () => {
  const p = peer({ freshAt: 99, moreThrough: 0 });
  await assert.rejects(runModern(p.fetcher), /PROBE_PUBLIC_CATALOG_EMPTY/);
  assert.equal(p.calls.filter(x => x.params?.name === 'search_public_childcare_jobs').length, 1);
});

test('no forward pagination and later HTTP failure both fail closed', async () => {
  await assert.rejects(runModern(peer({ freshAt: 99, brokenCursor: true }).fetcher),
    /PROBE_PAGINATION_INVALID/);
  await assert.rejects(runModern(peer({ freshAt: 99, failureAt: 1 }).fetcher),
    /PROBE_HTTP_STATUS_INVALID/);
});

test('late search hit without a matching public detail is not accepted', async () => {
  await assert.rejects(runModern(peer({ detailMissing: true }).fetcher),
    /PROBE_PUBLIC_DETAIL_MISSING/);
});
