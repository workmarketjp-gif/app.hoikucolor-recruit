/**
 * Anonymous MCP acceptance must not falsely pass when a published search hit
 * carries an unusable raw-source pagination cursor. This exercises the real
 * protocol probe against a synthetic JSON-RPC peer, not Cloudflare or Supabase.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runModernHttpMcpProbe } from './mcp-protocol-probe.mjs';

const now = Date.parse('2026-10-27T00:00:00Z');
const id = '11111111-1111-4111-8111-000000000191';
const job = Object.freeze({
  id, title: '保育士募集', is_external: false,
  published_at: '2026-10-26T00:00:00Z', closing_at: null,
  url: `https://hoikucolor.jp/jobs/${id}`,
});
const publicTools = [
  'search_public_childcare_jobs',
  'list_public_childcare_job_filters',
  'get_public_childcare_job',
].map(name => ({
  name, annotations: { readOnlyHint: true, destructiveHint: false },
  securitySchemes: [{ type: 'noauth' }],
}));

function peer({ scanned = 1, next = 1, more = true } = {}) {
  return async (_url, options) => {
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.authorization, undefined);
    assert.equal(options.headers.cookie, undefined);
    const request = JSON.parse(options.body);
    let response;
    switch (request.method) {
      case 'server/discover':
        response = { capabilities: { tools: {} } };
        break;
      case 'tools/list':
        response = { tools: publicTools };
        break;
      case 'tools/call': {
        const name = request.params.name;
        let data;
        if (name === 'search_public_childcare_jobs') {
          assert.deepEqual(request.params.arguments, { limit: 1, offset: 0 });
          data = {
            jobs: [job], returned: 1, reported_total: 1,
            offset: 0, requested_limit: 1,
            scanned_source_rows: scanned, next_offset: next,
            possible_more_source_rows: more, note: '公開求人',
          };
        } else if (name === 'list_public_childcare_job_filters') {
          data = { prefectures: [], employment_types: [], note: '公開条件' };
        } else if (name === 'get_public_childcare_job') {
          assert.equal(request.params.arguments.job_id, id);
          data = { job, note: '公開求人' };
        } else {
          throw Error('Unexpected tool');
        }
        response = {
          structuredContent: data,
          content: [{ type: 'text', text: JSON.stringify(data) }],
        };
        break;
      }
      default:
        throw Error('Unexpected MCP method');
    }
    return Response.json({
      jsonrpc: '2.0', id: request.id,
      result: { resultType: 'complete', ...response },
    });
  };
}

const probe = options => runModernHttpMcpProbe({
  url: 'http://127.0.0.1:3107/mcp',
  fetcher: peer(options), now: () => now, requirePublished: true,
});

test('published job with a matching one-row continuation cursor passes', async () => {
  const result = await probe({ scanned: 1, next: 1, more: true });
  assert.equal(result.status, 'PASS');
  assert.equal(result.detail_state, 'found');
  assert.equal(result.anonymous_search_returned, 1);
});

test('a complete page with null cursor does not claim more rows', async () => {
  const result = await probe({ scanned: 1, next: null, more: false });
  assert.equal(result.status, 'PASS');
});

test('acceptance rejects a self-repeating cursor even if the first page has a valid job', async () => {
  await assert.rejects(probe({ scanned: 1, next: 0, more: true }),
    /PROBE_PAGINATION_INVALID/);
});

test('acceptance rejects cursors that skip raw rows without scanning them', async () => {
  await assert.rejects(probe({ scanned: 1, next: 5, more: true }),
    /PROBE_PAGINATION_INVALID/);
});

test('acceptance rejects contradictory source-more metadata', async () => {
  await assert.rejects(probe({ scanned: 1, next: 1, more: false }),
    /PROBE_PAGINATION_INVALID/);
  await assert.rejects(probe({ scanned: 0, next: 1, more: true }),
    /PROBE_PAGINATION_INVALID/);
});
