import assert from 'node:assert/strict';
import test from 'node:test';
import { runAnonymousHttpSmoke } from './anonymous-http-smoke.mjs';

const ID = '11111111-1111-4111-8111-000000000001';
const now = Date.parse('2026-10-16T06:00:00Z');
const publicJob = { id: ID, is_external: false, title: '保育士', published_at: '2026-10-15T00:00:00Z',
  closing_at: '2026-10-30T00:00:00Z', email: 'PRIVATE@example.com', internal_notes: 'NEVER_LEAK' };
const facets = { prefectures: ['東京都'], employment_types: ['full_time'] };
function config({ rows = [], filter = facets, detail = rows, status = 200, calls = [] } = {}) {
  return { supabaseUrl: 'https://kcmmpjyngcysdfbumchk.supabase.co', publishableKey: 'sb_publishable_fixture',
    now: () => now,
    fetcher: async (url, init) => {
      const route = new URL(url).pathname;
      calls.push({ route, init });
      const body = route.endsWith('hc_public_job_search_facets_v2') ? filter
        : route.endsWith('hc_public_search_jobs_v2') ? rows : detail;
      return { ok: status === 200, status, headers: { get: () => null }, json: async () => body };
    },
  };
}

test('empty published catalog remains a valid read-only smoke state', async () => {
  const calls = [];
  const r = await runAnonymousHttpSmoke({ config: config({ rows: [], calls }) });
  assert.deepEqual(r, { mode: 'anonymous_read_only_rest', search_count: 0, reported_total: 0,
    prefecture_filter_count: 1, employment_filter_count: 1, detail_state: 'not_attempted',
    transport: 'https_rest_not_mcp' });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(c => c.route === '/rest/v1/rpc/hc_public_search_jobs_v2' || c.route === '/rest/v1/rpc/hc_public_job_search_facets_v2'));
});
test('published catalog probes search/filter/detail, exposes aggregates only', async () => {
  const calls = [];
  const r = await runAnonymousHttpSmoke({ config: config({ rows: [{ ...publicJob, total_count: 21 }], calls }) ,requirePublished: true });
  assert.equal(r.search_count, 1);
  assert.equal(r.reported_total, 21);
  assert.equal(r.detail_state, 'found');
  assert.equal(calls.length, 3);
  assert.equal(calls[2].route, '/rest/v1/hc_public_job_feed_v2');
  assert.ok(calls.every(c => c.init.headers.apikey === 'sb_publishable_fixture'));
  assert.equal(JSON.stringify(r).includes('PRIVATE@example.com'), false);
  assert.equal(JSON.stringify(r).includes(ID), false);
});
test('expected positive results fail if the published feed becomes empty', async () => {
  await assert.rejects(runAnonymousHttpSmoke({ config: config(), requirePublished: true }), /PUBLIC_CATALOG_EMPTY/);
});
test('stale, expired and unpublished jobs never appear in probe output', async () => {
  const rows = [
    { ...publicJob, closing_at: '2026-10-14T00:00:00Z' },
    { ...publicJob, published_at: '2026-11-01T00:00:00Z' },
    { ...publicJob, is_external: true, source_last_verified_at: '2026-10-13T00:00:00Z' },
  ];
  const result = await runAnonymousHttpSmoke({ config: config({ rows }) });
  assert.equal(result.search_count, 0);
  assert.equal(result.detail_state, 'not_attempted');
});
test('source errors cause failure instead of reporting a synthetic success', async () => {
  await assert.rejects(runAnonymousHttpSmoke({ config: config({ status: 503 }) }), /PUBLIC_JOB_SOURCE_HTTP_503/);
});
test('model-controlled secrets and external hosts are never substituted', async () => {
  await assert.rejects(runAnonymousHttpSmoke({ config: { ...config(), publishableKey: 'sb_secret_fake' } }), /PUBLIC_KEY_MUST_BE_ANON/);
  await assert.rejects(runAnonymousHttpSmoke({ config: { ...config(), supabaseUrl: 'https://evil.invalid' } }), /SUPABASE_URL_NOT_ALLOWED/);
});
test('detail disappearance between two independent reads is nonfatal and recorded', async () => {
  const r = await runAnonymousHttpSmoke({ config: config({ rows: [{ ...publicJob, total_count: 1 }], detail: [] }) });
  assert.equal(r.detail_state, 'disappeared');
});
test('strict live REST acceptance rejects a search hit whose detail disappeared', async () => {
  await assert.rejects(runAnonymousHttpSmoke({ config: config({
    rows: [{ ...publicJob, total_count: 1 }], detail: [],
  }), requirePublished: true }), /PUBLIC_CATALOG_DETAIL_UNAVAILABLE/);
});

test('filter response must respect published API schema', async () => {
  await assert.rejects(runAnonymousHttpSmoke({ config: config({ filter: { prefectures: '東京都', employment_types: [] } }) }), /PUBLIC_JOB_SOURCE_INVALID_SHAPE/);
});

test('fresh published external job passes the same 12h safety gate', async () => {
  const r = await runAnonymousHttpSmoke({ config: config({ rows: [{ ...publicJob, total_count: 1, is_external: true,
    source_last_verified_at: '2026-10-16T05:55:00Z' }] }), requirePublished: true });
  assert.equal(r.search_count, 1);
  assert.equal(r.detail_state, 'found');
});
