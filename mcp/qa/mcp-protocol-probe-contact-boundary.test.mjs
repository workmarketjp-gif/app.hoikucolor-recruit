import test from 'node:test';
import assert from 'node:assert/strict';
import { runHttpMcpProbe, runModernHttpMcpProbe } from './mcp-protocol-probe.mjs';

// Synthetic JSON-RPC peers test the independent acceptance probe, not a
// deployed server, Cloudflare Worker, Supabase account, or ChatGPT session.
const when = Date.parse('2026-10-26T01:00:00Z');
const id = '11111111-1111-4111-8111-000000000149';
const validJob = Object.freeze({
  id, title: '保育士', description: '保育と園庭遊び',
  is_external: false, published_at: '2026-10-25T01:00:00Z',
  closing_at: null, url: `https://hoikucolor.jp/jobs/${id}`,
});
const publicTools = [
  'search_public_childcare_jobs',
  'list_public_childcare_job_filters',
  'get_public_childcare_job',
].map(name => ({
  name, annotations: { readOnlyHint: true, destructiveHint: false },
  securitySchemes: [{ type: 'noauth' }],
}));

function peer({ job = validJob, facets = {
  prefectures: ['東京都'], employment_types: ['正社員'], note: '公開検索条件',
} } = {}) {
  return async (_url, options) => {
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.authorization, undefined);
    assert.equal(options.headers.cookie, undefined);
    const request = JSON.parse(options.body);
    if (request.method === 'notifications/initialized') {
      return new Response(null, { status: 202 });
    }
    let result;
    if (request.method === 'initialize') {
      result = { protocolVersion: '2025-06-18', capabilities: { tools: {} } };
    } else if (request.method === 'server/discover') {
      result = { capabilities: { tools: {} } };
    } else if (request.method === 'tools/list') {
      result = { tools: publicTools };
    } else if (request.method === 'tools/call') {
      let data;
      if (request.params.name === 'search_public_childcare_jobs') {
        data = {
          jobs: job ? [job] : [], returned: job ? 1 : 0,
          reported_total: job ? 1 : 0, offset: 0, requested_limit: 1,
          next_offset: null, possible_more_source_rows: false,
          scanned_source_rows: job ? 1 : 0, note: '公開情報のみ',
        };
      } else if (request.params.name === 'list_public_childcare_job_filters') {
        data = facets;
      } else if (request.params.name === 'get_public_childcare_job') {
        data = { job, note: '公開情報のみ' };
      } else {
        throw new Error('Unexpected tool invocation');
      }
      result = {
        structuredContent: data,
        content: [{ type: 'text', text: JSON.stringify(data) }],
      };
    } else {
      throw new Error('Unexpected protocol method');
    }
    return Response.json({
      jsonrpc: '2.0', id: request.id,
      result: request.method === 'initialize' ? result :
        { resultType: 'complete', ...result },
    });
  };
}
const runners = [
  ['modern', runModernHttpMcpProbe],
  ['legacy', runHttpMcpProbe],
];
async function probe(runner, data) {
  return runner({
    url: 'https://hoikucolor-mcp-preview-ci.account.workers.dev/mcp',
    fetcher: peer(data), now: () => when, requirePublished: true,
  });
}

for (const [version, runner] of runners) {
  test(`${version}: ordinary public search, details and facets remain accepted`, async () => {
    const result = await probe(runner);
    assert.equal(result.status, 'PASS');
    assert.equal(result.detail_state, 'found');
    assert.equal(result.public_prefectures, 1);
  });

  test(`${version}: nested applicant data inside a facet cannot pass review`, async () => {
    await assert.rejects(probe(runner, { facets: {
      prefectures: [{ candidate_email: 'private@example.jp' }],
      employment_types: ['正社員'],
    } }), /PROBE_PRIVATE_FIELD_DETECTED/);
  });

  test(`${version}: phone numbers and URLs in facets cannot pass review`, async () => {
    for (const unsafe of ['080・1234・5678', 'example.xn--p1ai/apply?token=private']) {
      await assert.rejects(probe(runner, { facets: {
        prefectures: ['東京都'], employment_types: ['正社員', unsafe],
      } }), /PROBE_PRIVATE_FIELD_DETECTED/);
    }
  });

  test(`${version}: embedded contacts and external links in job prose fail review`, async () => {
    for (const unsafe of [
      '連絡先 private [at] example [dot] jp',
      '応募はこちら https://outside.example/apply?token=private',
    ]) {
      await assert.rejects(probe(runner, { job: { ...validJob, description: unsafe } }),
        /PROBE_PRIVATE_CONTACT_DETECTED/);
    }
  });
}
