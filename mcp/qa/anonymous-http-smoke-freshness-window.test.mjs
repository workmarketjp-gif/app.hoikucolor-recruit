import assert from 'node:assert/strict';
import test from 'node:test';
import { runAnonymousHttpSmoke } from './anonymous-http-smoke.mjs';

// In the live database, the external-ID SQL currently uses a 7-day window
// while anonymous MCP publication requires verification within 12 hours.
// These synthetic pages test the acceptance client's truthful behavior;
// they are not evidence of an actual HTTPS MCP/ChatGPT connection.
const id = '11111111-1111-4111-8111-000000000119';
const now = Date.parse('2026-10-25T06:00:00Z');
const base = {
  id, title: '保育士求人', published_at: '2026-10-24T00:00:00Z',
  closing_at: null, is_external: true, source_name: '公開求人',
};
const stale = { ...base, source_last_verified_at: '2026-10-22T00:00:00Z' };
const fresh = { ...base, source_last_verified_at: '2026-10-25T05:59:00Z' };

function harness({ sourceCount = 100, freshPosition = null, failAtOffset = null } = {}) {
  const offsets = [];
  let detailReads = 0;
  const fetcher = async (url, options) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/hc_public_job_search_facets_v2')) {
      return Response.json([{ prefectures: [], employment_types: [] }]);
    }
    if (pathname.endsWith('/hc_public_search_jobs_v2')) {
      const { p_offset: offset, p_limit: limit } = JSON.parse(options.body);
      offsets.push(offset);
      if (offset === failAtOffset) return new Response('', { status: 503 });
      const end = Math.min(sourceCount, offset + limit);
      return Response.json(Array.from({ length: Math.max(0, end - offset) }, (_, i) => ({
        ...(offset + i === freshPosition ? fresh : stale),
        total_count: sourceCount,
      })));
    }
    if (pathname.endsWith('/hc_public_job_feed_v2')) {
      detailReads++;
      return Response.json([fresh]);
    }
    throw new Error('UNEXPECTED_UPSTREAM');
  };
  return {
    config: {
      supabaseUrl: 'https://fixtures.supabase.co',
      publishableKey: 'sb_publishable_public_fixture',
      now: () => now,
      fetcher,
    },
    offsets,
    getDetailReads: () => detailReads,
  };
}

test('strict acceptance finds a real eligible page after earlier stale-only pages', async () => {
  const h = harness({ freshPosition: 20 });
  const summary = await runAnonymousHttpSmoke({ config: h.config, requirePublished: true });
  assert.equal(summary.search_count, 1);
  assert.equal(summary.detail_state, 'found');
  assert.equal(summary.transport, 'https_rest_not_mcp');
  assert.deepEqual(h.offsets.slice(0, 5), [0, 5, 10, 15, 20]);
  assert.equal(h.getDetailReads(), 1);
  assert.equal(JSON.stringify(summary).includes(id), false);
});

test('strict acceptance fails INCONCLUSIVE after bounded stale-only source traversal', async () => {
  const h = harness({ sourceCount: 160 });
  await assert.rejects(runAnonymousHttpSmoke({ config: h.config, requirePublished: true }),
    /PUBLIC_CATALOG_INCONCLUSIVE/);
  assert.equal(h.offsets.length, 16);
  assert.equal(h.getDetailReads(), 0);
});

test('strict acceptance still distinguishes definitive empty catalog from inconclusive', async () => {
  const h = harness({ sourceCount: 0 });
  await assert.rejects(runAnonymousHttpSmoke({ config: h.config, requirePublished: true }),
    /PUBLIC_CATALOG_EMPTY/);
  assert.deepEqual(h.offsets, [0]);
});

test('error on later source page fails closed instead of becoming a successful search', async () => {
  const h = harness({ failAtOffset: 20 });
  await assert.rejects(runAnonymousHttpSmoke({ config: h.config, requirePublished: true }),
    /PUBLIC_JOB_SOURCE_HTTP_503/);
  assert.deepEqual(h.offsets, [0, 5, 10, 15, 20]);
  assert.equal(h.getDetailReads(), 0);
});
