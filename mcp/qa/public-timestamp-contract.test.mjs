import assert from 'node:assert/strict';
import test from 'node:test';
import { searchPublicChildcareJobs, getPublicChildcareJob } from '../public-jobs.mjs';

// Public search/detail cannot treat malformed source timestamps as publication permission.
// PostgREST timestamptz values have explicit offsets; tests are synthetic only.
const NOW = Date.parse('2026-10-24T00:00:00Z');
const ID = '11111111-1111-4111-8111-000000000096';
const BASE = {
  id: ID, title: '公開求人', is_external: false,
  published_at: '2026-10-23T23:59:59Z',
  closing_at: null, source_last_verified_at: null,
};
function config(row) {
  return {
    supabaseUrl: 'https://fixture.supabase.co/',
    publishableKey: 'sb_publishable_fixture',
    now: () => NOW,
    fetcher: async () => Response.json([{ ...row, total_count: 1 }]),
  };
}
async function visibleFromBoth(row) {
  const cfg = config(row);
  const search = await searchPublicChildcareJobs({ limit: 10 }, cfg);
  const detail = await getPublicChildcareJob({ job_id: ID }, cfg);
  return [search.returned === 1, detail.job !== null];
}

test('date-only and timezone-less publication strings never make a job public', async () => {
  for (const published_at of ['2026-10-23', '2026-10-23T23:00:00', 'October 23, 2026']) {
    assert.deepEqual(await visibleFromBoth({ ...BASE, published_at }), [false, false]);
  }
});

test('Date.parse-normalized impossible calendar publication is rejected', async () => {
  // JavaScript Date.parse accepts February 30 and silently moves it into March.
  assert.ok(Number.isFinite(Date.parse('2026-02-30T00:00:00Z')));
  assert.deepEqual(await visibleFromBoth({
    ...BASE, published_at: '2026-02-30T00:00:00Z',
  }), [false, false]);
});

test('malformed closing timestamp fails closed rather than treating job as open', async () => {
  for (const closing_at of ['2026-02-30T00:00:00Z', '2026-10-25', '2026-10-25T10:00:00']) {
    assert.deepEqual(await visibleFromBoth({ ...BASE, closing_at }), [false, false]);
  }
});

test('external freshness gate rejects ambiguous and impossible verification time', async () => {
  for (const source_last_verified_at of ['2026-10-23', '2026-10-23T23:00:00', '2026-02-30T00:00:00Z']) {
    assert.deepEqual(await visibleFromBoth({
      ...BASE, is_external: true, source_last_verified_at,
    }), [false, false]);
  }
});

test('valid PostgREST-style timezone offsets and microseconds remain eligible', async () => {
  assert.deepEqual(await visibleFromBoth({
    ...BASE, is_external: true,
    published_at: '2026-10-24T09:00:00.000000+09:00',
    closing_at: '2026-10-24T09:00:00.123456+09:00',
    source_last_verified_at: '2026-10-24T07:00:00.123456+09:00',
  }), [true, true]);
});

test('a correctly formatted future timestamp remains hidden even with an offset', async () => {
  assert.deepEqual(await visibleFromBoth({
    ...BASE, published_at: '2026-10-24T09:00:00.001+09:00',
  }), [false, false]);
});

test('a valid leap day is accepted while a non-leap February 29 is rejected', async () => {
  assert.deepEqual(await visibleFromBoth({ ...BASE, published_at: '2024-02-29T12:00:00Z' }), [true, true]);
  assert.deepEqual(await visibleFromBoth({ ...BASE, published_at: '2026-02-29T12:00:00Z' }), [false, false]);
});
