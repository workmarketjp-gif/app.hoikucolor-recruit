import assert from 'node:assert/strict';
import test from 'node:test';
import { searchPublicChildcareJobs, getPublicChildcareJob } from '../public-jobs.mjs';

const id = '11111111-1111-4111-8111-000000000093';
const at = Date.parse('2026-10-24T00:00:00Z');
const row = {
  id, title: '公開保育求人', is_external: true,
  published_at: '2026-10-20T00:00:00Z',
  closing_at: '2026-10-23T00:00:00Z',
  source_last_verified_at: '2026-10-22T00:00:00Z',
};
function fixture(clock) {
  let requests = 0;
  return {
    config: {
      supabaseUrl: 'https://fixture.supabase.co',
      publishableKey: 'sb_publishable_fixture',
      now: clock,
      fetcher: async () => { requests++; return Response.json([{ ...row, total_count: 1 }]); },
    },
    requestCount: () => requests,
  };
}

test('invalid injected clock rejects search before fetching any public rows', async () => {
  for (const value of [NaN, Infinity, -Infinity, 0, -1, 1.5, null, undefined, '2026-10-24']) {
    const x = fixture(() => value);
    await assert.rejects(searchPublicChildcareJobs({}, x.config), /PUBLIC_CLOCK_INVALID/);
    assert.equal(x.requestCount(), 0);
  }
});

test('invalid injected clock rejects exact detail before fetching public view', async () => {
  for (const value of [NaN, Infinity, 0, -1, null]) {
    const x = fixture(() => value);
    await assert.rejects(getPublicChildcareJob({ job_id: id }, x.config), /PUBLIC_CLOCK_INVALID/);
    assert.equal(x.requestCount(), 0);
  }
});

test('a misconfigured non-function clock fails closed in both read-only paths', async () => {
  const x = fixture(at);
  await assert.rejects(searchPublicChildcareJobs({}, x.config), /PUBLIC_CLOCK_INVALID/);
  await assert.rejects(getPublicChildcareJob({ job_id: id }, x.config), /PUBLIC_CLOCK_INVALID/);
  assert.equal(x.requestCount(), 0);
});

test('valid clock still suppresses closed and stale external jobs', async () => {
  const x = fixture(() => at);
  const result = await searchPublicChildcareJobs({}, x.config);
  assert.equal(result.returned, 0);
  assert.equal((await getPublicChildcareJob({ job_id: id }, x.config)).job, null);
  assert.equal(x.requestCount(), 2);
});

test('valid clock preserves eligible public jobs and 12-hour external freshness', async () => {
  const x = fixture(() => at);
  x.config.fetcher = async () => Response.json([{
    ...row, total_count: 1, closing_at: null,
    source_last_verified_at: '2026-10-23T23:00:00Z',
  }]);
  assert.equal((await searchPublicChildcareJobs({}, x.config)).jobs[0].id, id);
  assert.equal((await getPublicChildcareJob({ job_id: id }, x.config)).job.id, id);
});
